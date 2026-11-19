// Patient chat page
(function () {
  'use strict';
  const $ = (s, el = document) => el.querySelector(s);
  const log = $('#chat-log'), input = $('#chat-input'), sendBtn = $('#chat-send'), chips = $('#quick-replies');
  const seen = new Set();
  let lastId = 0, busy = false, clinic = null, uiLang = 'en';

  // Words on the page in each language. Facts (times, prices) always come from the server.
  const UI = {
    en: { hi: 'Hello! How can we help you today?', body: 'Ask about timings, prices, doctors, insurance or booking a visit. You can write in English, हिंदी or తెలుగు.', ph: 'Type your question', sos: 'Emergency', call: 'Call', sub: 'Front desk, Banjara Hills', newchat: 'Start a new chat', staff: 'Staff page', staffbtn: 'Staff page',
      lede: "Ask the front desk anything about your visit. Replies come straight from the clinic's own details, and a real person steps in when needed.",
      open: (c) => 'Open now, closes ' + c, closed: 'Closed now', opens: (d, t) => ', opens ' + d + ' at ' + t, lunch: (c) => 'Lunch break, front desk back soon. Closes ' + c, emerg: (c) => 'Emergencies only today, until ' + c,
      switched: 'Replies will now be in English.', file: 'Answered from clinic file', ai: 'AI reply, checked against clinic file', fromteam: 'Reply from our team', ticket: 'Ticket', maps: 'Open in Maps',
      callnow: (n) => 'Call ' + n + ' now', st: { 'needs human': 'needs human', urgent: 'urgent', answered: 'answered', closed: 'closed' },
      f: { name: 'Your name', phone: 'Phone', day: 'Day', time: 'Time', treat: 'Treatment (optional)', notsure: 'Not sure yet', book: 'Send booking request', num: 'Send my number', bad: 'Please enter a valid phone number.', ph: '98xxx xxxxx' },
      scale: ['8 am', '12 pm', '4 pm', '9 pm'], photos: 'Photos:', photographer: 'Ozkan Guner', on: 'on', unsplash: 'Unsplash', err: 'Sorry, something went wrong. Please call us on ',
      today: 'today', tomorrow: 'tomorrow', team: 'Clinic team', typing: 'The front desk is typing', facts: ['Address', 'Landmark', 'Phone', 'Emergency', 'Today'] },
    hi: { hi: 'नमस्ते! आज हम आपकी क्या मदद करें?', body: 'समय, फ़ीस, डॉक्टर, बीमा या अपॉइंटमेंट के बारे में पूछिए। आप हिंदी, अंग्रेज़ी या तेलुगु में लिख सकते हैं।', ph: 'अपना सवाल लिखें', sos: 'इमरजेंसी', call: 'कॉल', sub: 'फ्रंट डेस्क, बंजारा हिल्स', newchat: 'नई बातचीत शुरू करें', staff: 'स्टाफ़ पेज', staffbtn: 'स्टाफ़',
      lede: 'अपनी विज़िट के बारे में फ्रंट डेस्क से कुछ भी पूछें। जवाब क्लिनिक की अपनी जानकारी से आते हैं, और ज़रूरत पड़ने पर हमारी टीम का कोई व्यक्ति मदद करता है।',
      open: (c) => 'अभी खुला है, ' + c + ' बजे बंद होगा', closed: 'अभी बंद है', opens: (d, t) => ', ' + d + ' ' + t + ' बजे खुलेगा', lunch: (c) => 'लंच ब्रेक, फ्रंट डेस्क जल्द वापस आएगा', emerg: (c) => 'आज सिर्फ़ इमरजेंसी, ' + c + ' तक',
      switched: 'अब जवाब हिंदी में आएँगे।', file: 'क्लिनिक की जानकारी से जवाब', ai: 'एआई का जवाब, क्लिनिक की जानकारी से जाँचा गया', fromteam: 'हमारी टीम का जवाब', ticket: 'टिकट', maps: 'नक्शे में खोलें',
      callnow: (n) => 'अभी ' + n + ' पर कॉल करें', st: { 'needs human': 'स्टाफ़ जवाब देगा', urgent: 'अति आवश्यक', answered: 'जवाब दिया गया', closed: 'बंद' },
      f: { name: 'आपका नाम', phone: 'फ़ोन नंबर', day: 'दिन', time: 'समय', treat: 'इलाज (ज़रूरी नहीं)', notsure: 'अभी पक्का नहीं', book: 'अपॉइंटमेंट रिक्वेस्ट भेजें', num: 'मेरा नंबर भेजें', bad: 'कृपया सही फ़ोन नंबर लिखें।', ph: 'मोबाइल नंबर' },
      scale: ['सुबह ८', 'दोपहर १२', 'शाम ४', 'रात ९'], photos: 'फ़ोटो:', photographer: 'ओज़कान गुनर', on: ',', unsplash: 'अनस्प्लैश', err: 'माफ़ कीजिए, कुछ गड़बड़ हो गई। कृपया हमें कॉल करें: ',
      today: 'आज', tomorrow: 'कल', team: 'क्लिनिक टीम', typing: 'फ्रंट डेस्क लिख रहा है', facts: ['पता', 'लैंडमार्क', 'फ़ोन', 'इमरजेंसी', 'आज'] },
    te: { hi: 'నమస్తే! ఈ రోజు మేము మీకు ఎలా సహాయం చేయగలం?', body: 'సమయాలు, ధరలు, డాక్టర్లు, ఇన్సూరెన్స్ లేదా అపాయింట్‌మెంట్ గురించి అడగండి. మీరు తెలుగు, ఇంగ్లీష్ లేదా హిందీలో రాయవచ్చు.', ph: 'మీ ప్రశ్న రాయండి', sos: 'ఎమర్జెన్సీ', call: 'కాల్', sub: 'ఫ్రంట్ డెస్క్, బంజారా హిల్స్', newchat: 'కొత్త చాట్ మొదలుపెట్టండి', staff: 'స్టాఫ్ పేజీ', staffbtn: 'స్టాఫ్',
      lede: 'మీ విజిట్ గురించి ఫ్రంట్ డెస్క్‌ని ఏదైనా అడగండి. జవాబులు క్లినిక్ వివరాల నుండే వస్తాయి, అవసరమైతే మా టీమ్ సభ్యులు సహాయం చేస్తారు.',
      open: (c) => 'ఇప్పుడు తెరిచి ఉంది, ' + c + 'కి మూసివేస్తారు', closed: 'ఇప్పుడు మూసి ఉంది', opens: (d, t) => ', ' + d + ' ' + t + 'కి తెరుస్తారు', lunch: (c) => 'లంచ్ బ్రేక్, ఫ్రంట్ డెస్క్ త్వరలో వస్తుంది', emerg: (c) => 'ఈ రోజు ఎమర్జెన్సీలకు మాత్రమే, ' + c + ' వరకు',
      switched: 'ఇప్పటి నుండి జవాబులు తెలుగులో వస్తాయి.', file: 'క్లినిక్ సమాచారం నుండి జవాబు', ai: 'ఏఐ జవాబు, క్లినిక్ సమాచారంతో సరిచూశాం', fromteam: 'మా టీమ్ జవాబు', ticket: 'టికెట్', maps: 'మ్యాప్‌లో తెరవండి',
      callnow: (n) => 'ఇప్పుడే ' + n + 'కు కాల్ చేయండి', st: { 'needs human': 'స్టాఫ్ జవాబిస్తారు', urgent: 'అత్యవసరం', answered: 'జవాబు ఇచ్చారు', closed: 'మూసివేశారు' },
      f: { name: 'మీ పేరు', phone: 'ఫోన్ నంబర్', day: 'రోజు', time: 'సమయం', treat: 'చికిత్స (అవసరం లేదు)', notsure: 'ఇంకా తెలియదు', book: 'అపాయింట్‌మెంట్ రిక్వెస్ట్ పంపండి', num: 'నా నంబర్ పంపండి', bad: 'దయచేసి సరైన ఫోన్ నంబర్ రాయండి.', ph: 'మొబైల్ నంబర్' },
      scale: ['ఉదయం ౮', 'మధ్యాహ్నం ౧౨', 'సాయంత్రం ౪', 'రాత్రి ౯'], photos: 'ఫోటోలు:', photographer: 'ఓజ్కాన్ గునర్', on: ',', unsplash: 'అన్‌స్ప్లాష్', err: 'క్షమించండి, ఏదో సమస్య వచ్చింది. దయచేసి మాకు కాల్ చేయండి: ',
      today: 'ఈ రోజు', tomorrow: 'రేపు', team: 'క్లినిక్ టీమ్', typing: 'ఫ్రంట్ డెస్క్ టైప్ చేస్తోంది', facts: ['చిరునామా', 'ల్యాండ్‌మార్క్', 'ఫోన్', 'ఎమర్జెన్సీ', 'ఈ రోజు'] },
  };
  const DAYS = {
    hi: { Sunday: 'रविवार', Monday: 'सोमवार', Tuesday: 'मंगलवार', Wednesday: 'बुधवार', Thursday: 'गुरुवार', Friday: 'शुक्रवार', Saturday: 'शनिवार' },
    te: { Sunday: 'ఆదివారం', Monday: 'సోమవారం', Tuesday: 'మంగళవారం', Wednesday: 'బుధవారం', Thursday: 'గురువారం', Friday: 'శుక్రవారం', Saturday: 'శనివారం' },
  };

  // Hindi/Telugu digits and times (9:00 am -> सुबह ९:००)
  const DIG = { hi: '०१२३४५६७८९', te: '౦౧౨౩౪౫౬౭౮౯' };
  const PART = { hi: ['सुबह', 'दोपहर', 'शाम', 'रात'], te: ['ఉదయం', 'మధ్యాహ్నం', 'సాయంత్రం', 'రాత్రి'] };
  function dg(s, l) { const d = DIG[l]; return d ? String(s).replace(/[0-9]/g, (c) => d[+c]) : String(s); }
  function lt(s, l) {
    if (!DIG[l]) return String(s);
    return dg(String(s).replace(/(\d{1,2}):(\d{2})\s*([ap])m/gi, (m, h, mm, ap) => {
      let H = +h % 12; if (ap.toLowerCase() === 'p') H += 12;
      const p = H >= 4 && H < 12 ? 0 : H >= 12 && H < 16 ? 1 : H >= 16 && H < 20 ? 2 : 3;
      return PART[l][p] + ' ' + h + ':' + mm;
    }), l);
  }
  const L = (k) => UI[uiLang][k];
  const local = (k) => (uiLang !== 'en' && clinic && clinic.local && clinic.local[uiLang] ? clinic.local[uiLang][k] : clinic && clinic[k]);

  // Small pictures for the quick buttons, in the same order as the buttons.
  const ICONS = [
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h11M7 9h11M7 4c7 0 7 9 0 9h-.5L15 21"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="7" r="4"/><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7"/><path d="M15 15v3a2 2 0 0 0 4 0v-1"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3 4.5 6v5.5c0 4.6 3.1 8.2 7.5 9.5 4.4-1.3 7.5-4.9 7.5-9.5V6z"/><path d="m8.8 12 2.3 2.3 4.2-4.6"/></svg>',
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z"/><circle cx="12" cy="9.5" r="2.5"/></svg>',
  ];
  const SOS_ICON = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M6.6 10.8a15.2 15.2 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.57a1 1 0 0 1-.25 1z"/></svg>';
  const BOT_FACE = '<svg viewBox="0 0 40 40" aria-hidden="true"><path style="fill: var(--pine)" d="M12 5.5c-4.2 0-6.6 4.2-5.6 9.4.9 4.6 3.3 7.2 4.2 12.6.8 4.8 1.9 8 4.1 8 2.4 0 2.6-5 3.6-8.4.4-1.4 1-2.1 1.7-2.1s1.3.7 1.7 2.1c1 3.4 1.2 8.4 3.6 8.4 2.2 0 3.3-3.2 4.1-8 .9-5.4 3.3-8 4.2-12.6 1-5.2-1.4-9.4-5.6-9.4-3.2 0-4.6 2-8 2s-4.8-2-8-2Z"/><circle cx="16" cy="16" r="1.6" fill="#fff"/><circle cx="24" cy="16" r="1.6" fill="#fff"/><path d="M16.5 20.5c1.8 2 5.2 2 7 0" fill="none" stroke="#fff" stroke-width="1.4" stroke-linecap="round"/></svg>';

  // ---------- session ----------
  const params = new URLSearchParams(location.search);
  const askOnLoad = (params.get('q') || '').trim();
  const newId = () => 's_' + (crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : Math.random().toString(36).slice(2) + Date.now().toString(36));
  let session = null;
  try { session = localStorage.getItem('brd_session'); } catch (e) {}
  if (!session || askOnLoad) { session = newId(); try { localStorage.setItem('brd_session', session); } catch (e) {} }
  try { uiLang = localStorage.getItem('brd_lang') || 'en'; } catch (e) {}
  if (!UI[uiLang]) uiLang = 'en';

  // ---------- rendering ----------
  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function scroll() { requestAnimationFrame(() => { log.scrollTop = log.scrollHeight; }); }
  function face(staff, name) {
    if (staff) { const f = el('div', 'staff-face', (name || 'CT').split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()); f.setAttribute('aria-hidden', 'true'); return f; }
    const f = el('div', 'bot-face'); f.innerHTML = BOT_FACE; return f;
  }

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
    const ml = UI[m.lang] ? m.lang : uiLang, U = UI[isStaff ? uiLang : ml];
    const row = el('div', 'row them' + (isStaff ? ' staff' : '') + (m.kind === 'urgent' ? ' urgent' : '') + (animate ? ' enter' : ''));
    if (isStaff) row.appendChild(el('div', 'who', (m.by && m.by !== 'Clinic team' ? m.by : U.team) + ', ' + (local('name') || 'Bright Roots Dental')));
    const line = el('div', 'line');
    line.appendChild(face(isStaff, m.by));
    const bubble = el('div', 'bubble bot-msg' + (isStaff ? ' staff-msg' : ''), m.text);
    bubble.dataset.kind = m.kind || (isStaff ? 'staff' : 'answer');
    if (m.ticket) { bubble.dataset.ticket = m.ticket.id; bubble.dataset.status = m.ticket.status; }
    line.appendChild(bubble);
    row.appendChild(line);
    if (m.kind === 'urgent' && m.call) {
      const a = el('a', 'btn urgent-call');
      a.innerHTML = SOS_ICON.replace('<svg', '<svg width="20" height="20"'); a.append(' ' + U.callnow(dg(m.call, ml)));
      a.href = 'tel:' + m.call.replace(/\s+/g, '');
      row.appendChild(a);
    }
    if (m.card === 'booking_form') row.appendChild(bookingCard());
    if (m.card === 'contact_form' && m.ticket) row.appendChild(contactCard(m.ticket.id));
    const meta = el('div', 'meta');
    if (!isStaff) meta.appendChild(el('span', 'source-label' + (m.source === 'ai' ? ' ai' : ''), m.source === 'ai' ? U.ai : U.file));
    else meta.appendChild(el('span', '', U.fromteam));
    if (m.ticket) {
      const num = ml === 'en' ? m.ticket.id : dg(m.ticket.id.replace(/^T-/, ''), ml);
      meta.appendChild(el('span', 'ticket-tag' + (m.ticket.status === 'urgent' ? ' urgent' : ''), U.ticket + ' ' + num + (m.ticket.status ? ', ' + (U.st[m.ticket.status] || m.ticket.status) : '')));
    }
    if (m.map) {
      const a = el('a', 'map-link', U.maps);
      a.href = 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.map);
      a.target = '_blank'; a.rel = 'noopener';
      meta.appendChild(a);
    }
    row.appendChild(meta);
    log.appendChild(row);
    if (!isStaff && m.quick) renderChips(m.quick.length && (m.lang || uiLang) === uiLang ? m.quick : null);
    scroll();
  }

  function typing(on) {
    let t = $('#typing');
    if (on && !t) {
      t = el('div', 'typing'); t.id = 'typing'; t.setAttribute('aria-label', UI[uiLang].typing);
      t.appendChild(face(false)); const d = el('div', 'dots'); d.innerHTML = '<i></i><i></i><i></i>'; t.appendChild(d);
      log.appendChild(t); scroll();
    }
    if (!on && t) t.remove();
  }

  function renderChips(list) {
    const base = (clinic && clinic.quick && clinic.quick[uiLang]) || [];
    const items = list || base;
    chips.innerHTML = '';
    items.forEach((q) => {
      const b = el('button', 'chip'); b.type = 'button';
      let i = base.findIndex((x) => x.send === q.send);
      if (i < 0 && clinic && clinic.quick) for (const l of Object.keys(clinic.quick)) { const j = clinic.quick[l].findIndex((x) => x.send === q.send); if (j >= 0) { i = j; break; } }
      const icon = ICONS[i >= 0 ? i : 2];
      b.innerHTML = icon; b.append(q.label);
      b.addEventListener('click', () => ask(q.send));
      chips.appendChild(b);
    });
    if (clinic) {
      const sos = el('a', 'chip sos'); sos.innerHTML = SOS_ICON; sos.append(UI[uiLang].sos + ': ' + dg(clinic.emergency_phone, uiLang));
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
    const F = L('f');
    f.innerHTML = '<label><span></span><input name="name" required maxlength="60" autocomplete="name"></label>' +
      '<label><span></span><input name="phone" required inputmode="tel" maxlength="16" autocomplete="tel"></label>' +
      '<div class="two"><label><span></span><input name="date" type="date" required></label><label><span></span><select name="time" required></select></label></div>' +
      '<label><span></span><select name="service"><option value=""></option></select></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit"></button>';
    const sp = f.querySelectorAll('label > span'); [F.name, F.phone, F.day, F.time, F.treat].forEach((t, i) => { sp[i].textContent = t; });
    f.elements.phone.placeholder = F.ph; f.elements.service.options[0].textContent = F.notsure; $('button', f).textContent = F.book;
    const date = f.elements.date, time = f.elements.time;
    date.min = istToday(); date.value = istToday();
    opts(9 * 60, 20 * 60, 30).forEach((m) => { const o = el('option', '', lt(label(m), uiLang)); o.value = hhmm(m); time.appendChild(o); });
    time.value = '11:00';
    const ls = local('services') || [];
    ((clinic && clinic.services) || []).forEach((s, i) => { const o = el('option', '', ls[i] || s); o.value = s; f.elements.service.appendChild(o); });
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const err = $('.err', f); err.textContent = '';
      const body = { session, lang: uiLang, name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim(), date: date.value, time: time.value, service: f.elements.service.value };
      if (!/^[+\d][\d\s-]{6,15}$/.test(body.phone)) { err.textContent = F.bad; return; }
      const r = await api('/api/book', body);
      if (r.error) { err.textContent = r.error; return; }
      f.classList.add('done');
      (r.messages || []).forEach((m) => { if (m.role === 'patient') { seen.add(m.id); addPatient(m.text); } else addMessage(m); });
    });
    return f;
  }

  function contactCard(ticketId) {
    const f = el('form', 'card');
    const F = L('f');
    f.innerHTML = '<label><span></span><input name="name" maxlength="60" autocomplete="name"></label>' +
      '<label><span></span><input name="phone" required inputmode="tel" maxlength="16" autocomplete="tel"></label>' +
      '<div class="err" role="alert"></div><button class="btn" type="submit"></button>';
    const sp = f.querySelectorAll('label > span'); sp[0].textContent = F.name; sp[1].textContent = F.phone;
    f.elements.phone.placeholder = F.ph; $('button', f).textContent = F.num;
    f.addEventListener('submit', async (e) => {
      e.preventDefault();
      const r = await api('/api/contact', { session, ticketId, lang: uiLang, name: f.elements.name.value.trim(), phone: f.elements.phone.value.trim() });
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
    const r = await api('/api/chat', { session, text, lang: uiLang });
    typing(false);
    if (r.message) addMessage(r.message);
    else addMessage({ role: 'bot', lang: uiLang, kind: 'error', source: 'file', text: r.error || (L('err') + dg((clinic && clinic.phone) || '', uiLang)) });
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
    const U = UI[uiLang], box = $('#today'), line = $('#dayline'), status = $('#today-status');
    const START = 8 * 60, END = 21 * 60, pct = (m) => Math.max(0, Math.min(100, ((m - START) / (END - START)) * 100));
    line.querySelectorAll('.seg,.lunch,.now').forEach((n) => n.remove());
    t.ranges.forEach(([a, b]) => { const s = el('div', 'seg' + (t.emergencyOnly ? ' emergency' : '')); s.style.left = pct(a) + '%'; s.style.width = pct(b) - pct(a) + '%'; line.appendChild(s); });
    if (t.lunch && t.ranges.length && !t.emergencyOnly) { const l = el('div', 'lunch'); l.style.left = pct(t.lunch[0]) + '%'; l.style.width = pct(t.lunch[1]) - pct(t.lunch[0]) + '%'; line.appendChild(l); }
    const n = el('div', 'now'); n.style.left = pct(t.nowMin) + '%'; line.appendChild(n);
    box.classList.remove('is-open', 'is-closed', 'is-lunch');
    let text;
    const day = (d) => d === 'today' ? U.today : d === 'tomorrow' ? U.tomorrow : ((DAYS[uiLang] || {})[d] || d);
    const ct = lt(t.closesAt || '', uiLang);
    if (t.open && t.emergencyOnly) { text = U.emerg(ct); box.classList.add('is-lunch'); }
    else if (t.inLunch) { text = U.lunch(ct); box.classList.add('is-lunch'); }
    else if (t.open) { text = U.open(ct); box.classList.add('is-open'); }
    else { text = U.closed + (t.next ? U.opens(day(t.next.day), lt(t.next.time, uiLang)) : ''); box.classList.add('is-closed'); }
    status.textContent = text;
    document.querySelectorAll('.dayline-scale span').forEach((sp, i) => { sp.textContent = U.scale[i]; });
  }

  function sideFacts(c) {
    const dl = $('#side-facts'); dl.innerHTML = '';
    const lc = uiLang !== 'en' && c.local ? c.local[uiLang] : null;
    (lc ? [lc.address, lc.landmark, lc.phone, lc.emergency_phone, lc.today] : [c.address, c.landmark, c.phone, c.emergency_phone, c.today.value]).forEach((v, i) => {
      if (!v) return; dl.appendChild(el('dt', '', UI[uiLang].facts[i])); dl.appendChild(el('dd', '', v));
    });
  }

  function team(c) {
    [$('#team'), $('#side-team')].forEach((box) => {
      box.innerHTML = '';
      const lc = uiLang !== 'en' && c.local ? c.local[uiLang] : null;
      (c.doctors || []).forEach((d, di) => {
        const card = el('div', 'doc');
        const nm = (lc ? lc.doctors[di].name : d.name).replace(/^(Dr\.?|डॉ\.|డా\.)\s*/i, '');
        const initials = nm.split(/\s+/).map((w) => Array.from(w)[0] || '').join('').slice(0, 2).toUpperCase();
        card.appendChild(el('div', 'avatar', initials));
        const ld = lc ? lc.doctors[di] : d;
        const t = el('div'); t.appendChild(el('div', 'doc-name', ld.name)); t.appendChild(el('div', 'doc-days', ld.days)); card.appendChild(t);
        box.appendChild(card);
      });
    });
  }

  function setLang(l, fromUser) {
    const changed = fromUser && UI[l] && l !== uiLang;
    uiLang = UI[l] ? l : 'en';
    if (changed && log.querySelector('.row')) { const n = el('div', 'lang-note', UI[uiLang].switched); log.appendChild(n); scroll(); }
    try { localStorage.setItem('brd_lang', uiLang); } catch (e) {}
    document.documentElement.lang = uiLang;
    document.querySelectorAll('.lang button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.lang === uiLang)));
    document.querySelectorAll('[data-i18n]').forEach((n) => { n.textContent = UI[uiLang][n.dataset.i18n]; });
    input.placeholder = UI[uiLang].ph;
    if (clinic) { drawToday(clinic.today); sideFacts(clinic); team(clinic); $('#clinic-name').textContent = local('name'); $('#side-name').textContent = local('name'); }
    renderChips();
  }

  function grow() {
    input.style.height = 'auto';
    input.style.height = Math.min(input.scrollHeight + 3, 120) + 'px';
    input.classList.toggle('tall', input.scrollHeight > 120);
  }

  // If a photo can't load (no internet, blocked), show the drawing instead.
  document.querySelectorAll('#photos img').forEach((img) => {
    const fail = () => $('.clinic-side').classList.add('no-photos');
    if (img.complete && img.naturalWidth === 0 && img.src) fail();
    img.addEventListener('error', fail);
  });

  // ---------- start ----------
  $('#composer').addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  sendBtn.addEventListener('click', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); ask(input.value); } });
  input.addEventListener('input', grow);
  document.querySelectorAll('.lang button').forEach((b) => b.addEventListener('click', () => setLang(b.dataset.lang, true)));
  $('#new-chat').addEventListener('click', () => { try { localStorage.removeItem('brd_session'); } catch (e) {} location.href = location.pathname; });

  (async function start() {
    document.body.dataset.state = 'loading';
    const [c, hist] = await Promise.all([api('/api/clinic/public'), askOnLoad ? Promise.resolve({ messages: [] }) : api('/api/messages?session=' + encodeURIComponent(session) + '&after=0')]);
    if (c && c.name) {
      clinic = c;
      $('#clinic-name').textContent = c.name; $('#side-name').textContent = c.name;
      $('#call-btn').href = 'tel:' + c.phone.replace(/\s+/g, '');
      team(c);
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
