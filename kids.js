/* Piyu Kids mode — core: account type, sign-up (parent sets it up), the child's day (routine alarms, stars, levels, badges, avatar), Parent PIN, screen-time lock, SOS.
   Everything runs on the phone and is free; only the profile, routine, progress events and (with consent) location go to the Piyu server so a parent's phone can see them.
   Other parts: kidsplay.js (lessons, games, stories), kidsparent.js (parent panel, family link, safety), kidsmap.js (radar + OpenStreetMap), kidsdata.js (content). */
(function () {
  'use strict';
  const D = window.PiyuKidsData;
  const el = id => document.getElementById(id);
  const isKid = () => S.settings.mode === 'kids';
  const pad2 = n => String(n).padStart(2, '0');
  const dkey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate()); };
  const hm = ts => { const d = new Date(ts); return pad2(d.getHours()) + ':' + pad2(d.getMinutes()); };
  const toMin = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(s || ''); return m ? +m[1] * 60 + +m[2] : 0; };
  const DEF_ROUTINE = () => [
    ['wake', '🌅', _t('उठ जाओ'), '06:30', [0, 1, 2, 3, 4, 5, 6]], ['brush', '🪥', _t('ब्रश करो'), '06:45', [0, 1, 2, 3, 4, 5, 6]], ['food', '🥣', _t('नाश्ता करो'), '07:15', [0, 1, 2, 3, 4, 5, 6]], ['school', '🎒', _t('स्कूल जाओ'), '07:45', [1, 2, 3, 4, 5, 6]],
    ['home', '✏️', _t('होमवर्क करो'), '17:00', [0, 1, 2, 3, 4, 5, 6]], ['play', '⚽', _t('खेलो'), '18:00', [0, 1, 2, 3, 4, 5, 6]], ['dinner', '🍛', _t('खाना खाओ'), '20:00', [0, 1, 2, 3, 4, 5, 6]], ['sleep', '🌙', _t('सो जाओ'), '21:00', [0, 1, 2, 3, 4, 5, 6]]
  ].map(([id, icon, title, time, days]) => ({ id, icon, title, time, days, on: true }));
  const FX = () => (window.PiyuStudent && PiyuStudent.fx) || { confetti() { }, countUp(n, v) { if (n) n.textContent = v; }, ring: () => '', animateRings() { }, bar: () => '' };

  /* ---------------- the child's data (kept in settings, so it is saved and synced like everything else) ---------------- */
  function K() {
    const s = S.settings; if (!s.kid) s.kid = {};
    const k = s.kid;
    const d = { name: '', age: 8, cls: '', avatar: '🦁', pmobile: '', stars: 0, spent: 0, own: [], wear: {}, badges: [], day: {}, lessons: {}, stories: {}, games: {}, q: [], clang: '', limit: 90, bed: { from: '21:00', to: '06:30' }, places: [], consent: false, extra: {}, hist: [] };
    Object.keys(d).forEach(x => { if (k[x] == null) k[x] = d[x]; });
    if (!k.routine) k.routine = DEF_ROUTINE();
    return k;
  }
  const dayRec = (k, key) => { key = key || dkey(Date.now()); return k.day[key] || (k.day[key] = { r: 0, l: 0, g: 0, s: 0, m: 0, st: 0 }); };
  function prune(k) {
    const keys = Object.keys(k.day).sort(); while (keys.length > 45) delete k.day[keys.shift()];
    if (k.q.length > 300) k.q = k.q.slice(-300);
    if (k.hist.length > 60) k.hist = k.hist.slice(-60);
  }
  const balance = k => Math.max(0, k.stars - k.spent);
  const level = k => Math.min(D.LEVELS.length, 1 + Math.floor(k.stars / D.STAR_PER_LEVEL));
  const lvInfo = k => { const l = level(k), top = l >= D.LEVELS.length, into = k.stars - (l - 1) * D.STAR_PER_LEVEL; return { l, name: _t(D.LEVELS[l - 1][1]), en: D.LEVELS[l - 1][2], e: D.LEVELS[l - 1][0], frac: top ? 1 : Math.min(1, into / D.STAR_PER_LEVEL), left: top ? 0 : D.STAR_PER_LEVEL - into }; };
  function streak(k) {
    let n = 0; const d = new Date(), key = x => dkey(x);
    const act = r => r && (r.r || r.l || r.g || r.s);
    if (!act(k.day[key(d)])) d.setDate(d.getDate() - 1);
    while (act(k.day[key(d)])) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  /* the language the lessons / stories are taught in */
  const clang = () => { const k = K(); return k.clang === 'en' ? 'en' : k.clang === 'hi' ? 'hi' : (S.settings.lang === 'en' ? 'en' : 'hi'); };
  const nm = () => (K().name || '').trim() || _t('दोस्त');

  /* ---------------- events for the parent's report (queued, sent in the background) ---------------- */
  function ev(kind, data) { const k = K(); k.q.push({ kind, at: Date.now(), data: data || {} }); prune(k); save(); setTimeout(flush, 1500); }
  let flushing = false;
  async function flush() {
    const k = K(); if (flushing || !k.q.length || !k.srv) return; flushing = true;
    try { const batch = k.q.slice(0, 100); const r = await api('/api/kids/events', { events: batch }); if (r.ok) { k.q = k.q.slice(batch.length); save(); } } catch (e) { } flushing = false;
  }
  async function api(path, body, method) {
    const o = { method: method || (body ? 'POST' : 'GET'), headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()) };
    if (body) o.body = JSON.stringify(body);
    try { const r = await fetch(U(path), o); let j = {}; try { j = await r.json(); } catch (e) { } return { ok: r.ok, status: r.status, j }; } catch (e) { return { ok: false, status: 0, j: {} }; }
  }

  /* ---------------- voice: soft by default, cheerful for games, story-teller for stories ---------------- */
  const kSay = (text, style, mood) => { if (!text) return; window.__kidStyle = style || 'soft'; say(text, { mood: mood || 'cheerful', interrupt: true }); };

  /* ---------------- rewards ---------------- */
  function addStars(n, why, from) {
    const k = K(); n = Math.max(0, Math.round(n)); if (!n) return;
    const before = level(k); k.stars += n; dayRec(k).st += n; ev('star', { n, why: why || '' });
    save(); starFly(n, from); refreshBars();
    const after = level(k); if (after > before) setTimeout(() => levelUp(after), 900);
    checkBadges();
  }
  function starFly(n, from) {
    const tgt = el('kStarCnt'); if (!tgt) return;
    from = from || window.__kFrom; window.__kFrom = null;
    const r = tgt.getBoundingClientRect(), sx = from ? from.x : innerWidth / 2, sy = from ? from.y : innerHeight * 0.55;
    for (let i = 0; i < Math.min(8, 2 + n * 2); i++) {
      const s = document.createElement('i'); s.className = 'k-flystar'; s.textContent = '⭐'; s.style.left = sx + 'px'; s.style.top = sy + 'px'; document.body.appendChild(s);
      const dx = r.left + r.width / 2 - sx, dy = r.top + r.height / 2 - sy, jx = (Math.random() - 0.5) * 120, jy = -60 - Math.random() * 80;
      s.animate([{ transform: 'translate(0,0) scale(.4)', opacity: 0 }, { transform: `translate(${jx}px,${jy}px) scale(1.4)`, opacity: 1, offset: 0.35 }, { transform: `translate(${dx}px,${dy}px) scale(.5)`, opacity: 0.9 }], { duration: 900 + i * 70, easing: 'cubic-bezier(.4,0,.2,1)', delay: i * 60, fill: 'forwards' }).onfinish = () => s.remove();
    }
    const c = el('kStarChip'); if (c) { c.classList.remove('pop'); void c.offsetWidth; c.classList.add('pop'); }
    sfx('star');
  }
  /* a celebration card that floats over whatever is on screen (never replaces a result / lesson screen) */
  function popup(emoji, title, sub) {
    const d = document.createElement('div'); d.className = 'k-popup'; d.innerHTML = '<div class="k-popup-e">' + emoji + '</div><div><b>' + esc(title) + '</b>' + (sub ? '<small>' + esc(sub) + '</small>' : '') + '</div>';
    document.body.appendChild(d); d.onclick = () => d.remove(); setTimeout(() => { d.classList.add('out'); setTimeout(() => d.remove(), 400); }, 3800);
  }
  function levelUp(l) {
    const k = K(), li = lvInfo(k); FX().confetti(180); sfx('win');
    popup(li.e, _t('लेवल {0}!', [l]) + ' ' + li.name, _t('शाबाश! आप ऊपर चढ़ रहे हो'));
    kSay(_t2('शाबाश {0}! आप लेवल {1} पर पहुँच गए — {2}।', [nm(), l, li.name], 'Well done {0}! You reached level {1} — {2}.', [nm(), l, li.en]), 'cheerful');
  }
  function checkBadges() {
    const k = K(), have = new Set(k.badges), now = [];
    const tot = f => Object.values(k.day).reduce((a, r) => a + (r[f] || 0), 0);
    const lessons = Object.values(k.lessons).filter(x => x.done).length, stories = Object.values(k.stories).filter(x => x.n).length;
    const sched = todayList(), allDone = sched.length >= 3 && sched.every(x => x.done);
    const T = {
      first: k.stars >= 1, stars50: k.stars >= 50, stars200: k.stars >= 200, streak3: streak(k) >= 3, streak7: streak(k) >= 7, perfect: allDone, learner: lessons >= 10, reader: stories >= 5,
      gamer: tot('g') >= 10, speaker: (k.extra.speakOk || 0) >= 5, helper: (k.extra.hw || 0) >= 3, shopper: k.own.length >= 3, lvl5: level(k) >= 5
    };
    Object.keys(T).forEach(id => { if (T[id] && !have.has(id)) now.push(id); });
    if (!now.length) return;
    now.forEach(id => k.badges.push(id)); k.stars += now.length * 2; save(); refreshBars();
    const b = D.BADGES.find(x => x.id === now[0]);
    setTimeout(() => { FX().confetti(120); sfx('win'); popup(b.e, _t('नया बैज!') + ' ' + (clang() === 'en' ? b.en : b.hi), _t('+2 स्टार बोनस')); kSay(_t2('वाह {0}! आपको नया बैज मिला।', [nm()], 'Wow {0}! You earned a new badge.', [nm()]), 'cheerful'); }, 900);
  }

  /* ---------------- tiny sounds (WebAudio, no files) ---------------- */
  function sfx(kind) {
    try {
      if (S.settings.vol === 0) return; const a = audio(); if (!a) return; const t = a.currentTime;
      const seq = { star: [[880, 0], [1320, 0.08]], win: [[523, 0], [659, 0.1], [784, 0.2], [1047, 0.3]], ok: [[660, 0], [880, 0.09]], bad: [[220, 0], [180, 0.12]], tap: [[600, 0]], pop: [[480, 0], [720, 0.05]] }[kind] || [];
      seq.forEach(([f, d]) => bellNote(f, t + d, kind === 'tap' ? 0.12 : 0.5, 0.16 * (S.settings.vol || 1)));
    } catch (e) { }
  }

  /* ---------------- today's routine ---------------- */
  function sched(k, day) {
    const wd = new Date(day).getDay();
    return (k.routine || []).filter(r => r.on !== false && (r.days || []).includes(wd)).sort((a, b) => toMin(a.time) - toMin(b.time));
  }
  function todayList() {
    const k = K(), now = Date.now(), key = dkey(now), done = (k.doneMap && k.doneMap[key]) || [], nowMin = new Date(now).getHours() * 60 + new Date(now).getMinutes();
    let nextSet = false;
    return sched(k, now).map(r => { const d = done.includes(r.id), t = toMin(r.time), st = d ? 'done' : (t + 20 < nowMin ? 'missed' : (!nextSet ? (nextSet = true, 'next') : 'later')); return Object.assign({}, r, { done: d, st, min: t }); });
  }
  const taskId = (r, key) => 'kr_' + r.id + '_' + key;
  /* alarms for today and tomorrow, made from the routine (the normal Piyu alarm engine rings them, also with the app closed) */
  function syncTasks() {
    if (!isKid()) return;
    const k = K(), now = Date.now(), want = new Map();
    [0, 1].forEach(off => {
      const d = new Date(); d.setDate(d.getDate() + off); d.setHours(0, 0, 0, 0);
      sched(k, d.getTime()).forEach(r => { const at = d.getTime() + toMin(r.time) * 60000; if (at > now - 60000) want.set(taskId(r, dkey(d.getTime())), { r, at }); });
    });
    let ch = false;
    S.tasks = S.tasks.filter(t => { if (!t.kid) return true; if (want.has(t.id) || t.done) return true; if (t.alarmAt < now) return true; ch = true; return false; });
    const have = new Set(S.tasks.map(t => t.id));
    want.forEach((w, id) => {
      if (have.has(id)) { const t = S.tasks.find(x => x.id === id); const title = w.r.icon + ' ' + w.r.title; if (t.alarmAt !== w.at || t.title !== title) { t.alarmAt = w.at; t.title = title; t.pre = false; t.fired = false; ch = true; } return; }
      S.tasks.push({ id, docId: null, title: w.r.icon + ' ' + w.r.title, text: w.r.title, section: '', alarmAt: w.at, done: false, pre: false, fired: false, missed: false, manual: true, priority: 2, preMin: 2, kid: { rid: w.r.id, key: dkey(w.at) } }); ch = true;
    });
    const old = Date.now() - 4 * 864e5; const n0 = S.tasks.length; S.tasks = S.tasks.filter(t => !(t.kid && t.alarmAt < old)); if (S.tasks.length !== n0) ch = true;
    if (ch) { save(); try { render(); } catch (e) { } }
  }
  function purgeTasks() { const n = S.tasks.length; S.tasks = S.tasks.filter(t => !t.kid); if (S.tasks.length !== n) { save(); try { render(); } catch (e) { } } }
  window.kidReminder = (t, kind, mins) => {
    const k = K(), r = (k.routine || []).find(x => x.id === (t.kid || {}).rid) || { title: t.text || t.title, icon: '' };
    if (kind === 'pre') return _t2('{0}, {1} मिनट बाद {2} का समय है। तैयार हो जाओ!', [nm(), mins, r.title], '{0}, in {1} minutes it is time to {2}. Get ready!', [nm(), mins, r.title]);
    return _t2('{0}, अब {1} का समय हो गया है। चलो, करो! करके स्टार कमाओ।', [nm(), r.title], '{0}, it is time now to {1}. Go on and earn a star!', [nm(), r.title]);
  };
  /* called by app.js markDone for a routine alarm */
  function onDone(t) {
    const k = K(), key = (t.kid && t.kid.key) || dkey(Date.now()); k.doneMap = k.doneMap || {};
    const arr = k.doneMap[key] || (k.doneMap[key] = []); if (arr.includes(t.kid.rid)) return; arr.push(t.kid.rid);
    const ks = Object.keys(k.doneMap).sort(); while (ks.length > 14) delete k.doneMap[ks.shift()];
    dayRec(k, key).r++; const r = (k.routine || []).find(x => x.id === t.kid.rid);
    ev('routine_done', { id: t.kid.rid, title: r ? r.title : '' });
    const early = Date.now() - t.alarmAt <= 20 * 60000; addStars(early ? 2 : 1, 'routine');
    FX().confetti(60); sfx('ok');
    const left = todayList().filter(x => !x.done).length;
    kSay(left ? _t2('शाबाश {0}! आपने {1} कर लिया।', [nm(), r ? r.title : ''], 'Well done {0}! You finished {1}.', [nm(), r ? r.title : '']) : _t2('वाह {0}! आज के सारे काम पूरे हो गए। आप सुपरस्टार हो!', [nm()], 'Wow {0}! All of today\'s tasks are done. You are a superstar!', [nm()]), 'cheerful');
    if (!left) { setTimeout(() => FX().confetti(200), 600); }
    save(); renderHome();
  }

  /* ---------------- full-screen overlay (own, so the student screens stay untouched) ---------------- */
  function ov(html, name, cls) {
    window.__ovTab = name || 'kids';
    let o = el('kOv'); if (!o) { document.body.insertAdjacentHTML('beforeend', '<div id="kOv" class="k-ov" hidden></div>'); o = el('kOv'); }
    o.className = 'k-ov ' + (cls || ''); o.innerHTML = '<div class="k-ovin">' + html + '</div>'; o.hidden = false; document.body.classList.add('ov-open'); o.scrollTop = 0; return o;
  }
  function closeOv() { window.__ovTab = ''; const o = el('kOv'); if (o) { o.hidden = true; o.innerHTML = ''; } document.body.classList.remove('ov-open'); try { stopSpeaking(); } catch (e) { } if (window.PiyuKids && PiyuKids.onClose) PiyuKids.onClose(); }

  /* ---------------- big number pad for the Parent PIN ---------------- */
  function pinPad(title, sub, cb, opts) {
    opts = opts || {}; let v = '';
    const o = ov('<div class="k-center k-pin"><button class="k-x" data-kact="pinx" aria-label="close">✕</button><div class="k-lock">🔒</div><h2>' + esc(title) + '</h2><p class="k-sub">' + esc(sub || '') + '</p><div class="k-dots"><i></i><i></i><i></i><i></i></div><div class="k-msg" id="kPinMsg"></div><div class="k-pad">' +
      [1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(n => n === '' ? '<span></span>' : '<button data-kpin="' + n + '">' + n + '</button>').join('') + '</div></div>', 'kpin', 'k-ov-solid');
    const dots = [...o.querySelectorAll('.k-dots i')];
    const draw = () => dots.forEach((d, i) => d.classList.toggle('on', i < v.length));
    const press = async n => {
      if (n === '⌫') v = v.slice(0, -1); else if (v.length < 4) v += n; draw(); sfx('tap');
      if (v.length === 4) { const r = await cb(v); if (r === true) return; el('kPinMsg') && (el('kPinMsg').textContent = typeof r === 'string' ? r : _t('PIN ग़लत है')); const dd = o.querySelector('.k-dots'); dd.classList.remove('shake'); void dd.offsetWidth; dd.classList.add('shake'); v = ''; setTimeout(draw, 250); }
    };
    o.onclick = e => { const b = e.target.closest('[data-kpin]'); if (b) press(b.dataset.kpin); else if (e.target.closest('[data-kact=pinx]')) { closeOv(); opts.onCancel && opts.onCancel(); } };
    window.__kidPinKey = e => { if (/^[0-9]$/.test(e.key)) press(e.key); else if (e.key === 'Backspace') press('⌫'); };
  }
  document.addEventListener('keydown', e => { if (window.__ovTab === 'kpin' && window.__kidPinKey) window.__kidPinKey(e); });
  let pinCache = null;      // the PIN stays in memory for 5 minutes after it was entered (to talk to the server inside the parent panel), never stored
  const pinFresh = () => pinCache && Date.now() - pinCache.at < 300000 ? pinCache.pin : null;
  const localHash = async p => sha('kid:' + p);
  async function verifyPin(p) {
    const h = S.settings.kidPin; if (!h) return null;           // no local PIN yet (cleared data): the server decides
    if ((await localHash(p)) === h) { pinCache = { pin: p, at: Date.now() }; return true; }
    return false;
  }
  /* ask for the Parent PIN; calls ok(pin) when right */
  function askPin(title, ok, onCancel) {
    pinPad(title || _t('पैरेंट PIN डालिए'), _t('यह सिर्फ़ मम्मी-पापा के लिए है'), async p => {
      let r = await verifyPin(p);
      if (r === null) { const x = await api('/api/kids/verify', { pin: p }); r = x.ok ? true : (x.status === 429 ? _t('बहुत ग़लत कोशिशें — थोड़ी देर बाद') : false); if (r === true) { S.settings.kidPin = await localHash(p); save(); pinCache = { pin: p, at: Date.now() }; } }
      if (r === true) { closeOv(); ok(p); return true; }
      return r;
    }, { onCancel });
  }

  /* ---------------- account type: Kids joins the chooser ---------------- */
  function navItems() { return [['khome', '🏡', _t('आज')], ['klearn', '📚', _t('सीखो')], ['kplay', '🎮', _t('खेलो')], ['kstory', '📖', _t('कहानी')], ['kstars', '🌟', _t('मेरे स्टार')]]; }
  function setup() { document.body.dataset.mode = 'kids'; }
  const TABS = ['khome', 'klearn', 'kplay', 'kstory', 'kstars'];
  let timers = [];
  function enter() {
    const k = K(); document.body.dataset.mode = 'kids';
    const tc = document.querySelector('meta[name=theme-color]'); if (tc) tc.content = '#2a1458';
    mountScene(); mountSos(); mountBadge();
    syncTasks(); timers.forEach(clearInterval);
    timers = [setInterval(minuteTick, 30000), setInterval(syncTasks, 600000), setInterval(pullMe, 60000), setInterval(flush, 60000)];
    setTimeout(() => { pullMe(); flush(); minuteTick(); locApply(); avLoadStatus(); }, 1200);
    if (!k.ready) setTimeout(onboard, 400);
  }
  function leave() {
    timers.forEach(clearInterval); timers = []; const s = el('kSos'); if (s) s.remove(); const sc = el('kScene'); if (sc) sc.remove(); const b = el('kBadge'); if (b) b.remove(); const l = el('kLock'); if (l) l.remove();
    const avb = el('kAvBanner'); if (avb) avb.remove(); avStopAll();
    purgeTasks(); try { locStop(); } catch (e) { }
  }
  function mountScene() {
    if (el('kScene')) return;
    const d = document.createElement('div'); d.id = 'kScene'; d.className = 'k-scene'; d.setAttribute('aria-hidden', 'true');
    const sh = ['⭐', '☁️', '🎈', '🦋', '🌈', '✨', '🌸', '🪁']; let h = '';
    for (let i = 0; i < 14; i++) h += `<i style="left:${Math.round(Math.random() * 96)}%;animation-duration:${16 + Math.random() * 20}s;animation-delay:${-Math.random() * 30}s;font-size:${16 + Math.round(Math.random() * 22)}px">${sh[i % sh.length]}</i>`;
    d.innerHTML = h; document.body.appendChild(d);
  }
  function mountBadge() {
    if (el('kBadge')) return;
    const b = document.createElement('div'); b.id = 'kBadge'; b.className = 'k-locbadge'; b.hidden = true; b.innerHTML = '<span class="k-dotp"></span>' + esc(_t('📍 लोकेशन चालू')); document.body.appendChild(b);
    b.onclick = () => toast(_t('मम्मी-पापा आपकी सुरक्षा के लिए देख सकते हैं कि आप कहाँ हैं।'));
  }
  function mountSos() {
    if (el('kSos')) return;
    const b = document.createElement('button'); b.id = 'kSos'; b.className = 'k-sos'; b.type = 'button'; b.innerHTML = '🆘<small>SOS</small>'; b.setAttribute('aria-label', 'SOS'); document.body.appendChild(b);
    b.onclick = () => openSos();
  }
  function refreshBars() { const k = K(); const c = el('kStarCnt'); if (c) c.textContent = balance(k); const s = el('kStreakCnt'); if (s) s.textContent = streak(k); }

  /* ---------------- SOS ---------------- */
  function openSos() {
    const k = K(); let n = 5, t;
    ov('<div class="k-center k-sosbox"><div class="k-burst red">🆘</div><h2>' + esc(_t('मदद चाहिए?')) + '</h2><p class="k-sub">' + esc(_t('कुछ सेकंड में मम्मी-पापा को आपकी लोकेशन के साथ संदेश चला जाएगा।')) + '</p><div class="k-count" id="kSosN">' + n + '</div>' +
      '<button class="k-btn red" data-kact="sosnow">' + esc(_t('अभी भेजो')) + '</button>' + (k.pmobile ? '<a class="k-btn green" href="tel:' + esc(k.pmobile) + '">📞 ' + esc(_t('फ़ोन करो')) + '</a>' : '') + '<button class="k-btn ghost" data-kact="sosno">' + esc(_t('नहीं, सब ठीक है')) + '</button></div>', 'ksos', 'k-ov-solid red');
    sfx('bad'); try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { }
    t = setInterval(() => { n--; const x = el('kSosN'); if (x) x.textContent = n; if (n <= 0) { clearInterval(t); sendSos(); } }, 1000);
    window.__kSosT = t; kSay(_t2('अगर मदद चाहिए तो रुकिए मत। मैं मम्मी-पापा को बता रही हूँ।', [], 'If you need help, do not worry. I am telling your parents.', []), 'soft', 'gentle');
  }
  async function sendSos() {
    clearInterval(window.__kSosT); const k = K(); let pos = null;
    try { pos = await getPos(8000); } catch (e) { }
    const r = await api('/api/kids/sos', pos ? { lat: pos.lat, lng: pos.lng } : {});
    ev('mood', { sos: 1 });
    const tel = k.pmobile ? '<a class="k-btn green" href="tel:' + esc(k.pmobile) + '">📞 ' + esc(_t('फ़ोन करो')) + '</a>' : '';
    ov('<div class="k-center"><div class="k-burst">' + (r.ok ? '✅' : '⚠️') + '</div><h2>' + esc(r.ok ? _t('संदेश भेज दिया गया') : _t('इंटरनेट नहीं है')) + '</h2><p class="k-sub">' + esc(r.ok ? _t('मम्मी-पापा को पता चल गया है। शांत रहिए, वे आपसे बात करेंगे।') : _t('फ़ोन कीजिए या किसी बड़े से मदद माँगिए।')) + '</p>' + tel + '<button class="k-btn" data-kact="closeov">' + esc(_t('ठीक है')) + '</button></div>', 'ksos', 'k-ov-solid');
  }

  /* ---------------- where am I (browser / app) ---------------- */
  function getPos(ms) {
    return new Promise(async (res, rej) => {
      if (window.PiyuNative && PiyuNative.locOnce && isNativeApp()) { const p = await PiyuNative.locOnce(); if (p && p.lat != null) return res(p); }
      if (!navigator.geolocation) return rej(new Error('nogeo'));
      navigator.geolocation.getCurrentPosition(p => res({ lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: p.timestamp }), rej, { enableHighAccuracy: true, timeout: ms || 12000, maximumAge: 30000 });
    });
  }
  /* ---------------- location sharing on the child's phone (only while the parent has it ON) ---------------- */
  let watchId = null, lastPost = 0;
  async function locApply() {
    const k = K(); const on = isKid() && k.consent;
    const b = el('kBadge'); if (b) b.hidden = !on;
    if (!on) { locStop(); return; }
    if (isNativeApp() && PiyuNative.famAvail) {
      await PiyuNative.famStart({ server: serverBase(), token: S.settings.token || '', device: DEVICE, loc: true, alerts: false, every: (k.cfg && k.cfg.loc_every) || 2, msgSince: k.msgSince || 0,
        locTitle: _t('📍 लोकेशन शेयरिंग चालू है'), locText: _t('आपके मम्मी-पापा देख सकते हैं कि आप कहाँ हैं'), msgTitle: _t('💌 मम्मी-पापा का संदेश') });
      return;
    }
    if (watchId != null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(p => {
      const every = (((k.cfg && k.cfg.loc_every) || 2) * 60000) - 4000; if (Date.now() - lastPost < every) return; lastPost = Date.now();
      api('/api/kids/loc', { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy, at: p.timestamp });
    }, () => { }, { enableHighAccuracy: true, maximumAge: 60000, timeout: 60000 });
  }
  function locStop() {
    if (watchId != null) { try { navigator.geolocation.clearWatch(watchId); } catch (e) { } watchId = null; }
    if (isNativeApp() && PiyuNative.famAvail && !(S.settings.family && S.settings.family.on)) PiyuNative.famStop();
    else if (isNativeApp() && PiyuNative.famAvail) PiyuNative.famStart({ server: serverBase(), token: S.settings.token || '', device: DEVICE, loc: false, alerts: true });
  }
  /* turn sharing on/off (called with the verified PIN): asks the phone for permission first */
  async function setConsent(on, pin) {
    const k = K();
    if (on) {
      let perm = true;
      if (isNativeApp() && PiyuNative.famAvail) {
        let p = await PiyuNative.ask('loc'); perm = p && p.loc === 'granted';
        if (perm) { const q = await PiyuNative.ask('bgloc'); if (q && q.bgloc !== 'granted') toast(_t('बेहतर काम के लिए Settings में लोकेशन "हमेशा" चुनिए')); }
      } else { try { await getPos(15000); } catch (e) { perm = false; } }
      if (!perm) return { ok: false, why: 'perm' };
    }
    const r = await api('/api/kids/consent', { pin, on });
    if (!r.ok && r.status !== 0) return { ok: false, why: r.j.error || 'server' };
    k.consent = !!on; k.consentAt = on ? Date.now() : 0; save(); locApply(); refreshSafety(); return { ok: true, offline: r.status === 0 };
  }
  function refreshSafety() { const b = el('kBadge'); if (b) b.hidden = !(isKid() && K().consent); }

  /* ---------------- live mic/camera: OFF by default; the CHILD turns it on, nobody else. A parent can only ever watch while it is on, and the
     instant anyone is actually watching, this screen shows a big, impossible-to-miss red notice with a one-tap stop. Nothing is ever recorded. */
  const AV = { feature: false, agreed: false, on: { mic: false, cam: false }, mic: false, cam: false, pollT: null, micRec: null, micStream: null, camStream: null, camVideo: null, camT: null };
  async function avLoadStatus() {
    if (!isKid() || !K().ready) return;
    const a = await api('/api/kids/av/agreement');
    if (a.ok) { AV.feature = !!a.j.avFeature; AV.agreed = !!a.j.agreed; }
    if (!AV.feature) { avStopAll(); return; }
    const r = await api('/api/kids/av');
    if (r.ok) {
      AV.on = { mic: !!r.j.mic.on, cam: !!r.j.cam.on };
      ['mic', 'cam'].forEach(kind => { const live = !!r.j[kind].live; if (live && !AV[kind]) avStart(kind); else if (!live && AV[kind]) avStop(kind); });
    }
    avSchedulePoll();
  }
  function avSchedulePoll() {
    clearTimeout(AV.pollT);
    if (isKid() && AV.feature && (AV.on.mic || AV.on.cam) && !document.hidden) AV.pollT = setTimeout(avLoadStatus, 3000);
  }
  function avBlobToB64(blob) { return new Promise((res, rej) => { const r = new FileReader(); r.onloadend = () => res(String(r.result).split(',')[1] || ''); r.onerror = rej; r.readAsDataURL(blob); }); }
  async function avStart(kind) {
    if (AV[kind] || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) return;
    try {
      if (kind === 'mic') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true }); AV.micStream = stream;
        const mime = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus'].find(m => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || '';
        const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined); AV.micRec = rec;
        rec.ondataavailable = async ev => { if (ev.data && ev.data.size && AV.mic) api('/api/kids/av/push', { kind: 'mic', data: await avBlobToB64(ev.data), mime: rec.mimeType || 'audio/webm' }); };
        rec.start(1200);
      } else {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 160 }, height: { ideal: 120 } } }); AV.camStream = stream;
        const v = document.createElement('video'); v.srcObject = stream; v.muted = true; v.playsInline = true; try { await v.play(); } catch (e) { } AV.camVideo = v;
        const c = document.createElement('canvas'); c.width = 160; c.height = 120; const cx = c.getContext('2d');
        AV.camT = setInterval(() => { if (!AV.cam || !v.videoWidth) return; cx.drawImage(v, 0, 0, c.width, c.height); api('/api/kids/av/push', { kind: 'cam', data: c.toDataURL('image/jpeg', 0.45).split(',')[1], mime: 'image/jpeg' }); }, 1000);
      }
      AV[kind] = true; avBannerUpdate();
    } catch (e) { /* permission denied or no camera/mic: stay off, no crash */ }
  }
  function avStop(kind) {
    if (!AV[kind]) return; AV[kind] = false;
    if (kind === 'mic') { try { AV.micRec && AV.micRec.state !== 'inactive' && AV.micRec.stop(); } catch (e) { } try { AV.micStream && AV.micStream.getTracks().forEach(t => t.stop()); } catch (e) { } AV.micRec = AV.micStream = null; }
    else { clearInterval(AV.camT); try { AV.camStream && AV.camStream.getTracks().forEach(t => t.stop()); } catch (e) { } AV.camT = AV.camVideo = AV.camStream = null; }
    avBannerUpdate();
  }
  function avStopAll() { avStop('mic'); avStop('cam'); clearTimeout(AV.pollT); }
  function avBannerUpdate() {
    let b = el('kAvBanner');
    if (!AV.mic && !AV.cam) { if (b) b.hidden = true; return; }
    if (!b) { b = document.createElement('div'); b.id = 'kAvBanner'; b.className = 'k-avbanner'; document.body.appendChild(b); }
    const txt = AV.mic && AV.cam ? _t('🔴 अभी मम्मी-पापा आपको देख और सुन रहे हैं') : AV.cam ? _t('🔴 अभी मम्मी-पापा आपको देख रहे हैं') : _t('🔴 अभी मम्मी-पापा आपकी आवाज़ सुन रहे हैं');
    b.innerHTML = '<span class="k-avdot"></span><b>' + esc(txt) + '</b><button type="button" data-kact="avstopall">' + esc(_t('रोको')) + '</button>'; b.hidden = false;
  }
  async function avStopAllByChild() {
    const wasMic = AV.mic, wasCam = AV.cam; avStopAll();
    if (wasMic) await api('/api/kids/av', { mic: false });
    if (wasCam) await api('/api/kids/av', { cam: false });
    AV.on = { mic: false, cam: false }; toast(_t('बंद कर दिया ✅')); if (window.__ovTab === 'kav') drawAvSettings();
  }
  async function avSetToggle(kind, on) {
    const body = {}; body[kind] = on; const r = await api('/api/kids/av', body);
    if (r.ok) { AV.on[kind] = on; if (!on) avStop(kind); avSchedulePoll(); drawAvSettings(); } else toast(_t('अभी नहीं हो पाया — इंटरनेट देखिए'));
  }
  function openAvSettings() { drawAvSettings(); avLoadStatus().then(drawAvSettings); }
  function drawAvSettings() {
    if (!AV.feature) {
      ov('<div class="k-center"><div class="k-burst">🎙️</div><h2>' + esc(_t('मम्मी-पापा को ज़रूरत पड़ने पर सुनने/देखने दें')) + '</h2>' +
        '<p class="k-sub">' + esc(_t('यह बिल्कुल आपकी अपनी मर्ज़ी है, कोई मजबूरी नहीं। चालू करने पर आप मम्मी-पापा को, सिर्फ़ ज़रूरत के वक़्त, अपनी आवाज़ या तस्वीर दिखा सकते हैं। जब भी वे सुन/देख रहे हों, आपकी स्क्रीन पर हमेशा एक बड़ा लाल निशान दिखेगा, और आप कभी भी एक टैप से रोक सकते हैं। कुछ भी रिकॉर्ड नहीं होता।')) + '</p>' +
        (AV.agreed ? '<p class="k-sub">' + esc(_t('आपने सहमति दे दी है। Piyu चलाने वाले से बात होने के बाद यह चालू होगा।')) + '</p><button class="k-btn ghost" data-kact="closeov">' + esc(_t('ठीक है')) + '</button>'
          : '<button class="k-btn" data-kact="avagree">' + esc(_t('मैं समझता/समझती हूँ, आगे बढ़ो')) + '</button><button class="k-btn ghost" data-kact="closeov">' + esc(_t('अभी नहीं')) + '</button>') + '</div>', 'kav', 'k-ov-solid');
      return;
    }
    const row = (kind, icon, label) => '<div class="k-card k-consentcard ' + (AV.on[kind] ? 'on' : '') + '"><div class="k-conrow"><div><b>' + icon + ' ' + esc(label) + '</b><small>' + (AV.on[kind] ? esc(_t('चालू — ज़रूरत पड़ने पर मम्मी-पापा सुन/देख सकते हैं')) : esc(_t('बंद — कोई नहीं सुन/देख सकता'))) + '</small></div><button class="k-switch ' + (AV.on[kind] ? 'on' : '') + '" data-kact="avtoggle" data-kind="' + kind + '" data-on="' + (AV.on[kind] ? 0 : 1) + '" aria-label="toggle"><i></i></button></div></div>';
    ov('<div class="k-center" style="text-align:left"><h2 style="text-align:center">' + esc(_t('मम्मी-पापा को सुनने/देखने दें')) + '</h2>' +
      '<p class="k-sub" style="text-align:center">' + esc(_t('यह फ़ैसला सिर्फ़ आपका है। चालू होने पर भी, सुनने/देखने के वक़्त हमेशा एक बड़ा लाल निशान दिखेगा।')) + '</p>' +
      row('mic', '🎤', _t('आवाज़ (Mic)')) + row('cam', '📷', _t('कैमरा')) +
      '<button class="k-btn ghost" data-kact="closeov" style="margin-top:10px">' + esc(_t('बंद करें')) + '</button></div>', 'kav', 'k-ov-parent');
  }

  /* ---------------- server sync: profile, parent's routine, parent's messages, consent ---------------- */
  async function pullMe() {
    if (!isKid()) return; const k = K();
    const r = await api('/api/kids/me');
    if (r.ok && r.j.profile) {
      k.srv = true; const cfg = r.j.config || {}; const old = JSON.stringify(k.routine) + k.limit + JSON.stringify(k.bed);
      k.cfg = cfg; if (Array.isArray(cfg.routine) && cfg.routine.length) k.routine = cfg.routine; if (cfg.limit_min != null) k.limit = cfg.limit_min; if (cfg.bed) k.bed = cfg.bed; if (Array.isArray(cfg.places)) k.places = cfg.places;
      k.parents = r.j.parents || 0; const cons = !!r.j.profile.consent; if (cons !== !!k.consent) { k.consent = cons; locApply(); }
      if (old !== JSON.stringify(k.routine) + k.limit + JSON.stringify(k.bed)) { save(); syncTasks(); renderHome(); }
      flush();
    } else if (r.ok && !r.j.profile && k.ready) { pushProfile(); }
    const m = await api('/api/kids/msgs?since=' + (k.msgSince || 0));
    if (m.ok && (m.j.msgs || []).length) {
      m.j.msgs.forEach(x => { k.msgSince = Math.max(k.msgSince || 0, x.id); toast('💌 ' + x.text); kSay(_t2('{0}, मम्मी-पापा का संदेश: {1}', [nm(), x.text], '{0}, a message from your parent: {1}', [nm(), x.text]), 'soft', 'gentle'); k.hist.push({ at: x.at, msg: x.text }); });
      save(); if (!document.hidden && window.__ovTab === '') renderHome();
    }
  }
  async function pushProfile() {
    const k = K(); const pin = S.settings.kidPendingPin || pinFresh();
    const r = await api('/api/kids/profile', { name: k.name, age: k.age, cls: k.cls, avatar: k.avatar, newPin: pin || undefined, pin: pinFresh() || undefined });
    if (r.ok) { k.srv = true; S.settings.kidPendingPin = ''; save(); const c = r.j.config; if (c && c.routine && !k.routineEdited) { k.cfg = c; } if (k.routineEdited || !k.cfg) pushConfig(); }
  }
  async function pushConfig() {
    const k = K(), pin = pinFresh() || S.settings.kidPendingPin; if (!pin) return;
    const r = await api('/api/kids/config', { pin, config: { routine: k.routine, limit_min: k.limit, bed: k.bed, places: k.places } });
    if (r.ok) { k.cfg = r.j.config; k.routineEdited = false; save(); }
  }

  /* ---------------- minute tick: time spent, limit, bedtime ---------------- */
  let tickLast = Date.now();
  function minuteTick() {
    if (!isKid()) return; const k = K(), now = Date.now(), dt = Math.min(60, (now - tickLast) / 1000); tickLast = now;
    if (document.visibilityState === 'visible' && !el('kLock')) { dayRec(k).m += dt / 60; k.sessAcc = (k.sessAcc || 0) + dt / 60; }
    if (k.sessAcc >= 5) { ev('session', { min: Math.round(k.sessAcc) }); k.sessAcc = 0; }
    save(); checkLock();
  }
  function lockReason() {
    const k = K(), now = new Date(), m = now.getHours() * 60 + now.getMinutes(), key = dkey(now.getTime());
    if (k.unlockUntil && Date.now() < k.unlockUntil) return '';
    const f = toMin((k.bed || {}).from), t = toMin((k.bed || {}).to);
    if (f !== t && (f > t ? (m >= f || m < t) : (m >= f && m < t))) return 'bed';
    const used = dayRec(k, key).m, extra = (k.extraMin && k.extraMin[key]) || 0;
    if (k.limit > 0 && used >= k.limit + extra) return 'limit';
    return '';
  }
  function checkLock() {
    if (!isKid() || !K().ready) return; const r = lockReason(), cur = el('kLock');
    if (!r) { if (cur) { cur.remove(); } return; }
    if (cur && cur.dataset.r === r) return; if (cur) cur.remove();
    const d = document.createElement('div'); d.id = 'kLock'; d.dataset.r = r; d.className = 'k-lockscr ' + r;
    d.innerHTML = '<div class="k-center"><div class="k-burst">' + (r === 'bed' ? '🌙' : '⏳') + '</div><h2>' + esc(r === 'bed' ? _t('सोने का समय हो गया') : _t('आज का समय पूरा हुआ')) + '</h2><p class="k-sub">' + esc(r === 'bed' ? _t('अब आराम करो। सुबह फिर मिलेंगे!') : _t('कल फिर खेलेंगे और सीखेंगे।')) + '</p><button class="k-btn ghost" data-kact="unlock">🔒 ' + esc(_t('पैरेंट: खोलिए')) + '</button></div>';
    document.body.appendChild(d); closeOv();
    kSay(r === 'bed' ? _t2('{0}, अब सोने का समय है। शुभ रात्रि!', [nm()], '{0}, it is bedtime now. Good night!', [nm()]) : _t2('{0}, आज का समय पूरा हो गया। कल फिर मिलेंगे!', [nm()], '{0}, today\'s time is over. See you tomorrow!', [nm()]), 'night', 'gentle');
  }
  function unlockFlow() {
    askPin(_t('पैरेंट PIN डालिए'), () => {
      ov('<div class="k-center"><div class="k-burst">🔓</div><h2>' + esc(_t('कितनी देर खोलें?')) + '</h2>' + [15, 30, 60].map(m => '<button class="k-btn" data-kact="unlockfor" data-m="' + m + '">+' + m + ' ' + esc(_t('मिनट')) + '</button>').join('') + '<button class="k-btn ghost" data-kact="closeov">' + esc(_t('रद्द करें')) + '</button></div>', 'kunlock', 'k-ov-solid');
    });
  }

  /* ---------------- the Aaj (today) screen ---------------- */
  const GREET = () => { const h = new Date().getHours(); return h < 5 ? _t('शुभ रात्रि') : h < 12 ? _t('सुप्रभात') : h < 17 ? _t('नमस्ते') : h < 20 ? _t('शुभ संध्या') : _t('शुभ रात्रि'); };
  const skyClass = () => { const h = new Date().getHours(); return h >= 6 && h < 10 ? 'morn' : h >= 10 && h < 16 ? 'day' : h >= 16 && h < 19 ? 'eve' : 'night'; };
  function avatarHtml(k, size) {
    const bg = D.SHOP.find(x => x.id === (k.wear || {}).bg) || D.SHOP.find(x => x.id === 'b_sky');
    const w = n => { const it = D.SHOP.find(x => x.id === (k.wear || {})[n]); return it ? it.e : ''; };
    return `<div class="k-av ${size || ''}" style="background:${bg.c}">${w('fx') ? `<span class="k-av-fx"><b>${w('fx')}</b><b>${w('fx')}</b></span>` : ''}<span class="k-av-hat">${w('hat')}</span><span class="k-av-face">${esc(k.avatar || '🦁')}</span><span class="k-av-glass">${w('face')}</span><span class="k-av-pet">${w('pet')}</span></div>`;
  }
  function renderHome() {
    const root = el('kHome'); if (!root || !isKid()) return; const k = K(); if (!k.ready) { root.innerHTML = ''; return; }
    const list = todayList(), done = list.filter(x => x.done).length, nextR = list.find(x => x.st === 'next') || list.find(x => x.st === 'missed'), li = lvInfo(k), fx = FX();
    const R = x => ({ done: '✅', missed: '😴', next: '👉', later: '🕒' }[x]);
    root.innerHTML =
      `<div class="k-wrap">
        <div class="k-hero ${skyClass()}"><div class="k-sunmoon"></div><div class="k-cloud c1"></div><div class="k-cloud c2"></div>
          <div class="k-hero-in"><div class="k-av-wrap" data-kact="avtap">${avatarHtml(k, 'big')}</div>
            <div class="k-hello"><small>${esc(GREET())}</small><h1>${esc(k.name)}!</h1><button class="k-say" data-kact="greet" aria-label="${esc(_t('सुनो'))}">🔊 ${esc(_t('पियू बोलो'))}</button></div></div>
          <div class="k-chips"><span class="k-chip star" id="kStarChip"><i>⭐</i><b id="kStarCnt">${balance(k)}</b></span><span class="k-chip fire"><i>🔥</i><b id="kStreakCnt">${streak(k)}</b><small>${esc(_t('दिन'))}</small></span><span class="k-chip lvl"><i>${li.e}</i><b>${esc(_t('लेवल {0}', [li.l]))}</b></span></div>
        </div>
        <div class="k-card k-today"><div class="k-todayrow">${fx.ring(list.length ? done / list.length : 0, 96, `${done}/${list.length}`, esc(_t('आज के काम')))}
          <div class="k-next">${nextR ? `<small>${esc(nextR.st === 'missed' ? _t('अभी भी कर सकते हो') : _t('अगला काम'))}</small><div class="k-nextt"><i>${esc(nextR.icon)}</i><b>${esc(nextR.title)}</b></div><span class="k-time">${esc(nextR.time)}</span>` : `<small>${esc(list.length ? _t('वाह!') : _t('आज कोई काम नहीं'))}</small><div class="k-nextt"><i>🎉</i><b>${esc(list.length ? _t('सारे काम पूरे') : _t('आज आराम करो'))}</b></div>`}</div></div>
          ${fx.bar(list.length ? done / list.length : 0, 'k-bar')}</div>
        <div class="k-sec"><h3>${esc(_t('मेरा दिन'))}</h3></div>
        <div class="k-routine">${list.length ? list.map(r => `<div class="k-rt ${r.st}" data-rid="${r.id}" style="--i:${list.indexOf(r)}"><span class="k-rt-ic">${esc(r.icon)}</span><div class="k-rt-tx"><b>${esc(r.title)}</b><small>${esc(r.time)}</small></div>${r.done ? '<span class="k-rt-ok">✅</span>' : `<button class="k-done" data-kact="rdone" data-rid="${r.id}">${R(r.st)} ${esc(_t('हो गया'))}</button>`}</div>`).join('') : `<div class="k-empty">${esc(_t('आज का कोई काम नहीं है।'))}</div>`}</div>
        <div class="k-sec"><h3>${esc(_t('मम्मी-पापा को बताओ'))}</h3></div>
        <div class="k-quick">${[['ok', '✅', _t('मैं ठीक हूँ')], ['home', '🏠', _t('घर पहुँच गया')], ['school', '🏫', _t('स्कूल पहुँच गया')], ['late', '⏰', _t('देर होगी')], ['pick', '🚗', _t('लेने आओ')], ['call', '📞', _t('फ़ोन करो')]].map(([key, ic, tx]) => `<button class="k-q" data-kact="checkin" data-key="${key}"><i>${ic}</i><span>${esc(tx)}</span></button>`).join('')}</div>
        <div class="k-sec"><h3>${esc(_t('आज क्या करें?'))}</h3></div>
        <div class="k-go"><button class="k-gc learn" data-kact="gotab" data-t="klearn"><i>📚</i><b>${esc(_t('सीखो'))}</b></button><button class="k-gc play" data-kact="gotab" data-t="kplay"><i>🎮</i><b>${esc(_t('खेलो'))}</b></button><button class="k-gc story" data-kact="gotab" data-t="kstory"><i>📖</i><b>${esc(_t('कहानी'))}</b></button><button class="k-gc hw" data-kact="homework"><i>📷</i><b>${esc(_t('होमवर्क फोटो'))}</b></button></div>
        <div class="k-parentrow"><button class="k-lockbtn" data-kact="parent">🔒 ${esc(_t('पैरेंट'))}</button><button class="k-lockbtn" data-kact="avset">🎙️📷 ${esc(_t('सुरक्षा'))}</button></div>
      </div>`;
    fx.animateRings(root);
  }
  async function checkin(key) {
    const k = K(); if (!k.srv) { toast(_t('अभी इंटरनेट/सर्वर नहीं है')); return; }
    if (key === 'call') { if (k.pmobile) { location.href = 'tel:' + k.pmobile; } }
    const r = await api('/api/kids/checkin', { key: key === 'call' ? 'call' : key });
    if (r.ok) { sfx('ok'); toast(_t('मम्मी-पापा को बता दिया ✅')); kSay(_t2('ठीक है {0}, मैंने मम्मी-पापा को बता दिया।', [nm()], 'Okay {0}, I have told your parents.', [nm()]), 'soft', 'gentle'); } else toast(_t('भेज नहीं पाए — इंटरनेट देखिए'));
  }
  function rdone(rid, btn) {
    const key = dkey(Date.now()); let t = S.tasks.find(x => x.kid && x.kid.rid === rid && x.kid.key === key);
    const rect = btn ? btn.getBoundingClientRect() : null; window.__kFrom = rect ? { x: rect.left + rect.width / 2, y: rect.top } : null;
    if (t && !t.done) markDone(t);
    else if (!t) { const r = (K().routine || []).find(x => x.id === rid); onDone({ kid: { rid, key }, alarmAt: Date.now(), title: r ? r.title : '' }); }
  }

  /* ---------------- Mere Stars: stars, level, avatar, badges ---------------- */
  let shopTab = 'hat';
  function renderStars() {
    const root = el('kStars'); if (!root || !isKid()) return; const k = K(); if (!k.ready) return; const li = lvInfo(k), fx = FX();
    const cats = [['hat', '🎩', _t('टोपी')], ['face', '😎', _t('चेहरा')], ['pet', '🐾', _t('दोस्त')], ['bg', '🌄', _t('पीछे')], ['fx', '✨', _t('चमक')]];
    const items = D.SHOP.filter(x => x.k === shopTab);
    const days = Array.from({ length: 14 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() - 13 + i); const r = k.day[dkey(d.getTime())]; return { on: !!(r && (r.r || r.l || r.g || r.s)), today: i === 13 }; });
    root.innerHTML = `<div class="k-wrap">
      <div class="k-card k-stagecard"><div class="k-stage" id="kStage">${avatarHtml(k, 'huge')}</div>
        <div class="k-bigstar"><i>⭐</i><b id="kBigStar">${balance(k)}</b></div>
        <div class="k-lvbox"><div class="k-lvtop"><span>${li.e} ${esc(_t('लेवल {0}', [li.l]))} — ${esc(li.name)}</span><small>${li.left ? esc(_t('अगले लेवल तक {0} स्टार', [li.left])) : esc(_t('सबसे ऊँचा लेवल!'))}</small></div>${fx.bar(li.frac, 'k-bar gold')}</div></div>
      <div class="k-sec"><h3>${esc(_t('अवतार सजाओ'))}</h3></div>
      <div class="k-avpick">${D.AVATARS.map(a => `<button class="${a === k.avatar ? 'on' : ''}" data-kact="setav" data-a="${a}">${a}</button>`).join('')}</div>
      <div class="k-tabs">${cats.map(([id, ic, tx]) => `<button class="${id === shopTab ? 'on' : ''}" data-kact="shoptab" data-c="${id}"><i>${ic}</i> ${esc(tx)}</button>`).join('')}</div>
      <div class="k-shop">${items.map(it => { const own = it.cost === 0 || k.own.includes(it.id), worn = k.wear[it.k] === it.id; return `<button class="k-item ${worn ? 'worn' : ''} ${own ? '' : 'lock'}" data-kact="item" data-id="${it.id}"><span class="k-item-e" style="${it.c ? 'background:' + it.c : ''}">${it.e}</span><b>${esc(clang() === 'en' ? it.en : it.hi)}</b><small>${worn ? esc(_t('पहना है')) : own ? esc(_t('पहनो')) : '⭐ ' + it.cost}</small></button>`; }).join('')}<button class="k-item" data-kact="item" data-id="none:${shopTab}"><span class="k-item-e">🚫</span><b>${esc(_t('हटाओ'))}</b></button></div>
      <div class="k-sec"><h3>${esc(_t('मेरे दिन'))} · 🔥 ${streak(k)}</h3></div>
      <div class="k-cal">${days.map(d => `<i class="${d.on ? 'on' : ''} ${d.today ? 'today' : ''}">${d.on ? '⭐' : ''}</i>`).join('')}</div>
      <div class="k-sec"><h3>${esc(_t('मेरे बैज'))} · ${k.badges.length}/${D.BADGES.length}</h3></div>
      <div class="k-badges">${D.BADGES.map(b => { const has = k.badges.includes(b.id); return `<div class="k-bd ${has ? 'has' : ''}"><span>${has ? b.e : '🔒'}</span><b>${esc(clang() === 'en' ? b.en : b.hi)}</b><small>${esc(clang() === 'en' ? b.hint_en : b.hint_hi)}</small></div>`; }).join('')}</div>
    </div>`;
    fx.animateRings(root);
  }
  function itemAct(id) {
    const k = K();
    if (id.startsWith('none:')) { delete k.wear[id.slice(5)]; save(); sfx('pop'); renderStars(); return; }
    const it = D.SHOP.find(x => x.id === id); if (!it) return;
    if (it.cost > 0 && !k.own.includes(id)) {
      if (balance(k) < it.cost) { toast(_t('अभी {0} स्टार चाहिए — और स्टार कमाओ!', [it.cost - balance(k)])); sfx('bad'); return; }
      k.spent += it.cost; k.own.push(id); sfx('win'); FX().confetti(50); ev('badge', { buy: id }); checkBadges();
    }
    k.wear[it.k] = id; save(); sfx('pop'); renderStars(); refreshBars();
  }

  /* ---------------- sign-up: the parent sets it up (steps 1–5) ---------------- */
  let W = null;
  const CLASSES = ['Nursery', 'LKG', 'UKG', '1', '2', '3', '4', '5', '6', '7', '8'];
  async function openSignup(edit) {
    const k = K(); W = { step: edit ? 1 : 0, edit: !!edit, name: k.name || '', age: k.ready ? (k.age || 6) : 6, cls: k.cls || '', avatar: k.avatar || '🦁', pm: k.pmobile || '', pin: '', pin2: '', loc: false, msg: '', joinCode: '' };
    if (edit || S.settings.token) { drawWiz(); return; }      // already has its own identity: the normal path
    ov('<div class="k-center"><div class="k-spin">⏳</div></div>', 'kjoingate', 'k-ov-solid');
    const probe = await api('/api/me');
    if (!W || W.step == null) return;                          // the overlay was closed while we were checking
    if (probe.ok) { drawWiz(); return; }                        // server is open, or this device already has a working session some other way
    drawJoinGate();
  }
  function drawJoinGate() {
    ov('<div class="k-center"><div class="k-burst">🔑</div><h1>' + esc(_t('मम्मी-पापा का कोड')) + '</h1>' +
      '<p class="k-sub">' + esc(_t('अपने मम्मी-पापा से 6 अंकों का कोड लीजिए — उनके फ़ोन में Piyu खोलकर "👪 फ़ैमिली" में "बच्चे को जोड़ें" दबाने पर मिलेगा — और यहाँ डालिए।')) + '</p>' +
      '<input id="jcIn" class="k-in k-pinin" inputmode="numeric" maxlength="6" autocomplete="off" placeholder="••••••">' +
      '<div class="k-msg" id="jcMsg"></div><button class="k-btn" data-kact="jcnext">' + esc(_t('आगे चलो ➜')) + '</button></div>', 'kjoingate', 'k-ov-wiz');
    setTimeout(() => { const i = el('jcIn'); if (i) i.focus(); }, 150);
  }
  async function jcNext() {
    const i = el('jcIn'), msg = el('jcMsg'); if (!i) return;
    const code = (i.value || '').replace(/\D/g, '').slice(0, 6);
    if (code.length !== 6) { msg.textContent = _t('6 अंकों का कोड डालिए'); return; }
    msg.textContent = _t('जाँच रहे हैं…');
    const r = await api('/api/kids/code/check?code=' + code);
    if (!r.ok || !r.j.ok) { msg.textContent = r.status === 429 ? _t('बहुत कोशिशें — थोड़ी देर बाद') : _t('कोड सही नहीं है — मम्मी-पापा से दोबारा पूछिए'); return; }
    W.joinCode = code; W.step = 0; drawWiz();
  }
  async function joinWithCode(w) {
    const r = await api('/api/kids/join', { code: w.joinCode, device: DEVICE, name: w.name, age: w.age, cls: w.cls, avatar: w.avatar, newPin: w.pin });
    if (!r.ok || !r.j.token) { toast(_t('जुड़ नहीं पाया — दोबारा कोशिश कीजिए')); return false; }
    S.settings.token = r.j.token; save(); const k = K(); k.srv = true; if (r.j.config) k.cfg = r.j.config; save();
    return true;
  }
  const STEPS = 5;
  function drawWiz() {
    const w = W, dots = Array.from({ length: STEPS }, (_, i) => `<i class="${i === w.step ? 'on' : i < w.step ? 'done' : ''}"></i>`).join('');
    let body = '', back = w.step > 0 && !(w.edit && w.step === 1), next = _t('आगे चलो ➜');
    if (w.step === 0) {
      body = `<div class="k-burst">👶</div><h1>${esc(_t('Piyu Kids में स्वागत है!'))}</h1><p class="k-sub">${esc(_t('यह बच्चों के लिए सुरक्षित, मज़ेदार और पूरी तरह मुफ़्त जगह है। सेटअप मम्मी-पापा करेंगे — सिर्फ़ 2 मिनट।'))}</p>
        <div class="k-feat"><span>⏰ ${esc(_t('रोज़ का रूटीन'))}</span><span>⭐ ${esc(_t('स्टार और इनाम'))}</span><span>📚 ${esc(_t('सीखना'))}</span><span>🎮 ${esc(_t('खेल'))}</span><span>📖 ${esc(_t('कहानियाँ'))}</span><span>📍 ${esc(_t('सुरक्षा'))}</span></div>`; next = _t('शुरू करें ➜');
    } else if (w.step === 1) {
      body = `<h2>${esc(_t('बच्चे के बारे में'))}</h2>
        <label class="k-lab">${esc(_t('बच्चे का नाम'))}<input id="wzName" class="k-in" maxlength="24" value="${esc(w.name)}" autocomplete="off" placeholder="${esc(_t('जैसे: आरव'))}"></label>
        <div class="k-lab">${esc(_t('उम्र'))}<div class="k-step"><button data-kw="agem">−</button><b id="wzAge">${w.age}</b><button data-kw="agep">+</button></div></div>
        <div class="k-lab">${esc(_t('कक्षा'))}<div class="k-chipsel">${CLASSES.map(c => `<button class="${c === w.cls ? 'on' : ''}" data-kw="cls" data-c="${c}">${c}</button>`).join('')}</div></div>
        <div class="k-lab">${esc(_t('पसंद का अवतार'))}<div class="k-avpick">${D.AVATARS.map(a => `<button class="${a === w.avatar ? 'on' : ''}" data-kw="av" data-a="${a}">${a}</button>`).join('')}</div></div>`;
    } else if (w.step === 2) {
      body = `<div class="k-burst">🔒</div><h2>${esc(_t('पैरेंट PIN बनाइए'))}</h2><p class="k-sub">${esc(_t('4 अंकों का PIN। इसके बिना बच्चा सेटिंग, लोकेशन या रूटीन नहीं बदल सकता।'))}</p>
        <label class="k-lab">${esc(_t('PIN'))}<input id="wzPin" class="k-in k-pinin" inputmode="numeric" maxlength="4" autocomplete="off" value="${esc(w.pin)}" placeholder="••••"></label>
        <label class="k-lab">${esc(_t('PIN दोबारा'))}<input id="wzPin2" class="k-in k-pinin" inputmode="numeric" maxlength="4" autocomplete="off" value="${esc(w.pin2)}" placeholder="••••"></label>
        <label class="k-lab">${esc(_t('पैरेंट का मोबाइल (SOS में फ़ोन के लिए)'))}<input id="wzPm" class="k-in" inputmode="tel" maxlength="14" value="${esc(w.pm)}" placeholder="98XXXXXXXX"></label>`;
    } else if (w.step === 3) {
      body = `<div class="k-burst">📍</div><h2>${esc(_t('सुरक्षा: लोकेशन'))}</h2><p class="k-sub">${esc(_t('क्या आप चाहते हैं कि बच्चा स्कूल/घर पहुँचे या निकले तो आपको सूचना मिले और आप नक्शे पर देख सकें?'))}</p>
        <div class="k-consent"><p>✔ ${esc(_t('सिर्फ़ आप (मम्मी-पापा) देख सकेंगे। Piyu का एडमिन भी नहीं देख सकता।'))}</p><p>✔ ${esc(_t('बच्चे की स्क्रीन पर हमेशा "📍 लोकेशन चालू" दिखेगा।'))}</p><p>✔ ${esc(_t('आप जब चाहें बंद कर सकते हैं। 7 दिन बाद पुरानी लोकेशन अपने-आप मिट जाती है।'))}</p><p>✔ ${esc(_t('बिल्कुल मुफ़्त — कोई ऐप या सब्सक्रिप्शन नहीं।'))}</p></div>
        <div class="k-choice"><button class="k-btn ${w.loc ? '' : 'ghost'}" data-kw="locon">📍 ${esc(_t('हाँ, चालू करें'))}</button><button class="k-btn ${w.loc ? 'ghost' : ''}" data-kw="locoff">${esc(_t('अभी नहीं'))}</button></div><p class="k-sub small">${esc(_t('बाद में पैरेंट पैनल से बदल सकते हैं।'))}</p>`;
    } else {
      body = `<div class="k-burst">${esc(w.avatar)}</div><h2>${esc(_t('सब तैयार है!'))}</h2><p class="k-sub">${esc(_t('{0} के लिए Piyu Kids चालू होने वाला है।', [w.name]))}</p><div class="k-feat"><span>👶 ${esc(w.name)}</span><span>🎂 ${w.age}</span><span>📘 ${esc(w.cls || '—')}</span><span>📍 ${w.loc ? esc(_t('चालू')) : esc(_t('बंद'))}</span></div>`; next = _t('शुरू करें 🎉');
    }
    ov(`<div class="k-wiz"><div class="k-dots2">${dots}</div>${body}<div class="k-msg" id="wzMsg">${esc(w.msg)}</div><div class="k-nav">${back ? `<button class="k-btn ghost" data-kw="back">${esc(_t('पीछे'))}</button>` : (!w.edit ? `<button class="k-btn ghost" data-kw="cancel">${esc(_t('वापस'))}</button>` : '<span></span>')}<button class="k-btn" data-kw="next">${esc(next)}</button></div>${w.edit ? `<button class="k-btn ghost small" data-kact="closeov">${esc(_t('रद्द करें'))}</button>` : ''}</div>`, 'ksignup', 'k-ov-wiz');
  }
  function readWiz() {
    const g = id => (el(id) || {}).value; const w = W;
    if (w.step === 1 && el('wzName')) w.name = el('wzName').value.trim();
    if (w.step === 2) { w.pin = (g('wzPin') || '').trim(); w.pin2 = (g('wzPin2') || '').trim(); w.pm = (g('wzPm') || '').replace(/[^0-9+]/g, ''); }
  }
  async function wizNext() {
    readWiz(); const w = W; w.msg = '';
    if (w.step === 1 && !w.name) { w.msg = _t('बच्चे का नाम लिखिए'); return drawWiz(); }
    if (w.step === 2) {
      if (w.edit && !w.pin) { w.step = 3; return drawWiz(); }
      if (!/^\d{4}$/.test(w.pin)) { w.msg = _t('PIN 4 अंकों का होना चाहिए'); return drawWiz(); }
      if (w.pin !== w.pin2) { w.msg = _t('दोनों PIN एक जैसे नहीं हैं'); return drawWiz(); }
    }
    if (w.step < STEPS - 1) { w.step++; if (w.edit && w.step === 2) { /* edit: PIN optional */ } return drawWiz(); }
    await finishSignup();
  }
  async function finishSignup() {
    const w = W, k = K(); const wasKid = isKid();
    k.name = w.name; k.age = w.age; k.cls = w.cls; k.avatar = w.avatar; k.pmobile = w.pm;
    if (w.pin) {
      if (w.edit && k.srv && pinFresh()) { const r = await api('/api/kids/pin', { old: pinFresh(), new: w.pin }); if (!r.ok) { w.msg = _t('PIN नहीं बदला'); w.step = 2; return drawWiz(); } }
      else if (!k.srv) S.settings.kidPendingPin = w.pin;
      S.settings.kidPin = await localHash(w.pin); pinCache = { pin: w.pin, at: Date.now() };
    }
    k.ready = true; S.settings.mode = 'kids'; S.settings.sname = ''; k.routineEdited = true; if (!k.created) k.created = Date.now(); save();
    closeOv(); if (!wasKid || !w.edit) { if (window.PiyuStudent) PiyuStudent.applyMode(); } else renderAll();
    FX().confetti(160); sfx('win'); renderAll(); syncTasks();
    (w.joinCode ? joinWithCode(w) : pushProfile().then(() => true)).then(async ok => { if (ok && w.loc) { const r = await setConsent(true, w.pin || pinFresh()); if (!r.ok) toast(r.why === 'perm' ? _t('लोकेशन की अनुमति नहीं मिली — पैरेंट पैनल से फिर कोशिश करें') : _t('अभी लोकेशन चालू नहीं हो पाई')); } if (ok && k.routineEdited) pushConfig(); });
    kSay(_t2('नमस्ते {0}! मैं पियू हूँ। मैं रोज़ आपको काम याद दिलाऊँगी, सिखाऊँगी और कहानी सुनाऊँगी। चलो शुरू करें!', [k.name], 'Hello {0}! I am Piyu. I will remind you of your tasks, teach you and tell you stories. Let us begin!', [k.name]), 'cheerful');
    goTab('khome');
  }
  function onboard() { if (isKid() && !K().ready) openSignup(false); }

  /* ---------------- homework photo → simple explanation ---------------- */
  function homework() { window.PiyuKidsPlay && PiyuKidsPlay.homework(); }

  /* ---------------- tabs ---------------- */
  function renderAll() { renderHome(); renderStars(); if (window.PiyuKidsPlay) PiyuKidsPlay.renderAll(); }
  function onTab(n) {
    if (!isKid() || !TABS.includes(n)) return;
    if (n === 'khome') renderHome(); else if (n === 'kstars') renderStars(); else if (window.PiyuKidsPlay) PiyuKidsPlay.onTab(n);
    refreshBars();
  }

  /* ---------------- events ---------------- */
  document.addEventListener('click', e => {
    const kw = e.target.closest('[data-kw]');
    if (kw && W) {
      const a = kw.dataset.kw; readWiz();
      if (a === 'cancel') { const pv = PiyuKids.prev; W = null; closeOv(); S.settings.mode = pv === 'kids' ? undefined : pv; save(); if (window.PiyuStudent) PiyuStudent.applyMode(); return; }
      if (a === 'next') wizNext(); else if (a === 'back') { W.step = Math.max(W.edit ? 1 : 0, W.step - 1); drawWiz(); }
      else if (a === 'agem') { W.age = Math.max(2, W.age - 1); el('wzAge').textContent = W.age; } else if (a === 'agep') { W.age = Math.min(16, W.age + 1); el('wzAge').textContent = W.age; }
      else if (a === 'cls') { W.cls = kw.dataset.c; drawWiz(); } else if (a === 'av') { W.avatar = kw.dataset.a; drawWiz(); sfx('pop'); }
      else if (a === 'locon') { W.loc = true; drawWiz(); } else if (a === 'locoff') { W.loc = false; drawWiz(); }
      return;
    }
    const b = e.target.closest('[data-kact]'); if (!b) return;
    if (!b.closest('#kHome,#kStars,#kLearn,#kPlay,#kStory,#kOv,#kLock,#kSos,#kAvBanner')) return;
    const a = b.dataset.kact;
    switch (a) {
      case 'closeov': closeOv(); renderAll(); break;
      case 'greet': kSay(_t2('{0} {1}! आज {2} काम बाकी हैं। चलो मिलकर करते हैं!', [GREET(), nm(), todayList().filter(x => !x.done).length], '{0} {1}! You have {2} tasks left today. Let us do them together!', [GREET(), nm(), todayList().filter(x => !x.done).length]), 'cheerful'); break;
      case 'rdone': rdone(b.dataset.rid, b); break;
      case 'checkin': checkin(b.dataset.key); break;
      case 'gotab': goTab(b.dataset.t); break;
      case 'homework': homework(); break;
      case 'parent': window.PiyuKidsParent && PiyuKidsParent.open(); break;
      case 'avtap': { const av = b.querySelector('.k-av'); if (av) { av.classList.remove('bounce'); void av.offsetWidth; av.classList.add('bounce'); } sfx('pop'); break; }
      case 'setav': K().avatar = b.dataset.a; save(); sfx('pop'); renderStars(); break;
      case 'shoptab': shopTab = b.dataset.c; renderStars(); break;
      case 'item': itemAct(b.dataset.id); break;
      case 'sosnow': sendSos(); break;
      case 'sosno': clearInterval(window.__kSosT); closeOv(); break;
      case 'unlock': unlockFlow(); break;
      case 'unlockfor': { const k = K(), m = +b.dataset.m, key = dkey(Date.now()); k.extraMin = k.extraMin || {}; k.extraMin[key] = (k.extraMin[key] || 0) + m; if (lockReason() === 'bed') k.unlockUntil = Date.now() + m * 60000; save(); closeOv(); const l = el('kLock'); if (l) l.remove(); checkLock(); renderHome(); break; }
      case 'avset': openAvSettings(); break;
      case 'avagree': api('/api/kids/av/agree', {}).then(() => { AV.agreed = true; toast(_t('भेज दिया ✅')); drawAvSettings(); }); break;
      case 'avtoggle': avSetToggle(b.dataset.kind, b.dataset.on === '1'); break;
      case 'avstopall': avStopAllByChild(); break;
      case 'jcnext': jcNext(); break;
    }
  });
  /* sparkle where a child taps */
  document.addEventListener('pointerdown', e => {
    if (!isKid() || matchMedia('(prefers-reduced-motion:reduce)').matches) return;
    if (!e.target.closest('button,.k-card,.k-rt,.k-item,.k-gc,.k-q')) return;
    const s = document.createElement('i'); s.className = 'k-spark'; s.textContent = ['✨', '⭐', '💫'][Math.floor(Math.random() * 3)]; s.style.left = e.clientX + 'px'; s.style.top = e.clientY + 'px'; document.body.appendChild(s); setTimeout(() => s.remove(), 700);
  }, { passive: true });
  /* big-number overlay buttons: "parent" in the bar of splash */
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { tickLast = Date.now(); if (isKid()) { checkLock(); pullMe(); avLoadStatus(); } }
    else if (isKid()) { avStop('mic'); avStop('cam'); }                   // mic/camera only ever run while this screen is open and visible, never in the background
  });

  const api2 = { K, D, ov, closeOv, kSay, sfx, addStars, ev, flush, api, nm, clang, level, lvInfo, balance, streak, dayRec, dkey, hm, toMin, askPin, pinFresh, verifyPin, localHash, setConsent, getPos, locApply, locStop, pullMe, pushConfig, pushProfile, syncTasks, todayList, onDone, renderHome, renderStars, renderAll, enter, leave, navItems, onTab, onboard, openSignup, checkLock, avatarHtml, refreshBars, checkBadges, isKid, TABS, DEF_ROUTINE, sched, lockReason, setup };
  window.PiyuKids = Object.assign(window.PiyuKids || {}, api2);
})();
