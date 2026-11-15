'use strict';
// Words and reply sentences in English, Hindi and Telugu.
// Facts (prices, times, names, phone numbers) are never written here.
// They always come from the clinic file, so a staff edit changes every reply.

const DAY_NAMES = {
  en: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
  hi: ['रविवार', 'सोमवार', 'मंगलवार', 'बुधवार', 'गुरुवार', 'शुक्रवार', 'शनिवार'],
  te: ['ఆదివారం', 'సోమవారం', 'మంగళవారం', 'బుధవారం', 'గురువారం', 'శుక్రవారం', 'శనివారం'],
};

// Words a patient may use for each day.
const DAY_WORDS = [
  ['sunday', 'sun', 'ravivar', 'itwar', 'रविवार', 'इतवार', 'ఆదివారం', 'ఆదివారము'],
  ['monday', 'mon', 'somvar', 'सोमवार', 'సోమవారం'],
  ['tuesday', 'tue', 'tues', 'mangalvar', 'मंगलवार', 'మంగళవారం'],
  ['wednesday', 'wed', 'budhvar', 'बुधवार', 'బుధవారం'],
  ['thursday', 'thu', 'thurs', 'guruvar', 'गुरुवार', 'గురువారం'],
  ['friday', 'fri', 'shukravar', 'शुक्रवार', 'శుక్రవారం'],
  ['saturday', 'sat', 'shanivar', 'शनिवार', 'శనివారం'],
];

function hoursIn(cb, lang) {
  // cb is e.g. "2 working hours" taken from the clinic file rules.
  const n = (String(cb).match(/\d+/) || ['2'])[0];
  if (lang === 'hi') return `${n} कामकाजी घंटों`;
  if (lang === 'te') return `${n} పని గంటల`;
  return cb;
}

const T = {
  en: {
    notSure: (id, cb) => `I'm not sure about that, and I don't want to guess. I've passed your question to our team (ticket ${id}). Someone will call you back within ${cb}.`,
    askContact: 'Please share your name and phone number below so we can reach you.',
    emergency: (phone, rules, id) => `Please call our emergency number right away: ${phone}\n\n${rules}\n\nI've alerted our team (ticket ${id}, urgent).`,
    medical: (phone) => `I'm sorry you're going through this. I can't give medical advice or suggest any medicine. A dentist must see you to check it properly. Would you like me to book a visit? You can also call us on ${phone}.`,
    refuse: "Sorry, I can't change my rules. I can only share what is in our clinic details. I'm happy to help with timings, prices, doctors or booking a visit.",
    discount: "Sorry, I can't offer a discount or change a price. Our prices are fixed as listed.",
    greeting: (name) => `Hello! I'm the front desk assistant at ${name}. Ask me about timings, prices, doctors, insurance or booking a visit.`,
    thanks: "You're welcome! Is there anything else I can help with?",
    bookAsk: 'Sure, I can request a visit for you. Which day and time suit you? For example, "Saturday 11 am". You can also fill in the short form below.',
    bookAskTime: (day) => `What time on ${day} suits you?`,
    bookOutside: (day, hours) => `On ${day} our timings are: ${hours}. Please choose a time within those hours.`,
    bookPast: 'That time has already passed. Please pick a later day or time.',
    bookDone: (when, id, cb) => `Done! I've sent a booking request for ${when} (ticket ${id}). Our team will confirm it on phone or WhatsApp within ${cb}.`,
    bookNeedPhone: 'Please share your name and phone number below so we can confirm.',
    bookAssumed: (when) => `I've taken this as ${when}.`,
    lunchNote: (v) => `Please note the lunch break: ${v}.`,
    contactSaved: 'Thank you. We have your details and will call you back.',
    hoursFor: 'Our timings:',
    lunch: 'Lunch break',
    holidays: 'Public holidays',
    prices: 'Our prices:',
    doctors: 'Our doctors:',
    kids: (d) => `${d.name} (${d.role}) sees children. Days: ${d.days}.`,
    doctorLine: (d) => `${d.name}: ${d.role}. Days: ${d.days}.`,
    insYes: (n) => `Yes, we are cashless with ${n}.`,
    insNo: (n) => `We are not cashless with ${n}.`,
    address: (c) => `We are at ${c.address}.\nLandmark: ${c.landmark}.`,
    parking: (p) => `Parking: ${p}.`,
    contact: (c) => `Phone: ${c.phone}\nWhatsApp: ${c.whatsapp}\nEmergency: ${c.emergency_phone}`,
    languages: (l) => `Our team speaks ${l}.`,
    policy: (t) => t,
  },
  hi: {
    notSure: (id, cb) => `मुझे इसकी पक्की जानकारी नहीं है, इसलिए मैं अंदाज़ा नहीं लगाऊँगा। मैंने आपका सवाल हमारी टीम को भेज दिया है (टिकट ${id})। ${hoursIn(cb, 'hi')} के अंदर कोई आपको कॉल करेगा।`,
    askContact: 'कृपया नीचे अपना नाम और फ़ोन नंबर दें, ताकि हम आपसे संपर्क कर सकें।',
    emergency: (phone, rules, id) => `कृपया तुरंत हमारे इमरजेंसी नंबर पर कॉल करें: ${phone}\n\nअगर खून बहना रुक नहीं रहा, चेहरे या गर्दन में सूजन है, या साँस लेने में तकलीफ़ है, तो तुरंत कॉल करें और नज़दीकी अस्पताल जाएँ।\n\nमैंने हमारी टीम को सूचना दे दी है (टिकट ${id}, urgent)।`,
    medical: (phone) => `आपको तकलीफ़ है, यह सुनकर दुख हुआ। मैं कोई मेडिकल सलाह या दवा नहीं बता सकता। डेंटिस्ट (dentist) को आपको देखना ज़रूरी है। क्या मैं आपके लिए अपॉइंटमेंट बुक करूँ? आप ${phone} पर कॉल भी कर सकते हैं।`,
    refuse: 'माफ़ कीजिए, मैं अपने नियम नहीं बदल सकता। मैं सिर्फ़ क्लिनिक की जानकारी दे सकता हूँ। समय, फ़ीस, डॉक्टर या अपॉइंटमेंट में ख़ुशी से मदद करूँगा।',
    discount: 'माफ़ कीजिए, मैं कोई छूट नहीं दे सकता और कीमत नहीं बदल सकता।',
    greeting: (name) => `नमस्ते! मैं ${name} का फ्रंट डेस्क असिस्टेंट हूँ। समय, फ़ीस, डॉक्टर, बीमा या अपॉइंटमेंट के बारे में पूछिए।`,
    thanks: 'आपका स्वागत है! और कुछ मदद चाहिए?',
    bookAsk: 'ज़रूर, मैं आपके लिए अपॉइंटमेंट की रिक्वेस्ट भेज सकता हूँ। कौन सा दिन और समय ठीक रहेगा? जैसे "शनिवार सुबह 11 बजे"। या नीचे छोटा फ़ॉर्म भरें।',
    bookAskTime: (day) => `${day} को कौन सा समय ठीक रहेगा?`,
    bookOutside: (day, hours) => `${day} को हमारा समय है: ${hours}। कृपया इसी समय के बीच चुनें।`,
    bookPast: 'यह समय निकल चुका है। कृपया आगे का दिन या समय चुनें।',
    bookDone: (when, id, cb) => `हो गया! मैंने ${when} के लिए अपॉइंटमेंट रिक्वेस्ट भेज दी है (टिकट ${id})। हमारी टीम ${hoursIn(cb, 'hi')} के अंदर फ़ोन या WhatsApp पर कन्फ़र्म करेगी।`,
    bookNeedPhone: 'कन्फ़र्म करने के लिए कृपया नीचे अपना नाम और फ़ोन नंबर दें।',
    bookAssumed: (when) => `मैंने इसे ${when} माना है।`,
    lunchNote: (v) => `लंच ब्रेक: ${v}`,
    contactSaved: 'धन्यवाद। आपकी जानकारी मिल गई है, हम आपको कॉल करेंगे।',
    hoursFor: 'हमारा समय:',
    lunch: 'लंच ब्रेक',
    holidays: 'सरकारी छुट्टियाँ',
    prices: 'हमारी फ़ीस:',
    doctors: 'हमारे डॉक्टर:',
    kids: (d) => `बच्चों को ${d.name} (${d.role}) देखते हैं। दिन: ${d.days}।`,
    doctorLine: (d) => `${d.name}: ${d.role}। दिन: ${d.days}।`,
    insYes: (n) => `हाँ, ${n} के साथ हमारी कैशलेस (cashless) सुविधा है।`,
    insNo: (n) => `${n} के साथ हमारी कैशलेस सुविधा नहीं है।`,
    address: (c) => `हमारा पता: ${c.address}\nलैंडमार्क: ${c.landmark}`,
    parking: (p) => `पार्किंग: ${p}`,
    contact: (c) => `फ़ोन: ${c.phone}\nWhatsApp: ${c.whatsapp}\nइमरजेंसी: ${c.emergency_phone}`,
    languages: (l) => `हमारी टीम ये भाषाएँ बोलती है: ${l}`,
    policy: (t) => `क्लिनिक की जानकारी (अंग्रेज़ी में): ${t}`,
  },
  te: {
    notSure: (id, cb) => `దీని గురించి నాకు ఖచ్చితంగా తెలియదు, అందుకే ఊహించి చెప్పను. మీ ప్రశ్నను మా టీమ్‌కు పంపాను (టికెట్ ${id}). ${hoursIn(cb, 'te')}లోపు ఎవరైనా మీకు కాల్ చేస్తారు.`,
    askContact: 'దయచేసి మీ పేరు, ఫోన్ నంబర్ కింద ఇవ్వండి, మేము మిమ్మల్ని సంప్రదిస్తాము.',
    emergency: (phone, rules, id) => `దయచేసి వెంటనే మా ఎమర్జెన్సీ నంబర్‌కు కాల్ చేయండి: ${phone}\n\nరక్తస్రావం ఆగకపోతే, ముఖం లేదా మెడ వాపు ఉంటే, లేదా శ్వాస తీసుకోవడంలో ఇబ్బంది ఉంటే వెంటనే కాల్ చేసి దగ్గరలోని ఆసుపత్రికి వెళ్ళండి.\n\nమా టీమ్‌కు తెలియజేశాను (టికెట్ ${id}, urgent).`,
    medical: (phone) => `మీకు ఇబ్బందిగా ఉందని విని బాధగా ఉంది. నేను వైద్య సలహా లేదా మందులు చెప్పలేను. డెంటిస్ట్ (dentist) మిమ్మల్ని చూడాలి. మీ కోసం అపాయింట్‌మెంట్ బుక్ చేయమంటారా? మీరు ${phone}కు కాల్ కూడా చేయవచ్చు.`,
    refuse: 'క్షమించండి, నేను నా నియమాలను మార్చలేను. క్లినిక్ వివరాలు మాత్రమే చెప్పగలను. సమయాలు, ధరలు, డాక్టర్లు లేదా అపాయింట్‌మెంట్‌లో సంతోషంగా సహాయం చేస్తాను.',
    discount: 'క్షమించండి, నేను డిస్కౌంట్ ఇవ్వలేను, ధరలు మార్చలేను.',
    greeting: (name) => `నమస్తే! నేను ${name} ఫ్రంట్ డెస్క్ అసిస్టెంట్‌ని. సమయాలు, ధరలు, డాక్టర్లు, ఇన్సూరెన్స్ లేదా అపాయింట్‌మెంట్ గురించి అడగండి.`,
    thanks: 'స్వాగతం! ఇంకేమైనా సహాయం కావాలా?',
    bookAsk: 'తప్పకుండా, మీ కోసం అపాయింట్‌మెంట్ రిక్వెస్ట్ పంపగలను. ఏ రోజు, ఏ సమయం మీకు సరిపోతుంది? ఉదాహరణకు "శనివారం ఉదయం 11". లేదా కింద ఉన్న చిన్న ఫారమ్ నింపండి.',
    bookAskTime: (day) => `${day} ఏ సమయం మీకు సరిపోతుంది?`,
    bookOutside: (day, hours) => `${day} మా సమయాలు: ${hours}. దయచేసి ఆ సమయంలోనే ఎంచుకోండి.`,
    bookPast: 'ఆ సమయం దాటిపోయింది. దయచేసి తర్వాతి రోజు లేదా సమయం ఎంచుకోండి.',
    bookDone: (when, id, cb) => `అయిపోయింది! ${when}కు అపాయింట్‌మెంట్ రిక్వెస్ట్ పంపాను (టికెట్ ${id}). మా టీమ్ ${hoursIn(cb, 'te')}లోపు ఫోన్ లేదా WhatsAppలో నిర్ధారిస్తుంది.`,
    bookNeedPhone: 'నిర్ధారించడానికి దయచేసి మీ పేరు, ఫోన్ నంబర్ కింద ఇవ్వండి.',
    bookAssumed: (when) => `దీన్ని ${when}గా తీసుకున్నాను.`,
    lunchNote: (v) => `లంచ్ బ్రేక్: ${v}`,
    contactSaved: 'ధన్యవాదాలు. మీ వివరాలు అందాయి, మేము మీకు కాల్ చేస్తాము.',
    hoursFor: 'మా సమయాలు:',
    lunch: 'లంచ్ బ్రేక్',
    holidays: 'పబ్లిక్ సెలవులు',
    prices: 'మా ధరలు:',
    doctors: 'మా డాక్టర్లు:',
    kids: (d) => `పిల్లలను ${d.name} (${d.role}) చూస్తారు. రోజులు: ${d.days}.`,
    doctorLine: (d) => `${d.name}: ${d.role}. రోజులు: ${d.days}.`,
    insYes: (n) => `అవును, ${n}తో మాకు క్యాష్‌లెస్ (cashless) సౌకర్యం ఉంది.`,
    insNo: (n) => `${n}తో మాకు క్యాష్‌లెస్ సౌకర్యం లేదు.`,
    address: (c) => `మా చిరునామా: ${c.address}\nల్యాండ్‌మార్క్: ${c.landmark}`,
    parking: (p) => `పార్కింగ్: ${p}`,
    contact: (c) => `ఫోన్: ${c.phone}\nWhatsApp: ${c.whatsapp}\nఎమర్జెన్సీ: ${c.emergency_phone}`,
    languages: (l) => `మా టీమ్ మాట్లాడే భాషలు: ${l}`,
    policy: (t) => `క్లినిక్ సమాచారం (ఇంగ్లీష్‌లో): ${t}`,
  },
};

// Quick-reply buttons. "send" is the message the button sends.
const QUICK = {
  en: [
    { label: 'Timings', send: 'What are your timings?' },
    { label: 'Prices', send: 'What are your prices?' },
    { label: 'Book a visit', send: 'I want to book an appointment' },
    { label: 'Doctors', send: 'Which doctors are there?' },
    { label: 'Insurance', send: 'Which insurance do you accept?' },
    { label: 'Location', send: 'Where is the clinic?' },
  ],
  hi: [
    { label: 'समय', send: 'क्लिनिक का समय क्या है?' },
    { label: 'फ़ीस', send: 'इलाज की फ़ीस कितनी है?' },
    { label: 'अपॉइंटमेंट', send: 'मुझे अपॉइंटमेंट बुक करना है' },
    { label: 'डॉक्टर', send: 'कौन से डॉक्टर हैं?' },
    { label: 'बीमा', send: 'कौन सा बीमा लेते हैं?' },
    { label: 'पता', send: 'क्लिनिक कहाँ है?' },
  ],
  te: [
    { label: 'సమయాలు', send: 'క్లినిక్ సమయాలు ఏమిటి?' },
    { label: 'ధరలు', send: 'చికిత్స ధరలు ఎంత?' },
    { label: 'అపాయింట్‌మెంట్', send: 'నాకు అపాయింట్‌మెంట్ బుక్ చేయాలి' },
    { label: 'డాక్టర్లు', send: 'ఏ డాక్టర్లు ఉన్నారు?' },
    { label: 'ఇన్సూరెన్స్', send: 'ఏ ఇన్సూరెన్స్ తీసుకుంటారు?' },
    { label: 'చిరునామా', send: 'క్లినిక్ ఎక్కడ ఉంది?' },
  ],
};

module.exports = { T, QUICK, DAY_NAMES, DAY_WORDS };
