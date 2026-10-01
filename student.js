/* Piyu Student mode — UI + glue (courses, reader, quiz, question paper, flashcards, study plan, auto mode, teacher voice).
   The logic (question making, grading, spaced repetition, weak-topic analysis, planning) lives in study.js and is tested in Node. Everything is offline and free. */
(function () {
  'use strict';
  const SY = window.PiyuStudy;
  const DAYMS = 864e5;
  const isStu = () => S.settings.mode === 'student';
  const isKid = () => S.settings.mode === 'kids';
  const pad2 = n => String(n).padStart(2, '0');
  const dkey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const el = id => document.getElementById(id);
  const fmtT = ts => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const WD = () => [_t('रवि'), _t('सोम'), _t('मंगल'), _t('बुध'), _t('गुरु'), _t('शुक्र'), _t('शनि')];
  const dayLabel = ts => { const d = new Date(ts), t0 = new Date(); t0.setHours(0, 0, 0, 0); const diff = Math.round((new Date(d).setHours(0, 0, 0, 0) - t0.getTime()) / DAYMS); return diff === 0 ? _t('आज') : diff === 1 ? _t('कल') : WD()[d.getDay()] + ' ' + d.getDate() + '/' + (d.getMonth() + 1); };
  function ensure() {
    ['courses', 'cards', 'attempts', 'sdays'].forEach(k => { if (!Array.isArray(S[k])) S[k] = []; });
    if (!isStu()) return;                      // Business accounts keep their settings untouched
    const s = S.settings;
    if (!s.splan) s.splan = { from: '17:00', to: '20:00', session: 30, brk: 5, days: [0, 1, 2, 3, 4, 5, 6], horizon: 7 };
    if (s.sauto == null) s.sauto = true; if (!s.sgoal) s.sgoal = 60; if (s.steacher == null) s.steacher = true;
  }
  const courseById = id => S.courses.find(c => c.id === id);
  const docById = id => S.docs.find(d => d.id === id);
  function chapterTexts(co, ids) {
    const out = [];
    (co.chapters || []).forEach(ch => {
      if (ids && ids.length && !ids.includes(ch.id)) return;
      const d = docById(ch.docId); if (!d) return;
      out.push({ id: ch.id, title: ch.title, text: SY.chapterText(d.blocks, ch) });
    });
    return out;
  }
  const poolCache = new Map();
  function poolFor(co, ids) {
    const key = co.id + '|' + (co.updatedAt || 0) + '|' + (ids || []).join(',') + '|' + S.docs.length;
    if (!poolCache.has(key)) { if (poolCache.size > 8) poolCache.clear(); poolCache.set(key, SY.buildPool(co.id, chapterTexts(co, ids))); }
    return poolCache.get(key);
  }
  const stats = () => SY.analyze(S.courses, S.attempts, S.cards, Date.now());
  const chName = (co, chId) => { const c = (co.chapters || []).find(x => x.id === chId); return c ? c.title : ''; };
  const LV = () => ({ weak: _t('कमज़ोर'), okay: _t('ठीक-ठाक'), strong: _t('मज़बूत'), new: _t('नया') });
  const pct = a => a == null ? '—' : Math.round(a * 100) + '%';
  const sname = () => (S.settings.sname || '').trim();
  const toastS = m => toast(m);

  /* ---------------- study log (minutes per day, streak) ---------------- */
  function logToday(d) {
    ensure(); const k = dkey(Date.now()); let e = S.sdays.find(x => x.id === k);
    if (!e) { e = { id: k, min: 0, cards: 0, q: 0 }; S.sdays.push(e); }
    e.min += d.min || 0; e.cards += d.cards || 0; e.q += d.q || 0; save();
  }
  const todayMin = () => { const e = S.sdays.find(x => x.id === dkey(Date.now())); return e ? Math.round(e.min) : 0; };
  function streakDays() {
    const have = new Set(S.sdays.filter(x => x.min > 0 || x.cards > 0 || x.q > 0).map(x => x.id)); let n = 0;
    const d = new Date(); if (!have.has(dkey(d))) d.setDate(d.getDate() - 1);
    while (have.has(dkey(d))) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }

  /* ---------------- teacher: calm, soft, a little distant — slow and low ---------------- */
  const tName = () => sname() || _t('आप');
  function teach(text, opts) { if (S.settings.steacher === false || !text) return; say(text, Object.assign({ mood: 'gentle' }, opts || {})); }
  const T = {
    greet() {
      const h = new Date().getHours(), n = tName(), w = h < 12 ? _t('सुप्रभात') : h < 17 ? _t('नमस्ते') : _t('शुभ संध्या');
      const todays = todaySessions(), weak = stats().filter(x => x.level === 'weak').length, dueC = SY.cardStats(S.cards).due;
      let t = w + ' ' + n + '। ';
      if (!S.courses.length) return t + _t2('सबसे पहले अपना course जोड़िए। उसकी PDF या notes दीजिए, फिर मैं सवाल और flashcards बना दूँगी।', [], 'First, add your course. Give me its PDF or notes and I will make questions and flashcards.', []);
      t += todays.length ? _t2('आज आपके {0} study session हैं। पहला {1} बजे है — {2}।', [todays.length, fmtT(todays[0].alarmAt), todays[0].title.replace(/^📚\s*/, '')], 'You have {0} study sessions today. The first is at {1} — {2}.', [todays.length, fmtT(todays[0].alarmAt), todays[0].title.replace(/^📚\s*/, '')]) : _t2('आज के लिए कोई session तय नहीं है। चाहें तो मैं आपका plan बना दूँ।', [], 'There is no session planned for today. Shall I make your plan?', []);
      if (weak) t += ' ' + _t2('{0} topic अभी कमज़ोर हैं, उन पर ध्यान दीजिए।', [weak], '{0} topics are still weak. Please give them attention.', [weak]);
      if (dueC) t += ' ' + _t2('{0} flashcards दोहराने के लिए तैयार हैं।', [dueC], '{0} flashcards are ready for revision.', [dueC]);
      return t;
    },
    quizDone(r) {
      const n = tName(), p = r.max ? r.got / r.max : 0, weak = r.weakTopics.slice(0, 2);
      let t = _t2('{0}, आपने {1} में से {2} अंक पाए।', [n, r.max, r.got], '{0}, you scored {2} out of {1}.', [n, r.max, r.got]);
      t += ' ' + (p >= 0.8 ? _t2('बहुत अच्छा। इसी तरह लगे रहिए।', [], 'Very good. Keep going like this.', []) : p >= 0.5 ? _t2('ठीक है, पर अभी और सुधार हो सकता है।', [], 'It is fine, but there is room to improve.', []) : _t2('चिंता मत कीजिए। थोड़ा और अभ्यास कीजिए, यह बेहतर होगा।', [], 'Do not worry. A little more practice and it will get better.', []));
      if (weak.length) t += ' ' + _t2('इन पर दोबारा ध्यान दीजिए: {0}।', [weak.join(', ')], 'Please look at these again: {0}.', [weak.join(', ')]);
      return t;
    },
    session(task) {
      const n = tName(), s = task.study || {}, nm = task.title.replace(/^📚\s*/, '');
      const how = s.kind === 'read' ? _t2('पहले इसे ध्यान से पढ़िए।', [], 'Read it carefully first.', []) : s.kind === 'revise' ? _t2('इसे दोबारा दोहराइए, और जो समझ न आए उसे नोट कीजिए।', [], 'Revise it again, and note what you do not understand.', []) : s.kind === 'cards' ? _t2('आज flashcards से दोहराइए।', [], 'Revise with flashcards today.', []) : s.kind === 'mock' ? _t2('आज एक पूरा mock test दीजिए।', [], 'Take a full mock test today.', []) : _t2('अब कुछ सवाल हल कीजिए।', [], 'Now solve a few questions.', []);
      return _t2('{0}, पढ़ाई का समय हो गया है। {1}। {2} {3} मिनट पूरी एकाग्रता से कीजिए।', [n, nm, how, s.min || 30], '{0}, it is study time. {1}. {2} Give it {3} minutes with full focus.', [n, nm, how, s.min || 30]);
    }
  };
  window.studyReminder = (t, kind, mins) => {
    const n = tName(), nm = t.title.replace(/^📚\s*/, '');
    if (kind === 'pre') return _t2('{0}, {1} मिनट बाद पढ़ाई का समय है: {2}। पानी पी लीजिए और तैयार हो जाइए।', [n, mins, nm], '{0}, in {1} minutes it is study time: {2}. Have some water and get ready.', [n, mins, nm]);
    return T.session(t);
  };

  /* ---------------- tiny visual effects ---------------- */
  function mountFX() {
    if (el('sFx')) return;
    const fx = document.createElement('div'); fx.id = 'sFx'; fx.className = 's-fx'; fx.setAttribute('aria-hidden', 'true');
    for (let i = 0; i < 16; i++) { const s = document.createElement('i'); s.style.cssText = `left:${Math.round(Math.random() * 100)}%;animation-duration:${14 + Math.random() * 16}s;animation-delay:${-Math.random() * 20}s;width:${3 + Math.random() * 5}px;height:${3 + Math.random() * 5}px;opacity:${0.25 + Math.random() * 0.4}`; if (i % 3 === 0) s.className = 'gold'; fx.appendChild(s); }
    document.body.appendChild(fx);
  }
  function confetti(n) {
    if (matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    const cv = document.createElement('canvas'); cv.className = 's-confetti'; cv.width = innerWidth; cv.height = innerHeight; document.body.appendChild(cv);
    const x = cv.getContext('2d'), cols = ['#ffd166', '#3da9ff', '#4ee1c1', '#ff7ab6', '#ffffff'];
    const ps = Array.from({ length: n || 120 }, () => ({ x: cv.width / 2, y: cv.height * 0.55, vx: (Math.random() - 0.5) * 14, vy: -Math.random() * 15 - 4, r: 3 + Math.random() * 5, c: cols[Math.floor(Math.random() * cols.length)], a: 1, rot: Math.random() * 6 }));
    let f = 0;
    (function step() { x.clearRect(0, 0, cv.width, cv.height); ps.forEach(p => { p.vy += 0.38; p.x += p.vx; p.y += p.vy; p.rot += 0.2; p.a -= 0.008; x.globalAlpha = Math.max(0, p.a); x.fillStyle = p.c; x.save(); x.translate(p.x, p.y); x.rotate(p.rot); x.fillRect(-p.r, -p.r / 2, p.r * 2, p.r); x.restore(); }); if (++f < 150) requestAnimationFrame(step); else cv.remove(); })();
  }
  function countUp(node, to, ms, dec) {
    if (!node) return; const t0 = performance.now(), d = dec || 0;
    (function f(t) { const k = Math.min(1, (t - t0) / (ms || 900)), v = to * (1 - Math.pow(1 - k, 3)); node.textContent = d ? v.toFixed(d) : Math.round(v); if (k < 1) requestAnimationFrame(f); else node.textContent = d ? (+to).toFixed(d) : to; })(t0);
  }
  const ring = (frac, size, label, sub) => { const r = 34, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, frac || 0)); return `<div class="s-ring" style="width:${size || 92}px;height:${size || 92}px"><svg viewBox="0 0 80 80"><circle class="rt" cx="40" cy="40" r="${r}"/><circle class="rf" cx="40" cy="40" r="${r}" stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${c.toFixed(1)}" data-to="${(c * (1 - f)).toFixed(1)}"/></svg><b>${label}</b>${sub ? `<small>${sub}</small>` : ''}</div>`; };
  function animateRings(root) { requestAnimationFrame(() => requestAnimationFrame(() => (root || document).querySelectorAll('.s-ring .rf[data-to]').forEach(c => { c.style.strokeDashoffset = c.dataset.to; }))); }
  const bar = (frac, cls) => `<div class="s-bar ${cls || ''}"><i style="width:${Math.round(Math.max(0, Math.min(1, frac || 0)) * 100)}%"></i></div>`;
  const badge = lv => `<span class="s-badge ${lv}">${esc(LV()[lv])}</span>`;
  const examLeft = co => { if (!co.exam) return ''; const d = Math.ceil((co.exam - Date.now()) / DAYMS); return d < 0 ? '' : d === 0 ? _t('⏳ परीक्षा आज') : _t('⏳ परीक्षा में {0} दिन', [d]); };
  const KIND = () => ({ read: _t('पढ़ना'), revise: _t('दोहराना'), cards: _t('Flashcards'), quiz: _t('Quiz'), mock: _t('Mock test') });
  const KICON = { read: '📖', revise: '🔁', cards: '🃏', quiz: '📝', mock: '🧪' };

  /* ---------------- account type (Student / Business) ---------------- */
  function buildNav() {
    const nav = document.querySelector('nav'); if (!nav) return;
    const items = isKid() && window.PiyuKids ? PiyuKids.navItems() : isStu() ? [['shome', '🎓', _t('पढ़ाई')], ['courses', '📚', _t('कोर्स')], ['quiz', '📝', _t('Quiz')], ['cards', '🃏', _t('Cards')], ['plan', '🗓', _t('प्लान')], ['chat', '💬', _t('Teacher')]]
      : [['home', '🏠', 'Home'], ['tasks', '✅', _t('काम')], ['docs', '📄', 'Docs'], ['chat', '💬', 'Piyu'], ['prog', '📊', _t('प्रगति')], ['set', '⚙️', 'Settings']];
    const cur = (document.querySelector('.tab.active') || {}).id; const act = cur ? cur.replace('tab-', '') : '';
    nav.innerHTML = items.map(([id, ic, tx]) => `<button data-tab="${id}" class="${id === act ? 'on' : ''}"><i>${ic}</i>${esc(tx)}</button>`).join('');
    if (typeof goldPlace === 'function') setTimeout(goldPlace, 30);
  }
  function applyMode() {
    const was = document.body.dataset.mode, m = S.settings.mode === 'student' ? 'student' : S.settings.mode === 'kids' && window.PiyuKids ? 'kids' : 'business';
    document.body.dataset.mode = m; ensure();
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = m === 'student' ? '#06112b' : m === 'kids' ? '#2a1458' : '#0b0a1a';
    const wasStu = (document.querySelector('.tab.active') || {}).id; buildNav();
    const b = el('modeBadge'); if (b) { b.textContent = m === 'student' ? '🎓 ' + _t('Student') : m === 'kids' ? '👶 ' + _t('Kids') : ''; b.hidden = m === 'business'; }
    const g = el('gearBtn'); if (g) g.hidden = m !== 'student';
    if (m === 'student') mountFX();
    if (m !== 'kids' && window.PiyuKids && was === 'kids') PiyuKids.leave();
    const inStuTab = /^tab-(shome|courses|quiz|cards|plan)$/.test(wasStu || ''), inBizTab = /^tab-(home|tasks|docs|prog|set)$/.test(wasStu || ''), inKidTab = /^tab-(khome|klearn|kplay|kstory|kstars)$/.test(wasStu || '');
    if (m === 'kids') { PiyuKids.enter(); if (!inKidTab) goTab('khome'); else goTab(wasStu.replace('tab-', '')); }
    else if (m === 'student' && (!wasStu || inBizTab && wasStu !== 'tab-set' || inKidTab)) goTab('shome'); else if (m === 'business' && (!wasStu || inStuTab || inKidTab)) goTab('home'); else goTab((wasStu || 'tab-home').replace('tab-', ''));
    refreshModeUI();
  }
  function chooseMode(m) {
    S.settings.mode = m; if (m === 'student' && !S.settings.sname) S.settings.sname = ''; save();
    refreshModeUI();
  }
  function refreshModeUI() {
    const m = S.settings.mode;
    document.querySelectorAll('.modeCard').forEach(c => c.classList.toggle('on', c.dataset.mode === m));
    const nb = el('modeName'); if (nb) { nb.hidden = m !== 'student'; if (document.activeElement !== nb) nb.value = S.settings.sname || ''; }
    const sc = el('setModeCard'); if (sc) sc.querySelectorAll('[data-mode]').forEach(b => b.classList.toggle('on', b.dataset.mode === m));
    const sn = el('setSName'); if (sn && document.activeElement !== sn) sn.value = S.settings.sname || '';
  }
  /* the start button asks for a type first (tests set window.__PIYU_TEST_MODE) */
  function ensureMode() {
    if (S.settings.mode) return true;
    if (window.__PIYU_TEST_MODE) { if (window.__PIYU_TEST_MODE === 'student') S.settings.mode = 'student'; else if (window.__PIYU_TEST_MODE === 'kids') S.settings.mode = 'kids'; return true; }      // tests only (Business = nothing stored, as before)
    const b = el('modeBox'); if (b) { b.classList.remove('shake'); void b.offsetWidth; b.classList.add('shake'); }
    toast(_t('पहले चुनिए: Student, Business या Kids')); return false;
  }
  /* the chooser on the start screen is shown until one type has been picked */
  function loginUI() {
    const box = el('modeBox'); if (!box) return;
    const kidReady = S.settings.mode === 'kids' && window.PiyuKids && PiyuKids.K().ready, sw = el('kParentSwitch');
    box.hidden = (!!S.settings.mode && el('app') && !el('app').hidden) || (kidReady && !window.__kidsChooser); refreshModeUI();
    if (sw) { sw.hidden = !kidReady || !!window.__kidsChooser; const t = sw.querySelector('.kps-name'); if (t && kidReady) t.textContent = '👶 ' + (PiyuKids.K().name || ''); }
    document.body.dataset.mode = S.settings.mode === 'student' ? 'student' : (S.settings.mode === 'kids' && window.PiyuKids ? 'kids' : 'business');
    if (S.settings.mode === 'student') mountFX();
  }

  /* ---------------- the teacher remembers: profile, what is studied, what is left ---------------- */
  const chStatus = (co, ch) => ch.studied ? 'done' : ((ch.mins || 0) > 0 || S.attempts.some(a => a.course === co.id && (a.items || []).some(i => i.ch === ch.id))) ? 'going' : 'todo';
  function progressOf(co) {
    const chs = co.chapters || [], done = chs.filter(c => chStatus(co, c) === 'done'), going = chs.filter(c => chStatus(co, c) === 'going'), todo = chs.filter(c => chStatus(co, c) === 'todo');
    return { total: chs.length, done, going, todo, frac: chs.length ? (done.length + going.length * 0.4) / chs.length : 0, mins: chs.reduce((a, c) => a + (c.mins || 0), 0) };
  }
  /* a plain-text memory of the student, also sent with AI questions so answers fit this student */
  function studentMemory() {
    const s = S.settings, st = stats(), parts = [];
    if (s.sname) parts.push('Student name: ' + s.sname + (s.sclass ? ', class/course: ' + s.sclass : '') + (s.sboard ? ', board/school: ' + s.sboard : '') + (s.sgoalText ? ', goal: ' + s.sgoalText : '') + '.');
    S.courses.forEach(co => {
      const p = progressOf(co); parts.push(co.name + ': ' + p.done.length + '/' + p.total + ' chapters studied' + (p.todo.length ? '; not started: ' + p.todo.slice(0, 4).map(c => c.title).join(', ') : '') + (co.exam ? '; exam ' + new Date(co.exam).toDateString() : '') + '.');
    });
    const weak = st.filter(x => x.level === 'weak').slice(0, 4).map(x => x.title + (x.miss.length ? ' (' + x.miss.slice(0, 3).join('/') + ')' : ''));
    if (weak.length) parts.push('Weak topics: ' + weak.join('; ') + '.');
    const sk = streakDays(); if (sk) parts.push('Study streak: ' + sk + ' days.');
    return parts.join(' ').slice(0, 780);
  }
  window.studentMemory = () => isStu() ? studentMemory() : '';
  function remainingLine() {
    if (!S.courses.length) return '';
    const o = S.courses.map(co => { const p = progressOf(co); return _t2('{0}: {1} में से {2} chapter पढ़े, {3} बाकी', [co.name, p.total, p.done.length, p.total - p.done.length], '{0}: {2} of {1} chapters studied, {3} left', [co.name, p.total, p.done.length, p.total - p.done.length]); });
    return o.join(' · ');
  }

  /* ---------------- self-learning: the plan and the quizzes adapt to this student ---------------- */
  const L = () => { const s = S.settings; if (!s.slearn) s.slearn = { hrs: {}, types: {}, n: 0 }; return s.slearn; };
  function learnFromSessions() {
    const l = L(), now = Date.now(); let ch = false;
    S.tasks.forEach(t => {
      if (!t.study || t.slrn || t.alarmAt > now - 2 * 3600e3) return;
      const h = new Date(t.alarmAt).getHours(), e = l.hrs[h] || (l.hrs[h] = [0, 0]);
      if (t.done) e[0]++; else e[1]++;
      l.n = (l.n || 0) + 1; t.slrn = 1; ch = true;
    });
    if (ch) save();
  }
  function learnFromAnswers(items) {
    const l = L(); items.forEach(it => { const e = l.types[it.type] || (l.types[it.type] = [0, 0]); e[0] += it.got; e[1] += it.marks; });
  }
  /* what Piyu has worked out about the student (shown to them, and used to shape the plan) */
  function insights() {
    const l = L(), out = [], hrs = Object.entries(l.hrs).map(([h, [d, m]]) => ({ h: +h, d, m, n: d + m })).filter(x => x.n >= 1);
    const tot = hrs.reduce((a, x) => a + x.n, 0);
    let best = null;
    if (tot >= 6) { const band = hrs.filter(x => x.n >= 2).map(x => ({ h: x.h, r: x.d / x.n, n: x.n })).sort((a, b) => b.r - a.r || b.n - a.n)[0]; if (band && band.r >= 0.6) best = band.h; }
    const done = hrs.reduce((a, x) => a + x.d, 0), rate = tot ? done / tot : null;
    const ty = Object.entries(l.types).filter(([, v]) => v[1] >= 4).map(([k, v]) => ({ k, r: v[0] / v[1] })).sort((a, b) => a.r - b.r);
    const TN = { mcq: _t('1 अंक वाले (objective)'), short: _t('2 अंक वाले'), medium: _t('5 अंक वाले'), long: _t('10 अंक वाले') };
    if (best != null) out.push(_t('🕐 आप {0} बजे के आसपास के session सबसे ज़्यादा पूरे करते हैं — plan उसी समय के पास रखूँगी।', [best]));
    if (rate != null && tot >= 6) out.push(rate >= 0.8 ? _t('✅ आप ज़्यादातर sessions पूरे करते हैं — धीरे-धीरे समय बढ़ा रही हूँ।') : rate < 0.4 ? _t('⚠ कई sessions छूट रहे हैं — मैं sessions छोटे और हल्के रख रही हूँ।') : _t('🙂 आप आधे से ज़्यादा sessions पूरे कर रहे हैं।'));
    if (ty.length) out.push(_t('🎯 सबसे कमज़ोर: {0}। इन पर ज़्यादा अभ्यास कराऊँगी।', [TN[ty[0].k] || ty[0].k]));
    const mist = S.cards.filter(c => c.kind === 'mistake').length; if (mist) out.push(_t('🧠 आपकी {0} गलतियों को मैंने flashcards बना दिया है, ताकि वे दोबारा न हों।', [mist]));
    return { lines: out, best, rate, weakType: ty.length && ty[0].r < 0.7 ? ty[0].k : null };
  }
  /* the user's plan settings, adjusted by what was learnt (only in auto mode) */
  function effectiveCfg() {
    const cfg = Object.assign({}, S.settings.splan); if (!S.settings.sauto) return cfg;
    const ins = insights(), win = SY.words ? 0 : 0, f = (s => +s.split(':')[0] * 60 + +s.split(':')[1])(cfg.from), t = (s => +s.split(':')[0] * 60 + +s.split(':')[1])(cfg.to), span = Math.max(60, t - f);
    if (ins.best != null && ins.best * 60 >= 0 && Math.abs(ins.best * 60 - f) >= 60) { const nf = Math.max(0, Math.min(24 * 60 - span, ins.best * 60 - 30)); cfg.from = pad2(Math.floor(nf / 60)) + ':' + pad2(nf % 60); const nt = nf + span; cfg.to = pad2(Math.floor(Math.min(nt, 1439) / 60)) + ':' + pad2(Math.min(nt, 1439) % 60); }
    if (ins.rate != null && L().n >= 6) cfg.session = Math.max(20, Math.min(60, cfg.session + (ins.rate >= 0.8 ? 5 : ins.rate < 0.4 ? -5 : 0)));
    return cfg;
  }

  /* ---------------- courses ---------------- */
  const FILE_ACCEPT = '.pdf,.docx,.doc,.pptx,.ppt,.txt,.md,.csv,.html,.htm,.rtf,.png,.jpg,.jpeg,.webp,.bmp,image/*';
  let courseOpen = null, courseEdit = null;
  function addChaptersFromDoc(co, doc) {
    const chs = SY.chaptersFromBlocks(doc.blocks), old = new Map((co.chapters || []).filter(c => c.docId === doc.id).map(c => [c.title, c]));
    co.chapters = (co.chapters || []).filter(c => c.docId !== doc.id);
    chs.forEach(c => { const o = old.get(c.title) || {}; co.chapters.push(Object.assign({}, o, { id: doc.id.slice(0, 4) + '.' + c.id, title: c.title, docId: doc.id, from: c.from, to: c.to, chars: c.chars })); });
    co.updatedAt = Date.now();
  }
  async function importFiles(co, files, onMsg) {
    let added = 0;
    for (const f of files) {
      if (f.size > PiyuMedia.MAX_UPLOAD) throw new Error(_t("{0} बहुत बड़ी है (अधिकतम 100 MB)", [f.name]));
      onMsg(_t("⏳ {0} पढ़ रही हूँ…", [f.name]));
      let src = f; if (/^image\//.test(f.type) && f.size > 1024 * 1024) { try { const r = await PiyuMedia.optimizeImage(f); if (r.changed) src = r.blob; } catch (e) { } }
      const blocks = await C.fileToBlocks(src, { langs: S.settings.ocrLang, onProgress: (st, fr, p, n) => onMsg('🔍 ' + f.name + ' — OCR' + (n > 1 ? ' ' + p + '/' + n : '') + ' ' + Math.round((fr || 0) * 100) + '%') });
      if (!blocks.length) throw new Error(f.name + ': ' + _t("Document खाली है या पढ़ा नहीं जा सका।"));
      S.docs = S.docs.filter(d => !(d.name === f.name && (co.docIds || []).includes(d.id)));
      const doc = { id: uid(), name: f.name, added: Date.now(), blocks: blocks.map(b => ({ k: b.k, t: b.t })), rules: [] };
      S.docs.push(doc); co.docIds = (co.docIds || []).filter(id => docById(id)).concat(doc.id);
      addChaptersFromDoc(co, doc); added++;
    }
    return added;
  }
  function genCardsFor(co) {
    const fresh = SY.makeCards(co.id, chapterTexts(co), { max: 160 }), have = new Set(S.cards.map(c => c.id)); let n = 0;
    fresh.forEach(c => { if (!have.has(c.id)) { S.cards.push(c); n++; } });
    return n;
  }
  function openCourseDlg(coId) {
    courseEdit = coId ? courseById(coId) : null;
    let dlg = el('courseDlg');
    if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog id="courseDlg" class="s-dlg"></dialog>'); dlg = el('courseDlg'); }
    const co = courseEdit || {}, free = S.docs.filter(d => !S.courses.some(c => (c.docIds || []).includes(d.id)));
    dlg.innerHTML = `<h3>${courseEdit ? '✏ ' + esc(_t('Course बदलें')) : '➕ ' + esc(_t('नया course'))}</h3>
      <label>${esc(_t('Course / Subject का नाम'))}<input id="cName" value="${esc(co.name || '')}" placeholder="${esc(_t('जैसे: Biology, Class 10 Maths'))}"></label>
      <label>${esc(_t('परीक्षा की तारीख (ज़रूरी नहीं)'))}<input id="cExam" type="date" value="${co.exam ? dkey(co.exam) : ''}"></label>
      ${featOn('docs') ? `<label>${esc(_t('Notes / book / PDF / photo जोड़ें'))}<input id="cFiles" type="file" accept="${FILE_ACCEPT}" multiple></label>` : `<p class="hint">${esc(_t('Admin ने documents upload बंद किया है'))}</p><input id="cFiles" type="file" hidden>`}
      ${free.length ? `<div class="hint">${esc(_t('या पहले से जुड़े documents चुनें:'))}</div>` + free.map(d => `<label class="chk"><input type="checkbox" class="cDoc" value="${esc(d.id)}"> ${esc(d.name)}</label>`).join('') : ''}
      <div class="hint" id="cMsg" role="status"></div>
      <div class="btns"><button class="btn ghost" id="cCancel" type="button">${esc(_t('रद्द करें'))}</button><button class="btn primary" id="cSave" type="button">${esc(_t('सहेजें'))}</button></div>`;
    el('cCancel').onclick = () => dlg.close();
    el('cSave').onclick = async () => {
      const name = el('cName').value.trim(), msg = el('cMsg'); if (!name) { msg.textContent = '⚠ ' + _t('नाम लिखिए'); return; }
      const btn = el('cSave'); btn.disabled = true;
      try {
        let co2 = courseEdit; if (!co2) { co2 = { id: uid(), name, subject: name, docIds: [], chapters: [], createdAt: Date.now() }; S.courses.push(co2); }
        co2.name = name; co2.subject = name; const ex = el('cExam').value; co2.exam = ex ? new Date(ex + 'T09:00:00').getTime() : null; co2.updatedAt = Date.now();
        let added = 0;
        const picked = [...dlg.querySelectorAll('.cDoc:checked')].map(x => x.value);
        picked.forEach(id => { const d = docById(id); if (d) { co2.docIds = (co2.docIds || []).concat(id); addChaptersFromDoc(co2, d); added++; } });
        const files = [...el('cFiles').files]; if (files.length) added += await importFiles(co2, files, m => { msg.textContent = m; });
        const nc = genCardsFor(co2); save(); dlg.close(); renderCourses(); refreshAll();
        if (added) { const n = (co2.chapters || []).length; toastS(_t('✅ {0}: {1} chapters और {2} नए flashcards बने', [name, n, nc])); teach(_t2('{0}, मैंने {1} में {2} chapters बनाए और {3} flashcards तैयार किए। अब आप quiz दे सकते हैं।', [tName(), name, n, nc], '{0}, I made {2} chapters in {1} and {3} flashcards. You can take a quiz now.', [tName(), name, n, nc])); if (S.settings.sauto) makePlan(true); }
      } catch (e) { msg.textContent = '✖ ' + (e && e.message || e); }
      btn.disabled = false;
    };
    dlg.showModal();
  }
  function courseCard(co) {
    const st = stats().filter(x => x.course === co.id), p = progressOf(co), open = courseOpen === co.id;
    const avg = st.filter(x => x.acc != null); const acc = avg.length ? avg.reduce((a, x) => a + x.acc, 0) / avg.length : null;
    const cardsN = S.cards.filter(c => c.courseId === co.id).length, dueN = S.cards.filter(c => c.courseId === co.id && c.due <= Date.now() && (c.reps > 0 || c.lapses > 0)).length;
    let h = `<div class="s-card s-course ${open ? 'open' : ''}" data-co="${esc(co.id)}"><div class="s-crow" data-act="toggleCo">
      ${ring(p.frac, 64, Math.round(p.frac * 100) + '%')}
      <div class="s-cmeta"><b>${esc(co.name)}</b><small>${esc(_t('{0}/{1} chapters पढ़े', [p.done.length, p.total]))} · ${cardsN} 🃏${dueN ? ' · ' + esc(_t('{0} दोहराने हैं', [dueN])) : ''}</small>
      <small>${acc != null ? esc(_t('Quiz औसत')) + ' ' + pct(acc) + ' ' + badge(SY.level(acc)) : esc(_t('अभी quiz नहीं दिया'))} ${co.exam ? ' · ' + esc(examLeft(co)) : ''}</small></div><span class="s-chev">›</span></div>`;
    if (open) {
      h += `<div class="s-chlist">` + ((co.chapters || []).length ? (co.chapters || []).map(ch => {
        const s = st.find(x => x.ch === ch.id) || {}, stt = chStatus(co, ch);
        return `<div class="s-ch" data-ch="${esc(ch.id)}"><div class="s-chn"><span class="s-dot ${stt}">${stt === 'done' ? '✓' : stt === 'going' ? '•' : ''}</span><b>${esc(ch.title)}</b></div>
          <div class="s-chm"><small>${s.acc != null ? esc(_t('स्कोर')) + ' ' + pct(s.acc) + ' ' : ''}${badge(s.level || 'new')}${ch.mins ? ' · ' + esc(_t('{0} मिनट पढ़ा', [Math.round(ch.mins)])) : ''}${ch.studied ? ' · ' + esc(_t('पूरा किया')) : ''}</small></div>
          <div class="s-acts"><button class="s-btn sm" data-act="read">📖 ${esc(_t('पढ़ें'))}</button><button class="s-btn sm" data-act="quizch">📝 ${esc(_t('Quiz'))}</button><button class="s-btn sm" data-act="cardch">🃏</button></div></div>`;
      }).join('') : `<div class="empty">${esc(_t('इस course में अभी कोई chapter नहीं। नीचे से notes जोड़िए।'))}</div>`) + `</div>
        <div class="s-acts wrap"><button class="s-btn sm" data-act="addfiles">➕ ${esc(_t('और files'))}</button><button class="s-btn sm ghost" data-act="editco">✏ ${esc(_t('बदलें'))}</button><button class="s-btn sm ghost danger" data-act="delco">🗑 ${esc(_t('हटाएँ'))}</button></div>`;
    }
    return h + '</div>';
  }
  function renderCourses() {
    const box = el('sCourses'); if (!box) return; ensure();
    box.innerHTML = `<div class="s-wrap"><div class="s-title"><h2>📚 ${esc(_t('मेरे courses'))}</h2><button class="s-btn gold" data-act="newco">➕ ${esc(_t('नया course'))}</button></div>
      <p class="hint">${esc(_t('अपनी किताब, notes या PDF दीजिए — मैं chapters, सवाल और flashcards खुद बना दूँगी।'))}</p>
      ${S.courses.length ? S.courses.map(courseCard).join('') : `<div class="s-empty"><div class="s-big">📚</div><b>${esc(_t('अभी कोई course नहीं'))}</b><p>${esc(_t('PDF, Word, PPT या notes की photo — सब चलेगा। पहला course जोड़िए।'))}</p><button class="s-btn gold xl" data-act="newco">➕ ${esc(_t('पहला course जोड़ें'))}</button></div>`}</div>`;
    animateRings(box);
  }
  /* ---------------- reader: read the chapter (teacher can read it aloud) ---------------- */
  let reader = null;
  function openReader(coId, chId) {
    const co = courseById(coId); if (!co) return; const ch = (co.chapters || []).find(c => c.id === chId); if (!ch) return;
    const d = docById(ch.docId); if (!d) { toastS(_t('इस chapter का document हटा दिया गया है')); return; }
    const blocks = d.blocks.slice(ch.from, ch.to), t0 = Date.now();
    reader = { co, ch, t0, reading: false };
    ov(`<div class="s-ovh"><button class="s-x" data-act="closeov">✕</button><div><small>${esc(co.name)}</small><b>${esc(ch.title)}</b></div></div>
      <div class="s-acts wrap"><button class="s-btn" data-act="rd-play">🔊 ${esc(_t('Teacher से सुनें'))}</button><button class="s-btn ghost" data-act="rd-stop">⏹</button><button class="s-btn ghost" data-act="rd-explain">💡 ${esc(_t('आसान में समझाओ'))}</button></div>
      <article class="s-read" id="rdBody">${blocks.map((b, i) => b.k === 'h' ? `<h3 data-i="${i}">${esc(b.t)}</h3>` : `<p data-i="${i}">${esc(b.t)}</p>`).join('')}</article>
      <div class="s-acts wrap"><button class="s-btn gold" data-act="rd-done">✅ ${esc(_t('यह chapter पूरा हुआ'))}</button><button class="s-btn" data-act="rd-quiz">📝 ${esc(_t('इस पर Quiz दें'))}</button><button class="s-btn" data-act="rd-cards">🃏 ${esc(_t('Flashcards'))}</button></div>`);
  }
  function closeReader(mark) {
    if (!reader) return; const mins = (Date.now() - reader.t0) / 60000;
    if (mins >= 0.4) { reader.ch.mins = (reader.ch.mins || 0) + Math.min(mins, 90); reader.co.updatedAt = Date.now(); logToday({ min: Math.min(mins, 90) }); save(); }
    reader = null; stopSpeaking();
  }
  async function readAloud() {
    if (!reader) return; const rd = reader; rd.reading = true; stopSpeaking();
    const ps = [...document.querySelectorAll('#rdBody [data-i]')];
    for (const p of ps) {
      if (!reader || reader !== rd || !rd.reading) return;
      document.querySelectorAll('#rdBody .on').forEach(x => x.classList.remove('on')); p.classList.add('on'); p.scrollIntoView({ block: 'center', behavior: 'smooth' });
      say(p.textContent, { interrupt: false, mood: 'gentle' }); await waitSpeech(60000);
    }
    document.querySelectorAll('#rdBody .on').forEach(x => x.classList.remove('on'));
  }
  function explainSimply() {
    if (!reader) return; const d = docById(reader.ch.docId), text = SY.chapterText(d.blocks, reader.ch), pts = SY.pickKeySentences(text, 4);
    const box = el('rdExplain') || (() => { const x = document.createElement('div'); x.id = 'rdExplain'; x.className = 's-card s-explain'; el('rdBody').before(x); return x; })();
    box.innerHTML = `<b>💡 ${esc(_t('सार (मुख्य बातें)'))}</b><ol>${pts.map(p => `<li>${esc(p)}</li>`).join('')}</ol>`; box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    teach(_t2('{0}, इसे ऐसे समझिए। ', [tName()], '{0}, understand it like this. ', [tName()]) + pts.join(' '), { interrupt: true });
  }
  /* ---------------- overlay (reader / quiz / cards share one full-screen layer) ---------------- */
  function ov(html, name) {
    window.__ovTab = name || 'reader';
    let o = el('sOv'); if (!o) { document.body.insertAdjacentHTML('beforeend', '<div id="sOv" class="s-ov" hidden></div>'); o = el('sOv'); }
    o.innerHTML = '<div class="s-ovin">' + html + '</div>'; o.hidden = false; document.body.classList.add('ov-open'); o.scrollTop = 0; return o;
  }
  function closeOv() { window.__ovTab = ''; const o = el('sOv'); if (o) { o.hidden = true; o.innerHTML = ''; } document.body.classList.remove('ov-open'); stopSpeaking(); clearInterval(quiz && quiz.timer); }

  /* ---------------- sign-up: the student's full details (animated step by step) ---------------- */
  const WIZ_STEPS = 5;
  let wiz = null;
  function openSignup(edit) {
    ensure(); const s = S.settings, p = s.splan;
    wiz = { step: 0, edit: !!edit, d: { sname: s.sname || '', sage: s.sage || '', sphone: s.sphone || '', sclass: s.sclass || '', sboard: s.sboard || '', sschool: s.sschool || '', smedium: s.smedium || 'hinglish', sgoalText: s.sgoalText || '', ssubjects: s.ssubjects || '', sweakest: s.sweakest || '', sgoal: s.sgoal || 60, from: p.from, to: p.to, session: p.session, days: p.days.slice(), sauto: s.sauto !== false } };
    let dlg = el('signupDlg'); if (!dlg) { document.body.insertAdjacentHTML('beforeend', '<dialog id="signupDlg" class="s-dlg wiz"></dialog>'); dlg = el('signupDlg'); dlg.addEventListener('cancel', e => e.preventDefault()); }
    drawWiz(); if (!dlg.open) dlg.showModal();
  }
  function wizField(id, label, val, type, ph, extra) { return `<label class="wf">${esc(label)}<input id="${id}" type="${type || 'text'}" value="${esc(val == null ? '' : val)}" placeholder="${esc(ph || '')}" ${extra || ''}></label>`; }
  function drawWiz() {
    const dlg = el('signupDlg'), d = wiz.d, n = wiz.step; let body = '', title = '';
    if (n === 0) { title = '👋 ' + _t('आपके बारे में'); body = wizField('w_name', _t('आपका नाम *'), d.sname, 'text', _t('जैसे: Rahul Sharma')) + wizField('w_age', _t('उम्र'), d.sage, 'number', '16', 'min="5" max="80"') + wizField('w_phone', _t('Mobile number (ज़रूरी नहीं)'), d.sphone, 'tel', '98765 43210'); }
    else if (n === 1) { title = '🏫 ' + _t('आपकी पढ़ाई'); body = wizField('w_class', _t('Class / Course *'), d.sclass, 'text', _t('जैसे: Class 10, B.Sc. 1st year, UPSC')) + wizField('w_board', _t('Board / University'), d.sboard, 'text', 'CBSE, UP Board, BHU…') + wizField('w_school', _t('School / College'), d.sschool, 'text', '') + `<label class="wf">${esc(_t('पढ़ाई का माध्यम'))}<select id="w_medium"><option value="hindi" ${d.smedium === 'hindi' ? 'selected' : ''}>${esc(_t('हिन्दी'))}</option><option value="english" ${d.smedium === 'english' ? 'selected' : ''}>English</option><option value="hinglish" ${d.smedium === 'hinglish' ? 'selected' : ''}>Hinglish</option></select></label>`; }
    else if (n === 2) { title = '🎯 ' + _t('लक्ष्य और subjects'); body = wizField('w_goal', _t('आपका लक्ष्य'), d.sgoalText, 'text', _t('जैसे: Board exam 2027, NEET, 90% लाना')) + wizField('w_subs', _t('Subjects (comma से अलग करें)'), d.ssubjects, 'text', 'Maths, Science, English') + wizField('w_weak', _t('सबसे कमज़ोर subject कौन सा है?'), d.sweakest, 'text', ''); }
    else if (n === 3) { title = '⏰ ' + _t('पढ़ने का समय'); body = `<div class="wrow">${wizField('w_from', _t('शुरू'), d.from, 'time')}${wizField('w_to', _t('खत्म'), d.to, 'time')}</div>` + `<label class="wf">${esc(_t('रोज़ का लक्ष्य (मिनट)'))}<select id="w_gmin">${[30, 60, 90, 120, 180, 240].map(v => `<option ${+d.sgoal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` + `<label class="wf">${esc(_t('एक session कितने मिनट का'))}<select id="w_sess">${[20, 25, 30, 40, 45, 60].map(v => `<option ${+d.session === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label>` + `<div class="wf">${esc(_t('किन दिनों पढ़ेंगे'))}<div class="s-chips" id="w_days">${WD().map((w, i) => `<button type="button" class="s-chip ${d.days.includes(i) ? 'on' : ''}" data-d="${i}">${esc(w)}</button>`).join('')}</div></div>`; }
    else { title = '🎓 ' + _t('तैयार!'); body = `<div class="wf"><p class="hint">${esc(_t('मैं आपकी Teacher हूँ। मैं आपका नाम, class, लक्ष्य, क्या पढ़ा और क्या बाकी है — सब याद रखूँगी, और आपकी आदतों से सीखकर plan और सवाल बेहतर करती रहूँगी।'))}</p></div>
      <label class="chk"><input type="checkbox" id="w_auto" ${d.sauto ? 'checked' : ''}> ${esc(_t('Auto mode: plan, alarm और quiz मैं खुद बनाऊँ'))}</label>
      <p class="hint">🔒 ${esc(_t('Admin आपका नाम, देश और app का समय देख सकता है; आपके documents और जवाब सिर्फ़ आपके हैं।'))}</p>
      <div class="s-sum"><b>${esc(d.sname || '—')}</b> · ${esc(d.sclass || '—')}${d.sboard ? ' · ' + esc(d.sboard) : ''}<br><small>${esc(d.sgoalText || '')}</small><br><small>⏰ ${esc(d.from)}–${esc(d.to)} · ${esc(String(d.sgoal))} ${esc(_t('मिनट रोज़'))}</small></div>
      <button class="s-btn" type="button" id="w_hear">🔊 ${esc(_t('Teacher की आवाज़ सुनें'))}</button>`; }
    dlg.innerHTML = `<div class="wiz-top"><div class="s-line"><i style="width:${Math.round((n + 1) / WIZ_STEPS * 100)}%"></i></div><small>${esc(_t('चरण {0} / {1}', [n + 1, WIZ_STEPS]))}</small></div>
      <h3 class="wiz-h">${title}</h3><div class="wiz-body" key="${n}">${body}</div><div class="hint" id="wMsg" role="status"></div>
      <div class="btns">${n ? `<button class="btn ghost" type="button" id="wBack">‹ ${esc(_t('पीछे'))}</button>` : (wiz.edit ? `<button class="btn ghost" type="button" id="wCancel">${esc(_t('रद्द करें'))}</button>` : '<span></span>')}<button class="btn primary" type="button" id="wNext">${n === WIZ_STEPS - 1 ? '🚀 ' + esc(_t('शुरू करें')) : esc(_t('आगे')) + ' ›'}</button></div>`;
    el('wNext').onclick = wizNext; const b = el('wBack'); if (b) b.onclick = () => { readWiz(); wiz.step--; drawWiz(); }; const c = el('wCancel'); if (c) c.onclick = () => el('signupDlg').close();
    dlg.querySelectorAll('#w_days .s-chip').forEach(x => x.onclick = () => { x.classList.toggle('on'); }); const h = el('w_hear'); if (h) h.onclick = () => { readWiz(); const nm = wiz.d.sname || ''; teach(_t2('नमस्ते {0}। मैं आपकी Teacher हूँ। आज से हम साथ पढ़ेंगे। आप बस अपना course दीजिए, बाकी मैं संभाल लूँगी।', [nm], 'Hello {0}. I am your teacher. From today we study together. Just give me your course and I will take care of the rest.', [nm]), { interrupt: true }); };
    const f = dlg.querySelector('input,select'); if (f && n !== WIZ_STEPS - 1) setTimeout(() => f.focus(), 120);
  }
  function readWiz() {
    const d = wiz.d, v = id => { const x = el(id); return x ? x.value.trim() : null; }, n = wiz.step;
    if (n === 0) { d.sname = v('w_name'); d.sage = v('w_age'); d.sphone = v('w_phone'); }
    else if (n === 1) { d.sclass = v('w_class'); d.sboard = v('w_board'); d.sschool = v('w_school'); d.smedium = v('w_medium'); }
    else if (n === 2) { d.sgoalText = v('w_goal'); d.ssubjects = v('w_subs'); d.sweakest = v('w_weak'); }
    else if (n === 3) { d.from = v('w_from') || d.from; d.to = v('w_to') || d.to; d.sgoal = +v('w_gmin') || 60; d.session = +v('w_sess') || 30; const days = [...document.querySelectorAll('#w_days .s-chip.on')].map(x => +x.dataset.d); d.days = days.length ? days : [0, 1, 2, 3, 4, 5, 6]; }
    else if (n === 4) { const a = el('w_auto'); if (a) d.sauto = a.checked; }
  }
  function wizNext() {
    readWiz(); const d = wiz.d, msg = el('wMsg');
    if (wiz.step === 0 && d.sname.length < 2) { msg.textContent = '⚠ ' + _t('अपना नाम लिखिए'); return; }
    if (wiz.step === 1 && d.sclass.length < 2) { msg.textContent = '⚠ ' + _t('Class / Course लिखिए'); return; }
    if (wiz.step === 3 && d.from >= d.to) { msg.textContent = '⚠ ' + _t('खत्म होने का समय शुरू से बाद का होना चाहिए'); return; }
    if (wiz.step < WIZ_STEPS - 1) { wiz.step++; drawWiz(); return; }
    finishSignup();
  }
  function finishSignup() {
    const d = wiz.d, s = S.settings, first = !s.sdone;
    Object.assign(s, { sname: d.sname, sage: d.sage, sphone: d.sphone, sclass: d.sclass, sboard: d.sboard, sschool: d.sschool, smedium: d.smedium, sgoalText: d.sgoalText, ssubjects: d.ssubjects, sweakest: d.sweakest, sgoal: d.sgoal, sauto: d.sauto, sdone: true });
    s.splan = { from: d.from, to: d.to, session: d.session, brk: 5, days: d.days, horizon: 7 };
    if (first) s.slearnStart = Date.now();
    const subs = [...new Set(d.ssubjects.split(/[,،;\n]+/).map(x => x.trim()).filter(x => x.length >= 2))].slice(0, 12);
    subs.forEach(n => { if (!S.courses.some(c => c.name.toLowerCase() === n.toLowerCase())) S.courses.push({ id: uid(), name: n, subject: n, docIds: [], chapters: [], createdAt: Date.now(), updatedAt: Date.now() }); });
    save(); el('signupDlg').close(); refreshAll(); renderSHome();
    if (first) { goTab('shome'); teach(_t2('नमस्ते {0}! मैं आपकी Teacher हूँ। आपकी सारी जानकारी मैंने याद कर ली है। अब अपना course जोड़िए, फिर हम पढ़ाई शुरू करेंगे।', [d.sname], 'Hello {0}! I am your teacher. I have remembered all your details. Now add your course and we will start studying.', [d.sname]), { interrupt: true }); }
    else toastS(_t('✅ जानकारी सहेज ली गई'));
  }
  /* shown once, right after the first start as a student */
  function onboard() { if (isStu() && !S.settings.sdone && !el('signupDlg')?.open) openSignup(false); }

  /* ---------------- home ---------------- */
  const todaySessions = () => { ensure(); const k = dkey(Date.now()); return S.tasks.filter(t => t.study && dkey(t.alarmAt) === k).sort((a, b) => a.alarmAt - b.alarmAt); };
  function renderSHome() {
    const box = el('sHome'); if (!box) return; ensure();
    const s = S.settings, st = stats(), subj = SY.bySubject(st), now = Date.now(), cs = SY.cardStats(S.cards, now), today = todaySessions();
    const weak = st.filter(x => x.level === 'weak').sort((a, b) => a.acc - b.acc).slice(0, 3), mins = todayMin(), goal = s.sgoal || 60, streak = streakDays(), ins = insights();
    const tested = st.filter(x => x.acc != null), avg = tested.length ? tested.reduce((a, x) => a + x.acc, 0) / tested.length : null;
    const exams = S.courses.filter(c => c.exam && c.exam > now).sort((a, b) => a.exam - b.exam).slice(0, 2);
    const h = new Date().getHours(), hi = (h < 12 ? _t('सुप्रभात') : h < 17 ? _t('नमस्ते') : h < 21 ? _t('शुभ संध्या') : _t('शुभ रात्रि')) + ', ' + esc(s.sname || _t('दोस्त'));
    box.innerHTML = `<div class="s-wrap">
      <div class="s-hero"><div class="s-heroin"><div class="s-orb"><div class="radar" aria-hidden="true"><span class="rg"></span><span class="rg g"></span><span class="rg"></span><span class="sweep"></span><span class="blip b1"></span><span class="blip b2"></span><span class="blip b3"></span></div><i></i><i></i><i></i></div><div class="s-herot"><h2>${hi} 👋</h2>
        <p>${esc(s.sclass || '')}${s.sgoalText ? ' · 🎯 ' + esc(s.sgoalText) : ''}</p><small>${esc(remainingLine())}</small></div></div>
        <div class="s-acts wrap"><button class="s-btn gold" data-act="greet">🔊 ${esc(_t('Teacher से सुनें'))}</button><button class="s-btn ${s.sauto ? 'on' : 'ghost'}" data-act="toggleauto">🤖 ${esc(_t('Auto mode'))}: ${s.sauto ? 'ON' : 'OFF'}</button></div></div>
      <div class="s-stats">
        <div class="s-stat">${ring(mins / goal, 78, mins + '', _t('मिनट'))}<small>${esc(_t('आज का लक्ष्य'))} ${goal}m</small></div>
        <div class="s-stat"><b class="s-num" data-n="${streak}">0</b><span>🔥</span><small>${esc(_t('दिन की streak'))}</small></div>
        <div class="s-stat"><b class="s-num" data-n="${cs.due}">0</b><span>🃏</span><small>${esc(_t('दोहराने को'))}</small></div>
        <div class="s-stat"><b>${pct(avg)}</b><span>📈</span><small>${esc(_t('Quiz औसत'))}</small></div></div>
      ${exams.length ? `<div class="s-card"><div class="s-h">⏳ ${esc(_t('परीक्षा'))}</div>${exams.map(c => `<div class="s-row"><b>${esc(c.name)}</b><span class="s-pill gold">${esc(examLeft(c))}</span></div>`).join('')}</div>` : ''}
      <div class="s-card"><div class="s-h">🗓 ${esc(_t('आज का plan'))}</div>${today.length ? today.map(t => { const k = (t.study || {}).kind || 'read'; return `<div class="s-row ${t.done ? 'done' : ''}" data-task="${esc(t.id)}"><span class="s-time">${fmtT(t.alarmAt)}</span><span class="s-ti">${KICON[k] || '📖'} ${esc(t.title.replace(/^📚\s*/, ''))}</span>${t.done ? '<span class="s-pill ok">✓</span>' : `<button class="s-btn sm" data-act="startsess">▶ ${esc(_t('शुरू'))}</button>`}</div>`; }).join('') : `<div class="empty">${esc(S.courses.length ? _t('आज कोई session तय नहीं है।') : _t('पहले course जोड़िए।'))}</div><div class="s-acts wrap">${S.courses.length ? `<button class="s-btn" data-act="makeplan">🪄 ${esc(_t('मेरा plan बनाओ'))}</button>` : `<button class="s-btn gold" data-act="newco">➕ ${esc(_t('Course जोड़ें'))}</button>`}</div>`}</div>
      ${weak.length ? `<div class="s-card warn"><div class="s-h">⚠ ${esc(_t('इन पर ध्यान दीजिए'))}</div>${weak.map(w => { const co = courseById(w.course) || {}; return `<div class="s-row" data-co="${esc(w.course)}" data-ch="${esc(w.ch)}"><div class="s-ti"><b>${esc(w.title)}</b><small>${esc(co.name || '')} · ${pct(w.acc)}${w.miss.length ? ' · ' + esc(_t('चूके:')) + ' ' + esc(w.miss.slice(0, 3).join(', ')) : ''}</small></div><button class="s-btn sm" data-act="improve">💪 ${esc(_t('सुधारें'))}</button></div>`; }).join('')}</div>` : ''}
      ${subj.length ? `<div class="s-card"><div class="s-h">📊 ${esc(_t('Subject की ताकत'))}</div>${subj.map(x => `<div class="s-sub"><div class="s-subt"><b>${esc(x.subject)}</b><span>${x.acc == null ? esc(_t('अभी test नहीं')) : pct(x.acc)}</span></div>${bar(x.acc == null ? 0 : x.acc, x.acc == null ? '' : SY.level(x.acc))}</div>`).join('')}</div>` : ''}
      ${ins.lines.length ? `<div class="s-card brain"><div class="s-h">🧠 ${esc(_t('मैंने आपके बारे में सीखा'))}</div>${ins.lines.map(l => `<p>${esc(l)}</p>`).join('')}</div>` : ''}
      <div class="s-acts wrap center"><button class="s-btn" data-act="goquiz">📝 ${esc(_t('Quiz दें'))}</button><button class="s-btn" data-act="gocards">🃏 ${esc(_t('Flashcards'))}</button><button class="s-btn ghost" data-act="profile">👤 ${esc(_t('मेरी जानकारी'))}</button></div></div>`;
    box.querySelectorAll('.s-num').forEach(n => countUp(n, +n.dataset.n, 900)); animateRings(box);
  }

  /* ---------------- quiz: 1 / 2 / 5 / 10 marks, question paper, auto ---------------- */
  const QS = { course: null, chs: new Set(), kind: '1', n: 8, timed: false, paper: { 1: 8, 2: 3, 5: 1, 10: 0 } };
  let quiz = null;
  const MK = { '1': 1, '2': 2, '5': 5, '10': 10 };
  const TYPE_NAME = () => ({ 1: _t('1 अंक · Objective'), 2: _t('2 अंक · छोटा उत्तर'), 5: _t('5 अंक · विस्तार से'), 10: _t('10 अंक · निबंध') });
  function quizCourses() { return S.courses.filter(c => (c.chapters || []).length); }
  function renderQuizHome() {
    const box = el('sQuiz'); if (!box) return; ensure(); const cs = quizCourses();
    if (!cs.length) { box.innerHTML = `<div class="s-wrap"><div class="s-title"><h2>📝 ${esc(_t('Quiz'))}</h2></div><div class="s-empty"><div class="s-big">📝</div><b>${esc(_t('पहले course जोड़िए'))}</b><p>${esc(_t('Course की PDF या notes से मैं 1, 2, 5 और 10 अंक के सवाल खुद बनाऊँगी।'))}</p><button class="s-btn gold xl" data-act="newco">➕ ${esc(_t('Course जोड़ें'))}</button></div></div>`; return; }
    if (!QS.course || !courseById(QS.course) || !(courseById(QS.course).chapters || []).length) { QS.course = cs[0].id; QS.chs = new Set(); }
    const co = courseById(QS.course), st = stats().filter(x => x.course === co.id);
    if (!QS.chs.size) (co.chapters || []).forEach(c => QS.chs.add(c.id));
    const isPaper = QS.kind === 'paper', total = [1, 2, 5, 10].reduce((a, m) => a + m * (QS.paper[m] || 0), 0);
    const last = S.attempts.slice(-5).reverse();
    box.innerHTML = `<div class="s-wrap"><div class="s-title"><h2>📝 ${esc(_t('Quiz और Question Paper'))}</h2></div>
      <div class="s-chips">${cs.map(c => `<button class="s-chip ${c.id === QS.course ? 'on' : ''}" data-act="qcourse" data-id="${esc(c.id)}">${esc(c.name)}</button>`).join('')}</div>
      <div class="s-card"><div class="s-h">${esc(_t('कौन से chapters'))} <button class="s-link" data-act="qall">${esc(_t('सब'))}</button></div>
        ${(co.chapters || []).map(ch => { const s = st.find(x => x.ch === ch.id) || {}; return `<label class="s-pick"><input type="checkbox" class="qch" value="${esc(ch.id)}" ${QS.chs.has(ch.id) ? 'checked' : ''}><span>${esc(ch.title)}</span>${badge(s.level || 'new')}</label>`; }).join('')}</div>
      <div class="s-tabs">${['1', '2', '5', '10', 'paper', 'auto'].map(k => `<button class="s-tab ${QS.kind === k ? 'on' : ''}" data-act="qkind" data-k="${k}">${k === 'paper' ? '📄 ' + esc(_t('Paper')) : k === 'auto' ? '🤖 ' + esc(_t('Auto')) : esc(_t('{0} अंक', [k]))}</button>`).join('')}</div>
      <div class="s-card">${QS.kind === 'auto' ? `<p class="hint">${esc(_t('Auto: मैं आपके सबसे कमज़ोर topics चुनकर, आपकी पिछली गलतियों के आधार पर सवाल बनाऊँगी।'))}</p>`
        : isPaper ? `<div class="s-h">${esc(_t('Paper बनाइए'))} · <b class="s-gold">${total} ${esc(_t('अंक'))}</b></div>` + [1, 2, 5, 10].map(m => `<div class="s-step"><span>${esc(TYPE_NAME()[m])}</span><div><button class="s-sbtn" data-act="pdec" data-m="${m}">−</button><b>${QS.paper[m] || 0}</b><button class="s-sbtn" data-act="pinc" data-m="${m}">+</button></div></div>`).join('') + `<div class="s-acts wrap"><button class="s-btn ghost sm" data-act="ppreset" data-p="25">${esc(_t('छोटा test · 25'))}</button><button class="s-btn ghost sm" data-act="ppreset" data-p="50">${esc(_t('Unit test · 50'))}</button><button class="s-btn ghost sm" data-act="ppreset" data-p="80">${esc(_t('Final · 80'))}</button></div>`
        : `<div class="s-step"><span>${esc(TYPE_NAME()[QS.kind])}</span><div><button class="s-sbtn" data-act="ndec">−</button><b>${QS.n}</b><button class="s-sbtn" data-act="ninc">+</button></div></div><p class="hint">${esc(_t('{0} सवाल · कुल {1} अंक', [QS.n, QS.n * MK[QS.kind]]))}</p>`}
        ${isPaper ? `<label class="chk"><input type="checkbox" id="qTimed" ${QS.timed ? 'checked' : ''}> ⏱ ${esc(_t('समय के साथ (exam जैसा)'))}</label>` : ''}</div>
      <div class="s-acts wrap center">${isPaper ? `<button class="s-btn ghost" data-act="qpreview">👁 ${esc(_t('Paper देखें / print'))}</button>` : ''}<button class="s-btn gold xl" data-act="qstart">▶ ${esc(isPaper ? _t('Exam शुरू करें') : _t('शुरू करें'))}</button></div>
      ${last.length ? `<div class="s-card"><div class="s-h">🕘 ${esc(_t('पिछले results'))}</div>${last.map(a => { const c = courseById(a.course) || {}; return `<div class="s-row"><span class="s-ti">${esc(c.name || '')} · ${new Date(a.at).getDate()}/${new Date(a.at).getMonth() + 1}</span><b>${a.got}/${a.max}</b>${bar(a.max ? a.got / a.max : 0, SY.level(a.max ? a.got / a.max : 0))}</div>`; }).join('')}</div>` : ''}</div>`;
  }
  /* collect the weak concepts of a course so the next questions come back to them (the engine prefers them) */
  function focusStems(courseId) {
    const set = new Set(); stats().filter(x => x.course === courseId && x.level !== 'strong').forEach(x => x.miss.forEach(m => SY.words(m).forEach(w => set.add(SY.stem(w))))); return set;
  }
  function buildItems(opts) {
    const out = [], r = SY.rng();
    const per = (co, chIds, plan) => {
      const pool = poolFor(co, chIds); pool.focus = focusStems(co.id);
      plan.forEach(([m, n]) => SY.make(pool, m, n, r, chIds).forEach(q => { q.course = co.id; out.push(q); }));
    };
    if (opts.kind === 'auto') {
      const sts = stats().filter(x => (x.level === 'weak' || x.level === 'new' || x.level === 'okay') && courseById(x.course)).sort((a, b) => (a.acc == null ? 0.55 : a.acc) - (b.acc == null ? 0.55 : b.acc)).slice(0, 3);
      const wt = insights().weakType, byCo = new Map(); sts.forEach(x => { if (!byCo.has(x.course)) byCo.set(x.course, []); byCo.get(x.course).push(x.ch); });
      byCo.forEach((chs, cid) => per(courseById(cid), chs, [[1, 4 * chs.length], [2, wt === 'short' ? 3 : 2], [5, wt === 'medium' || wt === 'long' ? 1 : 0]]));
    } else if (opts.kind === 'paper') {
      const co = courseById(opts.courseId), pool = poolFor(co, opts.chapters); pool.focus = focusStems(co.id);
      const paper = SY.makePaper(pool, [1, 2, 5, 10].map(m => ({ marks: m, count: opts.paper[m] || 0 })), { chapterIds: opts.chapters });
      paper.sections.forEach(s => s.items.forEach(q => { q.course = co.id; out.push(q); })); out.paper = paper;
    } else per(courseById(opts.courseId), opts.chapters, [[MK[opts.kind], opts.n]]);
    return out;
  }
  function startQuiz(opts) {
    ensure();
    let items = opts.items;
    if (!items) { items = buildItems(opts); }
    if (!items.length) { toastS(_t('इन chapters से सवाल नहीं बन पाए — text बहुत कम है। और chapters चुनिए या और notes जोड़िए।')); return; }
    const exam = !!opts.exam;
    quiz = { items, i: 0, res: [], t0: Date.now(), exam, taskId: opts.taskId || null, kind: opts.kind || 'quiz', timer: null, deadline: opts.timed ? Date.now() + items.reduce((a, q) => a + q.marks * 60000 * (q.type === 'mcq' ? 0.6 : 1.2), 0) : 0, answered: false };
    if (quiz.deadline) quiz.timer = setInterval(tickQuiz, 1000);
    drawQ(); if (!exam) teach(_t2('{0}, तैयार हो जाइए। कुल {1} सवाल हैं।', [tName(), items.length], '{0}, get ready. There are {1} questions.', [tName(), items.length]), { interrupt: true });
  }
  function tickQuiz() {
    if (!quiz || !quiz.deadline) return; const left = Math.max(0, quiz.deadline - Date.now()), t = el('qTimer');
    if (t) { t.textContent = '⏱ ' + pad2(Math.floor(left / 60000)) + ':' + pad2(Math.floor(left / 1000) % 60); t.classList.toggle('low', left < 60000); }
    if (!left) { clearInterval(quiz.timer); toastS(_t('⏰ समय समाप्त')); finishQuiz(); }
  }
  function drawQ() {
    const q = quiz.items[quiz.i], n = quiz.items.length, co = courseById(q.course) || {}, letters = ['A', 'B', 'C', 'D'];
    ov(`<div class="s-ovh"><button class="s-x" data-act="quitquiz">✕</button><div class="s-qprog"><div class="s-line"><i style="width:${Math.round(quiz.i / n * 100)}%"></i></div><small>${esc(_t('सवाल {0} / {1}', [quiz.i + 1, n]))} · ${esc(co.name || '')}</small></div>${quiz.deadline ? '<span id="qTimer" class="s-timer"></span>' : ''}</div>
      <div class="s-qcard" id="qCard"><div class="s-qtop"><span class="s-pill gold">${q.marks} ${esc(_t('अंक'))}</span><button class="s-link" data-act="hear">🔊 ${esc(_t('सुनें'))}</button></div>
        <div class="s-qtext">${esc(q.q)}</div>
        ${q.type === 'mcq' ? `<div class="s-opts">${q.options.map((o, i) => `<button class="s-opt" data-act="opt" data-i="${i}"><b>${letters[i]}</b><span>${esc(o)}</span></button>`).join('')}</div>`
        : `<textarea id="qAns" class="s-ans" rows="${q.marks >= 5 ? 9 : 4}" placeholder="${esc(_t('अपना उत्तर यहाँ लिखिए…'))}"></textarea><div class="s-acts"><button class="s-btn gold" data-act="check">${esc(quiz.exam ? _t('अगला') : _t('जाँचें'))}</button><button class="s-btn ghost" data-act="skip">${esc(_t('छोड़ें'))}</button></div>`}
        <div id="qFb"></div></div>`, 'quiz');
    tickQuiz(); quiz.answered = false;
    if (!quiz.exam) setTimeout(() => speakQ(q), 350);
  }
  function speakQ(q) {
    const L = ['A', 'B', 'C', 'D']; const t = q.q.replace(/_____/g, _t('खाली जगह')) + (q.type === 'mcq' ? '. ' + q.options.map((o, i) => L[i] + '. ' + o).join('. ') : '');
    if (S.settings.steacher !== false) say(t, { mood: 'gentle', interrupt: true });
  }
  function recordRes(q, got, resp, g) { quiz.res.push({ q, got, max: q.marks, resp, g }); }
  function answerOpt(i) {
    if (!quiz || quiz.answered) return; const q = quiz.items[quiz.i], g = SY.grade(q, i); quiz.answered = true; recordRes(q, g.got, i, g);
    if (quiz.exam) { nextQ(); return; }
    document.querySelectorAll('#qCard .s-opt').forEach((b, k) => { b.disabled = true; if (k === q.answer) b.classList.add('ok'); else if (k === i) b.classList.add('bad'); });
    const fb = el('qFb'); fb.innerHTML = `<div class="s-fb ${g.ok ? 'good' : 'wrong'}"><b>${g.ok ? '✅ ' + esc(_t('सही!')) : '❌ ' + esc(_t('सही उत्तर:')) + ' ' + esc(q.options[q.answer])}</b><p>${esc(q.src || '')}</p></div><div class="s-acts"><button class="s-btn gold" data-act="next">${quiz.i + 1 >= quiz.items.length ? esc(_t('Result देखें')) : esc(_t('अगला')) + ' ›'}</button></div>`;
    if (g.ok) { if (Math.random() < 0.3) teach(_t('बिल्कुल सही।')); } else teach(_t2('सही उत्तर है {0}।', [q.options[q.answer]], 'The correct answer is {0}.', [q.options[q.answer]]), { interrupt: true });
  }
  function checkWritten(skip) {
    if (!quiz || quiz.answered) return; const q = quiz.items[quiz.i], text = skip ? '' : (el('qAns').value || ''), g = SY.grade(q, text); quiz.answered = true; recordRes(q, g.got, text, g);
    if (quiz.exam) { nextQ(); return; }
    const fb = el('qFb'), r = quiz.res[quiz.res.length - 1];
    el('qAns') && (el('qAns').disabled = true); document.querySelectorAll('#qCard [data-act=check],#qCard [data-act=skip]').forEach(b => b.hidden = true);
    fb.innerHTML = `<div class="s-fb ${g.frac >= 0.6 ? 'good' : 'wrong'}"><div class="s-score"><b id="qGot">0</b><span>/ ${q.marks}</span></div>${bar(g.frac, SY.level(g.frac))}
      ${g.matched.length ? `<div class="s-kw ok">${g.matched.map(k => `<i>✓ ${esc(k)}</i>`).join('')}</div>` : ''}${g.missing.length ? `<div class="s-kw no"><small>${esc(_t('इनका ज़िक्र चाहिए था:'))}</small>${g.missing.map(k => `<i>✗ ${esc(k)}</i>`).join('')}</div>` : ''}
      <details><summary>${esc(_t('आदर्श उत्तर देखें'))}</summary><p>${esc(q.model)}</p></details>
      <div class="s-adj"><small>${esc(_t('मेरे हिसाब से अंक:'))}</small><button class="s-sbtn" data-act="adj" data-d="-0.5">−</button><b id="qAdj">${g.got}</b><button class="s-sbtn" data-act="adj" data-d="0.5">+</button></div></div>
      <div class="s-acts"><button class="s-btn gold" data-act="next">${quiz.i + 1 >= quiz.items.length ? esc(_t('Result देखें')) : esc(_t('अगला')) + ' ›'}</button></div>`;
    countUp(el('qGot'), g.got, 700, g.got % 1 ? 1 : 0);
    if (g.missing.length && !skip) teach(_t2('{0} का ज़िक्र करना चाहिए था।', [g.missing.slice(0, 3).join(', ')], 'You should have mentioned {0}.', [g.missing.slice(0, 3).join(', ')]), { interrupt: true });
  }
  function nextQ() { if (!quiz) return; if (quiz.i + 1 >= quiz.items.length) { finishQuiz(); return; } quiz.i++; drawQ(); }
  function completeTask(id) { const t = S.tasks.find(x => x.id === id); if (t && !t.done) markDone(t); }
  function mistakeCard(q, courseId, got) {
    const front = q.type === 'mcq' ? q.q : q.q, back = q.type === 'mcq' ? (q.options[q.answer] + ' — ' + (q.src || '')) : q.model;
    const id = 'k' + SY.hash32(courseId + '|m|' + q.id), ex = S.cards.find(c => c.id === id);
    if (ex) { ex.due = Math.min(ex.due, Date.now() + DAYMS); ex.lapses = (ex.lapses || 0) + 1; ex.reps = 0; return; }
    S.cards.push({ id, courseId, ch: q.ch, kind: 'mistake', front, back, ease: 2.3, interval: 0, reps: 0, lapses: 1, due: Date.now() + DAYMS, last: 0 });
  }
  function finishQuiz() {
    if (!quiz) return; clearInterval(quiz.timer); const qz = quiz; quiz = null;
    // unanswered (time up / quit) count as 0
    for (let i = qz.res.length; i < qz.items.length; i++) { const q = qz.items[i]; qz.res.push({ q, got: 0, max: q.marks, resp: null, g: { got: 0, max: q.marks, matched: [], missing: q.keys.slice(), frac: 0 } }); }
    const byCo = new Map();
    qz.res.forEach(r => { const k = r.q.course; if (!byCo.has(k)) byCo.set(k, []); byCo.get(k).push(r); });
    const items = qz.res.map(r => ({ ch: r.q.ch, course: r.q.course, marks: r.max, got: r.got, type: r.q.type, miss: r.got < r.max * 0.6 ? r.g.missing.slice(0, 4) : [], q: r.q.q.slice(0, 80) }));
    byCo.forEach((rs, cid) => { S.attempts.push({ id: uid(), at: Date.now(), course: cid, kind: qz.kind, items: items.filter(i => i.course === cid), got: rs.reduce((a, r) => a + r.got, 0), max: rs.reduce((a, r) => a + r.max, 0) }); });
    if (S.attempts.length > 220) S.attempts.splice(0, S.attempts.length - 220);
    qz.res.forEach(r => { if (r.got < r.max * 0.6) mistakeCard(r.q, r.q.course, r.got); });
    learnFromAnswers(items); const secs = (Date.now() - qz.t0) / 60000; logToday({ q: qz.res.length, min: Math.min(secs, 90) });
    byCo.forEach((rs, cid) => { const co = courseById(cid); if (!co) return; rs.forEach(r => { const ch = (co.chapters || []).find(c => c.id === r.q.ch); if (ch) ch.lastQuiz = Date.now(); }); co.updatedAt = Date.now(); });
    if (qz.taskId) completeTask(qz.taskId);
    save();
    const got = qz.res.reduce((a, r) => a + r.got, 0), max = qz.res.reduce((a, r) => a + r.max, 0), chs = new Map();
    qz.res.forEach(r => { const k = r.q.course + '|' + r.q.ch, o = chs.get(k) || { course: r.q.course, ch: r.q.ch, got: 0, max: 0 }; o.got += r.got; o.max += r.max; chs.set(k, o); });
    const rows = [...chs.values()].map(o => ({ o, co: courseById(o.course) || {}, f: o.max ? o.got / o.max : 0 })).sort((a, b) => a.f - b.f);
    const weakTopics = rows.filter(x => x.f < 0.6).map(x => chName(x.co, x.o.ch)).filter(Boolean);
    const wrong = qz.res.filter(r => r.got < r.max * 0.6).map(r => r.q);
    ov(`<div class="s-ovh"><button class="s-x" data-act="closeov">✕</button><b>${esc(_t('Result'))}</b></div>
      <div class="s-result"><div class="s-big-ring">${ring(max ? got / max : 0, 150, `<span id="rGot">0</span>`, '/ ' + max)}</div><h2>${max && got / max >= 0.8 ? '🎉 ' + esc(_t('शानदार!')) : max && got / max >= 0.5 ? '👍 ' + esc(_t('अच्छा प्रयास')) : '💪 ' + esc(_t('और अभ्यास कीजिए'))}</h2>
        <div class="s-card">${rows.map(x => `<div class="s-sub"><div class="s-subt"><b>${esc(chName(x.co, x.o.ch) || x.co.name || '')}</b><span>${Math.round(x.o.got * 10) / 10}/${x.o.max}</span></div>${bar(x.f, SY.level(x.f))}</div>`).join('')}</div>
        ${weakTopics.length ? `<div class="s-card warn"><div class="s-h">🎯 ${esc(_t('इन पर दोबारा काम कीजिए'))}</div>${[...new Set(weakTopics)].map(t => `<p>• ${esc(t)}</p>`).join('')}<p class="hint">${esc(_t('गलत सवालों से मैंने flashcards बना दिए हैं — कल दोहराइए।'))}</p></div>` : ''}
        <div class="s-acts wrap center">${wrong.length ? `<button class="s-btn gold" data-act="retrywrong">🔁 ${esc(_t('गलत सवाल दोबारा'))} (${wrong.length})</button>` : ''}<button class="s-btn" data-act="replan">🗓 ${esc(_t('Plan अपडेट करें'))}</button><button class="s-btn ghost" data-act="closeov">${esc(_t('ठीक है'))}</button></div></div>`);
    quizRetry = wrong; countUp(el('rGot'), Math.round(got * 10) / 10, 1000, got % 1 ? 1 : 0); animateRings(el('sOv'));
    if (max && got / max >= 0.8) confetti(160);
    teach(T.quizDone({ got: Math.round(got * 10) / 10, max, weakTopics }), { interrupt: true });
    if (S.settings.sauto) makePlan(false); renderQuizHome(); renderSHome();
  }
  let quizRetry = [];
  /* ---------------- printable question paper ---------------- */
  function paperHtml(paper, co, key) {
    const L = ['a', 'b', 'c', 'd']; let n = 0;
    return `<h2>${esc(co.name)} — ${esc(_t('प्रश्न पत्र'))}</h2><p>${esc(_t('कुल अंक'))}: ${paper.total} · ${esc(_t('समय'))}: ${Math.max(20, Math.round(paper.sections.reduce((a, s) => a + s.items.length * s.marks * (s.marks === 1 ? 0.6 : 1.2), 0)))} ${esc(_t('मिनट'))}</p>` +
      paper.sections.map((s, si) => `<h3>${esc(_t('खंड'))} ${String.fromCharCode(65 + si)} — ${s.items.length} × ${s.marks} ${esc(_t('अंक'))}</h3><ol start="${n + 1}">${s.items.map(q => { n++; return `<li>${esc(q.q)} <small>[${q.marks}]</small>${q.type === 'mcq' ? `<ol type="a">${q.options.map(o => `<li>${esc(o)}</li>`).join('')}</ol>` : ''}${key ? `<div class="key"><b>${esc(_t('उत्तर:'))}</b> ${q.type === 'mcq' ? L[q.answer] + '. ' + esc(q.options[q.answer]) : esc(q.model)}</div>` : ''}</li>`; }).join('')}</ol>`).join('');
  }
  function previewPaper() {
    const co = courseById(QS.course); if (!co) return; const chs = [...QS.chs], pool = poolFor(co, chs); pool.focus = focusStems(co.id);
    const paper = SY.makePaper(pool, [1, 2, 5, 10].map(m => ({ marks: m, count: QS.paper[m] || 0 })), { chapterIds: chs });
    if (!paper.count) { toastS(_t('इन chapters से सवाल नहीं बन पाए — text बहुत कम है। और chapters चुनिए या और notes जोड़िए।')); return; }
    window.__paper = { paper, co, key: false };
    ov(`<div class="s-ovh"><button class="s-x" data-act="closeov">✕</button><b>📄 ${esc(_t('Question Paper'))}</b></div><div class="s-card s-paper" id="paperBox">${paperHtml(paper, co, false)}</div>
      <div class="s-acts wrap center"><button class="s-btn" data-act="pkey">🔑 ${esc(_t('उत्तर देखें / छिपाएँ'))}</button><button class="s-btn" data-act="pprint">🖨 ${esc(_t('Print / PDF'))}</button><button class="s-btn" data-act="pcopy">📋 ${esc(_t('Copy'))}</button><button class="s-btn gold" data-act="pexam">▶ ${esc(_t('इसी का Exam दें'))}</button></div>`);
  }
  function printPaper() {
    const p = window.__paper; if (!p) return; let a = el('printArea'); if (!a) { document.body.insertAdjacentHTML('beforeend', '<div id="printArea"></div>'); a = el('printArea'); }
    a.innerHTML = paperHtml(p.paper, p.co, p.key); document.body.classList.add('printing'); setTimeout(() => { window.print(); setTimeout(() => document.body.classList.remove('printing'), 500); }, 80);
  }

  /* ---------------- flashcards ---------------- */
  let deck = null;
  function renderCards() {
    const box = el('sCards'); if (!box) return; ensure(); const now = Date.now(), cs = SY.cardStats(S.cards, now), mist = S.cards.filter(c => c.kind === 'mistake').length;
    const rows = S.courses.filter(c => S.cards.some(k => k.courseId === c.id));
    box.innerHTML = `<div class="s-wrap"><div class="s-title"><h2>🃏 ${esc(_t('Flashcards'))}</h2></div>
      <div class="s-stats four"><div class="s-stat"><b class="s-num" data-n="${cs.due}">0</b><small>${esc(_t('आज दोहराने हैं'))}</small></div><div class="s-stat"><b class="s-num" data-n="${cs.fresh}">0</b><small>${esc(_t('नए'))}</small></div><div class="s-stat"><b class="s-num" data-n="${cs.learning}">0</b><small>${esc(_t('सीख रहे'))}</small></div><div class="s-stat"><b class="s-num" data-n="${cs.mature}">0</b><small>${esc(_t('पक्के'))}</small></div></div>
      ${cs.total ? `<div class="s-acts wrap center"><button class="s-btn gold xl" data-act="cstudy" data-id="">▶ ${esc(_t('अभी दोहराएँ'))}${cs.due ? ' (' + cs.due + ')' : ''}</button></div>` : ''}
      ${mist ? `<div class="s-card brain"><div class="s-h">🧠 ${esc(_t('आपकी गलतियों से बने cards'))}: ${mist}</div><p class="hint">${esc(_t('जिन सवालों में आप चूके, उन्हें मैं बार-बार पूछूँगी जब तक पक्का न हो जाए।'))}</p></div>` : ''}
      ${rows.length ? rows.map(co => { const all = S.cards.filter(k => k.courseId === co.id), due = SY.cardStats(all, now).due, mature = all.filter(k => SY.rank(k) === 'mature').length; return `<div class="s-card"><div class="s-row"><div class="s-ti"><b>${esc(co.name)}</b><small>${all.length} ${esc(_t('cards'))} · ${mature} ${esc(_t('पक्के'))}</small>${bar(all.length ? mature / all.length : 0)}</div><button class="s-btn sm" data-act="cstudy" data-id="${esc(co.id)}">▶ ${due ? due : ''}</button><button class="s-btn sm ghost" data-act="cmore" data-id="${esc(co.id)}" title="${esc(_t('और cards बनाएँ'))}">＋</button></div></div>`; }).join('')
        : `<div class="s-empty"><div class="s-big">🃏</div><b>${esc(_t('अभी कोई card नहीं'))}</b><p>${esc(_t('Course जोड़ते ही मैं flashcards बना दूँगी।'))}</p><button class="s-btn gold xl" data-act="newco">➕ ${esc(_t('Course जोड़ें'))}</button></div>`}</div>`;
    box.querySelectorAll('.s-num').forEach(n => countUp(n, +n.dataset.n, 800));
  }
  function startCards(o) {
    ensure(); o = o || {}; const now = Date.now();
    let list = SY.dueCards(S.cards, now, { limit: 20, newLimit: 8, courseId: o.course || null, chapterId: o.chapter || null });
    if (!list.length && o.chapter) list = S.cards.filter(c => c.courseId === o.course && c.ch === o.chapter).slice(0, 20);   // practise a chapter even when nothing is due
    if (!list.length) { toastS(S.cards.length ? _t('अभी दोहराने के लिए कोई card तैयार नहीं 🎉') : _t('अभी कोई card नहीं है')); return; }
    deck = { ids: list.map(c => c.id), i: 0, flipped: false, again: 0, good: 0, taskId: o.taskId || null, t0: Date.now() }; drawCard();
  }
  const cardOf = id => S.cards.find(c => c.id === id);
  function drawCard() {
    const c = cardOf(deck.ids[deck.i]); if (!c) { finishCards(); return; } const n = deck.ids.length, co = courseById(c.courseId) || {};
    ov(`<div class="s-ovh"><button class="s-x" data-act="closeov">✕</button><div class="s-qprog"><div class="s-line"><i style="width:${Math.round(deck.i / n * 100)}%"></i></div><small>${esc(_t('Card {0} / {1}', [deck.i + 1, n]))} · ${esc(co.name || '')}${c.kind === 'mistake' ? ' · 🧠' : ''}</small></div></div>
      <div class="s-flipwrap"><div class="s-flip ${deck.flipped ? 'on' : ''}" id="sFlip" data-act="cflip"><div class="s-face f"><small>${esc(_t('सवाल'))}</small><p>${esc(c.front)}</p><em>${esc(_t('उत्तर देखने के लिए छुएँ'))}</em></div><div class="s-face b"><small>${esc(_t('उत्तर'))}</small><p>${esc(c.back)}</p></div></div></div>
      <div class="s-acts center"><button class="s-btn ghost" data-act="chear">🔊 ${esc(_t('सुनें'))}</button></div>
      <div class="s-rate" id="sRate" ${deck.flipped ? '' : 'hidden'}>${[[0, _t('फिर से'), 'again'], [1, _t('कठिन'), 'hard'], [2, _t('ठीक'), 'good'], [3, _t('आसान'), 'easy']].map(([q, l, k]) => `<button class="s-r ${k}" data-act="crate" data-q="${q}"><b>${esc(l)}</b><small>${SY.nextLabel(c, q)}</small></button>`).join('')}</div>`, 'cards');
    if (S.settings.steacher !== false && !deck.flipped) say(c.front.replace(/_____/g, _t('खाली जगह')), { mood: 'gentle', interrupt: true });
  }
  function flipCard() {
    if (!deck) return; deck.flipped = true; el('sFlip').classList.add('on'); el('sRate').hidden = false;
    const c = cardOf(deck.ids[deck.i]); if (S.settings.steacher !== false && c) say(c.back, { mood: 'gentle', interrupt: true });
  }
  function rateCard(q) {
    if (!deck) return; const id = deck.ids[deck.i], c = cardOf(id); if (!c) return;
    Object.assign(c, SY.reviewCard(c, q, Date.now()));
    if (q === 0) { deck.again++; deck.ids.push(id); } else deck.good++;
    deck.i++; deck.flipped = false; save();
    if (deck.i >= deck.ids.length) finishCards(); else drawCard();
  }
  function finishCards() {
    const d = deck; deck = null; if (!d) return; const mins = (Date.now() - d.t0) / 60000;
    logToday({ cards: d.ids.length, min: Math.min(mins, 60) }); if (d.taskId) completeTask(d.taskId); save();
    ov(`<div class="s-ovh"><button class="s-x" data-act="closeov">✕</button><b>${esc(_t('Session पूरा'))}</b></div><div class="s-result"><div class="s-big">🎉</div><h2>${esc(_t('{0} cards दोहराए', [d.ids.length - d.again]))}</h2><p>${esc(_t('"फिर से" वाले cards जल्दी वापस आएँगे।'))}</p><div class="s-acts wrap center"><button class="s-btn gold" data-act="closeov">${esc(_t('ठीक है'))}</button></div></div>`);
    if (d.again <= d.ids.length * 0.25) confetti(90); teach(_t2('{0}, flashcards का session पूरा हुआ। बहुत अच्छे।', [tName()], '{0}, the flashcard session is done. Well done.', [tName()]));
    renderCards(); renderSHome();
  }

  /* ---------------- plan (routine) + auto mode ---------------- */
  const KL = k => KIND()[k] || k;
  function taskFrom(s) {
    const co = courseById(s.course) || {};
    return { id: s.id, docId: null, title: '📚 ' + s.title + ' · ' + KL(s.kind) + ' (' + s.min + ' ' + _t('मिनट') + ')', text: s.title, section: '', alarmAt: s.at, done: false, pre: false, fired: false, missed: false, manual: true, priority: 2, preMin: 5, study: { course: s.course, ch: s.ch, kind: s.kind, min: s.min, auto: s.auto !== false } };
  }
  const planSig = () => SY.hash32(JSON.stringify(stats().map(x => x.course + x.ch + x.level)) + JSON.stringify(S.settings.splan) + S.courses.map(c => c.id + (c.exam || '')).join() + (S.settings.sauto ? 1 : 0));
  function makePlan(announce) {
    ensure(); if (!S.courses.some(c => (c.chapters || []).length)) { if (announce) toastS(_t('पहले course जोड़िए')); return 0; }
    learnFromSessions(); const now = Date.now(), cfg = effectiveCfg();
    const sessions = SY.buildPlan(S.courses.filter(c => (c.chapters || []).length), stats(), S.cards, cfg, now);
    S.tasks = S.tasks.filter(t => !(t.study && t.study.auto && !t.done && t.alarmAt > now));
    sessions.forEach(s => { if (!S.tasks.some(t => t.id === s.id)) S.tasks.push(taskFrom(Object.assign({ auto: true }, s))); });
    S.settings.splanAt = now; S.settings.splanSig = planSig(); save(); render(); renderPlan(); renderSHome();
    if (announce) { toastS(_t('🗓 {0} sessions का plan बन गया — सबके alarm लग गए', [sessions.length])); teach(_t2('{0}, मैंने आपका study plan बना दिया है। {1} sessions हैं, और सबके alarm लग गए हैं।', [tName(), sessions.length], '{0}, I have made your study plan. There are {1} sessions and all alarms are set.', [tName(), sessions.length])); }
    return sessions.length;
  }
  function autoTick() {
    if (!isStu()) return; ensure(); learnFromSessions();
    const now = Date.now();
    if (S.settings.sauto && S.courses.some(c => (c.chapters || []).length) && (now - (S.settings.splanAt || 0) > 6 * 3600e3 || S.settings.splanSig !== planSig())) makePlan(false);
    const today = dkey(now); if (S.settings.sgreet !== today && S.settings.sdone) { S.settings.sgreet = today; save(); setTimeout(() => teach(T.greet()), 2500); }
  }
  function renderPlan() {
    const box = el('sPlan'); if (!box) return; ensure(); const s = S.settings, p = s.splan, now = Date.now(), ins = insights();
    const sess = S.tasks.filter(t => t.study && t.alarmAt > now - 3 * 3600e3).sort((a, b) => a.alarmAt - b.alarmAt), groups = new Map();
    sess.forEach(t => { const k = dkey(t.alarmAt); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(t); });
    box.innerHTML = `<div class="s-wrap"><div class="s-title"><h2>🗓 ${esc(_t('मेरा Plan / Routine'))}</h2><button class="s-btn gold" data-act="makeplan">🪄 ${esc(_t('Plan बनाओ'))}</button></div>
      <div class="s-card ${s.sauto ? 'brain' : ''}"><label class="chk"><input type="checkbox" id="pAuto" ${s.sauto ? 'checked' : ''}> 🤖 <b>${esc(_t('Auto mode'))}</b> — ${esc(_t('मैं खुद plan बनाऊँगी, alarm लगाऊँगी और कमज़ोर topics के हिसाब से बदलती रहूँगी'))}</label>
        ${ins.lines.map(l => `<p class="s-ins">${esc(l)}</p>`).join('')}</div>
      <div class="s-card"><div class="s-h">⚙ ${esc(_t('पढ़ने का routine'))}</div><div class="wrow"><label class="wf">${esc(_t('शुरू'))}<input type="time" id="pFrom" value="${esc(p.from)}"></label><label class="wf">${esc(_t('खत्म'))}<input type="time" id="pTo" value="${esc(p.to)}"></label></div>
        <div class="wrow"><label class="wf">${esc(_t('Session (मिनट)'))}<select id="pSess">${[20, 25, 30, 40, 45, 60].map(v => `<option ${+p.session === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label><label class="wf">${esc(_t('रोज़ का लक्ष्य'))}<select id="pGoal">${[30, 60, 90, 120, 180, 240].map(v => `<option ${+s.sgoal === v ? 'selected' : ''}>${v}</option>`).join('')}</select></label></div>
        <div class="s-chips" id="pDays">${WD().map((w, i) => `<button type="button" class="s-chip ${p.days.includes(i) ? 'on' : ''}" data-d="${i}">${esc(w)}</button>`).join('')}</div>
        <div class="s-acts"><button class="s-btn" data-act="psave">💾 ${esc(_t('सहेजें और plan बनाएँ'))}</button></div></div>
      <div class="s-card"><div class="s-h">➕ ${esc(_t('अपना session जोड़ें'))}</div><div class="wrow"><select id="pnCo">${S.courses.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select><input type="datetime-local" id="pnAt"></div><div class="s-acts"><button class="s-btn ghost" data-act="pnew">${esc(_t('जोड़ें'))}</button></div></div>
      ${[...groups.entries()].map(([k, ts]) => `<div class="s-day"><div class="s-dayh">${esc(dayLabel(ts[0].alarmAt))}</div>${ts.map(t => { const kk = (t.study || {}).kind || 'read'; return `<div class="s-row ${t.done ? 'done' : ''}" data-task="${esc(t.id)}"><span class="s-time">${fmtT(t.alarmAt)}</span><span class="s-ti">${KICON[kk] || '📖'} ${esc(t.title.replace(/^📚\s*/, ''))}</span>${t.done ? '<span class="s-pill ok">✓</span>' : `<button class="s-btn sm" data-act="startsess">▶</button><button class="s-btn sm ghost" data-act="pdel">✕</button>`}</div>`; }).join('')}</div>`).join('') || `<div class="empty">${esc(S.courses.length ? _t('अभी कोई session नहीं — "Plan बनाओ" दबाइए।') : _t('पहले course जोड़िए।'))}</div>`}</div>`;
  }
  function startSession(id) {
    const t = S.tasks.find(x => x.id === id); if (!t || !t.study) return; const s = t.study, co = courseById(s.course); if (!co) { toastS(_t('यह course अब नहीं है')); return; }
    teach(T.session(t), { interrupt: true }); const chs = s.ch ? [s.ch] : (co.chapters || []).map(c => c.id), lv = (stats().find(x => x.course === co.id && x.ch === s.ch) || {}).level;
    if (s.kind === 'read' || s.kind === 'revise') { readerTask = id; openReader(co.id, s.ch || (co.chapters[0] || {}).id); }
    else if (s.kind === 'cards') startCards({ course: co.id, chapter: s.ch, taskId: id });
    else if (s.kind === 'mock') startQuiz({ kind: 'paper', courseId: co.id, chapters: chs, paper: { 1: 8, 2: 3, 5: 1, 10: 0 }, exam: true, timed: true, taskId: id });
    else startQuiz({ kind: lv === 'weak' || lv === 'new' ? '1' : '2', courseId: co.id, chapters: chs, n: lv === 'weak' || lv === 'new' ? 8 : 4, taskId: id });
  }
  let readerTask = null;

  /* ---------------- events ---------------- */
  function deleteCourse(id) {
    const co = courseById(id); if (!co) return; if (!confirm(_t('"{0}" हटाएँ? इसके flashcards और results भी हट जाएँगे।', [co.name]))) return;
    const withDocs = (co.docIds || []).length && confirm(_t('इसके documents भी हटाएँ?'));
    if (withDocs) { const ids = new Set(co.docIds); S.docs = S.docs.filter(d => !ids.has(d.id)); }
    S.courses = S.courses.filter(c => c.id !== id); S.cards = S.cards.filter(c => c.courseId !== id); S.attempts = S.attempts.filter(a => a.course !== id);
    S.tasks = S.tasks.filter(t => !(t.study && t.study.course === id)); courseOpen = null; save(); render(); refreshAll();
  }
  function onClick(e) {
    const b = e.target.closest('[data-act]'); if (!b || !b.closest('#sHome,#sCourses,#sQuiz,#sCards,#sPlan,#sOv')) return;
    const a = b.dataset.act, row = b.closest('[data-task]'), coEl = b.closest('[data-co]'), chEl = b.closest('[data-ch]');
    const coId = coEl && coEl.dataset.co, chId = chEl && chEl.dataset.ch;
    switch (a) {
      case 'closeov': if (reader) closeReader(); closeOv(); deck = null; refreshAll(); break;
      case 'greet': teach(T.greet(), { interrupt: true }); break;
      case 'toggleauto': S.settings.sauto = !S.settings.sauto; save(); if (S.settings.sauto) makePlan(true); renderSHome(); break;
      case 'startsess': if (row) startSession(row.dataset.task); break;
      case 'makeplan': makePlan(true); break;
      case 'newco': openCourseDlg(); break;
      case 'profile': openSignup(true); break;
      case 'improve': { const st = stats().find(x => x.course === coId && x.ch === chId); if (st) { const co = courseById(coId); teach(_t2('{0}, {1} में आप कमज़ोर हैं। पहले इसे पढ़िए, फिर सवाल हल कीजिए।', [tName(), st.title], '{0}, you are weak in {1}. First read it, then solve questions.', [tName(), st.title]), { interrupt: true }); readerTask = null; openReader(coId, chId); } break; }
      case 'goquiz': goTab('quiz'); break; case 'gocards': goTab('cards'); break;
      case 'toggleCo': courseOpen = courseOpen === coId ? null : coId; renderCourses(); break;
      case 'read': readerTask = null; openReader(coId, chId); break;
      case 'quizch': QS.course = coId; QS.chs = new Set([chId]); QS.kind = '1'; goTab('quiz'); break;
      case 'cardch': startCards({ course: coId, chapter: chId }); break;
      case 'addfiles': openCourseDlg(coId); break; case 'editco': openCourseDlg(coId); break; case 'delco': deleteCourse(coId); break;
      case 'qcourse': QS.course = b.dataset.id; QS.chs = new Set(); renderQuizHome(); break;
      case 'qall': { const co = courseById(QS.course); QS.chs = QS.chs.size === (co.chapters || []).length ? new Set() : new Set((co.chapters || []).map(c => c.id)); renderQuizHome(); break; }
      case 'qkind': QS.kind = b.dataset.k; renderQuizHome(); break;
      case 'pinc': QS.paper[b.dataset.m] = Math.min(30, (QS.paper[b.dataset.m] || 0) + 1); renderQuizHome(); break;
      case 'pdec': QS.paper[b.dataset.m] = Math.max(0, (QS.paper[b.dataset.m] || 0) - 1); renderQuizHome(); break;
      case 'ppreset': { const t = +b.dataset.p; QS.paper = t === 25 ? { 1: 8, 2: 3, 5: 1, 10: 0 } : t === 50 ? { 1: 10, 2: 5, 5: 2, 10: 1 } : { 1: 15, 2: 6, 5: 3, 10: 2 }; renderQuizHome(); break; }
      case 'ninc': QS.n = Math.min(40, QS.n + 1); renderQuizHome(); break; case 'ndec': QS.n = Math.max(1, QS.n - 1); renderQuizHome(); break;
      case 'qpreview': previewPaper(); break;
      case 'qstart': {
        const chs = [...QS.chs]; if (QS.kind !== 'auto' && !chs.length) { toastS(_t('कम से कम एक chapter चुनिए')); break; }
        startQuiz({ kind: QS.kind, courseId: QS.course, chapters: chs, n: QS.n, paper: QS.paper, timed: QS.kind === 'paper' && QS.timed, exam: QS.kind === 'paper' && QS.timed }); break;
      }
      case 'quitquiz': if (confirm(_t('Quiz बीच में छोड़ें? अब तक के जवाब गिने जाएँगे।'))) { if (quiz && quiz.res.length) finishQuiz(); else { clearInterval(quiz && quiz.timer); quiz = null; closeOv(); } } break;
      case 'hear': if (quiz) speakQ(quiz.items[quiz.i]); break;
      case 'opt': answerOpt(+b.dataset.i); break;
      case 'check': checkWritten(false); break; case 'skip': checkWritten(true); break;
      case 'adj': { const r = quiz && quiz.res[quiz.res.length - 1]; if (r) { r.got = Math.max(0, Math.min(r.max, Math.round((r.got + +b.dataset.d) * 2) / 2)); el('qAdj').textContent = r.got; } break; }
      case 'next': nextQ(); break;
      case 'retrywrong': { const items = quizRetry.slice(); closeOv(); startQuiz({ items, kind: 'retry' }); break; }
      case 'replan': closeOv(); makePlan(true); goTab('plan'); break;
      case 'pkey': if (window.__paper) { window.__paper.key = !window.__paper.key; el('paperBox').innerHTML = paperHtml(window.__paper.paper, window.__paper.co, window.__paper.key); } break;
      case 'pprint': printPaper(); break;
      case 'pcopy': { const p = window.__paper; if (p) { const t = el('paperBox').innerText; try { navigator.clipboard.writeText(t); toastS(_t('Copy हो गया')); } catch (er) { } } break; }
      case 'pexam': { const p = window.__paper; if (p) { const items = []; p.paper.sections.forEach(s => s.items.forEach(q => { q.course = p.co.id; items.push(q); })); startQuiz({ items, kind: 'paper', timed: true, exam: true }); } break; }
      case 'rd-play': readAloud(); break;
      case 'rd-stop': if (reader) reader.reading = false; stopSpeaking(); break;
      case 'rd-explain': explainSimply(); break;
      case 'rd-done': { if (reader) { reader.ch.studied = Date.now(); reader.co.updatedAt = Date.now(); const co = reader.co; closeReader(); if (readerTask) { completeTask(readerTask); readerTask = null; } save(); closeOv(); confetti(60); teach(_t2('{0}, अच्छा। यह chapter पूरा हुआ। अब इस पर कुछ सवाल हल कीजिए।', [tName()], '{0}, good. This chapter is done. Now solve a few questions on it.', [tName()])); refreshAll(); } break; }
      case 'rd-quiz': { if (reader) { const co = reader.co, ch = reader.ch; closeReader(); closeOv(); QS.course = co.id; QS.chs = new Set([ch.id]); QS.kind = '1'; goTab('quiz'); } break; }
      case 'rd-cards': { if (reader) { const co = reader.co, ch = reader.ch; closeReader(); closeOv(); startCards({ course: co.id, chapter: ch.id }); } break; }
      case 'cstudy': startCards({ course: b.dataset.id || null }); break;
      case 'cmore': { const co = courseById(b.dataset.id); if (co) { const n = genCardsFor(co); save(); renderCards(); toastS(n ? _t('{0} नए cards बने', [n]) : _t('और नए cards नहीं बन सके')); } break; }
      case 'cflip': flipCard(); break;
      case 'chear': { const c = deck && cardOf(deck.ids[deck.i]); if (c) say((deck.flipped ? c.back : c.front).replace(/_____/g, _t('खाली जगह')), { mood: 'gentle', interrupt: true }); break; }
      case 'crate': rateCard(+b.dataset.q); break;
      case 'psave': {
        const p = S.settings.splan, v = i => el(i).value; if (v('pFrom') >= v('pTo')) { toastS(_t('खत्म होने का समय शुरू से बाद का होना चाहिए')); break; }
        p.from = v('pFrom'); p.to = v('pTo'); p.session = +v('pSess'); S.settings.sgoal = +v('pGoal'); const days = [...document.querySelectorAll('#pDays .s-chip.on')].map(x => +x.dataset.d); p.days = days.length ? days : [0, 1, 2, 3, 4, 5, 6]; S.settings.splan = Object.assign({}, p); save(); makePlan(true); break;
      }
      case 'pnew': { const co = el('pnCo').value, at = el('pnAt').value; if (!co || !at) { toastS(_t('course और समय चुनिए')); break; } const cc = courseById(co), when = new Date(at).getTime(); if (when <= Date.now()) { toastS(_t('आगे का समय चुनिए')); break; } const st = stats().filter(x => x.course === co).sort((x, y) => (x.acc == null ? 0.5 : x.acc) - (y.acc == null ? 0.5 : y.acc))[0]; S.tasks.push(taskFrom({ id: 'p' + uid(), at: when, min: S.settings.splan.session, course: co, ch: st ? st.ch : null, kind: st && st.level === 'new' ? 'read' : 'quiz', title: cc.name + (st ? ' — ' + st.title : ''), auto: false })); save(); render(); renderPlan(); break; }
      case 'pdel': if (row) { const t = S.tasks.find(x => x.id === row.dataset.task); if (t) { S.tasks = S.tasks.filter(x => x !== t); save(); render(); renderPlan(); renderSHome(); } } break;
    }
  }
  document.addEventListener('click', onClick);
  document.addEventListener('change', e => {
    const t = e.target;
    if (t.classList && t.classList.contains('qch')) { if (t.checked) QS.chs.add(t.value); else QS.chs.delete(t.value); }
    else if (t.id === 'qTimed') QS.timed = t.checked;
    else if (t.id === 'pAuto') { S.settings.sauto = t.checked; save(); if (t.checked) makePlan(true); renderPlan(); }
  });
  document.addEventListener('click', e => { const c = e.target.closest('#pDays .s-chip'); if (c) c.classList.toggle('on'); });
  document.addEventListener('click', e => {                       // sign-up type chooser (start screen + Settings)
    const m = e.target.closest('[data-mode]'); if (!m || !m.dataset.mode || !m.closest('#modeBox,#setModeCard')) return;
    const was = S.settings.mode; chooseMode(m.dataset.mode);
    if (!el('app').hidden) { applyMode(); if (m.dataset.mode === 'student') onboard(); else if (m.dataset.mode === 'kids' && window.PiyuKids) { PiyuKids.prev = was; PiyuKids.onboard(); } }
    else { document.body.dataset.mode = m.dataset.mode; if (m.dataset.mode === 'student') mountFX(); if (m.dataset.mode === 'kids' && window.PiyuKids) PiyuKids.prev = was; }
  });
  document.addEventListener('click', e => { if (!e.target.closest('#kParentSwitch button') || !window.PiyuKids) return; PiyuKids.askPin(_t('पैरेंट PIN डालिए'), () => { window.__kidsChooser = true; loginUI(); }); });
  document.addEventListener('input', e => { if (e.target.id === 'setSName') { S.settings.sname = e.target.value.trim(); save(); } });
  document.addEventListener('click', e => { if (e.target.id === 'gearBtn' || e.target.closest('#gearBtn')) goTab('set'); if (e.target.id === 'setSProfile') openSignup(true); });

  /* ---------------- glue with app.js ---------------- */
  function refreshAll() { renderSHome(); renderCourses(); renderQuizHome(); renderCards(); renderPlan(); }
  function onTab(n) {
    if (isKid() && window.PiyuKids) { PiyuKids.onTab(n); return; }
    if (!isStu()) return;
    if (n === 'shome') renderSHome(); else if (n === 'courses') renderCourses(); else if (n === 'quiz') renderQuizHome(); else if (n === 'cards') renderCards(); else if (n === 'plan') renderPlan();
  }
  function rerender() { if (isKid() && window.PiyuKids) { buildNav(); const a = (document.querySelector('.tab.active') || {}).id; if (a) onTab(a.replace('tab-', '')); if (window.PiyuKidsParent) PiyuKidsParent.redraw(); PiyuKids.renderAll(); } else if (isStu()) { buildNav(); const a = (document.querySelector('.tab.active') || {}).id; if (a) onTab(a.replace('tab-', '')); } refreshModeUI(); }
  window.PiyuStudent = { fx: { confetti, countUp, ring, animateRings, bar }, ensureMode, applyMode, chooseMode, loginUI, onboard, onTab, rerender, autoTick, isStu, openSignup, studentMemory, makePlan, startQuiz, startCards, QS };
  storeReady.then(() => { ensure(); loginUI(); });
})();
