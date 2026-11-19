'use strict';
// Bright Roots Dental front desk. Run: node server.js  (Node 18 or newer)
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

loadEnvFile();
const engine = require('./lib/engine');
const store = require('./lib/store');
const ai = require('./lib/ai');
const { runChecks } = require('./lib/checks');
const demo = require('./lib/demo');

const PORT = +process.env.PORT || 3000;
const STAFF_PIN = process.env.STAFF_PIN || '';
const PUBLIC = path.join(__dirname, 'public');

function loadEnvFile() {
  const f = path.join(__dirname, '.env');
  if (!fs.existsSync(f)) return;
  for (const line of fs.readFileSync(f, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !(m[1] in process.env)) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

// ---------- helpers ----------
const TYPES = { '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'text/javascript', '.svg': 'image/svg+xml', '.json': 'application/json', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json' };
function send(res, code, body, type = 'application/json') {
  res.writeHead(code, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(type === 'application/json' ? JSON.stringify(body) : body);
}
function file(res, name) {
  const p = path.join(PUBLIC, name);
  if (!p.startsWith(PUBLIC) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) return send(res, 404, { error: 'Not found' });
  res.writeHead(200, { 'content-type': TYPES[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-cache' });
  fs.createReadStream(p).pipe(res);
}
function body(req) {
  return new Promise((resolve, reject) => {
    let s = '';
    req.on('data', (c) => { s += c; if (s.length > 200000) { reject(new Error('Too large')); req.destroy(); } });
    req.on('end', () => { try { resolve(s ? JSON.parse(s) : {}); } catch { reject(new Error('Bad JSON')); } });
  });
}
const validSession = (id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{8,64}$/.test(id);
const hits = new Map();
function limited(ip) {
  const now = Date.now(), list = (hits.get(ip) || []).filter((t) => now - t < 60000);
  list.push(now); hits.set(ip, list);
  return list.length > 30;
}
function staffOk(req) {
  if (!STAFF_PIN) return true;
  const got = String(req.headers['x-staff-pin'] || '');
  return got.length === STAFF_PIN.length && crypto.timingSafeEqual(Buffer.from(got), Buffer.from(STAFF_PIN));
}
const clean = (m) => ({ id: m.id, role: m.role, text: m.text, ts: m.ts, source: m.source, kind: m.kind, ticket: m.ticket, card: m.card, call: m.call, map: m.map, quick: m.quick, by: m.by });

// ---------- tickets with age and priority ----------
function ticketView(t, data, now) {
  const s = store.db.sessions[t.session] || { messages: [], contact: {} };
  const open = t.status === 'needs human' || t.status === 'urgent';
  const ageMin = Math.max(0, Math.round((now - t.created) / 60000));
  const workMin = engine.workingMinutes(data, t.created, now);
  const slaMin = t.status === 'urgent' ? 10 : (parseInt(engine.callbackPromise(data), 10) || 2) * 60;
  const used = t.status === 'urgent' ? ageMin : workMin;
  const overdue = open && used >= slaMin;
  let priority = t.status === 'urgent' ? 1 : t.type === 'booking' ? 2 : 3;
  if (overdue && priority > 2) priority = 2; // waited too long: moves up
  if (!open) priority = t.status === 'answered' ? 4 : 5;
  return {
    ...t, contact: { ...(s.contact || {}), ...(t.contact || {}) }, ageMin, workMin, slaMin, overdue, priority,
    slaUsed: open ? Math.min(1, used / slaMin) : 0, messages: s.messages.slice(-14).map(clean),
  };
}
function ticketList() {
  const data = store.clinic(), now = Date.now();
  return store.db.tickets.map((t) => ticketView(t, data, now))
    .sort((a, b) => a.priority - b.priority || (a.priority < 4 ? a.created - b.created : b.updated - a.updated));
}

// ---------- chat ----------
async function handleChat(sessionId, text, prefLang) {
  const isDemo = sessionId.startsWith('demo_');
  const s = store.session(sessionId);
  const data = store.clinic();
  const history = s.messages.slice(-8).map((m) => ({ role: m.role, text: m.text }));
  store.addMessage(sessionId, { role: 'patient', text });
  const r = await engine.reply(text, {
    data, session: s, history, prefLang,
    ai: ai.config() ? ai.ask : null,
    createTicket: (f) => store.createTicket(sessionId, { ...f, demo: isDemo }),
    saveContact: (id, c) => { s.contact = { ...s.contact, ...c }; store.updateTicket(id, { contact: { ...(store.ticket(id) || {}).contact, ...c } }); },
    onAIReject: (why) => { console.log(`[ai] reply rejected: ${why}`); },
    onAIError: (e) => { if (!/No AI key/.test(e.message)) console.log(`[ai] ${e.message}`); },
  });
  const ex = engine.extractContact(text);
  if (ex.phone) s.contact = { ...s.contact, ...ex };
  const m = store.addMessage(sessionId, {
    role: 'bot', text: r.text, source: r.source, kind: r.kind, card: r.card || null, call: r.call || null, map: r.map || null, quick: r.quick || [],
    ticket: r.ticket ? { id: r.ticket.id, status: r.ticket.status } : null,
  });
  store.save();
  return clean(m);
}

// ---------- routes ----------
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const p = url.pathname;
  const ip = req.socket.remoteAddress || '';
  try {
    // pages
    if (req.method === 'GET' && (p === '/' || p === '/index.html')) return file(res, 'index.html');
    if (req.method === 'GET' && (p === '/staff' || p === '/staff/')) return file(res, 'staff.html');
    if (req.method === 'GET' && p.startsWith('/assets/')) return file(res, p.slice(1));

    // ---- patient API ----
    if (req.method === 'GET' && p === '/api/clinic/public') {
      const d = store.clinic(), c = d.clinic || {};
      return send(res, 200, { name: c.name, phone: c.phone, whatsapp: c.whatsapp, emergency_phone: c.emergency_phone, address: c.address, landmark: c.landmark, today: engine.todayStatus(d), quick: engine.QUICK, services: (d.services || []).map((x) => x.name), doctors: (d.doctors || []).map((x) => ({ name: x.name, role: x.role, days: x.days })), ai: ai.info().configured, version: d.updated_at || null });
    }
    if (req.method === 'POST' && p === '/api/chat') {
      if (limited(ip)) return send(res, 429, { error: 'Too many messages. Please wait a minute.' });
      const b = await body(req);
      const text = String(b.text || '').trim().slice(0, 1000);
      if (!validSession(b.session) || !text) return send(res, 400, { error: 'Send a session id and a message.' });
      return send(res, 200, { message: await handleChat(b.session, text, ['en', 'hi', 'te'].includes(b.lang) ? b.lang : 'en') });
    }
    if (req.method === 'GET' && p === '/api/messages') {
      const id = url.searchParams.get('session'), after = +url.searchParams.get('after') || 0;
      if (!validSession(id)) return send(res, 400, { error: 'Bad session' });
      const s = store.db.sessions[id];
      return send(res, 200, { messages: s ? s.messages.filter((m) => m.id > after).map(clean) : [] });
    }
    if (req.method === 'POST' && p === '/api/book') {
      const b = await body(req);
      if (!validSession(b.session)) return send(res, 400, { error: 'Bad session' });
      const d = store.clinic();
      const tm = String(b.time || '').match(/^(\d{1,2}):(\d{2})$/);
      if (!/^\d{4}-\d{2}-\d{2}$/.test(b.date || '') || !tm) return send(res, 400, { error: 'Pick a day and a time.' });
      const min = +tm[1] * 60 + +tm[2];
      const slot = engine.checkSlot(d, b.date, min);
      if (!slot.ok) {
        const dh = engine.dayHours(d, new Date(b.date + 'T00:00:00Z').getUTCDay());
        return send(res, 400, { error: slot.why === 'past' ? 'That time has already passed. Pick a later time.' : `We are not open for bookings then. That day: ${dh ? dh.value : 'Closed'}.` });
      }
      const s = store.session(b.session);
      const contact = { name: String(b.name || '').slice(0, 60), phone: String(b.phone || '').slice(0, 20) };
      s.contact = { ...s.contact, ...contact }; s.pending = null;
      const service = String(b.service || '').slice(0, 80);
      const label = engine.fmtWhen(b.date, min, 'en');
      store.addMessage(b.session, { role: 'patient', text: `Booking request: ${label}${service ? `, ${service}` : ''}` });
      const t = store.createTicket(b.session, { type: 'booking', status: 'needs human', question: `Booking form: ${label}${service ? `, ${service}` : ''}${b.note ? `. Note: ${String(b.note).slice(0, 200)}` : ''}`, booking: { date: b.date, min, label }, contact, services: service ? [service] : [] });
      const cb = engine.callbackPromise(d);
      const text = [`Done! I've sent a booking request for ${label} (ticket ${t.id}). Our team will confirm it on phone or WhatsApp within ${cb}.`, slot.inLunch ? `Please note the lunch break: ${slot.lunchText}.` : null].filter(Boolean).join('\n\n');
      const m = store.addMessage(b.session, { role: 'bot', text, source: 'file', kind: 'booking', ticket: { id: t.id, status: t.status }, quick: [] });
      return send(res, 200, { messages: store.session(b.session).messages.slice(-2).map(clean), last: clean(m) });
    }
    if (req.method === 'POST' && p === '/api/contact') {
      const b = await body(req);
      if (!validSession(b.session)) return send(res, 400, { error: 'Bad session' });
      const phone = String(b.phone || '').trim();
      if (!/^[+\d][\d\s-]{6,18}$/.test(phone)) return send(res, 400, { error: 'Please enter a valid phone number.' });
      const s = store.session(b.session);
      const contact = { name: String(b.name || '').slice(0, 60), phone };
      s.contact = { ...s.contact, ...contact }; s.pending = null;
      const t = store.ticket(b.ticketId);
      if (t && t.session === b.session) store.updateTicket(t.id, { contact: { ...t.contact, ...contact } });
      const m = store.addMessage(b.session, { role: 'bot', text: 'Thank you. We have your details and will call you back.', source: 'file', kind: 'answer', quick: [] });
      return send(res, 200, { last: clean(m) });
    }

    // Demo tickets can be added from the patient page too (they are marked Demo and easy to remove).
    if (req.method === 'POST' && p === '/api/demo/load') { if (limited(ip)) return send(res, 429, { error: 'Please wait a minute.' }); return send(res, 200, { ok: true, tickets: await demo.load() }); }

    // ---- staff API ----
    if (p === '/api/demo/clear' || p.startsWith('/api/staff/') || p.startsWith('/api/tickets') || p === '/api/clinic' || p.startsWith('/api/clinic/') || p === '/api/selftest' || p === '/api/health') {
      if (!staffOk(req)) return send(res, 401, { error: 'Staff PIN needed', pin: true });
    }
    if (req.method === 'POST' && p === '/api/demo/clear') return send(res, 200, { ok: true, removed: demo.clear() });
    if (req.method === 'GET' && p === '/api/health') return send(res, 200, { ok: true, ai: ai.info(), pin: !!STAFF_PIN, tickets: store.db.tickets.length });
    if (req.method === 'GET' && p === '/api/tickets') return send(res, 200, { tickets: ticketList(), ai: ai.info().configured, now: Date.now() });
    let m;
    if (req.method === 'POST' && (m = p.match(/^\/api\/tickets\/(T-\d+)\/reply$/))) {
      const t = store.ticket(m[1]);
      if (!t) return send(res, 404, { error: 'No such ticket' });
      const b = await body(req);
      const text = String(b.text || '').trim().slice(0, 2000);
      if (!text) return send(res, 400, { error: 'Type a reply first.' });
      store.addMessage(t.session, { role: 'staff', text, by: String(b.by || 'Clinic team').slice(0, 40), ticket: { id: t.id } });
      store.updateTicket(t.id, { status: t.status === 'closed' ? 'closed' : 'answered', firstReplyAt: t.firstReplyAt || Date.now() });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/tickets\/(T-\d+)\/status$/))) {
      const t = store.ticket(m[1]);
      if (!t) return send(res, 404, { error: 'No such ticket' });
      const b = await body(req);
      if (!['answered', 'needs human', 'urgent', 'closed'].includes(b.status)) return send(res, 400, { error: 'Unknown status' });
      store.updateTicket(t.id, { status: b.status });
      return send(res, 200, { ok: true });
    }
    if (req.method === 'POST' && (m = p.match(/^\/api\/tickets\/(T-\d+)\/draft$/))) {
      const t = store.ticket(m[1]);
      if (!t) return send(res, 404, { error: 'No such ticket' });
      const d = store.clinic();
      if (t.type === 'booking' && t.booking) {
        return send(res, 200, { text: `Hello${t.contact && t.contact.name ? ' ' + t.contact.name : ''}, your visit at ${d.clinic.name} is confirmed for ${t.booking.label}. Address: ${d.clinic.address} (${d.clinic.landmark}). To cancel or move it, please tell us at least 4 hours before.`, source: 'template' });
      }
      if (ai.config()) {
        try { return send(res, 200, { text: await ai.draft({ question: t.question, data: d, lang: t.lang }), source: 'ai' }); } catch { /* fall through */ }
      }
      const f = engine.matchFacts(engine.norm(t.question), d, engine.detectLang(t.question));
      return send(res, 200, { text: f.found ? f.text : `Hello, thank you for your question. We checked with our team: FILL IN. Please call us on ${d.clinic.phone} if you need anything else.`, source: 'file' });
    }
    if (req.method === 'GET' && p === '/api/clinic') return send(res, 200, { data: store.clinic() });
    if (req.method === 'PUT' && p === '/api/clinic') {
      const b = await body(req);
      const errs = store.saveClinic(b.data);
      return errs.length ? send(res, 400, { error: errs.join(' '), errors: errs }) : send(res, 200, { ok: true, data: store.clinic() });
    }
    if (req.method === 'POST' && p === '/api/clinic/reset') { store.resetClinic(); return send(res, 200, { ok: true, data: store.clinic() }); }
    if (req.method === 'GET' && p === '/api/selftest') {
      const read = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, 'data', f), 'utf8')); } catch { return []; } };
      const useAI = url.searchParams.get('ai') === '1' && ai.config();
      const out = {};
      out.sample = await runChecks(read('sample-questions.json'), store.clinic(), useAI ? ai.ask : null);
      out.extra = await runChecks(read('extra-questions.json'), store.clinic(), useAI ? ai.ask : null);
      return send(res, 200, { mode: useAI ? 'ai' : 'file', ...out });
    }
    return send(res, 404, { error: 'Not found' });
  } catch (e) {
    console.error(e);
    return send(res, 500, { error: 'Something went wrong on the server. Please try again.' });
  }
});

if (require.main === module) {
  server.listen(PORT, () => {
    const a = ai.info();
    console.log(`Front desk running on http://localhost:${PORT}  (staff page: /staff)`);
    console.log(a.configured ? `AI: ${a.provider} (${a.model}). Falls back to the clinic file if it fails.` : 'AI: no key set. Answering from the clinic file.');
  });
}
module.exports = server;
