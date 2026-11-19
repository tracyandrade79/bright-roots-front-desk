'use strict';
// The answer engine. It reads the clinic file on every message, so staff edits
// show up in the very next reply. It works with no AI at all.
// Order of checks: emergency -> "ignore your rules" -> symptoms -> discount ->
// booking -> clinic facts -> not sure (ticket).

const { T, QUICK, DAY_NAMES, DAY_WORDS, tr } = require('./text');

// ---------- small helpers ----------
const IST = 330; // India is UTC+5:30
function istNow(ms = Date.now()) {
  const d = new Date(ms + IST * 60000);
  return { date: d.toISOString().slice(0, 10), dow: d.getUTCDay(), min: d.getUTCHours() * 60 + d.getUTCMinutes() };
}
function addDays(date, n) { const d = new Date(date + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); }
function dowOf(date) { return new Date(date + 'T00:00:00Z').getUTCDay(); }
function istToMs(date, min) { return Date.parse(date + 'T00:00:00Z') + (min - IST) * 60000; }
function fmtTime(min) {
  const h = Math.floor(min / 60), m = min % 60, h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`;
}
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const MONTH_LABEL = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function fmtWhen(date, min, lang = 'en') {
  const d = new Date(date + 'T00:00:00Z');
  const day = (DAY_NAMES[lang] || DAY_NAMES.en)[d.getUTCDay()];
  return `${day} ${d.getUTCDate()} ${MONTH_LABEL[d.getUTCMonth()]}, ${fmtTime(min)}`;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[’‘`]/g, "'").replace(/[“”]/g, '"').replace(/\s+/g, ' ').trim();
}
function escRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
// Whole-word match for English words; plain "contains" for Hindi/Telugu script.
function has(t, term) {
  if (/^[a-z0-9 .'\-%]+$/.test(term)) {
    return new RegExp('(^|[^a-z0-9])' + escRe(term) + '(s|es)?(?=$|[^a-z0-9])').test(t);
  }
  return t.includes(term);
}
function anyOf(t, list) { return list.some((w) => has(t, w)); }
function score(t, list) {
  let s = 0;
  for (const item of list) {
    const [w, wt] = Array.isArray(item) ? item : [item, 1];
    if (has(t, w)) s += wt;
  }
  return s;
}
function detectLang(text) {
  if (/[ఀ-౿]/.test(text)) return 'te';
  if (/[ऀ-ॿ]/.test(text)) return 'hi';
  return 'en';
}
function callbackPromise(data) {
  const rules = (data.bot_rules || []).join(' ');
  const m = rules.match(/within\s+([^,.]*?working hours)/i);
  return m ? m[1].trim() : '2 working hours';
}

// ---------- clinic hours ----------
function parseRanges(value) {
  const out = [];
  const re = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\s*(?:to|-|–)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm)/gi;
  let m;
  const toMin = (h, mm, ap) => { h = +h % 12; if (ap.toLowerCase() === 'pm') h += 12; return h * 60 + (+mm || 0); };
  while ((m = re.exec(value))) out.push([toMin(m[1], m[2], m[3]), toMin(m[4], m[5], m[6])]);
  return out;
}
function daysFromKey(key) {
  const k = key.toLowerCase();
  if (/lunch|holiday/.test(k)) return [];
  if (/daily|every_?day|all_days/.test(k)) return [0, 1, 2, 3, 4, 5, 6];
  if (/weekday/.test(k)) return [1, 2, 3, 4, 5];
  if (/weekend/.test(k)) return [0, 6];
  const full = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const found = [];
  full.forEach((d, i) => { const p = k.indexOf(d.slice(0, 3)); if (p >= 0) found.push([p, i]); });
  found.sort((a, b) => a[0] - b[0]);
  if (found.length === 2 && /_to_|-to-|_till_/.test(k)) {
    const out = []; let i = found[0][1];
    for (let n = 0; n < 7; n++) { out.push(i); if (i === found[1][1]) break; i = (i + 1) % 7; }
    return out;
  }
  return found.map((f) => f[1]);
}
function dayHours(data, dow) {
  const hours = data.hours || {};
  for (const [key, value] of Object.entries(hours)) {
    if (daysFromKey(key).includes(dow)) {
      const v = String(value);
      return { key, value: v, ranges: /^\s*closed/i.test(v) ? [] : parseRanges(v), emergencyOnly: /emergenc/i.test(v) };
    }
  }
  return null;
}
function lunchInfo(data) {
  const hours = data.hours || {};
  const key = Object.keys(hours).find((k) => /lunch/i.test(k));
  if (!key) return null;
  const r = parseRanges(hours[key]);
  return { value: hours[key], range: r[0] || null };
}
function todayStatus(data, ms = Date.now()) {
  const now = istNow(ms);
  const today = dayHours(data, now.dow);
  const lunch = lunchInfo(data);
  const ranges = today ? today.ranges : [];
  const openRange = ranges.find(([a, b]) => now.min >= a && now.min < b);
  let next = null;
  for (let i = 0; i < 8 && !next; i++) {
    const date = addDays(now.date, i), dh = dayHours(data, dowOf(date));
    if (!dh || dh.emergencyOnly) continue;
    const r = dh.ranges.find(([a]) => i > 0 || a > now.min);
    if (r) next = { dow: dowOf(date), inDays: i, min: r[0] };
  }
  return {
    dow: now.dow, nowMin: now.min, day: DAY_NAMES.en[now.dow],
    value: today ? today.value : 'Not listed', ranges, emergencyOnly: !!(today && today.emergencyOnly),
    lunch: lunch && lunch.range, lunchText: lunch && lunch.value,
    open: !!openRange, closesAt: openRange ? fmtTime(openRange[1]) : null,
    inLunch: !!(openRange && lunch && lunch.range && now.min >= lunch.range[0] && now.min < lunch.range[1]),
    next: next && { day: next.inDays === 0 ? 'today' : next.inDays === 1 ? 'tomorrow' : DAY_NAMES.en[next.dow], time: fmtTime(next.min) },
  };
}
// Minutes the clinic was open between two moments (used for "2 working hours").
function workingMinutes(data, fromMs, toMs) {
  let total = 0;
  const start = istNow(fromMs).date;
  for (let i = 0; i < 31; i++) {
    const date = addDays(start, i), dayStart = istToMs(date, 0);
    if (dayStart > toMs) break;
    const dh = dayHours(data, dowOf(date));
    if (!dh || dh.emergencyOnly) continue;
    for (const [a, b] of dh.ranges) {
      const s = Math.max(fromMs, istToMs(date, a)), e = Math.min(toMs, istToMs(date, b));
      if (e > s) total += (e - s) / 60000;
    }
  }
  return Math.round(total);
}

// ---------- safety checks ----------
const RE_EMERGENCY = [
  /(face|neck|cheek|jaw|throat|eye)\w*\s+(is\s+|are\s+|has\s+|got\s+|getting\s+|became\s+)?(very\s+|badly\s+|so\s+)?(swell|swollen)/,
  /(swell|swollen)\w*\s+(up\s+)?(of\s+|on\s+|in\s+|around\s+)?(my\s+|the\s+|his\s+|her\s+)?(face|neck|cheek|jaw|throat)/,
  /(can'?t|cannot|can not|unable to|trouble|difficulty|difficult|hard to|not able to|struggling to)\s+(\w+\s+)?(breath|breathe|breathing|swallow)/,
  /(breathless|short of breath|choking|not breathing)/,
  /bleed\w*\s+(\w+\s+){0,3}(won'?t|will not|doesn'?t|does not|is not|isn'?t|not)\s+stop/,
  /(heavy|lot of|lots of|severe|non-?stop|continuous|uncontrolled)\s+(\w+\s+)?bleed/,
  /bleed\w*\s+(a lot|heavily|badly|non-?stop|too much|so much)/,
  /(accident|fainted|faint|unconscious|knocked out|broken jaw|jaw is broken|high fever)/,
  /(साँस|सांस).{0,20}(नहीं|दिक्कत|तकलीफ|तकलीफ़|मुश्किल)/, /(चेहरा|चेहरे|गर्दन|गला).{0,15}सूज/, /सूज.{0,15}(चेहरा|चेहरे|गर्दन)/,
  /खून.{0,20}(रुक नहीं|नहीं रुक|बहुत)/, /(इमरजेंसी|आपातकाल|आपात)/,
  /(శ్వాస|ఊపిరి).{0,25}(కష్టం|ఆడటం లేదు|ఆడట్లేదు|రావడం లేదు|ఇబ్బంది)/, /(ముఖం|మెడ|దవడ).{0,15}వాపు/, /వాపు.{0,15}(ముఖం|మెడ)/,
  /రక్తం.{0,20}(ఆగడం లేదు|ఆగట్లేదు|ఎక్కువ|ఆగడంలేదు)/, /(అత్యవసర|ఎమర్జెన్సీ)/,
  /saans.{0,15}(nahi|nahin|dikkat|taklif)/, /(chehra|chehre).{0,12}(suj|sooj)/,
];
function isEmergency(t) {
  if (RE_EMERGENCY.some((r) => r.test(t))) {
    // Hindi/Telugu "emergency" words asked as information (number/timing) are not emergencies.
    if (/(इमरजेंसी|ఎమర్జెన్సీ|అత్యవసర|आपातकाल).{0,12}(नंबर|नम्बर|समय|నంబర్|సమయ)/.test(t)) return false;
    return true;
  }
  if (/\b(emergency|urgent|urgently)\b/.test(t) && !/(number|line|contact|phone|hours|timing|time|sunday|holiday|open|charge|fee|cost|price|policy|what is|do you)/.test(t)) return true;
  return false;
}
const RE_INJECTION = [
  /(ignore|forget|disregard|override|bypass|break|skip|drop)\s+(all\s+|your\s+|the\s+|these\s+|those\s+|previous\s+|prior\s+|any\s+|of\s+|my\s+)*(rules?|instructions?|prompts?|guidelines?|polic(y|ies)|restrictions?|programming|limits?)/,
  /(you are now|you're now|act as|pretend (to be|you)|roleplay|role-play|jailbreak|developer mode|dan mode|system prompt|new rules?\s*:|from now on you)/,
  /(नियम|निर्देश).{0,15}(भूल|अनदेखा|तोड़|छोड़|मत मान|बदल)/, /(भूल|अनदेखा).{0,15}(नियम|निर्देश)/,
  /(నియమాలు|నియమాల|రూల్స్).{0,20}(మర్చిపో|పట్టించుకో|వదిలే|మార్చు|బ్రేక్)/,
  /(rules|niyam).{0,12}(bhool|bhul|ignore|chhod|tod)/,
];
const isInjection = (t) => RE_INJECTION.some((r) => r.test(t));
const RE_DISCOUNT = /(discount|coupon|promo|offer code|% ?off|\d+\s*%|percent|concession|cheaper|lower (the |your )?price|reduce (the |your )?(price|cost|fee)|less (price|money)|bargain|negotiat|for free|free of cost|waive|छूट|डिस्काउंट|सस्ता|कम (कर|दाम|कीमत|पैसे)|తగ్గింపు|డిస్కౌంట్|తగ్గించ|kam karo|kam kar do)/;
const isDiscount = (t) => RE_DISCOUNT.test(t);
const MEDICAL_WORDS = [
  'pain', 'painful', 'hurt', 'hurts', 'hurting', 'ache', 'aching', 'toothache', 'painkiller', 'pain killer', 'medicine', 'medicines',
  'medication', 'tablet', 'pill', 'antibiotic', 'paracetamol', 'ibuprofen', 'dolo', 'crocin', 'combiflam', 'swollen', 'swelling',
  'sensitive', 'sensitivity', 'infection', 'infected', 'pus', 'abscess', 'bleeding', 'bleed', 'broken tooth', 'cracked', 'chipped',
  'loose tooth', 'wisdom tooth', 'ulcer', 'bad breath', 'symptom', 'diagnose', 'diagnosis', 'is it normal', 'is this normal', 'fever',
  'numb', 'throbbing', 'dard', 'dawai', 'dawa', 'goli', 'दर्द', 'दवा', 'दवाई', 'गोली', 'सूजन', 'खून', 'నొప్పి', 'మందు', 'మాత్ర', 'వాపు', 'రక్తం',
];
const isMedical = (t) => anyOf(t, MEDICAL_WORDS);

// ---------- booking ----------
const BOOK_WORDS = ['book', 'booking', 'appointment', 'appoint', 'schedule', 'slot', 'reserve', 'can i come', 'i want to come', 'i will come',
  'want to visit', 'अपॉइंटमेंट', 'अपोइंटमेंट', 'बुक', 'అపాయింట్‌మెంట్', 'అపాయింట్మెంట్', 'బుక్'];
const CANCEL_WORDS = ['cancel', 'cancellation', 'reschedule', 'postpone', 'late fee', 'change my appointment', 'move my appointment', 'रद्द', 'కాన్సిల్', 'రద్దు'];
const isBooking = (t) => anyOf(t, BOOK_WORDS) && !anyOf(t, CANCEL_WORDS) && !/(how (do|can|to) i book|how to book|walk[ -]?in|without (an )?(appointment|booking)|बिना अपॉइंटमेंट|లేకుండా)/.test(t);
const isHowToBook = (t) => /(how (do|can|to) i book|how to book|booking process)/.test(t);

function parseWhen(t, nowMs = Date.now()) {
  const now = istNow(nowMs);
  let date = null, dayWord = null, rest = t;
  const take = (re) => { const m = rest.match(re); if (m) rest = rest.replace(m[0], ' '); return m; };
  let m;
  if (take(/day after tomorrow|परसों|ఎల్లుండి|parso/)) date = addDays(now.date, 2);
  else if (take(/\b(tomorrow|tmrw|tmr|kal)\b|कल|రేపు/)) date = addDays(now.date, 1);
  else if (take(/\b(today|tonight|aaj)\b|आज|ఈ ?రోజు/)) date = now.date;
  if (!date && (m = take(/\b(\d{1,2})(?:st|nd|rd|th)?\s*(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/))) date = makeDate(now, +m[1], MONTHS.indexOf(m[2]));
  if (!date && (m = take(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\s+(\d{1,2})(?:st|nd|rd|th)?\b/))) date = makeDate(now, +m[2], MONTHS.indexOf(m[1]));
  if (!date && (m = take(/\b(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?\b/))) date = makeDate(now, +m[1], +m[2] - 1, m[3]);
  if (!date) {
    for (let i = 0; i < 7 && !date; i++) {
      const w = DAY_WORDS[i].find((x) => has(rest, x));
      if (w) { dayWord = i; rest = rest.replace(w, ' '); const ahead = (i - now.dow + 7) % 7; date = addDays(now.date, ahead); }
    }
  }
  // part of day
  let part = null;
  if (/(morning|subah|सुबह|ఉదయం|\bam\b)/.test(rest)) part = 'am';
  if (/(afternoon|dopahar|दोपहर|మధ్యాహ్నం)/.test(rest)) part = 'aft';
  if (/(evening|night|shaam|sham|शाम|रात|సాయంత్రం|రాత్రి)/.test(rest)) part = 'pm';
  if (/\bnoon\b/.test(rest)) part = 'noon';
  let min = null;
  const fix = (h, mm, ap) => {
    h = +h; mm = +mm || 0;
    if (h > 23 || mm > 59) return null;
    if (ap) { h = h % 12; if (/p/.test(ap)) h += 12; }
    else if (h <= 12) {
      if (part === 'pm' || part === 'aft') { if (h < 12) h += 12; }
      else if (part === 'am') { if (h === 12) h = 0; }
      else if (h >= 1 && h <= 8) h += 12;
    }
    return h * 60 + mm;
  };
  if ((m = rest.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*(a\.?m\.?|p\.?m\.?)(?![a-z])/))) min = fix(m[1], m[2], m[3]);
  else if ((m = rest.match(/\b(\d{1,2})[:.](\d{2})\b/))) min = fix(m[1], m[2]);
  else if ((m = rest.match(/(\d{1,2})\s*(baje|बजे|గంటలకు|గంటకు|గంటలు|o'?clock)/))) min = fix(m[1]);
  else if ((m = rest.match(/(?:\bat|@|around|by|सुबह|शाम|दोपहर|ఉదయం|సాయంత్రం|మధ్యాహ్నం|morning|evening|afternoon)\s*(\d{1,2})\b/))) min = fix(m[1]);
  else if (part) min = { am: 600, aft: 900, pm: 1080, noon: 720 }[part];
  // "Saturday" when today is Saturday but the time has passed -> next Saturday
  if (dayWord !== null && date === now.date && min !== null && min <= now.min) date = addDays(date, 7);
  return { date, min };
}
function makeDate(now, d, mon, y) {
  if (mon < 0 || mon > 11 || d < 1 || d > 31) return null;
  let year = y ? (+y < 100 ? 2000 + +y : +y) : +now.date.slice(0, 4);
  let iso = `${year}-${String(mon + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  if (!y && iso < now.date) iso = `${year + 1}${iso.slice(4)}`;
  return iso;
}
function checkSlot(data, date, min, nowMs = Date.now()) {
  if (istToMs(date, min) < nowMs) return { ok: false, why: 'past' };
  const dh = dayHours(data, dowOf(date));
  if (!dh || dh.emergencyOnly || !dh.ranges.some(([a, b]) => min >= a && min < b)) return { ok: false, why: 'outside', hours: dh ? dh.value : 'Closed' };
  const lunch = lunchInfo(data);
  const inLunch = !!(lunch && lunch.range && min >= lunch.range[0] && min < lunch.range[1]);
  return { ok: true, inLunch, lunchText: lunch && lunch.value };
}
const RE_PHONE = /(?:\+?91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/;
function extractContact(text) {
  const out = {};
  const p = text.match(RE_PHONE); if (p) out.phone = p[0].trim();
  const n = text.match(/(?:my name is|i am|i'm|this is|name[:\s]+)\s*([a-z][a-z.]*(?:\s+[a-z][a-z.]*){0,2})/i);
  if (n && !/^(in|not|having|feeling|looking|going|a|an|the)\b/i.test(n[1])) out.name = n[1].replace(/\b\w/g, (c) => c.toUpperCase());
  return out;
}

// ---------- clinic facts (the "simple matching") ----------
const PRICE_WORDS = ['price', 'cost', 'charge', 'fee', 'rate', 'how much', 'kitna', 'kitne', 'daam', 'paisa', 'कितना', 'कितने', 'कितनी', 'दाम', 'कीमत', 'फ़ीस', 'फीस', 'चार्ज', 'ఎంత', 'ధర', 'ఖర్చు', 'ఫీజు'];
const LIST_WORDS = ['price list', 'all prices', 'your prices', 'services', 'treatments', 'what do you offer', 'what do you do', 'rate card', 'menu',
  'इलाज', 'सेवाएँ', 'चికిత్స', 'చికిత్స', 'సేవలు', 'what are your prices', 'charges'];
const SERVICE_SYNONYMS = [
  [/root canal/i, ['root canal', 'rct', 'root-canal', 'रूट कैनाल', 'रूट केनाल', 'రూట్ కెనాల్', 'రూట్ కెనాల్']],
  [/clean|scal|polish/i, ['cleaning', 'clean', 'scaling', 'polishing', 'polish', 'safai', 'सफाई', 'स्केलिंग', 'క్లీనింగ్', 'శుభ్రం']],
  [/fill/i, ['filling', 'fillings', 'cavity filling', 'फिलिंग', 'ఫిల్లింగ్']],
  [/whiten/i, ['whitening', 'whiten', 'bleaching', 'bleach', 'teeth white', 'व्हाइटनिंग', 'దంతాలు తెల్ల', 'వైట్నింగ్']],
  [/brace/i, ['braces', 'brace', 'metal braces', 'ब्रेसेस', 'ब्रेसिज़', 'బ్రేసెస్', 'క్లిప్స్']],
  [/implant/i, ['implant', 'implants', 'इम्प्लांट', 'इंप्लांट', 'ఇంప్లాంట్']],
  [/x-?ray/i, ['xray', 'x-ray', 'x ray', 'एक्स-रे', 'एक्सरे', 'एक्स रे', 'ఎక్స్-రే', 'ఎక్స్‌రే', 'ఎక్స్ రే']],
  [/consult/i, ['consultation', 'consult', 'checkup', 'check-up', 'check up', 'doctor fee', 'visit fee', 'परामर्श', 'चेकअप', 'कंसल्टेशन', 'కన్సల్టేషన్', 'చెకప్']],
];
function serviceTerms(name) {
  const terms = [];
  for (const [re, words] of SERVICE_SYNONYMS) if (re.test(name)) terms.push(...words);
  if (!terms.length) { // a service staff added: match its main words
    norm(name).replace(/\(.*?\)/g, ' ').split(/[^a-z0-9ऀ-౿-]+/)
      .filter((w) => w.length > 3 && !['teeth', 'tooth', 'dental', 'single', 'treatment', 'with', 'and'].includes(w)).forEach((w) => terms.push(w));
  }
  return terms;
}
function matchServices(t, data) {
  return (data.services || []).filter((s) => anyOf(t, serviceTerms(s.name)));
}
function serviceLine(s, lang = 'en') {
  const t = (x) => tr(lang, x).text;
  const end = lang === 'hi' ? '।' : '.';
  return [`${t(s.name)}: ${t(s.price)}`, s.duration && `(${t(s.duration)})`].filter(Boolean).join(' ') + (s.note ? `${end} ${t(s.note)}${end}` : end);
}
const INSURERS = ['star health', 'niva bupa', 'max bupa', 'hdfc ergo', 'icici lombard', 'care health', 'bajaj allianz', 'tata aig', 'new india',
  'united india', 'oriental', 'national insurance', 'aditya birla', 'manipal cigna', 'sbi general', 'reliance general', 'religare', 'cholamandalam',
  'iffco tokio', 'liberty', 'digit', 'acko', 'future generali', 'universal sompo', 'kotak', 'galaxy health', 'cghs', 'echs', 'esi'];

function doctorTokens(d) { return norm(d.name).replace(/^dr\.?\s*/, '').split(/\s+/).filter((w) => w.length > 2); }

const INTENTS = [
  {
    id: 'hours',
    words: ['time', 'timing', 'open', 'opening', 'close', 'closing', 'hours', ['when', 0.5], 'lunch', 'holiday', 'working days', 'weekend',
      ['today', 0.5], ['tomorrow', 0.5], 'khulta', 'khula', 'baje', 'samay', 'समय', 'खुल', 'बंद', 'टाइम', 'సమయం', 'సమయాలు', 'తెరిచ', 'మూసి', 'టైమ్', 'टाइमिंग', 'बजे', 'ఎన్ని గంటలకు'],
    extra: (t) => (DAY_WORDS.some((ws) => anyOf(t, ws)) ? 1 : 0),
    answer(t, data, L, lang) {
      const days = []; DAY_WORDS.forEach((ws, i) => { if (anyOf(t, ws)) days.push(i); });
      const now = istNow();
      if (/\b(today|aaj|now)\b|आज|ఈ ?రోజు/.test(t)) days.push(now.dow);
      if (/\b(tomorrow|kal)\b|कल|రేపు/.test(t)) days.push((now.dow + 1) % 7);
      const hours = data.hours || {}, lines = [], facts = [];
      const lunch = Object.keys(hours).find((k) => /lunch/i.test(k));
      const hol = Object.keys(hours).find((k) => /holiday/i.test(k));
      if (days.length) {
        [...new Set(days)].forEach((d) => { const dh = dayHours(data, d); if (dh) { lines.push(`${DAY_NAMES[lang][d]}: ${tr(lang, dh.value).text}`); facts.push(dh.value); } });
        if (lunch && days.some((d) => { const dh = dayHours(data, d); return dh && !dh.emergencyOnly && dh.ranges.length; })) lines.push(`${L.lunch}: ${tr(lang, hours[lunch]).text}`);
      } else if (lunch && /lunch|लंच|లంచ్/.test(t) && !/holiday|छुट्टी|సెలవు/.test(t)) {
        lines.push(`${L.lunch}: ${tr(lang, hours[lunch]).text}`); facts.push(hours[lunch]);
      } else if (hol && /holiday|छुट्टी|సెలవు/.test(t)) {
        lines.push(`${L.holidays}: ${tr(lang, hours[hol]).text}`); facts.push(hours[hol]);
      } else {
        for (const [k, v] of Object.entries(hours)) {
          if (k === lunch) lines.push(`${L.lunch}: ${tr(lang, v).text}`);
          else if (k === hol) lines.push(`${L.holidays}: ${tr(lang, v).text}`);
          else lines.push(`${prettyKey(k, lang)}: ${tr(lang, v).text}`);
          facts.push(v);
        }
      }
      if (/holiday|छुट्टी|సెలవు/.test(t) && hol && days.length) lines.push(`${L.holidays}: ${tr(lang, hours[hol]).text}`);
      if (!lines.length) return null;
      return { text: `${L.hoursFor}\n${lines.join('\n')}`, facts: facts.slice(0, 2) };
    },
  },
  {
    id: 'services',
    words: PRICE_WORDS.concat(LIST_WORDS),
    extra: (t, data) => matchServices(t, data).length * 2,
    answer(t, data, L, lang) {
      const found = matchServices(t, data);
      if (found.length) return { text: found.map((x) => serviceLine(x, lang)).join('\n'), facts: found.map((s) => s.price) };
      if (anyOf(t, LIST_WORDS) || /^(prices?|rates?|charges|fees)\??$/.test(t)) {
        return { text: `${L.prices}\n${(data.services || []).map((s) => `${tr(lang, s.name).text}: ${tr(lang, s.price).text}`).join('\n')}`, facts: [] };
      }
      return null; // asked a price for something we don't list -> not sure
    },
  },
  {
    id: 'doctors',
    words: ['doctor', 'doctors', 'dr', 'dentist', 'specialist', 'orthodontist', 'surgeon', ['who', 0.5], 'डॉक्टर', 'डाक्टर', 'దంత వైద్యు', 'డాక్టర్', 'డాక్టర్లు'],
    kidWords: ['child', 'children', 'kid', 'kids', 'son', 'daughter', 'baby', 'paediatric', 'pediatric', 'toddler', 'बच्चा', 'बच्चे', 'बच्चों', 'बेटा', 'बेटी', 'पिल्ल', 'పిల్ల', 'పిల్లల', 'పిల్లలు', 'bacche', 'bachche', 'baccha'],
    extra(t, data) {
      let s = anyOf(t, this.kidWords) ? 1.5 : 0;
      if ((data.doctors || []).some((d) => anyOf(t, doctorTokens(d)))) s += 2;
      if (/\b(who|which doctor|whom)\b|कौन|ఎవరు|ఏ డాక్టర్/.test(t) && (data.doctors || []).some((d) => norm(d.role).split(/[^a-z]+/).some((w) => w.length > 4 && has(t, w)))) s += 1.5;
      return s;
    },
    answer(t, data, L) {
      const docs = data.doctors || [];
      const named = docs.filter((d) => anyOf(t, doctorTokens(d)));
      const unknownDr = t.match(/\b(?:dr\.?|doctor)\s+([a-z]{3,})/);
      if (!named.length && unknownDr && !['who', 'for', 'sees', 'see', 'available', 'is', 'on', 'that', 'treats', 'does', 'and'].includes(unknownDr[1])) return null;
      if (anyOf(t, this.kidWords)) {
        const kid = docs.find((d) => /child|paediatric|pediatric|kid/i.test(d.role));
        if (!kid) return null;
        const pol = (data.policies || {}).children;
        return { text: [L.kids(kid), pol && L.policy(pol)].filter(Boolean).join('\n'), facts: [kid.name, kid.days] };
      }
      if (named.length) return { text: named.map(L.doctorLine).join('\n'), facts: named.map((d) => d.days) };
      // "who does braces?" -> the doctor whose role mentions it
      const byRole = docs.filter((d) => norm(d.role).split(/[^a-z]+/).some((w) => w.length > 4 && has(t, w)));
      if (byRole.length && byRole.length < docs.length) return { text: byRole.map(L.doctorLine).join('\n'), facts: byRole.map((d) => d.name) };
      return { text: `${L.doctors}\n${docs.map(L.doctorLine).join('\n')}`, facts: [] };
    },
  },
  {
    id: 'insurance',
    words: [['insurance', 2], 'insurer', 'cashless', 'claim', 'mediclaim', 'policy card', 'tpa', ['बीमा', 2], 'इंश्योरेंस', ['ఇన్సూరెన్స్', 2], ['బీమా', 2], 'కాష్‌లెస్'],
    extra: (t) => (anyOf(t, INSURERS) ? 2 : 0),
    answer(t, data, L) {
      const pol = (data.policies || {}).insurance;
      if (!pol) return null;
      const m = pol.match(/cashless with ([^.]+)\./i);
      const cashless = m ? m[1].split(/,|\band\b/).map((s) => s.trim()).filter(Boolean) : [];
      const asked = INSURERS.concat(cashless.map(norm)).find((n) => has(t, n));
      const lead = [];
      if (asked) {
        const hit = cashless.find((c) => norm(c) === asked || norm(c).includes(asked) || asked.includes(norm(c)));
        lead.push(hit ? L.insYes(hit) : L.insNo(asked.replace(/\b\w/g, (c) => c.toUpperCase()).replace(/\b(Hdfc|Icici|Sbi|Aig|Cghs|Echs|Esi|Iffco)\b/g, (w) => w.toUpperCase())));
      }
      return { text: [...lead, L.policy(pol)].join('\n'), facts: ['cashless'] };
    },
  },
  {
    id: 'location',
    words: ['where', 'address', 'location', 'located', 'directions', 'direction', 'reach', 'landmark', 'map', 'route', 'kahan', 'kaha', 'कहाँ', 'कहां', 'पता', 'ఎక్కడ', 'చిరునామా', 'అడ్రస్'],
    answer(t, data, L) {
      const c = data.clinic || {};
      if (!c.address) return null;
      return { text: L.address(c), facts: [c.address.split(',')[0]], map: c.address };
    },
  },
  {
    id: 'parking', words: [['parking', 2], ['park', 2], 'car', 'bike', 'vehicle', ['पार्किंग', 2], ['పార్కింగ్', 2]],
    answer(t, data, L) { const p = (data.clinic || {}).parking; return p ? { text: L.parking(p), facts: [] } : null; },
  },
  {
    id: 'contact', words: ['phone', 'number', 'call', 'contact', 'whatsapp', 'mobile', 'फोन', 'फ़ोन', 'नंबर', 'नम्बर', 'కాల్', 'ఫోన్', 'నంబర్'],
    answer(t, data, L) { const c = data.clinic || {}; return { text: L.contact(c), facts: [c.phone] }; },
  },
  {
    id: 'languages', words: ['language', 'languages', 'speak', 'भाषा', 'భాష', 'భాషలు'],
    answer(t, data, L) { const l = (data.clinic || {}).languages; return l ? { text: L.languages(l.join(', ')), facts: [] } : null; },
  },
  { id: 'payment', policy: 'payment', words: [['pay', 1], 'payment', 'upi', 'gpay', 'google pay', 'phonepe', 'paytm', 'card', 'cash', 'credit', 'debit', 'भुगतान', 'पेमेंट', 'చెల్లింపు', 'పేమెంట్'] },
  { id: 'emi', policy: 'emi', words: [['emi', 2], 'instalment', 'installment', 'loan', 'finance', 'monthly', 'किस्त', 'ईएमआई', 'వాయిదా'] },
  { id: 'walk_ins', policy: 'walk_ins', words: [['walk in', 2], ['walk-in', 2], ['walkin', 2], ['without appointment', 2], ['without booking', 2], 'बिना अपॉइंटमेंट', 'అపాయింట్‌మెంట్ లేకుండా'] },
  { id: 'appointments', policy: 'appointments', words: CANCEL_WORDS.map((w) => [w, 2]).concat([['how do i book', 2], ['how to book', 2], ['how can i book', 2]]) },
  { id: 'first_visit', policy: 'first_visit', words: [['first visit', 2], ['first time', 2], 'bring', ['new patient', 2], 'पहली बार', 'మొదటిసారి'] },
  { id: 'sterilisation', policy: 'sterilisation', words: [['steril', 2], 'sterile', 'sterilise', 'sterilize', 'sterilised', 'sterilized', 'hygiene', 'hygienic', 'autoclave', 'instruments', 'safe', 'साफ़-सफ़ाई', 'स्टेरिलाइज़', 'పరిశుభ్రత'] },
];
function prettyKey(k, lang) {
  if (lang === 'en') return k.replace(/_/g, ' ').replace(/\b(mon|tue|wed|thu|fri|sat|sun)\w*/g, (w) => w[0].toUpperCase() + w.slice(1)).replace(/^\w/, (c) => c.toUpperCase());
  const ds = daysFromKey(k);
  if (ds.length > 1) return `${DAY_NAMES[lang][ds[0]]} - ${DAY_NAMES[lang][ds[ds.length - 1]]}`;
  if (ds.length === 1) return DAY_NAMES[lang][ds[0]];
  return k.replace(/_/g, ' ');
}
const POLICY_LABEL = { payment: 'Payment', emi: 'EMI', walk_ins: 'Walk-ins', appointments: 'Booking and cancelling', first_visit: 'Your first visit', sterilisation: 'Hygiene' };
function policyAnswer(intent, data, L, lang) {
  const p = (data.policies || {})[intent.policy];
  if (!p) return null;
  return { text: lang === 'en' ? `${POLICY_LABEL[intent.policy] || intent.policy}: ${p}` : L.policy(p), facts: [] };
}

// Returns the clinic-file answer for a question, or null if nothing matches.
function matchFacts(t, data, lang) {
  const L = T[lang];
  const scored = INTENTS.map((it) => ({ it, s: score(t, it.words) + (it.extra ? it.extra(t, data) : 0) }))
    .filter((x) => x.s >= 1).sort((a, b) => b.s - a.s);
  // Hours words like "when" + a day name are weak when a doctor is named.
  const parts = [], facts = [], used = [];
  let unknown = false, map = null;
  for (const { it, s } of scored.slice(0, 3)) {
    if (it.id === 'contact' && used.length) continue; // "call" etc. inside another question
    if (it.id === 'hours' && used.includes('doctors') && s < 2) continue;
    const a = it.policy ? policyAnswer(it, data, L, lang) : it.answer(t, data, L, lang);
    if (!a) { if (['services', 'doctors'].includes(it.id) && (s >= 2 || it === scored[0].it)) unknown = true; continue; }
    parts.push(a.text); facts.push(...a.facts); used.push(it.id); if (a.map) map = a.map;
  }
  if (unknown && !used.includes('services') && !used.includes('doctors')) return { found: false };
  if (!parts.length) return { found: false };
  return { found: true, text: parts.join('\n\n'), facts, intents: used, top: scored[0].s, map };
}

// ---------- the reply ----------
// ctx: { data, session, createTicket(fields) -> ticket, ai(opts) -> {status, reply} | throws, nowMs }
async function reply(rawText, ctx) {
  const data = ctx.data;
  const text = String(rawText || '').slice(0, 1000);
  const t = norm(text);
  let lang = detectLang(text);
  if (lang === 'en' && (ctx.prefLang === 'hi' || ctx.prefLang === 'te')) lang = ctx.prefLang; // patient picked Hindi/Telugu
  const L = T[lang];
  const c = data.clinic || {};
  const cb = callbackPromise(data);
  const session = ctx.session || {};
  const out = (o) => ({ lang, source: 'file', quick: QUICK[lang], ...o });

  if (!t) return out({ kind: 'answer', text: L.greeting(c.name || 'our clinic') });

  // 1. Emergency: number first, urgent ticket.
  if (isEmergency(t)) {
    const tk = ctx.createTicket({ type: 'emergency', status: 'urgent', question: text, lang });
    return out({ kind: 'urgent', text: L.emergency(c.emergency_phone, data.emergency_rules || '', tk.id), ticket: tk, call: c.emergency_phone, quick: [] });
  }
  // 2. "Ignore your rules" and similar.
  if (isInjection(t)) {
    return out({ kind: 'refuse', text: [L.refuse, isDiscount(t) ? L.discount : null].filter(Boolean).join(' ') });
  }
  // 3. Pending contact details for an open ticket.
  if (session.pending && session.pending.type === 'contact') {
    const ct = extractContact(text);
    if (ct.phone) {
      if (!ct.name) { const rest = text.replace(RE_PHONE, '').replace(/[^a-zA-Zऀ-౿ ]/g, ' ').trim(); if (rest && rest.split(/\s+/).length <= 4) ct.name = rest; }
      ctx.saveContact && ctx.saveContact(session.pending.ticketId, ct);
      session.pending = null;
      return out({ kind: 'answer', text: L.contactSaved });
    }
  }
  const medical = isMedical(t), discount = isDiscount(t);
  const prefix = [medical ? L.medical(c.phone) : null, discount ? L.discount : null].filter(Boolean);

  // 4. Booking (new request, or a day/time sent after we asked for one).
  const pendingBooking = session.pending && session.pending.type === 'booking';
  const when = parseWhen(t, ctx.nowMs);
  if (isBooking(t) || (pendingBooking && (when.date || when.min !== null))) {
    let { date, min } = when;
    if (pendingBooking) { date = date || session.pending.date || null; if (min === null) min = session.pending.min ?? null; }
    const services = matchServices(t, data).map((s) => s.name);
    const contact = { ...(session.contact || {}), ...extractContact(text) };
    let assumed = false;
    if (min !== null && !date) { // time only: today if still ahead, else tomorrow
      const now = istNow(ctx.nowMs); date = min > now.min + 30 ? now.date : addDays(now.date, 1); assumed = true;
    }
    if (!date || min === null) {
      session.pending = { type: 'booking', date, min, services };
      const ask = date ? L.bookAskTime(`${DAY_NAMES[lang][dowOf(date)]}`) : L.bookAsk;
      const pol = (data.policies || {}).appointments;
      return out({ kind: 'booking', text: [...prefix, ask, !date && pol ? L.policy(pol) : null].filter(Boolean).join('\n\n'), card: 'booking_form', quick: [] });
    }
    const slot = checkSlot(data, date, min, ctx.nowMs);
    if (!slot.ok) {
      session.pending = { type: 'booking', date: null, min: null, services };
      const msg = slot.why === 'past' ? L.bookPast : L.bookOutside(DAY_NAMES[lang][dowOf(date)], slot.hours);
      return out({ kind: 'booking', text: [...prefix, msg].join('\n\n'), card: 'booking_form', quick: [] });
    }
    session.pending = null;
    const label = fmtWhen(date, min, lang);
    const tk = ctx.createTicket({ type: 'booking', status: 'needs human', question: text, lang, booking: { date, min, label: fmtWhen(date, min, 'en') }, contact, services });
    const lines = [...prefix, L.bookDone(label, tk.id, cb)];
    if (assumed) lines.push(L.bookAssumed(label));
    if (slot.inLunch) lines.push(L.lunchNote(slot.lunchText));
    let card = null;
    if (!contact.phone) { lines.push(L.bookNeedPhone); card = 'contact_form'; session.pending = { type: 'contact', ticketId: tk.id }; }
    return out({ kind: 'booking', text: lines.join('\n\n'), ticket: tk, card, quick: [] });
  }
  if (pendingBooking) session.pending = null;
  if (isHowToBook(t)) {
    const pol = (data.policies || {}).appointments;
    return out({ kind: 'answer', text: [pol && L.policy(pol), L.bookAsk].filter(Boolean).join('\n\n'), card: 'booking_form', quick: [] });
  }

  // 5. Clinic facts.
  const facts = matchFacts(t, data, lang);
  if (medical) {
    // Symptoms: no advice. Add plain clinic facts if they asked for any (e.g. a price).
    const extra = facts.found ? facts.text : null;
    return out({ kind: 'no_advice', text: [...prefix, extra].filter(Boolean).join('\n\n'), quick: [{ label: lang === 'hi' ? 'अपॉइंटमेंट बुक करें' : lang === 'te' ? 'అపాయింట్‌మెంట్ బుక్ చేయండి' : 'Book a visit', send: QUICK[lang][2].send }] });
  }
  if (discount && !facts.found) return out({ kind: 'refuse', text: prefix.join('\n\n') });

  // Greetings and thanks.
  const words = t.split(' ').length;
  if (!facts.found && words <= 5) {
    if (/\b(thanks|thank you|thx|ok thanks)\b|धन्यवाद|शुक्रिया|ధన్యవాదాలు|థాంక్స్/.test(t)) return out({ kind: 'answer', text: L.thanks });
    if (/\b(hi|hello|hey|hii|namaste|namaskar|good (morning|afternoon|evening))\b|नमस्ते|नमस्कार|నమస్తే|నమస్కారం|హలో/.test(t)) return out({ kind: 'answer', text: L.greeting(c.name || 'our clinic') });
  }

  // 6. Try the AI for a warmer reply; keep it only if it passes the fact check.
  // "Do you offer X?" where X is not in the file at all: a person must answer, not the AI.
  if (!facts.found && offersUnknown(t, data)) return notSure();
  if (ctx.ai && !discount) {
    try {
      const ai = await ctx.ai({ question: text, lang, data, history: ctx.history || [] });
      const verdict = checkAI(ai, { data, question: text, facts, lang });
      if (verdict.ok && ai.status === 'answered') return out({ kind: 'answer', text: ai.reply, source: 'ai', map: facts.map || null });
      if (verdict.ok && ai.status === 'not_in_file' && !(facts.found && facts.top >= 2)) return notSure();
      ctx.onAIReject && ctx.onAIReject(verdict.why || 'disagreed with clinic file');
    } catch (e) { ctx.onAIError && ctx.onAIError(e); }
  }
  if (facts.found) return out({ kind: 'answer', text: [...prefix, facts.text].join('\n\n'), map: facts.map || null });
  return notSure();

  function notSure() {
    const tk = ctx.createTicket({ type: 'question', status: 'needs human', question: text, lang, contact: session.contact || {} });
    const hasPhone = session.contact && session.contact.phone;
    if (!hasPhone) session.pending = { type: 'contact', ticketId: tk.id };
    return out({ kind: 'ticket', text: [L.notSure(tk.id, cb), hasPhone ? null : L.askContact].filter(Boolean).join(' '), ticket: tk, card: hasPhone ? null : 'contact_form' });
  }
}

// ---------- "do you offer something we never mention?" ----------
const COMMON = new Set(('about after again also always any anything appointment available back before being bring call can clinic come could day days ' +
  'dental dentist doctor doctors does doing done during each even every from give have help here home into just know like look make many more ' +
  'most much need offer offers only open other over people please price prices provide really should some take teeth than that their them then ' +
  'there these they this those time today tomorrow tooth treat treatment treatments very want week well what when where which while will with ' +
  'would your yours you\'re patient patients service services hospital kind type sort perform performs done also also cost costs charge fees').split(' '));
function offersUnknown(t, data) {
  const dr = t.match(/\b(?:dr\.?|doctor)\s+([a-z]{3,})/);
  if (dr && !['who', 'for', 'sees', 'see', 'available', 'is', 'on', 'that', 'treats', 'does', 'and', 'fee', 'fees', 'charges', 'timing', 'timings', 'name', 'names', 'there'].includes(dr[1]) && !norm(JSON.stringify(data.doctors || [])).includes(dr[1])) return true;
  if (!/\b(do|does|can|will) (you|they|the clinic|your clinic|dr\.? ?\w+) (do|offer|provide|have|accept|take|treat|perform|give|sell|fix|use|support|work with)\b|\b(how much|price|cost|charges?) (of|for|is|are|does)\b/.test(t)) return false;
  const file = norm(JSON.stringify(data));
  return t.split(/[^a-z]+/).some((w) => w.length >= 4 && !COMMON.has(w) && !file.includes(w.replace(/(es|s)$/, '')));
}

// ---------- AI fact check ----------
// The AI reply is kept only if every number in it is in the clinic file (or the
// question), it has the key facts our own matcher found, and it gives no
// medicine advice or discount.
function numbersIn(s) { return (String(s).match(/\d[\d,]*/g) || []).map((n) => n.replace(/,/g, '').replace(/^0+(?=\d)/, '')); }
function keywords(text) {
  return [...new Set(norm(text).split(/[^a-z]+/).filter((w) => w.length >= 5 && !COMMON.has(w)))];
}
function checkAI(ai, { data, question, facts, lang }) {
  if (!ai || typeof ai.reply !== 'string' || !['answered', 'not_in_file'].includes(ai.status)) return { ok: false, why: 'bad format' };
  if (ai.status === 'not_in_file') return { ok: true };
  const reply = ai.reply;
  if (!reply.trim() || reply.length > 1200) return { ok: false, why: 'empty or too long' };
  const allowed = new Set([...numbersIn(JSON.stringify(data)), ...numbersIn(question)]);
  const bad = numbersIn(reply).filter((n) => !allowed.has(n));
  if (bad.length) return { ok: false, why: `number not in clinic file: ${bad.join(', ')}` };
  if (/\b(take|use|try|have)\s+(a\s+|an\s+|some\s+)?(paracetamol|ibuprofen|painkiller|antibiotic|dolo|crocin|combiflam|medicine)/i.test(reply)) return { ok: false, why: 'medicine advice' };
  if (/\d+\s*%|discount\s+(of|is|for you)|special price/i.test(reply)) return { ok: false, why: 'discount' };
  if (facts && facts.found) {
    const r = norm(reply), rNums = new Set(numbersIn(reply));
    for (const f of facts.facts) {
      const nums = numbersIn(f);
      const ok = nums.length ? nums.every((n) => rNums.has(n)) : r.includes(norm(f).replace(/^dr\.?\s*/, '').split(' ')[0]);
      if (!ok) return { ok: false, why: `missing fact: ${f}` };
    }
    if (lang === 'en') { // the AI must say what the clinic file says, not something vague
      const kw = keywords(facts.text);
      const hit = kw.filter((w) => r.includes(w.replace(/(es|s)$/, ''))).length;
      if (kw.length && hit < Math.max(1, Math.ceil(kw.length * 0.4))) return { ok: false, why: 'too vague compared with the clinic file' };
    }
  }
  return { ok: true };
}

module.exports = { reply, detectLang, todayStatus, workingMinutes, dayHours, parseWhen, checkSlot, fmtWhen, fmtTime, istNow, matchFacts, norm, checkAI, callbackPromise, extractContact, QUICK };
