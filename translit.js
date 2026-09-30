/* Piyu Hinglish reader: Roman-script Hindi ("abhi kya karna hai") -> Devanagari, so a Hindi voice can say it properly.
   Works in browser and Node. Dictionaries cover common words; a phonetic rule engine handles the rest.
   A sentence that contains Hindi words is transliterated as a whole (English words too, the way Indians say them);
   purely English sentences are left alone for the English voice. */
(function (root) {
  'use strict';

  /* ---- Hinglish (Roman Hindi) words ---- */
  const HI = {
    hai: 'है', hain: 'हैं', he: 'है', ho: 'हो', hoga: 'होगा', hogi: 'होगी', honge: 'होंगे', hona: 'होना', hota: 'होता', hoti: 'होती', hote: 'होते', hua: 'हुआ', hui: 'हुई', hue: 'हुए', tha: 'था', thi: 'थी', the: 'थे',
    kya: 'क्या', kia: 'किया', kiya: 'किया', kyun: 'क्यों', kyon: 'क्यों', kyunki: 'क्योंकि', kaise: 'कैसे', kaisa: 'कैसा', kaisi: 'कैसी', kab: 'कब', kahan: 'कहाँ', kaha: 'कहा', kaun: 'कौन', kitna: 'कितना', kitni: 'कितनी', kitne: 'कितने', kaunsa: 'कौनसा', kaunsi: 'कौनसी',
    ka: 'का', ki: 'की', ke: 'के', ko: 'को', se: 'से', mein: 'में', men: 'में', par: 'पर', pe: 'पे', tak: 'तक', aur: 'और', ya: 'या', bhi: 'भी', nahi: 'नहीं', nahin: 'नहीं', nhi: 'नहीं', na: 'ना', toh: 'तो', ab: 'अब', abhi: 'अभी', tab: 'तब', jab: 'जब', agar: 'अगर', lekin: 'लेकिन', magar: 'मगर', isliye: 'इसलिए', phir: 'फिर', fir: 'फिर', tabhi: 'तभी', sirf: 'सिर्फ़', bas: 'बस', bilkul: 'बिल्कुल',
    aaj: 'आज', aj: 'आज', kal: 'कल', parso: 'परसों', subah: 'सुबह', shaam: 'शाम', dopahar: 'दोपहर', raat: 'रात', din: 'दिन', hafta: 'हफ़्ता', hafte: 'हफ़्ते', mahina: 'महीना', mahine: 'महीने', saal: 'साल', baje: 'बजे', minute: 'मिनट', ghanta: 'घंटा', ghante: 'घंटे', roz: 'रोज़', har: 'हर', pehle: 'पहले', pahle: 'पहले', baad: 'बाद', tak: 'तक', jaldi: 'जल्दी', der: 'देर', turant: 'तुरंत', abhi: 'अभी', pura: 'पूरा', poora: 'पूरा', shuru: 'शुरू', khatam: 'ख़त्म', baaki: 'बाकी', agla: 'अगला', pichla: 'पिछला', last: 'लास्ट',
    kaam: 'काम', kam: 'कम', karo: 'करो', karna: 'करना', karni: 'करनी', kare: 'करे', karein: 'करें', kar: 'कर', kiye: 'किए', karte: 'करते', karta: 'करता', karti: 'करती', karunga: 'करूँगा', karungi: 'करूँगी', kro: 'करो',
    do: 'दो', dena: 'देना', dijiye: 'दीजिए', diya: 'दिया', de: 'दे', lena: 'लेना', le: 'ले', liya: 'लिया', lo: 'लो', jao: 'जाओ', jana: 'जाना', gaya: 'गया', gayi: 'गई', gaye: 'गए', aao: 'आओ', aana: 'आना', aaya: 'आया', aayi: 'आई', aaye: 'आए',
    batao: 'बताओ', bataiye: 'बताइए', batana: 'बताना', bata: 'बता', dekho: 'देखो', dekhna: 'देखना', dekha: 'देखा', suno: 'सुनो', sunao: 'सुनाओ', sunna: 'सुनना', bolo: 'बोलो', bolna: 'बोलना', likho: 'लिखो', likhna: 'लिखना', padho: 'पढ़ो', padhna: 'पढ़ना', bhejo: 'भेजो', bhejna: 'भेजना', bheja: 'भेजा', dalo: 'डालो', daalo: 'डालो', rakho: 'रखो', rakhna: 'रखना', milna: 'मिलना', mila: 'मिला', mili: 'मिली', khol: 'खोल', kholo: 'खोलो', kholna: 'खोलना', band: 'बंद', chalu: 'चालू', chalo: 'चलो', chalna: 'चलना', chal: 'चल', ruko: 'रुको', rukna: 'रुकना', bhool: 'भूल', yaad: 'याद', samajh: 'समझ', samjho: 'समझो', samjha: 'समझा', samjhe: 'समझे', chahiye: 'चाहिए', chahta: 'चाहता', chahti: 'चाहती', sakta: 'सकता', sakti: 'सकती', sakte: 'सकते', raha: 'रहा', rahi: 'रही', rahe: 'रहे', rehna: 'रहना', rahega: 'रहेगा', lagao: 'लगाओ', lagana: 'लगाना', laga: 'लगा', badlo: 'बदलो', badalna: 'बदलना', banao: 'बनाओ', banana: 'बनाना', bana: 'बना', banaya: 'बनाया', hatao: 'हटाओ', hatana: 'हटाना', mitao: 'मिटाओ', jodo: 'जोड़ो', jodna: 'जोड़ना', pucho: 'पूछो', puchna: 'पूछना', puchha: 'पूछा',
    mujhe: 'मुझे', mera: 'मेरा', meri: 'मेरी', mere: 'मेरे', main: 'मैं', mai: 'मैं', hum: 'हम', humein: 'हमें', hamara: 'हमारा', tum: 'तुम', tumhe: 'तुम्हें', tumhara: 'तुम्हारा', aap: 'आप', aapko: 'आपको', aapka: 'आपका', aapki: 'आपकी', aapke: 'आपके', unka: 'उनका', uska: 'उसका', uski: 'उसकी', uske: 'उसके', iska: 'इसका', iski: 'इसकी', iske: 'इसके', yeh: 'यह', ye: 'ये', woh: 'वह', wo: 'वो', vo: 'वो', yahan: 'यहाँ', wahan: 'वहाँ', idhar: 'इधर', udhar: 'उधर', isme: 'इसमें', usme: 'उसमें', isko: 'इसको', usko: 'उसको', kisi: 'किसी', kuch: 'कुछ', koi: 'कोई', sab: 'सब', sabhi: 'सभी', sabse: 'सबसे', saare: 'सारे', saara: 'सारा', saari: 'सारी', apna: 'अपना', apni: 'अपनी', apne: 'अपने', khud: 'ख़ुद', dono: 'दोनों', kaafi: 'काफ़ी', bahut: 'बहुत', bohot: 'बहुत', thoda: 'थोड़ा', thodi: 'थोड़ी', zyada: 'ज़्यादा', jyada: 'ज़्यादा', zada: 'ज़्यादा', bilkul: 'बिल्कुल',
    accha: 'अच्छा', achha: 'अच्छा', acha: 'अच्छा', achchha: 'अच्छा', theek: 'ठीक', thik: 'ठीक', sahi: 'सही', galat: 'ग़लत', zaroori: 'ज़रूरी', zaruri: 'ज़रूरी', jaruri: 'ज़रूरी', mushkil: 'मुश्किल', aasaan: 'आसान', asaan: 'आसान', naya: 'नया', nayi: 'नई', naye: 'नए', purana: 'पुराना', purani: 'पुरानी', bada: 'बड़ा', badi: 'बड़ी', chhota: 'छोटा', chhoti: 'छोटी', pehla: 'पहला', doosra: 'दूसरा', teesra: 'तीसरा', ek: 'एक', teen: 'तीन', chaar: 'चार', paanch: 'पाँच', chhe: 'छह', saat: 'सात', aath: 'आठ', nau: 'नौ', das: 'दस', sau: 'सौ', hazaar: 'हज़ार', lakh: 'लाख', rupaye: 'रुपये', rupya: 'रुपया', paisa: 'पैसा', paise: 'पैसे',
    haan: 'हाँ', han: 'हाँ', ji: 'जी', sir: 'सर', madam: 'मैडम', bhai: 'भाई', dost: 'दोस्त', namaste: 'नमस्ते', shukriya: 'शुक्रिया', dhanyavaad: 'धन्यवाद', maaf: 'माफ़', kripya: 'कृपया', please: 'प्लीज़', sorry: 'सॉरी', jai: 'जय', shivrai: 'शिवराय',
    ghar: 'घर', kaun: 'कौन', log: 'लोग', naam: 'नाम', baat: 'बात', jagah: 'जगह', tarah: 'तरह', tarika: 'तरीका', raasta: 'रास्ता', wajah: 'वजह', sawaal: 'सवाल', jawab: 'जवाब', madad: 'मदद', dhyan: 'ध्यान', tayyar: 'तैयार', taiyaar: 'तैयार', puri: 'पूरी', pure: 'पूरे', wala: 'वाला', wali: 'वाली', wale: 'वाले', waala: 'वाला', kar_do: 'कर दो', jaisa: 'जैसा', jaise: 'जैसे', tarah: 'तरह', bina: 'बिना', saath: 'साथ', liye: 'लिए', wapas: 'वापस', andar: 'अंदर', bahar: 'बाहर', upar: 'ऊपर', neeche: 'नीचे', beech: 'बीच', pass: 'पास', door: 'दूर', seedha: 'सीधा', ulta: 'उल्टा',
    dikhao: 'दिखाओ', dikhega: 'दिखेगा', dikhta: 'दिखता', milega: 'मिलेगा', hoga_: 'होगा', jayega: 'जाएगा', aayega: 'आएगा', bhejega: 'भेजेगा', karega: 'करेगा', karegi: 'करेगी', chalega: 'चलेगा', lagega: 'लगेगा', padega: 'पड़ेगा', chahiye_: 'चाहिए', rakhna_: 'रखना', hone: 'होने', karne: 'करने', dene: 'देने', lene: 'लेने', jane: 'जाने', bhejne: 'भेजने', dekhne: 'देखने', batane: 'बताने', kholne: 'खोलने', jodne: 'जोड़ने', hatane: 'हटाने', chalane: 'चलाने', lagane: 'लगाने', karwana: 'करवाना', karwao: 'करवाओ', dena_: 'देना', banane: 'बनाने', likhne: 'लिखने', padhne: 'पढ़ने', sunne: 'सुनने'
  };
  // words that are common in English too: only count as Hindi when the sentence is already Hindi-dominant
  const AMBIG = new Set(['do', 'to', 'toh', 'me', 'hi', 'is', 'us', 'the', 'or', 'so', 'ok', 'na', 'pass', 'last', 'the', 'we', 'he', 'main', 'men', 'par', 'pe', 'bas', 'kar', 'de', 'le', 'lo', 'don', 'sir', 'madam', 'please', 'sorry', 'sab', 'ye', 'wo', 'vo', 'ho', 'chal', 'door', 'jai', 'log', 'ab', 'tak', 'ek', 'das', 'sau', 'ji', 'han', 'ya', 'ki', 'ke', 'ka', 'ko', 'se', 'mai', 'ka', 'is']);
  // real Hindi function words: a sentence with any of these is Hinglish
  const STRONG = new Set(['hai', 'hain', 'hoga', 'hogi', 'tha', 'thi', 'kya', 'kyun', 'kaise', 'kab', 'kahan', 'kaun', 'kitna', 'mein', 'nahi', 'nahin', 'aur', 'bhi', 'abhi', 'aaj', 'kal', 'karo', 'karna', 'kare', 'karein', 'batao', 'bataiye', 'dekho', 'suno', 'mujhe', 'mera', 'meri', 'aap', 'aapko', 'yeh', 'woh', 'kuch', 'koi', 'sabhi', 'bahut', 'accha', 'theek', 'sahi', 'zaroori', 'chahiye', 'raha', 'rahi', 'gaya', 'gayi', 'liye', 'saath', 'baad', 'pehle', 'phir', 'lekin', 'agar', 'jab', 'tab', 'toh', 'karke', 'karenge', 'kijiye', 'dijiye', 'baaki', 'shuru', 'khatam', 'pura', 'poora', 'ruko', 'chalo', 'haan', 'namaste', 'shukriya', 'kripya', 'humein', 'tumhe', 'hum', 'tum', 'sakta', 'sakti', 'sakte', 'hone', 'karne', 'dena', 'lena', 'jana', 'aana', 'bolo', 'likho', 'padho', 'bhejo', 'dalo', 'rakho', 'kholo', 'banao', 'hatao', 'lagao', 'jodo', 'kar', 'wala', 'wali', 'wale', 'sirf', 'bilkul', 'jaldi', 'turant', 'subah', 'shaam', 'raat', 'din', 'kaam', 'baje']);

  /* ---- English words as Indians say them ---- */
  const EN = {
    razorpay: 'रेज़रपे', dashboard: 'डैशबोर्ड', check: 'चेक', payment: 'पेमेंट', payments: 'पेमेंट्स', product: 'प्रोडक्ट', products: 'प्रोडक्ट्स', code: 'कोड', codes: 'कोड्स', enabled: 'एनेबल्ड', enable: 'एनेबल', disable: 'डिसेबल', disabled: 'डिसेबल्ड',
    webhook: 'वेबहुक', webhooks: 'वेबहुक्स', secret: 'सीक्रेट', settings: 'सेटिंग्स', setting: 'सेटिंग', add: 'ऐड', new: 'न्यू', deploy: 'डिप्लॉय', deployed: 'डिप्लॉयड', deployment: 'डिप्लॉयमेंट', function: 'फ़ंक्शन', functions: 'फ़ंक्शन्स', edge: 'एज', folder: 'फ़ोल्डर', folders: 'फ़ोल्डर्स', file: 'फ़ाइल', files: 'फ़ाइल्स', config: 'कॉन्फ़िग', toml: 'टॉमल', block: 'ब्लॉक', blocks: 'ब्लॉक्स', repo: 'रेपो', copy: 'कॉपी', cloud: 'क्लाउड', lovable: 'लवेबल',
    test: 'टेस्ट', tests: 'टेस्ट्स', testing: 'टेस्टिंग', ticket: 'टिकट', tickets: 'टिकट्स', app: 'ऐप', apps: 'ऐप्स', phone: 'फ़ोन', phones: 'फ़ोन्स', mobile: 'मोबाइल', android: 'एंड्रॉयड', iphone: 'आईफ़ोन', gpay: 'जीपे', phonepe: 'फ़ोनपे', upi: 'यूपीआई', qr: 'क्यूआर', card: 'कार्ड', cards: 'कार्ड्स', scan: 'स्कैन', scanner: 'स्कैनर', gate: 'गेट', crew: 'क्रू', door: 'डोर', help: 'हेल्प', desk: 'डेस्क', publish: 'पब्लिश', switch: 'स्विच', login: 'लॉगिन', user: 'यूज़र', admin: 'एडमिन', service: 'सर्विस', role: 'रोल',
    task: 'टास्क', tasks: 'टास्क्स', work: 'वर्क', meeting: 'मीटिंग', call: 'कॉल', email: 'ईमेल', mail: 'मेल', message: 'मैसेज', report: 'रिपोर्ट', reports: 'रिपोर्ट्स', send: 'सेंड', share: 'शेयर', upload: 'अपलोड', download: 'डाउनलोड', document: 'डॉक्यूमेंट', documents: 'डॉक्यूमेंट्स', doc: 'डॉक', pdf: 'पीडीएफ़', docx: 'डॉक्स', ppt: 'पीपीटी', excel: 'एक्सेल', sheet: 'शीट', google: 'गूगल', link: 'लिंक', links: 'लिंक्स', photo: 'फ़ोटो', photos: 'फ़ोटोज़', image: 'इमेज', video: 'वीडियो',
    alarm: 'अलार्म', reminder: 'रिमाइंडर', remind: 'रिमाइंड', time: 'टाइम', date: 'डेट', schedule: 'शेड्यूल', plan: 'प्लान', priority: 'प्रायोरिटी', urgent: 'अर्जेंट', important: 'इम्पॉर्टेंट', deadline: 'डेडलाइन', focus: 'फ़ोकस', mode: 'मोड', guide: 'गाइड', step: 'स्टेप', steps: 'स्टेप्स', next: 'नेक्स्ट', back: 'बैक', skip: 'स्किप', repeat: 'रिपीट', stop: 'स्टॉप', start: 'स्टार्ट', done: 'डन', ok: 'ओके', okay: 'ओके', yes: 'यस', no: 'नो',
    delete: 'डिलीट', remove: 'रिमूव', save: 'सेव', edit: 'एडिट', open: 'ओपन', close: 'क्लोज़', click: 'क्लिक', tap: 'टैप', button: 'बटन', select: 'सेलेक्ट', choose: 'चूज़', search: 'सर्च', filter: 'फ़िल्टर', sort: 'सॉर्ट', backup: 'बैकअप', restore: 'रिस्टोर', sync: 'सिंक', update: 'अपडेट', install: 'इंस्टॉल', setup: 'सेटअप', server: 'सर्वर', database: 'डेटाबेस', data: 'डेटा', table: 'टेबल', query: 'क्वेरी', select_: 'सेलेक्ट', status: 'स्टेटस', error: 'एरर', log: 'लॉग', logs: 'लॉग्स', signature: 'सिग्नेचर', order: 'ऑर्डर', orders: 'ऑर्डर्स', verify: 'वेरिफ़ाई', record: 'रिकॉर्ड', fee: 'फ़ीस', late: 'लेट', paid: 'पेड', unpaid: 'अनपेड', amount: 'अमाउंट', price: 'प्राइस', rupee: 'रुपी', one: 'वन', two: 'टू', three: 'थ्री',
    tomorrow: 'टुमॉरो', today: 'टुडे', morning: 'मॉर्निंग', evening: 'ईवनिंग', night: 'नाइट', week: 'वीक', month: 'मंथ', monday: 'मंडे', tuesday: 'ट्यूसडे', wednesday: 'वेडनेसडे', thursday: 'थर्सडे', friday: 'फ़्राइडे', saturday: 'सैटरडे', sunday: 'सण्डे', am: 'एएम', pm: 'पीएम',
    the: 'द', a: 'ए', an: 'एन', and: 'एंड', of: 'ऑफ़', in: 'इन', on: 'ऑन', at: 'ऐट', for: 'फ़ॉर', with: 'विद', is: 'इज़', are: 'आर', was: 'वाज़', be: 'बी', it: 'इट', this: 'दिस', that: 'दैट', from: 'फ़्रॉम', by: 'बाय', as: 'ऐज़', not: 'नॉट', all: 'ऑल', if: 'इफ़', or_: 'ऑर', when: 'व्हेन', then: 'देन', only: 'ओनली', also: 'ऑल्सो', will: 'विल', can: 'कैन', must: 'मस्ट', should: 'शुड', get: 'गेट', give: 'गिव', make: 'मेक', run: 'रन', use: 'यूज़', turn: 'टर्न', put: 'पुट', keep: 'कीप', take: 'टेक', go: 'गो', come: 'कम', see: 'सी', tell: 'टेल', ask: 'आस्क', try: 'ट्राई', need: 'नीड', want: 'वांट', know: 'नो', think: 'थिंक',
    tester: 'टेस्टर', testers: 'टेस्टर्स', double: 'डबल', school: 'स्कूल', hospital: 'हॉस्पिटल', printer: 'प्रिंटर', kitab: 'किताब', rasta: 'रास्ता', gyan: 'ज्ञान', delhi: 'दिल्ली', mumbai: 'मुंबई', pune: 'पुणे', patna: 'पटना', jaipur: 'जयपुर', lucknow: 'लखनऊ', bhopal: 'भोपाल', indore: 'इंदौर', kolkata: 'कोलकाता', chennai: 'चेन्नई', hyderabad: 'हैदराबाद', bangalore: 'बैंगलोर',
    january: 'जनवरी', february: 'फ़रवरी', march: 'मार्च', april: 'अप्रैल', may: 'मई', june: 'जून', july: 'जुलाई', august: 'अगस्त', september: 'सितंबर', october: 'अक्टूबर', november: 'नवंबर', december: 'दिसंबर', sep: 'सितंबर', oct: 'अक्टूबर', required: 'रिक्वायर्ड', require: 'रिक्वायर', listed: 'लिस्टेड', list: 'लिस्ट', reuse: 'रीयूज़', available: 'अवेलेबल', ready: 'रेडी', manual: 'मैनुअल', manually: 'मैन्युअली', system: 'सिस्टम', team: 'टीम', teams: 'टीम्स', name: 'नेम', number: 'नंबर', screen: 'स्क्रीन', button_: 'बटन', option: 'ऑप्शन', account: 'अकाउंट', password: 'पासवर्ड', internet: 'इंटरनेट', wifi: 'वाईफ़ाई', notification: 'नोटिफ़िकेशन', notifications: 'नोटिफ़िकेशन्स', voice: 'वॉइस', text: 'टेक्स्ट', chat: 'चैट', mic: 'माइक', sound: 'साउंड',
    di: 'दी', version: 'वर्ज़न', release: 'रिलीज़', released: 'रिलीज़्ड', view: 'व्यू', pay: 'पे', paying: 'पेइंग', deploy_: 'डिप्लॉय', restart: 'रीस्टार्ट', reset: 'रीसेट', refresh: 'रिफ़्रेश', reload: 'रीलोड', browser: 'ब्राउज़र', chrome: 'क्रोम', laptop: 'लैपटॉप', computer: 'कंप्यूटर', screenshot: 'स्क्रीनशॉट', notes: 'नोट्स', note: 'नोट', event: 'इवेंट', events: 'इवेंट्स', day: 'डे', days: 'डेज़',
    swarajya: 'स्वराज्य', kamar: 'कमर', yusuf: 'यूसुफ़', anand: 'आनंद', sapana: 'सपना', irfan: 'इरफ़ान', piyu: 'पीयू', piyo: 'पीयू', tagmango: 'टैगमैंगो', lovable_: 'लवेबल', supabase: 'सुपाबेस', kvl: 'केवीएल', mca: 'एमसीए', cbax: 'सीबैक्स', ph: 'पीएच', a2: 'ए टू', a14: 'ए फ़ोर्टीन'
  };

  /* ---- rule engine: phonetic Roman -> Devanagari for words not in a dictionary ---- */
  const CON = { chch: 'च्च', chh: 'छ', cch: 'च्छ', ksh: 'क्ष', shr: 'श्र', ch: 'च', kh: 'ख', gh: 'घ', jh: 'झ', th: 'थ', dh: 'ध', ph: 'फ', bh: 'भ', sh: 'श', ck: 'क', qu: 'क्व',
    k: 'क', g: 'ग', c: 'क', j: 'ज', t: 'त', d: 'द', n: 'न', p: 'प', f: 'फ़', b: 'ब', m: 'म', y: 'य', r: 'र', l: 'ल', v: 'व', w: 'व', s: 'स', h: 'ह', z: 'ज़', q: 'क़', x: 'क्स' };
  const CON_KEYS = Object.keys(CON).sort((a, b) => b.length - a.length);
  const VOWELS = ['aa', 'ai', 'au', 'ee', 'ii', 'oo', 'uu', 'ou', 'ay', 'ey', 'ea', 'oa', 'a', 'i', 'u', 'e', 'o'];
  const MATRA = { aa: 'ा', ai: 'ै', au: 'ौ', ee: 'ी', ii: 'ी', oo: 'ू', uu: 'ू', ou: 'ाउ', ay: 'े', ey: 'े', ea: 'ी', oa: 'ो', a: '', i: 'ि', u: 'ु', e: 'े', o: 'ो' };
  const INDEP = { aa: 'आ', ai: 'ऐ', au: 'औ', ee: 'ई', ii: 'ई', oo: 'ऊ', uu: 'ऊ', ou: 'आउ', ay: 'ए', ey: 'ए', ea: 'ई', oa: 'ओ', a: 'अ', i: 'इ', u: 'उ', e: 'ए', o: 'ओ' };
  const STOPS = new Set(['k', 'g', 'c', 'j', 't', 'd', 'p', 'b', 'kh', 'gh', 'ch', 'jh', 'th', 'dh', 'ph', 'bh', 'chh']);
  const CLUSTER_2ND = new Set(['y', 'r', 'v', 'w', 'l']);

  function tokenize(w) {
    const toks = []; let i = 0;
    while (i < w.length) {
      let m = null;
      for (const k of CON_KEYS) if (w.startsWith(k, i)) { m = k; break; }
      const v = VOWELS.find(x => w.startsWith(x, i));
      // a leading 'y'/'w' directly before a vowel is a consonant; vowels win otherwise
      if (v && !(m && m.length > v.length)) { toks.push({ t: 'V', r: v }); i += v.length; }
      else if (m) { toks.push({ t: 'C', r: m }); i += m.length; }
      else i++;                                   // unknown symbol: skip
    }
    return toks;
  }
  function joins(prev, cur, next, atStart, english) {
    // decide whether two adjacent consonants form a conjunct (halant) or the first keeps its short 'a'
    if (prev.r === cur.r && /^[ktdpbgnmlsc]$/.test(cur.r)) return true;                 // double letter: tt, ll, ss ...
    if (CLUSTER_2ND.has(cur.r) && !['l'].includes(prev.r) && prev.r !== 'y') return !(cur.r === 'l' && !english);
    if (prev.r === 's' && ['t', 'k', 'p', 'm', 'n', 'c', 'th'].includes(cur.r)) return true;
    if (prev.r === 'n' && STOPS.has(cur.r)) return true;
    if (prev.r === 'm' && ['p', 'b', 'ph', 'bh'].includes(cur.r)) return true;
    if (english && atStart) return true;
    return false;
  }
  function rules(word, english) {
    let w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return '';
    if (english) {
      w = w.replace(/^ph/, 'f').replace(/c(?=[ei])/g, 's').replace(/g(?=e)/g, 'j').replace(/ers$/, 'ars').replace(/er$/, 'ar');
      w = w.replace(/tion$/, 'shan').replace(/sion$/, 'shan').replace(/([bcdfghjklmnpqrstvwxz])e$/, (m, c) => (w.length > 3 ? c : m));
    }
    const toks = tokenize(w);
    let out = '';
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i], prev = toks[i - 1], next = toks[i + 1], last = i === toks.length - 1;
      if (tk.t === 'C') {
        let ch = CON[tk.r];
        if (english && tk.r === 't') ch = 'ट'; if (english && tk.r === 'd') ch = 'ड'; if (english && tk.r === 'th') ch = 'थ';
        if (tk.r === 'y' && last && english && prev && prev.t === 'C') { out += 'ी'; continue; }   // sunny, deploy(y) style ending
        if (prev && prev.t === 'C' && joins(prev, tk, next, i === 1, english)) out += '्';
        out += ch;
        if (tk.r === 'n' && next && next.t === 'C' && STOPS.has(next.r) && !english) { /* hindi anusvara style handled by halant form */ }
      } else {
        const atWordEnd = last;
        if (!prev || prev.t === 'V') { out += INDEP[tk.r]; continue; }
        let key = tk.r;
        // a single 'a' in a later, open syllable (a + one consonant + vowel) is the long aa: dil-aa-naa, bat-aa-naa
        const later = toks.slice(0, i).some(x => x.t === 'V');
        if (key === 'a' && !atWordEnd && later && next && next.t === 'C' && toks[i + 2] && toks[i + 2].t === 'V') key = 'aa';
        if (atWordEnd && key === 'a') out += 'ा';
        else if (atWordEnd && key === 'i') out += 'ी';
        else if (atWordEnd && key === 'u') out += 'ू';
        else out += MATRA[key];
      }
    }
    return out;
  }

  function isAcronym(w) { return /^[A-Z0-9]{2,6}$/.test(w) && /[A-Z]/.test(w); }
  const LETTER = { A: 'ए', B: 'बी', C: 'सी', D: 'डी', E: 'ई', F: 'एफ़', G: 'जी', H: 'एच', I: 'आई', J: 'जे', K: 'के', L: 'एल', M: 'एम', N: 'एन', O: 'ओ', P: 'पी', Q: 'क्यू', R: 'आर', S: 'एस', T: 'टी', U: 'यू', V: 'वी', W: 'डब्ल्यू', X: 'एक्स', Y: 'वाई', Z: 'ज़ेड', 0: 'ज़ीरो', 1: 'वन', 2: 'टू', 3: 'थ्री', 4: 'फ़ोर', 5: 'फ़ाइव', 6: 'सिक्स', 7: 'सेवन', 8: 'एट', 9: 'नाइन' };

  /* one word -> Devanagari (hindiMode: the sentence is Hinglish) */
  function word(w, first) {
    const lw = w.toLowerCase().replace(/'s$/, '');
    if (HI[lw] && (!AMBIG.has(lw) || true)) return HI[lw];
    if (EN[lw]) return EN[lw];
    if (/[a-z]s$/.test(lw) && EN[lw.slice(0, -1)]) return EN[lw.slice(0, -1)] + 'स';    // plural of a known English word
    if (isAcronym(w)) return w.split('').map(c => LETTER[c] || c).join(' ');
    // unknown: a capitalised word inside a sentence is most likely a name -> Hindi phonetics; otherwise English phonetics
    const name = !first && /^[A-Z][a-z]+$/.test(w);
    const hindiEnding = /(na|ni|ne|ega|egi|enge|ao|iye|ata|ati|ate|ana|ani|aya|ayi|aye|wala|wali|wale|unga|ungi|ogi|oge|ega|kar|kr)$/.test(lw) && lw.length > 3;
    return rules(lw, !(name || hindiEnding));
  }

  const TOKEN = /[A-Za-z][A-Za-z0-9']*/g;
  function analyze(sentence) {
    const toks = sentence.match(TOKEN) || [];
    let hi = 0, strong = 0, alpha = 0, neutral = 0;
    toks.forEach(t => {
      const l = t.toLowerCase();
      if (!/[a-z]/i.test(t) || /\d/.test(t) && !/[a-z]{2,}/i.test(t)) return;
      alpha++;
      if (STRONG.has(l)) { strong++; hi++; }
      else if (HI[l] && !AMBIG.has(l)) hi++;
      else if (AMBIG.has(l)) neutral++;
    });
    return { toks, hi, strong, alpha, neutral };
  }
  function isHinglish(sentence) {
    const a = analyze(sentence);
    if (!a.strong) return false;                                           // needs at least one unmistakable Hindi word
    const denom = Math.max(1, a.alpha - a.neutral);
    return a.hi / denom >= 0.2 || a.alpha <= 4;
  }

  /* whole text: Hinglish sentences -> Devanagari, others untouched */
  function splitSentences(t) {
    const out = []; let cur = '';
    for (let i = 0; i < t.length; i++) {
      const c = t[i]; cur += c;
      const end = c === '।' || c === '\n' || ((c === '.' || c === '!' || c === '?') && (i + 1 >= t.length || /\s/.test(t[i + 1])));
      if (end) { while (i + 1 < t.length && /[.!?।\s]/.test(t[i + 1]) && t[i + 1] !== '\n') cur += t[++i]; out.push(cur); cur = ''; }
    }
    if (cur) out.push(cur);
    return out;
  }
  function hinglish(text) {
    return splitSentences(String(text)).map(sent => {
      if (!/[A-Za-z]/.test(sent) || !isHinglish(sent)) return sent;
      let idx = 0;
      return sent.replace(TOKEN, w => { const r = word(w, idx === 0); idx++; return r; });
    }).join('');
  }

  const api = { hinglish, isHinglish, word, rules, analyze };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.PiyuTranslit = api;
})(typeof self !== 'undefined' ? self : this);
