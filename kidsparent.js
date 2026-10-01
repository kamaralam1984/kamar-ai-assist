/* Piyu Kids — the parent side: the Parent panel (report, safety map, routine, limits, messages, settings), linking a parent's own phone to the child, and parent alerts.
   Two ways in: (1) on the CHILD's phone behind the Parent PIN, (2) on the PARENT's own phone (Settings → Family) after linking with a 6-digit code. */
(function () {
  'use strict';
  const P = window.PiyuKids, D = window.PiyuKidsData, MP = window.PiyuKidsMap;
  const el = id => document.getElementById(id);
  const e2 = s => esc(String(s == null ? '' : s));
  const K = () => P.K();
  const rnd = n => Math.floor(Math.random() * n);
  const ICONS = ['🌅', '🪥', '🥣', '🎒', '✏️', '⚽', '🍛', '🌙', '📚', '🛁', '🧘', '🎨', '🎹', '🥛', '🧹', '🙏', '⭐', '🚌'];
  const WDN = () => [_t('रवि'), _t('सोम'), _t('मंगल'), _t('बुध'), _t('गुरु'), _t('शुक्र'), _t('शनि')];
  const ago = ms => { if (!ms) return '—'; const m = Math.round((Date.now() - ms) / 60000); return m < 1 ? _t('अभी') : m < 60 ? _t('{0} मिनट पहले', [m]) : m < 1440 ? _t('{0} घंटे पहले', [Math.round(m / 60)]) : _t('{0} दिन पहले', [Math.round(m / 1440)]); };
  const clock = ms => { const d = new Date(ms); return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0'); };
  const api = (p, b, m) => P.api(p, b, m);
  const PL = () => ({ home: _t('घर'), school: _t('स्कूल'), tuition: _t('ट्यूशन'), other: _t('दूसरी जगह') });

  let PN = null;            // panel state { src, cid, tab, d, map, ... }
  /* ---------------- data sources ---------------- */
  function srcLocal(pin) {
    return { kind: 'local', name: () => K().name, load: async () => { let r = await api('/api/kids/panel', { pin }); if (r.status === 403) { await P.pushProfile(); r = await api('/api/kids/panel', { pin }); } if (r.status === 403) return { err: 'pin' }; return r.ok ? r.j : { err: 'net' }; },
      save: cfg => api('/api/kids/config', { pin, config: cfg }), consent: on => P.setConsent(on, pin), msg: null };
  }
  function srcFamily(cid) {
    return { kind: 'family', cid, name: () => (PN && PN.d && PN.d.summary && PN.d.summary.name) || '', load: async () => { const r = await api('/api/family/child/' + cid + '?hours=24'); return r.ok ? r.j : { err: r.status === 403 ? 'link' : 'net' }; },
      save: cfg => api('/api/family/child/' + cid + '/config', { config: cfg }), consent: async on => { const r = await api('/api/family/child/' + cid + '/consent', { on }); return { ok: r.ok }; }, msg: text => api('/api/family/msg', { child: cid, text }) };
  }

  /* ---------------- open ---------------- */
  function open() { P.askPin(_t('पैरेंट PIN डालिए'), pin => openPanel(srcLocal(pin))); }
  async function openPanel(src, tab) {
    PN = { src, tab: tab || 'rep', d: null, edit: null, map: null };
    P.ov('<div class="k-center"><div class="k-spin">⏳</div><p class="k-sub">' + e2(_t('लोड हो रहा है…')) + '</p></div>', 'kpanel', 'k-ov-parent');
    const d = await src.load();
    if (d.err) { P.ov('<div class="k-center"><div class="k-burst">⚠️</div><h2>' + e2(d.err === 'pin' ? _t('PIN ग़लत है') : d.err === 'link' ? _t('यह बच्चा अब आपसे जुड़ा नहीं है') : _t('सर्वर से जुड़ नहीं पाए')) + '</h2><button class="k-btn" data-kp="close">' + e2(_t('ठीक है')) + '</button></div>', 'kpanel', 'k-ov-parent'); return; }
    PN.d = d; PN.cfg = JSON.parse(JSON.stringify(d.config || {})); if (!PN.cfg.routine) PN.cfg.routine = K().routine; draw();
  }
  function destroyMap() { if (PN && PN.map) { PN.map.destroy(); PN.map = null; } }
  function draw() {
    if (!PN) return; destroyMap(); const d = PN.d, s = d.summary || {}, tab = PN.tab;
    const tabs = [['rep', '📊', _t('रिपोर्ट')], ['safe', '📍', _t('सुरक्षा')], ['rt', '⏰', _t('रूटीन')], ['msg', '💌', _t('संदेश')], ['set', '⚙️', _t('सेटिंग')]].filter(t => !(t[0] === 'msg' && !PN.src.msg));
    const body = tab === 'rep' ? viewReport() : tab === 'safe' ? viewSafe() : tab === 'rt' ? viewRoutine() : tab === 'msg' ? viewMsg() : viewSettings();
    P.ov(`<div class="k-pp"><div class="k-pp-head"><button class="k-x" data-kp="close" aria-label="close">✕</button><div class="k-pp-av">${P.avatarHtml(Object.assign({}, K(), { avatar: s.avatar || K().avatar, wear: PN.src.kind === 'local' ? K().wear : {} }), 'sm')}</div><div><small>${e2(PN.src.kind === 'local' ? _t('पैरेंट पैनल') : _t('फ़ैमिली'))}</small><h2>${e2(s.name || '')}</h2><span class="k-pp-sub">${e2(_t('उम्र {0}', [s.age || '']))}${s.cls ? ' · ' + e2(_t('कक्षा {0}', [s.cls])) : ''}</span></div>
      <button class="k-pp-refresh" data-kp="reload" aria-label="refresh">🔄</button></div>
      <div class="k-tabs pp">${tabs.map(([id, ic, tx]) => `<button class="${id === tab ? 'on' : ''}" data-kp="tab" data-t="${id}"><i>${ic}</i> ${e2(tx)}</button>`).join('')}</div>
      <div class="k-pp-body">${body}</div></div>`, 'kpanel', 'k-ov-parent');
    if (tab === 'safe') mountMap();
    if (tab === 'set' && typeof langChips === 'function') langChips();
  }
  async function reload() { const d = await PN.src.load(); if (d.err) return toast(_t('लोड नहीं हुआ')); PN.d = d; if (!PN.dirty) PN.cfg = JSON.parse(JSON.stringify(d.config || PN.cfg)); draw(); }

  /* ---------------- report ---------------- */
  function viewReport() {
    const d = PN.d, s = d.summary || {}, r = d.report || { days: [], today: {}, weak: [] }, t = r.today || {}, days = r.days || [], limit = s.limit || 0;
    const maxM = Math.max(30, ...days.map(x => x.minutes)), maxS = Math.max(5, ...days.map(x => x.stars));
    const names = WDN();
    const bars = days.map(x => { const dt = new Date(x.day + 'T00:00:00'); return `<div class="k-bcol"><div class="k-bpair"><i class="m" style="height:${Math.round(x.minutes / maxM * 100)}%" title="${Math.round(x.minutes)} min"></i><i class="s" style="height:${Math.round(x.stars / maxS * 100)}%" title="${x.stars} ⭐"></i></div><small>${e2(names[dt.getDay()])}</small></div>`; }).join('');
    const feed = (d.feed || []).slice(0, 14).map(f => { let dd = {}; try { dd = JSON.parse(f.data); } catch (e) { } const T = { routine_done: ['✅', _t('काम पूरा: {0}', [dd.title || ''])], star: ['⭐', _t('+{0} स्टार', [dd.n || 1])], game: ['🎮', _t('खेल: {0}/{1}', [dd.score || 0, dd.of || 0])], lesson: ['📚', _t('पाठ: {0}/{1}', [dd.score == null ? '✔' : dd.score, dd.of || 5])], story: ['📖', _t('कहानी सुनी')], speak: ['🎤', dd.ok ? _t('सही बोला') : _t('बोलने की कोशिश')], photo: ['📷', _t('होमवर्क समझा')], badge: ['🛍️', _t('अवतार की चीज़ ली')], mood: ['🔔', dd.sos ? _t('SOS दबाया') : dd.geo === 'arrive' ? _t('{0} पहुँचा', [dd.place || '']) : dd.geo === 'leave' ? _t('{0} से निकला', [dd.place || '']) : _t('घटना')] }[f.kind] || ['•', f.kind]; return `<div class="k-feed"><span>${T[0]}</span><b>${e2(T[1])}</b><small>${e2(ago(f.at))}</small></div>`; }).join('');
    return `<div class="k-grid2"><div class="k-stat"><i>🔥</i><b>${e2(r.streak || 0)}</b><small>${e2(_t('दिन लगातार'))}</small></div><div class="k-stat"><i>⭐</i><b>${e2(s.starsToday || 0)}</b><small>${e2(_t('आज के स्टार'))}</small></div>
      <div class="k-stat"><i>⏱️</i><b>${Math.round(s.minutesToday || 0)}${limit ? '/' + limit : ''}</b><small>${e2(_t('मिनट आज'))}</small></div><div class="k-stat"><i>✅</i><b>${e2(t.done || 0)}/${e2(t.scheduled || 0)}</b><small>${e2(_t('आज के काम'))}</small></div></div>
      ${(t.missed || []).length ? `<div class="k-note warn">⏰ ${e2(_t('अभी तक बाकी:'))} ${e2((t.missed || []).join(', '))}</div>` : ''}
      <div class="k-sec"><h3>${e2(_t('पिछले 7 दिन'))}</h3><small class="k-leg"><i class="m"></i>${e2(_t('मिनट'))} <i class="s"></i>${e2(_t('स्टार'))}</small></div><div class="k-bars">${bars}</div>
      <div class="k-sec"><h3>${e2(_t('कहाँ मदद चाहिए'))}</h3></div>${(r.weak || []).length ? `<div class="k-weak">${r.weak.map(([tag, n]) => `<span>⚠ ${e2(tag)} <b>${n}</b></span>`).join('')}</div><p class="k-sub small">${e2(_t('बच्चे को इन पर थोड़ा और अभ्यास कराइए।'))}</p>` : `<p class="k-sub small">${e2(_t('अभी कोई कमज़ोरी नहीं दिखी 👍'))}</p>`}
      <div class="k-sec"><h3>${e2(_t('हाल की गतिविधि'))}</h3></div><div class="k-feeds">${feed || `<p class="k-sub small">${e2(_t('अभी कुछ नहीं'))}</p>`}</div>`;
  }

  /* ---------------- safety ---------------- */
  function viewSafe() {
    const d = PN.d, s = d.summary || {}, last = s.last, cfg = PN.cfg, places = cfg.places || [];
    const cons = !!s.consent;
    const near = (s.places || []).map(p => `<span class="k-pdist ${p.type}">${MP.PLACE_ICON[p.type] || '📍'} ${e2(p.name)}: <b>${e2(MP.fmtDist(p.m))}</b></span>`).join('');
    const alerts = (PN.alerts || []).slice(0, 12).map(a => `<div class="k-alert ${a.kind}"><div><b>${e2(a.title)}</b><small>${e2(a.body || '')}</small></div><span>${e2(ago(a.at))}</span></div>`).join('');
    return `<div class="k-card k-consentcard ${cons ? 'on' : ''}"><div class="k-conrow"><div><b>📍 ${e2(_t('लोकेशन शेयरिंग'))}</b><small>${cons ? e2(_t('चालू — बच्चे की स्क्रीन पर "📍 लोकेशन चालू" दिखता है')) : e2(_t('बंद — कोई लोकेशन नहीं ली जा रही'))}</small></div><button class="k-switch ${cons ? 'on' : ''}" data-kp="consent" data-on="${cons ? 0 : 1}" aria-label="toggle"><i></i></button></div>
      ${cons ? '' : `<p class="k-sub small">${e2(_t('चालू करने पर बच्चे के फ़ोन में लोकेशन की अनुमति माँगी जाएगी। सिर्फ़ आप देख सकेंगे।'))}</p>`}</div>
      ${cons && last ? `<div class="k-card k-last"><div class="k-lastrow"><div><small>${e2(_t('आख़िरी लोकेशन'))}</small><b>${e2(ago(last.at))} · ${e2(clock(last.at))}</b></div><div class="k-lastr">${last.batt != null ? '🔋 ' + last.batt + '%' : ''}<small>±${Math.round(last.acc || 0)} m</small></div></div>${(s.inside || []).length ? `<div class="k-inside">✅ ${e2(_t('अभी यहाँ: {0}', [s.inside.join(', ')]))}</div>` : ''}<div class="k-pdists">${near}${s.parentDist != null ? `<span class="k-pdist">👪 ${e2(_t('आपसे दूरी'))}: <b>${e2(MP.fmtDist(s.parentDist))}</b></span>` : ''}</div></div>` : cons ? `<div class="k-note">${e2(_t('अभी तक कोई लोकेशन नहीं आई। बच्चे के फ़ोन में Piyu खुला रखें और लोकेशन चालू रखें।'))}</div>` : ''}
      <div class="k-mapbox" id="kMapBox"></div>
      <div class="k-sec"><h3>${e2(_t('सुरक्षित जगहें'))}</h3></div><div id="kPlaces">${places.map((p, i) => placeRow(p, i)).join('') || `<p class="k-sub small">${e2(_t('घर और स्कूल जोड़िए — बच्चा पहुँचे/निकले तो सूचना मिलेगी।'))}</p>`}</div>
      <div class="k-addrow">${['home', 'school', 'tuition', 'other'].map(t => `<button class="k-chipbtn" data-kp="addplace" data-t="${t}">${MP.PLACE_ICON[t]} + ${e2(PL()[t])}</button>`).join('')}</div>
      <div class="k-sec"><h3>${e2(_t('सूचनाओं के नियम'))}</h3></div>
      <div class="k-form"><label>${e2(_t('स्कूल पहुँचने का समय'))}<input type="time" id="ppArrive" value="${e2((cfg.school || {}).arrive_by || '08:30')}"></label>
        <label>${e2(_t('स्कूल से निकलकर घर न पहुँचे तो (मिनट)'))}<input type="number" id="ppLate" min="5" max="180" value="${cfg.late_min || 30}"></label>
        <label>${e2(_t('लोकेशन बंद होने पर सूचना (मिनट)'))}<input type="number" id="ppGps" min="10" max="120" value="${cfg.gps_off_min || 20}"></label>
        <label>${e2(_t('लोकेशन कितनी बार (मिनट)'))}<input type="number" id="ppEvery" min="1" max="10" value="${cfg.loc_every || 2}"></label></div>
      <button class="k-btn" data-kp="savecfg">💾 ${e2(_t('सेव करें'))}</button>
      ${PN.src.kind === 'family' ? `<div class="k-sec"><h3>${e2(_t('मेरी लोकेशन'))}</h3></div><div class="k-card"><div class="k-conrow"><div><b>👪 ${e2(_t('मेरी लोकेशन भी दिखाओ'))}</b><small>${e2(_t('ताकि "आपसे दूरी" दिख सके। सिर्फ़ तब जब ऐप खुला हो।'))}</small></div><button class="k-switch ${(S.settings.family || {}).sharePos ? 'on' : ''}" data-kp="sharepos" aria-label="toggle"><i></i></button></div></div>` : ''}
      <div class="k-sec"><h3>${e2(_t('सूचनाएँ'))}</h3></div><div class="k-alerts">${alerts || `<p class="k-sub small">${e2(_t('अभी कोई सूचना नहीं'))}</p>`}</div>`;
  }
  const placeRow = (p, i) => `<div class="k-place" data-i="${i}"><span class="k-place-ic">${MP.PLACE_ICON[p.type] || '📍'}</span><div class="k-place-f"><input class="pp-name" value="${e2(p.name)}" maxlength="30"><div class="k-place-r"><select class="pp-r">${[50, 100, 150, 200, 300, 500, 800].map(r => `<option ${r === p.r ? 'selected' : ''} value="${r}">${r} m</option>`).join('')}</select><small>${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}</small></div></div><div class="k-place-b"><button data-kp="here" data-i="${i}" title="${e2(_t('अभी की जगह'))}">📍</button><button data-kp="pickmap" data-i="${i}" title="${e2(_t('नक़्शे से चुनो'))}">🗺️</button><button data-kp="delplace" data-i="${i}" title="${e2(_t('हटाओ'))}">🗑️</button></div></div>`;
  async function mountMap() {
    const box = el('kMapBox'); if (!box) return; const d = PN.d, s = d.summary || {}, c = PN.cfg;
    const trail = (d.locs || []).map(x => ({ lat: x.lat, lng: x.lng, at: x.at }));
    const last = s.last; const parent = d.parentPos || null;
    box.style.height = '320px';
    PN.map = MP.mount(box, { child: last ? { lat: last.lat, lng: last.lng, acc: last.acc } : null, childName: s.name, childIcon: s.avatar, places: c.places || [], parent, trail, mode: PN.mapMode || 'radar', labels: { radar: _t('रडार'), map: _t('नक़्शा'), parent: _t('आप'), empty: _t('लोकेशन का इंतज़ार…') } });
    const bm = PN.map.setMode; PN.map.setMode = m => { PN.mapMode = m; bm(m); }; box.querySelectorAll('.kmap-bar [data-m]').forEach(b => b.addEventListener('click', () => { PN.mapMode = b.dataset.m; }));
    if (PN.src.kind === 'family') { const r = await api('/api/family/alerts'); if (r.ok) { PN.alerts = r.j.alerts; const box2 = document.querySelector('.k-alerts'); if (box2) box2.innerHTML = PN.alerts.slice(0, 12).map(a => `<div class="k-alert ${a.kind}"><div><b>${e2(a.title)}</b><small>${e2(a.body || '')}</small></div><span>${e2(ago(a.at))}</span></div>`).join('') || `<p class="k-sub small">${e2(_t('अभी कोई सूचना नहीं'))}</p>`; if (PN.alerts.length) api('/api/family/alerts/seen', { upto: Math.max(...PN.alerts.map(a => a.id)) }); } }
  }
  function readSafetyForm() {
    const c = PN.cfg; document.querySelectorAll('.k-place').forEach(r => { const p = c.places[+r.dataset.i]; if (!p) return; p.name = r.querySelector('.pp-name').value.trim() || p.name; p.r = +r.querySelector('.pp-r').value; });
    const v = id => (el(id) || {}).value; if (el('ppArrive')) { c.school = c.school || { days: [1, 2, 3, 4, 5] }; c.school.arrive_by = v('ppArrive') || '08:30'; c.late_min = +v('ppLate') || 30; c.gps_off_min = +v('ppGps') || 20; c.loc_every = +v('ppEvery') || 2; }
  }
  async function addPlace(type) {
    readSafetyForm(); let pos = null; toast(_t('अभी की जगह ढूँढ रही हूँ…'));
    try { pos = await P.getPos(15000); } catch (e) { }
    const base = pos || (PN.d.summary.last ? { lat: PN.d.summary.last.lat, lng: PN.d.summary.last.lng } : null) || { lat: 28.6139, lng: 77.2090 };
    (PN.cfg.places = PN.cfg.places || []).push({ id: 'p' + Date.now().toString(36).slice(-5) + rnd(99), name: PL()[type], type, lat: base.lat, lng: base.lng, r: type === 'school' ? 150 : 100 }); PN.dirty = true;
    if (!pos) toast(_t('जगह नहीं मिली — 🗺️ से नक़्शे पर चुनिए'));
    draw();
  }

  /* ---------------- routine & limits ---------------- */
  function viewRoutine() {
    const c = PN.cfg, rt = c.routine || [], bed = c.bed || { from: '21:00', to: '06:30' }; const names = WDN();
    return `<div class="k-sec"><h3>${e2(_t('रोज़ का रूटीन'))}</h3></div><div id="kRt">${rt.map((r, i) => `<div class="k-rrow ${r.on === false ? 'off' : ''}" data-i="${i}"><button class="k-ricon" data-kp="icon" data-i="${i}">${e2(r.icon)}</button><div class="k-rmain"><input class="r-title" value="${e2(r.title)}" maxlength="40"><div class="k-rline"><input class="r-time" type="time" value="${e2(r.time)}"><div class="k-days">${[1, 2, 3, 4, 5, 6, 0].map(dn => `<button class="${(r.days || []).includes(dn) ? 'on' : ''}" data-kp="day" data-i="${i}" data-d="${dn}">${e2(names[dn].slice(0, 2))}</button>`).join('')}</div></div></div><div class="k-rctl"><button class="k-switch sm ${r.on === false ? '' : 'on'}" data-kp="ron" data-i="${i}" aria-label="on/off"><i></i></button><button data-kp="rdel" data-i="${i}" aria-label="delete">🗑️</button></div></div>`).join('')}</div>
      <div class="k-addrow"><button class="k-chipbtn" data-kp="radd">➕ ${e2(_t('नया काम'))}</button><button class="k-chipbtn" data-kp="rreset">↺ ${e2(_t('शुरुआती रूटीन'))}</button></div>
      <div class="k-sec"><h3>${e2(_t('समय की सीमा'))}</h3></div>
      <div class="k-form"><label>${e2(_t('रोज़ ऐप का समय (मिनट, 0 = कोई सीमा नहीं)'))}<input type="number" id="ppLimit" min="0" max="600" step="5" value="${c.limit_min == null ? 90 : c.limit_min}"></label>
        <div class="k-two"><label>${e2(_t('सोने का समय'))}<input type="time" id="ppBedF" value="${e2(bed.from)}"></label><label>${e2(_t('उठने का समय'))}<input type="time" id="ppBedT" value="${e2(bed.to)}"></label></div></div>
      <p class="k-sub small">${e2(_t('सीमा पूरी होने या सोने के समय पर ऐप बंद हो जाता है। अलार्म और SOS फिर भी काम करते हैं।'))}</p>
      <button class="k-btn" data-kp="savecfg">💾 ${e2(_t('सेव करें'))}</button>`;
  }
  function readRoutineForm() {
    const c = PN.cfg; document.querySelectorAll('.k-rrow').forEach(r => { const x = c.routine[+r.dataset.i]; if (!x) return; x.title = r.querySelector('.r-title').value.trim() || x.title; x.time = r.querySelector('.r-time').value || x.time; });
    if (el('ppLimit')) { c.limit_min = Math.max(0, +el('ppLimit').value || 0); c.bed = { from: el('ppBedF').value || '21:00', to: el('ppBedT').value || '06:30' }; }
  }
  async function saveCfg() {
    readSafetyForm(); readRoutineForm(); const c = PN.cfg;
    const cfg = { routine: c.routine, limit_min: c.limit_min, bed: c.bed, places: c.places, late_min: c.late_min, gps_off_min: c.gps_off_min, loc_every: c.loc_every, school: c.school };
    const r = await PN.src.save(cfg);
    if (!r.ok) return toast(r.status === 403 ? _t('PIN ग़लत है') : _t('सेव नहीं हुआ — इंटरनेट देखिए'));
    PN.dirty = false; PN.d.config = r.j.config; PN.cfg = JSON.parse(JSON.stringify(r.j.config));
    if (PN.src.kind === 'local') { const k = K(); k.routine = r.j.config.routine; k.limit = r.j.config.limit_min; k.bed = r.j.config.bed; k.places = r.j.config.places; k.cfg = r.j.config; save(); P.syncTasks(); P.renderHome(); }
    P.sfx('ok'); toast(_t('सेव हो गया ✅')); draw();
  }

  /* ---------------- message ---------------- */
  function viewMsg() {
    const quick = [_t('पढ़ाई कर लो बेटा'), _t('जल्दी घर आ जाओ'), _t('खाना खा लो'), _t('शाबाश! मुझे तुम पर गर्व है'), _t('मैं तुम्हें लेने आ रही हूँ / रहा हूँ')];
    return `<div class="k-sec"><h3>${e2(_t('बच्चे को संदेश भेजें'))}</h3></div><div class="k-quickmsg">${quick.map(q => `<button class="k-chipbtn" data-kp="qmsg" data-q="${e2(q)}">${e2(q)}</button>`).join('')}</div>
      <div class="k-form"><label>${e2(_t('अपना संदेश'))}<input id="ppMsg" maxlength="120" placeholder="${e2(_t('यहाँ लिखिए'))}"></label></div><button class="k-btn" data-kp="sendmsg">💌 ${e2(_t('भेजें'))}</button><p class="k-sub small">${e2(_t('बच्चे के फ़ोन पर संदेश बोलकर सुनाया जाएगा।'))}</p>`;
  }
  async function sendMsg(text) {
    text = (text || (el('ppMsg') || {}).value || '').trim(); if (!text) return;
    const r = await PN.src.msg(text); if (r.ok) { toast(_t('संदेश भेज दिया ✅')); P.sfx('ok'); if (el('ppMsg')) el('ppMsg').value = ''; } else toast(_t('भेज नहीं पाए'));
  }

  /* ---------------- settings ---------------- */
  function viewSettings() {
    const local = PN.src.kind === 'local', k = K();
    return `<div class="k-form">${local ? `<button class="k-btn ghost" data-kp="profile">✏️ ${e2(_t('बच्चे की जानकारी बदलें'))}</button><button class="k-btn ghost" data-kp="pin">🔒 ${e2(_t('PIN बदलें'))}</button>
      <div class="k-sec"><h3>${e2(_t('पैरेंट के फ़ोन से जोड़ें'))}</h3></div><p class="k-sub small">${e2(_t('अपने फ़ोन में Piyu खोलकर Settings → फ़ैमिली → "बच्चा जोड़ें" में यह कोड डालिए। कोड 15 मिनट चलता है।'))}</p><button class="k-btn" data-kp="code">🔗 ${e2(_t('जोड़ने का कोड बनाएँ'))}</button><div id="kCode" class="k-code"></div><p class="k-sub small">${e2(_t('जुड़े हुए पैरेंट फ़ोन: {0}', [PN.d.parents || 0]))}</p>
      <div class="k-sec"><h3>${e2(_t('भाषा'))}</h3></div><div class="langChips"></div>
      <div class="k-sec"><h3>${e2(_t('सीखने की भाषा'))}</h3></div><div class="k-langsw"><button class="${P.clang() === 'hi' ? 'on' : ''}" data-kp="clang" data-l="hi">हिन्दी</button><button class="${P.clang() === 'en' ? 'on' : ''}" data-kp="clang" data-l="en">English</button></div>
      <div class="k-sec"><h3>${e2(_t('खाता'))}</h3></div><button class="k-btn ghost" data-kp="tostudent">🎓 ${e2(_t('Student मोड में जाएँ'))}</button><button class="k-btn ghost" data-kp="tobiz">💼 ${e2(_t('Business मोड में जाएँ'))}</button>` : `<button class="k-btn ghost" data-kp="unlink">🔗 ${e2(_t('इस बच्चे को हटाएँ'))}</button>`}
      <div class="k-sec"><h3>${e2(_t('बच्चे का डेटा'))}</h3></div><p class="k-sub small">${e2(_t('सिर्फ़ नाम, उम्र, कक्षा, गतिविधि और (चालू हो तो) पिछले 7 दिन की लोकेशन सेव होती है।'))}</p>
      ${local ? `<button class="k-btn ghost" data-kp="export">⬇️ ${e2(_t('डेटा डाउनलोड करें'))}</button><button class="k-btn red" data-kp="wipe">🗑️ ${e2(_t('सारा डेटा मिटाएँ'))}</button>` : ''}</div>`;
  }

  /* ---------------- clicks ---------------- */
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-kp]'); if (!b || !PN) return; const a = b.dataset.kp, i = +b.dataset.i; const c = PN.cfg;
    switch (a) {
      case 'close': destroyMap(); PN = null; P.closeOv(); P.renderAll(); break;
      case 'tab': readSafetyForm(); readRoutineForm(); PN.tab = b.dataset.t; draw(); break;
      case 'reload': reload(); break;
      case 'consent': { const on = b.dataset.on === '1'; if (on && !confirm(_t('लोकेशन शेयरिंग चालू करें? बच्चे की स्क्रीन पर "📍 लोकेशन चालू" दिखेगा और सिर्फ़ आप देख सकेंगे।'))) break; const r = await PN.src.consent(on); if (r && r.ok === false) { toast(r.why === 'perm' ? _t('फ़ोन में लोकेशन की अनुमति नहीं मिली') : _t('अभी नहीं हो पाया')); } else toast(on ? _t('लोकेशन शेयरिंग चालू') : _t('लोकेशन शेयरिंग बंद')); await reload(); break; }
      case 'addplace': addPlace(b.dataset.t); break;
      case 'delplace': readSafetyForm(); c.places.splice(i, 1); PN.dirty = true; draw(); break;
      case 'here': { readSafetyForm(); toast(_t('अभी की जगह ढूँढ रही हूँ…')); try { const p = await P.getPos(15000); c.places[i].lat = p.lat; c.places[i].lng = p.lng; PN.dirty = true; draw(); } catch (er) { toast(_t('जगह नहीं मिली')); } break; }
      case 'pickmap': pickOnMap(i); break;
      case 'pickset': { const p = PN.pick; if (p) { readSafetyForm(); c.places[p.i].lat = p.lat; c.places[p.i].lng = p.lng; PN.dirty = true; PN.pick = null; draw(); } break; }
      case 'pickcancel': PN.pick = null; draw(); break;
      case 'savecfg': saveCfg(); break;
      case 'icon': { readRoutineForm(); const r = c.routine[i], j = ICONS.indexOf(r.icon); r.icon = ICONS[(j + 1) % ICONS.length]; draw(); break; }
      case 'day': { readRoutineForm(); const r = c.routine[i], d = +b.dataset.d; r.days = r.days || []; r.days = r.days.includes(d) ? r.days.filter(x => x !== d) : r.days.concat(d); if (!r.days.length) r.days = [d]; draw(); break; }
      case 'ron': { readRoutineForm(); c.routine[i].on = c.routine[i].on === false; draw(); break; }
      case 'rdel': readRoutineForm(); c.routine.splice(i, 1); draw(); break;
      case 'radd': readRoutineForm(); if (c.routine.length >= 20) return toast(_t('इससे ज़्यादा काम नहीं')); c.routine.push({ id: 'r' + Date.now().toString(36).slice(-5), icon: '⭐', title: _t('नया काम'), time: '16:00', days: [0, 1, 2, 3, 4, 5, 6], on: true }); draw(); break;
      case 'rreset': if (confirm(_t('शुरुआती रूटीन वापस लाएँ?'))) { c.routine = P.DEF_ROUTINE(); draw(); } break;
      case 'qmsg': sendMsg(b.dataset.q); break; case 'sendmsg': sendMsg(); break;
      case 'sharepos': { const f = S.settings.family = S.settings.family || {}; f.sharePos = !f.sharePos; save(); if (f.sharePos) { try { const p = await P.getPos(15000); await api('/api/family/pos', { on: true, lat: p.lat, lng: p.lng }); } catch (er) { toast(_t('जगह नहीं मिली')); } } else api('/api/family/pos', { on: false }); draw(); break; }
      case 'profile': destroyMap(); PN = null; P.openSignup(true); break;
      case 'pin': changePin(); break;
      case 'code': { const pin = P.pinFresh(); const r = await api('/api/kids/code', { pin }); const box = el('kCode'); if (box) box.innerHTML = r.ok ? `<b>${e2(r.j.code)}</b><small>${e2(_t('15 मिनट के लिए'))}</small>` : e2(_t('कोड नहीं बन पाया')); break; }
      case 'clang': K().clang = b.dataset.l; save(); draw(); break;
      case 'tostudent': case 'tobiz': { if (!confirm(_t('खाता बदलें? बच्चे का रूटीन अलार्म हट जाएगा।'))) break; const m = a === 'tostudent' ? 'student' : 'business'; destroyMap(); PN = null; P.closeOv(); S.settings.mode = m; save(); PiyuStudent.applyMode(); if (m === 'student') PiyuStudent.onboard(); break; }
      case 'unlink': if (confirm(_t('इस बच्चे को अपनी सूची से हटाएँ?'))) { await api('/api/family/child/' + PN.src.cid + '/unlink', {}); PN = null; P.closeOv(); family(); } break;
      case 'export': { const r = await api('/api/kids/export', { pin: P.pinFresh() }); if (r.ok) { const blob = new Blob([JSON.stringify(r.j, null, 1)], { type: 'application/json' }), a2 = document.createElement('a'); a2.href = URL.createObjectURL(blob); a2.download = 'piyu-kids-data.json'; a2.click(); setTimeout(() => URL.revokeObjectURL(a2.href), 4000); } else toast(_t('डाउनलोड नहीं हुआ')); break; }
      case 'wipe': if (confirm(_t('बच्चे का सारा डेटा (गतिविधि, लोकेशन, प्रोफ़ाइल) हमेशा के लिए मिटाएँ?')) && confirm(_t('पक्का? यह वापस नहीं आएगा।'))) { const r = await api('/api/kids/delete', { pin: P.pinFresh() }); if (r.ok) { P.locStop(); S.settings.kid = null; S.settings.kidPin = ''; S.settings.mode = undefined; save(); PN = null; P.closeOv(); PiyuStudent.applyMode(); location.reload(); } else toast(_t('नहीं मिट पाया')); } break;
    }
  });
  document.addEventListener('change', e => { if (PN && e.target.closest('.k-place,.k-rrow,.k-form')) PN.dirty = true; });
  function pickOnMap(i) {
    readSafetyForm(); const p = PN.cfg.places[i]; PN.pick = { i, lat: p.lat, lng: p.lng };
    P.ov(`<div class="k-pp"><div class="k-pp-head"><button class="k-x" data-kp="pickcancel">✕</button><div><small>${e2(_t('नक़्शे पर चुनें'))}</small><h2>${MP.PLACE_ICON[p.type]} ${e2(p.name)}</h2></div></div><p class="k-sub small">${e2(_t('नक़्शे को खिसकाइए — बीच का 📍 निशान जगह है।'))}</p><div class="k-mapbox" id="kPickBox" style="height:60vh"></div><button class="k-btn gold" data-kp="pickset">✔ ${e2(_t('यही जगह'))}</button></div>`, 'kpanel', 'k-ov-parent');
    const m = MP.mount(el('kPickBox'), { child: null, places: [Object.assign({}, p)], pick: true, mode: 'map', labels: { radar: _t('रडार'), map: _t('नक़्शा') }, onPick: (lat, lng) => { PN.pick.lat = lat; PN.pick.lng = lng; } }); m.fit = false; m.view.lat = p.lat; m.view.lng = p.lng; m.view.z = 17; PN.map = m; m.setMode('map'); m.fit = false; m.view.lat = p.lat; m.view.lng = p.lng; m.view.z = 17; setTimeout(() => m.update({}), 30);
  }
  function changePin() {
    P.askPin(_t('अभी का PIN'), old => {
      P.askPin(_t('नया PIN'), async nw => { const r = await api('/api/kids/pin', { old, new: nw }); if (r.ok) { S.settings.kidPin = await P.localHash(nw); save(); toast(_t('PIN बदल गया ✅')); } else toast(_t('PIN नहीं बदला')); }, () => { });
    });
  }

  /* ======================= Family: the parent's own phone ======================= */
  async function family() {
    const r = await api('/api/family/children'); const kids = r.ok ? r.j.children : [];
    const al = await api('/api/family/alerts'); const alerts = al.ok ? al.j.alerts : [];
    const list = kids.map(c => `<button class="k-child" data-kf="open" data-id="${c.id}"><span class="k-child-av">${e2(c.avatar)}</span><div><b>${e2(c.name)}</b><small>${c.consent && c.last ? '📍 ' + e2(ago(c.last.at)) + (c.inside && c.inside.length ? ' · ✅ ' + e2(c.inside.join(', ')) : '') : e2(c.consent ? _t('लोकेशन का इंतज़ार') : _t('लोकेशन बंद'))}</small></div><span class="k-child-r">🔥${c.streak || 0}<small>⭐${c.starsToday || 0}</small></span></button>`).join('');
    P.ov(`<div class="k-pp"><div class="k-pp-head"><button class="k-x" data-kf="close" aria-label="close">✕</button><div><small>Piyu</small><h2>👪 ${e2(_t('फ़ैमिली'))}</h2></div></div>
      <div class="k-pp-body"><div class="k-sec"><h3>${e2(_t('मेरे बच्चे'))}</h3></div>${list || `<p class="k-sub small">${e2(_t('अभी कोई बच्चा नहीं जुड़ा।'))}</p>`}
      <div class="k-card"><b>➕ ${e2(_t('बच्चा जोड़ें'))}</b><p class="k-sub small">${e2(_t('बच्चे के फ़ोन में Piyu Kids → पैरेंट → सेटिंग → "जोड़ने का कोड बनाएँ" से 6 अंकों का कोड लीजिए।'))}</p><div class="k-linkrow"><input id="kfCode" inputmode="numeric" maxlength="6" placeholder="••••••"><button class="k-btn" data-kf="link">🔗 ${e2(_t('जोड़ें'))}</button></div><div class="k-msg" id="kfMsg"></div></div>
      ${alerts.length ? `<div class="k-sec"><h3>${e2(_t('हाल की सूचनाएँ'))}</h3></div><div class="k-alerts">${alerts.slice(0, 10).map(a => `<div class="k-alert ${a.kind}"><div><b>${e2(a.title)}</b><small>${e2(a.body || '')}</small></div><span>${e2(ago(a.at))}</span></div>`).join('')}</div>` : ''}</div></div>`, 'kfamily', 'k-ov-parent');
    if (alerts.length) api('/api/family/alerts/seen', { upto: Math.max(...alerts.map(a => a.id)) });
  }
  document.addEventListener('click', async e => {
    const b = e.target.closest('[data-kf]'); if (!b) return; const a = b.dataset.kf;
    if (a === 'close') P.closeOv();
    else if (a === 'open') openPanel(srcFamily(+b.dataset.id));
    else if (a === 'link') {
      const code = (el('kfCode').value || '').trim(); const msg = el('kfMsg'); if (!/^\d{6}$/.test(code)) { msg.textContent = _t('6 अंकों का कोड डालिए'); return; }
      const r = await api('/api/family/link', { code }); if (!r.ok) { msg.textContent = r.j.error === 'self' ? _t('यह आपका अपना फ़ोन है') : _t('कोड ग़लत है या पुराना हो गया'); return; }
      P.sfx('win'); toast(_t('बच्चा जुड़ गया ✅')); (S.settings.family = S.settings.family || {}).on = true; save(); boot(); family();
    }
  });
  /* ---------- alerts for a parent: the Android service polls with the app closed; here the app itself polls (browser / app open) ---------- */
  let pollT = null;
  async function boot() {
    if (!window.featOn || !featOn('kids')) return; if (S.settings.mode === 'kids') return;
    const r = await api('/api/family/children'); if (!r.ok) return; const f = S.settings.family = S.settings.family || {}; f.on = (r.j.children || []).length > 0; save();
    const btn = el('famRow'); if (btn) btn.hidden = false;
    if (!f.on) { if (isNativeApp() && PiyuNative.famAvail) PiyuNative.famStop(); clearInterval(pollT); return; }
    if (f.since == null) { const al = await api('/api/family/alerts'); f.since = al.ok && al.j.alerts.length ? Math.max(...al.j.alerts.map(a => a.id)) : 0; save(); }
    if (isNativeApp() && PiyuNative.famAvail) { await PiyuNative.famStart({ server: serverBase(), token: S.settings.token || '', device: DEVICE, loc: false, alerts: true, since: f.since, famTitle: _t('👪 Piyu फ़ैमिली'), famText: _t('बच्चे की सूचनाएँ चालू हैं') }); }
    else { clearInterval(pollT); pollT = setInterval(pollAlerts, 60000); setTimeout(pollAlerts, 4000); }
  }
  async function pollAlerts() {
    const f = S.settings.family; if (!f || !f.on) return; const r = await api('/api/family/alerts?since=' + (f.since || 0)); if (!r.ok) return;
    for (const a of r.j.alerts) {
      f.since = Math.max(f.since || 0, a.id); toast(a.title); notify(a.title, a.body || '', 'fam' + a.id);
      if (a.kind === 'sos') { try { navigator.vibrate && navigator.vibrate([600, 200, 600, 200, 600]); } catch (er) { } const was = S.settings.vol; say(a.title, { interrupt: true, mood: 'urgent' }); sosScreen(a); }
    }
    if (r.j.alerts.length) save();
    if (f.sharePos) { try { const p = await P.getPos(8000); api('/api/family/pos', { on: true, lat: p.lat, lng: p.lng }); } catch (er) { } }
  }
  function sosScreen(a) { P.ov(`<div class="k-center k-sosbox"><div class="k-burst red">🆘</div><h2>${e2(a.title)}</h2><p class="k-sub">${e2(a.body || '')}</p><button class="k-btn red" data-kf="open" data-id="${a.child_uid}">📍 ${e2(_t('लोकेशन देखें'))}</button><button class="k-btn ghost" data-kf="close">${e2(_t('बंद करें'))}</button></div>`, 'ksosalert', 'k-ov-solid red'); }

  window.PiyuKidsParent = { redraw() { if (PN && PN.d && !PN.pick) draw(); }, open, openPanel, family, boot, pollAlerts, srcFamily, srcLocal };
  document.addEventListener('click', e => { if (e.target.closest('#famBtn')) family(); });
})();
