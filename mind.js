/* Piyu's Mind — local, transparent, user-controlled adaptation. Pure logic (browser + Node).
   What "learning" means here: moving averages of how the user writes, lexicon-based emotion reading, extracted facts,
   daily summaries, a rate-limited question bank and small bounded voice-preference nudges. No neural training, nothing leaves the machine. */
(function (root) {
  const _t = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr : (k, a) => (a ? k.replace(/\{(\d+)\}/g, (m, i) => a[i]) : k), _t2 = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr2 : (hk, ha) => (ha && ha.length ? hk.replace(/\{(\d+)\}/g, (m, i) => ha[i]) : hk);
  'use strict';
  const M = {};
  const DAY = 864e5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const dkey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };

  /* ------------------------------------------------------------------ text features ------------------------------------------------------------------ */
  const norm = s => String(s || '').toLowerCase().normalize('NFC');
  const words = s => (norm(s).match(/[\p{L}\p{M}\p{N}']+/gu) || []);

  const FORMAL = ['aap', 'aapka', 'aapko', 'aapki', 'kripya', 'krupya', 'please', 'plz', 'sir', 'madam', 'maam', 'ji', 'dhanyavad', 'shukriya', 'thank', 'thanks', 'could', 'would', 'kindly', 'regards', 'आप', 'आपका', 'आपको', 'आपकी', 'कृपया', 'जी', 'धन्यवाद', 'शुक्रिया', 'महोदय', _t("सर")];
  const CASUAL = ['tu', 'tum', 'tera', 'tujhe', 'tumhara', 'yaar', 'yar', 'bhai', 'bro', 'dude', 'abe', 'arre', 'arey', 'oye', 'chal', 'chill', 'bindaas', 'lol', 'haha', 'hehe', 'hmm', 'hmmm', 'ok', 'okk', 'haan', 'ha', 'nhi', 'kr', 'krde', 'kar de', 'gonna', 'wanna', 'btw', 'तू', 'तुम', 'तेरा', 'तुझे', 'यार', 'भाई', 'अबे', 'अरे', 'ओए', 'चल', 'बिंदास', 'हम्म'];
  const SLANG = ['yaar', 'yar', 'bhai', 'bro', 'dude', 'abe', 'oye', 'chill', 'bindaas', 'lol', 'haha', 'scene', 'jugaad', 'bakchodi', 'यार', 'भाई', 'अबे', 'ओए', 'बिंदास'];
  const POLITE = ['please', 'plz', 'kripya', 'krupya', 'thanks', 'thank', 'shukriya', 'dhanyavad', 'kindly', 'ji', 'कृपया', 'शुक्रिया', 'धन्यवाद', 'जी'];
  const EMOJI_RE = /\p{Extended_Pictographic}/gu;

  /* emotion lexicons: [word or phrase, weight]. Latin entries match whole words/phrases, Devanagari entries match as substrings. */
  const EMO = {
    joy: [['khush', 1], ['khushi', 1], ['mast', .7], ['badhiya', 1], ['badiya', 1], ['zabardast', 1.2], ['shandaar', 1.2], ['maza', .8], ['maja', .8], ['kamaal', 1], ['great', 1], ['awesome', 1.2], ['happy', 1], ['wonderful', 1.1], ['amazing', 1.1], ['love it', 1.2], ['yay', 1], ['perfect', .9], ['bahut accha', 1], ['very good', .9], ['खुश', 1], ['बढ़िया', 1], ['शानदार', 1.2], ['मज़ा', .8], ['कमाल', 1], ['ज़बरदस्त', 1.2], ['बहुत अच्छा', 1], ['😊', .8], ['😀', .8], ['😄', .9], ['😁', .9], ['🎉', 1], ['👍', .6], ['❤', .8], ['🥳', 1]],
    thanks: [['shukriya', 1], ['dhanyavad', 1], ['dhanyawad', 1], ['thanks', 1], ['thank you', 1.2], ['thx', .8], ['tysm', 1], ['aabhar', 1], ['आभार', 1], ['शुक्रिया', 1], ['धन्यवाद', 1], ['🙏', .8]],
    sad: [['udaas', 1.2], ['udas', 1.2], ['dukhi', 1.2], ['dukh', 1], ['rona', 1], ['ro raha', 1.2], ['ro rahi', 1.2], ['bura lag', 1], ['akela', .9], ['sad', 1], ['unhappy', 1], ['depressed', 1.4], ['hopeless', 1.4], ['heartbroken', 1.4], ['man nahi', .9], ['मन नहीं', .9], ['उदास', 1.2], ['दुखी', 1.2], ['दुख', 1], ['रोना', 1], ['बुरा लग', 1], ['अकेला', .9], ['निराश', 1.1], ['😢', 1], ['😭', 1.2], ['😞', 1], ['💔', 1.2]],
    anger: [['gussa', 1.2], ['naraz', 1], ['chidh', 1], ['chid', 1], ['bakwas', 1], ['faltu', .8], ['hate', 1.2], ['angry', 1.2], ['annoyed', 1], ['irritat', 1], ['pagal kar', 1.2], ['frustrat', 1.2], ['wtf', 1.4], ['stupid', 1], ['गुस्सा', 1.2], ['ग़ुस्सा', 1.2], ['नाराज़', 1], ['बकवास', 1], ['चिढ़', 1], ['झुंझला', 1], ['😡', 1.3], ['🤬', 1.5], ['😠', 1.2]],
    stress: [['tension', 1], ['pareshan', 1], ['pressure', 1.1], ['ghabra', 1.2], ['dar lag', 1], ['bahut kaam', .9], ['overwhelm', 1.4], ['stress', 1.2], ['anxious', 1.2], ['worried', 1], ['panic', 1.4], ['time nahi', .9], ['itna kaam', .9], ['deadline', .5], ['nahi ho payega', 1.1], ['too much', .8], ['टेंशन', 1], ['परेशान', 1], ['दबाव', 1.1], ['घबरा', 1.2], ['चिंता', 1.1], ['बहुत काम', .9], ['समय नहीं', .9], ['इतना काम', .9], ['😰', 1.2], ['😫', 1.1], ['😩', 1], ['😖', 1.1]],
    tired: [['thak', 1.1], ['thaka', 1.2], ['thaki', 1.2], ['thakan', 1.2], ['neend', 1], ['nind', 1], ['sleepy', 1], ['tired', 1.1], ['exhausted', 1.4], ['drained', 1.2], ['burnout', 1.5], ['aaram', .6], ['थक', 1.1], ['थका', 1.2], ['थकान', 1.2], ['नींद', 1], ['आराम', .6], ['😴', 1.1], ['🥱', 1]],
    excited: [['excited', 1.2], ['josh', 1.1], ['jazbaa', 1], ['cant wait', 1.2], ["can't wait", 1.2], ['lets go', 1], ["let's go", 1], ['chalo shuru', .9], ['ho jaye', .3], ['जोश', 1.1], ['उत्साह', 1.1], ['चलो शुरू', .9], ['🔥', 1], ['🚀', 1], ['🤩', 1.2]],
    confused: [['samajh nahi', 1.2], ['samajh nhi', 1.2], ['confus', 1], ['kya matlab', 1], ['pata nahi', .8], ['dont understand', 1.2], ["don't understand", 1.2], ['unclear', 1], ['ulajh', 1], ['समझ नहीं', 1.2], ['उलझन', 1], ['क्या मतलब', 1], ['पता नहीं', .8], ['🤔', .6], ['😕', .8]],
    bored: [['bore', 1], ['boring', 1], ['kuch nahi karna', .8], ['time pass', .8], ['बोर', 1], ['टाइम पास', .8], ['😐', .3], ['🙄', .6]]
  };
  const BOOST = ['bahut', 'bohot', 'bilkul', 'kaafi', 'very', 'so', 'really', 'extremely', 'बहुत', 'बिल्कुल', 'काफ़ी', 'काफी'];
  const NEG = ['nahi', 'nhi', 'na', 'not', 'no', 'never', 'mat', _t("नहीं"), 'मत', 'ना'];

  /* token range [i, j) where phrase p occurs (word / phrase match, prefix allowed for longer words), or null */
  function phraseAt(toks, p) {
    const pw = p.split(' ');
    for (let i = 0; i + pw.length <= toks.length; i++) {
      let ok = true;
      for (let k = 0; k < pw.length && ok; k++) { const w = toks[i + k], q = pw[k]; ok = w === q || (pw.length === 1 && q.length >= 5 && w.startsWith(q)) || (!/^[\x00-\x7f]+$/.test(q) && w.startsWith(q)); }
      if (ok) return [i, i + pw.length];
    }
    return null;
  }
  /* -> {scores:{emotion:0..}, top, intensity 0..1, valence -1..1, arousal 0..1} */
  function emotion(text) {
    const t = norm(text), toks = words(t), scores = {};
    const ex = (String(text).match(/!/g) || []).length, caps = (String(text).match(/\b[A-Z]{3,}\b/g) || []).length;
    const stretch = /(.)\1{2,}/.test(t) ? 1 : 0;
    Object.keys(EMO).forEach(k => {
      let s = 0;
      EMO[k].forEach(([p, w]) => {
        let v = w;
        const isWord = !/^[^\p{L}]+$/u.test(p);                               // emoji / symbols: plain substring
        if (isWord) {
          const r = phraseAt(toks, p); if (!r) return;
          const before = toks.slice(Math.max(0, r[0] - 2), r[0]), after = toks.slice(r[1], r[1] + 2);
          if (before.some(x => BOOST.includes(x))) v *= 1.4;
          if (before.some(x => NEG.includes(x)) || after.some(x => NEG.includes(x))) v = -v * 0.6;   // "khush nahi", "not tired" (negation outside the phrase itself)
        } else if (!t.includes(p)) return;
        s += v;
      });
      scores[k] = s;
    });
    if (scores.joy < 0) { scores.sad += -scores.joy * 0.7; scores.joy = 0; }   // "not happy" leans sad
    Object.keys(scores).forEach(k => { if (scores[k] < 0) scores[k] = 0; });
    const boost = 1 + Math.min(0.6, ex * 0.15 + caps * 0.2 + stretch * 0.2);
    Object.keys(scores).forEach(k => { if (scores[k] > 0 && k !== 'thanks') scores[k] *= boost; });
    let top = null, best = 0; Object.entries(scores).forEach(([k, v]) => { if (v > best) { best = v; top = k; } });
    const pos = scores.joy + scores.thanks * 0.6 + scores.excited, neg = scores.sad + scores.anger + scores.stress + scores.tired * 0.5 + scores.bored * 0.3;
    const total = pos + neg + scores.confused * 0.3;
    const arousal = clamp((scores.excited + scores.anger + scores.stress * 0.8 + scores.joy * 0.4 + ex * 0.1) / 3 + 0.15, 0, 1);
    return { scores, top: best >= 0.5 ? top : null, intensity: clamp(best / 2.2, 0, 1), valence: total ? clamp((pos - neg) / (total + 1), -1, 1) : 0, arousal: total ? arousal : 0.2 };
  }

  M.emotion = emotion;
  /* how the user writes */
  function analyze(text, TR) {
    const s = String(text || ''), w = words(s), n = Math.max(1, w.length);
    const dev = (s.match(/[ऀ-ॿ]/g) || []).length, lat = (s.match(/[A-Za-z]/g) || []).length, letters = Math.max(1, dev + lat);
    let hgShare = 0;
    if (lat) {
      if (TR && TR.analyze) { const a = TR.analyze(s); hgShare = a.alpha ? Math.min(1, (a.hi + a.strong * 0.5) / Math.max(1, a.alpha - a.neutral)) : 0; }
      else hgShare = w.filter(x => /^(hai|hain|kya|kaise|kab|nahi|nhi|aur|bhi|abhi|aaj|kal|karo|karna|batao|mujhe|mera|aap|yeh|woh|kuch|bahut|accha|theek|haan|ho|gaya|kar|de|do|raha|rahi)$/.test(x)).length / n;
    }
    const roman = lat / letters, deva = dev / letters;
    const lang = deva > 0.5 ? 'devanagari' : (hgShare >= 0.2 && roman > 0.5) ? 'hinglish' : deva > 0.15 ? 'mixed' : 'english';
    const cnt = list => w.reduce((c, x) => c + (list.includes(x) ? 1 : 0), 0) + list.filter(p => p.includes(' ') && norm(s).includes(p)).length;
    const f = cnt(FORMAL), c = cnt(CASUAL);
    const noPunct = !/[.,!?।]/.test(s) && n >= 3, allLower = lat > 3 && s === s.toLowerCase();
    return {
      words: w.length, deva, roman, hg: hgShare, lang,
      formal: clamp(0.5 + (f - c) * 0.22 - (noPunct ? 0.05 : 0) - (allLower ? 0.05 : 0), 0, 1),
      polite: cnt(POLITE) > 0 ? 1 : 0, slang: cnt(SLANG) > 0 ? 1 : 0,
      emoji: (s.match(EMOJI_RE) || []).length, excl: (s.match(/!/g) || []).length, q: /\?|？/.test(s) || /^(kya|kaise|kab|kahan|kyun|kitna|what|how|when|where|why|क्या|कैसे|कब|कहाँ|क्यों|कितना)\b/.test(norm(s)) ? 1 : 0,
      emo: emotion(s)
    };
  }

  M.analyze = analyze;

  /* ------------------------------------------------------------------ profile ------------------------------------------------------------------ */
  M.newProfile = () => ({ n: 0, first: Date.now(), ema: { words: 8, formal: 0.5, polite: 0, slang: 0, emoji: 0, excl: 0, q: 0.3, deva: 0.5, roman: 0.3, hg: 0.2 }, hours: new Array(24).fill(0), emo: {}, recent: [], addr: {} });
  M.learn = function (p, f, now) {
    p.n++; const a = Math.max(0.08, 1 / p.n);
    ['words', 'formal', 'polite', 'slang', 'emoji', 'excl', 'q', 'deva', 'roman', 'hg'].forEach(k => { p.ema[k] = p.ema[k] + a * ((f[k] === undefined ? p.ema[k] : k === 'emoji' ? Math.min(1, f.emoji / 2) : k === 'excl' ? Math.min(1, f.excl / 2) : f[k]) - p.ema[k]); });
    p.hours[new Date(now || Date.now()).getHours()]++;
    if (f.emo.top) p.emo[f.emo.top] = (p.emo[f.emo.top] || 0) + f.emo.intensity;
    p.recent.push({ at: now || Date.now(), top: f.emo.top, val: f.emo.valence, int: f.emo.intensity }); if (p.recent.length > 12) p.recent.shift();
    return p;
  };
  /* reply style derived from the profile (defaults until there is enough data) */
  M.styleOf = function (p) {
    const conf = clamp(p.n / 25, 0, 1);
    if (p.n < 5) return { conf, register: 'neutral', brevity: 'normal', script: 'devanagari', emoji: false, warmth: 0.5, energy: 0.4, lang: 'devanagari', ready: false };
    const e = p.ema;
    const lang = e.deva > 0.5 ? 'devanagari' : (e.hg >= 0.2 && e.roman > 0.5) ? 'hinglish' : e.deva > 0.15 ? 'mixed' : 'english';
    return {
      conf, ready: true, lang,
      register: e.formal > 0.62 ? 'formal' : e.formal < 0.38 ? 'casual' : 'neutral',
      brevity: e.words < 5 ? 'short' : e.words > 18 ? 'long' : 'normal',
      script: lang === 'hinglish' ? 'roman' : 'devanagari',
      emoji: e.emoji > 0.12, warmth: clamp(0.4 + e.polite * 0.4 + e.emoji * 0.4, 0, 1), energy: clamp(e.excl * 0.8 + 0.25, 0, 1)
    };
  };

  /* ------------------------------------------------------------------ facts ------------------------------------------------------------------ */
  const NAME = /(?:mera naam|my name is|main hoon|naam hai)\s+([\p{L}][\p{L}\s]{1,24}?)(?:\s+(?:hai|hoon|hun|hu|h)\b|[.,!]|$)|मेरा नाम\s+([ऀ-ॿ][ऀ-ॿ\s]{1,20}?)(?:\s+है|[.,!।]|$)/iu;
  M.extractFacts = function (text) {
    const s = String(text || '').trim(), t = norm(s), out = [];
    const add = (key, value, txt, conf) => out.push({ key, value, text: txt, conf: conf || 0.8 });
    let m;
    if ((m = s.match(NAME))) { const v = (m[1] || m[2]).trim().replace(/\s+/g, ' '); if (v.split(' ').length <= 3) add('name', v, 'नाम: ' + v, 0.95); }
    if ((m = t.match(/(?:mujhe|mujhko|call me|mujhe\s+(?:sirf\s+)?)\s*([a-z]+)\s+(?:bulao|bolo|kaho|bulana|bola karo)/) || t.match(/call me\s+([a-z]+)/))) if (!['ko', 'mat', 'nahi'].includes(m[1])) add('addr', m[1], _t("बुलाने का तरीका: {0}", [m[1]]), 0.9);
    if ((m = s.match(/मुझे\s+([ऀ-ॿ]+)\s+(?:बुलाओ|बोलो|कहो|बुलाना)/))) add('addr', m[1], _t("बुलाने का तरीका: {0}", [m[1]]), 0.9);
    if (/(sir|सर)\s+(mat|मत)\s+(bolo|kaho|बोलो|कहो)/.test(t)) add('addr', 'नाम', 'सर मत कहो', 0.8);
    const wk = t.match(/(?:subah|morning)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:baje|am|a\.m)?\s*(?:uth|jaag|wake|get up)/) || t.match(/(?:wake up|get up|uthta|uthti|jagta|jagti)[a-z\s]*?(?:at|around|lagbhag)?\s*(\d{1,2})(?::(\d{2}))?/) || s.match(/(?:सुबह)?\s*(\d{1,2})\s*बजे\s*(?:उठ|जाग)/);
    if (wk && +wk[1] >= 3 && +wk[1] <= 11) add('wake_time', String(+wk[1]).padStart(2, '0') + ':' + String(+(wk[2] || 0)).padStart(2, '0'), 'उठने का समय: ' + wk[1] + ' बजे', 0.7);
    const sl = t.match(/(?:raat|night)?\s*(\d{1,2})(?::(\d{2}))?\s*(?:baje|pm|p\.m)?\s*(?:so\b|sota|soti|sleep|bed)/) || s.match(/(?:रात)?\s*(\d{1,2})\s*बजे\s*(?:सो)/);
    if (sl && (+sl[1] >= 9 || +sl[1] <= 5 || +sl[1] === 12)) { const h0 = +sl[1], hh = h0 >= 9 && h0 <= 11 ? h0 + 12 : h0 === 12 ? 0 : h0; add('sleep_time', String(hh).padStart(2, '0') + ':' + String(+(sl[2] || 0)).padStart(2, '0'), 'सोने का समय: ' + sl[1] + ' बजे', 0.7); }
    if ((m = t.match(/(?:main|mai|i)\s+(.{2,30}?)\s+(?:me|mein|at|in)\s+(?:kaam|work|job)\s*(?:karta|karti|kar raha|kar rahi|hu|hun|hoon)?/) || t.match(/i work (?:at|in|for)\s+([a-z0-9 &.]{2,30})/) || t.match(/meri job\s+(.{2,30}?)\s+(?:me|mein|hai)/))) add('work', m[1].trim(), 'काम: ' + m[1].trim(), 0.6);
    if ((m = t.match(/(?:main|mai|i)\s+([a-z]{3,20})\s+(?:me|mein)\s+(?:rehta|rehti|rahta|rahti)/) || t.match(/i live in\s+([a-z ]{3,20})/))) add('city', m[1].trim(), 'शहर: ' + m[1].trim(), 0.7);
    if ((m = t.match(/mujhe\s+(.{2,30}?)\s+(?:bahut\s+)?pasand\s+(?:hai|h)/) || t.match(/i (?:really )?(?:like|love|enjoy)\s+(.{2,30}?)(?:[.,!]|$)/))) add('like:' + m[1].trim(), m[1].trim(), 'पसंद: ' + m[1].trim(), 0.6);
    if ((m = s.match(/मुझे\s+(.{2,30}?)\s+पसंद\s+है/))) add('like:' + m[1].trim(), m[1].trim(), 'पसंद: ' + m[1].trim(), 0.6);
    if ((m = t.match(/mujhe\s+(.{2,30}?)\s+(?:bilkul\s+)?(?:pasand nahi|nahi pasand|pasand nhi)/) || t.match(/i (?:hate|dislike)\s+(.{2,30}?)(?:[.,!]|$)/))) add('dislike:' + m[1].trim(), m[1].trim(), 'नापसंद: ' + m[1].trim(), 0.6);
    if ((m = t.match(/(?:mera goal|my goal|is hafte(?: ka)? (?:goal|lakshya)|this week(?:'s)? goal)\s*(?:hai|is|:)?\s*(.{3,80})/))) add('goal_week', m[1].trim(), 'इस हफ़्ते का लक्ष्य: ' + m[1].trim(), 0.7);
    return out;
  };

  /* ------------------------------------------------------------------ voice feedback (spoken) ------------------------------------------------------------------ */
  /* returns {sp,noise,st,good,ask} deltas implied by a spoken remark about Piyu's voice, or null */
  M.voiceRemark = function (text) {
    const t = norm(text);
    const NOUN = /(aawaz|awaaz|awaz|आवाज़|आवाज|voice|speed|tone|lehja|लहजा|speaking|bolne ki|बोलने की)/;
    const slowCmd = /(dheere|dhire|धीरे)\s*(se\s*)?(bolo|bol|बोलो|bolna|बोलना)|(slow down|speak slower|talk slower|slower please)/;
    const fastCmd = /(speak faster|talk faster|faster please)/;
    if (!NOUN.test(t) && !slowCmd.test(t) && !fastCmd.test(t)) return null;          // "abe jaldi bol" alone is NOT a remark about her voice
    const r = { sp: 0, noise: 0, st: 0, good: 0 };
    if (slowCmd.test(t) || (NOUN.test(t) && /(dheer|dhire|dhima|slow|धीरे|धीमा|धीमी)/.test(t))) r.sp += 0.06;
    if (fastCmd.test(t) || (NOUN.test(t) && /(tez|jaldi|fast|तेज़|तेज|जल्दी)/.test(t))) r.sp -= 0.06;
    if (NOUN.test(t) && /(expressive|khul ke|jaan daal|lively|emotion|भाव|जान डाल)/.test(t)) r.noise += 0.06;
    if (NOUN.test(t) && /(flat|robotic|monotone|shaant|calm down|शांत|सपाट)/.test(t)) r.noise -= 0.06;
    if (NOUN.test(t) && /(patli|patla|unchi|ooncha|higher|sharp|पतली|ऊँची|ऊंची)/.test(t)) r.st += 0.5;
    if (NOUN.test(t) && /(bhaari|bhari|gehri|deeper|lower|heavy|भारी|गहरी)/.test(t)) r.st -= 0.5;
    if (/(achhi|acchi|accha|badhiya|perfect|nice|good|sahi|अच्छी|बढ़िया|सही|मस्त).*(awaaz|awaz|voice|आवाज़|आवाज)|(awaaz|awaz|voice|आवाज़|आवाज).*(achhi|acchi|accha|badhiya|perfect|nice|good|sahi|अच्छी|बढ़िया|सही|मस्त)/.test(t)) r.good = 1;
    return (r.sp || r.noise || r.st || r.good) ? r : null;
  };

  /* ------------------------------------------------------------------ mind state ------------------------------------------------------------------ */
  M.newMind = () => ({ on: true, profile: M.newProfile(), voice: {}, asked: {}, answered: {}, skips: {}, pending: null, lastAsk: 0, insights: [], lastLearn: '', updatedAt: 0 });
  M.ctxKey = (now, mood) => { const h = new Date(now).getHours(); return (h >= 22 || h < 6 ? 'night' : h >= 17 ? 'eve' : 'day') + '|' + (mood || 'calm'); };
  const VB = { sp: [-0.2, 0.2], noise: [-0.2, 0.2], st: [-2, 2] };
  const vget = (mind, k) => (mind.voice[k] = mind.voice[k] || { sp: 0, noise: 0, st: 0, good: 0, n: 0 });
  /* nudge preferences (bounded); when a context was praised recently, changes are damped so it settles */
  M.voiceNudge = function (mind, ctx, d, weight) {
    const v = vget(mind, ctx), damp = 1 / (1 + v.good * 0.5), w = (weight || 1) * damp;
    ['sp', 'noise', 'st'].forEach(k => { if (d[k]) v[k] = clamp(v[k] + d[k] * w, VB[k][0], VB[k][1]); });
    if (d.good) v.good++;
    v.n++; mind.updatedAt = Date.now(); return v;
  };
  /* the delta applied on top of the style: context-specific + half of the global preference */
  M.voiceDelta = function (mind, ctx) {
    if (!mind || !mind.on) return null;
    const c = mind.voice[ctx] || {}, g = mind.voice['*'] || {}, k = x => (c[x] || 0) + 0.5 * (g[x] || 0);
    const d = { sp: clamp(k('sp'), -0.2, 0.2), noise: clamp(k('noise'), -0.2, 0.2), st: clamp(k('st'), -2, 2) };
    return (d.sp || d.noise || d.st) ? d : null;
  };
  /* slow forgetting so an old, un-praised preference fades (called once a day) */
  M.voiceDecay = function (mind) { Object.values(mind.voice).forEach(v => { if (v.good < 2) ['sp', 'noise', 'st'].forEach(k => { v[k] = +(v[k] * 0.97).toFixed(4); }); }); };

  /* ------------------------------------------------------------------ episodes, daily summaries, recall ------------------------------------------------------------------ */
  const STOP = new Set(_t("a an the and or of to in on at for is are was be it this that with as by from i you we he she they my me your our not no yes ok hai hain ho hoga tha thi ka ki ke ko se me mein par pe aur ya bhi nahi kya kaise karo karna kar de do abhi aaj kal mujhe mera meri aap yeh woh kuch bahut accha theek haan बहुत है हैं का की के को से में पर और या भी नहीं क्या कैसे करो करना कर दे दो अभी आज कल मुझे मेरा मेरी आप यह वह कुछ अच्छा ठीक हाँ").split(' '));
  const topicsOf = list => { const c = {}; list.forEach(t => words(t).forEach(w => { if (w.length >= 4 && !STOP.has(w) && !/^\d+$/.test(w)) c[w] = (c[w] || 0) + 1; })); return Object.entries(c).sort((a, b) => b[1] - a[1]).slice(0, 3).map(x => x[0]); };
  const moodWord = v => v > 0.25 ? 'सकारात्मक' : v < -0.25 ? 'भारी/थका हुआ' : _t("सामान्य");

  M.addEpisode = function (state, ep, now) {
    state.episodes = state.episodes || [];
    const e = Object.assign({ id: uid(), at: now || Date.now(), kind: 'user', text: '', tags: [] }, ep);
    e.text = String(e.text || '').slice(0, 240);
    state.episodes.push(e);
    if (state.episodes.length > 300) state.episodes.splice(0, state.episodes.length - 300);
    return e;
  };
  /* raw episodes older than `keepDays` become one summary per day; returns true if anything changed */
  M.consolidate = function (state, now, tasks, keepDays) {
    keepDays = keepDays == null ? 3 : keepDays;
    state.days = state.days || []; state.episodes = state.episodes || [];
    const cutoff = (now || Date.now()) - keepDays * DAY, old = state.episodes.filter(e => e.at < cutoff);
    if (!old.length) return false;
    const byDay = {}; old.forEach(e => { (byDay[dkey(e.at)] = byDay[dkey(e.at)] || []).push(e); });
    Object.entries(byDay).forEach(([day, eps]) => {
      const users = eps.filter(e => e.kind === 'user'), vals = users.map(e => (e.emo && e.emo.val) || 0), avg = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0;
      const emoCount = {}; users.forEach(e => { if (e.emo && e.emo.top) emoCount[e.emo.top] = (emoCount[e.emo.top] || 0) + 1; });
      const topEmo = Object.entries(emoCount).sort((a, b) => b[1] - a[1])[0];
      const done = (tasks || []).filter(t => t.done && t.doneAt && dkey(t.doneAt) === day).length;
      const snoozes = eps.filter(e => e.kind === 'snooze').length, rings = eps.filter(e => e.kind === 'ring').length;
      const topics = topicsOf(users.map(e => e.text));
      const rec = { id: day, day, msgs: users.length, mood: +avg.toFixed(2), emo: topEmo ? topEmo[0] : null, done, snoozes, rings, topics,
        summary: _t("{0}: {1} संदेश · मूड {2}{3} · {4} काम पूरे{5}{6}", [day, users.length, moodWord(avg), (topEmo ? ' (' + topEmo[0] + ')' : ''), done, (snoozes ? _t(" · {0} बार snooze", [snoozes]) : ''), (topics.length ? _t(" · विषय: {0}", [topics.join(', ')]) : '')]) };
      const ix = state.days.findIndex(d => d.id === day);
      if (ix >= 0) { const o = state.days[ix]; rec.msgs += o.msgs; rec.done = Math.max(rec.done, o.done); rec.snoozes += o.snoozes; rec.rings += o.rings; state.days[ix] = Object.assign(o, rec); } else state.days.push(rec);
    });
    state.episodes = state.episodes.filter(e => e.at >= cutoff);
    state.days.sort((a, b) => a.id < b.id ? -1 : 1); if (state.days.length > 120) state.days.splice(0, state.days.length - 120);
    return true;
  };
  /* what does Piyu remember that is relevant to `query`? */
  M.recall = function (state, query, n, now) {
    const q = new Set(words(query).filter(w => w.length > 2 && !STOP.has(w)));
    if (!q.size) return [];
    const T = now || Date.now(), out = [];
    const score = (text, at, base) => { const ws = words(text); let s = 0; ws.forEach(w => { if (q.has(w)) s++; }); if (!s) return 0; return (s + base) * (at ? 1 / (1 + (T - at) / (30 * DAY)) : 1); };
    (state.facts || []).forEach(f => { const s = score(f.text + ' ' + f.value, f.at, 0.6); if (s) out.push({ s, src: 'fact', text: f.text, at: f.at }); });
    (state.days || []).forEach(d => { const s = score(d.summary, new Date(d.id).getTime(), 0.2); if (s) out.push({ s, src: 'day', text: d.summary, at: new Date(d.id).getTime() }); });
    (state.episodes || []).forEach(e => { if (e.kind !== 'user') return; const s = score(e.text, e.at, 0); if (s) out.push({ s, src: 'said', text: e.text, at: e.at }); });
    return out.sort((a, b) => b.s - a.s).slice(0, n || 3);
  };

  /* ------------------------------------------------------------------ situation + empathy + tone shaping ------------------------------------------------------------------ */
  M.situation = function (ctx, profile) {
    const now = ctx.now || Date.now(), h = new Date(now).getHours(), tags = [];
    const part = h >= 22 || h < 6 ? 'night' : h >= 17 ? 'eve' : 'day';
    if (part === 'night') tags.push('late_night');
    if ((ctx.overdue || 0) >= 3) tags.push('backlog');
    if ((ctx.streak || 0) >= 3) tags.push('streak');
    if ((ctx.doneToday || 0) >= 3) tags.push('productive');
    if (ctx.focus) tags.push('focus'); if (ctx.quiet) tags.push('quiet');
    // recent mood with a 3-hour half-life
    let v = 0, wsum = 0; ((profile && profile.recent) || []).forEach(r => { const w = Math.pow(0.5, (now - r.at) / (3 * 3600e3)); v += (r.val || 0) * w; wsum += w; });
    const mood = wsum > 0.05 ? v / wsum : 0;
    if (mood < -0.3) tags.push('low_mood'); if (mood > 0.3) tags.push('good_mood');
    return { part, tags, mood };
  };
  const E = {
    formal: {
      stress: [_t("लगता है काफ़ी दबाव है। घबराइए मत, हम एक-एक करके निपटा लेंगे।"), _t("थोड़ी गहरी साँस लीजिए। मैं हूँ न, सबसे छोटा काम पहले कर लेते हैं।")],
      tired_day: [_t("आप थके हुए लग रहे हैं। पाँच मिनट का ब्रेक ले लीजिए, फिर आगे बढ़ते हैं।")],
      tired_night: [_t("इतनी रात हो गई है और आप थके हैं। जो ज़रूरी नहीं, उसे कल पर डाल दें?")],
      sad: [_t("मुझे अफ़सोस है कि आपको ऐसा लग रहा है। मैं यहीं हूँ, कुछ कहना चाहें तो मैं सुन रही हूँ।")],
      anger: [_t("आपकी झुंझलाहट मैं समझ सकती हूँ। चलिए, इसे सुलझाते हैं।")],
      joy: [_t("वाह, बहुत बढ़िया!"), _t("यह तो कमाल की बात है!")],
      excited: [_t("आपका जोश देखकर अच्छा लगा! चलिए शुरू करते हैं।")],
      thanks: [_t("आपका स्वागत है।"), _t("कोई बात नहीं, यही तो मेरा काम है।")],
      confused: [_t("कोई बात नहीं, मैं आसान तरीके से समझाती हूँ।")],
      bored: [_t("बोरियत दूर करने के लिए कोई छोटा-सा काम चुन लें?")]
    },
    casual: {
      stress: [_t("अरे, टेंशन मत लीजिए! एक-एक करके निपटा देंगे।"), _t("चलिए आराम से, सबसे छोटा काम पहले। हो जाएगा!")],
      tired_day: [_t("थोड़ा ब्रेक बनता है! पाँच मिनट आराम कर लीजिए।")],
      tired_night: [_t("बहुत रात हो गई, अब आराम कीजिए। बाकी कल देख लेंगे।")],
      sad: [_t("अरे, मन उदास है क्या? मैं यहीं हूँ, बात करना चाहें तो बताइए।")],
      anger: [_t("समझ सकती हूँ, गुस्सा आना जायज़ है। चलिए इसे ठीक करते हैं।")],
      joy: [_t("वाह वाह, मज़ा आ गया!"), _t("बढ़िया है, यही तो चाहिए था!")],
      excited: [_t("यह हुई न बात! चलिए शुरू करते हैं!")],
      thanks: [_t("अरे कोई बात नहीं, हमेशा हाज़िर हूँ।")],
      confused: [_t("कोई नहीं, आसान भाषा में बताती हूँ।")],
      bored: [_t("चलिए कुछ हल्का-फुल्का काम निपटा लें?")]
    }
  };
  const E_EN = { stress: 'You sound under pressure. Take a breath: we will do it one small step at a time.', tired_day: 'You seem tired. Take a five-minute break, then we continue.', tired_night: 'It is late and you are tired. Shall we push whatever is not urgent to tomorrow?', sad: 'I am sorry you feel that way. I am here if you want to talk.', anger: 'I understand the frustration. Let us sort it out together.', joy: 'That is wonderful!', excited: 'Love the energy. Let us start!', thanks: 'You are welcome.', confused: 'No problem, I will explain it simply.', bored: 'How about a small, easy task to break the boredom?' };
  const MOODS_FOR = { stress: 'gentle', tired: 'gentle', sad: 'gentle', anger: 'gentle', joy: 'cheerful', excited: 'cheerful', thanks: 'calm', confused: 'calm', bored: 'calm' };
  const pick = (a, seed) => a[Math.abs(seed | 0) % a.length];

  /* -> {pre, mood, top} (pre may be '') */
  M.empathy = function (emo, sit, style, opts) {
    opts = opts || {};
    if (!emo || !emo.top) return { pre: '', mood: null, top: null };
    const top = emo.top, night = sit && sit.part === 'night';
    const key = top === 'tired' ? (night ? 'tired_night' : 'tired_day') : top;
    let pre;
    if (opts.lang === 'en') pre = E_EN[key];
    else { const reg = style && style.register === 'casual' ? E.casual : E.formal; const arr = reg[key] || E.formal[key]; pre = arr ? pick(arr, opts.seed || 0) : ''; }
    if (!pre) return { pre: '', mood: null, top };
    if (opts.lang !== 'en') {
      if (top === 'stress' && opts.smallTask) pre += _t(" {0}सबसे छोटा काम \"{1}\" से शुरू करें?", [(sit && sit.tags.includes('backlog') ? _t("पुराने {0} काम बाकी हैं; ", [(opts.overdue || '')]) : ''), opts.smallTask]);
      if ((top === 'joy' || top === 'excited') && sit && sit.tags.includes('streak') && opts.streak) pre += _t(" और {0} दिन का streak भी चल रहा है!", [opts.streak]);
    }
    if (style && style.emoji && ['joy', 'excited', 'thanks'].includes(top)) pre += top === 'thanks' ? ' 🙂' : ' 🎉';
    return { pre, mood: MOODS_FOR[top] || null, top };
  };

  /* Devanagari -> Roman Hinglish (for users who write in Roman) */
  const R = { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l', 'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'r', 'ढ़': 'rh', 'फ़': 'f' };
  const RV = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'i', 'उ': 'u', 'ऊ': 'u', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऑ': 'o' };
  const RM = { 'ा': 'aa', 'ि': 'i', 'ी': 'i', 'ु': 'u', 'ू': 'u', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॉ': 'o' };
  const WORDS = { 'है': 'hai', 'हैं': 'hain', 'में': 'mein', 'मैं': 'main', 'नहीं': 'nahi', 'और': 'aur', 'क्या': 'kya', 'यह': 'yeh', 'वह': 'woh', 'को': 'ko', 'से': 'se', 'का': 'ka', 'की': 'ki', 'के': 'ke', 'पर': 'par', 'सर': 'sir', 'जी': 'ji', 'हाँ': 'haan', 'कैसे': 'kaise', 'कब': 'kab', 'क्यों': 'kyun', 'आप': 'aap', 'आपको': 'aapko', 'आपका': 'aapka', 'आपके': 'aapke', 'आज': 'aaj', 'कल': 'kal', 'काम': 'kaam', 'अभी': 'abhi', 'बहुत': 'bahut', 'ठीक': 'theek', 'अच्छा': 'accha', 'बढ़िया': 'badhiya', 'शुक्रिया': 'shukriya', 'नमस्ते': 'namaste', 'बताऊँगी': 'bataungi', 'बताऊँगा': 'bataunga', 'रही': 'rahi', 'रहा': 'raha', 'हूँ': 'hoon', 'मुझे': 'mujhe', 'हम': 'hum', 'चलिए': 'chaliye', 'जाएगा': 'jayega', 'करें': 'karein', 'करो': 'karo', 'कर': 'kar' };
  M.toRoman = function (text) {
    return String(text).replace(/[ऀ-ॿ]+/g, w => {
      if (WORDS[w]) return WORDS[w];
      const cs = Array.from(w.normalize('NFC')); let out = '';
      for (let i = 0; i < cs.length; i++) {
        const c = cs[i], n = cs[i + 1];
        if (RV[c]) { if (out.endsWith('aa') && /[ओएऐऔईइ]/.test(c)) out = out.slice(0, -1); out += RV[c]; continue; }   // बताओ -> batao
        if (RM[c]) { out += (c === 'ा' && i === cs.length - 1) ? 'a' : (c === 'ी' && i === cs.length - 1) ? 'i' : RM[c]; continue; }
        if (c === 'ं' || c === 'ँ') { out += 'n'; continue; }
        if (c === 'ः') { out += 'h'; continue; }
        if (c === '्') continue;
        if (c === '।') { out += '.'; continue; }
        const two = c + (n === '़' ? '़' : '');
        if (R[two] || R[c]) {
          out += R[two] || R[c]; if (n === '़') i++;
          const nx = cs[i + 1];
          const matra = nx && (RM[nx] || nx === '्');
          if (!matra) {                               // inherent 'a' with simple schwa deletion
            const last = i === cs.length - 1 || (!R[nx] && !(RV[nx]) && nx !== '़' && !RM[nx] && nx !== 'ं' && nx !== 'ँ');
            const prevHasVowel = i > 0;
            const afterIsSyllable = nx && R[nx] && cs[i + 2] && (RM[cs[i + 2]] || cs[i + 2] === '्' ? cs[i + 2] !== '्' : false);
            if (!(last && i === cs.length - 1) && !(prevHasVowel && afterIsSyllable) && nx) out += 'a';
          }
        } else out += c;
      }
      return out;
    });
  };

  /* apply the learnt style to Piyu's own words */
  M.restyle = function (text, style, opts) {
    opts = opts || {};
    let t = String(text);
    if (opts.addr && opts.addr !== 'सर') t = t.replace(/(^|[\s,।!?])सर([\s,।!?]|$)/g, (m, a, b) => a + opts.addr + b);
    if (style && style.ready && style.brevity === 'short' && opts.soft) { const sents = t.split(/(?<=[।.!?])\s+/); if (sents.length > 2) t = sents.slice(0, 2).join(' '); }
    if (style && style.ready && style.script === 'roman' && opts.roman !== false) t = M.toRoman(t);
    return t;
  };
  /* combine empathy + reply. Structured/data replies are kept intact after a short opening. */
  M.shape = function (reply, emo, sit, style, opts) {
    opts = opts || {};
    const em = M.empathy(emo, sit, style, opts);
    let out = reply;
    if (em.pre) {
      if (emo.top === 'thanks' && opts.pure) out = em.pre;
      else if (emo.top === 'thanks') out = reply;                 // a thank-you inside a command: just do the command
      else out = em.pre + (reply ? '\n\n' + reply : '');
    }
    return { text: M.restyle(out, style, opts), spoken: M.restyle(out, style, Object.assign({}, opts, { roman: false })), mood: em.mood, top: em.top, empathic: !!em.pre };
  };

  /* ------------------------------------------------------------------ questions Piyu asks ------------------------------------------------------------------ */
  const H4 = 4 * 3600e3;
  const firstWord = (t, n) => String(t || '').trim().split(/\s+/).slice(0, n || 2).join(' ').replace(/[.!?।,"']/g, '');
  const timeChip = h => ({ l: _t("{0} बजे", [h]), v: String(h).padStart(2, '0') + ':00' });
  const QUESTIONS = [
    { id: 'q_addr', prio: 10, when: c => c.n >= 3 && !c.facts.addr,
      hi: _t("आपको मैं क्या कहकर बुलाऊँ? जैसे \"सर\", \"भाई\", \"जी\" या सिर्फ़ नाम।"), en: 'What should I call you?',
      chips: [{ l: _t("सर"), v: 'सर' }, { l: 'भाई', v: 'भाई' }, { l: 'जी', v: 'जी' }, { l: _t("नाम से"), v: '__name' }], free: true,
      apply: (v, t, c) => { let a = v === '__name' ? (c.facts.name || _t("सर")) : (v || firstWord(t, 2)); if (!a) a = _t("सर"); return { facts: [{ key: 'addr', value: a, text: _t("बुलाने का तरीका: {0}", [a]) }], settings: { call: a }, ack: _t("ठीक है, अब से मैं आपको \"{0}\" कहूँगी।", [a]) }; } },
    { id: 'q_wake', prio: 6, when: c => c.n >= 8 && !c.facts.wake_time && c.hour >= 8 && c.hour <= 21,
      hi: _t("आप आमतौर पर सुबह कितने बजे उठते हैं? इससे मैं सुबह का प्लान सही समय पर बता पाऊँगी।"), en: 'What time do you usually wake up?',
      chips: [5, 6, 7, 8, 9].map(timeChip), free: true,
      apply: (v, t) => { const m = String(v || t).match(/(\d{1,2})(?::(\d{2}))?/); const hh = m ? Math.min(11, Math.max(3, +m[1])) : 7, val = String(hh).padStart(2, '0') + ':' + (m && m[2] ? m[2] : '00'); return { facts: [{ key: 'wake_time', value: val, text: _t("उठने का समय: {0}", [val]) }], follow: 'i_brief_morning:' + val, ack: _t("ठीक है, याद रख लिया: {0} बजे।", [val]) }; } },
    { id: 'q_sleep', prio: 5, when: c => c.n >= 10 && c.facts.wake_time && !c.facts.sleep_time && c.hour >= 18,
      hi: _t("और आप रात को कितने बजे सोते हैं?"), en: 'And what time do you go to bed?',
      chips: [22, 23, 24, 1].map(h => ({ l: _t("{0} बजे{1}", [(h === 24 ? 12 : h > 12 ? h - 12 : h), (h >= 22 || h === 24 ? _t(" रात") : _t(" (रात)"))]), v: String(h === 24 ? 0 : h).padStart(2, '0') + ':00' })), free: true,
      apply: (v, t) => { const m = String(v || t).match(/(\d{1,2})/); let hh = m ? +m[1] : 23; if (hh > 0 && hh < 9) hh += 24; const val = String(hh % 24).padStart(2, '0') + ':00'; return { facts: [{ key: 'sleep_time', value: val, text: _t("सोने का समय: {0}", [val]) }], follow: 'i_quiet_night:' + val, ack: _t("ठीक है, समझ गई।") }; } },
    { id: 'q_lead', prio: 4, when: c => c.n >= 10 && !c.facts.lead_pref,
      hi: _t("काम से कितने मिनट पहले मैं आपको बताऊँ? अभी {pre} मिनट पहले बताती हूँ।"), en: 'How many minutes before a task should I remind you?',
      chips: [5, 10, 15, 30].map(m => ({ l: _t("{0} मिनट", [m]), v: String(m) })), free: true,
      apply: (v, t) => { const m = String(v || t).match(/\d+/); const n = m ? Math.min(60, Math.max(1, +m[0])) : 10; return { facts: [{ key: 'lead_pref', value: String(n), text: _t("चेतावनी: {0} मिनट पहले", [n]) }], settings: { preMin: n }, ack: _t("ठीक है, अब से {0} मिनट पहले बताऊँगी।", [n]) }; } },
    { id: 'q_mood', prio: 7, repeatDays: 1, when: c => c.n >= 4 && c.hour >= 19 && c.hour <= 22,
      hi: _t("आज का दिन कैसा रहा?"), en: 'How was your day?',
      chips: [{ l: _t("😊 बढ़िया"), v: 'joy' }, { l: _t("😐 ठीक-ठाक"), v: 'ok' }, { l: _t("😩 थकाऊ"), v: 'tired' }, { l: _t("😰 दबाव भरा"), v: 'stress' }, { l: _t("😡 परेशान करने वाला"), v: 'anger' }], free: true,
      apply: (v, t) => { const emo = v && v !== 'ok' ? { top: v, val: v === 'joy' ? 0.7 : -0.5, int: 0.8 } : (v === 'ok' ? { top: null, val: 0, int: 0 } : (() => { const e = emotion(t); return { top: e.top, val: e.valence, int: e.intensity }; })()); return { episodes: [{ kind: 'user', text: _t("दिन कैसा रहा: {0}", [(t || v)]), emo: { top: emo.top, val: emo.val } }], mood: emo, ack: '' }; } },
    { id: 'q_voice', prio: 3, repeatDays: 10, when: c => c.daysSinceFirst >= 3 && c.n >= 12,
      hi: _t("मेरी आवाज़ कैसी लग रही है? आप बताएँगे तो मैं उसे अपने आप सुधार लूँगी।"), en: 'How does my voice sound to you?',
      chips: [{ l: _t("👍 बिल्कुल ठीक"), v: 'ok' }, { l: _t("थोड़ी धीमी करें"), v: 'faster' }, { l: _t("थोड़ी तेज़ करें"), v: 'slower' }, { l: _t("ज़्यादा नरम"), v: 'softer' }, { l: _t("ज़्यादा जान डालिए"), v: 'livelier' }], free: false,
      apply: v => { const d = { ok: { good: 1 }, faster: { sp: -0.06 }, slower: { sp: 0.06 }, softer: { noise: -0.06, sp: 0.03 }, livelier: { noise: 0.06, st: 0.3 } }[v]; return { voice: { d: d || {}, ctx: '*' }, ack: v === 'ok' ? _t("शुक्रिया! ऐसे ही बोलती रहूँगी।") : _t("ठीक है, अपनी आवाज़ में बदलाव कर लिया।") }; } },
    { id: 'q_goal', prio: 3, repeatDays: 7, when: c => c.n >= 6 && c.weekday === 1 && c.hour >= 8 && c.hour <= 12,
      hi: _t("इस हफ़्ते का सबसे ज़रूरी लक्ष्य क्या है? मैं उसे याद रखूँगी।"), en: 'What is your most important goal this week?',
      chips: [], free: true,
      apply: (v, t) => { const g = String(t || v).trim().slice(0, 100); return { facts: g ? [{ key: 'goal_week', value: g, text: 'इस हफ़्ते का लक्ष्य: ' + g }] : [], ack: g ? _t("बहुत अच्छा! मैं इसे याद रखूँगी और बीच-बीच में पूछूँगी।") : '' }; } }
  ];

  /* dynamic questions: a task that keeps getting postponed, an insight from the nightly pass */
  function skipQuestion(t) {
    return { id: 'q_skip:' + t.id, prio: 8, hi: _t("\"{0}\" बार-बार टल रहा है। क्या दिक्कत है?", [t.title.slice(0, 50)]), en: '"' + t.title.slice(0, 50) + '" keeps getting postponed. What is the problem?',
      chips: [{ l: _t("समय नहीं मिल रहा"), v: 'time' }, { l: _t("मुश्किल लग रहा"), v: 'hard' }, { l: _t("अब ज़रूरी नहीं"), v: 'drop' }, { l: _t("बस भूल जाता हूँ"), v: 'forget' }], free: false,
      apply: v => ({ facts: [{ key: 'skip:' + t.id, value: v, text: 'टलने का कारण (' + t.title.slice(0, 30) + '): ' + { time: 'समय नहीं', hard: 'मुश्किल', drop: 'ज़रूरी नहीं', forget: 'भूल जाना' }[v] }],
        taskAction: v === 'drop' ? { type: 'offer_delete', id: t.id } : v === 'hard' ? { type: 'offer_steps', id: t.id } : v === 'time' ? { type: 'offer_reschedule', id: t.id } : { type: 'earlier_alert', id: t.id },
        ack: { time: _t("ठीक है, इसे किसी आसान समय पर खिसका देती हूँ।"), hard: _t("समझ गई। इसे छोटे-छोटे स्टेप में बाँट देते हैं (Guide से)।"), drop: _t("ठीक है, चाहें तो इसे हटा दीजिए। मैं याद नहीं दिलाऊँगी।"), forget: _t("ठीक है, इसके लिए मैं थोड़ा पहले याद दिलाऊँगी।") }[v] }) };
  }
  function insightQuestion(ins) {
    return { id: ins.id, prio: 5, hi: ins.hi, en: ins.en || ins.hi, chips: [{ l: _t("हाँ, कर दीजिए"), v: 'yes' }, { l: _t("नहीं, जैसा है वैसा रहने दें"), v: 'no' }], free: false,
      apply: v => v === 'yes' ? { settings: ins.settings || {}, facts: ins.fact ? [ins.fact] : [], ack: ins.ack || _t("ठीक है, बदल दिया।") } : { facts: [], ack: _t("ठीक है, जैसा है वैसा ही रखूँगी।") } };
  }
  const ADDR_DEV = { sir: _t("सर"), ji: 'जी', bhai: 'भाई', boss: 'बॉस', dost: 'दोस्त', yaar: 'यार', beta: 'बेटा', didi: 'दीदी', madam: 'मैडम', sahab: 'साहब', guru: _t("गुरु"), bro: 'ब्रो', bhaiya: 'भैया', sirji: 'सरजी' };
  M.addrDev = a => { const k = String(a || '').trim().toLowerCase(); return ADDR_DEV[k] || (/^[\x00-\x7f ]+$/.test(a) && root.PiyuTranslit ? a.split(' ').map(w => root.PiyuTranslit.word(w, true)).join(' ') : a); };
  M.QUESTIONS = QUESTIONS;
  /* the pending question is stored as plain data (survives save/sync); functions are rebuilt from it */
  function resolveQ(meta) {
    if (!meta) return null;
    if (meta.kind === 'static') return QUESTIONS.find(q => q.id === meta.id) || null;
    if (meta.kind === 'skip') return skipQuestion(meta.payload);
    if (meta.kind === 'insight') return insightQuestion(meta.payload);
    return null;
  }
  M.resolveQ = resolveQ;
  const factMap = facts => (facts || []).reduce((m, f) => (m[f.key] = f.value, m), {});

  /* which question (if any) should Piyu ask now? */
  M.pickQuestion = function (mind, state, ctx) {
    const now = ctx.now || Date.now();
    if (!mind || !mind.on || ctx.quiet || ctx.focus || ctx.ring || ctx.guide) return null;
    if (mind.pending && mind.pending.expires > now) return null;
    if (now - (mind.lastAsk || 0) < H4) return null;
    const day = dkey(now); if ((mind.asked[day] || []).length >= 3) return null;
    const c = Object.assign({ n: mind.profile.n, facts: factMap(state.facts), hour: new Date(now).getHours(), weekday: new Date(now).getDay(), daysSinceFirst: (now - mind.profile.first) / DAY }, ctx);
    const okId = q => {
      const ans = mind.answered[q.id], sk = mind.skips[q.id];
      if (sk && (sk.n >= 3 || sk.until > now)) return false;
      if (ans && !(q.repeatDays && now - ans >= q.repeatDays * DAY)) return false;
      if (q.repeatDays && (mind.asked[day] || []).includes(q.id)) return false;
      return true;
    };
    const cand = [];
    QUESTIONS.forEach(q => { if (okId(q) && q.when(c)) cand.push(Object.assign(q, { _meta: { kind: 'static', id: q.id } })); });
    (ctx.skipTasks || []).slice(0, 2).forEach(t => { const q = skipQuestion(t); if (okId(q)) cand.push(Object.assign(q, { _meta: { kind: 'skip', id: q.id, payload: { id: t.id, title: t.title } } })); });
    (mind.insights || []).forEach(i => { const q = insightQuestion(i); if (okId(q)) cand.push(Object.assign(q, { _meta: { kind: 'insight', id: q.id, payload: i } })); });
    if (!cand.length) return null;
    cand.sort((a, b) => b.prio - a.prio);
    const q = cand[0];
    return { id: q.id, text: (ctx.lang === 'en' ? q.en : q.hi).replace('{pre}', String(ctx.preMin || 10)), chips: q.chips, free: q.free, meta: q._meta };
  };
  M.markAsked = function (mind, pq, now) {
    now = now || Date.now();
    mind.pending = { id: pq.id, at: now, expires: now + 30 * 60e3, meta: pq.meta };
    mind.lastAsk = now; const day = dkey(now); (mind.asked[day] = mind.asked[day] || []).push(pq.id);
    mind.updatedAt = now;
  };
  /* an unanswered question expires -> cool-down (3 days x number of skips; never again after 3) */
  M.expirePending = function (mind, now) {
    const p = mind.pending; if (!p || p.expires > now) return false;
    const s = mind.skips[p.id] = mind.skips[p.id] || { n: 0, until: 0 }; s.n++; s.until = now + 3 * DAY * s.n;
    mind.pending = null; mind.updatedAt = now; return true;
  };
  /* the user answered (chip value and/or free text) -> effects for the app to apply */
  M.answer = function (mind, state, value, text, ctx) {
    const p = mind.pending, q = p && resolveQ(p.meta); if (!q) return null;
    const now = (ctx && ctx.now) || Date.now();
    const c = { facts: factMap(state.facts), n: mind.profile.n, now };
    const fx = q.apply(value, text, c) || {};
    mind.answered[p.id] = now; mind.pending = null; mind.updatedAt = now;
    return fx;
  };
  /* is this utterance plausibly the answer to the pending question (and not a command)? */
  M.looksLikeAnswer = function (mind, text) {
    const p = mind.pending, q = p && resolveQ(p.meta); if (!q || p.expires < Date.now()) return false;
    const w = words(text).length;
    if (w === 0 || w > 14) return false;
    if (/^(hey|hi)\s+piyu|^(हे|हैलो)\s+पीयू/.test(norm(text))) return false;
    // a real question / command is never the answer to "what should I call you?" — Piyu answers it normally and keeps her own question for later
    if (/[?？]/.test(text) || /(^|\s)(kya|kaise|kaisa|kaun|kab|kahan|kyun|kitna|kitne|kisne|what|how|who|when|where|why|which|tell me|explain|show me|batao|bataiye|dikhao|samjhao|क्या|कैसे|कौन|कब|कहाँ|क्यों|कितना|कितने|किसने|बताओ|बताइए|दिखाओ|समझाओ)(\s|$)/i.test(norm(text))) return false;
    return q.free !== false || w <= 3;
  };

  /* ------------------------------------------------------------------ nightly learning pass ------------------------------------------------------------------ */
  M.nightly = function (state, tasks, now, settings) {
    const mind = state.mind, out = []; now = now || Date.now();
    M.consolidate(state, now, tasks); M.voiceDecay(mind);
    const has = id => (mind.insights || []).some(i => i.id === id) || mind.answered[id] || (mind.skips[id] && mind.skips[id].n >= 3);
    const push = ins => { if (!has(ins.id)) { mind.insights.push(ins); out.push(ins); } };
    const recent = (tasks || []).filter(t => t.done && t.doneAt && now - t.doneAt < 21 * DAY);
    // 1) when does the user actually finish things?
    if (recent.length >= 10) {
      const hist = new Array(24).fill(0); recent.forEach(t => hist[new Date(t.doneAt).getHours()]++);
      let best = 0, bh = 0; for (let h = 6; h < 23; h++) { const s = hist[h] + hist[h + 1]; if (s > best) { best = s; bh = h; } }
      if (best / recent.length >= 0.4) {
        const to = bh + 2, f = h => (h > 12 ? h - 12 : h) + (h >= 12 ? _t(" बजे शाम/दोपहर") : _t(" बजे सुबह"));
        push({ id: 'i_peak:' + bh, kind: 'peak', hi: _t("आप ज़्यादातर काम {0} से {1} बजे के बीच पूरे करते हैं ({2}% काम)। जिन कामों का समय नहीं लिखा, क्या उन्हें मैं इसी समय में रखूँ?", [bh, to, Math.round(100 * best / recent.length)]), settings: { autoFrom: bh, autoTo: to }, fact: { key: 'peak_window', value: bh + '-' + to, text: _t("सबसे ज़्यादा काम {0}–{1} बजे के बीच पूरे होते हैं", [bh, to]) }, ack: _t("ठीक है, अब नए काम {0}–{1} बजे के बीच रखूँगी।", [bh, to]) });
      }
      // 2) do tasks get finished long after their alarm?
      const late = recent.filter(t => t.alarmAt).map(t => t.doneAt - t.alarmAt).sort((a, b) => a - b);
      if (late.length >= 8 && late[Math.floor(late.length / 2)] > 30 * 60e3) push({ id: 'i_late', kind: 'late', hi: _t("आपके ज़्यादातर काम तय समय के आधे घंटे से ज़्यादा बाद पूरे होते हैं। क्या नए काम मैं थोड़ा देर से (30 मिनट बाद) रखूँ ताकि वे टलें नहीं?"), settings: { autoDelayMin: 30 }, ack: _t("ठीक है, नए काम अब 30 मिनट देर से रखूँगी।") });
    }
    // 3) alarms mostly snoozed?
    const evs = (state.episodes || []).filter(e => now - e.at < 14 * DAY), days = (state.days || []).filter(d => now - new Date(d.id).getTime() < 14 * DAY);
    const rings = evs.filter(e => e.kind === 'ring').length + days.reduce((a, d) => a + (d.rings || 0), 0), sn = evs.filter(e => e.kind === 'snooze').length + days.reduce((a, d) => a + (d.snoozes || 0), 0);
    if (rings >= 6 && sn / rings >= 0.4 && (settings.preMin || 10) < 30) { const np = Math.min(30, (settings.preMin || 10) + 5); push({ id: 'i_snooze:' + dkey(now).slice(0, 7), kind: 'snooze', hi: _t("आप ज़्यादातर alarm टाल देते हैं ({0}/{1})। क्या मैं काम से {2} मिनट पहले बताना शुरू कर दूँ ताकि तैयारी का समय मिले?", [sn, rings, np]), settings: { preMin: np }, ack: _t("ठीक है, अब {0} मिनट पहले बताऊँगी।", [np]) }); }
    // 4) sustained low mood
    const last = days.slice(-7).filter(d => d.msgs >= 2);
    if (last.length >= 4 && last.reduce((a, d) => a + d.mood, 0) / last.length < -0.3) push({ id: 'i_care:' + dkey(now).slice(0, 7), kind: 'care', hi: _t("पिछले कुछ दिनों से आप थके या परेशान लग रहे हैं। क्या मैं नए कामों की संख्या कम रखूँ और आवाज़ थोड़ी नरम कर दूँ?"), settings: { style: 'soft' }, fact: { key: 'care_mode', value: 'on', text: _t("हाल में भारी दिन — नरम रहें") }, ack: _t("ठीक है, मैं आराम से और नरमी से बात करूँगी।") });
    mind.lastLearn = dkey(now); mind.updatedAt = now;
    return { insights: out };
  };

  /* compact description of the user for a local LLM prompt / for the memory screen */
  M.hint = function (state, query, now) {
    const mind = state.mind || M.newMind(), st = M.styleOf(mind.profile), f = factMap(state.facts), parts = [];
    if (f.name) parts.push('नाम: ' + f.name);
    if (f.addr) parts.push(_t("बुलाने का तरीका: {0}", [f.addr]));
    if (st.ready) parts.push('लिखने का अंदाज़: ' + ({ devanagari: 'हिन्दी', hinglish: 'Roman Hinglish', mixed: _t("मिली-जुली"), english: 'English' }[st.lang]) + ', ' + ({ formal: _t("औपचारिक"), casual: _t("अनौपचारिक"), neutral: _t("सामान्य") }[st.register]) + ', ' + ({ short: _t("छोटे वाक्य"), long: _t("लंबे वाक्य"), normal: _t("सामान्य") }[st.brevity]));
    (state.facts || []).filter(x => !['name', 'addr'].includes(x.key)).slice(-5).forEach(x => parts.push(x.text));
    M.recall(state, query || '', 2, now).forEach(r => parts.push('याद: ' + r.text));
    return parts.join(' | ').slice(0, 800);
  };

  root.PiyuMind = M;
  M._internal = { norm, words, clamp, dkey, uid, DAY, EMO };
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
})(typeof self !== 'undefined' ? self : this);
