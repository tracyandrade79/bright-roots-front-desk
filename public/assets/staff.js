// Staff page: ticket queue, clinic details editor, checks
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  let pin = ''; try { pin = sessionStorage.getItem('brd_pin') || ''; } catch (e) {}
  const nodes = new Map();
  const knownUrgent = new Set();
  let firstLoad = true, aiOn = false;

  async function api(url, method, body) {
    try {
      const res = await fetch(url, { method: method || 'GET', headers: { 'content-type': 'application/json', 'x-staff-pin': pin }, body: body ? JSON.stringify(body) : undefined });
      const j = await res.json();
      if (res.status === 401 && j.pin) { askPin(); return { error: 'PIN needed' }; }
      return j;
    } catch (e) { return { error: 'No connection to the server.' }; }
  }
  function askPin() {
    const d = $('#pin-dialog');
    if (d.open) return;
    d.showModal();
    $('#pin-form').onsubmit = () => { pin = $('#pin-input').value; try { sessionStorage.setItem('brd_pin', pin); } catch (e) {} setTimeout(refresh, 50); };
  }
  function toast(text, urgent) {
    const t = $('#toast'); t.textContent = text; t.className = 'toast' + (urgent ? ' urgent' : ''); t.hidden = false;
    clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 4000);
  }
  function beep() {
    if (!$('#sound').checked) return;
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      [0, 0.25].forEach((d) => { const o = ctx.createOscillator(), g = ctx.createGain(); o.frequency.value = 880; g.gain.value = 0.08; o.connect(g); g.connect(ctx.destination); o.start(ctx.currentTime + d); o.stop(ctx.currentTime + d + 0.15); });
    } catch (e) {}
  }

  // ---------- tabs ----------
  document.querySelectorAll('.tabs button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.tabs button').forEach((x) => x.setAttribute('aria-selected', String(x === b)));
    ['tickets', 'clinic', 'checks'].forEach((n) => { $('#tab-' + n).hidden = n !== b.dataset.tab; });
    if (b.dataset.tab === 'clinic') loadClinic();
  }));
  document.querySelectorAll('.filters button').forEach((b) => b.addEventListener('click', () => {
    document.querySelectorAll('.filters button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    $('#ticket-queue').dataset.filter = b.dataset.filter;
  }));

  // ---------- tickets ----------
  function age(min) {
    if (min < 1) return 'just now';
    if (min < 60) return min + ' min ago';
    const h = Math.floor(min / 60);
    if (h < 24) return h + ' h ' + (min % 60) + ' min ago';
    return Math.floor(h / 24) + ' days ago';
  }
  const typeName = { emergency: 'Emergency', booking: 'Booking request', question: 'Question' };
  const pName = { 1: 'P1', 2: 'P2', 3: 'P3' };

  function build(t) {
    const li = el('li', 'ticket');
    li.dataset.ticket = t.id;
    li.innerHTML =
      '<div class="t-head"><span class="pill p"></span><span class="pill st"></span><span class="pill type"></span><span class="pill late" hidden>Past callback time</span><span class="t-id"></span><span class="t-age"></span></div>' +
      '<div class="age-bar" aria-hidden="true"><i></i></div>' +
      '<p class="t-q"></p><div class="t-facts"></div>' +
      '<details class="convo"><summary></summary><ol></ol></details>' +
      '<div class="templates"></div>' +
      '<div class="reply-box"><textarea aria-label="Reply to the patient" id="staff-reply" name="staff-reply" placeholder="Type a reply. It appears in the patient\'s chat."></textarea>' +
      '<div class="reply-actions"><button class="btn" id="staff-send" type="button">Send reply</button><button class="btn ghost close-btn" type="button"></button><span class="note" role="status"></span></div></div>';
    const ta = $('textarea', li), note = $('.note', li);
    $('#staff-send', li).addEventListener('click', async () => {
      const text = ta.value.trim();
      if (!text) { note.textContent = 'Type a reply first.'; ta.focus(); return; }
      note.textContent = 'Sending...';
      const r = await api('/api/tickets/' + t.id + '/reply', 'POST', { text });
      if (r.error) { note.textContent = r.error; return; }
      ta.value = ''; note.textContent = 'Sent. The patient sees it in their chat.';
      refresh();
    });
    ta.addEventListener('keydown', (e) => { if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) $('#staff-send', li).click(); });
    $('.close-btn', li).addEventListener('click', async () => {
      const cur = li.dataset.status;
      await api('/api/tickets/' + t.id + '/status', 'POST', { status: cur === 'closed' ? (li.dataset.type === 'emergency' ? 'urgent' : 'needs human') : 'closed' });
      refresh();
    });
    const tpl = $('.templates', li);
    const add = (label, text, cls) => { const b = el('button', cls || '', label); b.type = 'button'; b.addEventListener('click', () => { ta.value = text; ta.focus(); }); tpl.appendChild(b); };
    if (t.type === 'emergency') add('Calling you now', 'We have seen your message and are calling you now. If you have trouble breathing or the bleeding does not stop, please go to the nearest hospital right away.');
    if (t.type === 'booking') add('Ask for another time', 'Sorry, that time is not free. Could you tell us another day and time that suits you?');
    add('Ask for phone number', 'Thank you for your message. Please share your phone number so our team can call you.');
    add('We will call you', 'Thank you for waiting. Our team will call you in the next few minutes.');
    const d = el('button', 'draft', t.type === 'booking' ? 'Confirm booking' : 'Draft reply'); d.type = 'button';
    d.addEventListener('click', async () => {
      d.disabled = true; note.textContent = 'Writing a draft...';
      const r = await api('/api/tickets/' + t.id + '/draft', 'POST', {});
      d.disabled = false;
      if (r.text) { ta.value = r.text; note.textContent = r.source === 'ai' ? 'Draft written by AI from the clinic file. Check it before sending.' : 'Draft from the clinic file. Check it before sending.'; ta.focus(); }
      else note.textContent = r.error || 'Could not write a draft.';
    });
    tpl.appendChild(d);
    return li;
  }

  function update(li, t) {
    li.dataset.status = t.status; li.dataset.priority = t.priority; li.dataset.type = t.type; li.dataset.overdue = String(t.overdue);
    $('.pill.p', li).textContent = pName[t.priority] || 'Done';
    $('.pill.p', li).hidden = t.priority > 3;
    const st = $('.pill.st', li); st.textContent = t.status; st.className = 'pill st status-' + t.status.replace(/\s+/g, '-');
    $('.pill.type', li).textContent = typeName[t.type] || t.type;
    $('.pill.late', li).hidden = !t.overdue;
    $('.t-id', li).textContent = t.id;
    $('.t-age', li).textContent = 'Opened ' + age(t.ageMin) + (t.status !== 'urgent' && t.priority <= 3 ? ', ' + t.workMin + ' of ' + t.slaMin + ' working min used' : '');
    const bar = $('.age-bar', li); $('i', bar).style.width = Math.round(t.slaUsed * 100) + '%';
    bar.className = 'age-bar' + (t.slaUsed >= 1 ? ' late' : t.slaUsed >= 0.6 ? ' warn' : '');
    $('.t-q', li).textContent = t.question;
    const f = $('.t-facts', li); f.innerHTML = '';
    if (t.booking) { const s = el('span'); s.append('Wants: '); s.appendChild(el('b', '', t.booking.label)); f.appendChild(s); }
    if (t.services && t.services.length) f.appendChild(el('span', '', 'Treatment: ' + t.services.join(', ')));
    if (t.contact && (t.contact.name || t.contact.phone)) {
      const s = el('span'); s.append('Patient: ' + (t.contact.name || 'name not given') + ' ');
      if (t.contact.phone) { const a = el('a', '', t.contact.phone); a.href = 'tel:' + t.contact.phone.replace(/\s+/g, ''); s.appendChild(a); }
      f.appendChild(s);
    } else f.appendChild(el('span', '', 'No phone number yet'));
    if (t.lang && t.lang !== 'en') f.appendChild(el('span', '', 'Wrote in ' + (t.lang === 'hi' ? 'Hindi' : 'Telugu')));
    const convo = $('details', li);
    $('summary', convo).textContent = 'Conversation (' + t.messages.length + ' messages)';
    const sig = t.messages.map((m) => m.id).join(',');
    if (convo.dataset.sig !== sig) {
      convo.dataset.sig = sig;
      const ol = $('ol', convo); ol.innerHTML = '';
      t.messages.forEach((m) => { const r = el('li', m.role); r.appendChild(el('b', '', m.role === 'patient' ? 'Patient' : m.role === 'staff' ? (m.by || 'Staff') : 'Bot')); r.append(m.text); ol.appendChild(r); });
    }
    $('.close-btn', li).textContent = t.status === 'closed' ? 'Reopen' : 'Close ticket';
  }

  async function refresh() {
    const r = await api('/api/tickets');
    if (!r.tickets) return;
    aiOn = r.ai;
    const q = $('#ticket-queue');
    const ids = r.tickets.map((t) => t.id);
    r.tickets.forEach((t) => {
      let li = nodes.get(t.id);
      if (!li) { li = build(t); nodes.set(t.id, li); }
      update(li, t);
      if (t.status === 'urgent' && !knownUrgent.has(t.id)) {
        knownUrgent.add(t.id);
        if (!firstLoad) { li.classList.add('flash'); beep(); toast('Urgent ticket ' + t.id + ': ' + t.question.slice(0, 60), true); }
      }
    });
    // keep order; don't move things while someone is typing
    const typing = document.activeElement && document.activeElement.closest && document.activeElement.closest('.ticket');
    const current = [...q.children].map((n) => n.dataset.ticket).join(',');
    if (!typing && current !== ids.join(',')) ids.forEach((id) => q.appendChild(nodes.get(id)));
    else ids.forEach((id) => { if (!nodes.get(id).isConnected) q.prepend(nodes.get(id)); });
    $('#empty').hidden = r.tickets.length > 0;
    const open = r.tickets.filter((t) => t.status === 'urgent' || t.status === 'needs human');
    $('#n-urgent').textContent = r.tickets.filter((t) => t.status === 'urgent').length;
    $('#n-waiting').textContent = r.tickets.filter((t) => t.status === 'needs human' && t.type !== 'booking').length;
    $('#n-booking').textContent = r.tickets.filter((t) => t.status === 'needs human' && t.type === 'booking').length;
    $('#n-overdue').textContent = open.filter((t) => t.overdue).length;
    $('#n-answered').textContent = r.tickets.filter((t) => t.status === 'answered').length;
    $('#open-count').textContent = open.length;
    const urgentN = r.tickets.filter((t) => t.status === 'urgent').length;
    document.title = (urgentN ? '(' + urgentN + ' urgent) ' : open.length ? '(' + open.length + ') ' : '') + 'Front desk, staff | Bright Roots Dental';
    firstLoad = false;
  }

  async function health() {
    const h = await api('/api/health');
    const s = $('#ai-state');
    if (!h.ai) return;
    if (!h.ai.configured) { s.textContent = 'AI off: answering from clinic file'; s.title = 'No AI key is added yet. The chat answers from the clinic details. Add a key in Render to turn AI on.'; s.className = 'ai-state off'; $('#run-ai').disabled = true; }
    else { s.textContent = 'AI on (' + h.ai.model + ')' + (h.ai.paused ? ', paused after an error' : ''); s.className = 'ai-state on'; s.title = h.ai.lastError || 'Working'; }
  }

  // ---------- clinic editor ----------
  let clinicData = null;
  const pretty = (k) => k.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
  function field(label, value, path, area) {
    const l = el('label', '', label);
    const i = el(area ? 'textarea' : 'input'); i.value = value == null ? '' : value; i.dataset.path = path;
    l.appendChild(i); return l;
  }
  function rowEditor(kind, item) {
    const r = el('div', 'row-ed' + (kind === 'doctors' ? ' doc' : ''));
    r.dataset.kind = kind;
    const cols = kind === 'doctors' ? ['name', 'role', 'days'] : ['name', 'price', 'note', 'duration'];
    cols.forEach((c) => { const l = el('label', '', pretty(c)); const i = el('input'); i.value = item[c] || ''; i.dataset.col = c; l.appendChild(i); r.appendChild(l); });
    const x = el('button', 'x', '×'); x.type = 'button'; x.setAttribute('aria-label', 'Remove'); x.addEventListener('click', () => r.remove());
    r.appendChild(x); return r;
  }
  function renderClinic(d) {
    const f = $('#clinic-form'); f.innerHTML = '';
    const fs = (title) => { const s = el('fieldset'); s.appendChild(el('legend', '', title)); f.appendChild(s); return s; };
    let s = fs('Clinic'); let g = el('div', 'grid2'); s.appendChild(g);
    Object.entries(d.clinic || {}).forEach(([k, v]) => g.appendChild(field(pretty(k), Array.isArray(v) ? v.join(', ') : v, 'clinic.' + k + (Array.isArray(v) ? '[]' : ''))));
    s = fs('Timings'); g = el('div', 'grid2'); s.appendChild(g);
    Object.entries(d.hours || {}).forEach(([k, v]) => g.appendChild(field(pretty(k), v, 'hours.' + k)));
    ['doctors', 'services'].forEach((kind) => {
      s = fs(kind === 'doctors' ? 'Doctors' : 'Treatments and prices');
      const rows = el('div', 'rows'); rows.id = 'rows-' + kind; s.appendChild(rows);
      (d[kind] || []).forEach((it) => rows.appendChild(rowEditor(kind, it)));
      const add = el('button', 'btn ghost add', kind === 'doctors' ? 'Add a doctor' : 'Add a treatment'); add.type = 'button';
      add.addEventListener('click', () => rows.appendChild(rowEditor(kind, {})));
      s.appendChild(add);
    });
    s = fs('Policies'); g = el('div', 'grid2'); s.appendChild(g);
    Object.entries(d.policies || {}).forEach(([k, v]) => g.appendChild(field(pretty(k), v, 'policies.' + k, true)));
    s = fs('Emergency and chat rules'); g = el('div', 'grid2'); s.appendChild(g);
    g.appendChild(field('What to do in an emergency', d.emergency_rules, 'emergency_rules', true));
    g.appendChild(field('Chat rules (one per line)', (d.bot_rules || []).join('\n'), 'bot_rules[]', true));
  }
  function collect() {
    const d = JSON.parse(JSON.stringify(clinicData));
    document.querySelectorAll('#clinic-form [data-path]').forEach((i) => {
      let p = i.dataset.path, list = p.endsWith('[]'); if (list) p = p.slice(0, -2);
      const v = list ? i.value.split(p === 'bot_rules' ? '\n' : ',').map((x) => x.trim()).filter(Boolean) : i.value.trim();
      const parts = p.split('.'); let o = d;
      parts.slice(0, -1).forEach((k) => { o = o[k] = o[k] || {}; });
      o[parts[parts.length - 1]] = v;
    });
    ['doctors', 'services'].forEach((kind) => {
      d[kind] = [...document.querySelectorAll('#rows-' + kind + ' .row-ed')].map((r) => {
        const o = {}; r.querySelectorAll('input').forEach((i) => { if (i.value.trim()) o[i.dataset.col] = i.value.trim(); }); return o;
      }).filter((o) => Object.keys(o).length);
    });
    return d;
  }
  async function loadClinic() {
    const r = await api('/api/clinic');
    if (!r.data) return;
    clinicData = r.data; renderClinic(clinicData);
    $('#clinic-raw').value = JSON.stringify(clinicData, null, 2);
  }
  function msg(t, bad) { const m = $('#save-msg'); m.textContent = t; m.className = 'save-msg' + (bad ? ' err' : ''); }
  $('#raw-toggle').addEventListener('click', () => {
    const raw = $('#clinic-raw'), form = $('#clinic-form');
    if (raw.hidden) { raw.value = JSON.stringify(collect(), null, 2); raw.hidden = false; form.hidden = true; $('#raw-toggle').textContent = 'Edit with the form'; }
    else { try { clinicData = JSON.parse(raw.value); renderClinic(clinicData); raw.hidden = true; form.hidden = false; $('#raw-toggle').textContent = 'Edit as JSON'; msg(''); } catch (e) { msg('The JSON has a mistake: ' + e.message, true); } }
  });
  $('#save-clinic').addEventListener('click', async () => {
    let d;
    if (!$('#clinic-raw').hidden) { try { d = JSON.parse($('#clinic-raw').value); } catch (e) { msg('The JSON has a mistake: ' + e.message, true); return; } }
    else d = collect();
    const r = await api('/api/clinic', 'PUT', { data: d });
    if (r.error) { msg(r.error, true); return; }
    clinicData = r.data; renderClinic(clinicData);
    msg('Saved. The chat uses the new details from the next message. Run the checks to make sure replies are still right.');
  });
  $('#reset-clinic').addEventListener('click', async () => {
    if (!confirm('Restore the original clinic details? Your changes will be lost.')) return;
    const r = await api('/api/clinic/reset', 'POST', {});
    if (r.data) { clinicData = r.data; renderClinic(clinicData); $('#clinic-raw').value = JSON.stringify(clinicData, null, 2); msg('Original clinic details restored.'); }
  });

  // ---------- checks ----------
  async function runChecks(withAI) {
    const out = $('#check-out'); out.innerHTML = '<p class="muted">Running checks...</p>';
    const r = await api('/api/selftest' + (withAI ? '?ai=1' : ''));
    if (r.error) { out.textContent = r.error; return; }
    out.innerHTML = '';
    [['Practice questions', r.sample], ['Extra questions', r.extra]].forEach(([title, set]) => {
      if (!set) return;
      const h = el('h3', 'score'); h.append(set.passed + ' / ' + set.total + ' '); h.appendChild(el('small', '', title + (r.mode === 'ai' ? ', with AI' : ', clinic file only'))); out.appendChild(h);
      const tb = el('table', 'checks'); tb.innerHTML = '<thead><tr><th>Question</th><th>Expected</th><th>Result</th><th>Reply</th></tr></thead>';
      const body = el('tbody');
      set.results.forEach((x) => {
        const tr = el('tr');
        tr.appendChild(el('td', '', x.q)); tr.appendChild(el('td', '', x.expect + (x.ticket ? ' (' + x.ticket + ')' : '')));
        tr.appendChild(el('td', x.pass ? 'ok' : 'bad', x.pass ? 'Pass' : 'Fail: ' + x.fails.join('; ')));
        tr.appendChild(el('td', 'rep', (x.source === 'ai' ? '[AI] ' : '') + x.reply)); body.appendChild(tr);
      });
      tb.appendChild(body); out.appendChild(tb);
    });
  }
  $('#run-file').addEventListener('click', () => runChecks(false));
  $('#run-ai').addEventListener('click', () => runChecks(true));

  refresh(); health();
  setInterval(refresh, 3000);
  setInterval(health, 30000);
})();
