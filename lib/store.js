'use strict';
// Saves tickets, chats and the clinic file as JSON on disk. No database needed.
const fs = require('fs');
const path = require('path');

const DIR = process.env.DATA_DIR || path.join(__dirname, '..', 'data');
const STORE = path.join(DIR, 'store.json');
const CLINIC = path.join(DIR, 'clinic.json');
const ORIGINAL = path.join(__dirname, '..', 'data', 'clinic.original.json');

if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
if (!fs.existsSync(CLINIC)) fs.copyFileSync(ORIGINAL, CLINIC);

let db = { seq: 1000, msgSeq: 0, tickets: [], sessions: {} };
try { db = { ...db, ...JSON.parse(fs.readFileSync(STORE, 'utf8')) }; } catch { /* first run */ }

let timer = null;
function save() {
  clearTimeout(timer);
  timer = setTimeout(() => {
    const tmp = STORE + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(db));
    fs.renameSync(tmp, STORE);
  }, 150);
}

// ----- clinic file -----
let clinicCache = null, clinicMtime = 0;
function clinic() {
  const m = fs.statSync(CLINIC).mtimeMs;
  if (!clinicCache || m !== clinicMtime) { clinicCache = JSON.parse(fs.readFileSync(CLINIC, 'utf8')); clinicMtime = m; }
  return clinicCache;
}
function validateClinic(d) {
  const errs = [];
  if (!d || typeof d !== 'object') return ['The clinic data must be a JSON object.'];
  if (!d.clinic || !d.clinic.name) errs.push('Clinic name is missing.');
  if (!d.clinic || !d.clinic.emergency_phone) errs.push('Emergency phone is missing.');
  if (!d.hours || typeof d.hours !== 'object') errs.push('Hours are missing.');
  if (!Array.isArray(d.doctors)) errs.push('Doctors must be a list.');
  else d.doctors.forEach((x, i) => { if (!x.name || !x.days) errs.push(`Doctor ${i + 1} needs a name and days.`); });
  if (!Array.isArray(d.services)) errs.push('Services must be a list.');
  else d.services.forEach((x, i) => { if (!x.name || !x.price) errs.push(`Service ${i + 1} needs a name and a price.`); });
  if (!d.policies || typeof d.policies !== 'object') errs.push('Policies are missing.');
  return errs;
}
function saveClinic(d) {
  const errs = validateClinic(d);
  if (errs.length) return errs;
  d.updated_at = new Date().toISOString();
  fs.writeFileSync(CLINIC, JSON.stringify(d, null, 2));
  clinicCache = null;
  return [];
}
function resetClinic() { fs.copyFileSync(ORIGINAL, CLINIC); clinicCache = null; }

// ----- chats -----
function session(id) {
  if (!db.sessions[id]) db.sessions[id] = { id, created: Date.now(), messages: [], pending: null, contact: {} };
  return db.sessions[id];
}
function addMessage(sessionId, msg) {
  const s = session(sessionId);
  const m = { id: ++db.msgSeq, ts: Date.now(), ...msg };
  s.messages.push(m);
  if (s.messages.length > 200) s.messages.splice(0, s.messages.length - 200);
  save();
  return m;
}

// ----- tickets -----
function createTicket(sessionId, f) {
  const t = {
    id: `T-${++db.seq}`, session: sessionId, status: f.status, type: f.type, question: f.question, lang: f.lang || 'en',
    booking: f.booking || null, contact: f.contact || {}, services: f.services || [], created: Date.now(), updated: Date.now(), firstReplyAt: null,
  };
  db.tickets.push(t);
  save();
  return t;
}
const ticket = (id) => db.tickets.find((t) => t.id === id);
function updateTicket(id, patch) {
  const t = ticket(id);
  if (!t) return null;
  Object.assign(t, patch, { updated: Date.now() });
  save();
  return t;
}

module.exports = { db, save, clinic, saveClinic, resetClinic, validateClinic, session, addMessage, createTicket, ticket, updateTicket, DIR };
