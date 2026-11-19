'use strict';
// Turns any leftover English in a Hindi or Telugu reply into that language:
// names, places, times (9:00 am -> सुबह ९:००), rupees (Rs 400 -> ₹४००) and digits.

const NAMES = {
  hi: {
    'Bright Roots Dental': 'ब्राइट रूट्स डेंटल', 'Bright Roots': 'ब्राइट रूट्स',
    'Dr. Meera Nair': 'डॉ. मीरा नायर', 'Dr. Imran Qureshi': 'डॉ. इमरान क़ुरैशी', 'Dr. Sneha Rao': 'डॉ. स्नेहा राव',
    'Star Health': 'स्टार हेल्थ', 'Niva Bupa': 'निवा बूपा', 'Bajaj Allianz': 'बजाज आलियांज़', 'HDFC Ergo': 'एचडीएफ़सी अर्गो',
    'ICICI Lombard': 'आईसीआईसीआई लोम्बार्ड', 'Care Health': 'केयर हेल्थ', 'Tata AIG': 'टाटा एआईजी', 'Max Bupa': 'मैक्स बूपा',
    'Green Leaf Cafe': 'ग्रीन लीफ़ कैफ़े', 'Road No.': 'रोड नंबर', 'Plot': 'प्लॉट', 'Banjara Hills': 'बंजारा हिल्स', 'Hyderabad': 'हैदराबाद',
    'WhatsApp': 'व्हाट्सऐप', 'UPI': 'यूपीआई', 'EMI': 'ईएमआई', 'Clinic team': 'क्लिनिक टीम', 'Dr.': 'डॉ.',
  },
  te: {
    'Bright Roots Dental': 'బ్రైట్ రూట్స్ డెంటల్', 'Bright Roots': 'బ్రైట్ రూట్స్',
    'Dr. Meera Nair': 'డా. మీరా నాయర్', 'Dr. Imran Qureshi': 'డా. ఇమ్రాన్ ఖురేషీ', 'Dr. Sneha Rao': 'డా. స్నేహా రావు',
    'Star Health': 'స్టార్ హెల్త్', 'Niva Bupa': 'నివా బూపా', 'Bajaj Allianz': 'బజాజ్ అలియాంజ్', 'HDFC Ergo': 'హెచ్‌డీఎఫ్‌సీ ఎర్గో',
    'ICICI Lombard': 'ఐసీఐసీఐ లొంబార్డ్', 'Care Health': 'కేర్ హెల్త్', 'Tata AIG': 'టాటా ఏఐజీ', 'Max Bupa': 'మ్యాక్స్ బూపా',
    'Green Leaf Cafe': 'గ్రీన్ లీఫ్ కేఫ్', 'Road No.': 'రోడ్ నం.', 'Plot': 'ప్లాట్', 'Banjara Hills': 'బంజారా హిల్స్', 'Hyderabad': 'హైదరాబాద్',
    'WhatsApp': 'వాట్సాప్', 'UPI': 'యూపీఐ', 'EMI': 'ఈఎంఐ', 'Clinic team': 'క్లినిక్ టీమ్', 'Dr.': 'డా.',
  },
};
const DIGITS = { hi: '०१२३४५६७८९', te: '౦౧౨౩౪౫౬౭౮౯' };
const PART = {
  hi: (h) => (h >= 4 && h < 12 ? 'सुबह' : h >= 12 && h < 16 ? 'दोपहर' : h >= 16 && h < 20 ? 'शाम' : 'रात'),
  te: (h) => (h >= 4 && h < 12 ? 'ఉదయం' : h >= 12 && h < 16 ? 'మధ్యాహ్నం' : h >= 16 && h < 20 ? 'సాయంత్రం' : 'రాత్రి'),
};
const MONTHS = {
  hi: ['जनवरी', 'फ़रवरी', 'मार्च', 'अप्रैल', 'मई', 'जून', 'जुलाई', 'अगस्त', 'सितंबर', 'अक्टूबर', 'नवंबर', 'दिसंबर'],
  te: ['జనవరి', 'ఫిబ్రవరి', 'మార్చి', 'ఏప్రిల్', 'మే', 'జూన్', 'జూలై', 'ఆగస్టు', 'సెప్టెంబర్', 'అక్టోబర్', 'నవంబర్', 'డిసెంబర్'],
};
const sorted = {};
for (const l of Object.keys(NAMES)) sorted[l] = Object.keys(NAMES[l]).sort((a, b) => b.length - a.length);

function digits(s, lang) {
  const d = DIGITS[lang];
  return d ? String(s).replace(/[0-9]/g, (c) => d[+c]) : String(s);
}
function toAscii(s) {
  return String(s).replace(/[०-९]/g, (c) => String(c.charCodeAt(0) - 0x966)).replace(/[౦-౯]/g, (c) => String(c.charCodeAt(0) - 0xc66));
}
function localize(text, lang) {
  if (!NAMES[lang]) return text;
  let s = String(text);
  for (const k of sorted[lang]) s = s.split(k).join(NAMES[lang][k]);
  s = s.replace(/\bRs\.?\s?(?=\d)/g, '₹');
  s = s.replace(/\b(\d{1,2}):(\d{2})\s*([ap])\.?m\.?/gi, (m, h, mm, ap) => {
    let H = +h % 12; if (ap.toLowerCase() === 'p') H += 12;
    return `${PART[lang](H)} ${h}:${mm}`;
  });
  s = s.replace(/\bT-(\d+)/g, '$1');
  return digits(s, lang);
}
const hasLatin = (s) => /[A-Za-z]/.test(s);

module.exports = { localize, digits, toAscii, hasLatin, NAMES, MONTHS };
