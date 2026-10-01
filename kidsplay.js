/* Piyu Kids — Seekho (lessons + quiz + speak-and-check), Khelo (games), Kahani (stories read aloud), Homework photo. Free, offline; the AI part is the Piyu server's own model. */
(function () {
  'use strict';
  const P = window.PiyuKids, D = window.PiyuKidsData;
  const el = id => document.getElementById(id);
  const esc2 = s => esc(String(s == null ? '' : s));
  const rnd = n => Math.floor(Math.random() * n);
  const shuffle = a => { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (a, n) => shuffle(a).slice(0, n);
  const L = () => P.clang();
  const lab = c => (L() === 'en' ? c.en : c.hi);
  const K = () => P.K();
  const today = () => P.dkey(Date.now());
  const tname = t => (L() === 'en' ? t.en : t.hi);
  const age = () => +K().age || 7;
  const ov = (h, n, c) => P.ov(h, n, c);
  const close = () => { P.closeOv(); renderAll(); };
  const BACK = () => `<button class="k-x" data-kact="closeov" aria-label="close">✕</button>`;

  /* ======================================================= Seekho =======================================================*/
  function renderLearn() {
    const root = el('kLearn'); if (!root) return; const k = K();
    root.innerHTML = `<div class="k-wrap"><div class="k-sec big"><h2>${esc2(_t('आज क्या सीखें?'))}</h2>
      <div class="k-langsw"><button class="${L() === 'hi' ? 'on' : ''}" data-kact="clang" data-l="hi">हिन्दी</button><button class="${L() === 'en' ? 'on' : ''}" data-kact="clang" data-l="en">English</button></div></div>
      <div class="k-topics">${D.TOPICS.map((t, i) => { const r = k.lessons[t.id] || {}; return `<button class="k-topic" data-kact="topic" data-id="${t.id}" style="--c:${t.col};--i:${i}"><span class="k-topic-ic">${t.icon}</span><b>${esc2(tname(t))}</b><small>${r.done ? '⭐'.repeat(Math.min(3, r.best >= 5 ? 3 : r.best >= 4 ? 2 : 1)) : esc2(_t('~{0} मिनट', [t.min]))}</small></button>`; }).join('')}</div>
      <div class="k-card k-tip"><span>💡</span><p>${esc2(_t('हर पाठ के बाद छोटा क्विज़ होता है — सही जवाब पर स्टार मिलते हैं!'))}</p></div></div>`;
  }
  let LS = null;       // lesson state
  function openTopic(id) {
    const t = D.TOPICS.find(x => x.id === id); if (!t) return;
    LS = { t, i: 0 }; showCard(); P.ev('lesson', { id, start: 1 });
  }
  function cardVisual(t, c) {
    if (c.hex) return `<div class="k-colorball" style="background:${c.hex}"><span>${esc2(c.e)}</span></div>`;
    if (c.shape) return `<div class="k-shapebox">${shapeSvg(c.shape)}</div>`;
    if (t.id === 'num') return `<div class="k-bignum">${esc2(c.s)}</div><div class="k-emojis">${c.e.match(/\p{Extended_Pictographic}(?:️)?/gu).map((x, j) => `<i style="--j:${j}">${x}</i>`).join('')}</div>`;
    if (c.table) return `<div class="k-tbl">${Array.from({ length: 10 }, (_, j) => `<button data-kact="trow" data-n="${c.table}" data-m="${j + 1}"><b>${c.table}</b> × ${j + 1} = <b>${c.table * (j + 1)}</b></button>`).join('')}</div>`;
    return (c.s ? `<div class="k-sym ${/^[A-Za-z]$/.test(c.s) ? 'en' : ''}">${esc2(c.s)}</div>` : '') + `<div class="k-emo">${esc2(c.e)}</div>`;
  }
  function shapeSvg(k) {
    const f = `fill="#a78bfa" stroke="#6d28d9" stroke-width="4"`;
    const m = { circle: `<circle cx="60" cy="60" r="48" ${f}/>`, square: `<rect x="14" y="14" width="92" height="92" rx="6" ${f}/>`, triangle: `<polygon points="60,10 112,104 8,104" ${f}/>`, rect: `<rect x="6" y="28" width="108" height="64" rx="6" ${f}/>`, star: `<polygon points="60,6 75,44 116,46 84,72 95,112 60,90 25,112 36,72 4,46 45,44" ${f}/>`, heart: `<path d="M60 104 C10 66 14 22 44 22 C54 22 60 30 60 36 C60 30 66 22 76 22 C106 22 110 66 60 104Z" ${f}/>`, oval: `<ellipse cx="60" cy="60" rx="50" ry="34" ${f}/>`, diamond: `<polygon points="60,6 112,60 60,114 8,60" ${f}/>` };
    return `<svg viewBox="0 0 120 120" width="190" height="190">${m[k] || m.circle}</svg>`;
  }
  function showCard(noSpeak) {
    const { t, i } = LS, c = t.cards[i], last = i === t.cards.length - 1;
    ov(`<div class="k-lesson" style="--c:${t.col}">${BACK()}<div class="k-lhead"><b>${t.icon} ${esc2(tname(t))}</b><span>${i + 1}/${t.cards.length}</span></div>
      <div class="k-prog"><i style="width:${Math.round((i + 1) / t.cards.length * 100)}%"></i></div>
      <div class="k-lcard" id="kLCard">${cardVisual(t, c)}<h2 class="k-lname">${esc2(lab(c))}</h2></div>
      <div class="k-lbtns"><button class="k-round" data-kact="lhear" aria-label="${esc2(_t('सुनो'))}">🔊<small>${esc2(_t('सुनो'))}</small></button>${t.id === 'tab' ? '' : `<button class="k-round mic" data-kact="lspeak" id="kMicBtn">🎤<small>${esc2(_t('बोलो'))}</small></button>`}</div>
      <div class="k-nav"><button class="k-btn ghost" data-kact="lprev" ${i ? '' : 'disabled'}>◀ ${esc2(_t('पीछे'))}</button>${last ? `<button class="k-btn gold" data-kact="lquiz">🎯 ${esc2(_t('क्विज़ खेलो'))}</button>` : `<button class="k-btn" data-kact="lnext">${esc2(_t('आगे'))} ▶</button>`}</div></div>`, 'klesson', 'k-ov-lesson');
    const card = el('kLCard'); if (card) { card.classList.add('in'); }
    if (!noSpeak) hearCard();
  }
  function hearCard() { if (!LS) return; const c = LS.t.cards[LS.i]; P.kSay(c.say[L()] || c.say.hi, 'cheerful', 'cheerful'); }
  const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');
  function lev(a, b) { const m = a.length, n = b.length; if (!m) return n; if (!n) return m; let p = Array.from({ length: n + 1 }, (_, j) => j); for (let i = 1; i <= m; i++) { const c = [i]; for (let j = 1; j <= n; j++) c[j] = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); p = c; } return p[n]; }
  const heardOk = (said, want, alts) => [said].concat(alts || []).some(x => { const a = norm(x), b = norm(want); if (!a || !b) return false; if (a.includes(b) || b.includes(a)) return true; return lev(a, b) <= (b.length <= 3 ? 0 : b.length <= 6 ? 1 : 2); });
  /* "say it" — the phone's own recognizer; the spoken word is compared with the card */
  function speakCheck(want, wantAlt, onOk, onBad) {
    const lang = L() === 'en' ? 'en-IN' : 'hi-IN', old = S.settings.micLang; S.settings.micLang = lang;
    const mic = el('kMicBtn'); if (mic) mic.classList.add('rec');
    let done = false; const fin = () => { if (done) return; done = true; S.settings.micLang = old; if (mic) mic.classList.remove('rec'); };
    setTimeout(fin, 20000);
    try { listen((txt, alts) => { fin(); const ok = heardOk(txt, want, alts) || (wantAlt && heardOk(txt, wantAlt, alts)); (ok ? onOk : onBad)(txt); }); } catch (e) { fin(); toast(_t('बोलने की सुविधा अभी नहीं है')); }
  }
  function lspeak() {
    const c = LS.t.cards[LS.i];
    speakCheck(L() === 'en' ? c.we : c.w, c.s, txt => {
      const k = K(), key = today() + LS.t.id + LS.i; k.extra.sp = k.extra.sp || {}; let first = !k.extra.sp[key];
      k.extra.speakOk = (k.extra.speakOk || 0) + 1; if (first) { k.extra.sp[key] = 1; P.dayRec(k).s++; P.addStars(1, 'speak'); } save(); P.ev('speak', { id: LS.t.id, ok: 1 });
      P.sfx('ok'); P.kSay(_t2('वाह! बिल्कुल सही बोला!', [], 'Wow! You said it perfectly!', []), 'cheerful'); const cd = el('kLCard'); if (cd) { cd.classList.remove('hop'); void cd.offsetWidth; cd.classList.add('hop'); } toast('✅ ' + txt);
    }, txt => { P.sfx('bad'); toast(txt ? _t('मैंने सुना: {0} — फिर से बोलो', [txt]) : _t('सुन नहीं पाई — फिर से बोलो')); P.ev('speak', { id: LS.t.id, ok: 0 }); });
  }
  /* generic multiple-choice quiz for a topic */
  function quizFor(t) {
    const cs = t.cards, Q = [];
    const label = c => (L() === 'en' ? c.en : c.hi).split(/[—]/)[0].trim();
    const short = c => t.id === 'hi' ? c.s : t.id === 'en' ? c.s : label(c);
    for (let i = 0; i < 5; i++) {
      const c = cs[rnd(cs.length)], others = pick(cs.filter(x => x !== c), 2);
      if (t.id === 'num') {
        const o = new Set([c.n]); while (o.size < 3) o.add(Math.max(1, c.n + rnd(5) - 2));
        Q.push({ tag: 'ginti ' + c.n, p: `<div class="k-emojis big">${c.e.match(/\p{Extended_Pictographic}(?:\uFE0F)?/gu).map(x => `<i>${x}</i>`).join('')}</div><h3>${esc2(_t('कितने हैं?'))}</h3>`, say: _t2('कितने हैं?', [], 'How many are there?', []), o: shuffle([...o]).map(x => ({ h: String(x), ok: x === c.n })) });
      } else if (t.id === 'tab') {
        const n = c.table, m = 1 + rnd(10), ans = n * m, wrong = [...new Set([ans + n, ans - n, ans + 1, ans + 2].filter(x => x > 0 && x !== ans))].slice(0, 2);
        Q.push({ tag: n + ' ka pahada', p: `<div class="k-bigq">${n} × ${m} = ?</div>`, say: n + (L() === 'en' ? ' times ' : ' गुणा ') + m + (L() === 'en' ? ' is?' : ' बराबर?'), o: shuffle([ans, ...wrong]).map(x => ({ h: String(x), ok: x === ans })) });
      } else if (i % 2 === 0 || (t.id !== 'hi' && t.id !== 'en')) {          // look at the picture → choose the name
        const vis = c.hex ? `<div class="k-colorball sm" style="background:${c.hex}"></div>` : c.shape ? `<div class="k-shapebox sm">${shapeSvg(c.shape)}</div>` : `<div class="k-emo">${esc2(c.e)}</div>`;
        Q.push({ tag: t.id + ':' + short(c), p: vis + `<h3>${esc2(_t('यह क्या है?'))}</h3>`, say: _t2('यह क्या है?', [], 'What is this?', []), o: shuffle([c, ...others]).map(x => ({ h: esc2(short(x)), ok: x === c })) });
      } else {                                                                 // hear the letter/word → choose the picture
        const cc = shuffle([c, ...others]);
        Q.push({ tag: t.id + ':' + c.s, p: `<div class="k-sym">${esc2(c.s)}</div><h3>${esc2(L() === 'en' ? c.en : c.hi)}</h3><p class="k-sub">${esc2(_t('सही चित्र चुनो'))}</p>`, say: c.say[L()] || c.say.hi, o: cc.map(x => ({ h: `<span class="k-emo sm">${esc2(x.e)}</span>`, ok: x === c })) });
      }
    }
    return Q;
  }
  /* the shared multiple-choice runner (quiz + games) */
  let MC = null;
  function runMC(cfg) {            // cfg { title, icon, col, rounds[], onEnd(score, wrongTags), timer: sec }
    MC = Object.assign({ i: 0, score: 0, wrong: [], tries: 0 }, cfg); drawMC();
  }
  function drawMC() {
    const m = MC, q = m.rounds[m.i];
    ov(`<div class="k-mc" style="--c:${m.col || '#8b5cf6'}">${BACK()}<div class="k-lhead"><b>${esc2(m.icon || '🎯')} ${esc2(m.title)}</b><span>${m.i + 1}/${m.rounds.length} · ⭐ ${m.score}</span></div><div class="k-prog"><i style="width:${Math.round(m.i / m.rounds.length * 100)}%"></i></div>
      ${m.timer ? `<div class="k-timer"><i id="kTimer" style="animation-duration:${m.timer}s"></i></div>` : ''}
      <div class="k-q-area" id="kQA">${q.p}</div><button class="k-hear" data-kact="mchear">🔊 ${esc2(_t('फिर से सुनो'))}</button>
      <div class="k-opts n${q.o.length}">${q.o.map((o, i) => `<button class="k-opt" data-kact="mcopt" data-i="${i}">${o.h}</button>`).join('')}</div></div>`, 'kmc', 'k-ov-lesson');
    if (q.say) P.kSay(q.say, 'cheerful', 'cheerful');
    if (m.timer) { clearTimeout(m.tt); m.tt = setTimeout(() => mcAnswer(-1), m.timer * 1000); }
  }
  function mcAnswer(i) {
    const m = MC; if (!m || m.lock) return; const q = m.rounds[m.i]; clearTimeout(m.tt);
    const ok = i >= 0 && q.o[i].ok, btns = [...document.querySelectorAll('.k-opt')];
    if (!ok && i >= 0 && m.tries < 1 && !m.timer) { m.tries++; btns[i].classList.add('bad'); btns[i].disabled = true; P.sfx('bad'); P.kSay(_t2('कोई बात नहीं, फिर से कोशिश करो!', [], 'No problem, try again!', []), 'soft', 'gentle'); return; }
    m.lock = true;
    btns.forEach((b, j) => { if (q.o[j].ok) b.classList.add('good'); else if (j === i) b.classList.add('bad'); });
    if (ok && m.tries === 0) { m.score++; P.sfx('ok'); P.kSay([_t('शाबाश!'), _t('बिल्कुल सही!'), _t('वाह!')][rnd(3)], 'cheerful'); const qa = el('kQA'); if (qa) qa.classList.add('hop'); } else { m.wrong.push(q.tag); P.sfx('bad'); }
    setTimeout(() => { m.i++; m.tries = 0; m.lock = false; if (m.i >= m.rounds.length) endMC(); else drawMC(); }, ok ? 900 : 1500);
  }
  function endMC() {
    const m = MC; MC = null; const n = m.rounds.length, sc = m.score, frac = sc / n, stars = frac >= 1 ? 3 : frac >= 0.8 ? 2 : frac >= 0.6 ? 1 : 0;
    if (m.onEnd) m.onEnd(sc, m.wrong, stars);
    result(m.title, sc, n, stars, m.again);
  }
  function result(title, sc, n, stars, again, extra) {
    if (stars > 1) P.checkBadges();
    ov(`<div class="k-center k-result"><div class="k-burst">${stars >= 3 ? '🏆' : stars >= 1 ? '🎉' : '💪'}</div><h2>${esc2(stars >= 3 ? _t('कमाल! एकदम सही!') : stars >= 1 ? _t('बहुत अच्छे!') : _t('कोई बात नहीं, फिर कोशिश करो!'))}</h2>
      <p class="k-big">${esc2(sc)}/${esc2(n)}</p><div class="k-starsrow">${[0, 1, 2].map(i => `<i class="${i < stars ? 'on' : ''}" style="--i:${i}">⭐</i>`).join('')}</div>${extra || ''}
      ${again ? `<button class="k-btn gold" data-kact="again">🔁 ${esc2(_t('फिर खेलो'))}</button>` : ''}<button class="k-btn ghost" data-kact="closeov">${esc2(_t('वापस'))}</button></div>`, 'kres', 'k-ov-solid');
    if (stars >= 1) { window.PiyuStudent && PiyuStudent.fx.confetti(40 + stars * 50); P.sfx('win'); }
    P.kSay(stars >= 3 ? _t2('शाबाश {0}! तुमने सब सही किए!', [P.nm()], 'Well done {0}! All correct!', [P.nm()]) : stars >= 1 ? _t2('बहुत अच्छे {0}!', [P.nm()], 'Very good {0}!', [P.nm()]) : _t2('कोई बात नहीं {0}, फिर से कोशिश करेंगे।', [P.nm()], 'Never mind {0}, we will try again.', [P.nm()]), 'cheerful');
    window.__kAgain = again || null;
  }
  function lquiz() {
    const t = LS.t; LS = null;
    const startQ = () => runMC({ title: tname(t), icon: t.icon, col: t.col, rounds: quizFor(t), again: startQ, onEnd: (sc, wrong, stars) => {
      const k = K(), r = k.lessons[t.id] || (k.lessons[t.id] = { best: 0, n: 0, done: false }); r.n++; r.best = Math.max(r.best, sc); if (sc >= 3) r.done = true;
      const key = today() + t.id; k.extra.qd = k.extra.qd || {}; k.extra.qd[key] = (k.extra.qd[key] || 0) + 1;
      if (stars && k.extra.qd[key] <= 3) P.addStars(stars, 'lesson');
      P.dayRec(k).l++; save(); P.ev('lesson', { id: t.id, score: sc, of: 5, ok: sc >= 3 ? 1 : 0 }); wrong.forEach(w => P.ev('weak', { tag: w }));
    } });
    startQ();
  }

  /* ======================================================= Khelo ======================================================= */
  const GAMES = () => [
    { id: 'memory', icon: '🃏', hi: 'जोड़ी मिलाओ', en: 'Memory match', col: '#ec4899', min: 3 }, { id: 'count', icon: '🍎', hi: 'गिनती गिनो', en: 'Count it', col: '#22c55e', min: 3 },
    { id: 'bubble', icon: '🫧', hi: 'अक्षर फोड़ो', en: 'Pop the letter', col: '#06b6d4', min: 3 }, { id: 'tables', icon: '✖️', hi: 'पहाड़ा रेस', en: 'Tables race', col: '#a855f7', min: 6 },
    { id: 'colour', icon: '🎨', hi: 'रंग पहचानो', en: 'Find the colour', col: '#f97316', min: 3 }, { id: 'order', icon: '🔢', hi: 'क्रम से छुओ', en: 'Number order', col: '#3b82f6', min: 4 },
    { id: 'spell', icon: '🔠', hi: 'सही स्पेलिंग', en: 'Spell it', col: '#eab308', min: 5 }, { id: 'balloon', icon: '🎈', hi: 'जोड़-घटाव गुब्बारे', en: 'Math balloons', col: '#ef4444', min: 6 }, { id: 'odd', icon: '🧩', hi: 'अलग कौन?', en: 'Odd one out', col: '#14b8a6', min: 4 }
  ];
  function renderPlay() {
    const root = el('kPlay'); if (!root) return; const k = K(), a = age();
    root.innerHTML = `<div class="k-wrap"><div class="k-sec big"><h2>${esc2(_t('खेलो और सीखो'))}</h2></div><div class="k-games">${GAMES().filter(g => a >= g.min || g.min <= 3 || true).map((g, i) => { const r = k.games[g.id] || {}; const hard = a < g.min; return `<button class="k-game" data-kact="game" data-id="${g.id}" style="--c:${g.col};--i:${i}"><span class="k-game-ic">${g.icon}</span><b>${esc2(L() === 'en' ? g.en : g.hi)}</b><small>${r.best ? '🏆 ' + r.best : esc2(hard ? _t('बड़े बच्चों के लिए') : _t('खेलो'))}</small></button>`; }).join('')}</div>
      <div class="k-card k-tip"><span>🎯</span><p>${esc2(_t('हर खेल 1–2 मिनट का है। अच्छा खेलो तो स्टार मिलते हैं!'))}</p></div></div>`;
  }
  const bumpGame = (id, score, of, wrong, stars) => {
    const k = K(), r = k.games[id] || (k.games[id] = { best: 0, n: 0 }); r.n++; r.best = Math.max(r.best, score); P.dayRec(k).g++;
    const key = today() + id; k.extra.gd = k.extra.gd || {}; k.extra.gd[key] = (k.extra.gd[key] || 0) + 1;
    if (stars && k.extra.gd[key] <= 3) P.addStars(stars, 'game'); save(); P.ev('game', { game: id, score, of, ok: stars ? 1 : 0 }); (wrong || []).forEach(w => P.ev('weak', { tag: w }));
  };
  function startGame(id) {
    const g = GAMES().find(x => x.id === id), a = age(); if (!g) return;
    const again = () => startGame(id); const base = { title: L() === 'en' ? g.en : g.hi, icon: g.icon, col: g.col, again };
    if (id === 'count') { const mx = a < 5 ? 5 : a < 8 ? 10 : 15; runMC(Object.assign(base, { rounds: Array.from({ length: 6 }, () => { const n = 1 + rnd(mx), em = D.countEmoji[rnd(D.countEmoji.length)]; const o = new Set([n]); while (o.size < 3) o.add(Math.max(1, n + rnd(5) - 2)); return { tag: 'ginti ' + n, p: `<div class="k-emojis big scatter">${Array.from({ length: n }, (_, j) => `<i style="--j:${j};--x:${rnd(70)};--y:${rnd(40)}">${em}</i>`).join('')}</div><h3>${esc2(_t('कितने हैं?'))}</h3>`, say: _t2('कितने हैं?', [], 'How many are there?', []), o: shuffle([...o]).map(x => ({ h: String(x), ok: x === n })) }; }), onEnd: (s, w, st) => bumpGame(id, s, 6, w, st) })); }
    else if (id === 'tables') { const maxT = a < 7 ? 5 : a < 9 ? 10 : 12; runMC(Object.assign(base, { timer: 10, rounds: Array.from({ length: 8 }, () => { const n = 2 + rnd(maxT - 1), m = 1 + rnd(10), ans = n * m, o = new Set([ans]); while (o.size < 3) o.add(Math.max(1, ans + (rnd(2) ? 1 : -1) * (1 + rnd(n)))); return { tag: n + ' ka pahada', p: `<div class="k-bigq">${n} × ${m} = ?</div>`, say: '', o: shuffle([...o]).map(x => ({ h: String(x), ok: x === ans })) }; }), onEnd: (s, w, st) => bumpGame(id, s, 8, w, st) })); }
    else if (id === 'colour') { runMC(Object.assign(base, { rounds: Array.from({ length: 8 }, () => { const cs = pick(D.colours, 4), c = cs[0]; return { tag: 'rang ' + c[0], p: `<h2 class="k-touch">${esc2(L() === 'en' ? 'Touch ' + c[1] : c[0] + ' रंग छुओ')}</h2>`, say: L() === 'en' ? 'Touch ' + c[1] : c[0] + ' रंग छुओ', o: shuffle(cs).map(x => ({ h: `<span class="k-colorball sm" style="background:${x[2]}"></span>`, ok: x === c })) }; }), onEnd: (s, w, st) => bumpGame(id, s, 8, w, st) })); }
    else if (id === 'odd') {
      const G = [['🍎🍌🍇🍊🍓', 'फल'], ['🐶🐱🐮🐴🐸', 'जानवर'], ['🚗🚌🚲🚂✈️', 'सवारी'], ['⚽🏏🎾🏀🏐', 'खेल'], ['🌹🌻🌷🌸🌼', 'फूल'], ['🥕🥔🌽🍅🥦', 'सब्ज़ी']];
      const E = g => [...g[0].match(/\p{Extended_Pictographic}(?:️)?/gu)];
      runMC(Object.assign(base, { rounds: Array.from({ length: 6 }, () => { const [g1, g2] = pick(G, 2), a1 = pick(E(g1), 3), odd = E(g2)[rnd(5)]; return { tag: 'alag', p: `<h3>${esc2(_t('कौन-सा अलग है?'))}</h3>`, say: _t2('कौन-सा अलग है?', [], 'Which one is different?', []), o: shuffle([...a1.map(x => ({ h: `<span class="k-emo sm">${x}</span>`, ok: false })), { h: `<span class="k-emo sm">${odd}</span>`, ok: true }]) }; }), onEnd: (s, w, st) => bumpGame(id, s, 6, w, st) }));
    } else if (id === 'memory') memory(); else if (id === 'bubble') bubbles(); else if (id === 'order') order(); else if (id === 'spell') spell(); else if (id === 'balloon') balloons();
  }
  /* memory match */
  function memory() {
    const a = age(), pairs = a < 5 ? 4 : a < 8 ? 6 : 8, em = pick(['🐶', '🐱', '🐰', '🦁', '🐸', '🐵', '🐼', '🦄', '🐢', '🐟', '🦋', '🌻', '🍎', '🚗', '⭐', '🎈'], pairs), deck = shuffle([...em, ...em]);
    let open = [], found = 0, moves = 0, lock = false; const t0 = Date.now();
    ov(`<div class="k-mc" style="--c:#ec4899">${BACK()}<div class="k-lhead"><b>🃏 ${esc2(_t('जोड़ी मिलाओ'))}</b><span id="kMv">0 ${esc2(_t('चाल'))}</span></div><div class="k-memgrid g${pairs * 2}">${deck.map((e, i) => `<button class="k-mem" data-i="${i}"><span class="k-mem-in"><span class="k-mem-b">❓</span><span class="k-mem-f">${e}</span></span></button>`).join('')}</div></div>`, 'kmem', 'k-ov-lesson');
    P.kSay(_t2('एक जैसी जोड़ी ढूँढो!', [], 'Find the matching pairs!', []), 'cheerful');
    el('kOv').onclick = e => {
      const c = e.target.closest('.k-mem'); if (!c) return;
      if (lock || c.classList.contains('open') || c.classList.contains('done')) return; c.classList.add('open'); P.sfx('tap'); open.push(c);
      if (open.length === 2) { moves++; el('kMv').textContent = moves + ' ' + _t('चाल'); const [x, y] = open; lock = true;
        if (deck[+x.dataset.i] === deck[+y.dataset.i]) { setTimeout(() => { x.classList.add('done'); y.classList.add('done'); open = []; lock = false; found++; P.sfx('ok'); if (found === pairs) { const stars = moves <= pairs + 2 ? 3 : moves <= pairs * 2 ? 2 : 1; bumpGame('memory', Math.max(0, 40 - moves), 0, [], stars); result(_t('जोड़ी मिलाओ'), pairs, pairs, stars, () => startGame('memory')); } }, 450); }
        else setTimeout(() => { x.classList.remove('open'); y.classList.remove('open'); open = []; lock = false; }, 900); }
    };
  }
  /* pop the letter / number the voice asks for */
  function bubbles() {
    const k = K(), lang = L(), a = age(), pool = a < 6 ? (lang === 'en' ? D.TOPICS[1].cards.slice(0, 10) : D.TOPICS[0].cards.slice(0, 13)) : (lang === 'en' ? D.TOPICS[1].cards : D.TOPICS[0].cards.slice(0, 36));
    const targets = pick(pool, 8); let ti = 0, score = 0, miss = 0, alive = true; const wrongTags = [];
    ov(`<div class="k-mc" style="--c:#06b6d4">${BACK()}<div class="k-lhead"><b>🫧 ${esc2(_t('अक्षर फोड़ो'))}</b><span id="kBs">0/8</span></div><div class="k-bub-ask" id="kAsk"></div><div class="k-sea" id="kSea"></div></div>`, 'kbub', 'k-ov-lesson');
    const sea = el('kSea'), ask = el('kAsk'); let timer;
    const next = () => { if (ti >= targets.length) return end(); const c = targets[ti]; ask.innerHTML = `<b>${esc2(c.s)}</b> ${esc2(_t('को फोड़ो'))} <button class="k-hear sm" data-kact="bubhear">🔊</button>`; P.kSay(lang === 'en' ? 'Pop the letter ' + c.s : c.s + ' को फोड़ो', 'cheerful'); };
    const spawn = () => { if (!alive || !el('kSea')) return; const cur = targets[ti]; if (!cur) return;
      const c = Math.random() < 0.5 ? cur : pool[rnd(pool.length)], b = document.createElement('button'); b.className = 'k-bub'; b.textContent = c.s; b.style.left = (4 + rnd(76)) + '%'; b.style.background = `hsl(${rnd(360)} 85% 70%)`; b.style.animationDuration = (6 + rnd(3)) + 's'; b.dataset.s = c.s; sea.appendChild(b); setTimeout(() => b.remove(), 9500); };
    sea.onclick = e => { const b = e.target.closest('.k-bub'); if (!b) return; const cur = targets[ti]; if (b.dataset.s === cur.s) { b.classList.add('pop'); P.sfx('pop'); score++; ti++; el('kBs').textContent = ti + '/8'; setTimeout(() => b.remove(), 250); next(); } else { b.classList.add('wob'); P.sfx('bad'); miss++; wrongTags.push('akshar ' + cur.s); } };
    const end = () => { alive = false; clearInterval(timer); const stars = miss <= 1 ? 3 : miss <= 4 ? 2 : 1; bumpGame('bubble', score, 8, wrongTags, stars); result(_t('अक्षर फोड़ो'), score, 8, stars, () => startGame('bubble')); };
    ask.onclick = e => { if (e.target.closest('[data-kact=bubhear]')) { const c = targets[ti]; if (c) P.kSay(lang === 'en' ? c.s : c.s, 'cheerful'); } };
    next(); for (let i = 0; i < 3; i++) setTimeout(spawn, i * 500); timer = setInterval(spawn, 900);
    window.PiyuKids.onClose = () => { alive = false; clearInterval(timer); window.PiyuKids.onClose = null; };
  }
  /* tap the numbers in order */
  function order() {
    const a = age(), n = a < 5 ? 5 : a < 8 ? 8 : 10, start = 1 + (a >= 8 ? rnd(10) : 0), nums = Array.from({ length: n }, (_, i) => start + i); let next = 0, errs = 0; const t0 = Date.now();
    ov(`<div class="k-mc" style="--c:#3b82f6">${BACK()}<div class="k-lhead"><b>🔢 ${esc2(_t('क्रम से छुओ'))}</b><span id="kOt">${nums[0]}</span></div><div class="k-prog"><i id="kOp" style="width:0"></i></div><h3 class="k-touch">${esc2(_t('छोटे से बड़े नंबर क्रम से छुओ'))}</h3><div class="k-ordergrid">${shuffle(nums).map(x => `<button class="k-num" data-n="${x}" style="--r:${rnd(14) - 7}deg">${x}</button>`).join('')}</div></div>`, 'kord', 'k-ov-lesson');
    P.kSay(_t2('सबसे छोटे नंबर से शुरू करो!', [], 'Start from the smallest number!', []), 'cheerful');
    el('kOv').onclick = e => { const b = e.target.closest('.k-num'); if (!b) return; if (b.classList.contains('ok')) return;
      if (+b.dataset.n === nums[next]) { b.classList.add('ok'); P.sfx('ok'); next++; el('kOp').style.width = Math.round(next / n * 100) + '%'; if (next < n) el('kOt').textContent = nums[next]; else { const sec = (Date.now() - t0) / 1000, stars = errs === 0 && sec < n * 3 ? 3 : errs <= 2 ? 2 : 1; bumpGame('order', n - errs, n, errs ? ['kram'] : [], stars); setTimeout(() => result(_t('क्रम से छुओ'), n - errs, n, stars, () => startGame('order')), 500); } }
      else { errs++; b.classList.add('wob'); P.sfx('bad'); setTimeout(() => b.classList.remove('wob'), 400); } };
  }
  /* spell the word from its picture */
  const WORDS = [['cat', '🐱'], ['dog', '🐶'], ['sun', '☀️'], ['fish', '🐟'], ['bird', '🐦'], ['ball', '⚽'], ['tree', '🌳'], ['milk', '🥛'], ['book', '📖'], ['star', '⭐'], ['cow', '🐄'], ['hen', '🐔'], ['bus', '🚌'], ['egg', '🥚'], ['bee', '🐝'], ['frog', '🐸'], ['moon', '🌙'], ['rain', '🌧️'], ['apple', '🍎'], ['house', '🏠']];
  function spell() {
    const a = age(), pool = WORDS.filter(w => a < 6 ? w[0].length <= 3 : a < 8 ? w[0].length <= 4 : true), words = pick(pool, 5); let wi = 0, score = 0, wrong = []; let cur, built, errs;
    const draw = () => { const [w, e] = words[wi]; built = ''; errs = 0; cur = w; window.__spellCur = w; ov(`<div class="k-mc" style="--c:#eab308">${BACK()}<div class="k-lhead"><b>🔠 ${esc2(_t('सही स्पेलिंग'))}</b><span>${wi + 1}/5 · ⭐ ${score}</span></div><div class="k-prog"><i style="width:${wi / 5 * 100}%"></i></div><div class="k-emo big">${e}</div><button class="k-hear" data-kact="spellhear">🔊 ${esc2(_t('सुनो'))}</button><div class="k-slots" id="kSlots">${[...w].map(() => '<i></i>').join('')}</div><div class="k-letters">${shuffle([...w]).map((l, i) => `<button class="k-let" data-l="${l}" data-i="${i}">${l}</button>`).join('')}</div></div>`, 'kspell', 'k-ov-lesson'); P.kSay(w, 'cheerful'); };
    draw();
    el('kOv').onclick = e => {
      if (e.target.closest('[data-kact=spellhear]')) return P.kSay(cur, 'cheerful');
      const b = e.target.closest('.k-let'); if (!b || b.disabled) return;
      if (b.dataset.l === cur[built.length]) { b.disabled = true; b.classList.add('used'); built += b.dataset.l; el('kSlots').children[built.length - 1].textContent = b.dataset.l; el('kSlots').children[built.length - 1].classList.add('on'); P.sfx('tap');
        if (built === cur) { if (!errs) score++; else wrong.push('spell ' + cur); P.sfx('ok'); P.kSay(_t('शाबाश!'), 'cheerful'); setTimeout(() => { wi++; if (wi >= 5) { const stars = score >= 5 ? 3 : score >= 4 ? 2 : score >= 3 ? 1 : 0; bumpGame('spell', score, 5, wrong, stars); result(_t('सही स्पेलिंग'), score, 5, stars, () => startGame('spell')); } else draw(); }, 900); } }
      else { errs++; b.classList.add('wob'); P.sfx('bad'); setTimeout(() => b.classList.remove('wob'), 400); }
    };
  }
  /* balloons with answers rise; pop the right one */
  function balloons() {
    const a = age(), mx = a < 7 ? 5 : a < 9 ? 10 : 20; const rounds = Array.from({ length: 8 }, () => { const plus = Math.random() < 0.6 || a < 7, x = 1 + rnd(mx), y = 1 + rnd(mx), A = plus ? x + y : Math.max(x, y), B = plus ? 0 : Math.min(x, y); return { q: plus ? `${x} + ${y}` : `${Math.max(x, y)} − ${Math.min(x, y)}`, ans: plus ? x + y : Math.abs(x - y) }; });
    let ri = 0, score = 0, alive = true, timer; const wrong = [];
    ov(`<div class="k-mc" style="--c:#ef4444">${BACK()}<div class="k-lhead"><b>🎈 ${esc2(_t('जोड़-घटाव गुब्बारे'))}</b><span id="kBl">0/8</span></div><div class="k-bigq" id="kBq"></div><div class="k-sea" id="kSea"></div></div>`, 'kbal', 'k-ov-lesson');
    const sea = el('kSea'); const ask = () => { const r = rounds[ri]; el('kBq').textContent = r.q + ' = ?'; P.kSay(r.q.replace('+', L() === 'en' ? ' plus ' : ' जोड़ ').replace('−', L() === 'en' ? ' minus ' : ' घटा '), 'cheerful'); };
    const spawn = () => { if (!alive || !el('kSea')) return; const r = rounds[ri]; if (!r) return; const v = Math.random() < 0.45 ? r.ans : Math.max(0, r.ans + (rnd(2) ? 1 : -1) * (1 + rnd(4))); const b = document.createElement('button'); b.className = 'k-bub k-ball'; b.textContent = v; b.dataset.v = v; b.style.left = (4 + rnd(76)) + '%'; b.style.background = `hsl(${rnd(360)} 85% 68%)`; b.style.animationDuration = (6.5 + rnd(3)) + 's'; sea.appendChild(b); setTimeout(() => b.remove(), 10000); };
    sea.onclick = e => { const b = e.target.closest('.k-bub'); if (!b) return; const r = rounds[ri]; if (+b.dataset.v === r.ans) { b.classList.add('pop'); P.sfx('pop'); score++; ri++; el('kBl').textContent = ri + '/8'; [...sea.children].forEach(x => x.remove()); if (ri >= 8) end(); else ask(); } else { b.classList.add('wob'); P.sfx('bad'); wrong.push('jod-ghatav'); } };
    const end = () => { alive = false; clearInterval(timer); const stars = wrong.length <= 1 ? 3 : wrong.length <= 4 ? 2 : 1; bumpGame('balloon', score, 8, wrong.slice(0, 2), stars); result(_t('जोड़-घटाव गुब्बारे'), score, 8, stars, () => startGame('balloon')); };
    ask(); for (let i = 0; i < 3; i++) setTimeout(spawn, i * 450); timer = setInterval(spawn, 800);
    window.PiyuKids.onClose = () => { alive = false; clearInterval(timer); window.PiyuKids.onClose = null; };
  }

  /* ======================================================= Kahani ======================================================= */
  function renderStory() {
    const root = el('kStory'); if (!root) return; const k = K();
    root.innerHTML = `<div class="k-wrap"><div class="k-sec big"><h2>${esc2(_t('कहानी सुनो'))}</h2><div class="k-langsw"><button class="${L() === 'hi' ? 'on' : ''}" data-kact="clang" data-l="hi">हिन्दी</button><button class="${L() === 'en' ? 'on' : ''}" data-kact="clang" data-l="en">English</button></div></div>
      <div class="k-stories">${D.STORIES.map((s, i) => `<button class="k-story ${s.night ? 'night' : ''}" data-kact="story" data-id="${s.id}" style="--i:${i}"><span class="k-story-ic">${s.e}</span><b>${esc2(L() === 'en' ? s.en : s.hi)}</b><small>${s.night ? '🌙 ' + esc2(_t('सोने की कहानी')) : esc2(_t('{0} पन्ने', [s.pages.length]))}${(k.stories[s.id] || {}).n ? ' · ✔' : ''}</small></button>`).join('')}</div></div>`;
  }
  let SS = null;
  function openStory(id) {
    const s = D.STORIES.find(x => x.id === id); if (!s) return; SS = { s, i: 0, auto: true, tok: 0 }; showPage();
  }
  function showPage() {
    const { s, i } = SS, p = s.pages[i], lang = L(), txt = p[lang], words = txt.split(/\s+/);
    ov(`<div class="k-story-v ${s.night ? 'night' : ''}">${BACK()}<div class="k-lhead"><b>${s.e} ${esc2(lang === 'en' ? s.en : s.hi)}</b><span>${i + 1}/${s.pages.length}</span></div><div class="k-prog"><i style="width:${(i + 1) / s.pages.length * 100}%"></i></div>
      <div class="k-scene-st" id="kScenePg"><span class="k-scene-e">${p.e}</span></div>
      <p class="k-text" id="kText">${words.map((w, j) => `<span data-w="${j}">${esc2(w)}</span>`).join(' ')}</p>
      <div class="k-lbtns"><button class="k-round" data-kact="sprev" ${i ? '' : 'disabled'}>◀</button><button class="k-round big" data-kact="splay">${SS.auto ? '⏸' : '▶'}<small>${esc2(SS.auto ? _t('रुको') : _t('सुनाओ'))}</small></button><button class="k-round" data-kact="snext">▶</button></div>
      <div class="k-langsw"><button class="${lang === 'hi' ? 'on' : ''}" data-kact="slang" data-l="hi">हिन्दी</button><button class="${lang === 'en' ? 'on' : ''}" data-kact="slang" data-l="en">English</button></div></div>`, 'kstory', s.night ? 'k-ov-night' : 'k-ov-story');
    if (SS.auto) readPage();
  }
  async function readPage() {
    const { s, i } = SS, tok = ++SS.tok, p = s.pages[i], words = [...document.querySelectorAll('#kText [data-w]')];
    P.kSay(p[L()], s.night ? 'night' : 'story', 'gentle');
    const per = Math.max(260, Math.min(520, (p[L()].length * 62) / words.length)); let w = 0;
    const iv = setInterval(() => { if (!SS || SS.tok !== tok) return clearInterval(iv); words.forEach((x, j) => x.classList.toggle('on', j <= w)); if (w < words.length) w++; }, per);
    try { await waitSpeech(60000); } catch (e) { }
    clearInterval(iv); if (!SS || SS.tok !== tok) return; if (window.__ovTab !== 'kstory') { SS = null; return; } words.forEach(x => x.classList.add('on'));
    if (SS.auto) { await sleep(600); if (!SS || SS.tok !== tok) return; if (window.__ovTab !== 'kstory') { SS = null; return; } if (SS.i < SS.s.pages.length - 1) { SS.i++; showPage(); } else storyEnd(); }
  }
  function storyEnd() {
    const s = SS.s; SS.tok++; const k = K(), r = k.stories[s.id] || (k.stories[s.id] = { n: 0 }); r.n++; P.dayRec(k).s++; save(); P.ev('story', { id: s.id });
    window.PiyuStudent && PiyuStudent.fx.confetti(70); P.sfx('win');
    ov(`<div class="k-center k-moral ${s.night ? 'night' : ''}"><div class="k-burst">${s.e}</div><h2>${esc2(_t('कहानी की सीख'))}</h2><p class="k-text on">${esc2(s.moral[L()])}</p><button class="k-btn gold" data-kact="sq">🎯 ${esc2(_t('2 सवाल खेलो'))}</button><button class="k-btn ghost" data-kact="closeov">${esc2(_t('वापस'))}</button></div>`, 'kstory', s.night ? 'k-ov-night' : 'k-ov-story');
    P.kSay(s.moral[L()], s.night ? 'night' : 'story', 'gentle'); P.checkBadges();
  }
  function storyQuiz() {
    const s = SS.s, lang = L(); SS = null;
    runMC({ title: lang === 'en' ? s.en : s.hi, icon: s.e, col: '#f59e0b', rounds: s.qs.map(q => ({ tag: 'kahani ' + s.id, p: `<div class="k-emo">${s.e}</div><h3>${esc2(q[lang])}</h3>`, say: q[lang], o: shuffle(q.o.map((o, j) => ({ h: esc2(o[lang === 'en' ? 1 : 0]), ok: j === q.a }))) })), onEnd: (sc, w, st) => { if (sc) P.addStars(sc, 'story'); P.ev('story', { id: s.id, q: sc }); } });
  }

  /* ======================================================= Homework photo ======================================================= */
  function homework() {
    ov(`<div class="k-center k-hw">${BACK()}<div class="k-burst">📷</div><h2>${esc2(_t('होमवर्क समझो'))}</h2><p class="k-sub">${esc2(_t('कॉपी या किताब के सवाल की फोटो लो। Piyu उसे आसान भाषा में समझाएगी।'))}</p>
      <label class="k-btn gold">📷 ${esc2(_t('फोटो खींचो'))}<input type="file" id="kHwFile" accept="image/*" capture="environment" hidden></label><label class="k-btn ghost">🖼️ ${esc2(_t('गैलरी से चुनो'))}<input type="file" id="kHwFile2" accept="image/*" hidden></label>
      <div class="k-hwout" id="kHwOut"></div></div>`, 'khw', 'k-ov-solid');
    const go = async f => { if (!f) return; const out = el('kHwOut'); out.innerHTML = `<div class="k-think"><i>🤔</i><span>${esc2(_t('पढ़ रही हूँ…'))}</span></div>`; let text = '';
      try { const r = await PiyuOCR.recognize(f, { langs: S.settings.ocrLang || 'eng+hin' }); text = (r.text || '').replace(/\s+/g, ' ').trim().slice(0, 400); } catch (e) { }
      if (text.length < 4) { out.innerHTML = `<p class="k-sub">${esc2(_t('फोटो साफ़ नहीं पढ़ी गई। रोशनी में सीधी फोटो लें।'))}</p>`; P.kSay(_t2('फोटो साफ़ नहीं थी। एक बार फिर लो।', [], 'The photo was not clear. Please take it again.', []), 'soft', 'gentle'); return; }
      out.innerHTML = `<div class="k-said"><small>${esc2(_t('सवाल:'))}</small> ${esc2(text)}</div><div class="k-think"><i>🤔</i><span>${esc2(_t('समझा रही हूँ…'))}</span></div><div class="k-ans" id="kAns"></div>`;
      let ans = ''; try {
        const r = await fetchU('/api/ai/chat', { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()), body: JSON.stringify({ q: (L() === 'en' ? 'Explain this school question in simple words and show how to solve it step by step: ' : 'यह स्कूल का सवाल आसान शब्दों में समझाओ और हल करना सिखाओ: ') + text, kid: true, lang: S.settings.lang, history: [] }) });
        if (!r.ok) throw new Error('http' + r.status); const rd = r.body.getReader(), dec = new TextDecoder(); let buf = '';
        for (;;) { const { value, done } = await rd.read(); if (done) break; buf += dec.decode(value, { stream: true }); let nl; while ((nl = buf.indexOf('\n')) >= 0) { const ln = buf.slice(0, nl).trim(); buf = buf.slice(nl + 1); if (!ln) continue; const j = JSON.parse(ln); if (j.t) { ans += j.t; el('kAns').textContent = ans; } } }
      } catch (e) { }
      const th = out.querySelector('.k-think'); if (th) th.remove();
      if (!ans.trim()) { el('kAns').textContent = _t('अभी Piyu का AI उपलब्ध नहीं है। यह सवाल मम्मी-पापा या टीचर से पूछो।'); return; }
      const k = K(); k.extra.hw = (k.extra.hw || 0) + 1; P.dayRec(k).l++; save(); P.addStars(1, 'homework'); P.ev('photo', { n: 1 }); P.kSay(ans, 'soft', 'gentle'); el('kAns').insertAdjacentHTML('afterend', `<button class="k-btn" data-kact="hwhear">🔊 ${esc2(_t('फिर सुनो'))}</button>`); window.__kHw = ans; };
    el('kHwFile').onchange = e => go(e.target.files[0]); el('kHwFile2').onchange = e => go(e.target.files[0]);
  }

  /* ======================================================= events ======================================================= */
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kact]'); if (!b || !b.closest('#kLearn,#kPlay,#kStory,#kOv')) return; const a = b.dataset.kact;
    switch (a) {
      case 'clang': K().clang = b.dataset.l; save(); renderAll(); break;
      case 'topic': openTopic(b.dataset.id); break;
      case 'lhear': hearCard(); break; case 'lspeak': lspeak(); break;
      case 'lnext': if (LS) { LS.i++; showCard(); } break; case 'lprev': if (LS) { LS.i = Math.max(0, LS.i - 1); showCard(); } break;
      case 'lquiz': lquiz(); break;
      case 'trow': { const n = +b.dataset.n, m = +b.dataset.m; P.kSay(L() === 'en' ? n + ' times ' + m + ' is ' + n * m : n + ' गुणा ' + m + ' बराबर ' + n * m, 'cheerful'); b.classList.add('on'); break; }
      case 'mcopt': mcAnswer(+b.dataset.i); break;
      case 'mchear': if (MC) { const q = MC.rounds[MC.i]; if (q.say) P.kSay(q.say, 'cheerful'); } break;
      case 'again': if (window.__kAgain) window.__kAgain(); break;
      case 'game': startGame(b.dataset.id); break;
      case 'story': openStory(b.dataset.id); break;
      case 'splay': if (SS) { SS.auto = !SS.auto; SS.tok++; try { stopSpeaking(); } catch (er) { } showPage(); } break;
      case 'snext': if (SS) { SS.tok++; if (SS.i < SS.s.pages.length - 1) { SS.i++; showPage(); } else storyEnd(); } break;
      case 'sprev': if (SS) { SS.tok++; SS.i = Math.max(0, SS.i - 1); showPage(); } break;
      case 'slang': if (SS) { K().clang = b.dataset.l; save(); SS.tok++; showPage(); } break;
      case 'sq': storyQuiz(); break;
      case 'hwhear': if (window.__kHw) P.kSay(window.__kHw, 'soft', 'gentle'); break;
    }
  });
  function renderAll() { renderLearn(); renderPlay(); renderStory(); }
  function onTab(n) { if (n === 'klearn') renderLearn(); else if (n === 'kplay') renderPlay(); else if (n === 'kstory') renderStory(); }
  window.PiyuKidsPlay = { renderAll, onTab, homework, speakCheck, heardOk, lev, norm, quizFor, runMC, startGame, openStory, openTopic };
})();
