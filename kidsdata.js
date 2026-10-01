/* Piyu Kids — the lesson and story content (Hindi + English). Pure data, no network, no cost. window.PiyuKidsData */
(function (root) {
  'use strict';
  /* ---- lessons: each topic is a list of cards { s: big symbol, e: emoji, hi, en } ---- */
  const hiLetters = [
    ['अ', 'अनार', '🍎'], ['आ', 'आम', '🥭'], ['इ', 'इमली', '🫘'], ['ई', 'ईख', '🎋'], ['उ', 'उल्लू', '🦉'], ['ऊ', 'ऊँट', '🐪'], ['ए', 'एक', '1️⃣'], ['ऐ', 'ऐनक', '👓'], ['ओ', 'ओस', '💧'], ['औ', 'औज़ार', '🔧'], ['अं', 'अंगूर', '🍇'],
    ['क', 'कबूतर', '🕊️'], ['ख', 'खरगोश', '🐰'], ['ग', 'गमला', '🪴'], ['घ', 'घड़ी', '⏰'], ['च', 'चम्मच', '🥄'], ['छ', 'छतरी', '☂️'], ['ज', 'जहाज़', '🚢'], ['झ', 'झंडा', '🚩'], ['ट', 'टमाटर', '🍅'], ['ठ', 'ठंड', '🥶'],
    ['ड', 'डमरू', '🥁'], ['ढ', 'ढोलक', '🪘'], ['त', 'तरबूज़', '🍉'], ['थ', 'थैला', '👜'], ['द', 'दरवाज़ा', '🚪'], ['ध', 'धनुष', '🏹'], ['न', 'नल', '🚰'], ['प', 'पतंग', '🪁'], ['फ', 'फूल', '🌸'], ['ब', 'बत्तख', '🦆'],
    ['भ', 'भालू', '🐻'], ['म', 'मछली', '🐟'], ['य', 'यान', '🚀'], ['र', 'रस्सी', '🪢'], ['ल', 'लड्डू', '🟠'], ['व', 'वन', '🌳'], ['श', 'शेर', '🦁'], ['स', 'सेब', '🍏'], ['ह', 'हाथी', '🐘'], ['त्र', 'त्रिशूल', '🔱'], ['ज्ञ', 'ज्ञान', '📚']
  ];
  const hiLetterEn = { 'अनार': 'pomegranate', 'आम': 'mango', 'इमली': 'tamarind', 'ईख': 'sugarcane', 'उल्लू': 'owl', 'ऊँट': 'camel', 'एक': 'one', 'ऐनक': 'glasses', 'ओस': 'dew', 'औज़ार': 'tool', 'अंगूर': 'grapes', 'कबूतर': 'pigeon', 'खरगोश': 'rabbit', 'गमला': 'flower pot', 'घड़ी': 'clock', 'चम्मच': 'spoon', 'छतरी': 'umbrella', 'जहाज़': 'ship', 'झंडा': 'flag', 'टमाटर': 'tomato', 'ठंड': 'cold', 'डमरू': 'drum', 'ढोलक': 'dholak', 'तरबूज़': 'watermelon', 'थैला': 'bag', 'दरवाज़ा': 'door', 'धनुष': 'bow', 'नल': 'tap', 'पतंग': 'kite', 'फूल': 'flower', 'बत्तख': 'duck', 'भालू': 'bear', 'मछली': 'fish', 'यान': 'vehicle', 'रस्सी': 'rope', 'लड्डू': 'laddoo', 'वन': 'forest', 'शेर': 'lion', 'सेब': 'apple', 'हाथी': 'elephant', 'त्रिशूल': 'trident', 'ज्ञान': 'knowledge' };
  const enLetters = [['A', 'Apple', '🍎'], ['B', 'Ball', '⚽'], ['C', 'Cat', '🐱'], ['D', 'Dog', '🐶'], ['E', 'Elephant', '🐘'], ['F', 'Fish', '🐟'], ['G', 'Grapes', '🍇'], ['H', 'Hat', '🎩'], ['I', 'Ice cream', '🍦'], ['J', 'Joker', '🤡'], ['K', 'Kite', '🪁'], ['L', 'Lion', '🦁'], ['M', 'Mango', '🥭'],
    ['N', 'Nest', '🪺'], ['O', 'Orange', '🍊'], ['P', 'Parrot', '🦜'], ['Q', 'Queen', '👸'], ['R', 'Rabbit', '🐰'], ['S', 'Sun', '☀️'], ['T', 'Tree', '🌳'], ['U', 'Umbrella', '☂️'], ['V', 'Van', '🚐'], ['W', 'Watch', '⌚'], ['X', 'Xylophone', '🎹'], ['Y', 'Yo-yo', '🪀'], ['Z', 'Zebra', '🦓']];
  const numHi = ['शून्य', 'एक', 'दो', 'तीन', 'चार', 'पाँच', 'छह', 'सात', 'आठ', 'नौ', 'दस', 'ग्यारह', 'बारह', 'तेरह', 'चौदह', 'पंद्रह', 'सोलह', 'सत्रह', 'अठारह', 'उन्नीस', 'बीस'];
  const numEn = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty'];
  const countEmoji = ['🍎', '⭐', '🐟', '🎈', '🦋', '🌸', '🚗', '🐥'];
  const colours = [['लाल', 'Red', '#ef4444', '🍎'], ['नीला', 'Blue', '#3b82f6', '🌊'], ['हरा', 'Green', '#22c55e', '🌿'], ['पीला', 'Yellow', '#facc15', '🍌'], ['नारंगी', 'Orange', '#fb923c', '🍊'], ['गुलाबी', 'Pink', '#f472b6', '🌸'], ['बैंगनी', 'Purple', '#a855f7', '🍇'], ['काला', 'Black', '#1f2937', '🐈‍⬛'], ['सफ़ेद', 'White', '#f8fafc', '☁️'], ['भूरा', 'Brown', '#92400e', '🐻']];
  const shapes = [['गोला', 'Circle', 'circle', '⭕'], ['चौकोर', 'Square', 'square', '🟦'], ['तिकोन', 'Triangle', 'triangle', '🔺'], ['आयत', 'Rectangle', 'rect', '▭'], ['तारा', 'Star', 'star', '⭐'], ['दिल', 'Heart', 'heart', '❤️'], ['अंडाकार', 'Oval', 'oval', '🥚'], ['हीरा', 'Diamond', 'diamond', '🔷']];
  const animals = [['गाय', 'Cow', '🐄', 'म्मा', 'Moo'], ['कुत्ता', 'Dog', '🐶', 'भौं भौं', 'Woof woof'], ['बिल्ली', 'Cat', '🐱', 'म्याऊँ', 'Meow'], ['शेर', 'Lion', '🦁', 'दहाड़', 'Roar'], ['हाथी', 'Elephant', '🐘', 'चिंघाड़', 'Trumpet'], ['बत्तख', 'Duck', '🦆', 'क्वैक क्वैक', 'Quack quack'],
    ['मुर्गा', 'Rooster', '🐓', 'कुकड़ू कूँ', 'Cock-a-doodle-doo'], ['घोड़ा', 'Horse', '🐴', 'हिन-हिन', 'Neigh'], ['बंदर', 'Monkey', '🐒', 'ऊ ऊ आ आ', 'Ooh ooh aah aah'], ['मेंढक', 'Frog', '🐸', 'टर्र टर्र', 'Ribbit'], ['भेड़', 'Sheep', '🐑', 'में में', 'Baa baa'], ['मोर', 'Peacock', '🦚', 'पिहू-पिहू', 'Pee-kaw']];
  const fruits = [['सेब', 'Apple', '🍎'], ['केला', 'Banana', '🍌'], ['आम', 'Mango', '🥭'], ['अंगूर', 'Grapes', '🍇'], ['संतरा', 'Orange', '🍊'], ['तरबूज़', 'Watermelon', '🍉'], ['स्ट्रॉबेरी', 'Strawberry', '🍓'], ['अनानास', 'Pineapple', '🍍'], ['गाजर', 'Carrot', '🥕'], ['टमाटर', 'Tomato', '🍅'], ['आलू', 'Potato', '🥔'], ['मक्का', 'Corn', '🌽']];
  const body = [['आँख', 'Eyes', '👀'], ['कान', 'Ear', '👂'], ['नाक', 'Nose', '👃'], ['मुँह', 'Mouth', '👄'], ['हाथ', 'Hand', '✋'], ['पैर', 'Foot', '🦶'], ['दाँत', 'Teeth', '🦷'], ['बाल', 'Hair', '💇']];
  const habits = [['सुबह उठकर ब्रश करो', 'Brush your teeth in the morning', '🪥'], ['खाने से पहले हाथ धोओ', 'Wash your hands before eating', '🧼'], ['रोज़ पानी पियो', 'Drink water every day', '💧'], ['बड़ों का आदर करो', 'Respect elders', '🙏'], ['सच बोलो', 'Always speak the truth', '🗣️'], ['अपना कमरा साफ़ रखो', 'Keep your room clean', '🧹'], ['समय पर सोओ', 'Sleep on time', '🌙'], ['खिलौने बाँटकर खेलो', 'Share your toys', '🧸']];
  const days = [['सोमवार', 'Monday', '1️⃣'], ['मंगलवार', 'Tuesday', '2️⃣'], ['बुधवार', 'Wednesday', '3️⃣'], ['गुरुवार', 'Thursday', '4️⃣'], ['शुक्रवार', 'Friday', '5️⃣'], ['शनिवार', 'Saturday', '6️⃣'], ['रविवार', 'Sunday', '7️⃣']];

  const TOPICS = [
    { id: 'hi', icon: '🅰️', hi: 'हिंदी अक्षर', en: 'Hindi letters', col: '#f97316', min: 3, cards: hiLetters.map(([s, w, e]) => ({ s, e, hi: s + ' से ' + w, en: s + ' for ' + (hiLetterEn[w] || w), w, say: { hi: s + ' से ' + w, en: s + ' ' + (hiLetterEn[w] || w) } })) },
    { id: 'en', icon: '🔤', hi: 'ABC अंग्रेज़ी', en: 'English ABC', col: '#3b82f6', min: 3, cards: enLetters.map(([s, w, e]) => ({ s, e, hi: s + ' for ' + w, en: s + ' for ' + w, w, say: { hi: s + ' for ' + w, en: s + ' for ' + w } })) },
    { id: 'num', icon: '🔢', hi: 'गिनती 1–20', en: 'Numbers 1–20', col: '#22c55e', min: 3, cards: numHi.map((h, i) => i === 0 ? null : ({ s: String(i), e: countEmoji[i % countEmoji.length].repeat(Math.min(i, 10)), hi: i + ' — ' + h, en: i + ' — ' + numEn[i], w: h, say: { hi: i + ', ' + h, en: i + ', ' + numEn[i] }, n: i })).filter(Boolean) },
    { id: 'tab', icon: '✖️', hi: 'पहाड़े', en: 'Tables', col: '#a855f7', min: 5, cards: [2, 3, 4, 5, 6, 7, 8, 9, 10].map(n => ({ s: String(n), e: '✖️', hi: n + ' का पहाड़ा', en: 'Table of ' + n, w: n + '', table: n, say: { hi: Array.from({ length: 10 }, (_, k) => n + ' गुणा ' + (k + 1) + ' बराबर ' + n * (k + 1)).join('। '), en: Array.from({ length: 10 }, (_, k) => n + ' times ' + (k + 1) + ' is ' + n * (k + 1)).join('. ') } })) },
    { id: 'col', icon: '🎨', hi: 'रंग', en: 'Colours', col: '#ec4899', min: 2, cards: colours.map(([h, e, hex, em]) => ({ s: '', e: em, hi: h, en: e, w: h, hex, say: { hi: h + ' रंग', en: e } })) },
    { id: 'shp', icon: '🔷', hi: 'आकार', en: 'Shapes', col: '#14b8a6', min: 2, cards: shapes.map(([h, e, k, em]) => ({ s: '', e: em, hi: h, en: e, w: h, shape: k, say: { hi: h, en: e } })) },
    { id: 'ani', icon: '🐘', hi: 'जानवर', en: 'Animals', col: '#eab308', min: 3, cards: animals.map(([h, e, em, sh, se]) => ({ s: '', e: em, hi: h + ' — ' + sh, en: e + ' — ' + se, w: h, say: { hi: h + '। ' + h + ' कहता है ' + sh, en: e + '. The ' + e.toLowerCase() + ' says ' + se } })) },
    { id: 'fru', icon: '🍎', hi: 'फल-सब्ज़ी', en: 'Fruits & veggies', col: '#ef4444', min: 2, cards: fruits.map(([h, e, em]) => ({ s: '', e: em, hi: h, en: e, w: h, say: { hi: h, en: e } })) },
    { id: 'bod', icon: '🧍', hi: 'शरीर', en: 'My body', col: '#06b6d4', min: 2, cards: body.map(([h, e, em]) => ({ s: '', e: em, hi: h, en: e, w: h, say: { hi: h, en: e } })) },
    { id: 'day', icon: '📅', hi: 'सप्ताह के दिन', en: 'Days of the week', col: '#8b5cf6', min: 2, cards: days.map(([h, e, em]) => ({ s: '', e: em, hi: h, en: e, w: h, say: { hi: h, en: e } })) },
    { id: 'hab', icon: '🌟', hi: 'अच्छी आदतें', en: 'Good habits', col: '#f59e0b', min: 2, cards: habits.map(([h, e, em]) => ({ s: '', e: em, hi: h, en: e, w: h, say: { hi: h, en: e } })) }
  ];

  TOPICS.forEach(t => t.cards.forEach(c => { c.we = c.we || (t.id === 'hi' ? (hiLetterEn[c.w] || c.w) : t.id === 'en' ? c.w : t.id === 'num' ? numEn[c.n] : c.en.split(' — ')[0].replace(/^.* for /, '')); }));

  /* ---- stories: pages { e: scene emoji, hi, en }, moral, two questions ---- */
  const STORIES = [
    { id: 'tortoise', e: '🐢', hi: 'कछुआ और खरगोश', en: 'The Tortoise and the Hare', pages: [
      { e: '🐇', hi: 'एक जंगल में एक तेज़ खरगोश रहता था। वह रोज़ कछुए पर हँसता था।', en: 'In a forest lived a fast hare. Every day he laughed at the slow tortoise.' },
      { e: '🐢', hi: 'एक दिन कछुए ने कहा, "चलो, दौड़ लगाते हैं!" खरगोश ज़ोर से हँस पड़ा।', en: 'One day the tortoise said, "Let us have a race!" The hare laughed out loud.' },
      { e: '🏁', hi: 'दौड़ शुरू हुई। खरगोश बिजली की तरह भागा और बहुत आगे निकल गया।', en: 'The race began. The hare ran like lightning and went far ahead.' },
      { e: '😴', hi: 'खरगोश ने सोचा, "कछुआ तो बहुत पीछे है।" वह एक पेड़ के नीचे सो गया।', en: 'The hare thought, "The tortoise is far behind." He fell asleep under a tree.' },
      { e: '🐢', hi: 'कछुआ धीरे-धीरे, बिना रुके चलता रहा। वह सोते हुए खरगोश के पास से निकल गया।', en: 'The tortoise kept walking slowly, without stopping. He passed the sleeping hare.' },
      { e: '🏆', hi: 'जब खरगोश जागा, तब कछुआ जीत की रेखा पर पहुँच चुका था! सबने तालियाँ बजाईं।', en: 'When the hare woke up, the tortoise had reached the finish line! Everyone clapped.' }],
      moral: { hi: 'धीरे-धीरे लगातार मेहनत करने वाला जीतता है।', en: 'Slow and steady wins the race.' },
      qs: [{ hi: 'दौड़ में कौन जीता?', en: 'Who won the race?', o: [['कछुआ', 'The tortoise'], ['खरगोश', 'The hare'], ['शेर', 'The lion']], a: 0 }, { hi: 'खरगोश क्यों हारा?', en: 'Why did the hare lose?', o: [['वह सो गया', 'He fell asleep'], ['वह गिर गया', 'He fell down'], ['वह डर गया', 'He got scared']], a: 0 }] },
    { id: 'lionmouse', e: '🦁', hi: 'शेर और चूहा', en: 'The Lion and the Mouse', pages: [
      { e: '🦁', hi: 'एक बड़ा शेर पेड़ के नीचे सो रहा था। एक छोटा चूहा उसके ऊपर कूदने लगा।', en: 'A big lion was sleeping under a tree. A tiny mouse began to play on him.' },
      { e: '😠', hi: 'शेर जाग गया और उसने चूहे को पकड़ लिया। चूहा बोला, "मुझे छोड़ दो, मैं कभी आपकी मदद करूँगा।"', en: 'The lion woke up and caught the mouse. The mouse said, "Please let me go. One day I will help you."' },
      { e: '😄', hi: 'शेर हँसा, "तुम छोटे से चूहे, मेरी क्या मदद करोगे?" फिर भी उसने चूहे को छोड़ दिया।', en: 'The lion laughed, "How can a tiny mouse help me?" But he let the mouse go.' },
      { e: '🕸️', hi: 'कुछ दिन बाद शेर शिकारी के जाल में फँस गया। वह ज़ोर से दहाड़ा।', en: 'A few days later the lion got caught in a hunter\'s net. He roared loudly.' },
      { e: '🐭', hi: 'चूहे ने दहाड़ सुनी और दौड़ा आया। उसने अपने तेज़ दाँतों से जाल काट दिया।', en: 'The mouse heard the roar and ran to him. He cut the net with his sharp teeth.' },
      { e: '🤝', hi: 'शेर आज़ाद हो गया। उस दिन से शेर और चूहा पक्के दोस्त बन गए।', en: 'The lion was free. From that day the lion and the mouse became best friends.' }],
      moral: { hi: 'छोटा हो या बड़ा, अच्छा दोस्त काम आता है।', en: 'A good friend helps you, big or small.' },
      qs: [{ hi: 'जाल किसने काटा?', en: 'Who cut the net?', o: [['चूहे ने', 'The mouse'], ['बंदर ने', 'The monkey'], ['शिकारी ने', 'The hunter']], a: 0 }, { hi: 'शेर कहाँ फँस गया था?', en: 'Where was the lion caught?', o: [['जाल में', 'In a net'], ['नदी में', 'In a river'], ['गुफा में', 'In a cave']], a: 0 }] },
    { id: 'crow', e: '🐦', hi: 'प्यासा कौआ', en: 'The Thirsty Crow', pages: [
      { e: '☀️', hi: 'गर्मी का दिन था। एक कौआ बहुत प्यासा था। वह पानी ढूँढने उड़ चला।', en: 'It was a hot day. A crow was very thirsty. He flew off to look for water.' },
      { e: '🏺', hi: 'उसे एक घड़ा दिखा। घड़े में थोड़ा-सा पानी था, पर बहुत नीचे।', en: 'He saw a pot. There was a little water in it, but very low.' },
      { e: '😟', hi: 'कौए की चोंच पानी तक नहीं पहुँची। वह सोच में पड़ गया।', en: 'The crow\'s beak could not reach the water. He began to think.' },
      { e: '💡', hi: 'तभी उसे एक तरकीब सूझी। उसने पास से छोटे-छोटे कंकड़ उठाए।', en: 'Then he had an idea. He picked up small pebbles nearby.' },
      { e: '🪨', hi: 'वह एक-एक कंकड़ घड़े में डालता गया। पानी धीरे-धीरे ऊपर आने लगा।', en: 'He dropped the pebbles into the pot one by one. The water slowly came up.' },
      { e: '💧', hi: 'कौए ने पेट भर पानी पिया और ख़ुशी से उड़ गया।', en: 'The crow drank to his heart\'s content and flew away happily.' }],
      moral: { hi: 'जहाँ चाह, वहाँ राह। समझदारी से हर मुश्किल हल होती है।', en: 'Where there is a will there is a way. Clever thinking solves problems.' },
      qs: [{ hi: 'कौए ने घड़े में क्या डाला?', en: 'What did the crow put in the pot?', o: [['कंकड़', 'Pebbles'], ['रेत', 'Sand'], ['पत्ते', 'Leaves']], a: 0 }, { hi: 'कौआ क्या ढूँढ रहा था?', en: 'What was the crow looking for?', o: [['पानी', 'Water'], ['खाना', 'Food'], ['घर', 'A home']], a: 0 }] },
    { id: 'ant', e: '🐜', hi: 'चींटी और कबूतर', en: 'The Ant and the Dove', pages: [
      { e: '🐜', hi: 'एक नदी के किनारे एक छोटी चींटी पानी पी रही थी। अचानक वह पानी में गिर गई।', en: 'A little ant was drinking water at a river. Suddenly she fell into the water.' },
      { e: '🌊', hi: 'चींटी डूबने लगी। वह चिल्लाई, "बचाओ! बचाओ!"', en: 'The ant began to sink. She cried, "Help! Help!"' },
      { e: '🕊️', hi: 'पेड़ पर बैठे कबूतर ने यह देखा। उसने एक पत्ता तोड़कर पानी में डाल दिया।', en: 'A dove sitting on a tree saw this. She dropped a leaf into the water.' },
      { e: '🍃', hi: 'चींटी पत्ते पर चढ़ गई और किनारे पर पहुँच गई। उसने कबूतर को धन्यवाद कहा।', en: 'The ant climbed onto the leaf and reached the bank. She thanked the dove.' },
      { e: '🏹', hi: 'कुछ दिन बाद एक शिकारी कबूतर पर निशाना लगाने लगा। चींटी ने यह देख लिया।', en: 'Some days later a hunter aimed at the dove. The ant saw it.' },
      { e: '🐜', hi: 'चींटी ने शिकारी के पैर पर ज़ोर से काटा। निशाना चूक गया और कबूतर उड़ गया।', en: 'The ant bit the hunter\'s foot hard. He missed, and the dove flew away safely.' }],
      moral: { hi: 'जो दूसरों की मदद करता है, उसकी भी मदद होती है।', en: 'Those who help others get help too.' },
      qs: [{ hi: 'कबूतर ने चींटी को क्या दिया?', en: 'What did the dove give the ant?', o: [['पत्ता', 'A leaf'], ['रोटी', 'Bread'], ['फूल', 'A flower']], a: 0 }, { hi: 'चींटी ने कबूतर को कैसे बचाया?', en: 'How did the ant save the dove?', o: [['शिकारी को काटकर', 'By biting the hunter'], ['ज़ोर से चिल्लाकर', 'By shouting'], ['पानी फेंककर', 'By throwing water']], a: 0 }] },
    { id: 'grapes', e: '🦊', hi: 'लोमड़ी और अंगूर', en: 'The Fox and the Grapes', pages: [
      { e: '🦊', hi: 'एक भूखी लोमड़ी खाना ढूँढ रही थी। उसने एक बेल पर अंगूर के गुच्छे देखे।', en: 'A hungry fox was looking for food. She saw bunches of grapes on a vine.' },
      { e: '🍇', hi: 'अंगूर रसीले और बड़े-बड़े थे। लोमड़ी के मुँह में पानी आ गया।', en: 'The grapes were big and juicy. The fox\'s mouth began to water.' },
      { e: '🦘', hi: 'उसने कूदकर अंगूर तोड़ने की कोशिश की, पर अंगूर बहुत ऊँचे थे।', en: 'She jumped to reach the grapes, but they were too high.' },
      { e: '😤', hi: 'उसने बार-बार कोशिश की, पर हर बार नाकाम रही। आख़िर वह थक गई।', en: 'She tried again and again, but failed every time. At last she was tired.' },
      { e: '🙄', hi: 'लोमड़ी बोली, "ये अंगूर तो खट्टे हैं, मुझे नहीं चाहिए!" और चली गई।', en: 'The fox said, "These grapes must be sour. I do not want them!" and walked away.' }],
      moral: { hi: 'हार मानकर बहाने बनाना अच्छी बात नहीं। मेहनत करो या दूसरा रास्ता ढूँढो।', en: 'Do not make excuses when you fail. Try harder or find another way.' },
      qs: [{ hi: 'लोमड़ी ने अंगूर को क्या कहा?', en: 'What did the fox say about the grapes?', o: [['खट्टे हैं', 'They are sour'], ['मीठे हैं', 'They are sweet'], ['छोटे हैं', 'They are small']], a: 0 }, { hi: 'अंगूर कहाँ थे?', en: 'Where were the grapes?', o: [['बेल पर ऊँचे', 'High on a vine'], ['टोकरी में', 'In a basket'], ['ज़मीन पर', 'On the ground']], a: 0 }] },
    { id: 'birds', e: '🐦', hi: 'एकता की ताक़त', en: 'Strength in Unity', pages: [
      { e: '🌾', hi: 'कबूतरों का एक झुंड दाना चुगने निकला। उन्होंने नीचे बिखरे हुए दाने देखे।', en: 'A flock of pigeons went out to find grain. They saw scattered grains below.' },
      { e: '🕸️', hi: 'जैसे ही वे दाना चुगने उतरे, एक जाल उन पर आ गिरा। सब फँस गए!', en: 'As soon as they landed, a net fell on them. They were all trapped!' },
      { e: '😰', hi: 'हर कबूतर अलग-अलग उड़ने की कोशिश करने लगा, पर जाल बहुत भारी था।', en: 'Each pigeon tried to fly in a different direction, but the net was too heavy.' },
      { e: '🤝', hi: 'तब बूढ़े कबूतर ने कहा, "सब एक साथ, एक ही दिशा में उड़ो!"', en: 'Then the old pigeon said, "All together, fly in one direction!"' },
      { e: '🕊️', hi: 'सबने एक साथ ज़ोर लगाया और जाल समेत आसमान में उड़ गए।', en: 'They pulled together and flew up into the sky, net and all.' },
      { e: '🐭', hi: 'दोस्त चूहे ने जाल काट दिया और सब कबूतर आज़ाद हो गए।', en: 'A mouse friend cut the net and all the pigeons were free.' }],
      moral: { hi: 'एकता में बड़ी ताक़त है।', en: 'There is great strength in unity.' },
      qs: [{ hi: 'बूढ़े कबूतर ने क्या कहा?', en: 'What did the old pigeon say?', o: [['सब साथ उड़ो', 'Fly all together'], ['अकेले उड़ो', 'Fly alone'], ['रुक जाओ', 'Stop']], a: 0 }, { hi: 'जाल किसने काटा?', en: 'Who cut the net?', o: [['चूहे ने', 'A mouse'], ['बिल्ली ने', 'A cat'], ['कौए ने', 'A crow']], a: 0 }] },
    { id: 'tree', e: '🌳', hi: 'देने वाला पेड़', en: 'The Giving Tree', pages: [
      { e: '🌳', hi: 'एक बड़ा प्यारा पेड़ था। एक छोटा बच्चा रोज़ उसके पास खेलने आता था।', en: 'There was a big friendly tree. A little boy came to play with it every day.' },
      { e: '🍎', hi: 'पेड़ उसे मीठे फल देता और अपनी डालियों पर झूला झुलाता।', en: 'The tree gave him sweet fruit and let him swing on its branches.' },
      { e: '🧒', hi: 'बच्चा बड़ा हो गया। एक दिन उसने कहा, "मुझे घर बनाना है।"', en: 'The boy grew up. One day he said, "I want to build a house."' },
      { e: '🏠', hi: 'पेड़ ने ख़ुशी से अपनी डालियाँ दे दीं, ताकि बच्चा अपना घर बना सके।', en: 'The tree happily gave its branches so he could build his house.' },
      { e: '🪑', hi: 'बहुत सालों बाद बूढ़ा बच्चा लौटा। वह थका था। पेड़ का ठूँठ उसकी कुर्सी बन गया।', en: 'Many years later the old man came back, tired. The tree stump became his seat.' },
      { e: '💚', hi: 'पेड़ फिर भी ख़ुश था, क्योंकि उसने अपने दोस्त की मदद की थी।', en: 'The tree was still happy, because it had helped its friend.' }],
      moral: { hi: 'देने में जो ख़ुशी है, वह लेने में नहीं। पेड़ हमारे सच्चे दोस्त हैं।', en: 'Giving brings more joy than taking. Trees are our true friends.' },
      qs: [{ hi: 'पेड़ ने बच्चे को क्या दिया?', en: 'What did the tree give the boy?', o: [['फल और डालियाँ', 'Fruit and branches'], ['पैसे', 'Money'], ['खिलौने', 'Toys']], a: 0 }, { hi: 'हमें पेड़ों के साथ कैसा व्यवहार करना चाहिए?', en: 'How should we treat trees?', o: [['उनकी देखभाल करें', 'Take care of them'], ['उन्हें काट दें', 'Cut them down'], ['उन्हें भूल जाएँ', 'Forget them']], a: 0 }] },
    { id: 'moon', e: '🌙', hi: 'चाँद की लोरी', en: 'The Moon\'s Lullaby', night: true, pages: [
      { e: '🌙', hi: 'रात हो गई थी। आसमान में प्यारा चाँद मुस्कुरा रहा था।', en: 'It was night. A lovely moon was smiling in the sky.' },
      { e: '⭐', hi: 'तारे एक-एक करके टिमटिमाने लगे, जैसे छोटे-छोटे दीये।', en: 'The stars began to twinkle one by one, like tiny lamps.' },
      { e: '🦉', hi: 'पेड़ पर बैठा उल्लू धीरे से बोला, "सो जाओ, सो जाओ।"', en: 'The owl on the tree said softly, "Sleep now, sleep now."' },
      { e: '🐑', hi: 'नन्हे मेमने अपनी माँ के पास आराम से लेट गए।', en: 'The little lambs lay down cosily beside their mother.' },
      { e: '☁️', hi: 'हल्की-हल्की हवा चली और बादल लोरी गुनगुनाने लगे।', en: 'A gentle breeze blew and the clouds hummed a lullaby.' },
      { e: '😴', hi: 'सब सो गए। तुम भी आँखें बंद करो और मीठे सपने देखो। शुभ रात्रि!', en: 'Everyone fell asleep. You too, close your eyes and dream sweet dreams. Good night!' }],
      moral: { hi: 'समय पर सोने से सुबह ताज़ा और ख़ुश उठते हैं।', en: 'Sleeping on time makes us fresh and happy in the morning.' },
      qs: [{ hi: 'आसमान में कौन मुस्कुरा रहा था?', en: 'Who was smiling in the sky?', o: [['चाँद', 'The moon'], ['सूरज', 'The sun'], ['पतंग', 'A kite']], a: 0 }, { hi: 'उल्लू ने क्या कहा?', en: 'What did the owl say?', o: [['सो जाओ', 'Sleep now'], ['खेलो', 'Play'], ['खाओ', 'Eat']], a: 0 }] }
  ];

  /* ---- avatar shop: costs are in stars earned (no money, ever) ---- */
  const AVATARS = ['🦁', '🐯', '🐼', '🐨', '🦊', '🐰', '🐸', '🦄', '🐵', '🐶', '🐱', '🐷', '🦖', '🤖', '👧', '🧒', '👦', '🐧'];
  const SHOP = [
    { id: 'h_cap', k: 'hat', e: '🧢', cost: 5, hi: 'टोपी', en: 'Cap' }, { id: 'h_grad', k: 'hat', e: '🎓', cost: 10, hi: 'पदवी टोपी', en: 'Graduate hat' }, { id: 'h_party', k: 'hat', e: '🥳', cost: 10, hi: 'पार्टी', en: 'Party' }, { id: 'h_crown', k: 'hat', e: '👑', cost: 30, hi: 'ताज', en: 'Crown' }, { id: 'h_wiz', k: 'hat', e: '🧙', cost: 40, hi: 'जादूगर', en: 'Wizard' },
    { id: 'g_cool', k: 'face', e: '🕶️', cost: 8, hi: 'चश्मा', en: 'Cool shades' }, { id: 'g_nerd', k: 'face', e: '🤓', cost: 12, hi: 'होशियार', en: 'Smarty' }, { id: 'g_star', k: 'face', e: '🤩', cost: 20, hi: 'स्टार आँखें', en: 'Star eyes' },
    { id: 'p_cat', k: 'pet', e: '🐈', cost: 15, hi: 'बिल्ली', en: 'Kitty' }, { id: 'p_dog', k: 'pet', e: '🐕', cost: 15, hi: 'कुत्ता', en: 'Puppy' }, { id: 'p_bird', k: 'pet', e: '🦜', cost: 20, hi: 'तोता', en: 'Parrot' }, { id: 'p_dragon', k: 'pet', e: '🐉', cost: 60, hi: 'ड्रैगन', en: 'Dragon' }, { id: 'p_uni', k: 'pet', e: '🦄', cost: 70, hi: 'यूनिकॉर्न', en: 'Unicorn' },
    { id: 'b_sky', k: 'bg', c: 'linear-gradient(160deg,#38bdf8,#a5f3fc)', e: '🌤️', cost: 0, hi: 'आसमान', en: 'Sky' }, { id: 'b_sun', k: 'bg', c: 'linear-gradient(160deg,#fb923c,#fde047)', e: '🌅', cost: 10, hi: 'सूर्योदय', en: 'Sunrise' }, { id: 'b_candy', k: 'bg', c: 'linear-gradient(160deg,#f472b6,#c084fc)', e: '🍭', cost: 15, hi: 'कैंडी', en: 'Candy' }, { id: 'b_forest', k: 'bg', c: 'linear-gradient(160deg,#4ade80,#16a34a)', e: '🌲', cost: 20, hi: 'जंगल', en: 'Forest' }, { id: 'b_space', k: 'bg', c: 'linear-gradient(160deg,#1e1b4b,#6d28d9)', e: '🪐', cost: 35, hi: 'अंतरिक्ष', en: 'Space' }, { id: 'b_gold', k: 'bg', c: 'linear-gradient(160deg,#fde047,#f59e0b,#fb7185)', e: '✨', cost: 50, hi: 'सुनहरा', en: 'Golden' },
    { id: 'f_spark', k: 'fx', e: '✨', cost: 25, hi: 'चमक', en: 'Sparkles' }, { id: 'f_heart', k: 'fx', e: '💖', cost: 25, hi: 'दिल', en: 'Hearts' }, { id: 'f_fire', k: 'fx', e: '🔥', cost: 45, hi: 'आग', en: 'Fire' }, { id: 'f_snow', k: 'fx', e: '❄️', cost: 45, hi: 'बर्फ़', en: 'Snow' }
  ];
  const LEVELS = [['🐣', 'छोटा तारा', 'Little Star'], ['⭐', 'तारा', 'Star'], ['🌟', 'चमकता तारा', 'Shining Star'], ['🚀', 'रॉकेट', 'Rocket'], ['🦸', 'हीरो', 'Hero'], ['👑', 'राजा', 'Champion'], ['🏆', 'विजेता', 'Winner'], ['🌈', 'जादूगर', 'Wizard'], ['🦄', 'यूनिकॉर्न', 'Unicorn'], ['🌌', 'सुपरस्टार', 'Superstar']];
  const STAR_PER_LEVEL = 25;
  const BADGES = [
    { id: 'first', e: '⭐', hi: 'पहला स्टार', en: 'First star', hint_hi: 'पहला स्टार कमाओ', hint_en: 'Earn your first star' },
    { id: 'stars50', e: '🌟', hi: '50 स्टार', en: '50 stars', hint_hi: '50 स्टार जमा करो', hint_en: 'Collect 50 stars' },
    { id: 'stars200', e: '💫', hi: '200 स्टार', en: '200 stars', hint_hi: '200 स्टार जमा करो', hint_en: 'Collect 200 stars' },
    { id: 'streak3', e: '🔥', hi: '3 दिन लगातार', en: '3-day streak', hint_hi: 'लगातार 3 दिन कुछ करो', hint_en: 'Be active 3 days in a row' },
    { id: 'streak7', e: '🔥', hi: '7 दिन लगातार', en: '7-day streak', hint_hi: 'लगातार 7 दिन', hint_en: '7 days in a row' },
    { id: 'perfect', e: '🏅', hi: 'पूरा दिन', en: 'Perfect day', hint_hi: 'दिन के सारे काम पूरे करो', hint_en: 'Finish every task of a day' },
    { id: 'learner', e: '📚', hi: 'सीखने वाला', en: 'Learner', hint_hi: '10 पाठ पूरे करो', hint_en: 'Finish 10 lessons' },
    { id: 'reader', e: '📖', hi: 'कहानी प्रेमी', en: 'Story lover', hint_hi: '5 कहानियाँ सुनो', hint_en: 'Listen to 5 stories' },
    { id: 'gamer', e: '🎮', hi: 'खिलाड़ी', en: 'Player', hint_hi: '10 खेल खेलो', hint_en: 'Play 10 games' },
    { id: 'speaker', e: '🎤', hi: 'बोलने वाला', en: 'Speaker', hint_hi: '5 बार सही बोलो', hint_en: 'Speak 5 words correctly' },
    { id: 'helper', e: '📷', hi: 'होमवर्क हीरो', en: 'Homework hero', hint_hi: '3 बार होमवर्क समझो', hint_en: 'Understand homework 3 times' },
    { id: 'shopper', e: '🛍️', hi: 'सजावट', en: 'Decorator', hint_hi: '3 चीज़ें अपने अवतार को दो', hint_en: 'Get 3 avatar items' },
    { id: 'lvl5', e: '🦸', hi: 'हीरो लेवल', en: 'Hero level', hint_hi: 'लेवल 5 तक पहुँचो', hint_en: 'Reach level 5' }
  ];
  root.PiyuKidsData = { TOPICS, STORIES, AVATARS, SHOP, LEVELS, STAR_PER_LEVEL, BADGES, numHi, numEn, colours, shapes, countEmoji };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PiyuKidsData;
})(typeof self !== 'undefined' ? self : this);
