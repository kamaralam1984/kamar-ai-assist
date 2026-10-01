/* Piyu Study engine — questions (1 / 2 / 5 / 10 marks), answer checking, flashcards with spaced repetition, weak-topic analysis and a study plan.
   Pure logic, runs in the browser and in Node. 100% offline and free: no AI service, no API key — the questions are built from the text of the student's own course
   (cloze / definition / explain / discuss patterns, key-term statistics), so quality follows how well the PDF is written. */
(function (root) {
  'use strict';
  const DAY = 864e5;
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const uid = () => Math.random().toString(36).slice(2, 10);
  const hash32 = s => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return (h >>> 0).toString(36); };
  function rng(seed) { let a = (seed == null ? (Math.random() * 2 ** 32) : seed) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const shuffle = (arr, r) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };

  /* ---------------- text helpers ---------------- */
  const STOP = new Set(('a an the and or but if then so of to in on at by for with from as is are was were be been being am do does did has have had this that these those it its they them their he she his her we you your i my our not no nor also can could may might will would shall should than too very just only about into over under between among such which who whom whose what when where why how all any each both more most other some own same up down out off again once here there because while during before after above below through per via eg ie etc '
    + 'called takes take taken place places different every quickly mainly present large small produce produces produced release released releases needed need needs formed form forms used use using known break breaks based made make makes give gives given gets provide provides provided also without within against along across much many several various certain whole different important process-like common '
    + 'नामक प्राप्त उपस्थित आवश्यक अत्यंत मुख्य रूप दौरान उत्तरदायी जाता जाती जाते करते करती देता देती देते बनाते बनता बनती पाया पाई पाए '
    + 'और या कि का की के को में से पर है हैं था थे थी हो हुआ हुई हुए यह वह ये वे इस उस इन उन एक भी तो ही नहीं जो कोई कुछ सभी अपने अपना अपनी लिए साथ द्वारा तक बाद पहले जब तब जैसे ऐसे इसके उसके इसमें उसमें करने करना किया गया गई गए होता होती होते सकता सकती सकते रहा रहे रही वाला वाली वाले').split(/\s+/));
  const isDev = s => /[ऀ-ॿ]/.test(s);
  const words = s => (String(s).toLowerCase().match(/[\p{L}\p{M}\p{N}]+/gu) || []);
  function stem(w) {
    w = w.toLowerCase();
    if (isDev(w)) return w.length > 3 ? w.replace(/[ािीुूेैोौंँः्]+$/u, '') : w;
    if (w.length > 5 && /ies$/.test(w)) return w.slice(0, -3) + 'y';
    if (w.length > 5 && /(ing|ed)$/.test(w)) return w.replace(/(ing|ed)$/, '');
    if (w.length > 4 && /es$/.test(w)) return w.slice(0, -2);
    if (w.length > 3 && /s$/.test(w) && !/ss$/.test(w)) return w.slice(0, -1);
    return w;
  }
  /* a word that can be a quiz answer / wrong option: a noun-like term, not a verb form, adverb or filler */
  const okTerm = w => { const l = String(w).toLowerCase(); if (STOP.has(l) || /^\d+$/.test(l)) return false; if (isDev(l)) return l.length >= 3; return l.length >= 4 && !/(ly|ed)$/.test(l) && !/^(these|those|there|their|which|while|where|every|other|about|after|before)$/.test(l); };
  const contentWords = s => words(s).filter(w => !STOP.has(w) && (isDev(w) ? w.length >= 2 : w.length >= 3) && !/^\d+$/.test(w));
  function lev1(a, b) {                       // are two words at most 1 edit apart?
    if (a === b) return true; if (Math.abs(a.length - b.length) > 1) return false;
    let i = 0, j = 0, d = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++d > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return d + (a.length - i) + (b.length - j) <= 1;
  }
  function splitSentences(text) {
    const t = String(text || '').replace(/\r/g, '').replace(/[ \t]+/g, ' ');
    const out = [];
    t.split(/\n+/).forEach(line => {
      line.split(/(?<=[.!?।])\s+(?=[\p{Lu}ऀ-ॿ"'(\d])/u).forEach(s => { s = s.trim(); if (s.length >= 25 && s.length <= 300 && /[\p{L}]{3}/u.test(s)) out.push(s); });
    });
    return out;
  }
  const uniq = a => { const seen = new Set(); return a.filter(x => { const k = stem(String(x).toLowerCase()); if (seen.has(k)) return false; seen.add(k); return true; }); };
  const trimEnd = s => String(s).replace(/[\s.!?।;:,]+$/, '');

  /* ---------------- chapters ---------------- */
  /* blocks = [{k:'h'|'p', t}] (what Piyu's document reader gives) -> chapters [{id,title,from,to,chars}] (from/to = block indexes, to exclusive) */
  function chaptersFromBlocks(blocks, opts) {
    opts = Object.assign({ minChars: 700, targetChars: 4500, maxChapters: 60 }, opts || {});
    const n = blocks.length, heads = [];
    blocks.forEach((b, i) => { if (b.k === 'h' && String(b.t).trim().length >= 3 && String(b.t).length <= 140) heads.push(i); });
    let cuts = [];
    if (heads.length >= 2) cuts = heads.map(i => ({ at: i, title: String(blocks[i].t).trim() }));
    else {
      let chars = 0, start = 0, k = 1;
      for (let i = 0; i < n; i++) { chars += String(blocks[i].t).length; if (chars >= opts.targetChars && i > start) { cuts.push({ at: start, title: '' }); start = i + 1; chars = 0; k++; } }
      cuts.push({ at: start, title: '' });
    }
    if (cuts.length && cuts[0].at > 0) cuts.unshift({ at: 0, title: String(blocks[0] && blocks[0].t || '').slice(0, 60) });   // intro before the first heading
    let chs = cuts.map((c, i) => ({ title: c.title, from: c.at, to: i + 1 < cuts.length ? cuts[i + 1].at : n }));
    const size = c => blocks.slice(c.from, c.to).reduce((a, b) => a + String(b.t).length, 0);
    const merged = [];                                                       // tiny chapters (a heading with 2 lines) are glued to the previous one
    chs.forEach(c => { const m = merged[merged.length - 1]; if (m && size(c) < opts.minChars) { m.to = c.to; } else merged.push(Object.assign({}, c)); });
    if (merged.length > 1 && size(merged[0]) < opts.minChars) { merged[1].from = merged[0].from; merged.shift(); }
    let res = merged.filter(c => c.to > c.from).slice(0, opts.maxChapters);
    if (!res.length && n) res = [{ title: '', from: 0, to: n }];
    return res.map((c, i) => ({ id: 'c' + (i + 1), title: (c.title || '').replace(/\s+/g, ' ').trim() || ('Part ' + (i + 1)), from: c.from, to: c.to, chars: size(c) }));
  }
  const chapterText = (blocks, ch) => blocks.slice(ch.from, ch.to).map(b => b.t).join('\n');

  /* ---------------- key terms + facts ---------------- */
  function keyTerms(text, n) {
    const freq = new Map(), first = new Map(), big = new Map();
    const sentTok = String(text).split(/[.!?।\n]+/).map(x => words(x));
    sentTok.forEach(toks => toks.forEach((w, i) => {
      const good = okTerm(w) && !(isDev(w) ? w.length < 2 : w.length < 4);
      if (good) { const s = stem(w); freq.set(s, (freq.get(s) || 0) + 1); if (!first.has(s)) first.set(s, w); }
      const w2 = toks[i + 1];
      if (good && w2 && okTerm(w2)) { const k = w + ' ' + w2; big.set(k, (big.get(k) || 0) + 1); }
    }));
    // Capitalised words in the middle of sentences (names, concepts): "Newton", "Photosynthesis"
    const cap = new Map();
    (String(text).match(/(?<![.!?।]\s)(?<!^)\b[A-Z][a-z]{3,}(?:\s+[A-Z][a-z]{2,}){0,2}/gm) || []).forEach(p => cap.set(p, (cap.get(p) || 0) + 1));
    const arr = [...freq].map(([s, c]) => ({ term: first.get(s), stem: s, freq: c, score: c + (cap.has(first.get(s)) ? 2 : 0) + (isDev(s) ? 0.5 : 0) + Math.min(2, s.length / 8) }));
    big.forEach((c, k) => {                                      // a phrase that repeats ("carbon dioxide", "प्रकाश संश्लेषण") is the real concept: it replaces its parts
      if (c < 2) return; const [a, b] = k.split(' '), sa = stem(a), sb = stem(b);
      arr.forEach(u => { if ((u.stem === sa || u.stem === sb) && u.freq && c / u.freq >= 0.7) u.score *= 0.3; });
      arr.push({ term: k, stem: stem(a) + ' ' + stem(b), freq: c, score: c * 3 + 1 });
    });
    cap.forEach((c, p) => { if (p.includes(' ')) arr.push({ term: p, stem: stem(p.toLowerCase()), freq: c, score: c * 2.5 + 2 }); });
    return arr.sort((a, b) => b.score - a.score).slice(0, n || 30);
  }
  const DEF_RX = [
    /^(?:The\s+|A\s+|An\s+)?([\p{L}][\p{L}\p{M}\s'’\-]{2,60}?)\s+(?:(?:is|are)\s+(?:the|a|an|one of the|defined as|called|known as)\s+|means\s+|refers to\s+|can be defined as\s+)(.{18,260})$/iu,
    /^([\p{L}\p{M}][\p{L}\p{M}\s\-]{1,40}?)\s+(?:वह|वे|वो|एक)\s+(.{10,240}?)\s+(?:है|हैं)।?$/u,
    /^([\p{L}\p{M}][\p{L}\p{M}\s\-]{1,50}?)\s+(?:वह|वे|वो)?\s*([^,।]{15,240}?)\s+(?:कहलाता|कहलाती|कहलाते|कहा जाता|कही जाती|कहे जाते)\s+(?:है|हैं)।?$/u,
    /^([\p{L}\p{M}][\p{L}\p{M}\s\-]{1,50}?)\s+(?:को|का|की)\s+(.{12,240}?)\s+(?:कहते|कहा जाता)\s+(?:है|हैं)।?$/u
  ];
  /* -> [{term, def, sentence}] sentences that DEFINE something */
  function definitions(sentences) {
    const out = [];
    sentences.forEach(s => {
      const clean = trimEnd(s);
      let m = clean.match(DEF_RX[0]);
      if (m) {
        const t = m[1].trim();
        if (t.split(/\s+/).length <= 4 && !/^(this|that|these|those|it|they|he|she|there|which|what|who)\b/i.test(t) && !/\b(for|by|in|during|after|through|from|with|into|on)\b/i.test(t) && !/\w{5,}ed\b/i.test(t) && !STOP.has(t.toLowerCase())) { out.push({ term: t, def: trimEnd(m[2]), sentence: s }); return; }
      }
      for (let i = 1; i < DEF_RX.length; i++) {
        m = clean.match(DEF_RX[i]);
        if (m) { const t = m[1].trim(); if (t.split(/\s+/).length <= 4 && !/[,;]/.test(t)) { out.push({ term: t, def: trimEnd(m[2]), sentence: s }); return; } }
      }
    });
    const seen = new Set();
    return out.filter(d => { const k = d.term.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true; });
  }

  /* ---------------- question builders ---------------- */
  const LANG = t => (String(t).replace(/[^ऀ-ॿ]/g, '').length > String(t).replace(/[^A-Za-z]/g, '').length ? 'hi' : 'en');
  const Q = {
    what: (t, l) => l === 'hi' ? t + ' क्या है?' : 'What is ' + t + '?',
    define: (t, l) => l === 'hi' ? t + ' को परिभाषित कीजिए।' : 'Define ' + t + '.',
    state: (t, l) => l === 'hi' ? t + ' के बारे में संक्षेप में लिखिए।' : 'Write briefly about ' + t + '.',
    explain: (t, l) => l === 'hi' ? t + ' को विस्तार से समझाइए।' : 'Explain ' + t + ' in detail.',
    note: (t, l) => l === 'hi' ? t + ' पर टिप्पणी लिखिए।' : 'Write a short note on ' + t + '.',
    discuss: (t, l) => l === 'hi' ? t + ' का विस्तृत वर्णन कीजिए।' : 'Discuss ' + t + ' in detail.',
    fill: l => l === 'hi' ? 'रिक्त स्थान भरिए:' : 'Fill in the blank:',
    which: l => l === 'hi' ? 'सही विकल्प चुनिए:' : 'Choose the correct option:'
  };
  const shortOpt = (s, n) => { s = trimEnd(s); if (s.length <= n) return s; const cut = s.slice(0, n); const i = cut.lastIndexOf(' '); return (i > n * 0.6 ? cut.slice(0, i) : cut) + '…'; };

  /* course = { id, name, ... }, chapters = [{id, title, text}] */
  function buildPool(courseId, chapters) {
    const pool = { terms: [], defs: [], sents: [], byChapter: {}, courseId };
    chapters.forEach(ch => {
      const sents = splitSentences(ch.text); let kt = keyTerms(ch.text, 40); const defs = definitions(sents);
      const phr = kt.filter(k => k.term.includes(' ') && !/^[A-Z]/.test(k.term)).map(k => k.term.toLowerCase().split(' '));
      kt = kt.filter(k => k.term.includes(' ') || !phr.some(p => p.includes(k.term.toLowerCase())) || k.freq >= 4 && false);     // "carbon" alone is not a concept when "carbon dioxide" is
      pool.byChapter[ch.id] = { ch, sents, kt, defs };
      kt.forEach(k => pool.terms.push(Object.assign({ ch: ch.id }, k)));
      defs.forEach(d => pool.defs.push(Object.assign({ ch: ch.id }, d)));
      sents.forEach(s => pool.sents.push({ s, ch: ch.id }));
    });
    return pool;
  }
  const mkId = (courseId, kind, key) => 'q' + hash32(courseId + '|' + kind + '|' + key);

  /* 1 mark: multiple choice (cloze: the key word is blanked; definition: pick the right meaning) */
  function genMCQ(pool, count, r, chapterIds) {
    r = r || Math.random;
    const out = [], used = new Set();
    const chs = (chapterIds && chapterIds.length ? chapterIds : Object.keys(pool.byChapter)).filter(c => pool.byChapter[c]);
    const termPool = pool.terms.filter(t => t.term.length >= 4 && okTerm(t.term.split(' ')[0]) && (t.freq >= 2 || /^[A-Z]/.test(t.term)));
    const cands = [];
    chs.forEach(cid => {
      const B = pool.byChapter[cid], top = B.kt.slice(0, 25).filter(k => k.freq >= 2 || /^[A-Z]/.test(k.term));
      B.sents.forEach(s => {
        if (s.length < 40 || s.length > 220) return;
        top.forEach(k => {
          const m = s.match(new RegExp('(?<![\\p{L}\\p{M}\\p{N}])(' + k.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')(?![\\p{L}\\p{M}\\p{N}])', 'iu'));
          if (!m || m.index < 3 || !okTerm(m[1].split(' ')[0])) return;
          cands.push({ cid, s, w: m[1], k, score: k.score + (/^[A-Z]/.test(m[1]) ? 1.5 : 0) + (pool.focus && pool.focus.has(stem(m[1].toLowerCase())) ? 6 : 0) });
        });
      });
      B.defs.forEach(d => cands.push({ cid, def: d, score: 6 + (pool.focus && pool.focus.has(stem(d.term.toLowerCase())) ? 6 : 0) }));
    });
    const order = shuffle(cands, r).sort((a, b) => (b.score + r() * 3) - (a.score + r() * 3));
    const ansUsed = new Map();
    const attempt = c => {
      if (c.def) {
        const d = c.def, key = 'def:' + d.term.toLowerCase();
        if (used.has(key)) return null;
        const others = shuffle(pool.defs.filter(x => x.term.toLowerCase() !== d.term.toLowerCase()), r).slice(0, 3);
        if (others.length < 3) return null;
        const lang = LANG(d.term + ' ' + d.def), right = shortOpt(d.def, 95);
        const opts = shuffle([{ t: right, ok: true }].concat(others.map(o => ({ t: shortOpt(o.def, 95), ok: false }))), r);
        if (new Set(opts.map(o => o.t.toLowerCase())).size < 4) return null;
        used.add(key);
        return { id: mkId(pool.courseId, 'mcqd', d.term), type: 'mcq', marks: 1, ch: c.cid, lang, q: Q.what(d.term, lang), options: opts.map(o => o.t), answer: opts.findIndex(o => o.ok), model: d.sentence, keys: [d.term], src: d.sentence };
      }
      const key = 'cz:' + c.s.slice(0, 50);
      if (used.has(key)) return null;
      const lw = c.w.toLowerCase(), isCap = /^[A-Z]/.test(c.w);
      const dis = shuffle(termPool.filter(t => t.term.toLowerCase() !== lw && stem(t.term.toLowerCase()) !== stem(lw) && !c.s.toLowerCase().includes(t.term.toLowerCase())
        && (!isCap || /^[A-Z]/.test(t.term)) && t.term.split(' ').length === c.w.split(' ').length && Math.abs(t.term.length - c.w.length) <= 9), r);
      const seen = new Set([lw, stem(lw)]), picks = [];
      for (const t of dis) { const k2 = t.term.toLowerCase(); if (seen.has(k2) || seen.has(stem(k2))) continue; seen.add(k2); seen.add(stem(k2)); picks.push(t.term); if (picks.length === 3) break; }
      if (picks.length < 3) return null;
      const lang = LANG(c.s), blank = c.s.replace(new RegExp('(?<![\\p{L}\\p{M}\\p{N}])' + c.w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{M}\\p{N}])', 'u'), '_____');
      if (blank === c.s) return null;
      used.add(key);
      const opts = shuffle([c.w].concat(picks), r);
      return { id: mkId(pool.courseId, 'mcqc', c.s.slice(0, 80) + c.w), type: 'mcq', marks: 1, ch: c.cid, lang, q: Q.fill(lang) + ' ' + blank, options: opts, answer: opts.indexOf(c.w), model: c.s, keys: [c.w], src: c.s };
    };
    outer: for (const maxUse of [1, 3]) {                  // first pass: every question has a different answer; second pass: repeats allowed
      for (const c of order) {
        if (out.length >= count) break outer;
        const ak = c.def ? 'd:' + c.def.term.toLowerCase() : 'w:' + stem(c.w.toLowerCase());
        if ((ansUsed.get(ak) || 0) >= maxUse) continue;
        const q = attempt(c); if (q) { out.push(q); ansUsed.set(ak, (ansUsed.get(ak) || 0) + 1); }
      }
    }
    return out;
  }

  /* 2 marks: define / what is — the answer is the defining sentence; falls back to the most important sentence of a topic */
  function genShort(pool, count, r, chapterIds) {
    r = r || Math.random; const out = [], used = new Set();
    const chs = (chapterIds && chapterIds.length ? chapterIds : Object.keys(pool.byChapter)).filter(c => pool.byChapter[c]);
    const items = [];
    chs.forEach(cid => {
      const B = pool.byChapter[cid];
      B.defs.forEach(d => items.push({ cid, term: d.term, ans: d.sentence, kind: 'def', f: pool.focus && pool.focus.has(stem(d.term.toLowerCase())) }));
      B.kt.slice(0, 10).forEach(k => {
        const s = B.sents.filter(x => x.toLowerCase().includes(k.term.toLowerCase())).sort((a, b) => b.length - a.length)[0];
        if (s && !B.defs.some(d => d.term.toLowerCase() === k.term.toLowerCase())) items.push({ cid, term: k.term, ans: s, kind: 'term' });
      });
    });
    shuffle(items, r).sort((a, b) => ((a.f ? -2 : 0) + (a.kind === 'def' ? 0 : 1)) - ((b.f ? -2 : 0) + (b.kind === 'def' ? 0 : 1)) + (r() - 0.5) * 0.6).forEach(it => {
      if (out.length >= count) return; const key = it.term.toLowerCase(); if (used.has(key)) return; used.add(key);
      const lang = LANG(it.ans), qf = it.kind === 'def' ? (r() < 0.5 ? Q.define : Q.what) : Q.state;
      const keys = uniq([it.term].concat(contentWords(it.ans).sort((a, b) => b.length - a.length).slice(0, 5))).slice(0, 6);
      out.push({ id: mkId(pool.courseId, 'sh', it.term), type: 'short', marks: 2, ch: it.cid, lang, q: qf(it.term, lang), model: it.ans, keys, src: it.ans });
    });
    return out;
  }

  /* 5 marks: explain a concept with the 3-5 most informative sentences about it */
  function genMedium(pool, count, r, chapterIds) {
    r = r || Math.random; const out = [], used = new Set();
    const chs = (chapterIds && chapterIds.length ? chapterIds : Object.keys(pool.byChapter)).filter(c => pool.byChapter[c]);
    const items = [];
    chs.forEach(cid => {
      const B = pool.byChapter[cid];
      B.kt.slice(0, 14).forEach(k => {
        const hits = B.sents.map((s, i) => ({ s, i })).filter(x => x.s.toLowerCase().includes(k.term.toLowerCase()));
        if (hits.length >= 3) items.push({ cid, term: k.term, hits, score: hits.length * 2 + k.score + (pool.focus && pool.focus.has(stem(k.term.toLowerCase())) ? 8 : 0) });
      });
    });
    items.sort((a, b) => (b.score + r() * 5) - (a.score + r() * 5)).forEach(it => {
      if (out.length >= count) return; const key = it.term.toLowerCase(); if (used.has(key)) return; used.add(key);
      const sel = it.hits.slice().sort((a, b) => b.s.length - a.s.length).slice(0, 5).sort((a, b) => a.i - b.i).map(x => x.s);
      const lang = LANG(sel.join(' ')), ans = sel.join(' ');
      const keys = uniq([it.term].concat(keyTerms(ans, 12).map(k => k.term))).slice(0, 8);
      out.push({ id: mkId(pool.courseId, 'md', it.term), type: 'medium', marks: 5, ch: it.cid, lang, q: (r() < 0.5 ? Q.explain : Q.note)(it.term, lang), topic: it.term, model: ans, keys, src: ans });
    });
    return out;
  }

  /* 10 marks: discuss a whole topic (a chapter heading) — the model answer is the chapter's most important sentences in order */
  function genLong(pool, count, r, chapterIds) {
    r = r || Math.random; const out = [];
    const chs = (chapterIds && chapterIds.length ? chapterIds : Object.keys(pool.byChapter)).filter(c => pool.byChapter[c]);
    shuffle(chs, r).forEach(cid => {
      if (out.length >= count) return; const B = pool.byChapter[cid]; if (B.sents.length < 6) return;
      const weight = new Map(B.kt.map(k => [k.stem, k.score]));
      const scored = B.sents.map((s, i) => ({ s, i, sc: contentWords(s).reduce((a, w) => a + (weight.get(stem(w)) || 0), 0) / Math.sqrt(s.length) }));
      const sel = scored.slice().sort((a, b) => b.sc - a.sc).slice(0, 10).sort((a, b) => a.i - b.i).map(x => x.s), ans = sel.join(' ');
      const lang = LANG(ans), title = B.ch.title && !/^Part \d+$/.test(B.ch.title) ? B.ch.title : (B.kt[0] ? B.kt[0].term : 'this topic');
      out.push({ id: mkId(pool.courseId, 'lg', cid), type: 'long', marks: 10, ch: cid, lang, q: Q.discuss(title, lang), model: ans, keys: B.kt.slice(0, 12).map(k => k.term), src: ans });
    });
    // more than the chapters we have: use the biggest concepts as 10-mark topics
    if (out.length < count) {
      const have = new Set(out.map(o => o.q.toLowerCase()));
      genMedium(pool, count * 2, r, chapterIds).forEach(m => { const q = Q.discuss(m.topic, m.lang); if (out.length < count && !have.has(q.toLowerCase())) { have.add(q.toLowerCase()); out.push(Object.assign({}, m, { type: 'long', marks: 10, id: m.id + 'L', q })); } });
    }
    return out.slice(0, count);
  }
  function make(pool, marks, count, r, chapterIds) {
    return marks === 1 ? genMCQ(pool, count, r, chapterIds) : marks === 2 ? genShort(pool, count, r, chapterIds) : marks === 5 ? genMedium(pool, count, r, chapterIds) : genLong(pool, count, r, chapterIds);
  }
  /* a question paper: spec = [{marks:1,count:10},{marks:2,count:5},...] */
  function makePaper(pool, spec, opts) {
    opts = opts || {}; const r = rng(opts.seed), res = [];
    spec.forEach(sec => { if (sec.count > 0) res.push({ marks: sec.marks, items: make(pool, sec.marks, sec.count, r, opts.chapterIds) }); });
    const total = res.reduce((a, s) => a + s.items.length * s.marks, 0);
    return { sections: res, total, count: res.reduce((a, s) => a + s.items.length, 0) };
  }

  /* ---------------- checking answers ---------------- */
  function gradeMCQ(q, idx) { const ok = idx === q.answer; return { got: ok ? q.marks : 0, max: q.marks, ok, frac: ok ? 1 : 0, matched: ok ? q.keys : [], missing: ok ? [] : q.keys }; }
  const MINW = { 2: 5, 5: 25, 10: 60 };
  /* keyword + sentence overlap against the model answer. An estimate — the student can correct the marks. */
  function gradeWritten(q, text) {
    const ans = String(text || '').trim(), ws = contentWords(ans), aw = words(ans).length;
    if (!ans || !ws.length) return { got: 0, max: q.marks, ok: false, frac: 0, matched: [], missing: q.keys.slice(), words: aw };
    const stems = ws.map(stem), set = new Set(stems);
    const hit = key => { const kw = contentWords(key); if (!kw.length) return false; return kw.every(k => { const s = stem(k); return set.has(s) || stems.some(x => x.length >= 5 && s.length >= 5 && lev1(x, s)); }); };
    const matched = q.keys.filter(hit), missing = q.keys.filter(k => !hit(k));
    const cov = q.keys.length ? matched.length / q.keys.length : 0;
    const mw = [...new Set(contentWords(q.model).map(stem))], rec = mw.length ? mw.filter(w => set.has(w)).length / mw.length : 0;
    let frac = 0.5 * cov + 0.5 * Math.min(1, rec * 1.25);
    const need = MINW[q.marks] || 5; if (aw < need) frac = Math.min(frac, 0.25 + 0.55 * aw / need);
    if (frac >= 0.85) frac = 1;
    const got = Math.round(clamp(frac, 0, 1) * q.marks * 2) / 2;
    return { got, max: q.marks, ok: got >= q.marks * 0.6, frac: got / q.marks, matched, missing, words: aw, need };
  }
  const grade = (q, resp) => q.type === 'mcq' ? gradeMCQ(q, resp) : gradeWritten(q, resp);

  /* ---------------- flashcards (SM-2 style) ---------------- */
  function makeCards(courseId, chapters, opts) {
    opts = opts || {}; const max = opts.max || 120, out = [], seen = new Set(), now = opts.now || Date.now();
    const pool = buildPool(courseId, chapters), add = (cid, front, back, kind) => {
      const id = 'k' + hash32(courseId + '|' + front); if (seen.has(id)) return; seen.add(id);
      out.push({ id, courseId, ch: cid, kind, front, back, ease: 2.5, interval: 0, reps: 0, lapses: 0, due: now, last: 0 });
    };
    Object.keys(pool.byChapter).forEach(cid => {
      const B = pool.byChapter[cid];
      B.defs.forEach(d => add(cid, Q.what(d.term, LANG(d.sentence)), d.sentence, 'def'));
      const per = Math.max(3, Math.ceil(max / Math.max(1, Object.keys(pool.byChapter).length)));
      B.kt.slice(0, 12).forEach(k => {
        if (out.filter(c => c.ch === cid).length >= per) return;
        const s = B.sents.filter(x => x.length <= 200 && x.toLowerCase().includes(k.term.toLowerCase())).sort((a, b) => a.length - b.length)[0];
        if (!s) return;
        const blank = s.replace(new RegExp('(?<![\\p{L}\\p{M}\\p{N}])' + k.term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(?![\\p{L}\\p{M}\\p{N}])', 'iu'), '_____');
        if (blank !== s) add(cid, blank, k.term + ' — ' + s, 'cloze');
      });
    });
    return out.slice(0, max);
  }
  const rank = c => c.reps === 0 ? 'new' : c.interval >= 21 ? 'mature' : 'learning';
  /* q: 0 again, 1 hard, 2 good, 3 easy */
  function reviewCard(c, q, now) {
    now = now || Date.now(); const k = Object.assign({}, c);
    if (q === 0) { k.reps = 0; k.lapses = (k.lapses || 0) + 1; k.interval = 0; k.ease = Math.max(1.3, k.ease - 0.2); k.due = now + 10 * 60000; }
    else {
      if (q === 1) { k.interval = Math.max(1, Math.round((k.interval || 1) * 1.2)); k.ease = Math.max(1.3, k.ease - 0.15); }
      else if (q === 2) { k.interval = k.reps === 0 ? 1 : k.reps === 1 ? 3 : Math.round(k.interval * k.ease); }
      else { k.interval = k.reps === 0 ? 3 : Math.max(4, Math.round((k.interval || 1) * k.ease * 1.3)); k.ease = k.ease + 0.15; }
      k.reps = (k.reps || 0) + 1; k.due = now + k.interval * DAY;
    }
    k.last = now; return k;
  }
  const nextLabel = (c, q) => { const k = reviewCard(c, q, 0); return q === 0 ? '10m' : k.interval < 30 ? k.interval + 'd' : Math.round(k.interval / 30) + 'mo'; };
  function dueCards(cards, now, o) {
    o = Object.assign({ limit: 20, newLimit: 8, courseId: null, chapterId: null }, o || {}); now = now || Date.now();
    const pick = cards.filter(c => (!o.courseId || c.courseId === o.courseId) && (!o.chapterId || c.ch === o.chapterId));
    const due = pick.filter(c => c.reps > 0 || c.lapses > 0 ? c.due <= now : false).sort((a, b) => a.due - b.due);
    const fresh = pick.filter(c => c.reps === 0 && !(c.lapses > 0) && c.due <= now).slice(0, o.newLimit);
    return due.concat(fresh).slice(0, o.limit);
  }
  const cardStats = (cards, now) => { now = now || Date.now(); const s = { total: cards.length, due: 0, fresh: 0, learning: 0, mature: 0 }; cards.forEach(c => { const rk = rank(c); s[rk === 'new' ? 'fresh' : rk]++; if (c.due <= now) s.due++; }); return s; };

  /* ---------------- weak-topic analysis ---------------- */
  /* attempts: [{at, course, items:[{ch, marks, got, miss:[], q}]}]   cards: see above.   -> per chapter {course, ch, acc, n, miss:[{k,c}], level} */
  function analyze(courses, attempts, cards, now) {
    now = now || Date.now(); const stat = new Map();
    const key = (c, ch) => c + '|' + ch;
    courses.forEach(co => (co.chapters || []).forEach(ch => stat.set(key(co.id, ch.id), { course: co.id, ch: ch.id, title: ch.title, subject: co.subject || co.name, w: 0, got: 0, max: 0, n: 0, miss: new Map(), cardW: 0, cardOk: 0, last: 0 })));
    (attempts || []).forEach(a => (a.items || []).forEach(it => {
      const s = stat.get(key(a.course, it.ch)); if (!s) return;
      const w = Math.pow(0.5, Math.max(0, now - a.at) / (14 * DAY));
      s.w += w; s.got += w * it.got; s.max += w * it.marks; s.n++; s.last = Math.max(s.last, a.at);
      if (it.got < it.marks * 0.6) (it.miss || []).forEach(m => s.miss.set(m, (s.miss.get(m) || 0) + w));
    }));
    (cards || []).forEach(c => { const s = stat.get(key(c.courseId, c.ch)); if (!s || (c.reps === 0 && !c.lapses)) return; const t = c.reps + c.lapses; s.cardW += t; s.cardOk += c.reps; });
    return [...stat.values()].map(s => {
      const qa = s.max ? s.got / s.max : null, ca = s.cardW ? s.cardOk / s.cardW : null;
      const acc = qa == null && ca == null ? null : qa == null ? ca : ca == null ? qa : 0.7 * qa + 0.3 * ca;
      const level = acc == null ? 'new' : acc < 0.5 ? 'weak' : acc < 0.75 ? 'okay' : 'strong';
      return { course: s.course, ch: s.ch, title: s.title, subject: s.subject, acc, n: s.n, level, last: s.last, miss: [...s.miss].sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]) };
    });
  }
  /* per subject: average accuracy of its tested chapters */
  function bySubject(stats) {
    const m = new Map();
    stats.forEach(s => { const k = s.subject; const o = m.get(k) || { subject: k, tested: 0, sum: 0, chapters: 0, weak: 0, okay: 0, strong: 0, fresh: 0 }; o.chapters++; if (s.acc == null) o.fresh++; else { o.tested++; o.sum += s.acc; o[s.level]++; } m.set(k, o); });
    return [...m.values()].map(o => Object.assign(o, { acc: o.tested ? o.sum / o.tested : null })).sort((a, b) => (a.acc == null) - (b.acc == null) || (a.acc || 0) - (b.acc || 0));      // tested subjects first, weakest at the top; untested ones last
  }
  /* what to do about a weak chapter: concrete steps with minutes */
  function remedy(st, cardsDue) {
    const steps = [];
    if (st.level === 'new') steps.push({ kind: 'read', min: 25 }, { kind: 'quiz', min: 10, marks: 1 });
    else if (st.level === 'weak') steps.push({ kind: 'revise', min: 20 }, { kind: 'cards', min: 10 }, { kind: 'quiz', min: 10, marks: 1 }, { kind: 'quiz', min: 15, marks: 2 });
    else if (st.level === 'okay') steps.push({ kind: 'cards', min: 10 }, { kind: 'quiz', min: 15, marks: 2 });
    else steps.push({ kind: 'quiz', min: 15, marks: 5 });
    return steps;
  }

  /* ---------------- study plan ---------------- */
  const pad = n => String(n).padStart(2, '0');
  const hmToMin = s => { const m = String(s || '').match(/^(\d{1,2}):(\d{2})$/); return m ? +m[1] * 60 + +m[2] : 0; };
  /* cfg: {from:'17:00', to:'20:30', session:30, brk:5, days:[1..6,0], horizon:7, exams:{courseId: ts}, perDay:max sessions}
     -> sessions [{id, at, min, course, ch, kind, title}] sorted.  Weak + exam-near chapters get more and earlier slots. */
  function buildPlan(courses, stats, cards, cfg, now) {
    now = now || Date.now(); cfg = Object.assign({ from: '17:00', to: '20:00', session: 30, brk: 5, days: [0, 1, 2, 3, 4, 5, 6], horizon: 7, perDay: 6 }, cfg || {});
    const sess = [], prio = new Map(), byKey = new Map(stats.map(s => [s.course + '|' + s.ch, s]));
    const dueCount = new Map(); (cards || []).forEach(c => { if (c.due <= now + DAY) dueCount.set(c.courseId, (dueCount.get(c.courseId) || 0) + 1); });
    courses.forEach(co => (co.chapters || []).forEach(ch => {
      const st = byKey.get(co.id + '|' + ch.id) || { level: 'new', acc: null };
      const need = st.acc == null ? 0.6 : 1 - st.acc, ex = co.exam ? Math.max(0, co.exam - now) / DAY : 99;
      const urg = ex < 0 ? 0.3 : 1 + clamp((21 - ex) / 21, 0, 1.5);
      prio.set(co.id + '|' + ch.id, { co, ch, st, p: (0.25 + need) * urg });
    }));
    if (!prio.size) return [];
    const from = hmToMin(cfg.from), to = hmToMin(cfg.to), step = cfg.session + cfg.brk;
    for (let d = 0; d < cfg.horizon; d++) {
      const day = new Date(now); day.setHours(0, 0, 0, 0); day.setDate(day.getDate() + d);
      if (!cfg.days.includes(day.getDay())) continue;
      let used = 0;
      for (let t = from; t + cfg.session <= to && used < cfg.perDay; t += step) {
        const at = new Date(day); at.setHours(0, t, 0, 0); if (at.getTime() <= now + 60000) continue;
        const best = [...prio.values()].sort((a, b) => b.p - a.p)[0]; if (!best) break;
        const lvl = best.st.level, kind = lvl === 'new' ? 'read' : lvl === 'weak' ? (used % 2 ? 'cards' : 'revise') : lvl === 'okay' ? (used % 2 ? 'quiz' : 'cards') : 'quiz';
        sess.push({ id: 'p' + hash32(day.toDateString() + t + best.co.id + best.ch.id), at: at.getTime(), min: cfg.session, course: best.co.id, ch: best.ch.id, kind, title: best.co.name + ' — ' + best.ch.title, level: lvl });
        best.p *= 0.55; used++;
        // after a 'read' the chapter is no longer new: next time it is a quiz candidate
        if (kind === 'read') best.st = Object.assign({}, best.st, { level: 'okay', acc: 0.55 });
      }
      // a mock test the day before an exam
      courses.forEach(co => { if (co.exam) { const ed = new Date(co.exam); ed.setHours(0, 0, 0, 0); if (ed.getTime() - day.getTime() === DAY && sess.length) { const at = new Date(day); at.setHours(0, from, 0, 0); if (at.getTime() > now) sess.unshift({ id: 'p' + hash32('mock' + co.id + day), at: at.getTime(), min: 45, course: co.id, ch: null, kind: 'mock', title: co.name + ' — mock test', level: 'okay' }); } } });
    }
    return sess.sort((a, b) => a.at - b.at);
  }

  /* ---------------- misc ---------------- */
  const level = acc => acc == null ? 'new' : acc < 0.5 ? 'weak' : acc < 0.75 ? 'okay' : 'strong';
  function pickKeySentences(text, n) {                         // for "explain this chapter": the most informative sentences in reading order
    const sents = splitSentences(text), kt = keyTerms(text, 30), w = new Map(kt.map(k => [k.stem, k.score]));
    return sents.map((s, i) => ({ s, i, sc: contentWords(s).reduce((a, x) => a + (w.get(stem(x)) || 0), 0) / Math.sqrt(s.length) })).sort((a, b) => b.sc - a.sc).slice(0, n || 4).sort((a, b) => a.i - b.i).map(x => x.s);
  }
  const api = { rng, uid, hash32, words, contentWords, stem, splitSentences, chaptersFromBlocks, chapterText, keyTerms, definitions, buildPool, genMCQ, genShort, genMedium, genLong, make, makePaper,
    gradeMCQ, gradeWritten, grade, makeCards, reviewCard, nextLabel, dueCards, cardStats, rank, analyze, bySubject, remedy, buildPlan, level, pickKeySentences, DAY };
  root.PiyuStudy = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof self !== 'undefined' ? self : this);
