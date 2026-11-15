// Patient chat page
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const log = $('#chat-log'), input = $('#chat-input'), sendBtn = $('#chat-send'), chips = $('#quick-replies');
  const seen = new Set();
  let lastId = 0, busy = false, clinic = null, uiLang = 'en';

  const UI = {
    en: { hi: 'Hello! How can we help you today?', body: 'Ask about timings, prices, doctors, insurance or booking a visit. You can write in English, हिंदी or తెలుగు.', ph: 'Type your question', sos: 'Emergency' },
    hi: { hi: 'नमस्ते! आज हम आपकी क्या मदद करें?', body: 'समय, फ़ीस, डॉक्टर, बीमा या अपॉइंटमेंट के बारे में पूछिए। आप English, हिंदी या తెలుగు में लिख सकते हैं।', ph: 'अपना सवाल लिखें', sos: 'इमरजेंसी' },
    te: { hi: 'నమస్తే! ఈ రోజు మేము మీకు ఎలా సహాయం చేయగలం?', body: 'సమయాలు, ధరలు, డాక్టర్లు, ఇన్సూరెన్స్ లేదా అపాయింట్‌మెంట్ గురించి అడగండి. మీరు English, हिंदी లేదా తెలుగులో రాయవచ్చు.', ph: 'మీ ప్రశ్న రాయండి', sos: 'ఎమర్జెన్సీ' },
  };

  // ---------- session ----------
  const params = new URLSearchParams(location.search);
  const askOnLoad = (params.get('q') || '').trim();
  const newId = () => 's_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
  let session = null;
  try { session = localStorage.getItem('brd_session'); } catch (e) {}
  if (!session || askOnLoad) { session = newId(); try { localStorage.setItem('brd_session', session); } catch (e) {} }
  try { uiLang = localStorage.getItem('brd_lang') || 'en'; } catch (e) {}

  // ---------- rendering ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function scroll() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }

  function addPatient(text) {
    const row = el('div', 'row me enter');
    row.appendChild(el('div', 'bubble patient-msg', text));
    log.appendChild(row); scroll();
  }

  function addMessage(m, animate = true) {
    if (m.id && seen.has(m.id)) return;
    if (m.id) { seen.add(m.id); lastId = Math.max(lastId, m.id); }
    if (m.role === 'patient') { addPatient(m.text); return; }
    const isStaff = m.role === 'staff';
    const row = el('div', 'row them' + (isStaff ? ' staff' : '') + (m.kind === 'urgent' ? ' urgent' : '') + (animate ? ' enter' : ''));
    if (isStaff) row.appendChild(el('div', 'who', (m.by || 'Clinic team') + ', Bright Roots'));
    const bubble = el('div', 'bubble bot-msg' + (isStaff ? ' staff-msg' : ''), m.text);
    bubble.dataset.kind = m.kind || (isStaff ? 'staff' : 'answer');
    if (m.ticket) { bubble.dataset.ticket = m.ticket.id; bubble.dataset.status = m.ticket.status; }
    row.appendChild(bubble);
    if (m.kind === 'urgent' && m.call) {
      const a = el('a', 'btn urgent-call', 'Call ' + m.call + ' now');
      a.href = 'tel:' + m.call.replace(/\s+/g, '');
      row.appendChild(a);
    }
    if (m.card === 'booking_form') row.appendChild(bookingCard());
    if (m.card === 'contact_form' && m.ticket) row.appendChild(contactCard(m.ticket.id));
    const meta = el('div', 'meta');
    if (!isStaff) {
      const lab = el('span', 'source-label' + (m.source === 'ai' ? ' ai' : ''), m.source === 'ai' ? 'AI reply, checked against clinic file' : 'Answered from clinic file');
      meta.appendChild(lab);
    } else meta.appendChild(el('span', '', 'Reply from our team'));
    if (m.ticket) {
      const word = m.ticket.status === 'urgent' ? 'urgent' : m.ticket.status === 'needs human' ? 'needs human' : m.ticket.status;
      const tag = el('span', 'ticket-tag' + (m.ticket.status === 'urgent' ? ' urgent' : ''), 'Ticket ' + m.ticket.id + ', ' + word);
      meta.appendChild(tag);
    }
    if (m.map) {
      const a = el('a', 'map-link', 'Open in Maps');
      a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.map);
      a.target = '_blank'; a.rel = 'noopener';
      meta.appendChild(a);
    }
    row.appendChild(meta);
    log.appendChild(row);
    if (!isStaff && m.quick) renderChips(m.quick.length ? m.quick : null);
    scroll();
  }

  function typing(on) {
    let t = $('#typing');
    if (on && !t) { t = el('div', 'typing'); t.id = 'typing'; t.setAttribute('aria-label', 'The front desk is typing'); t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); scroll(); }
    if (!on && t) t.remove();
  }

  function renderChips(list) {
    const base = (clinic && clinic.quick && clinic.quick[uiLang]) || [];
    const items = list || base;
    chips.innerHTML = '';
    items.forEach((q) => {
      const b = el('button', 'chip', q.label); b.type = 'button';
      b.addEventListener('click', () => ask(q.send));
      chips.appendChild(b);
    });
    if (clinic) {
      const sos = el('a', 'chip sos', UI[uiLang].sos + ': ' + clinic.emergency_phone);
      sos.href = 'tel:' + clinic.emergency_phone.replace(/\s+/g, '');
      chips.appendChild(sos);
    }
  }

  // ---------- cards ----------
  function opts(from, to, step) { const out = []; for (let m = from; m < to; m += step) out.push(m); return out; }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0'); }
  function label(m) { const h = Math.floor(m / 60), h12 = h % 12 || 12; return h12 + ':' + String(m % 60).padStart(2, '0') + (h >= 12 ? ' pm' : ' am'); }
  function istToday() { const d = new Date(Date.now() + 330 * 60000); return d.toISOString().slice(0, 10); }

  function bookingCard() {
    const f = el('form', 'card');
    f.innerHTML = '<label>Your name<input name="name" required maxlength="60" autocomplete="name"></label>' +
      '<label>Phone<input name="phone" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="98xxx xxxxx"></label>' +
      '<div class="two"><label>Day<input name="date" type="date" required></label><label>Time<select name="time" required></select></label></div>' +
      '<label>Treatment (optional)<select name="service"><option value="">Not sure yet</option></select></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Send booking request</button>';
    const date = f.elements.date, time = f.elements.time;
    date.min = istToday(); date.value = istToday();
    opts(9 * 60, 20 * 60, 30).forEach((m) => { const o = el('option', '', label(m)); o.value = hhmm(m); time.appendChild(o); });
    time.value = '11:00';
    ((clinic && clinic.services) || []).forEach((s) => { const o = el('option', '', s); o.value = s; f.elements.service.appendChild(o); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.err', f); err.textContent = '';
      const body = { session, name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim(), date: date.value, time: time.value, service: f.elements.service.value };
      if (!/^[+\d][\d\s-]{6,15}$/.test(body.phone)) { err.textContent = 'Please enter a valid phone number.'; return; }
      const r = await api('/api/book', body);
      if (r.error) { err.textContent = r.error; return; }
      f.classList.add('done');
      (r.messages || []).forEach((m) => { if (m.role === 'patient') { seen.add(m.id); addPatient(m.text); } else addMessage(m); });
    });
    return f;
  }

  function contactCard(ticketId) {
    const f = el('form', 'card');
    f.innerHTML = '<label>Your name<input name="name" maxlength="60" autocomplete="name"></label>' +
      '<label>Phone<input name="phone" required inputmode="tel" maxlength="16" autocomplete="tel" placeholder="98xxx xxxxx"></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit">Send my number</button>';
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await api('/api/contact', { session, ticketId, name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim() });
      if (r.error) { $('.err', f).textContent = r.error; return; }
      f.classList.add('done');
      addMessage(r.last);
    });
    return f;
  }

  // ---------- network ----------
  async function api(url, body) {
    try {
      const res = await fetch(url, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {});
      return await res.json();
    } catch (e) { return { error: 'No connection. Please check your internet and try again.' }; }
  }

  async function ask(text) {
    text = String(text || '').trim();
    if (!text || busy) return;
    busy = true; sendBtn.disabled = true; document.body.dataset.state = 'waiting';
    addPatient(text);
    input.value = ''; grow();
    typing(true);
    const r = await api('/api/chat', { session, text });
    typing(false);
    if (r.message) addMessage(r.message);
    else addMessage({ role: 'bot', kind: 'error', source: 'file', text: r.error || 'Sorry, something went wrong. Please call us on ' + ((clinic && clinic.phone) || 'the clinic number') + '.' });
    busy = false; sendBtn.disabled = false; document.body.dataset.state = 'idle';
    input.focus({ preventScroll: true });
  }

  async function poll() {
    const r = await api('/api/messages?session=' + encodeURIComponent(session) + '&after=' + lastId);
    (r.messages || []).forEach((m) => {
      if (m.role === 'patient') { seen.add(m.id); lastId = Math.max(lastId, m.id); return; } // already shown when sent
      if (busy && m.role === 'bot') return; // the reply arrives with the send call
      addMessage(m);
    });
  }

  // ---------- today strip ----------
  function drawToday(t) {
    const box = $('#today'), line = $('#dayline'), status = $('#today-status');
    const START = 8 * 60, END = 21 * 60, pct = (m) => Math.max(0, Math.min(100, ((m - START) / (END - START)) * 100));
    line.querySelectorAll('.seg,.lunch,.now').forEach((n) => n.remove());
    t.ranges.forEach(([a, b]) => { const s = el('div', 'seg' + (t.emergencyOnly ? ' emergency' : '')); s.style.left = pct(a) + '%'; s.style.width = pct(b) - pct(a) + '%'; line.appendChild(s); });
    if (t.lunch && t.ranges.length && !t.emergencyOnly) { const l = el('div', 'lunch'); l.style.left = pct(t.lunch[0]) + '%'; l.style.width = pct(t.lunch[1]) - pct(t.lunch[0]) + '%'; line.appendChild(l); }
    const n = el('div', 'now'); n.style.left = pct(t.nowMin) + '%'; line.appendChild(n);
    box.classList.remove('is-open', 'is-closed', 'is-lunch');
    let text;
    if (t.open && t.emergencyOnly) { text = 'Emergencies only today, until ' + t.closesAt; box.classList.add('is-lunch'); }
    else if (t.inLunch) { text = 'Lunch break, front desk back soon. Closes ' + t.closesAt; box.classList.add('is-lunch'); }
    else if (t.open) { text = 'Open now, closes ' + t.closesAt; box.classList.add('is-open'); }
    else { text = 'Closed now' + (t.next ? ', opens ' + t.next.day + ' at ' + t.next.time : ''); box.classList.add('is-closed'); }
    status.textContent = text;
  }

  function sideFacts(c) {
    const dl = $('#side-facts'); dl.innerHTML = '';
    [['Address', c.address], ['Landmark', c.landmark], ['Phone', c.phone], ['Emergency', c.emergency_phone], ['Today', c.today.value]].forEach(([k, v]) => {
      if (!v) return; dl.appendChild(el('dt', '', k)); dl.appendChild(el('dd', '', v));
    });
  }

  function setLang(l) {
    uiLang = UI[l] ? l : 'en';
    try { localStorage.setItem('brd_lang', uiLang); } catch (e) {}
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === uiLang)));
    $('#welcome-hi').textContent = UI[uiLang].hi;
    $('#welcome-body').textContent = UI[uiLang].body;
    input.placeholder = UI[uiLang].ph;
    renderChips();
  }

  function grow() { input.style.height = 'auto'; input.style.height = Math.min(input.scrollHeight, 120) + 'px'; }

  // ---------- start ----------
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  sendBtn.addEventListener('click', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  input.addEventListener('input', grow);
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang)));
  $('#new-chat').addEventListener('click', () => { try { localStorage.removeItem('brd_session'); } catch (e) {} location.href = location.pathname; });

  (async function start() {
    document.body.dataset.state = 'loading';
    const [c, hist] = await Promise.all([api('/api/clinic/public'), askOnLoad ? Promise.resolve({ messages: [] }) : api('/api/messages?session=' + encodeURIComponent(session) + '&after=0')]);
    if (c && c.name) {
      clinic = c;
      $('#clinic-name').textContent = c.name; $('#side-name').textContent = c.name;
      const call = $('#call-btn'); call.href = 'tel:' + c.phone.replace(/\s+/g, '');
      drawToday(c.today); sideFacts(c);
      setInterval(async () => { const n = await api('/api/clinic/public'); if (n && n.today) { clinic = n; drawToday(n.today); } }, 60000);
    }
    chips.classList.add('intro'); setTimeout(() => chips.classList.remove('intro'), 1600);
    setLang(uiLang);
    (hist.messages || []).forEach((m) => addMessage(m, false));
    document.body.dataset.state = 'idle';
    setInterval(poll, 4000);
    if (askOnLoad) {
      history.replaceState(null, '', location.pathname); // so a refresh doesn't ask again
      ask(askOnLoad);
    }
  })();
})();
