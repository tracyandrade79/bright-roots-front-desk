'use strict';
// Demo tickets so the staff page has something to show. Made-up patients, marked "Demo".
// Load and remove them from the staff page. They are never added on their own.
const engine = require('./engine');
const store = require('./store');

const MIN = 60000;
const DEMO = [
  { name: 'Arjun Mehta (demo)', phone: '90000 00001', ago: 4, q: 'Bleeding after my tooth extraction is not stopping, what do I do?' },
  { name: 'Priya Sharma (demo)', phone: '90000 00002', ago: 25, q: 'Please book a teeth cleaning for Saturday at 11 am', booking: { dow: 6, min: 660 } },
  { name: 'Fatima Khan (demo)', phone: '90000 00003', ago: 190, q: 'Do you do laser teeth whitening?' },
  { name: 'Rohan Verma (demo)', phone: '90000 00004', ago: 35, q: 'क्या आप बच्चों के लिए फ्लोराइड ट्रीटमेंट करते हैं?' },
  { name: 'Lakshmi Reddy (demo)', phone: '90000 00005', ago: 12, q: 'నాకు సాయంత్రం 5 గంటలకు అపాయింట్‌మెంట్ కావాలి', booking: { dow: null, min: 1020 } },
  { name: 'Neha Iyer (demo)', phone: '90000 00006', ago: 130, q: 'Do you accept Bajaj Allianz cashless?', reply: 'Hello Neha, we are not cashless with Bajaj Allianz yet. We will give you a bill that you can claim. Please call us if you need help with the papers.', status: 'answered' },
  { name: 'Kabir Singh (demo)', phone: '90000 00007', ago: 60 * 26, q: 'Can I get teeth whitening done on Sunday?', reply: 'Hello Kabir, on Sundays we only see emergencies. Whitening can be done Monday to Saturday. Shall we book you for Saturday?', status: 'closed' },
];

// Next open day/time for a demo booking.
function nextSlot(data, dow, min) {
  const now = engine.istNow();
  for (let i = 1; i <= 14; i++) {
    const d = new Date(now.date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + i);
    const date = d.toISOString().slice(0, 10);
    if (dow !== null && d.getUTCDay() !== dow) continue;
    if (engine.checkSlot(data, date, min).ok) return { date, min, label: engine.fmtWhen(date, min, 'en') };
  }
  return null;
}

async function load() {
  clear();
  const data = store.clinic();
  const now = Date.now();
  const made = [];
  for (const [i, d] of DEMO.entries()) {
    const sid = `demo_${i + 1}_${now.toString(36)}`;
    const s = store.session(sid);
    s.contact = { name: d.name, phone: d.phone };
    const t0 = now - d.ago * MIN;
    let captured = null;
    const r = await engine.reply(d.q, { data, session: { contact: s.contact }, createTicket: (f) => { captured = f; return { id: '__ID__', status: f.status }; } });
    let fields = captured || { type: 'question', status: 'needs human', question: d.q, lang: engine.detectLang(d.q) };
    if (d.booking) {
      const slot = nextSlot(data, d.booking.dow, d.booking.min);
      fields = { ...fields, type: 'booking', status: 'needs human', booking: slot, services: fields.services || [] };
    }
    const t = store.createTicket(sid, { ...fields, question: d.q, contact: s.contact });
    let text = r.text.replace(/__ID__/g, t.id);
    if (d.booking && t.booking && !captured) text = `Done! I've sent a booking request for ${t.booking.label} (ticket ${t.id}). Our team will confirm it on phone or WhatsApp within 2 working hours.`;
    const msgs = [
      { role: 'patient', text: d.q, ts: t0 },
      { role: 'bot', text, source: 'file', kind: r.kind === 'booking' || d.booking ? 'booking' : r.kind, ticket: { id: t.id, status: t.status }, ts: t0 + 2000 },
    ];
    if (d.reply) msgs.push({ role: 'staff', text: d.reply, by: 'Clinic team', ticket: { id: t.id }, ts: t0 + 20 * MIN });
    for (const m of msgs) store.addMessage(sid, m);
    store.updateTicket(t.id, { demo: true, status: d.status || t.status, firstReplyAt: d.reply ? t0 + 20 * MIN : null });
    t.created = t0; t.updated = d.reply ? t0 + 20 * MIN : t0;
    made.push(t.id);
  }
  store.save();
  return made;
}

function clear() {
  const db = store.db;
  const before = db.tickets.length;
  db.tickets = db.tickets.filter((t) => !t.demo);
  for (const id of Object.keys(db.sessions)) if (id.startsWith('demo_')) delete db.sessions[id];
  store.save();
  return before - db.tickets.length;
}

module.exports = { load, clear };
