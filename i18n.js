/* Piyu i18n runtime.  Hindi is the source language: every UI string is written once, in Hindi, as a KEY (with {0}, {1} placeholders).
   Other languages come from packs (i18n/pack.<lang>.js) that map key -> translation.  Lookup order for lang L:  pack[L][key]  ->  pack.en[key]  ->  the Hindi key itself.
   _t(key, args)            translate a message
   _t2(hiKey, hiArgs, enKey, enArgs)   message that already had a hand-written English version at its call site (old T(hi, en)) */
(function (root) {
  'use strict';
  const LANGS = {
    hi: { name: 'हिन्दी (Hinglish)', dir: 'ltr', locale: 'hi-IN', voice: 'hi', sr: 'hi-IN' },
    en: { name: 'English', dir: 'ltr', locale: 'en-IN', voice: 'en', sr: 'en-IN' },
    bn: { name: 'বাংলা', dir: 'ltr', locale: 'bn-BD', voice: 'bn', sr: 'bn-BD' },
    mr: { name: 'मराठी', dir: 'ltr', locale: 'mr-IN', voice: 'mr', sr: 'mr-IN' },
    ur: { name: 'اردو', dir: 'rtl', locale: 'ur-PK', voice: 'ur', sr: 'ur-PK' }
  };
  const packs = {};
  let lang = 'hi', hindiOk = () => true;
  const has = (o, k) => Object.prototype.hasOwnProperty.call(o, k);
  const fmt = (s, a) => (a && a.length) ? s.replace(/\{(\d+)\}/g, (m, i) => +i < a.length ? String(a[+i]) : m) : s;
  const look = (k, l) => { const p = packs[l]; return p && has(p, k) ? p[k] : undefined; };

  function tr(key, args) {
    if (lang !== 'hi') {
      let v = look(key, lang);
      if (v === undefined && lang !== 'en') v = look(key, 'en');
      if (v !== undefined) return fmt(v, args);
    }
    return fmt(key, args);
  }
  function tr2(hk, ha, ek, ea) {
    if (lang === 'hi') return hindiOk() ? fmt(hk, ha) : fmt(ek, ea);
    if (lang === 'en') return fmt(ek, ea);
    const v = look(hk, lang);
    return v !== undefined ? fmt(v, ha) : fmt(ek, ea);
  }
  const register = (l, dict) => { packs[l] = Object.assign(packs[l] || {}, dict); };

  /* ---- static HTML: translate text nodes and attributes in place, remembering the Hindi original ---- */
  const origText = new WeakMap();      // text node -> original data
  const ATTRS = ['placeholder', 'title', 'aria-label'];
  const norm = s => s.replace(/\s+/g, ' ').trim();
  const DEV = /[ऀ-ॿ]/;
  function applyDom(rootEl) {
    if (typeof document === 'undefined') return;
    rootEl = rootEl || document.body;
    const w = document.createTreeWalker(rootEl, NodeFilter.SHOW_TEXT, null);
    for (let n; (n = w.nextNode());) {
      const p = n.parentNode; if (!p || /^(SCRIPT|STYLE)$/.test(p.nodeName) || (p.closest && p.closest('[data-i18n-skip]'))) continue;
      const o = origText.has(n) ? origText.get(n) : n.data;
      if (!DEV.test(o)) continue;
      if (!origText.has(n)) origText.set(n, o);
      const core = norm(o), t = tr(core);
      n.data = (t === core) ? o : o.replace(/^(\s*)[\s\S]*?(\s*)$/, (m, a, b) => a + t + b);
    }
    rootEl.querySelectorAll('*').forEach(el => {
      if (el.closest && el.closest('[data-i18n-skip]')) return;
      ATTRS.forEach(a => {
        if (!el.hasAttribute(a)) return;
        const k = 'i18nO' + a.replace(/-./g, m => m[1].toUpperCase()), o = el.dataset[k] !== undefined ? el.dataset[k] : el.getAttribute(a);
        if (!DEV.test(o)) return;
        el.dataset[k] = o; el.setAttribute(a, tr(norm(o)));
      });
    });
  }


  /* ---- understanding what the user typed/said in Bengali / Marathi / Urdu ----
     The rule engine knows Hindi/Hinglish/English command words. This maps the everyday command words of the other languages onto them
     (first pass: the common commands only — see plan.md). Digits of every script become 0-9. */
  const DIG = { '০': 0, '১': 1, '২': 2, '৩': 3, '৪': 4, '৫': 5, '৬': 6, '৭': 7, '৮': 8, '৯': 9, '०': 0, '१': 1, '२': 2, '३': 3, '४': 4, '५': 5, '६': 6, '७': 7, '८': 8, '९': 9,
    '٠': 0, '١': 1, '٢': 2, '٣': 3, '٤': 4, '٥': 5, '٦': 6, '٧': 7, '٨': 8, '٩': 9, '۰': 0, '۱': 1, '۲': 2, '۳': 3, '۴': 4, '۵': 5, '۶': 6, '۷': 7, '۸': 8, '۹': 9 };
  const A = [   // [pattern, canonical word the rule engine understands]   (longest / most specific first)
    [/আসসালামু আলাইকুম|নমস্কার|হ্যালো|হাই|नमस्कार|हॅलो|السلام علیکم|سلام|آداب|ہیلو/g, ' hello '],
    [/এখন কী করব|এখন কি করব|এখন কী করতে হবে|এখন কি করতে হবে|পরের কাজ|পরবর্তী কাজ|आता काय करायचे|आता काय करू|आता काय करावे|पुढचे काम|पुढील काम|اب کیا کرنا ہے|ابھی کیا کرنا ہے|اگلا کام/g, ' abhi kya karna hai '],
    [/ধাপে ধাপে|গাইড|टप्प्याटप्प्याने|टप्प्याने|गाईड|قدم بہ قدم|گائیڈ/g, ' step by step '],
    [/হয়ে গেছে|হয়ে গেল|সম্পন্ন|শেষ হয়েছে|पूर्ण झाले|झाले|झालं|पूर्ण झालं|ہو گیا|ہوگیا|مکمل ہو گیا|مکمل/g, ' done '],
    [/৫ মিনিট পরে|স্নুজ|५ मिनिटांनी|स्नूझ|بعد میں|سنوز/g, ' snooze '],
    [/মুছে ফেলো|মুছে দাও|মুছুন|ডিলিট|हटवा|काढून टाका|डिलीट|ہٹا دو|ہٹاؤ|ہٹائیں|مٹا دو|مٹاؤ|ڈیلیٹ/g, ' delete '],
    [/ডকুমেন্ট|নথি|ফাইল|डॉक्युमेंट|दस्तऐवज|फाईल|دستاویز|ڈاکیومنٹ|فائل/g, ' document '],
    [/সবগুলো|সব|সকল|सर्व|सगळे|सगळी|सगळ्या|سب|تمام/g, ' all '],
    [/আরও বলুন|আরও|আরো|আরেকটু|आणखी|अजून|مزید|اور بتاؤ/g, ' more '],
    [/ফোকাস|फोकस|فوکس/g, ' focus '],
    [/বন্ধ করো|বন্ধ|থামো|थांबवा|थांब|بند کرو|بند|روکو|رک جاؤ/g, ' band '],
    [/লিংক|लिंक|لنک/g, ' link '],
    [/নিয়ম|নিষেধ|नियम|اصول|قواعد/g, ' rule '],
    [/অগ্রগতি|প্রগতি|प्रगती|प्रगति|پیش رفت|پیشرفت/g, ' progress '],
    [/সারসংক্ষেপ|সারাংশ|সংক্ষেপ|सारांश|خلاصہ/g, ' summary '],
    [/পরিকল্পনা|योजना|منصوبہ|پلان/g, ' plan '],
    [/আজকের|আজ|आजचे|आजची|आजचा|آج کا|آج کے|آج/g, ' aaj '],
    [/আগামীকাল|কালকের|কাল|उद्याचे|उद्याची|उद्या|کل کا|کل کے|کل/g, ' kal '],
    [/কাজগুলো|কাজ|कामे|कार्य|کاموں|کام/g, ' kaam '],
    [/অ্যালার্ম|এলার্ম|রিমাইন্ডার|अलार्म|रिमाइंडर|الارم|ریمائنڈر/g, ' alarm '],
    [/কীভাবে|কিভাবে|কেমন করে|कसे|कसं|कशी|کیسے|کس طرح/g, ' kaise '],
    [/বলুন|বলো|सांगा|सांग|بتاؤ|بتائیں|بتاو/g, ' batao ']
  ];
  function intent(s) {
    s = String(s).replace(/[০-৯०-९٠-٩۰-۹]/g, d => DIG[d]);
    if (!/[ঀ-৿؀-ۿݐ-ݿऀ-ॿ]/.test(s)) return s;
    A.forEach(([re, w]) => { s = s.replace(re, w); });
    return s.replace(/\s+/g, ' ').trim();
  }

  /* ---- language switching ---- */
  function loadPack(l) {
    if (l === 'hi' || packs[l] || typeof document === 'undefined') return Promise.resolve();
    return new Promise(res => {
      const s = document.createElement('script'); s.src = 'i18n/pack.' + l + '.js';
      s.onload = s.onerror = () => res(); document.head.appendChild(s);
    });
  }
  async function setLang(l) {
    if (!LANGS[l]) l = 'hi';
    await loadPack(l); if (l !== 'en') await loadPack('en');
    lang = l;
    if (typeof document !== 'undefined') {
      document.documentElement.lang = l; document.documentElement.dir = LANGS[l].dir;
      applyDom();
    }
    return l;
  }
  const api = {
    LANGS, tr, tr2, fmt, register, intent, setLang, applyDom, loadPack,
    get lang() { return lang; }, set lang(l) { lang = l; },
    locale: () => LANGS[lang].locale, dir: () => LANGS[lang].dir,
    setHindiOk: f => { hindiOk = f; }, packs
  };
  root.PiyuI18n = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
