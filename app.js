'use strict';
const _t = PiyuI18n.tr, _t2 = PiyuI18n.tr2;
/* Piyu — offline personal assistant. No server, no paid API. */
const C = window.PiyuCore;
const $ = s => document.querySelector(s);
const $$ = s => [...document.querySelectorAll(s)];
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 10);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ================= state ================= */
const KEY = 'piyu.v1';
const DEF = { docs: [], tasks: [], settings: { lang: 'hi', micLang: '', pvBn: '', pvMr: '', pvUr: '', voiceHi: '', voiceEn: '', rate: 0.9, pitch: 1.2, vol: 1, preMin: 10, call: 'सर', owner: 'कमर आलम', ownerEn: 'Kamar Alam', wake: true, briefOn: true, briefMorning: '08:00', briefNight: '21:30', ocrLang: 'eng+hin', pvHi: 'hi-priyamvada', pvEn: 'en-jenny', persona: 'piyu', mindRoman: true, mindEmpathy: true, mindAsk: true, webOn: false, style: 'normal', pitchSt: 0, hinglish: true, aiOn: false, aiModel: '', wakeOn: false, quietOn: false, quietFrom: '23:00', quietTo: '07:00', quietHard: false } };
let S = JSON.parse(JSON.stringify(DEF));
S.tombstones = []; S.settingsAt = 0; S.facts = []; S.episodes = []; S.days = []; S.kb = []; S.courses = []; S.cards = []; S.attempts = []; S.sdays = []; S.mind = PiyuMind.newMind();
const storeReady = Store.load().then(st => {
  if (st) { S = st; }
  S.docs = S.docs || []; S.tasks = S.tasks || []; S.tombstones = S.tombstones || []; S.settingsAt = S.settingsAt || 0;
  S.facts = S.facts || []; S.episodes = S.episodes || []; S.days = S.days || []; S.kb = S.kb || []; S.courses = S.courses || []; S.cards = S.cards || []; S.attempts = S.attempts || []; S.sdays = S.sdays || []; if (!S.mind) S.mind = PiyuMind.newMind();
  S.settings = Object.assign({}, DEF.settings, S.settings);
  try { detectLang(); } catch (e) { }
  snapshot();
}).catch(() => { snapshot(); }).then(() => PiyuI18n.setLang(S.settings.lang)).then(() => { try { langChips(); PiyuI18n.applyDom(); loginUI(); if (window.PiyuStudent) PiyuStudent.loginUI(); } catch (e) { } });

/* change tracking: every task/doc gets an updatedAt stamp when it changes, deletions become tombstones (needed for sync) */
const skipStamp = (k, v) => k === 'updatedAt' ? undefined : v;
let snapT = new Map(), snapD = new Set(), snapSet = '', snapX = {}, snapMind = '';
const XLISTS = [['facts', 'fact'], ['episodes', 'ep'], ['days', 'day'], ['kb', 'kb'], ['courses', 'course'], ['cards', 'card'], ['attempts', 'att'], ['sdays', 'sday']];
const setKey = () => JSON.stringify(S.settings, (k, v) => Store.DEVICE_KEYS.includes(k) ? undefined : v);
function snapshot() {
  snapT = new Map(S.tasks.map(t => [t.id, JSON.stringify(t, skipStamp)]));
  snapD = new Set(S.docs.map(d => d.id)); snapSet = setKey();
  XLISTS.forEach(([l]) => { snapX[l] = new Map((S[l] || []).map(x => [x.id, JSON.stringify(x, skipStamp)])); });
  snapMind = JSON.stringify(S.mind, skipStamp);
}
function stamp() {
  const now = Date.now(), ids = new Set();
  S.tasks.forEach(t => {
    ids.add(t.id); const j = JSON.stringify(t, skipStamp);
    if (snapT.get(t.id) !== j) { t.updatedAt = now; snapT.set(t.id, j); }
  });
  [...snapT.keys()].forEach(id => { if (!ids.has(id)) { S.tombstones.push({ kind: 'task', id, at: now }); snapT.delete(id); } });
  const dids = new Set(S.docs.map(d => d.id));
  S.docs.forEach(d => { if (!d.updatedAt) d.updatedAt = now; });
  [...snapD].forEach(id => { if (!dids.has(id)) { S.tombstones.push({ kind: 'doc', id, at: now }); snapD.delete(id); } });
  dids.forEach(id => snapD.add(id));
  const sk = setKey(); if (sk !== snapSet) { S.settingsAt = now; snapSet = sk; }
  XLISTS.forEach(([l, kind]) => {
    const arr = S[l] = S[l] || [], m = snapX[l] = snapX[l] || new Map(), seen = new Set();
    arr.forEach(x => { seen.add(x.id); const j = JSON.stringify(x, skipStamp); if (m.get(x.id) !== j) { x.updatedAt = now; m.set(x.id, j); } });
    [...m.keys()].forEach(id => { if (!seen.has(id)) { S.tombstones.push({ kind, id, at: now }); m.delete(id); } });
  });
  const mj = JSON.stringify(S.mind, skipStamp); if (mj !== snapMind) { S.mind.updatedAt = now; snapMind = mj; }
}
/* Android app: is a newer APK published on my Piyu server?  (Android needs one tap to install — silent installs are not possible for sideloaded apps) */
let updInfo = null;
async function checkAppUpdate(manual) {
  if (!(window.PiyuNative && PiyuNative.isNative)) return null;
  try {
    const r = await fetchT('/apk/version.json', { cache: 'no-store' }, 8000); if (!r.ok) throw new Error('http ' + r.status);
    const j = await r.json(), mine = await PiyuNative.appVersion();
    updInfo = j.versionCode > mine ? j : null;
    const el = document.getElementById('updInfo');
    if (el) el.innerHTML = updInfo ? _t("🆕 नया Piyu (v{0}, {1} MB) — <button class=\"btn\" id=\"updBtn\">⬆ अपडेट करें</button>", [j.versionName, (Math.round(j.size / 1e5) / 10)]) : _t("✅ Piyu अप-टू-डेट है");
    const b = document.getElementById('updBtn'); if (b) b.onclick = () => { PiyuNative.openUrl(U('/apk/piyu.apk')); toast(_t("APK डाउनलोड हो रही है — खुलने पर \"Install\" दबाएँ")); };
    if (updInfo && !manual && sessionStorage.getItem('piyu.updShown') !== String(j.versionCode)) { try { sessionStorage.setItem('piyu.updShown', String(j.versionCode)); } catch (e) { } toast(_t("🆕 Piyu का नया version तैयार है — Settings में \"अपडेट करें\" दबाएँ")); }
  } catch (e) { if (manual) { const el = document.getElementById('updInfo'); if (el) el.textContent = _t("⚠ अपडेट जाँच नहीं हो पाई (server से जुड़ नहीं पाई)"); } }
  return updInfo;
}
/* real phone alarms (Android app only): keep the phone's own alarm list equal to the plan, so alarms ring with the app closed */
let nativeT = null, permInfo = async () => { };
function nativeSoon() { if (!window.PiyuNative || !PiyuNative.available) return; clearTimeout(nativeT); nativeT = setTimeout(nativeNow, 800); }
async function nativeNow() {
  try { const r = await PiyuNative.sync(C.planAlarms(S.tasks, S.settings, Date.now())); if (r && r.error) console.warn('native', r.error); return r; } catch (e) { }
}
let saveErr = false, dirtySeq = 1, syncedSeq = 0, lastRev = 0;   // dirtySeq moves on every local change: an unchanged app + unchanged server = no data sent at all
function save() {
  dirtySeq++;
  stamp();
  nativeSoon();
  Store.save(S).then(ok => { if (!ok && !saveErr) { saveErr = true; toast('⚠ Data save nahi ho paaya — storage bhar gaya ho sakta hai'); } });
  scheduleSync();
}

/* ---------- sync with server.py (same Wi-Fi / same computer) ---------- */
let syncT = null, syncing = false, syncInfo = { ok: null, at: 0, msg: 'अभी sync नहीं हुआ' };
/* device identity: a random secret made once per phone/browser. In the Android app it comes from the phone itself (ANDROID_ID, hashed) so it survives re-installs.
   A user token binds to the FIRST device that uses it: every request carries this id next to the token. */
const randHex = n => Array.from(crypto.getRandomValues(new Uint8Array(n)), b => b.toString(16).padStart(2, '0')).join('');
let DEVICE = ''; try { DEVICE = localStorage.getItem('piyu.device') || ''; } catch (e) { }
if (!/^[0-9a-f]{32,}$/.test(DEVICE)) { DEVICE = randHex(24); try { localStorage.setItem('piyu.device', DEVICE); } catch (e) { } }
const deviceReady = (async () => { try { if (window.PiyuNative && PiyuNative.isNative && PiyuNative.deviceId) { const id = await PiyuNative.deviceId(); if (id) DEVICE = await sha256hex('piyu-android:' + id); } } catch (e) { } })();
async function sha256hex(t) { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(t)))].map(b => b.toString(16).padStart(2, '0')).join(''); }
const hdrs = () => S.settings.token ? { 'X-Piyu-Token': S.settings.token, 'X-Piyu-Device': DEVICE } : {};
const DEV_ONLY = ['token', 'pinHash', 'loggedIn', 'serverUrl'];           // belong to this phone only: never sent to the server
let knownDocs = null;                      // document ids the server already has (used when the admin switched uploads off)
const stateOut = () => { const c = Object.assign({}, S); c.settings = Object.assign({}, S.settings); DEV_ONLY.forEach(k => delete c.settings[k]); if (!featOn('docs') && knownDocs) c.docs = (S.docs || []).filter(d => knownDocs.has(d.id)); return c; };
let ME = {};
/* switches the admin can turn off per user (voice / ai / web / docs / student / business) */
const featOn = k => !ME.features || ME.features[k] !== false;
let voiceBlocked = false;
function showAnnouncement(t) {
  const bar = document.getElementById('annBar'); if (!bar) return; t = String(t || '').trim(); let seen = ''; try { seen = localStorage.getItem('piyu.annx') || ''; } catch (e) { }
  bar.hidden = !t || seen === t; document.getElementById('annTxt').textContent = t; bar.dataset.t = t;
}
function applyFeatures() {
  const f = ME.features || {};
  document.body.classList.toggle('nodocs', f.docs === false);
  document.querySelectorAll('#modeBox [data-mode],#setModeCard [data-mode]').forEach(b => { b.hidden = f[b.dataset.mode] === false; });
  if (window.PiyuStudent) {
    if (f.student === false && S.settings.mode === 'student') { S.settings.mode = 'business'; save(); PiyuStudent.applyMode(); }
    else if (f.business === false && f.student !== false && S.settings.mode !== 'student' && !$('#app').hidden) { S.settings.mode = 'student'; save(); PiyuStudent.applyMode(); PiyuStudent.onboard(); }
  }
  if (f.voice === false) { voiceBlocked = true; try { stopSpeaking(); } catch (e) { } } else voiceBlocked = false;
  showAnnouncement(ME.announcement);
}
/* the Android app is served from the phone itself, so it needs the address of the Piyu server (device setting, empty in a browser) */
const serverBase = () => String(S.settings.serverUrl || window.PIYU_DEFAULT_SERVER || '').replace(/\/+$/, '');   // APK: the address is built in (Settings can override it)
const U = p => serverBase() + p;
const fetchU = (p, o) => fetch(U(p), o);
function scheduleSync() { clearTimeout(syncT); syncT = setTimeout(syncNow, 1500); }
/* fetch with a timeout, so one hung request can never leave syncing=true forever */
async function fetchT(url, opts, ms) {
  const ac = new AbortController(), id = setTimeout(() => ac.abort(), ms || 20000);
  try { return await fetch(U(url), Object.assign({}, opts, { signal: ac.signal })); } finally { clearTimeout(id); }
}
let syncFails = 0, tokenAsked = false;
const ACCESS_MSG = {
  token: 'Token चाहिए (Settings → Sync token)',
  pending: 'Owner की मंज़ूरी बाकी है — Owner से token लेकर यहाँ डालिए',
  revoked: 'आपका access बंद कर दिया गया है — Owner से बात कीजिए',
  device: 'यह token किसी दूसरे phone से जुड़ चुका है — Owner से "Device reset" करवाइए',
  locked: 'बहुत ज़्यादा ग़लत कोशिशें — थोड़ी देर बाद फिर कीजिए'
};
function accessProblem(code) {
  code = ACCESS_MSG[code] ? code : 'token';
  syncInfo = { ok: false, at: Date.now(), msg: ACCESS_MSG[code], access: code };
  if (!tokenAsked) { tokenAsked = true; setTimeout(() => askToken(code), 400); }      // ask once per start; the red banner stays until it is fixed
}
function askToken(code) {
  const dlg = $('#tokDlg'); if (!dlg || dlg.open) return;
  $('#tokIn').value = ''; $('#tokMsg').textContent = (typeof code === 'string' && code !== 'token' && ACCESS_MSG[code]) ? '⚠ ' + _t(ACCESS_MSG[code]) : '';
  try { $('#reqName').value = localStorage.getItem('piyu.reqName') || ''; $('#reqPhone').value = localStorage.getItem('piyu.reqPhone') || ''; } catch (e) { }
  { const must = !S.settings.token && !localStorage.getItem('piyu.req'); $('#tokLater').hidden = must; dlg.oncancel = e => { if (must) e.preventDefault(); }; }      // nobody can wave the dialog away without a token or a request
  $('#reqMsg').textContent = ''; if (localStorage.getItem('piyu.req')) { checkReg(); clearInterval(regTimer); regTimer = setInterval(() => { if (!$('#tokDlg').open) clearInterval(regTimer); else checkReg(); }, 15000); }
  try { dlg.showModal(); } catch (e) { const t = prompt(_t('इस server का Sync token डालें (जो सिर्फ़ आपको पता है)'), ''); if (t) applyToken(t); return; }
  setTimeout(() => $('#tokIn').focus(), 200);
}
let regTimer = null;
async function verifyToken(t) {           // -> {ok, code}.  /api/me also binds the token to THIS device when it is the first one to use it
  try {
    const r = await fetchT('/api/me', { headers: { 'X-Piyu-Token': t, 'X-Piyu-Device': DEVICE }, cache: 'no-store' }, 12000);
    if (r.ok) return { ok: true, me: await r.json() };
    let c = 'token'; try { c = (await r.json()).error || 'token'; } catch (e) { } if (r.status === 429) c = 'locked';
    return { ok: false, code: c };
  } catch (e) { return { ok: false, code: 'net' }; }
}
const tokenProblemText = c => c === 'net' ? _t('server तक नहीं पहुँच पा रही — इंटरनेट जाँचें') : c === 'token' ? _t('Token सही नहीं है') : _t(ACCESS_MSG[c] || ACCESS_MSG.token);
async function applyToken(t) {
  t = String(t || '').trim(); if (!t) return false;
  const v = await verifyToken(t);
  if (!v.ok) { $('#tokMsg').textContent = '⚠ ' + tokenProblemText(v.code); return false; }
  ME = v.me || {}; S.settings.token = t; save(); const el = document.getElementById('setToken'); if (el) el.value = t;
  if ($('#tokDlg').open) $('#tokDlg').close(); clearInterval(regTimer); tokenAsked = false;
  toast(_t('✅ Token सही है — अब आवाज़ और sync चलेंगे')); await syncNow(true); detectNeural(); refreshAI(); refreshWeb(); showSync(); showAdminLink();
  return true;
}
async function requestAccess() {
  const name = $('#reqName').value.trim(), phone = $('#reqPhone').value.trim(), m = $('#reqMsg');
  if (name.length < 2) { m.textContent = '⚠ ' + _t('अपना नाम लिखिए'); return; }
  m.textContent = '⏳ …';
  try {
    const r = await fetchT('/api/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, phone, device: DEVICE }) }, 12000);
    if (r.status === 429) { m.textContent = '⚠ ' + _t('बहुत बार कोशिश हो चुकी — थोड़ी देर बाद फिर कीजिए'); return; }
    if (!r.ok) { m.textContent = '⚠ ' + _t('नाम या जानकारी ठीक नहीं है'); return; }
    try { localStorage.setItem('piyu.req', '1'); localStorage.setItem('piyu.reqName', name); localStorage.setItem('piyu.reqPhone', phone); } catch (e) { }
    m.textContent = '✅ ' + _t('Request Owner को भेज दी गई। Owner से phone / WhatsApp पर token माँगिए, फिर ऊपर डालिए।');
    clearInterval(regTimer); regTimer = setInterval(() => { if (!$('#tokDlg').open) clearInterval(regTimer); else checkReg(); }, 15000);
  } catch (e) { m.textContent = '⚠ ' + _t('server तक नहीं पहुँच पा रही — इंटरनेट जाँचें'); }
}
async function checkReg() {
  const m = $('#reqMsg');
  try {
    const st = (await (await fetchT('/api/register/status?device=' + encodeURIComponent(DEVICE), { cache: 'no-store' }, 10000)).json()).status;
    m.textContent = st === 'pending' ? '⏳ ' + _t('Owner की मंज़ूरी का इंतज़ार है') : (st === 'approved' || st === 'active') ? '✅ ' + _t('Owner ने मंज़ूर कर दिया — उनसे token लेकर ऊपर डालिए') : st === 'revoked' ? '⛔ ' + _t(ACCESS_MSG.revoked) : '';
  } catch (e) { }
}
async function loadMe() { try { const r = await fetchT('/api/me', { headers: hdrs(), cache: 'no-store' }, 8000); if (r.ok) { ME = await r.json(); showAdminLink(); applyFeatures(); } } catch (e) { } }
function showAdminLink() { const row = $('#adminRow'); if (!row) return; row.hidden = ME.role !== 'owner'; const a = $('#adminLink'); if (a) { a.href = serverBase() + '/admin'; a.onclick = e => { if (isNativeApp() && PiyuNative.openUrl) { e.preventDefault(); PiyuNative.openUrl(a.href); } }; } }
$('#reqSend').onclick = requestAccess; $('#reqCheck').onclick = checkReg;
$('#tokOk').onclick = () => applyToken($('#tokIn').value);
$('#tokIn').addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); applyToken($('#tokIn').value); } });
$('#tokLater').onclick = () => $('#tokDlg').close();
$('#tokBanner').onclick = askToken; $('#tokBanner').onkeydown = e => { if (e.key === 'Enter') askToken(); };
async function syncNow(manual) {
  if (syncing) return; syncing = true;
  let done = false;
  try {
    for (let attempt = 0; attempt < 5 && !done; attempt++) {
      const quick = lastRev && syncedSeq === dirtySeq;      // nothing changed here: just ask whether anything changed there (tiny reply)
      const r = await fetchT('/api/state' + (quick ? '?since=' + lastRev : ''), { headers: hdrs(), cache: 'no-store' }, 20000);
      if (r.status === 401 || r.status === 403 || r.status === 429) {
        let code = 'token'; try { code = (await r.json()).error || 'token'; } catch (e) { } if (r.status === 429) code = 'locked';
        if (code === 'feature') { loadMe(); done = true; break; }
        accessProblem(code); done = true; break;
      }
      if (!r.ok) throw new Error('http ' + r.status);
      const j = await r.json();
      if (j.same) { syncInfo = { ok: true, at: Date.now(), msg: "Sync हो गया" }; syncFails = 0; done = true; break; }
      const { state: remote, rev } = j;
      if (remote && Array.isArray(remote.docs)) knownDocs = new Set(remote.docs.map(d => d.id));
      let changed = false;
      if (remote) changed = Store.mergeState(S, remote);
      if (changed) { dirtySeq++; snapshot(); await Store.save(S); render(); }
      stamp();
      const mark = dirtySeq;
      let body = JSON.stringify({ baseRev: rev, state: stateOut() }), hd = Object.assign({ 'Content-Type': 'application/json' }, hdrs());
      if (body.length > 4000 && typeof CompressionStream !== 'undefined') {        // state uploads are text: ~5x smaller on the wire
        try { body = await new Response(new Blob([body]).stream().pipeThrough(new CompressionStream('gzip'))).blob(); hd['Content-Encoding'] = 'gzip'; } catch (e) { }
      }
      const p = await fetchT('/api/state', { method: 'PUT', headers: hd, body }, 60000);
      if (p.status === 409) { await sleep(150 + Math.random() * 300); continue; }   // someone else saved first: fetch, merge again
      if (p.status === 403) { let pe = {}; try { pe = await p.json(); } catch (e) { } if (pe.error === 'feature') { loadMe(); syncInfo = { ok: false, at: Date.now(), msg: 'Admin ने यह सुविधा बंद की है' }; done = true; break; } }
      if (!p.ok) throw new Error('put ' + p.status);
      try { const pj = await p.json(); lastRev = pj.rev || 0; if (dirtySeq === mark) syncedSeq = mark; } catch (e) { }
      if (!ME.role) loadMe();
      syncInfo = { ok: true, at: Date.now(), msg: "Sync हो गया" }; syncFails = 0; done = true;
      uploadBlobs().then(pullBlobs);
    }
    if (!done) throw new Error('conflict');
  } catch (e) {
    syncFails++;
    syncInfo = { ok: false, at: Date.now(), msg: e.message === 'conflict' ? "बार-बार टकराव — थोड़ी देर में फिर कोशिश करूँगी" : "Server से जुड़ नहीं पाई (offline)" };
    if (manual) toast(_t("Sync नहीं हुआ — {0}", [_t(syncInfo.msg)]));
    setTimeout(syncNow, Math.min(60000, 3000 * syncFails));   // retry with backoff
  }
  syncing = false; showSync();
}
function showSync() {
  const b = $('#tokBanner'); if (b) { b.hidden = !(syncInfo.ok === false && syncInfo.access); if (!b.hidden) b.textContent = '🔑 ' + _t(ACCESS_MSG[syncInfo.access] || ACCESS_MSG.token) + ' (' + _t('यहाँ दबाइए') + ')'; }
  const el = $('#syncStatus'); if (!el) return;
  el.textContent = (syncInfo.ok ? '🟢 ' : syncInfo.ok === false ? '🟠 ' : '⚪ ') + _t(syncInfo.msg) + (syncInfo.at ? ' · ' + hm(syncInfo.at) : '');
}

/* ================= usage tracking (for the admin panel): a tiny beat every 30 s while the app is open ================= */
const SID = randHex(12); let tLast = Date.now();
const trackTab = () => window.__ovTab || ((document.querySelector('.tab.active') || {}).id || 'tab-app').replace('tab-', '');
async function trackBeat(wasVisible) {
  const app = document.getElementById('app'); if (!app || app.hidden) { tLast = Date.now(); return; }
  const now = Date.now(), vis = wasVisible === true || document.visibilityState === 'visible', dt = vis ? Math.min(60, (now - tLast) / 1000) : 0; tLast = now;
  try {
    const r = await fetch(U('/api/track'), { method: 'POST', headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()), keepalive: true, body: JSON.stringify({ sid: SID, tab: trackTab(), dt: Math.round(dt), vis, mode: S.settings.mode === 'student' ? 'student' : 'business' }) });
    if (r.ok) { const j = await r.json(); if (j.announcement !== undefined) showAnnouncement(j.announcement); }
  } catch (e) { }
}
setInterval(() => { if (document.visibilityState === 'visible') trackBeat(); else tLast = Date.now(); }, 30000);
document.addEventListener('visibilitychange', () => { if (document.hidden) trackBeat(true); else tLast = Date.now(); });
document.addEventListener('click', e => { if (e.target.id === 'annX') { const b = document.getElementById('annBar'); try { localStorage.setItem('piyu.annx', b.dataset.t || ''); } catch (er) { } b.hidden = true; } });

/* ================= time helpers ================= */
const pad = n => String(n).padStart(2, '0');
const DN = ['रवि', 'सोम', 'मंगल', 'बुध', 'गुरु', 'शुक्र', 'शनि'];
const DNE = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
function hm(ts) { const d = new Date(ts); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + pad(d.getMinutes()) + ' ' + ap; }
function dayKey(ts) { const d = new Date(ts); return d.getFullYear() * 10000 + d.getMonth() * 100 + d.getDate(); }
function dayLabel(ts) {
  const k = dayKey(ts), n = Date.now();
  if (k === dayKey(n)) return _t("आज");
  if (k === dayKey(n + 864e5)) return _t("कल");
  const d = new Date(ts); return DNE[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()];
}
function full(ts) { return dayLabel(ts) + ', ' + hm(ts); }
function cdText(ms) {
  const neg = ms < 0; ms = Math.abs(ms);
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60), sec = s % 60;
  return (neg ? '-' : '') + (d ? d + 'd ' : '') + (d || h ? pad(h) + ':' : '') + pad(m) + ':' + pad(sec);
}
function toLocalInput(ts) { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + 'T' + pad(d.getHours()) + ':' + pad(d.getMinutes()); }

function toast(m) { const t = $('#toast'); t.textContent = PiyuI18n.lang === 'hi' ? VK.genderize(m, voiceGender()) : m; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, 3200); }

/* ================= VOICE (soft female, no breaks) ================= */
let neural = false; // true when server.py offers Piyu's own neural voice
const synth = window.speechSynthesis;
let voices = [];
let speakingCount = 0;
const FEMALE = /female|woman|heera|kalpana|swara|neerja|priya|veena|lekha|zira|aria|jenny|samantha|karen|tessa|moira|fiona|susan|hazel|sonia|libby|natasha|google हिन्दी|google uk english female|google us english|hindi/i;
const MALE = /\bmale\b|hemant|ravi\b|prabhat|madhur|david|mark|guy|daniel|alex\b|fred|george|james|rishi/i;
const ROBOT = /espeak|mbrola|festival/i;

function loadVoices() {
  if (!synth) return;
  voices = synth.getVoices();
  fillVoiceSelects();
}
if (synth) { loadVoices(); synth.onvoiceschanged = loadVoices; }

function score(v, lang) {
  let s = 0;
  const n = v.name + ' ' + v.voiceURI;
  if (FEMALE.test(n)) s += 6;
  if (MALE.test(n)) s -= 8;
  if (/neural|natural|online|google|premium|enhanced/i.test(n)) s += 4;
  if (ROBOT.test(n)) s -= 5;
  if (v.lang.toLowerCase().replace('_', '-') === lang) s += 3;
  return s;
}
function pick(lang) {
  const pref = lang === 'hi' ? S.settings.voiceHi : lang === 'en' ? S.settings.voiceEn : '';
  if (pref) { const v = voices.find(x => x.voiceURI === pref); if (v) return v; }
  const list = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
  if (!list.length) return null;
  const want = (PiyuI18n.LANGS[lang] || PiyuI18n.LANGS.en).sr.toLowerCase();
  return list.sort((a, b) => score(b, want) - score(a, want))[0];
}
const hasHindi = () => neural || !!pick('hi');

function fillVoiceSelects() {
  const fill = (sel, lang, cur) => {
    const list = voices.filter(v => v.lang.toLowerCase().startsWith(lang));
    sel.innerHTML = _t("<option value=\"\">Auto (सबसे मुलायम महिला आवाज़)</option>{0}", [list.map(v => `<option value="${esc(v.voiceURI)}">${esc(v.name)} (${esc(v.lang)})</option>`).join('')]);
    sel.value = cur || '';
  };
  fill($('#setVoiceHi'), 'hi', S.settings.voiceHi);
  fill($('#setVoiceEn'), 'en', S.settings.voiceEn);
  if (neural) { $('#voiceHint').textContent = _t("✔ Piyu अपनी offline neural आवाज़ इस्तेमाल कर रही है: Priyamvada (हिन्दी) + Jenny (English)। कोई internet या API नहीं लगता।"); return; }
  const h = pick('hi'), e = pick('en');
  $('#voiceHint').textContent = (h ? _t("हिन्दी: {0}", [h.name]) : _t("⚠ इस device पर हिन्दी आवाज़ नहीं मिली — English आवाज़ इस्तेमाल होगी")) + ' · ' + (e ? 'English: ' + e.name : _t("English आवाज़ नहीं मिली")) +
    (h && ROBOT.test(h.name) || e && ROBOT.test(e.name) ? _t(" · ⚠ यह robotic (espeak) आवाज़ है — Chrome / Edge इस्तेमाल करें, उनमें मुलायम Google/Microsoft आवाज़ें मिलती हैं।") : '');
}

/* split into Hindi (Devanagari) / other runs so each gets the right voice */
const SCRIPT = { hi: '\u0900-\u097F', mr: '\u0900-\u097F', bn: '\u0980-\u09FF', ur: '\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF' };
function segments(text, lang) {
  if (lang === 'en' || !SCRIPT[lang]) return [{ t: text, lang: 'en' }];
  const out = [], sc = SCRIPT[lang];
  text.split(new RegExp('([' + sc + '][' + sc + '\\s,।۔،؟?!.\\-]*)')).forEach(p => {
    if (!p.trim()) return;
    out.push({ t: p, lang: new RegExp('[' + sc + ']').test(p) ? lang : 'en' });
  });
  // glue pure punctuation/number fragments to the previous run
  const merged = [];
  out.forEach(s => {
    if (merged.length && !/[\p{L}]/u.test(s.t)) merged[merged.length - 1].t += s.t; else merged.push(s);
  });
  return merged;
}
/* short chunks at natural pauses: long single utterances are what makes browsers cut the voice */
function chunk(t, max) {
  const parts = t.replace(/\s+/g, ' ').match(/[^.!?।;:\n]+[.!?।;:]?/g) || [t];
  const out = [];
  parts.forEach(p => {
    p = p.trim(); if (!p) return;
    while (p.length > max) {
      let i = p.lastIndexOf(',', max); if (i < 30) i = p.lastIndexOf(' ', max); if (i < 20) i = max;
      out.push(p.slice(0, i + 1).trim()); p = p.slice(i + 1).trim();
    }
    if (p) out.push(p);
  });
  const merged = [];                                   // tiny pieces sound choppy: glue them to a neighbour when it still fits
  out.forEach(p => { const l = merged.length - 1; if (l >= 0 && (merged[l].length < 22 || p.length < 14) && merged[l].length + 1 + p.length <= max && !/[.!?।]$/.test(merged[l])) merged[l] += ' ' + p; else merged.push(p); });
  return merged;
}
function cleanForSpeech(t) {
  return t.replace(/https?:\/\/\S+/g, 'link').replace(/[_`*#|→·•]/g, ' ').replace(/₹/g, ' रुपये ').replace(/\s+/g, ' ');
}

function setSpeaking(on) { $('#orb').classList.toggle('speaking', on); $('#status').textContent = on ? _t("बोल रही हूँ…") : (wake && wake.rec ? _t("👂 सुन रही हूँ") : _t("तैयार")); }
let vtoken = 0, vsources = [], neuralBusy = 0, playAt = 0;
function stopSpeaking() {
  vtoken++; vsources.forEach(x => { try { x.stop(); } catch (e) { } }); vsources = []; neuralBusy = 0; playAt = 0;
  speakingCount = 0; if (synth) synth.cancel();
  if (isNativeApp() && PiyuNative.ttsAvail) PiyuNative.ttsStop();
  setSpeaking(false);
}
const isSpeaking = () => speakingCount > 0 || neuralBusy > 0 || (synth && synth.speaking) || !!(window.PiyuNative && PiyuNative.ttsPending && PiyuNative.ttsPending.size);

async function detectNeural() {
  try {
    const st = await (await fetchU('/tts-status')).json();
    neural = !!(st.piper && st.hi && st.en);
    ttsWhy = '';
    if (neural && st.auth) { const r = await fetchU('/tts?lang=en&text=ok', { headers: hdrs() }); neural = r.ok; if (!r.ok) ttsWhy = r.status === 403 ? 'feature' : 'token'; if (!r.ok) setTimeout(() => { const b = $('#voiceDiag'); if (b) b.textContent = '🔇 ' + _t('आवाज़ बंद: Sync token चाहिए'); }, 500); if (!r.ok) toast(_t("Piyu की आवाज़ के लिए Settings में Sync token डालें")); }
  } catch (e) { neural = false; }
  fillVoiceSelects();
}
/* ---- voice library (Piper voices with gender) + Hindi grammar + Hinglish reading ---- */
let voiceLib = [];
const voiceById = id => voiceLib.find(v => v.id === id);
const voiceGender = () => (voiceById(S.settings.pvHi) || {}).gender || 'female';
async function loadVoiceLib() {
  try { const r = await fetchT('/api/voices', { headers: hdrs(), cache: 'no-store' }, 5000); voiceLib = r.ok ? (await r.json()).voices : []; } catch (e) { voiceLib = []; }
  voiceUI();
}
/* text as it should be spoken: masculine grammar for a male voice, Roman Hindi turned into Devanagari for the Hindi voice */
function forSpeech(text) {
  let t = VK.genderize(text, voiceGender());
  if (S.settings.hinglish !== false && S.settings.lang === 'hi') t = PiyuTranslit.hinglish(t);
  return t;
}
const learnedDelta = mood => (S.mind && S.mind.on ? PiyuMind.voiceDelta(S.mind, PiyuMind.ctxKey(Date.now(), mood || 'calm')) : null);   // what Piyu has learnt about how you like her voice
function vparams(mood) { return VK.voiceParams(S.settings.mode === 'student' ? 'teacher' : S.settings.style, mood, S.settings.rate, S.settings.pitchSt, learnedDelta(mood)); }
const pvFor = lang => lang === 'hi' ? S.settings.pvHi : lang === 'en' ? S.settings.pvEn : (S.settings['pv' + lang[0].toUpperCase() + lang.slice(1)] || '');
const speechLang = () => SCRIPT[S.settings.lang] ? S.settings.lang : 'en';   // the language Piyu speaks (hi / mr / bn / ur, else English)

/* the phone's own Google voice (Android app): the most natural Indian Hindi / Hinglish / Indian English, no server, no gaps */
let phoneTts = null;
const usePhone = lang => { const m = S.settings.engine || 'auto'; return isNativeApp() && PiyuNative.ttsAvail && !!phoneTts && phoneTts.ready && m !== 'piper' && !!(phoneTts[lang] && phoneTts[lang].ok); };
async function sayPhone(text, interrupt, mood) {
  if (interrupt) stopSpeaking();
  const lang = speechLang(), t = cleanForSpeech(forSpeech(text)), vp = vparams(mood), voice = ((S.settings.phv || {})[lang]) || '';
  const parts = chunk(t, 200); if (!parts.length) return true;
  const rate = Math.max(0.6, Math.min(1.5, (S.settings.phRate || 1) / vp.speed)), pitch = Math.max(0.6, Math.min(1.6, Math.pow(2, (vp.pitch || 0) / 12)));
  try {
    setSpeaking(true);
    for (let i = 0; i < parts.length; i++) await PiyuNative.ttsSpeak({ text: parts[i], lang, voice, rate, pitch, flush: i === 0 && !!interrupt });
  } catch (e) { setSpeaking(false); return false; }
  return true;
}
if (window.PiyuNative) PiyuNative.onTtsIdle = () => { if (!neuralBusy && !speakingCount) setSpeaking(false); };

/* Piyu's own offline neural voice (Piper via server.py). Audio is fetched ahead and scheduled back-to-back, so it never breaks. */
async function sayNeural(text, interrupt, mood) {
  if (interrupt) stopSpeaking();
  const my = vtoken, a = audio();
  if (!a) return false;
  if (a.state !== 'running') { try { await a.resume(); } catch (e) { } }
  const lang = speechLang();
  const parts = [];
  segments(cleanForSpeech(forSpeech(text)), lang).forEach(seg => {
    const chs = chunk(seg.t, 220);
    if (!parts.length && chs[0] && chs[0].length > 90) chs.splice(0, 1, ...chunk(chs[0], 90));      // a short first piece: sound starts sooner, the rest is fetched while it plays
    chs.forEach(c => parts.push({ lang: seg.lang, t: c }));
  });
  if (!parts.length) return true;
  const vp = vparams(mood);
  const jobs = [];
  const hd = hdrs();
  const start = i => {
    if (i >= parts.length || jobs[i]) return;
    const p = parts[i];
    jobs[i] = fetchU('/tts?lang=' + p.lang + '&voice=' + encodeURIComponent(pvFor(p.lang)) + '&speed=' + vp.speed + '&noise=' + vp.noise + '&nw=' + vp.nw + (vp.pitch ? '&pitch=' + vp.pitch : '') + '&text=' + encodeURIComponent(p.t), { headers: hd })
      .then(r => { if (!r.ok) throw new Error('tts'); return r.arrayBuffer(); })
      .then(b => a.decodeAudioData(b));
    jobs[i].catch(() => { });
  };
  start(0); start(1); start(2); start(3);
  neuralBusy++; setSpeaking(true);
  const done = () => { if (my === vtoken) { neuralBusy = Math.max(0, neuralBusy - 1); if (!neuralBusy) setSpeaking(false); } };
  try {
    for (let i = 0; i < parts.length; i++) {
      const buf = await jobs[i];
      start(i + 4);
      if (my !== vtoken) return true;
      const src = a.createBufferSource(), g = a.createGain();
      g.gain.value = S.settings.vol; src.buffer = buf; src.connect(g); g.connect(a.destination);
      const t0 = Math.max(a.currentTime + 0.03, playAt);
      src.start(t0); playAt = t0 + buf.duration + (/[.!?।]$/.test(parts[i].t) ? 0.17 : 0.03);      // a real pause only at sentence ends: phrases inside a sentence flow into each other
      vsources.push(src);
      if (i === parts.length - 1) src.onended = done;
    }
  } catch (e) { neuralBusy = Math.max(0, neuralBusy - 1); if (!neuralBusy) setSpeaking(false); return false; }
  return true;
}

function say(text, opts) {
  opts = opts || {};
  if (voiceBlocked) return;
  if (usePhone(speechLang())) {
    sayPhone(text, opts.interrupt !== false, opts.mood).then(ok => { if (!ok) { phoneTts = null; say(text, opts); } });
    return;
  }
  if (neural) {
    sayNeural(text, opts.interrupt !== false, opts.mood).then(ok => { if (!ok && synth) { neural = false; fillVoiceSelects(); say(text, opts); } });
    return;
  }
  if (!synth) return;
  if (opts.interrupt !== false) stopSpeaking();
  const lang = S.settings.lang === 'hi' ? (hasHindi() ? 'hi' : 'en') : speechLang();
  segments(cleanForSpeech(forSpeech(text)), lang).forEach(seg => {
    chunk(seg.t, 150).forEach(c => {
      const u = new SpeechSynthesisUtterance(c);
      const v = pick(seg.lang) || pick(lang) || pick('en');
      if (v) { u.voice = v; u.lang = v.lang; } else u.lang = (PiyuI18n.LANGS[seg.lang] || PiyuI18n.LANGS.en).sr;
      const md = C.MOODS[opts.mood] || C.MOODS.calm;
      u.rate = S.settings.rate / md.sp; u.pitch = Math.max(0.5, S.settings.pitch + md.pitch); u.volume = S.settings.vol;
      speakingCount++;
      const fin = () => { if (speakingCount > 0) speakingCount--; if (!speakingCount) setSpeaking(false); };
      u.onstart = () => setSpeaking(true);
      u.onend = fin; u.onerror = fin;
      synth.speak(u);
    });
  });
}
async function waitSpeech(maxMs) {
  const end = Date.now() + (maxMs || 60000);
  await sleep(300);
  while (isSpeaking() && Date.now() < end && !waitSpeech.abort) await sleep(200);
}
/* Chrome sometimes freezes the speech queue when the tab is idle — nudge it */
setInterval(() => { if (synth && speakingCount > 0 && synth.paused) synth.resume(); }, 2000);

/* language-aware phrase helper (Hindi text only if a Hindi voice exists) */
const T = (hi, en) => PiyuI18n.lang === 'en' ? en : PiyuI18n.lang === 'hi' ? (hasHindi() ? hi : en) : hi;   // other languages: `hi` is already run through _t()
PiyuI18n.setHindiOk(hasHindi);
const CALL = () => { const c = S.settings.call || 'सर'; return c === 'सर' ? _t('सर') : c; };
const OWNER = () => S.settings.owner === 'कमर आलम' ? _t('कमर आलम') : S.settings.owner;
const callEn = () => { const c = CALL(); if (!/[\u0900-\u097F]/.test(c)) return c; if (c === 'सर') return 'Sir'; const r = PiyuMind.toRoman(c); return r.charAt(0).toUpperCase() + r.slice(1); };

/* ================= ALARM SOUND ================= */
let actx = null;
function audio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { } }
  if (actx && actx.state === 'suspended') actx.resume();
  return actx;
}
/* Android WebView / Chrome keep audio "suspended" until the page is touched once: wake it on the very first touch, whatever the user taps */
['pointerdown', 'touchend', 'keydown'].forEach(ev => document.addEventListener(ev, () => { try { if (actx && actx.state === 'suspended') actx.resume(); } catch (e) { } }, { passive: true, capture: true }));

/* "🔊 आवाज़ की जाँच": tells the exact reason when Piyu is silent (server, token, audio, volume) and plays a sample */
let ttsWhy = '';                                   // why Piyu's own server voice is not available: 'token' | 'feature' | ''
/* the "listen" buttons: always show what is happening (which voice, speaking, done, or WHY nothing can be heard) */
async function tryVoice(kind) {
  const d = $('#voiceDiag'), text = kind === 'hi' ? _t(SAMPLE.hi) : kind === 'hg' ? SAMPLE.hg : SAMPLE.en, lang = kind === 'en' ? 'en' : speechLang();
  if (voiceBlocked) { d.textContent = '🔇 ' + _t('Admin ने आवाज़ बंद की है'); toast(d.textContent); return; }
  if (!neural && ttsWhy === '') { try { await detectNeural(); } catch (e) { } }
  const engine = usePhone(lang) ? _t('Phone की आवाज़') : neural ? _t('Piyu की अपनी आवाज़ (Piper)') : (synth && (pick(lang) || pick('en'))) ? _t('Browser की आवाज़') : '';
  if (!engine) {
    d.textContent = '⚠ ' + (ttsWhy === 'token' ? _t('आवाज़ के लिए Sync token चाहिए (Settings → Sync token)') : ttsWhy === 'feature' ? _t('Admin ने आवाज़ बंद की है') : _t('इस device पर कोई आवाज़ नहीं मिली'));
    toast(d.textContent); return;
  }
  d.innerHTML = '<span class="eq"><i></i><i></i><i></i><i></i></span> ' + esc(_t('बोल रही हूँ…')) + ' · ' + esc(engine); say(text, { interrupt: true });
  await waitSpeech(30000); if (!isSpeaking()) d.textContent = '✔ ' + _t('हो गया') + ' · ' + engine;
}
async function voiceDiag() {
  const box = $('#voiceDiag'); const say_ = m => { box.textContent = m; };
  say_('⏳ ' + _t('जाँच रही हूँ…'));
  const base = serverBase() || _t('इसी device का server');
  let st;
  try { st = await (await fetchT('/tts-status', { cache: 'no-store' }, 8000)).json(); }
  catch (e) { return say_('❌ ' + _t('Piyu server तक नहीं पहुँच पा रही ({0}) — इंटरनेट / server का पता जाँचें', [base])); }
  if (!st.piper) return say_('❌ ' + _t('इस server पर Piyu की आवाज़ चालू नहीं है'));
  let r;
  try { r = await fetchT('/tts?lang=' + (S.settings.lang === 'en' ? 'en' : 'hi') + '&text=' + encodeURIComponent(_t('जाँच')) + '&nocache=' + Date.now(), { headers: hdrs(), cache: 'no-store' }, 15000); }
  catch (e) { return say_('❌ ' + _t('आवाज़ का जवाब नहीं आया — इंटरनेट धीमा या बंद है')); }
  if (r.status === 401) return say_('🔑 ' + _t('Sync token खाली या ग़लत है — Settings → Sync token में सही token डालें'));
  if (r.status === 403) { let c = 'device'; try { c = (await r.json()).error; } catch (e) { } return say_('🔑 ' + _t(ACCESS_MSG[c] || ACCESS_MSG.device)); }
  if (!r.ok) return say_('❌ ' + _t('server ने आवाज़ नहीं दी (कोड {0})', [r.status]));
  const a = audio(); if (!a) return say_('❌ ' + _t('इस phone का audio चालू नहीं हो पा रहा'));
  try { await a.resume(); } catch (e) { }
  if (a.state !== 'running') return say_('👆 ' + _t('Audio सोया हुआ है — स्क्रीन को एक बार छूकर "आवाज़ की जाँच" फिर दबाएँ'));
  neural = true;
  say_('✅ ' + _t('आवाज़ ठीक है — अभी बोल रही हूँ। सुनाई न दे तो phone का media volume बढ़ाएँ और silent / Do-not-disturb बंद करें।'));
  say(_t2('नमस्ते {0}, अब मेरी आवाज़ आ रही है।', [CALL()], 'Hello {0}, my voice is working now.', [CALL()]), { interrupt: true });
}
function bellNote(freq, t0, dur, vol) {
  const a = audio(); if (!a) return;
  const o = a.createOscillator(), o2 = a.createOscillator(), g = a.createGain();
  o.type = 'sine'; o2.type = 'sine'; o.frequency.value = freq; o2.frequency.value = freq * 2.01;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  const g2 = a.createGain(); g2.gain.value = 0.25;
  o.connect(g); o2.connect(g2); g2.connect(g); g.connect(a.destination);
  o.start(t0); o2.start(t0); o.stop(t0 + dur + .05); o2.stop(t0 + dur + .05);
}
async function chime(times, mult) {
  const a = audio(); if (!a) return;
  for (let i = 0; i < times; i++) {
    const t = a.currentTime + 0.05, v = 0.28 * S.settings.vol * (mult == null ? 1 : mult);
    [880, 1108.7, 1318.5, 1760].forEach((f, k) => bellNote(f, t + k * 0.16, 1.1, v));
    await sleep(1900);
  }
}

/* ================= ALARM ENGINE ================= */
let ringState = null;
const ALERT = 15 * 60000; // ring only if we are within 15 min of the time (page opened late => "missed")

const blockedBy = t => C.blockers(t, S.tasks);
function taskReminderText(t, kind, mins) {
  if (t.study && window.studyReminder) return window.studyReminder(t, kind, mins);
  const c = CALL();
  const bl = blockedBy(t)[0];
  if (bl) return kind === 'pre'
    ? _t2("{0}, {1} मिनट बाद {2} का समय है, लेकिन उससे पहले {3} पूरा करना ज़रूरी है।", [c, mins, t.title, bl.title], "{0}, in {1} minutes it is time for {2}, but first you must finish {3}.", [callEn(), mins, t.title, bl.title])
    : _t2("{0}, {1} का समय हो गया है, लेकिन उससे पहले {2} पूरा करना ज़रूरी है। पहले वही कर लीजिए।", [c, t.title, bl.title], "{0}, it is time for {1}, but first finish {2}. Please do that one first.", [callEn(), t.title, bl.title]);
  if (kind === 'pre') return _t2("{0}, {1} मिनट बाद आपको यह काम करना है। {2}। तैयार हो जाइए।", [c, mins, t.title], "{0}, in {1} minutes you need to do this. {2}. Please get ready.", [callEn(), mins, t.title]);
  return _t2("{0}, अभी काम का समय हो गया है। {1}। कैसे करना है यह जानना हो तो मुझसे पूछिए।", [c, t.title], "{0}, it is time now. {1}. Ask me if you want to know how to do it.", [callEn(), t.title]);
}

function notify(title, body, tag) {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    const o = { body, tag, icon: 'icon.svg', requireInteraction: true, vibrate: [300, 150, 300, 150, 600] };
    if (navigator.serviceWorker && navigator.serviceWorker.controller) navigator.serviceWorker.ready.then(r => r.showNotification(title, o)).catch(() => new Notification(title, o));
    else new Notification(title, o);
  } catch (e) { }
}

function preAlert(t, mins) {
  t.pre = true; save();
  const pol = policy('pre', t);
  toast(_t("⏰ {0} मिनट बाद: {1}", [mins, t.title]));
  notify(_t("Piyu · {0} मिनट बाद", [mins]), t.title, 'pre' + t.id);
  if (!ringState && pol.speak) { audio(); chime(1, pol.volume).then(() => say(taskReminderText(t, 'pre', mins), { interrupt: true, mood: pol.mood })); }
  try { navigator.vibrate && navigator.vibrate([200, 100, 200]); } catch (e) { }
}

async function startRing(t, label, pol) {
  pol = pol || policy('now', t);
  t.fired = true; if (t.id !== 'test') ev('ring', t.title); save();
  ringState = { t, stop: false, silent: false };
  $('#ringTitle').textContent = t.title;
  $('#ringWhen').textContent = full(t.alarmAt);
  $('#ringKind').textContent = label || _t("⏰ अभी का काम");
  $('#ring').hidden = false;
  notify(_t("Piyu · अभी करने का समय"), t.title, 'ring' + t.id);
  const st = ringState;
  document.title = '⏰ ' + t.title;
  for (let i = 0; i < 12 && !st.stop; i++) {
    if (!pol.chime && !pol.speak) { for (let k = 0; k < 20 && !st.stop; k++) await sleep(500); continue; }   // silent ring: screen + notification only
    if (!st.silent && pol.chime) await chime(2, pol.volume);
    if (st.stop) break;
    try { navigator.vibrate && navigator.vibrate([400, 200, 400, 200, 800]); } catch (e) { }
    if (pol.speak) { say(taskReminderText(t, 'now'), { mood: pol.mood }); await waitSpeech(40000); }
    for (let k = 0; k < 8 && !st.stop; k++) await sleep(500);
  }
  if (ringState === st) endRing();
}
function endRing() {
  if (ringState) ringState.stop = true;
  ringState = null; $('#ring').hidden = true; stopSpeaking(); document.title = 'Piyu — Personal Assistant';
  render();
}

/* ================= PROGRESS DASHBOARD ================= */
let progRange = 14;
try { progRange = +localStorage.getItem('piyu.range') || 14; } catch (e) { }
let progView = 'chart';
const dayName = ts => { const d = new Date(ts); return DNE[d.getDay()] + ' ' + d.getDate() + ' ' + MN[d.getMonth()]; };
function renderProg() {
  if (!$('#tab-prog').classList.contains('active')) return;
  $$('#tab-prog [data-range]').forEach(b => b.classList.toggle('on', +b.dataset.range === progRange));
  const st = C.buildStats(S.tasks, new Date(), progRange);
  const body = $('#progBody');
  if (!S.tasks.length) { body.innerHTML = _t("<div class=\"empty\">अभी कोई काम नहीं, इसलिए दिखाने को कोई आँकड़ा नहीं।<br><br><button class=\"btn primary\" data-goto=\"docs\">📄 Document upload करें</button></div>"); return; }
  const tile = (label, value, unit, hint) => `<div class="vtile"><span class="vl">${label}</span><b class="vv">${value}</b><span class="vu">${unit}</span>${hint ? `<small>${hint}</small>` : ''}</div>`;
  body.innerHTML = _t("\n    <div class=\"vcard vhero\"><span class=\"vl\">आज पूरे हुए</span><div class=\"vbig\">{0}</div><span class=\"vsub\">{1} काम आज बाकी · औसत {2}/दिन (पिछले {3} दिन)</span></div>\n    <div class=\"vtiles\">\n      {4}\n      {5}\n      {6}\n      {7}\n    </div>\n    <div class=\"vcard\">\n      <div class=\"vhead\"><div><b>रोज़ पूरे हुए काम</b><small>पिछले {8} दिन</small></div><button class=\"btn sm ghost\" id=\"vToggle\">{9}</button></div>\n      <div id=\"vchart\" class=\"vchart\" {10}></div>\n      <div id=\"vtable\" {11}><table class=\"vtable\"><thead><tr><th>दिन</th><th>पूरे हुए</th></tr></thead><tbody>{12}</tbody></table></div>\n    </div>\n    <div class=\"vcard\"><div class=\"vhead\"><div><b>हिस्सों के हिसाब से</b><small>document के section · पूरे / कुल</small></div></div>\n      {13}\n    </div>", [st.doneToday, st.pendingToday, st.avgPerDay, st.days, tile(_t("लगातार दिन (streak)"), st.streak, _t("दिन"), st.streak ? _t("🔥 कम से कम 1 काम रोज़") : _t("आज कोई काम पूरा करें")), tile(_t("समय पर पूरे"), st.onTimePct === null ? '—' : st.onTimePct + '%', '', _t("{0} में से (15 मिनट की छूट)", [st.ontimeN])), tile(_t("पिछले {0} दिन में पूरे", [st.days]), st.doneRange, _t("काम"), st.best.done ? _t("सबसे अच्छा दिन: {0} ({1})", [dayName(st.best.day0), st.best.done]) : ''), tile(_t("समय निकल गया, बाकी"), st.overdue, _t("काम"), st.overdue ? _t("⚠ इन्हें निपटाएँ") : _t("✔ कुछ बाकी नहीं")), st.days, (progView === 'chart' ? _t("📋 तालिका") : _t("📊 चार्ट")), (progView === 'chart' ? '' : 'hidden'), (progView === 'table' ? '' : 'hidden'), st.series.slice().reverse().map(x => `<tr><td>${esc(dayName(x.day0))}</td><td>${x.done}</td></tr>`).join(''), (st.bySection.length ? st.bySection.map(x => _t("<div class=\"vmeter\"><div class=\"vm-top\"><span class=\"vm-name\" title=\"{0}\">{1}</span><span class=\"vm-n\">{2}/{3}</span></div><div class=\"vm-track\" role=\"img\" aria-label=\"{4}: {5} में से {6}\"><i style=\"width:{7}%\"></i></div></div>", [esc(x.section), esc(x.section.slice(0, 44)), x.done, x.total, esc(x.section), x.done, x.total, (x.total ? Math.round(100 * x.done / x.total) : 0)])).join('') : _t("<small class=\"hint\">कोई section नहीं</small>"))]);
  if (progView === 'chart') drawChart(st);
  $('#vToggle').onclick = () => { progView = progView === 'chart' ? 'table' : 'chart'; renderProg(); };
}
function drawChart(st) {
  const el = $('#vchart'), W = Math.max(300, el.clientWidth || 340), H = 210, ml = 34, mr = 6, mt = 20, mb = 26;
  const n = st.series.length, iw = W - ml - mr, ih = H - mt - mb;
  const max = Math.max(1, ...st.series.map(x => x.done)), top = C.niceMax(max);
  const band = iw / n, bw = Math.max(2, Math.min(24, Math.floor(band * 0.62)));
  const y = v => mt + ih - (v / top) * ih;
  const ticks = [...new Set([0, Number.isInteger(top / 2) ? top / 2 : 0, top])];
  const step = n <= 7 ? 1 : Math.ceil(n / 6);
  let g = '', bars = '', labels = '', hits = '';
  ticks.forEach(t => { g += `<line x1="${ml}" x2="${W - mr}" y1="${y(t)}" y2="${y(t)}" class="${t === 0 ? 'vbase' : 'vgrid'}"/><text x="${ml - 6}" y="${y(t) + 4}" text-anchor="end" class="vtick">${t}</text>`; });
  const maxI = st.series.findIndex(x => x.done === max);
  st.series.forEach((x, i) => {
    const cx = ml + i * band + band / 2, bx = cx - bw / 2, h = (x.done / top) * ih;
    if (x.done > 0) {
      const r = Math.min(4, h);
      bars += `<path class="vbar" data-i="${i}" d="M${bx},${mt + ih} V${mt + ih - h + r} a${r},${r} 0 0 1 ${r},${-r} H${bx + bw - r} a${r},${r} 0 0 1 ${r},${r} V${mt + ih} Z"/>`;
      if (i === maxI || i === n - 1) labels += `<text x="${cx}" y="${mt + ih - h - 5}" text-anchor="middle" class="vval">${x.done}</text>`;
    }
    if (i % step === (n - 1) % step || i === n - 1) labels += `<text x="${cx}" y="${H - 8}" text-anchor="middle" class="vtick">${i === n - 1 ? _t("आज") : n <= 7 ? DNE[new Date(x.day0).getDay()] : new Date(x.day0).getDate() + ' ' + MN[new Date(x.day0).getMonth()]}</text>`;
    hits += `<rect class="vhit" data-i="${i}" x="${ml + i * band}" y="${mt - 6}" width="${band}" height="${ih + 6}"/>`;
  });
  el.innerHTML = _t("<svg viewBox=\"0 0 {0} {1}\" width=\"{2}\" height=\"{3}\" role=\"img\" aria-label=\"पिछले {4} दिनों में रोज़ पूरे हुए काम; कुल {5}; तालिका देखने का बटन ऊपर है\">{6}{7}{8}{9}</svg><div class=\"vtip\" role=\"status\" hidden><b></b><span></span></div>", [W, H, W, H, n, st.doneRange, g, bars, labels, hits]);
  el.tabIndex = 0;
  const tip = el.querySelector('.vtip');
  const show = i => {
    const x = st.series[i], cx = ml + i * band + band / 2;
    tip.querySelector('b').textContent = x.done + (x.done === 1 ? _t(" काम पूरा") : _t(" काम पूरे"));
    tip.querySelector('span').textContent = dayName(x.day0);
    tip.hidden = false;
    const w = tip.offsetWidth; tip.style.left = Math.max(0, Math.min(W - w, cx - w / 2)) + 'px'; tip.style.top = Math.max(0, y(x.done) - 52) + 'px';
    el.querySelectorAll('.vbar').forEach(b => b.classList.toggle('hot', +b.dataset.i === i));
  };
  const hide = () => { tip.hidden = true; el.querySelectorAll('.vbar.hot').forEach(b => b.classList.remove('hot')); };
  el.querySelectorAll('.vhit').forEach(h => { h.addEventListener('pointermove', () => show(+h.dataset.i)); h.addEventListener('pointerdown', () => show(+h.dataset.i)); });
  el.addEventListener('pointerleave', hide);
  let ki = n - 1;
  el.onfocus = () => show(ki); el.onblur = hide;
  el.onkeydown = e => { if (e.key === 'ArrowLeft') ki = Math.max(0, ki - 1); else if (e.key === 'ArrowRight') ki = Math.min(n - 1, ki + 1); else if (e.key === 'Home') ki = 0; else if (e.key === 'End') ki = n - 1; else return; e.preventDefault(); show(ki); };
}
window.addEventListener('resize', () => { clearTimeout(renderProg.t); renderProg.t = setTimeout(renderProg, 150); });
$$('#tab-prog [data-range]').forEach(b => b.onclick = () => { progRange = +b.dataset.range; try { localStorage.setItem('piyu.range', progRange); } catch (e) { } renderProg(); });

/* ================= FOCUS MODE + QUIET HOURS ================= */
const focusState = () => { try { return JSON.parse(localStorage.getItem('piyu.focus') || 'null') || {}; } catch (e) { return {}; } };
const focusUntil = () => focusState().until || 0;
const policy = (kind, t) => C.alertPolicy(kind, t, new Date(), S.settings, focusUntil());
function startFocus(min) {
  min = Math.min(480, Math.max(1, Math.round(min) || 25));
  try { localStorage.setItem('piyu.focus', JSON.stringify({ from: Date.now(), until: Date.now() + min * 60000 })); } catch (e) { }
  toast(_t("🎯 Focus {0} मिनट — P1/P2 के अलावा कोई नहीं टोकेगा", [min])); render();
}
function endFocus(auto) {
  const from = focusState().from || 0;
  try { localStorage.removeItem('piyu.focus'); } catch (e) { }
  const now = Date.now();
  const held = S.tasks.filter(t => !t.done && !t.fired && t.alarmAt >= from && t.alarmAt <= now && (t.priority || 3) >= 3).sort((x, y) => x.alarmAt - y.alarmAt);
  held.forEach((t, i) => { t.alarmAt = now + (i + 1) * 120000; t.pre = true; t.missed = false; t.deferred = true; });   // release them 2 minutes apart
  if (held.length) save();
  render();
  if (auto) { toast(_t("🎯 Focus पूरा{0}", [(held.length ? _t(" — {0} रुके हुए काम अब बताऊँगी", [held.length]) : '')])); say(_t2("{0}, फ़ोकस का समय पूरा हुआ।{1}", [CALL(), (held.length ? _t(" {0} काम रुके हुए थे, एक-एक करके बताती हूँ।", [held.length]) : '')], "Focus time is over.{0}", [(held.length ? ` ${held.length} tasks were held back; I will remind you one by one.` : '')]), { mood: 'gentle' }); }
  else toast(_t("Focus बंद{0}", [(held.length ? _t(" — {0} रुके हुए काम जल्द बताऊँगी", [held.length]) : '')]));
}
function focusBarHTML() {
  const u = focusUntil(), q = C.inQuiet(new Date(), S.settings);
  if (u > Date.now()) return _t("<div class=\"focusbar on\">🎯 Focus चालू — <b id=\"fcd\" data-at=\"{0}\">{1}</b> बाकी <button class=\"btn sm\" data-act=\"focusoff\">रोकें</button></div>", [u, cdText(u - Date.now())]);
  return `<div class="focusbar">${q ? _t("<span class=\"qtag\">🌙 शांत समय चालू</span>") : ''}<button class="btn sm ${wake.on ? 'primary' : ''}" data-act="wake">👂 Hey Piyu ${wake.on ? _t("चालू") : _t("बंद")}</button><button class="btn sm" data-act="focuson">🎯 Focus mode</button></div>`;
}

/* ================= MORNING PLAN / NIGHT SUMMARY ================= */
const briefKind = () => new Date().getHours() < 17 ? 'morning' : 'night';
const liveBrief = kind => C.buildBrief(kind, S.tasks, new Date(), S.settings.lang === 'en' || (S.settings.lang === 'hi' && !hasHindi()) ? 'en' : 'hi', CALL());
let briefLog = {};
try { briefLog = JSON.parse(localStorage.getItem('piyu.brief') || '{}'); } catch (e) { }
function speakBrief(kind) { const b = liveBrief(kind); say(b.speak, { mood: kind === 'night' ? 'gentle' : 'calm' }); return b; }
function checkBrief() {
  if (ringState || guide) return;
  const kind = C.briefDue({ on: S.settings.briefOn, morning: S.settings.briefMorning, night: S.settings.briefNight }, briefLog, new Date());
  if (!kind) return;
  if (policy('brief').defer) return;          // focus or quiet hours: try again later, it stays inside the 3-hour window
  const d = new Date(); briefLog[kind] = d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();   // mark first: never fires twice
  try { localStorage.setItem('piyu.brief', JSON.stringify(briefLog)); } catch (e) { }
  const b = speakBrief(kind);
  toast(b.title + ' — ' + b.bullets[0]); notify('Piyu · ' + b.title, b.bullets.join('\n'), 'brief' + kind);
  render();
}

function tick() {
  const now = Date.now();
  const pre = S.settings.preMin * 60000;
  $('#clock').textContent = hm(now);
  const d = new Date(now); $('#date').textContent = DNE[d.getDay()] + ', ' + d.getDate() + ' ' + MN[d.getMonth()];
  const fu = focusUntil(); if (fu && Date.now() >= fu) endFocus(true);   // first: so held tasks are released before the missed-check below
  let dirty = false;
  S.tasks.forEach(t => {
    if (t.done || !t.alarmAt) return;
    const left = t.alarmAt - now;
    const preT = t.preMin ? t.preMin * 60000 : pre;
    if (!t.pre && left <= preT && left > 30000) preAlert(t, Math.max(1, Math.round(left / 60000)));
    else if (!t.pre && left <= 30000) t.pre = true;
    if (!t.fired && left <= 0) {
      const pol = policy('now', t);
      if (pol.defer) return;                            // focus mode holds P3/P4 alarms back until it ends
      if (-left <= ALERT) { if (!ringState) startRing(t, null, pol); }
      else { t.fired = true; t.missed = true; dirty = true; ev('ignored', t.title); spawnNext(t); }
    }
  });
  if (dirty) { save(); render(); }
  checkBrief(); mindTick();
  const fc = $('#fcd'); if (fc) fc.textContent = cdText(+fc.dataset.at - Date.now());
  const cd = $('#cd'); if (cd && cd.dataset.at) cd.textContent = cdText(+cd.dataset.at - now);
}

/* ================= tasks ================= */
const activeTasks = () => S.tasks.filter(t => !t.done).sort((a, b) => a.alarmAt - b.alarmAt);
function nextTask() { const n = Date.now(); return activeTasks().find(t => t.alarmAt > n - ALERT && !t.missed) || null; }
/* recurring tasks: finishing (or missing) one occurrence creates the next one; the finished one stays as history for the dashboard */
function spawnNext(t) {
  if (!t.repeat || t.nextId) return null;
  const at = C.nextOccurrence(t.repeat, t.repBase || t.alarmAt, Math.max(Date.now(), t.alarmAt));
  if (!at) return null;
  const c = JSON.parse(JSON.stringify(t));
  c.id = uid(); c.alarmAt = at; c.repBase = at; c.done = false; c.pre = false; c.fired = false; c.missed = false; c.auto = false; c.guessed = false;
  ['doneAt', 'nextId', 'updatedAt'].forEach(k => delete c[k]);
  if (c.subtasks) c.subtasks.forEach(s => s.done = false);
  c.seriesId = t.seriesId || t.id; t.seriesId = c.seriesId; t.nextId = c.id;
  S.tasks.push(c);
  return c;
}
function markDone(t) {
  t.done = true; t.doneAt = Date.now(); ev('done', t.title);
  const c = spawnNext(t);
  const freed = S.tasks.filter(x => !x.done && (x.dependsOn || []).includes(t.id) && !blockedBy(x).length);
  save(); if (ringState && ringState.t === t) endRing(); render();
  if (c) toast(_t("🔁 अगला alarm: {0}", [full(c.alarmAt)]));
  if (freed.length) { toast(_t("🔓 अब शुरू कर सकते हैं: {0}", [freed[0].title])); say(_t2("अब आप {0} शुरू कर सकते हैं।", [freed[0].title], "You can now start {0}.", [freed[0].title]), { interrupt: false }); }
}
function undoDone(t) {
  t.done = false; delete t.doneAt;
  const c = t.nextId && S.tasks.find(x => x.id === t.nextId);
  if (c && !c.done && !c.fired) S.tasks = S.tasks.filter(x => x !== c);   // untouched next occurrence is withdrawn
  if (c && !c.done && !c.fired || !c) delete t.nextId;
  save(); render();
}
function snooze(t, min) { t.snoozed = (t.snoozed || 0) + 1; ev('snooze', t.title); t.alarmAt = Date.now() + min * 60000; t.fired = false; t.pre = true; t.missed = false; save(); if (ringState && ringState.t === t) endRing(); render(); toast(_t("{0} मिनट बाद फिर बताऊँगी", [min])); }
function delTask(t) { S.tasks = S.tasks.filter(x => x !== t); save(); dropBlobs([t]); render(); }

/* ================= rendering ================= */
const PRI_TAG = { 1: ['bad', '🔥 अत्यावश्यक'], 2: ['warn', '⬆ ज़रूरी'], 4: ['', '⬇ बाद में'] };
function taskHTML(t, compact) {
  const now = Date.now();
  const tags = (t.missed ? _t("<span class=\"tag bad\">छूटा</span>") : '') + (t.auto && !t.done ? _t("<span class=\"tag warn\">Piyu का सुझाया समय</span>") : '') + (t.guessed && !t.done ? _t("<span class=\"tag warn\">समय अनुमानित</span>") : '') + (t.manual ? _t("<span class=\"tag\">मेरा जोड़ा</span>") : '') + (PRI_TAG[t.priority] && !t.done ? '<span class="tag ' + PRI_TAG[t.priority][0] + '">' + _t(PRI_TAG[t.priority][1]) + '</span>' : '') + (!t.done && blockedBy(t).length ? _t("<span class=\"tag bad\">🔒 पहले: {0}</span>", [esc(blockedBy(t)[0].title.slice(0, 40))]) : '') + (t.attachments && t.attachments.length ? '<span class="tag">📎 ' + t.attachments.length + '</span>' : '') + C.extractLinks(t.text || '').slice(0, 2).map(l => '<a class="tag link" href="' + esc(l.url) + '" target="_blank" rel="noopener noreferrer">🔗 ' + esc(l.host.slice(0, 24)) + '</a>').join('') + (t.repeat ? '<span class="tag ok">🔁 ' + esc(C.repeatLabel(t.repeat, S.settings.lang)) + '</span>' : '');
  return _t("<div class=\"task {0}\" data-id=\"{1}\">\n    <button class=\"chk-btn\" data-act=\"toggle\" title=\"हो गया\"></button>\n    <div class=\"bd\"><div class=\"ti\">{2}</div>{3}\n      <div class=\"sub\">{4}{5}</div>\n      {6}\n    </div>\n    <div class=\"tm\"><b>{7}</b>{8}</div></div>", [(t.done ? 'done' : ''), t.id, esc(t.title), (t.subtasks && t.subtasks.length ? `<div class="prog sm"><i style="width:${Math.round(100 * subDone(t) / t.subtasks.length)}%"></i></div>` : ''), tags, (t.section ? esc(t.section.slice(0, 40)) : ''), (compact ? '' : _t("<div class=\"ac\"><button class=\"btn sm\" data-act=\"how\">कैसे करना है?</button><button class=\"btn sm\" data-act=\"guide\">▶ Guide</button><button class=\"btn sm ghost\" data-act=\"edit\">समय बदलें</button><button class=\"btn sm ghost\" data-act=\"del\">हटाएँ</button></div>")), hm(t.alarmAt), dayLabel(t.alarmAt)]);
}

function render() {
  const now = Date.now();
  const h = new Date().getHours();
  const greet = h < 12 ? _t("सुप्रभात") : h < 17 ? _t("नमस्ते") : h < 21 ? _t("शुभ संध्या") : _t("शुभ रात्रि");
  $('#hello').textContent = greet + ', ' + CALL() + ' · ' + S.settings.ownerEn;
  const act = activeTasks();
  const todayK = dayKey(now);
  const today = act.filter(t => dayKey(t.alarmAt) === todayK && !t.missed);
  const missed = act.filter(t => t.missed || (t.alarmAt < now - ALERT));
  $('#helloSub').textContent = S.tasks.length ? _t("आज {0} काम बाकी · कुल {1} pending", [today.length, act.length]) : _t("कोई document upload करें, मैं आपके काम निकालकर alarm लगा दूँगी।");

  const n = nextTask();
  $('#nextCard').innerHTML = n ? _t("<div class=\"next\" data-id=\"{0}\"><small>अगला काम · {1}</small>\n    <h2>{2}</h2><div class=\"cd\" id=\"cd\" data-at=\"{3}\">{4}</div>\n    <div class=\"meta\">{5} मिनट पहले मैं आपको बता दूँगी</div>\n    <div class=\"btns\"><button class=\"btn primary\" data-act=\"how\">कैसे करना है?</button><button class=\"btn\" data-act=\"toggle\">✔ हो गया</button><button class=\"btn ghost\" data-act=\"edit\">समय बदलें</button></div></div>", [n.id, full(n.alarmAt), esc(n.title), n.alarmAt, cdText(n.alarmAt - now), S.settings.preMin])
    : `<div class="empty">${S.tasks.length ? _t("🎉 कोई pending काम नहीं। बढ़िया!") : _t("अभी कोई काम नहीं है।<br><br><button class=\"btn primary\" data-goto=\"docs\">📄 Document upload करें</button>")}</div>`;

  $('#focusBar').innerHTML = focusBarHTML();
  renderProg();
  const bk = briefKind(), bf = S.tasks.length ? liveBrief(bk) : null;
  $('#briefCard').innerHTML = bf ? _t("<div class=\"brief\"><div class=\"bh\"><b>{0}</b><button class=\"btn sm\" data-act=\"brief\" data-kind=\"{1}\">🔊 सुनाओ</button></div><ul>{2}</ul></div>", [esc(bf.title), bk, bf.bullets.slice(0, 5).map(x => `<li>${esc(x)}</li>`).join('')]) : '';
  const f = C.pickNext(S.tasks, now);
  $('#focusCard').innerHTML = f && f !== n ? _t("<div class=\"focus\" data-id=\"{0}\"><small>🎯 अभी सबसे ज़रूरी</small><b>{1}</b><div class=\"meta\">{2}</div><div class=\"btns\"><button class=\"btn sm primary\" data-act=\"how\">कैसे करना है?</button><button class=\"btn sm\" data-act=\"toggle\">✔ हो गया</button></div></div>", [f.id, esc(f.title), esc(C.whyNext(f, now, S.settings.lang))]) : '';

  $('#todayCount').textContent = today.length;
  $('#todayList').innerHTML = today.length ? today.map(t => taskHTML(t, true)).join('') : _t("<div class=\"empty\">आज के लिए कुछ नहीं</div>");
  $('#missedWrap').hidden = !missed.length;
  $('#missedList').innerHTML = missed.map(t => taskHTML(t, false)).join('');

  // all tasks grouped by day
  let html = '', last = null;
  const byPri = S.settings.sort === 'priority';
  $('#sortSel').value = byPri ? 'priority' : 'time';
  const PL = { 1: _t("🔥 अत्यावश्यक (P1)"), 2: _t("⬆ ज़रूरी (P2)"), 3: _t("सामान्य (P3)"), 4: _t("⬇ बाद में (P4)") };
  const sc = t => C.taskScore(t, now, blockedBy(t).length > 0);
  const all = S.tasks.slice().sort(byPri ? ((a, b) => (a.done - b.done) || ((a.priority || 3) - (b.priority || 3)) || sc(b) - sc(a)) : ((a, b) => (a.done - b.done) || a.alarmAt - b.alarmAt));
  all.forEach(t => {
    const g = t.done ? _t("पूरे हुए") : byPri ? PL[t.priority || 3] : dayLabel(t.alarmAt);
    if (g !== last) { html += `<div class="group">${esc(g)}</div>`; last = g; }
    html += taskHTML(t, false);
  });
  $('#taskList').innerHTML = html || _t("<div class=\"empty\">कोई काम नहीं। Docs में document upload करें या \"+ नया काम\" दबाएँ।</div>");

  // docs
  $('#docList').innerHTML = S.docs.length ? S.docs.map(d => _t("<div class=\"doc\" data-doc=\"{0}\"><div><b>📄 {1}</b><small>{2} हिस्से · {3} काम · {4}</small></div><button class=\"btn sm danger\" data-act=\"deldoc\">हटाएँ</button></div>", [d.id, esc(d.name), d.blocks.length, S.tasks.filter(t => t.docId === d.id).length, new Date(d.added).toLocaleString()])).join('') : _t("<div class=\"empty\">अभी कोई document नहीं</div>");
  const rules = S.docs.flatMap(d => (d.rules || []));
  $('#rulesBox').innerHTML = rules.length ? _t("<div class=\"card rules\"><h3>⚠ ज़रूरी नियम (documents से)</h3><ul>{0}</ul><button class=\"btn sm\" data-act=\"speakrules\">🔊 सुनाओ</button></div>", [rules.map(r => `<li>${esc(r)}</li>`).join('')]) : '';
}

/* ================= how-to dialog ================= */
/* ---- links & attachments ---- */
const MAX_ATT = 50 * 1024 * 1024, MAX_ATT_IN = 100 * 1024 * 1024;   // a file may be up to 100 MB; it is shrunk first (photos, scans, Office pictures) and 50 MB is kept at most
const SAFE_OPEN = /^(image\/(png|jpe?g|gif|webp|bmp)|application\/pdf|text\/plain|audio\/|video\/)/;   // never open html/svg (they would run inside the app origin)
const fmtSize = n => n < 1024 ? n + ' B' : n < 1048576 ? Math.round(n / 1024) + ' KB' : (n / 1048576).toFixed(1) + ' MB';
function linkify(text) {   // returns safe HTML
  const re = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi; let out = '', last = 0, m;
  while ((m = re.exec(text))) {
    const raw = m[0], clean = raw.replace(/[.,;:!?)\]}»”’]+$/, '');
    const href = /^www\./i.test(clean) ? 'https://' + clean : clean;
    let ok = false; try { ok = /^https?:$/.test(new URL(href).protocol); } catch (e) { }
    out += esc(text.slice(last, m.index));
    out += ok ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(clean)}</a>` + esc(raw.slice(clean.length)) : esc(raw);
    last = m.index + raw.length;
  }
  return out + esc(text.slice(last));
}
let upSet = new Set();
try { upSet = new Set(JSON.parse(localStorage.getItem('piyu.up') || '[]')); } catch (e) { }
const markUp = id => { upSet.add(id); try { localStorage.setItem('piyu.up', JSON.stringify([...upSet])); } catch (e) { } };
const attId = () => 'att_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
async function addAttachment(t, file) {
  if (file.size > MAX_ATT_IN) { toast(_t("{0} बहुत बड़ी है (अधिकतम 100 MB)", [file.name])); return false; }
  if (S.settings.compress !== false && file.size > 150 * 1024) {      // make photos / scanned PDFs small first: faster upload, sync and storage, still readable
    if (file.size > 1024 * 1024) toast(_t("⏳ {0} छोटी कर रही हूँ…", [file.name]));
    const r = await PiyuMedia.optimize(file, { onProgress: (i, n) => { if (n > 1) $('#toast').textContent = _t("⏳ {0} छोटी कर रही हूँ… {1}/{2}", [file.name, i, n]); } });
    if (r.changed) { toast(_t("📉 {0}: {1} → {2} (छोटा किया, साफ़ पढ़ने लायक)", [file.name, PiyuMedia.fmt(r.from), PiyuMedia.fmt(r.to)])); file = r.blob; }
  }
  if (file.size > MAX_ATT) { toast(_t("{0} छोटी करने के बाद भी बहुत बड़ी है (अधिकतम 50 MB)", [file.name])); return false; }
  const id = attId();
  await Store.putBlob(id, file);
  (t.attachments || (t.attachments = [])).push({ id, name: file.name || 'photo.jpg', type: file.type || 'application/octet-stream', size: file.size, at: Date.now() });
  save(); uploadBlobs(); return true;
}
async function getBlobFor(att) {
  let b = await Store.getBlob(att.id);
  if (b) return b;
  try {
    const r = await fetchT('/api/blob/' + att.id, { headers: hdrs() }, 60000);
    if (r.ok) { b = new Blob([await r.arrayBuffer()], { type: att.type }); await Store.putBlob(att.id, b); markUp(att.id); return b; }
  } catch (e) { }
  return null;
}
let uploading = false;
async function uploadBlobs() {
  if (uploading) return; uploading = true;
  try {
    for (const t of S.tasks) for (const att of (t.attachments || [])) {
      if (upSet.has(att.id)) continue;
      const b = await Store.getBlob(att.id); if (!b) continue;
      const r = await fetchT('/api/blob/' + att.id, { method: 'PUT', headers: Object.assign({ 'Content-Type': att.type || 'application/octet-stream' }, hdrs()), body: b }, 120000);
      if (r.ok) markUp(att.id); else break;
    }
  } catch (e) { }
  uploading = false;
}
async function pullBlobs() {
  try { for (const t of S.tasks) for (const att of (t.attachments || [])) if (!(await Store.getBlob(att.id))) await getBlobFor(att); } catch (e) { }
}
async function openAttachment(att) {
  const b = await getBlobFor(att);
  if (!b) { toast(_t("फ़ाइल अभी उपलब्ध नहीं — sync के बाद खुलेगी")); return; }
  const safe = SAFE_OPEN.test(att.type || '');
  const url = URL.createObjectURL(new Blob([b], { type: safe ? att.type : 'application/octet-stream' }));
  if (safe) window.open(url, '_blank', 'noopener'); else { const l = document.createElement('a'); l.href = url; l.download = att.name; l.click(); }
  setTimeout(() => URL.revokeObjectURL(url), 120000);
}
function dropBlobs(removed) {   // delete blobs of removed tasks unless a remaining task (e.g. a recurring copy) still uses them
  const still = new Set(S.tasks.flatMap(t => (t.attachments || []).map(x => x.id)));
  removed.forEach(t => (t.attachments || []).forEach(att => {
    if (still.has(att.id)) return;
    Store.delBlob(att.id).catch(() => { }); upSet.delete(att.id);
    fetchT('/api/blob/' + att.id, { method: 'DELETE', headers: hdrs() }, 20000).catch(() => { });
  }));
}
let thumbUrls = [];

let howTask = null, howSpeakText = '';
function howText(t) {
  const blocks = S.docs.flatMap(d => d.blocks);
  const r = C.howTo(t, blocks);
  const steps = r.steps.filter(x => x.trim());
  const lead = steps.length && steps[0].replace(/…$/, '').startsWith(t.title.replace(/…$/, '').slice(0, 40)) ? '' : _t2("{0}। ", [t.title], "{0}. ", [t.title]);
  return { r, speak: lead + steps.map((s, i) => (steps.length > 2 ? _t2("स्टेप {0}। ", [(i + 1)], "Step {0}. ", [(i + 1)]) : '') + s).join(' ') + (r.related.length ? _t2(" दस्तावेज़ में इससे जुड़ी बात। ", [], " Related in the document. ", []) + r.related.join(' ') : '') };
}

/* ---- checklist (subtasks) ---- */
const subDone = t => (t.subtasks || []).filter(s => s.done).length;
function ensureSteps(t) {
  if (t.subtasks && t.subtasks.length) return t.subtasks;
  const s = C.makeSubtasks(t.text);
  t.subtasks = s.length ? s : [{ id: 's0', text: t.title, done: false }];   // a one-line task becomes a single step
  save(); return t.subtasks;
}
function renderHow() {
  const t = howTask, { r } = howText(t), subs = t.subtasks || [], atts = t.attachments || [], links = C.extractLinks(t.text + ' ' + t.title);
  const pct = subs.length ? Math.round(100 * subDone(t) / subs.length) : 0;
  $('#howBody').innerHTML =
    _t("{0}<form id=\"addStepForm\" class=\"addstep\"><input id=\"newStep\" placeholder=\"नया step जोड़ें…\" autocomplete=\"off\"><button class=\"btn sm\">+ जोड़ें</button></form>{1}{2}<h4>📎 Attachments</h4><div class=\"atts\">{3}</div><div class=\"attbtns\"><label class=\"btn sm\">➕ File जोड़ें<input type=\"file\" id=\"attFile\" multiple hidden></label><label class=\"btn sm\">📷 Photo / Camera<input type=\"file\" id=\"attCam\" accept=\"image/*\" capture=\"environment\" hidden></label></div>{4}<div class=\"hint\">{5}</div>", [(subs.length ? _t("<div class=\"prog\"><i style=\"width:{0}%\"></i></div><small class=\"hint\">{1}/{2} steps पूरे</small><ul class=\"chk\">{3}</ul>", [pct, subDone(t), subs.length, subs.map((s, i) => _t("<li class=\"{0}\"><label><input type=\"checkbox\" data-sub=\"{1}\" {2}> <span>{3}</span></label><button class=\"x2\" data-subdel=\"{4}\" title=\"हटाएँ\">×</button></li>", [(s.done ? 'on' : ''), i, (s.done ? 'checked' : ''), linkify(s.text), i])).join('')])
      : `<h4>Steps</h4><ol>${r.steps.map(s => `<li>${linkify(s)}</li>`).join('')}</ol>`), (subs.length && subDone(t) === subs.length && !t.done ? _t("<button class=\"btn primary\" id=\"finishTask\">✔ सारे steps हो गए — काम पूरा करें</button>") : ''), (links.length ? `<h4>🔗 Links</h4><div class="links">${links.map(l => `<a class="btn sm" href="${esc(l.url)}" target="_blank" rel="noopener noreferrer">🔗 ${esc(l.label)}</a>`).join('')}</div>` : ''), (atts.length ? atts.map((x, i) => _t("<div class=\"att\"><div class=\"thumb\">{0}</div><div class=\"ai\"><b>{1}</b><small>{2}</small></div><button class=\"btn sm\" data-attopen=\"{3}\">खोलें</button><button class=\"x2\" data-attdel=\"{4}\" title=\"हटाएँ\">×</button></div>", [(/^image\/(png|jpe?g|gif|webp|bmp)/.test(x.type) ? `<img data-attimg="${i}" alt="">` : '📄'), esc(x.name), fmtSize(x.size), i, i])).join('') : _t("<small class=\"hint\">अभी कोई file नहीं जुड़ी</small>")), (r.related.length ? _t("<h4>Document में इससे जुड़ा</h4>{0}", [r.related.map(x => `<div class="rel">${linkify(x)}</div>`).join('')]) : ''), esc(t.section || '')]);
  thumbUrls.forEach(u => URL.revokeObjectURL(u)); thumbUrls = [];
  $$('#howBody img[data-attimg]').forEach(async img => {
    const b = await getBlobFor(atts[+img.dataset.attimg]);
    if (b && $('#howDlg').open) { const u = URL.createObjectURL(b); thumbUrls.push(u); img.src = u; }
  });
}
function openHow(t, silent) {
  howTask = t;
  howSpeakText = howText(t).speak;
  $('#howTitle').textContent = t.title;
  renderHow();
  if (!$('#howDlg').open) $('#howDlg').showModal();
  if (!silent) say(howSpeakText);
}
$('#howBody').addEventListener('change', async e => {
  if ((e.target.id === 'attFile' || e.target.id === 'attCam') && howTask) {
    let n = 0; for (const f of [...e.target.files]) if (await addAttachment(howTask, f)) n++;
    e.target.value = ''; if (n) { toast(_t("📎 {0} file जुड़ गई", [n])); renderHow(); render(); } return;
  }
  const i = e.target.dataset && e.target.dataset.sub; if (i === undefined || !howTask) return;
  howTask.subtasks[+i].done = e.target.checked; save(); renderHow(); render();
});
$('#howBody').addEventListener('click', e => {
  const ao = e.target.dataset && e.target.dataset.attopen, ad = e.target.dataset && e.target.dataset.attdel;
  if (ao !== undefined && howTask) { openAttachment(howTask.attachments[+ao]); return; }
  if (ad !== undefined && howTask) {
    const rm = howTask.attachments.splice(+ad, 1); if (!howTask.attachments.length) delete howTask.attachments;
    save(); dropBlobs([{ attachments: rm }]); renderHow(); render(); return;
  }
  if (e.target.id === 'finishTask') { const t = howTask; $('#howDlg').close(); markDone(t); return; }
  const d = e.target.dataset && e.target.dataset.subdel; if (d === undefined || !howTask) return;
  howTask.subtasks.splice(+d, 1); if (!howTask.subtasks.length) delete howTask.subtasks; save(); renderHow(); render();
});
$('#howBody').addEventListener('submit', e => {
  e.preventDefault(); const v = $('#newStep').value.trim(); if (!v || !howTask) return;
  const subs = howTask.subtasks || (howTask.subtasks = []);
  subs.push({ id: 's' + Date.now().toString(36), text: v, done: false }); save(); renderHow(); render(); $('#newStep').focus();
});

/* ---- guided mode: Piyu walks you through the steps one by one ---- */
let guide = null;
const stepSay = g => { const n = g.i + 1, tot = g.t.subtasks.length; return _t2("स्टेप {0}, {1} में से। {2}", [n, tot, g.t.subtasks[g.i].text], "Step {0} of {1}. {2}", [n, tot, g.t.subtasks[g.i].text]); };
function startGuide(t) {
  const subs = ensureSteps(t);
  const i = subs.findIndex(s => !s.done);
  if ($('#howDlg').open) $('#howDlg').close();
  guide = { t, i: i < 0 ? 0 : i, finish: false };
  if (i < 0) subs.forEach(s => s.done = false);          // everything was ticked: start over
  $('#guide').hidden = false; renderGuide(); say(_t2("ठीक है {0}, हम {1} एक-एक स्टेप करके करेंगे। ", [CALL(), t.title], "Okay {0}, let us do {1} one step at a time. ", [callEn(), t.title]) + stepSay(guide));
}
function renderGuide() {
  const g = guide; if (!g) return;
  const subs = g.t.subtasks, done = subDone(g.t);
  $('#gTask').textContent = g.t.title;
  $('#gBar').style.width = Math.round(100 * done / subs.length) + '%';
  if (g.finish) {
    $('#gProg').textContent = _t("🎉 सारे steps पूरे"); $('#gStep').textContent = _t("काम पूरा मार्क कर दूँ?");
    $('#gMain').hidden = true; $('#gFin').hidden = false; return;
  }
  $('#gMain').hidden = false; $('#gFin').hidden = true;
  $('#gProg').textContent = _t("Step {0} / {1} · {2} पूरे", [(g.i + 1), subs.length, done]);
  $('#gStep').textContent = subs[g.i].text;
}
function guideNext() {
  const g = guide; if (!g || g.finish) return;
  const subs = g.t.subtasks; subs[g.i].done = true; save();
  const nxt = subs.findIndex((s, k) => !s.done && k > g.i); const any = subs.findIndex(s => !s.done);
  if (nxt >= 0) g.i = nxt; else if (any >= 0) g.i = any;
  else { g.finish = true; renderGuide(); render(); say(_t2("शाबाश {0}! सारे स्टेप पूरे हो गए। क्या मैं काम पूरा मार्क कर दूँ?", [CALL()], "Well done! All steps are finished. Shall I mark the task as done?", [])); return; }
  renderGuide(); render(); say(stepSay(g));
}
function guideBack() {
  const g = guide; if (!g) return;
  if (g.finish) { g.finish = false; g.i = g.t.subtasks.length - 1; g.t.subtasks[g.i].done = false; save(); renderGuide(); say(stepSay(g)); return; }
  if (g.i > 0) { g.i--; g.t.subtasks[g.i].done = false; save(); }
  renderGuide(); say(stepSay(g));
}
function guideSkip() {
  const g = guide; if (!g || g.finish) return;
  const subs = g.t.subtasks, n = subs.length;
  for (let k = 1; k < n; k++) { const j = (g.i + k) % n; if (!subs[j].done) { g.i = j; renderGuide(); say(stepSay(g)); return; } }
  toast(_t("यही आख़िरी बचा step है"));
}
function guideExit(silent) {
  if (!guide) return; guide = null; $('#guide').hidden = true; stopSpeaking(); render();
  if (!silent) toast(_t("Guide रोक दिया — progress सेव है"));
}
function guideFinishYes() { const t = guide.t; guideExit(true); markDone(t); }
/* voice/text commands while the guide is open; returns true when handled */
function guideCommand(q) {
  if (!guide) return false;
  const s = q.toLowerCase().trim();
  if (guide.finish) {
    if (/(haan|han|ha|हाँ|हां|yes|kar do|कर दो|ho gaya|हो गया|ok|theek)/.test(s)) { guideFinishYes(); return true; }
    if (/(nahi|नहीं|no|abhi nahi|अभी नहीं|roko|रोको|stop)/.test(s)) { guideExit(); return true; }
    if (/(peeche|पीछे|back)/.test(s)) { guideBack(); return true; }
    return false;
  }
  if (/(repeat|dobara|दोबारा|dubara|phir se|फिर से|sunao|सुनाओ|kya bola|क्या बोला|again)/.test(s)) { say(stepSay(guide)); return true; }
  if (/(back|peeche|पीछे|previous|pichla|पिछला)/.test(s)) { guideBack(); return true; }
  if (/(skip|chhod|छोड़|chod)/.test(s)) { guideSkip(); return true; }
  if (/(stop|roko|रोको|band|बंद|exit|\bbas\b|बस|cancel|quit)/.test(s)) { guideExit(); return true; }
  if (/(ho gaya|ho gya|हो गया|done|next|agla|अगला|aage|आगे|kar liya|कर लिया|ok\b|okay|theek hai|ठीक है|complete|finished)/.test(s)) { guideNext(); return true; }
  return false;
}
$('#gDone').onclick = guideNext; $('#gBack').onclick = guideBack; $('#gSkip').onclick = guideSkip; $('#gExit').onclick = () => guideExit();
$('#gRepeat').onclick = () => guide && say(stepSay(guide));
$('#gYes').onclick = guideFinishYes; $('#gNo').onclick = () => guideExit();
/* anything that is not a guide command is an ordinary question: Piyu answers it (spoken + shown here) and the guide stays open */
function guideAsk(txt) {
  const box = $('#gAns'); if (box) box.textContent = '⏳ ' + _t('सोच रही हूँ…');
  const n0 = document.querySelectorAll('.bub.pi').length;
  ask(txt);
  let tries = 0; const poll = () => {
    const b = [...document.querySelectorAll('.bub.pi')]; const last = b[b.length - 1];
    if (box && last && b.length > n0 && !/^(⏳|🌐)/.test(last.textContent.trim()) && !/…$/.test(last.textContent.trim().slice(0, 40))) { box.textContent = last.innerText.replace(/[🔊👍👎]/gu, '').trim().slice(0, 600); return; }
    if (++tries < 40) setTimeout(poll, 400); else if (box) box.textContent = '';
  };
  setTimeout(poll, 500);
}
$('#gMic').onclick = () => listen((txt, alts) => { if (![txt].concat(alts || []).some(guideCommand)) guideAsk(txt); });
$('#gForm').onsubmit = e => { e.preventDefault(); const v = $('#gIn').value; $('#gIn').value = ''; if (v.trim() && !guideCommand(v)) guideAsk(v); };
$('#howGuide').onclick = () => howTask && startGuide(howTask);

/* ================= chat ================= */
function addBub(text, who, extra, meta) {
  if (who !== 'me') text = VK.genderize(text, voiceGender());
  const d = document.createElement('div');
  d.className = 'bub ' + (who === 'me' ? 'me' : 'pi');
  d.innerHTML = linkify(text);
  if (extra) { const s = document.createElement('span'); s.className = 'src'; s.textContent = extra; d.appendChild(s); }
  if (who !== 'me') {
    const b = document.createElement('button'); b.className = 'btn sm ghost'; b.textContent = '🔊'; b.onclick = () => say(text); d.appendChild(b);
    if (meta && meta.fb) [['up', '👍'], ['down', '👎']].forEach(([k, ic]) => { const f = document.createElement('button'); f.className = 'btn sm ghost fb'; f.textContent = ic; f.title = k === 'up' ? _t("आवाज़/जवाब अच्छा लगा") : _t("ठीक नहीं लगा"); f.onclick = () => mindFeedback(k, meta, d); d.appendChild(f); });
  }
  $('#chat').appendChild(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  return d;
}
const listT = arr => arr.map((t, i) => `${i + 1}. ${hm(t.alarmAt)} (${dayLabel(t.alarmAt)}) — ${t.title}`).join('\n');

let lastMore = [];
function bestSentences(text, q, n) {
  const sents = text.split(/(?<=[.!?।])\s+/).filter(x => x.trim());
  const qt = new Set(C.tokens(q));
  const sc = sents.map((x, i) => ({ x, i, s: C.tokens(x).filter(w => qt.has(w)).length }));
  const top = sc.slice().sort((a, b) => b.s - a.s || a.i - b.i).slice(0, n).sort((a, b) => a.i - b.i);
  const rest = sc.filter(o => !top.includes(o)).map(o => o.x);
  return { text: top.map(o => o.x).join(' '), rest };
}
function deleteDocs(list) {
  if (!list.length) return false;
  if (!confirm(_t("{0} और उनके काम हटाएँ?", [(list.length > 1 ? _t("सभी {0} documents", [list.length]) : list[0].name)]))) return false;
  const ids = new Set(list.map(d => d.id));
  const gone = S.tasks.filter(t => ids.has(t.docId));
  S.docs = S.docs.filter(d => !ids.has(d.id)); S.tasks = S.tasks.filter(t => !ids.has(t.docId)); save(); dropBlobs(gone); render(); return true;
}

function answer(q) {
  const s = PiyuI18n.intent(q.toLowerCase().trim());
  const act = activeTasks();
  const blocks = S.docs.flatMap(d => d.blocks);
  const c = CALL();
  if (/^(hi|hello|hey|namaste|namaskar|नमस्ते|हेलो)\b/.test(s)) return { text: _t2("नमस्ते {0}! मैं पीयू हूँ। बताइए, क्या करना है?", [c], "Hello {0}! I am Piyu. How can I help?", [callEn()]) };
  if (!S.docs.length && !S.tasks.length && !S.kb.length && !webAllowed() && !/help|मदद|\bfocus\b|फ़ोकस|फोकस/.test(s)) return { text: _t2("{0}, अभी कोई document नहीं है। Docs टैब में अपनी फ़ाइल upload करें, फिर मैं सब बता दूँगी।", [c], "No document yet. Please upload one in the Docs tab.", []), links: true, searchQ: q.trim(), offerWeb: web.enabled && !S.settings.webOn };
  if (/(delete|hatao|hata do|hata de|हटा|मिटा|remove)/.test(s) && /(doc|file|फ़ाइल|फाइल|डॉक|document)/.test(s)) {
    if (!S.docs.length) return { text: _t2("कोई document है ही नहीं।", [], "There is no document.", []) };
    if (/(sab|सब|all|सारे|saare)/.test(s)) return { text: deleteDocs(S.docs.slice()) ? _t2("सारे documents हटा दिए।", [], "All documents deleted.", []) : _t2("ठीक है, कुछ नहीं हटाया।", [], "Okay, nothing deleted.", []) };
    const d = S.docs.find(x => s.includes(x.name.toLowerCase().replace(/\.[^.]+$/, ''))) || (S.docs.length === 1 ? S.docs[0] : null);
    if (!d) return { text: _t2("कौन सा document हटाना है? ", [], "Which document? ", []) + S.docs.map(x => x.name).join(', ') };
    return { text: deleteDocs([d]) ? _t2("{0} हटा दिया।", [d.name], "{0} deleted.", [d.name]) : _t2("ठीक है, कुछ नहीं हटाया।", [], "Okay, nothing deleted.", []) };
  }
  if (/^(aur|और|more|details?|vistar|विस्तार|aage|आगे)\b/.test(s)) {
    if (!lastMore.length) return { text: _t2("इससे ज़्यादा document में कुछ नहीं मिला।", [], "Nothing more in the document.", []) };
    const m = lastMore.splice(0, 2).join(' '); return { text: m };
  }
  if (/\bfocus\b|फ़ोकस|फोकस/.test(s)) {
    if (/(band|bandh|stop|off|roko|khatam|बंद|रोको|खत्म)/.test(s)) { endFocus(false); return { text: _t2("ठीक है, focus बंद कर दिया।", [], "Okay, focus stopped.", []) }; }
    const n = +((s.match(/(\d{1,3})/) || [])[1] || 25); startFocus(n);
    return { text: _t2("ठीक है {0}, {1} मिनट का focus चालू। सिर्फ़ ज़रूरी (P1/P2) काम ही टोकेंगे।", [c, n], "Focus on for {0} minutes. Only P1/P2 tasks will interrupt.", [n]) };
  }
  if (/(\blink\b|\burl\b|website|लिंक|dashboard kahan|kahan kholna)/.test(s)) {
    const t = C.matchTask(S.tasks, s);
    let ls = t ? C.extractLinks(t.text + ' ' + t.title) : [];
    if (!ls.length) { const hits = C.search(C.buildIndex(blocks), s, 5); ls = hits.flatMap(h => C.extractLinks(h.b.t)); }
    const seen = new Set(); ls = ls.filter(l => !seen.has(l.url) && seen.add(l.url));
    return { text: ls.length ? _t2("ये links मिले:\n", [], "Links found:\n", []) + ls.slice(0, 6).map(l => '• ' + l.url).join('\n') : _t2("इसमें कोई link नहीं मिला।", [], "No link found for that.", []), speak: ls.length ? _t2("{0} link मिले हैं, स्क्रीन पर दिख रहे हैं।", [ls.length], "Found {0} links, shown on screen.", [ls.length]) : undefined };
  }
  if (/(guide|gaid|step by step|ek ek karke|एक एक करके|साथ में करो|saath mein karo|मार्गदर्शन|guide karo|guide kar)/.test(s)) {
    const t = C.matchTask(act, s) || C.pickNext(S.tasks, Date.now());
    if (!t) return { text: _t2("कोई pending काम नहीं मिला।", [], "No pending task found.", []) };
    setTimeout(() => startGuide(t), 50);
    return { text: _t2("ठीक है, \"{0}\" को step-by-step करते हैं।", [t.title], "Okay, let us do \"{0}\" step by step.", [t.title]), task: t, speak: ' ' };
  }
  if (/(rule|niyam|नियम|mana|मना|dont|don't|avoid)/.test(s)) {
    const rules = S.docs.flatMap(d => d.rules || []);
    return { text: rules.length ? _t2("ये नियम याद रखें:\n", [], "Keep these rules in mind:\n", []) + rules.map((r, i) => `${i + 1}. ${r}`).join('\n') : _t2("Document में कोई खास नियम नहीं मिला।", [], "No special rules found.", []) };
  }
  if (/(ho gaya|ho gya|हो गया|done|complete|finished|पूरा हो)/.test(s)) {
    const t = C.matchTask(act, s) || (ringState && ringState.t) || nextTask();
    if (!t) return { text: _t2("कोई pending काम नहीं मिला।", [], "No pending task found.", []) };
    markDone(t); return { text: _t2("शाबाश {0}! \"{1}\" पूरा हो गया।", [c, t.title], "Well done! Marked as done: {0}", [t.title]) };
  }
  if (/(snooze|baad me|बाद में|(?<!\d)5 ?min|पाँच मिनट)/.test(s)) {
    const t = (ringState && ringState.t) || nextTask(); if (t) { snooze(t, 5); return { text: _t2("ठीक है, 5 मिनट बाद फिर याद दिलाऊँगी।", [], "Okay, will remind you in 5 minutes.", []) }; }
  }
  if (/(abhi|अभी|now|next|agla|अगला|pehle|पहले).*(kya|क्या|what|kaam|काम|task|karna|करना|do)|^(what|kya).*(next|now|abhi)|next task/.test(s) || /^(abhi kya|अभी क्या|what now|what next)/.test(s)) {
    const t = C.pickNext(S.tasks, Date.now());
    if (!t) return { text: act.length ? _t2("{0}, सारे बचे काम किसी पिछले काम के पूरे होने का इंतज़ार कर रहे हैं। \"{1}\" से पहले \"{2}\" करना होगा।", [c, act[0].title, ((blockedBy(act[0])[0] || {}).title || '')], "Everything left is waiting on an earlier task.", []) : _t2("{0}, अभी कोई pending काम नहीं है।", [c], "Nothing pending right now.", []) };
    const mins = Math.round((t.alarmAt - Date.now()) / 60000);
    return { text: _t2("{0}, अभी सबसे ज़रूरी काम: {1}\nकारण: {2}\nसमय: {3} ({4})", [c, t.title, C.whyNext(t, Date.now(), 'hi'), full(t.alarmAt), (mins > 0 ? _t("{0} मिनट बाद", [mins]) : _t("अभी"))], "Most important now: {0}\nWhy: {1}\nAt {2}", [t.title, C.whyNext(t, Date.now(), 'en'), full(t.alarmAt)]), task: t };
  }
  const rng = C.parseDayRange(s, Date.now());       // "shukrawar ka kaam", "7 october tak ka pura kaam", "is hafte ka plan"
  if (rng) {
    const l = act.filter(t => t.alarmAt >= rng.from && t.alarmAt < rng.to).sort((x, y) => x.alarmAt - y.alarmAt);
    const label = rng.kind === 'day' ? dayName(rng.from) : rng.kind === 'range' && rng.to - rng.from > 8 * 864e5 ? _t2("अब से {0} तक", [dayName(rng.to - 1)], "now to {0}", [dayName(rng.to - 1)]) : _t2("{0} से {1}", [dayName(rng.from), dayName(rng.to - 1)], "{0} to {1}", [dayName(rng.from), dayName(rng.to - 1)]);
    if (!l.length) return { text: _t2("{0}, {1} के लिए कोई काम नहीं है।", [c, label], "{0}, nothing scheduled for {1}.", [c, label]) };
    let day = '', out = _t2("{0}, {1} — कुल {2} काम:", [c, label, l.length], "{0}, {1} — {2} tasks:", [c, label, l.length]);
    l.forEach((t, i) => {
      const d = dayName(t.alarmAt); if (rng.kind !== 'day' && d !== day) { day = d; out += '\n\n📅 ' + d; }
      const pr = t.priority === 1 ? ' 🔥' : t.priority === 2 ? ' ⬆' : '';
      out += '\n' + hm(t.alarmAt) + ' — ' + t.title + pr + (t.auto ? ' (~)' : '');
      if (rng.kind === 'day' && t.text && t.text !== t.title) out += '\n   ↳ ' + _t2("कैसे: ", [], "How: ", []) + t.text.replace(/\s+/g, ' ').slice(0, 220) + (t.text.length > 220 ? '…' : '');
    });
    out += '\n\n' + _t2("किसी काम के बारे में पूछिए, जैसे \"{0} कैसे करना है\"।", [l[0].title.slice(0, 30)], "Ask about any task, e.g. \"how to do {0}\".", [l[0].title.slice(0, 30)]);
    const f = l[0];
    return { text: out, speak: _t2("{0}, {1} के {2} काम हैं। पहला: {3} बजे, {4}। पूरी सूची स्क्रीन पर है।", [c, label, l.length, hm(f.alarmAt), f.title], "{0}, you have {2} tasks for {1}. First: {3}, {4}. The full list is on screen.", [c, label, l.length, hm(f.alarmAt), f.title]) };
  }
  if (/(progress|प्रगति|streak|kitna kaam hua|कितना काम हुआ|score|performance|kaisa chal raha)/.test(s)) {
    const st = C.buildStats(S.tasks, new Date(), 14);
    const tx = _t2("{0}, आज {1} काम पूरे हुए, {2} बाकी हैं। पिछले 14 दिन में {3} काम पूरे हुए (औसत {4} रोज़)। लगातार {5} दिन का streak है।{6}{7}", [c, st.doneToday, st.pendingToday, st.doneRange, st.avgPerDay, st.streak, (st.onTimePct !== null ? _t(" {0} प्रतिशत काम समय पर हुए।", [st.onTimePct]) : ''), (st.overdue ? _t(" {0} काम का समय निकल चुका है।", [st.overdue]) : '')], "Today {0} done, {1} left. Last 14 days: {2} done ({3}/day). Streak {4} days.{5}{6}", [st.doneToday, st.pendingToday, st.doneRange, st.avgPerDay, st.streak, (st.onTimePct !== null ? ` On time: ${st.onTimePct}%.` : ''), (st.overdue ? ` ${st.overdue} overdue.` : '')]);
    return { text: tx };
  }
  if (/(plan|briefing|\bbrief\b|summary|saar|सार|hisab|hisaab|हिसाब|report|kya hua|क्या हुआ|din kaisa|दिन कैसा|subah ka|raat ka|सुबह का|रात का)/.test(s) && !/(kaise|कैसे|how)/.test(s)) {
    const kind = /(summary|saar|सार|hisab|hisaab|हिसाब|kya hua|क्या हुआ|raat|रात|night|report)/.test(s) ? 'night' : /(subah|सुबह|morning|plan|briefing)/.test(s) ? 'morning' : briefKind();
    const b = liveBrief(kind);
    return { text: b.title + '\n' + b.bullets.map(x => '• ' + x).join('\n'), speak: b.speak };
  }
  const TASKW = '(kaam|काम|task|list|kya|क्या|\\bwhat\\b|\\bdo\\b|todo|to-do|schedule|agenda|\\bplan\\b|\\bwork\\b|karna|करना|karne|करने|baje|बजे)';
  if (new RegExp('(aaj|आज|today|aj)\\b.*' + TASKW + '|^(today|aaj|आज)').test(s) || new RegExp(TASKW + '.*(aaj|आज|today)').test(s)) {
    const k = dayKey(Date.now()); const l = act.filter(t => dayKey(t.alarmAt) === k);
    return { text: l.length ? _t2("{0}, आज के {1} काम:\n", [c, l.length], "Today's {0} tasks:\n", [l.length]) + listT(l) : _t2("आज कोई काम नहीं है।", [], "No tasks today.", []) };
  }
  if (new RegExp('(kal|कल|tomorrow)\\b.*' + TASKW).test(s) || new RegExp(TASKW + '.*\\b(kal|कल|tomorrow)\\b').test(s)) {
    const k = dayKey(Date.now() + 864e5); const l = act.filter(t => dayKey(t.alarmAt) === k);
    return { text: l.length ? _t2("कल के काम:\n", [], "Tomorrow's tasks:\n", []) + listT(l) : _t2("कल कोई काम नहीं है।", [], "No tasks tomorrow.", []) };
  }
  if (/(all|sab|सब|sare|सारे|list|schedule|alarm|reminder|upcoming|pending).*(kaam|काम|task|list|alarm|reminder)?/.test(s) && /(all|sab|सब|sare|सारे|list|schedule|alarm|reminder|upcoming|pending)/.test(s) && !/(kaise|कैसे|how)/.test(s)) {
    return { text: act.length ? _t2("कुल {0} pending काम:\n", [act.length], "{0} pending tasks:\n", [act.length]) + listT(act.slice(0, 15)) + (act.length > 15 ? '\n…' : '') : _t2("कोई pending काम नहीं।", [], "No pending tasks.", []) };
  }
  // how-to / explain: best matching task, else document search
  const t = C.matchTask(S.tasks, s);
  const asksHow = /(kaise|kese|कैसे|how|tarika|तरीका|steps|process|samjha|समझा|explain|batao|बताओ|बताइए|what is|kya hai|क्या है)/.test(s);
  if (t && (asksHow || C.tokens(s).length <= 4)) {
    const { r, speak } = howText(t);
    lastMore = r.related.slice();
    return { text: `${t.title}\n\n` + r.steps.map((x, i) => `${i + 1}. ${x}`).join('\n') + (lastMore.length ? '\n\n' + _t2("और जानना हो तो \"और बताओ\" कहिए।", [], "Say \"more\" for details.", []) : ''), speak, task: t };
  }
  // small talk (thanks, ok, hmm ...) is not a request for information: never offer search/web for it
  const CHATTER = /^(thanks?|thank you|thx|shukriya|dhanyavad|धन्यवाद|शुक्रिया|ok|okay|hmm+|haan|han|nahi|nhi|acha|accha|achha|theek|thik|cool|great|nice|wow|👍|🙏|😊|bye|good night|शुभ रात्रि)\b/i;
  if (!/[?？]/.test(q) && (C.tokens(s).length < 2 || CHATTER.test(s)) && !S.kb.length) return { text: _t2("ठीक है {0}।", [c], "Okay.", []) };
  const idx = C.buildIndex(blocks);
  const hits = C.search(idx, s, 3);
  const docAnswer = () => { const b = bestSentences(hits[0].b.t, s, 2); lastMore = b.rest.concat(hits.slice(1).map(h => h.b.t)); return b.text + (lastMore.length ? '\n\n' + _t2("और जानना हो तो \"और बताओ\" कहिए।", [], "Say \"more\" for details.", []) : ''); };
  if (hits.length && C.answersQuery(s, hits[0].b.t)) return { ai: true, text: docAnswer() };          // 1) the documents really answer it
  const kb = C.kbFind(S.kb, s);                                                                        // 2) Piyu's own learnt answers
  if (kb) { kb.uses = (kb.uses || 0) + 1; save(); return { text: kb.a, kb, extra: _t2("🧠 पहले सीखा हुआ जवाब", [], "🧠 learnt earlier", []) + (kb.sources && kb.sources.length ? ' · ' + kb.sources.map(x => x.title).slice(0, 2).join(', ') : '') }; }
  const fb = hits.length ? { ai: true, weak: true, text: docAnswer() } : { ai: true, text: _t2("{0}, यह बात मुझे आपके documents में नहीं मिली।", [c], "I couldn't find that in your documents.", []) };
  fb.searchQ = q.trim(); fb.links = true; fb.offerWeb = web.enabled && !S.settings.webOn;                // 4) honest fallback + browser links
  if (webAllowed()) fb.web = true;                                                                     // 3) the free web (opt-in)
  return fb;
}

/* ---- optional local AI (Ollama, via server.py). Used only for open questions; everything else stays rule-based. ---- */
const ai = { available: false, models: [], chosen: null };
const AI_T = window.AI_TIMEOUTS || { first: 25000, total: 90000 };
let chatHist = [], aiCtl = null;
async function refreshAI() {
  try {
    const r = await fetchT('/api/ai/status' + (S.settings.aiModel ? '?model=' + encodeURIComponent(S.settings.aiModel) : ''), { headers: hdrs(), cache: 'no-store' }, 4000);
    const j = r.ok ? await r.json() : { available: false, models: [] };
    ai.available = !!j.available; ai.models = j.models || []; ai.chosen = j.chosen || null;
  } catch (e) { ai.available = false; ai.models = []; ai.chosen = null; }
  aiUI();
}
function aiUI() {
  const sel = $('#setAiModel'), info = $('#aiInfo'); if (!sel) return;
  sel.innerHTML = ai.models.map(m => `<option value="${esc(m)}">${esc(m)}</option>`).join('') || '<option value="">—</option>';
  sel.value = ai.chosen || ''; sel.disabled = !ai.available;
  $('#setAi').checked = !!S.settings.aiOn;
  info.textContent = ai.available
    ? (S.settings.aiOn ? _t("🟢 चालू — खुले सवालों के जवाब local AI ({0}) देगा; आपका डेटा इसी computer से बाहर नहीं जाता।", [ai.chosen]) : _t("🟡 Ollama मिला ({0}) — चालू करने के लिए ऊपर टिक करें।", [ai.chosen]))
    : _t("⚪ Ollama नहीं मिला। Install: ollama.com से Ollama लगाएँ, फिर terminal में \"ollama pull qwen2.5:3b\" चलाएँ। बिना इसके Piyu वही keyword जवाब देगी जो अभी दे रही है।");
}
function bubEl(who) {
  const d = document.createElement('div'); d.className = 'bub ' + (who === 'me' ? 'me' : 'pi');
  $('#chat').appendChild(d); return d;
}
/* ---- free web fallback (server-side Wikipedia / DuckDuckGo / your own SearXNG; no key, no cost) ---- */
const web = { enabled: false, sources: [], llm: false };
const webAllowed = () => !!(S.settings.webOn && web.enabled);
async function refreshWeb() {
  try { const r = await fetchT('/api/web/status', { headers: hdrs(), cache: 'no-store' }, 4000); const j = r.ok ? await r.json() : { enabled: false }; web.enabled = !!j.enabled; web.sources = j.sources || []; web.llm = !!j.llm; }
  catch (e) { web.enabled = false; web.sources = []; }
  webUI();
}
function webUI() {
  const cb = $('#setWeb'), info = $('#webInfo'); if (!cb) return;
  cb.checked = !!S.settings.webOn; cb.disabled = !web.enabled;
  info.textContent = web.enabled ? (S.settings.webOn ? _t("🟢 चालू — स्रोत: {0}{1}", [web.sources.join(', '), (web.llm ? _t(" · जवाब local AI बनाएगा") : _t(" · जवाब चुने हुए वाक्यों का सार होगा"))]) : _t("⚪ बंद (उपलब्ध: {0}). हर जवाब के नीचे \"इस बार इंटरनेट से खोजो\" बटन मिलेगा।", [web.sources.join(', ')])) : _t("⚪ इस server पर इंटरनेट खोज उपलब्ध नहीं है (PIYU_WEB=off, या server ./run.sh से नहीं चल रहा)।");
}
function answerChips(d, a, mm) {
  if (!d || (!a.links && !a.offerWeb)) return;
  const row = document.createElement('div'); row.className = 'chips2';
  if (a.offerWeb) { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = '🌐 ' + _t2("इस बार इंटरनेट से खोजो", [], "Search the web (this once)", []); b.onclick = () => { b.disabled = true; askWeb(a.searchQ, a, mm); }; row.appendChild(b); }
  if (a.links) { const L = C.searchLinks(a.searchQ); [[_t("Google पर खोलें"), L.google], ['DuckDuckGo', L.duckduckgo], [_t("ChatGPT में पूछें"), L.chatgpt]].forEach(([t, u]) => { const x = document.createElement('a'); x.className = 'btn sm ghost'; x.href = u; x.target = '_blank'; x.rel = 'noopener noreferrer'; x.textContent = '↗ ' + t; row.appendChild(x); }); }
  d.appendChild(row);
}
function webFeedback(kind, m, d) {
  if (kind === 'up') { C.kbAdd(S.kb, m.q, m.text, m.sources, Date.now(), uid); ev('kb', m.q); save(); toast(_t2("🧠 याद रख लिया — अगली बार बिना इंटरनेट के बताऊँगी।", [], "🧠 Remembered — next time without the internet.", [])); }
  else toast(_t2("ठीक है, यह जवाब याद नहीं रखूँगी।", [], "Okay, I will not remember this answer.", []));
  if (d) d.querySelectorAll('.wfb').forEach(b => b.disabled = true);
}
async function askWeb(q, fb, mm) {
  if (aiCtl) aiCtl.abort();
  stopSpeaking();
  const ctl = new AbortController(); aiCtl = ctl;
  const d = bubEl('pi'); d.textContent = '🌐 ' + _t2("इंटरनेट पर खोज रही हूँ…", [], "Searching the web…", []); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  let text = '', buf = '', first = true, got = false, err = null, none = false, sources = [], mode = '', cached = false;
  const speakChunk = t => { t = t.trim(); if (!t) return; say(t, { interrupt: first, mood: 'calm' }); first = false; };
  const flush = final => {
    for (;;) {
      const m = buf.match(/^[\s\S]*?[.!?।](?=\s|$)/);
      if (m && (m[0].length > 12 || final)) { speakChunk(m[0]); buf = buf.slice(m[0].length); }
      else if (buf.length > 160) { const cut = buf.lastIndexOf(' ', 140); speakChunk(buf.slice(0, cut > 40 ? cut : 140)); buf = buf.slice(cut > 40 ? cut : 140); }
      else break;
    }
    if (final && buf.trim()) { speakChunk(buf); buf = ''; }
  };
  const t0 = setTimeout(() => { if (!got && !none) ctl.abort(); }, 40000), t1 = setTimeout(() => ctl.abort(), 120000);
  try {
    const r = await fetchU('/api/web/ask', { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()), body: JSON.stringify({ q, alt: PiyuTranslit.isHinglish(q) ? PiyuTranslit.hinglish(q) : '', owner: S.settings.ownerEn, history: chatHist.slice(-5, -1), profile: (((window.studentMemory ? window.studentMemory() : '') + ' ' + (mindOn() ? MD.hint(S, q, Date.now()) : '')).trim()) }) });
    if (!r.ok) throw new Error('http ' + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      acc += dec.decode(value, { stream: true });
      let nl; while ((nl = acc.indexOf('\n')) >= 0) {
        const line = acc.slice(0, nl).trim(); acc = acc.slice(nl + 1); if (!line) continue;
        const j = JSON.parse(line);
        if (j.sources) { sources = j.sources; mode = j.mode; cached = !!j.cached; }
        else if (j.none) none = true;
        else if (j.reset) { text = ''; buf = ''; got = false; first = true; stopSpeaking(); d.textContent = '🌐 ' + _t2("इंटरनेट पर खोज रही हूँ…", [], "Searching the web…", []); }   // the local AI stopped half-way: start over with the summary
        else if (j.t) { got = true; text += j.t; buf += j.t; d.innerHTML = linkify(text); flush(false); d.scrollIntoView({ block: 'end' }); }
        else if (j.error) err = j.error;
      }
    }
  } catch (e) { err = err || (ctl.signal.aborted ? (aiCtl === ctl ? 'timeout' : 'replaced') : e.message); }
  clearTimeout(t0); clearTimeout(t1); if (aiCtl === ctl) aiCtl = null;
  if (err === 'replaced') { d.innerHTML = linkify(text) + ' …'; return; }
  if (!got || !text.trim()) { d.remove(); fb.offerWeb = false; reply(fb, mm || {}, _t2("(इंटरनेट से भी जवाब नहीं मिला)", [], "(nothing found on the web either)", [])); ev('web_none', q); return; }
  flush(true);
  const s = document.createElement('span'); s.className = 'src';
  s.textContent = '🌐 ' + _t2("इंटरनेट से", [], "from the web", []) + ' · ' + _t2("मुफ़्त स्रोत", [], "free sources", []) + (mode === 'llm' ? ' · local AI' : ' · ' + _t2("सार", [], "summary", [])) + (cached ? ' · ' + _t2("सहेजा हुआ", [], "cached", []) : '') + (err ? ' · ⚠ ' + _t2("अधूरा", [], "cut short", []) : '');
  d.appendChild(s);
  if (sources.length) { const row = document.createElement('div'); row.className = 'chips2'; sources.forEach(x => { const l = document.createElement('a'); l.className = 'btn sm ghost'; l.href = x.url; l.target = '_blank'; l.rel = 'noopener noreferrer'; l.textContent = '🔗 ' + (x.title || x.url).slice(0, 40); row.appendChild(l); }); d.appendChild(row); }
  const m = { q, text: text.trim(), sources };
  const row2 = document.createElement('div'); row2.className = 'chips2';
  [['🔊', () => say(text)], ['👍 ' + _t2("याद रखो", [], "remember", []), () => webFeedback('up', m, d)], ['👎', () => webFeedback('down', m, d)]].forEach(([t, fn]) => { const b = document.createElement('button'); b.className = 'btn sm ghost wfb'; b.textContent = t; b.onclick = fn; row2.appendChild(b); });
  d.appendChild(row2);
  chatHist.push({ role: 'assistant', content: text }); ev('web', q);
}

async function askAI(q, fb, mm) {
  if (aiCtl) { aiCtl.abort(); }   // a newer question replaces the older answer
  stopSpeaking();
  const ctl = new AbortController(); aiCtl = ctl;
  const d = bubEl('pi'); d.textContent = '🤔 ' + _t2("सोच रही हूँ…", [], "Thinking…", []); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
  let text = '', buf = '', first = true, got = false, err = null, spoken = 0;
  const speakChunk = (t, force) => { t = t.trim(); if (!t) return; say(t, { interrupt: first, mood: 'calm' }); first = false; };
  const flush = final => {
    while (true) {
      const m = buf.match(/^[\s\S]*?[.!?।](?=\s|$)/);
      if (m && (m[0].length > 12 || final)) { speakChunk(m[0]); buf = buf.slice(m[0].length); }
      else if (buf.length > 160) { const cut = buf.lastIndexOf(' ', 140); speakChunk(buf.slice(0, cut > 40 ? cut : 140)); buf = buf.slice(cut > 40 ? cut : 140); }
      else break;
    }
    if (final && buf.trim()) { speakChunk(buf); buf = ''; }
  };
  const t0 = setTimeout(() => { if (!got) ctl.abort(); }, AI_T.first), t1 = setTimeout(() => ctl.abort(), AI_T.total);
  try {
    while (syncing) await sleep(80);
    await syncNow();                    // the server builds the AI context from its SQL copy, so make sure it is current
    const r = await fetchU('/api/ai/chat', { method: 'POST', signal: ctl.signal, headers: Object.assign({ 'Content-Type': 'application/json' }, hdrs()), body: JSON.stringify({ q, model: S.settings.aiModel || undefined, owner: S.settings.ownerEn, history: chatHist.slice(-5, -1), profile: (((window.studentMemory ? window.studentMemory() : '') + ' ' + (mindOn() ? MD.hint(S, q, Date.now()) : '')).trim()) }) });
    if (!r.ok) throw new Error('http ' + r.status);
    const rd = r.body.getReader(), dec = new TextDecoder(); let acc = '';
    for (;;) {
      const { value, done } = await rd.read(); if (done) break;
      acc += dec.decode(value, { stream: true });
      let nl; while ((nl = acc.indexOf('\n')) >= 0) {
        const line = acc.slice(0, nl).trim(); acc = acc.slice(nl + 1); if (!line) continue;
        const j = JSON.parse(line);
        if (j.t) { got = true; text += j.t; buf += j.t; d.innerHTML = linkify(text); flush(false); d.scrollIntoView({ block: 'end' }); }
        else if (j.error) err = j.error;
      }
    }
  } catch (e) { err = err || (ctl.signal.aborted ? (aiCtl === ctl ? 'timeout' : 'replaced') : e.message); }
  clearTimeout(t0); clearTimeout(t1);
  if (aiCtl === ctl) aiCtl = null;
  if (err === 'replaced') { d.innerHTML = _t("{0} <span class=\"src\">(नया सवाल आ गया)</span>", [(linkify(text) + (text ? ' …' : '🤔 …'))]); return; }
  if (!got || !text.trim()) { d.remove(); reply(fb, mm || {}, _t2("(local AI जवाब नहीं दे पाया — document से सीधा जवाब)", [], "(local AI unavailable — plain document answer)", [])); return; }
  flush(true);
  const s = document.createElement('span'); s.className = 'src'; s.textContent = '🧠 ' + _t2("local AI", [], "local AI", []) + (ai.chosen ? ' · ' + ai.chosen : '') + (err ? ' · ' + _t2("⚠ जवाब अधूरा रह गया", [], "⚠ answer cut short", []) : '');
  d.appendChild(s);
  const b = document.createElement('button'); b.className = 'btn sm ghost'; b.textContent = '🔊'; b.onclick = () => say(text); d.appendChild(b);
  chatHist.push({ role: 'assistant', content: text });
}
/* ================= PIYU'S MIND: memory, tone learning, emotions, questions, self-tuning voice ================= */
const MD = PiyuMind;
let lastUserAt = 0;
const mindOn = () => !!(S.mind && S.mind.on);
const touchMind = () => { S.mind.updatedAt = Date.now(); };
const factOf = key => { const f = S.facts.find(x => x.key === key); return f ? f.value : null; };
function upsertFact(f, src) {
  const now = Date.now(); let x = S.facts.find(y => y.key === f.key);
  if (x) { if (x.value === f.value && x.text === f.text) return x; Object.assign(x, { value: f.value, text: f.text, at: now, src, conf: f.conf || 0.8 }); }
  else { x = { id: uid(), key: f.key, value: f.value, text: f.text, src, at: now, conf: f.conf || 0.8 }; S.facts.push(x); if (S.facts.length > 200) S.facts.shift(); }
  return x;
}
function ev(kind, text, extra) { if (mindOn()) MD.addEpisode(S, Object.assign({ kind, text: text || '' }, extra || {})); }
function mindCtx() {
  const now = Date.now(), skipTasks = S.tasks.filter(t => !t.done && ((t.snoozed || 0) >= 2 || t.missed)).slice(0, 2).map(t => ({ id: t.id, title: t.title }));
  return { now, lang: S.settings.lang === 'en' ? 'en' : 'hi', preMin: S.settings.preMin, quiet: C.inQuiet(new Date(), S.settings), focus: focusUntil() > now, ring: !!ringState, guide: !!guide, skipTasks };
}
/* what Piyu learnt is applied only through explicit, visible effects */
function applyEffects(fx, src) {
  if (!fx) return;
  (fx.facts || []).forEach(f => upsertFact(f, src));
  if (fx.settings) { if (fx.settings.call) fx.settings.call = MD.addrDev(fx.settings.call); Object.assign(S.settings, fx.settings); render(); }
  if (fx.voice) MD.voiceNudge(S.mind, fx.voice.ctx || '*', fx.voice.d || {});
  (fx.episodes || []).forEach(e => MD.addEpisode(S, e));
  if (fx.mood && fx.mood.top) S.mind.profile.recent.push({ at: Date.now(), top: fx.mood.top, val: fx.mood.val, int: fx.mood.int });
  if (fx.follow) enqueueFollow(fx.follow);
  touchMind(); save();
}
function enqueueFollow(f) {
  const ix = f.indexOf(':'), k = f.slice(0, ix), v = f.slice(ix + 1); let ins = null;
  if (k === 'i_brief_morning') { const [h, m] = v.split(':').map(Number), t = new Date(2000, 0, 1, h, m + 30), nt = pad(t.getHours()) + ':' + pad(t.getMinutes()); ins = { id: 'i_brief_morning', hi: _t("आप {0} बजे उठते हैं। क्या मैं सुबह का प्लान {1} बजे बोलूँ?", [v, nt]), settings: { briefMorning: nt }, ack: _t("ठीक है, सुबह का प्लान {0} बजे बोलूँगी।", [nt]) }; }
  if (k === 'i_quiet_night') { const wake = factOf('wake_time') || '07:00'; ins = { id: 'i_quiet_night', hi: _t("आप {0} बजे सोते हैं। क्या मैं {1} से {2} तक \"शांत समय\" चालू कर दूँ (चेतावनियाँ चुप, alarm धीमा)?", [v, v, wake]), settings: { quietOn: true, quietFrom: v, quietTo: wake }, ack: _t("ठीक है, शांत समय चालू कर दिया।") }; }
  if (ins && !S.mind.insights.some(i => i.id === ins.id) && !S.mind.answered[ins.id]) { S.mind.insights.push(ins); S.mind.lastAsk = 0; }
}
function mindSituation() {
  const now = Date.now(), st = C.buildStats(S.tasks, new Date(), 7);
  return { st, sit: MD.situation({ now, overdue: st.overdue, streak: st.streak, doneToday: st.doneToday, focus: focusUntil() > now, quiet: C.inQuiet(new Date(), S.settings) }, S.mind.profile) };
}
/* Piyu's reply, shaped by how the user feels and writes */
function mindShape(a, mm) {
  if (!mindOn() || !mm || !mm.feats) return { text: a.text, spoken: a.speak || a.text, mood: null };
  const prof = S.mind.profile, style = MD.styleOf(prof), { st, sit } = mindSituation();
  const pend = S.tasks.filter(t => !t.done && !blockedBy(t).length).sort((x, y) => x.title.length - y.title.length)[0];
  const opts = { lang: S.settings.lang === 'en' ? 'en' : 'hi', addr: CALL(), smallTask: pend && pend.title.slice(0, 40), overdue: st.overdue, streak: st.streak, seed: prof.n, pure: mm.feats.words <= 6 && mm.feats.emo.top === 'thanks', roman: S.settings.mindRoman !== false };
  const emo = S.settings.mindEmpathy === false ? { top: null } : mm.feats.emo;
  const shown = MD.shape(a.text, emo, sit, style, opts), spoken = MD.shape(a.speak || a.text, emo, sit, style, opts).spoken;
  return { text: shown.text, spoken, mood: shown.mood, empathic: shown.empathic };
}
function mindCommand(q) {
  const s = q.toLowerCase().trim();
  let m;
  if (/(seekhna|seekh(na)?|learning|सीखना|सीखो).*(band|off|बंद|mat|रोक)|(band|off|बंद|रोक).*(seekhna|learning|सीखना)/.test(s)) { S.mind.on = false; touchMind(); save(); return _t2("ठीक है, अब मैं आपसे कुछ नहीं सीखूँगी और कुछ याद नहीं रखूँगी।", [], "Okay, I will stop learning and remembering.", []); }
  if (/(seekhna|learning|सीखना|सीखो).*(chalu|on|shuru|चालू|शुरू)/.test(s) && !S.mind.on) { S.mind.on = true; touchMind(); save(); return _t2("ठीक है, मैं फिर से आपसे सीखूँगी।", [], "Okay, I will learn from you again.", []); }
  if (/(sab|sabhi|everything|सब|सारा).*(bhool|bhul|forget|भूल)/.test(s)) { if (confirm(_t("Piyu आपके बारे में सीखी हर बात भूल जाएगी। पक्का?"))) { forgetAll(); return _t2("ठीक है, मैंने सब भूल दिया।", [], "Done, I forgot everything.", []); } return _t2("ठीक है, कुछ नहीं भूली।", [], "Okay, nothing forgotten.", []); }
  if ((m = s.match(/^(?:yaad rakho|yad rakho|yaad rakhna|remember(?: that)?|याद रखो|याद रखना)\s+(.{3,160})/))) { const x = upsertFact({ key: 'note:' + Date.now().toString(36), value: m[1], text: _t("याद रखा: {0}", [m[1]]) }, 'said'); touchMind(); save(); return _t2("ठीक है, याद रख लिया: ", [], "Got it, I will remember: ", []) + m[1]; }
  if ((m = s.match(/^(?:bhool jao|bhul jao|forget(?: about)?|भूल जाओ|भूल जाना)\s+(.{2,80})/))) {
    const ws = new Set(MD._internal.words(m[1]).filter(w => w.length > 2)), gone = S.facts.filter(f => MD._internal.words(f.text + ' ' + f.value).some(w => ws.has(w)));
    gone.forEach(f => S.facts.splice(S.facts.indexOf(f), 1)); touchMind(); save(); render();
    return gone.length ? _t2("{0} बात भूल गई।", [gone.length], "Forgot {0} item(s).", [gone.length]) : _t2("इस बारे में मुझे कुछ याद नहीं था।", [], "I did not remember anything about that.", []);
  }
  if (/(mere baare me|mere bare me|meri (yaaddasht|yaadein|memory)|kya (yaad|pata|jaanti|jaante)|what do you (know|remember)|मेरे बारे में|तुम्हें? (क्या )?(याद|पता))/.test(s)) {
    openMem(); const fs = S.facts.filter(f => !f.key.startsWith('skip:')).slice(-5).map(f => f.text);
    return fs.length ? _t2("मुझे आपके बारे में ये बातें याद हैं: ", [], "Here is what I remember about you: ", []) + fs.join('; ') + _t2("। पूरी याददाश्त स्क्रीन पर खुली है।", [], ". The full memory is open on screen.", []) : _t2("अभी मैं आपको जान ही रही हूँ, ज़्यादा कुछ याद नहीं। बात करते रहिए!", [], "I am still getting to know you, not much yet. Keep talking!", []);
  }
  return null;
}
/* read + learn from every message; may fully handle it (answer to Piyu's question, remark about her voice, memory command) */
function mindObserve(q) {
  const res = { feats: null, handled: false, stmts: [] };
  lastUserAt = Date.now();
  if (!mindOn()) { const c = mindCommand(q); if (c) { addBub(c, 'pi'); say(c); res.handled = true; } return res; }
  const feats = MD.analyze(q, PiyuTranslit); res.feats = feats;
  const cmd = mindCommand(q), vr = MD.voiceRemark(q);
  if (cmd) { addBub(cmd, 'pi'); say(cmd); res.handled = true; if (mindSkipLearn) { mindSkipLearn = false; return res; } }   // never re-learn from a "forget everything" command
  else if (vr) {
    MD.voiceNudge(S.mind, '*', vr); MD.voiceNudge(S.mind, MD.ctxKey(Date.now(), 'calm'), vr);
    const t = vr.good ? _t2("शुक्रिया! ऐसे ही बोलती रहूँगी।", [], "Thank you! I will keep it this way.", []) : vr.sp > 0 ? _t2("ठीक है, अब थोड़ा धीरे बोलूँगी।", [], "Okay, I will speak a little slower.", []) : vr.sp < 0 ? _t2("ठीक है, अब थोड़ा तेज़ बोलूँगी।", [], "Okay, a bit faster from now.", []) : vr.noise > 0 ? _t2("ठीक है, थोड़ा भाव डालकर बोलूँगी।", [], "Okay, with a little more expression.", []) : vr.noise < 0 ? _t2("ठीक है, थोड़ा शांत लहजे में बोलूँगी।", [], "Okay, in a calmer tone.", []) : vr.st > 0 ? _t2("ठीक है, आवाज़ थोड़ी ऊँची कर दी।", [], "Okay, a little higher.", []) : _t2("ठीक है, आवाज़ थोड़ी गहरी कर दी।", [], "Okay, a little deeper.", []);
    addBub(t, 'pi'); say(t); res.handled = true; res.stmts.push(_t2("आवाज़ की पसंद", [], "voice preference", []));
  } else if (S.mind.pending && MD.looksLikeAnswer(S.mind, q)) { const fx = MD.answer(S.mind, S, null, q, { now: Date.now() }); if (fx) { afterAnswer(fx); res.handled = true; } }
  MD.learn(S.mind.profile, feats, Date.now());
  MD.addEpisode(S, { kind: 'user', text: q, emo: { top: feats.emo.top, val: +feats.emo.valence.toFixed(2) } });
  MD.extractFacts(q).forEach(f => {
    const x = upsertFact(f, 'said'); res.stmts.push(x.text);
    if (f.key === 'addr') { f.value = MD.addrDev(f.value); x.value = f.value; x.text = _t("बुलाने का तरीका: {0}", [f.value]); S.settings.call = f.value; }
    if (f.key === 'name') { S.settings.owner = f.value; if (/^[\x00-\x7f ]+$/.test(f.value)) S.settings.ownerEn = f.value; render(); }
  });
  touchMind(); save();
  return res;
}
function afterAnswer(fx) {
  applyEffects(fx, 'asked');
  let t = fx.ack || '';
  if (fx.mood && fx.mood.top) { const { sit } = mindSituation(), em = MD.empathy({ top: fx.mood.top, intensity: 0.8 }, sit, MD.styleOf(S.mind.profile), { lang: S.settings.lang === 'en' ? 'en' : 'hi' }); if (em.pre) t = em.pre; }
  if (t) { const d = addBub(t, 'pi'); say(t, { mood: fx.mood && ['stress', 'tired', 'sad', 'anger'].includes(fx.mood.top) ? 'gentle' : 'calm' }); }
  if (fx.taskAction) taskActionUI(fx.taskAction);
}
function taskActionUI(a) {
  const t = S.tasks.find(x => x.id === a.id); if (!t) return;
  const d = document.createElement('div'); d.className = 'bub pi'; const row = document.createElement('div'); row.className = 'chips2';
  const mk = (label, fn) => { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = label; b.onclick = () => { row.querySelectorAll('button').forEach(x => x.disabled = true); fn(); }; row.appendChild(b); };
  if (a.type === 'offer_delete') { d.textContent = _t2("इस काम को हटा दूँ?", [], "Shall I delete this task?", []); mk(_t2("हाँ, हटाइए", [], "Yes, delete", []), () => { delTask(t); toast(_t("हटा दिया")); }); mk(_t2("नहीं", [], "No", []), () => { }); }
  if (a.type === 'offer_steps') { d.textContent = _t2("क्या हम इसे Guide से छोटे स्टेप में करें?", [], "Shall we do it in small steps with the guide?", []); mk('▶ Guide', () => startGuide(t)); mk(_t2("अभी नहीं", [], "Not now", []), () => { }); }
  if (a.type === 'offer_reschedule') { d.textContent = _t2("इसे कल इसी समय पर खिसका दूँ?", [], "Move it to the same time tomorrow?", []); mk(_t2("हाँ, कल", [], "Yes, tomorrow", []), () => { t.alarmAt += 864e5; t.fired = false; t.pre = false; t.missed = false; save(); render(); toast(_t("कल के लिए लग गया")); }); mk(_t2("नहीं", [], "No", []), () => { }); }
  if (a.type === 'earlier_alert') { t.preMin = 30; save(); d.textContent = _t2("ठीक है, इसके लिए मैं 30 मिनट पहले याद दिलाऊँगी।", [], "Okay, I will remind you 30 minutes before this one.", []); }
  d.appendChild(row); $('#chat').appendChild(d); d.scrollIntoView({ block: 'end', behavior: 'smooth' });
}
/* ---- Piyu asks questions ---- */
function deliverQuestion(pq) {
  MD.markAsked(S.mind, pq); save();
  const style = MD.styleOf(S.mind.profile), text = VK.genderize(MD.restyle(pq.text, style, { addr: CALL(), roman: false }), voiceGender());
  const d = document.createElement('div'); d.className = 'bub pi q'; d.innerHTML = linkify(text);
  const row = document.createElement('div'); row.className = 'chips2';
  pq.chips.forEach(c => { const b = document.createElement('button'); b.className = 'btn sm'; b.textContent = c.l; b.onclick = () => { row.querySelectorAll('button').forEach(x => x.disabled = true); answerQuestion(c.v, c.l); }; row.appendChild(b); });
  d.appendChild(row);
  if (pq.free) { const h = document.createElement('small'); h.className = 'src'; h.textContent = _t2("(या नीचे लिखकर बताइए)", [], "(or type your answer below)", []); d.appendChild(h); }
  $('#chat').appendChild(d);
  if (!$('#tab-chat').classList.contains('active')) { toast(_t("💬 Piyu ने एक सवाल पूछा")); const nb = $('nav [data-tab=chat]'); if (nb) nb.classList.add('dot'); }
  if (!ringState) say(text, { mood: 'calm' });
  return d;
}
function answerQuestion(value, label) {
  addBub(label, 'me'); lastUserAt = Date.now();
  const fx = MD.answer(S.mind, S, value, label, { now: Date.now() }); if (fx) afterAnswer(fx);
}
const pqStatic = id => { const q = MD.QUESTIONS.find(x => x.id === id); return { id, text: q.hi, chips: q.chips, free: q.free, meta: { kind: 'static', id } }; };
let mindTickAt = 0;
function mindTick() {
  const now = Date.now(); if (now - mindTickAt < 20000) return; mindTickAt = now;
  if (!mindOn()) return;
  if (MD.expirePending(S.mind, now)) save();
  const d = new Date(), key = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  if (d.getHours() >= 21 && S.mind.lastLearn !== key && !ringState && !guide) runNightly(false);
  if (S.settings.mindAsk === false || now - lastUserAt < 60000) return;
  const pq = MD.pickQuestion(S.mind, S, mindCtx()); if (pq) deliverQuestion(pq);
}
function runNightly(manual) {
  const r = MD.nightly(S, S.tasks, Date.now(), S.settings); save();
  if (manual) toast(r.insights.length ? _t("🧠 {0} नई सीख: जल्द पूछूँगी", [r.insights.length]) : _t("🧠 आज सीखने को नया कुछ नहीं"));
  if (manual && $('#memDlg').open) renderMem();
  return r;
}
let mindSkipLearn = false;
function forgetAll() {
  mindSkipLearn = true;
  S.kb = [];
  S.facts = []; S.episodes = []; S.days = []; const on = S.mind.on; S.mind = MD.newMind(); S.mind.on = on; S.mind.updatedAt = Date.now(); save(); render(); if ($('#memDlg') && $('#memDlg').open) renderMem();
}
function mindFeedback(kind, meta, el) {
  if (meta && meta.kbId) {
    const e = S.kb.find(x => x.id === meta.kbId);
    if (e) { if (kind === 'down') { S.kb.splice(S.kb.indexOf(e), 1); toast(_t2("ठीक है, यह जवाब हटा दिया।", [], "Okay, removed that answer.", [])); } else { e.up = (e.up || 0) + 1; toast(_t2("धन्यवाद!", [], "Thanks!", [])); } save(); }
    if (el) el.querySelectorAll('.fb').forEach(b => b.disabled = true);
    if (kind === 'down') return;
  }
  if (!mindOn()) return;
  const ctx = MD.ctxKey(Date.now(), (meta && meta.mood) || 'calm');
  if (kind === 'up') { MD.voiceNudge(S.mind, ctx, { good: 1 }); ev('feedback', '👍'); toast(_t2("धन्यवाद! ऐसे ही बोलूँगी।", [], "Thanks! I will keep it this way.", [])); }
  else {
    const dn = S.mind.downs = S.mind.downs || {}; dn[ctx] = (dn[ctx] || 0) + 1; ev('feedback', '👎'); toast(_t2("ठीक है, सुधारने की कोशिश करूँगी।", [], "Okay, I will try to improve.", []));
    if (dn[ctx] >= 3) { dn[ctx] = 0; delete S.mind.answered.q_voice; if (!S.mind.pending) deliverQuestion(pqStatic('q_voice')); }
  }
  if (el) el.querySelectorAll('.fb').forEach(b => b.disabled = true);
  touchMind(); save();
}
/* ---- memory screen ---- */
function openMem() { renderMem(); $('#memDlg').showModal(); }
function renderMem() {
  const m = S.mind, p = m.profile, st = MD.styleOf(p), days = Math.max(0, Math.floor((Date.now() - p.first) / 864e5));
  const L = { devanagari: _t("हिन्दी (देवनागरी)"), hinglish: 'Roman Hinglish', mixed: _t("मिली-जुली"), english: 'English' }, R = { formal: _t("औपचारिक"), casual: _t("अनौपचारिक"), neutral: _t("सामान्य") }, B = { short: _t("छोटे वाक्य"), normal: _t("सामान्य"), long: _t("लंबे वाक्य") };
  const EMN = { joy: _t("😊 खुशी"), thanks: _t("🙏 आभार"), sad: _t("😢 उदासी"), anger: _t("😡 गुस्सा"), stress: _t("😰 तनाव"), tired: _t("😴 थकान"), excited: _t("🔥 जोश"), confused: _t("🤔 उलझन"), bored: _t("😐 बोरियत") };
  const emo = Object.entries(p.emo || {}).sort((x, y) => y[1] - x[1]).slice(0, 5);
  const vp = Object.entries(m.voice || {}).filter(([, v]) => v.sp || v.noise || v.st || v.good);
  const factRows = S.facts.slice().reverse().map(f => _t("<li data-fact=\"{0}\"><span>{1}</span><small>{2}</small><button class=\"x2\" data-act=\"editfact\" title=\"बदलें\">✎</button><button class=\"x2\" data-act=\"delfact\" title=\"हटाएँ\">×</button></li>", [f.id, esc(f.text), esc(f.src || '')])).join('');
  $('#memBody').innerHTML = _t("\n    <div class=\"mrow\"><label class=\"chk\"><input type=\"checkbox\" id=\"memOn\" {0}> सीखना और याद रखना चालू</label><small class=\"hint\">यह सारा सिर्फ़ आपके अपने computer/server पर रहता है। बंद करने पर कुछ नया नहीं सीखा जाएगा।</small></div>\n    <h4>आपके अंदाज़ की समझ</h4>\n    <div class=\"mrow\"><div class=\"prog\"><i style=\"width:{1}%\"></i></div><small class=\"hint\">{2} संदेशों से सीखा · {3} दिन · भरोसा {4}%{5}</small>\n      <div class=\"tags2\">{6}</div></div>\n    <h4>हाल की भावनाएँ</h4>{7}\n    <h4>याद रखी हुई बातें ({8})</h4>\n    <ul class=\"facts\">{9}</ul>\n    <form id=\"memAdd\" class=\"addstep\"><input id=\"memNew\" placeholder=\"कुछ याद कराएँ… (जैसे: मुझे सुबह की चाय पसंद है)\" autocomplete=\"off\"><button class=\"btn sm\">+ याद कराएँ</button></form>\n    <h4>सीखे हुए जवाब ({10})</h4>{11}\n    <h4>दिन-भर का सार</h4>{12}\n    <h4>आवाज़ में सीखे बदलाव</h4>{13}\n    <h4>सीख और सवाल</h4>{14}\n    {15}", [(m.on ? 'checked' : ''), Math.round(st.conf * 100), p.n, days, Math.round(st.conf * 100), (st.ready ? '' : _t(" (अभी कम डेटा — आदतें पक्की नहीं)")), (st.ready ? _t("<span class=\"tag\">{0}</span><span class=\"tag\">{1}</span><span class=\"tag\">{2}</span>{3}<span class=\"tag\">जवाब: {4}</span>", [L[st.lang], R[st.register], B[st.brevity], (st.emoji ? _t("<span class=\"tag\">emoji पसंद</span>") : ''), (st.script === 'roman' ? _t("Roman में") : _t("देवनागरी में"))]) : _t("<span class=\"tag\">सीख रही हूँ…</span>")), (emo.length ? emo.map(([k, v]) => `<div class="vmeter"><div class="vm-top"><span class="vm-name">${EMN[k] || k}</span><span class="vm-n">${v.toFixed(1)}</span></div><div class="vm-track"><i style="width:${Math.min(100, v * 20)}%"></i></div></div>`).join('') : _t("<small class=\"hint\">अभी कोई खास भावना नहीं देखी</small>")), S.facts.length, (factRows || _t("<small class=\"hint\">अभी कुछ नहीं। कहिए: \"याद रखो मुझे चाय पसंद है\"</small>")), S.kb.length, (S.kb.slice().reverse().slice(0, 15).map(e => _t("<div class=\"rel\" data-kb=\"{0}\"><b>{1}</b><br>{2}{3} <button class=\"x2\" data-act=\"delkb\" title=\"हटाएँ\">×</button></div>", [e.id, esc(e.q), esc(e.a.slice(0, 160)), (e.a.length > 160 ? '…' : '')])).join('') || _t("<small class=\"hint\">इंटरनेट से मिले जवाब पर 👍 दें, तो वे यहाँ जुड़ जाते हैं और अगली बार बिना इंटरनेट के मिलते हैं।</small>")), (S.days.slice(-8).reverse().map(d => `<div class="rel">${esc(d.summary)}</div>`).join('') || _t("<small class=\"hint\">3 दिन बाद रोज़ का सार यहाँ बनेगा</small>")), (vp.length ? _t("<table class=\"vtable\"><thead><tr><th>स्थिति</th><th>गति</th><th>भाव</th><th>ऊँचाई</th><th>👍</th></tr></thead><tbody>{0}</tbody></table><button class=\"btn sm\" id=\"memVoiceReset\">आवाज़ की सीख रीसेट</button>", [vp.map(([k, v]) => `<tr><td>${esc(k === '*' ? _t("हमेशा") : k)}</td><td>${(v.sp * 100).toFixed(0)}%</td><td>${(v.noise * 100).toFixed(0)}%</td><td>${v.st.toFixed(1)}</td><td>${v.good}</td></tr>`).join('')]) : _t("<small class=\"hint\">अभी आवाज़ में कोई बदलाव नहीं सीखा। 👍/👎 दीजिए या कहिए \"थोड़ा धीरे बोलो\"।</small>")), ((m.insights || []).map(i => `<div class="rel">${esc(i.hi)} <small class="src">${m.answered[i.id] ? _t("✔ जवाब मिला") : _t("पूछना बाकी")}</small></div>`).join('') || _t("<small class=\"hint\">रात को मैं आपकी आदतों से कुछ सीखकर सुझाव बनाती हूँ — बदलाव तभी होगा जब आप \"हाँ\" कहेंगे।</small>")), (m.pending ? _t("<div class=\"rel\">⏳ एक सवाल का जवाब बाकी है (चैट में)</div>") : '')]);
}
$('#memBody').addEventListener('change', e => { if (e.target.id === 'memOn') { S.mind.on = e.target.checked; touchMind(); save(); toast(S.mind.on ? _t("सीखना चालू") : _t("सीखना बंद")); } });
$('#memBody').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'), li = e.target.closest('[data-fact]');
  if (b && li) {
    const f = S.facts.find(x => x.id === li.dataset.fact); if (!f) return;
    if (b.dataset.act === 'delfact') { S.facts.splice(S.facts.indexOf(f), 1); touchMind(); save(); renderMem(); }
    if (b.dataset.act === 'editfact') { const v = prompt(_t("बदलें:"), f.text); if (v && v.trim()) { f.text = v.trim(); f.value = v.trim(); f.src = 'edited'; touchMind(); save(); renderMem(); } }
  }
  const kbEl = e.target.closest('[data-kb]');
  if (kbEl && e.target.dataset.act === 'delkb') { const k = S.kb.find(x => x.id === kbEl.dataset.kb); if (k) { S.kb.splice(S.kb.indexOf(k), 1); save(); renderMem(); } }
  if (e.target.id === 'memVoiceReset') { S.mind.voice = {}; touchMind(); save(); renderMem(); toast(_t("आवाज़ की सीख रीसेट")); }
});
$('#memBody').addEventListener('submit', e => { e.preventDefault(); const v = $('#memNew').value.trim(); if (!v) return; upsertFact({ key: 'note:' + Date.now().toString(36), value: v, text: _t("याद रखा: {0}", [v]) }, 'told'); touchMind(); save(); renderMem(); });
$('#memLearn').onclick = () => runNightly(true);
$('#memForget').onclick = () => { if (confirm(_t("Piyu आपके बारे में सीखी हर बात (याद, आदतें, आवाज़ की सीख) भूल जाएगी। पक्का?"))) forgetAll(); };

/* ---- the reply path ---- */
function reply(a, mm, extra, noChips) {
  const sh = mindShape(a, mm), meta = { fb: mindOn() || !!a.kb, mood: sh.mood || 'calm', kbId: a.kb && a.kb.id };
  const src = [extra || a.extra || (a.task ? '↳ ' + a.task.title : ''), mm && mm.stmts && mm.stmts.length ? '🧠 ' + _t2("याद रखा", [], "remembered", []) + ': ' + mm.stmts.join('; ') : ''].filter(Boolean).join(' · ');
  const d = addBub(sh.text, 'pi', src, meta);
  chatHist.push({ role: 'assistant', content: sh.text });
  say(sh.spoken, { mood: sh.mood || undefined });
  if (!noChips) answerChips(d, a, mm);
  return d;
}
function ask(q) {
  q = q.trim(); if (!q) return;
  addBub(q, 'me'); chatHist.push({ role: 'user', content: q }); if (chatHist.length > 40) chatHist.splice(0, chatHist.length - 40);
  const mm = mindObserve(q);
  if (guideCommand(q)) return;
  if (mm.handled) return;
  const a = answer(q);
  if (a.web && webAllowed()) return askWeb(a.searchQ || q, a, mm);
  if (a.ai && S.settings.aiOn && ai.available) return askAI(q, a, mm);
  reply(a, mm);
}

/* speech recognition (browser built-in, free) */
const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
let rec = null;
/* language the microphone listens in: the Settings choice, else the app language */
const micLang = () => S.settings.micLang || (PiyuI18n.LANGS[S.settings.lang] || PiyuI18n.LANGS.hi).sr;
let nativeListening = false;
async function listenNative(cb) {          // the phone's own recognizer: Android WebView has no browser speech API
  if (nativeListening) { PiyuNative.stopListening(); return; }
  if (!(await ensurePerm('mic'))) { toast(_t('बोलने के लिए Microphone की अनुमति चाहिए (Settings → अनुमतियाँ)')); return; }
  stopSpeaking(); wakePause(); nativeListening = true;
  $('#micBtn').classList.add('rec'); if (cb) $('#gMic').classList.add('rec'); $('#status').textContent = _t("सुन रही हूँ…");
  const end = () => { nativeListening = false; $('#micBtn').classList.remove('rec'); $('#gMic').classList.remove('rec'); $('#status').textContent = _t("तैयार"); wakeResume(); };
  await PiyuNative.listen(micLang(), {
    partial: t => { if (!cb) $('#q').value = t; },
    done: m => { end(); const t = (m[0] || '').trim(); if (!t) return toast(_t('सुन नहीं पाई — फिर से बोलिए')); if (cb) cb(t, m.slice(1)); else { $('#q').value = ''; ask(t); } },
    error: () => { end(); toast(_t('सुन नहीं पाई — फिर से बोलिए')); }
  });
}
function listen(cb) {
  if (typeof cb !== 'function') cb = null;
  if (isNativeApp()) { if (PiyuNative.speechAvail) return listenNative(cb); toast(_t('इस phone में speech service नहीं मिली — Google app अपडेट करें')); return; }
  if (!SR) { toast(_t("इस browser में voice input नहीं है — Chrome/Edge इस्तेमाल करें")); return; }
  if (rec) { rec.stop(); return; }
  stopSpeaking(); wakePause();
  rec = new SR(); rec.lang = micLang(); rec.interimResults = true; rec.maxAlternatives = 3;
  $('#micBtn').classList.add('rec'); if (cb) $('#gMic').classList.add('rec'); $('#status').textContent = _t("सुन रही हूँ…");
  let finalT = '', alts = [];
  rec.onresult = e => { let tmp = ''; alts = []; for (const r of e.results) { if (r.isFinal) { finalT += r[0].transcript; for (let i = 1; i < r.length; i++) alts.push(r[i].transcript); } else tmp += r[0].transcript; } if (!cb) $('#q').value = finalT || tmp; };
  rec.onerror = e => { if (e.error === 'not-allowed') toast(_t("Microphone की अनुमति दें")); };
  rec.onend = () => { $('#micBtn').classList.remove('rec'); $('#gMic').classList.remove('rec'); $('#status').textContent = _t("तैयार"); rec = null; wakeResume(); if (finalT.trim()) { if (cb) cb(finalT, alts); else { $('#q').value = ''; ask(finalT); } } };
  try { rec.start(); } catch (e) { rec = null; $('#micBtn').classList.remove('rec'); wakeResume(); }
}

/* ================= "HEY PIYU" WAKE WORD (hands-free) ================= */
/* Uses the browser's SpeechRecognition. Where Chrome supports on-device recognition (processLocally) it is used, otherwise
   Chrome's own speech service is used (audio leaves the device — shown honestly in Settings). */
const wake = { on: false, rec: null, paused: false, state: 'idle', cmdUntil: 0, errs: 0, handled: -1, alerted: new Set(), local: false, timer: null };
const STOP_WORDS = /(roko|ruko|रोको|रुको|stop|chup|चुप|bas|बस|band karo|बंद)/i;
function wakePing() { const a = audio(); if (a) { const t = a.currentTime + 0.02; bellNote(1174.7, t, 0.35, 0.1 * S.settings.vol); bellNote(1568, t + 0.1, 0.4, 0.08 * S.settings.vol); } }

/* voice commands that need no wake word: the guide and a ringing alarm are already "listening" contexts */
function voiceCommand(txt) {
  if (guide && guideCommand(txt)) return true;
  if (ringState && ringState.t) {
    const s = txt.toLowerCase();
    if (/(ho gaya|ho gya|हो गया|done|kar liya|कर लिया)/.test(s)) { markDone(ringState.t); return true; }
    if (/(snooze|baad me|बाद में|(?<!\d)5 ?min|पाँच मिनट|थोड़ी देर|thodi der)/.test(s)) { snooze(ringState.t, 5); return true; }
    if (STOP_WORDS.test(s)) { endRing(); return true; }
  }
  return false;
}
function runWakeCommand(cmd) {
  cmd = cmd.trim(); if (!cmd) return;
  if (voiceCommand(cmd)) return;
  if (!$('#tab-chat').classList.contains('active') && !guide && !ringState) goTab('chat');
  ask(cmd);
}
function wakeUI() {
  const on = wake.on;
  $('#status').textContent = isSpeaking() ? _t("बोल रही हूँ…") : (on && wake.rec ? _t("👂 सुन रही हूँ") : _t("तैयार"));
  const cb = $('#setWakeWord'); if (cb) cb.checked = on;
  const info = $('#wakeInfo'); if (info) info.textContent = !SR ? _t("⚠ इस browser में voice recognition नहीं है — Chrome / Edge इस्तेमाल करें।") : on ? (wake.local ? _t("🟢 चालू — आपकी आवाज़ इसी device पर पहचानी जा रही है (offline)।") : _t("🟠 चालू — Chrome की speech service इस्तेमाल हो रही है: आपकी आवाज़ Google के servers पर जाती है।")) : _t("बंद है।");
  render();
}
async function wakeEnable() {
  if (!SR) { toast(_t("इस browser में voice नहीं है — Chrome/Edge इस्तेमाल करें")); wakeUI(); return false; }
  wake.on = true; S.settings.wakeOn = true; save(); wake.errs = 0; wakeBoot(); return true;
}
function wakeDisable() {
  wake.on = false; S.settings.wakeOn = false; save(); clearTimeout(wake.timer);
  const r = wake.rec; wake.rec = null; if (r) { try { r.onend = null; r.abort(); } catch (e) { } }
  wakeUI();
}
function wakePause() { wake.paused = true; const r = wake.rec; wake.rec = null; if (r) { try { r.onend = null; r.abort(); } catch (e) { } } }
function wakeResume() { wake.paused = false; if (wake.on) { clearTimeout(wake.timer); wake.timer = setTimeout(wakeBoot, 400); } }
async function wakeBoot() {
  if (!wake.on || wake.rec || wake.paused || !SR) return;
  const r = new SR(), lang = (PiyuI18n.LANGS[S.settings.lang] || PiyuI18n.LANGS.hi).sr;
  r.lang = lang; r.continuous = true; r.interimResults = true; r.maxAlternatives = 3;
  wake.local = false;
  try { if (SR.available && (await SR.available({ langs: [lang], processLocally: true })) === 'available') { r.processLocally = true; wake.local = true; } } catch (e) { }
  wake.handled = -1; wake.alerted = new Set();
  r.onstart = () => { wake.errs = 0; wakeUI(); };
  r.onresult = onWakeResult;
  r.onerror = e => {
    const err = e && e.error;
    if (err === 'not-allowed' || err === 'service-not-allowed') { toast(_t("Microphone की अनुमति चाहिए — Hey Piyu बंद किया")); wakeDisable(); }
    else if (err === 'audio-capture') { toast(_t("Microphone नहीं मिला — Hey Piyu बंद किया")); wakeDisable(); }
    else if (err !== 'no-speech' && err !== 'aborted') wake.errs++;
  };
  r.onend = () => {
    if (wake.rec === r) wake.rec = null;
    wakeUI();
    if (wake.on && !wake.paused) { clearTimeout(wake.timer); wake.timer = setTimeout(wakeBoot, Math.min(30000, 300 * Math.pow(2, wake.errs))); }   // auto-restart, backing off after errors
  };
  try { r.start(); wake.rec = r; } catch (e) { wake.rec = null; wake.errs++; clearTimeout(wake.timer); wake.timer = setTimeout(wakeBoot, Math.min(30000, 500 * Math.pow(2, wake.errs))); }
}
function onWakeResult(e) {
  for (let i = e.resultIndex; i < e.results.length; i++) {
    const res = e.results[i];
    const alts = []; for (let k = 0; k < res.length; k++) alts.push((res[k].transcript || '').trim());
    const txt = alts[0] || '', speaking = isSpeaking();
    // 1) she asked "जी सर?" and is waiting for the actual command
    if (wake.state === 'cmd') {
      if (Date.now() > wake.cmdUntil) wake.state = 'idle';
      else if (!speaking && res.isFinal && i > wake.handled) { wake.handled = i; wake.state = 'idle'; runWakeCommand(txt); continue; }
      else continue;
    }
    // 2) contexts that listen without a wake word (guide open / alarm ringing) — never while she is talking herself
    if (!speaking && res.isFinal && i > wake.handled && (guide || ringState)) { if (voiceCommand(txt)) { wake.handled = i; continue; } }
    // 3) wake word
    const m = alts.map(x => C.wakeMatch(x)).find(x => x.hit);
    if (!m) continue;
    if (speaking) {   // barge-in: while she talks only "Hey Piyu, roko/stop" counts — her own "मैं पीयू हूँ" must not wake her
      if (i > wake.handled && STOP_WORDS.test(m.command)) { wake.handled = i; stopSpeaking(); }
      continue;
    }
    if (!wake.alerted.has(i)) { wake.alerted.add(i); wakePing(); $('#status').textContent = _t("👂 हाँ, बोलिए…"); }
    if (res.isFinal && i > wake.handled) {
      wake.handled = i;
      if (m.command) runWakeCommand(m.command);
      else { wake.state = 'cmd'; wake.cmdUntil = Date.now() + 12000; say(_t2("जी {0}?", [CALL()], "Yes, {0}?", [callEn()]), { mood: 'gentle' }); }
    }
  }
}

/* ================= documents ================= */
let ocrCtl = null;
async function addFiles(files) {
  const msg = $('#upMsg');
  for (const f of files) {
    if (f.size > PiyuMedia.MAX_UPLOAD) { msg.hidden = false; msg.className = 'msg err'; msg.textContent = '✖ ' + _t("{0} बहुत बड़ी है (अधिकतम 100 MB)", [f.name]); continue; }
    const ac = new AbortController(); ocrCtl = ac;
    try {
      msg.hidden = false; msg.className = 'msg'; msg.textContent = _t("⏳ {0} पढ़ रही हूँ…", [f.name]);
      let src = f;                                    // a big photo is shrunk first: OCR is faster and uses less memory, text stays readable
      if (S.settings.compress !== false && /^image\//.test(f.type) && f.size > 1024 * 1024) { try { const r = await PiyuMedia.optimizeImage(f); if (r.changed) src = r.blob; } catch (e) { } }
      const blocks = await C.fileToBlocks(src, {
        langs: S.settings.ocrLang, signal: ac.signal,
        onProgress: (st, fr, p, n) => {
          const pct = Math.round((fr || 0) * 100);
          msg.innerHTML = '';
          const t = document.createElement('div'); t.textContent = '🔍 ' + f.name + ' — OCR' + (n > 1 ? _t(" पन्ना {0}/{1}", [p, n]) : '') + ' · ' + (st === 'recognizing text' ? pct + '%' : _t("तैयारी…"));
          const bar = document.createElement('div'); bar.className = 'prog'; const i = document.createElement('i'); i.style.width = (n > 1 ? Math.round(100 * ((p - 1) + (st === 'recognizing text' ? fr : 0)) / n) : pct) + '%'; bar.appendChild(i);
          const c = document.createElement('button'); c.className = 'btn sm'; c.textContent = _t("✖ रद्द करें"); c.onclick = () => { ac.abort(); PiyuOCR.cancel(); };
          msg.append(t, bar, c);
        }
      });
      if (!blocks.length) throw new Error(_t("Document खाली है या पढ़ा नहीं जा सका।"));
      const { tasks, rules } = C.analyze(blocks, new Date(), { win: S.settings.autoFrom != null ? { from: S.settings.autoFrom, to: S.settings.autoTo } : null, delay: S.settings.autoDelayMin || 0 });
      const doc = { id: uid(), name: f.name, added: Date.now(), blocks: blocks.map(b => ({ k: b.k, t: b.t })), rules };
      if (blocks.ocrPages) { doc.ocr = { pages: blocks.ocrPages, conf: blocks.conf }; }
      S.docs = S.docs.filter(d => d.name !== f.name || (S.tasks = S.tasks.filter(t => t.docId !== d.id), false));
      S.docs.push(doc);
      const ids = tasks.map(() => uid());
      tasks.forEach((t, i) => {
        const dep = t.dep; delete t.dep;
        const sub = C.makeSubtasks(t.text);
        S.tasks.push(Object.assign({ id: ids[i], docId: doc.id, done: false, pre: false, fired: false, missed: false }, t, sub.length ? { subtasks: sub } : {}, t.repeat ? { repBase: t.alarmAt } : {}, dep != null ? { dependsOn: [ids[dep]] } : {}));
      });
      // tasks whose exact time already passed: mark missed so they do not all ring at once
      S.tasks.forEach(t => { if (!t.done && t.alarmAt < Date.now() - ALERT) { t.fired = true; t.missed = true; } });
      save(); render();
      const low = blocks.ocrPages && blocks.conf < 60;
      msg.className = low ? 'msg err' : 'msg';
      msg.textContent = _t("✔ {0}: {1} काम, {2} नियम मिले।{3}{4}{5} सबके alarm लग गए हैं।", [f.name, tasks.length, rules.length, (blocks.ocrPages ? _t(" (OCR: {0} पन्ना, भरोसा {1}%)", [blocks.ocrPages, blocks.conf]) : ''), (low ? _t(" ⚠ पढ़ाई साफ़ नहीं है — काम जाँच लें, या सीधी, रोशन और साफ़ photo दोबारा लें।") : ''), (blocks.truncated ? _t(" ⚠ सिर्फ़ शुरू के 60 पन्ने पढ़े गए।") : '')]);
      const first = tasks.filter(t => t.alarmAt > Date.now()).sort((a, b) => a.alarmAt - b.alarmAt)[0];
      say(_t2("{0}, मैंने {1} पढ़ लिया। इसमें {2} काम मिले। सबसे पहला काम {3}। हर काम से {4} मिनट पहले मैं आपको बता दूँगी।", [CALL(), f.name, tasks.length, (first ? _t("{0} बजे है: {1}", [hm(first.alarmAt), first.title]) : _t("पूरा हो चुका है")), S.settings.preMin], "{0}, I read {1}. I found {2} tasks. {3}. I will remind you {4} minutes before each one.", [callEn(), f.name, tasks.length, (first ? 'The first one is at ' + hm(first.alarmAt) + ': ' + first.title : ''), S.settings.preMin]));
    } catch (e) {
      msg.hidden = false; msg.className = 'msg err'; msg.textContent = '✖ ' + f.name + ': ' + e.message;
    }
    ocrCtl = null;
  }
}

/* ================= calendar export (rings even when app is closed) ================= */
function ics() {
  const z = ts => { const d = new Date(ts); return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00Z'; };
  const fold = s => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
  const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
  const rrule = t => {
    const r = t.repeat; if (!r) return [];
    const n = r.every || 1; let s;
    if (r.type === 'hours') s = 'FREQ=HOURLY;INTERVAL=' + n;
    else if (r.type === 'daily') s = 'FREQ=DAILY;INTERVAL=' + n;
    else if (r.type === 'monthly') s = 'FREQ=MONTHLY;INTERVAL=' + n + ';BYMONTHDAY=' + new Date(t.repBase || t.alarmAt).getDate();
    else s = 'FREQ=WEEKLY;INTERVAL=' + n + ';BYDAY=' + ((r.days && r.days.length ? r.days : [new Date(t.alarmAt).getDay()]).map(d => BYDAY[d]).join(','));
    if (r.until) s += ';UNTIL=' + z(r.until);
    return ['RRULE:' + s];
  };
  const ev = activeTasks().filter(t => t.alarmAt > Date.now()).map(t => [
    'BEGIN:VEVENT', 'UID:' + (t.seriesId || t.id) + '@piyu', 'DTSTAMP:' + z(Date.now()), 'DTSTART:' + z(t.alarmAt), 'DTEND:' + z(t.alarmAt + 15 * 60000)].concat(rrule(t)).concat([
    'SUMMARY:' + fold(t.title), 'DESCRIPTION:' + fold(t.text.slice(0, 500)),
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + fold(S.settings.preMin + ' min: ' + t.title), 'TRIGGER:-PT' + S.settings.preMin + 'M', 'END:VALARM',
    'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:' + fold(t.title), 'TRIGGER:PT0M', 'END:VALARM', 'END:VEVENT']).join('\r\n'));
  if (!ev.length) { toast(_t("Calendar में डालने के लिए कोई आने वाला काम नहीं")); return; }
  const body = 'BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Piyu//EN\r\n' + ev.join('\r\n') + '\r\nEND:VCALENDAR';
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' })); a.download = 'piyu-alarms.ics'; a.click();
  toast(_t("{0} काम calendar file में — इसे phone/Google Calendar में खोलें", [ev.length]));
}

/* ================= wake lock ================= */
let wl = null;
async function keepAwake() {
  try { if (S.settings.wake && 'wakeLock' in navigator && !wl) { wl = await navigator.wakeLock.request('screen'); wl.onrelease = () => wl = null; } } catch (e) { }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) { keepAwake(); tick(); syncNow(); } });

/* ================= edit dialog ================= */
let editing = null;
function openEdit(t) {
  editing = t;
  $('#editHead').textContent = t ? _t("काम बदलें") : _t("नया काम");
  $('#eTitle').value = t ? t.title : '';
  $('#eWhen').value = toLocalInput(t ? t.alarmAt : Date.now() + 30 * 60000);
  const r = t && t.repeat;
  $('#ePri').value = String((t && t.priority) || 3);
  const cands = S.tasks.filter(x => !x.done && (!t || (x.id !== t.id && !C.wouldCycle(t.id, x.id, S.tasks))));
  $('#eDep').innerHTML = _t("<option value=\"\">कोई नहीं</option>{0}", [cands.map(x => `<option value="${x.id}">${esc(x.title.slice(0, 60))}</option>`).join('')]);
  $('#eDep').value = (t && t.dependsOn && t.dependsOn[0]) || '';
  $('#eRep').value = !r ? '' : r.type === 'weekly' ? (r.days && r.days.join() === '1,2,3,4,5' && (r.every || 1) === 1 ? 'weekdays' : 'weekly') : r.type;
  $('#eEvery').value = (r && r.every) || 1;
  $$('#eDays input').forEach(c => c.checked = !!(r && r.days && r.days.includes(+c.value)));
  $('#eUntil').value = r && r.until ? toLocalInput(r.until).slice(0, 10) : '';
  repUI();
  $('#editDlg').showModal();
}
const UNIT = { daily: 'दिन', hours: 'घंटे', weekly: 'हफ्ते', monthly: 'महीने' };
function repUI() {
  const v = $('#eRep').value;
  $('#eRepBox').hidden = !v;
  $('#eEveryWrap').hidden = !v || v === 'weekdays';
  $('#eDays').hidden = v !== 'weekly';
  $('#eUnit').textContent = _t(UNIT[v] || '');
}
$('#eRep').onchange = repUI;
function readRepeat(atTs) {
  const v = $('#eRep').value; if (!v) return null;
  const every = Math.min(365, Math.max(1, +$('#eEvery').value || 1));
  let rep;
  if (v === 'weekdays') rep = { type: 'weekly', every: 1, days: [1, 2, 3, 4, 5] };
  else if (v === 'weekly') { const days = $$('#eDays input:checked').map(c => +c.value).sort(); rep = { type: 'weekly', every, days: days.length ? days : null }; }
  else rep = { type: v, every };
  const u = $('#eUntil').value; if (u) { const d = new Date(u + 'T23:59:59'); if (!isNaN(d)) rep.until = d.getTime(); }
  return rep;
}
/* if the chosen weekday is not one of the repeat days, move the first alarm to the next allowed day */
function alignFirst(at, rep) {
  if (!rep || rep.type !== 'weekly' || !rep.days || rep.days.includes(new Date(at).getDay())) return at;
  const d = new Date(at); for (let i = 0; i < 7 && !rep.days.includes(d.getDay()); i++) d.setDate(d.getDate() + 1);
  return d.getTime();
}

/* ================= events ================= */
function taskOf(el) { const r = el.closest('[data-id]'); return r && S.tasks.find(t => t.id === r.dataset.id); }

document.addEventListener('click', e => {
  const g = e.target.closest('[data-goto]'); if (g) return goTab(g.dataset.goto);
  if (e.target.closest('[data-close]')) { e.target.closest('dialog').close(); stopSpeaking(); return; }
  const b = e.target.closest('[data-act]'); if (!b) return;
  const act = b.dataset.act, t = taskOf(b);
  if (act === 'toggle' && t) { t.done ? undoDone(t) : markDone(t); }
  else if (act === 'how' && t) openHow(t);
  else if (act === 'guide' && t) startGuide(t);
  else if (act === 'brief') speakBrief(b.dataset.kind);
  else if (act === 'wake') { wake.on ? wakeDisable() : wakeEnable(); }
  else if (act === 'focuson') $('#focusDlg').showModal();
  else if (act === 'focusoff') endFocus(false);
  else if (act === 'edit' && t) openEdit(t);
  else if (act === 'del' && t) { if (confirm(_t("यह काम हटाएँ?"))) delTask(t); }
  else if (act === 'deldoc') {
    const d = S.docs.find(x => x.id === b.closest('[data-doc]').dataset.doc);
    if (d) deleteDocs([d]);
  } else if (act === 'delalldocs') deleteDocs(S.docs.slice());
  else if (act === 'speakrules') say(S.docs.flatMap(d => d.rules || []).join('. '));
});

function goTab(n) {
  $$('.tab').forEach(x => x.classList.toggle('active', x.id === 'tab-' + n));
  $$('nav button').forEach(x => x.classList.toggle('on', x.dataset.tab === n)); if (typeof goldPlace === 'function') goldPlace();
  window.scrollTo(0, 0);
  if (n === 'prog') renderProg();
  if (window.PiyuStudent) PiyuStudent.onTab(n);
  if (n === 'chat') { const nb = $('nav [data-tab=chat]'); if (nb) nb.classList.remove('dot'); }
}
$('nav').addEventListener('click', e => { const b = e.target.closest('button[data-tab]'); if (b) goTab(b.dataset.tab); });
/* the golden line under the active tab slides to it (and follows on resize / language change) */
function goldPlace() {
  const nav = $('nav'); if (!nav) return; let g = nav.querySelector('.goldbar'); if (!g) { g = document.createElement('span'); g.className = 'goldbar'; nav.prepend(g); }
  const on = nav.querySelector('button.on'); if (!on) return;
  const w = Math.max(24, on.offsetWidth * 0.46); g.style.width = w + 'px'; g.style.transform = 'translateX(' + (on.offsetLeft + (on.offsetWidth - w) / 2) + 'px)';
}
window.addEventListener('resize', goldPlace); window.addEventListener('load', () => setTimeout(goldPlace, 50)); setTimeout(goldPlace, 300);

$('#file').onchange = e => { addFiles([...e.target.files]); e.target.value = ''; };
$('#camFile').onchange = e => {
  const fs = [...e.target.files].map(f => { const d = new Date(); return new File([f], 'photo-' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' + pad(d.getHours()) + pad(d.getMinutes()) + '.jpg', { type: f.type || 'image/jpeg' }); });
  addFiles(fs); e.target.value = '';
};
const drop = $('#drop');
['dragenter', 'dragover'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.add('over'); }));
['dragleave', 'drop'].forEach(ev => drop.addEventListener(ev, e => { e.preventDefault(); drop.classList.remove('over'); }));
drop.addEventListener('drop', e => addFiles([...e.dataTransfer.files]));
window.addEventListener('dragover', e => e.preventDefault()); window.addEventListener('drop', e => e.preventDefault());

$('#chatForm').onsubmit = e => { e.preventDefault(); const v = $('#q').value; $('#q').value = ''; ask(v); };
$('#micBtn').onclick = () => listen();      // (passing the click event as `cb` made every spoken sentence throw and get lost)
$('#addTaskBtn').onclick = () => openEdit(null);
$('#icsBtn').onclick = ics;
$$('#focusDlg [data-min]').forEach(b => b.onclick = () => { $('#focusDlg').close(); startFocus(+b.dataset.min); });
$('#focusGo').onclick = () => { const v = +$('#focusMin').value; $('#focusDlg').close(); startFocus(v || 25); };
$('#sortSel').onchange = e => { S.settings.sort = e.target.value; save(); render(); };
$('#editForm').onsubmit = () => {
  const title = $('#eTitle').value.trim(), at = new Date($('#eWhen').value).getTime();
  if (!title || isNaN(at)) return;
  const rep = readRepeat(at), when = alignFirst(at, rep);
  if (editing) {
    Object.assign(editing, { title, alarmAt: when, fired: false, pre: false, missed: false, auto: false, guessed: false, priority: +$('#ePri').value || 3 });
    if ($('#eDep').value) editing.dependsOn = [$('#eDep').value]; else delete editing.dependsOn;
    if (rep) { editing.repeat = rep; editing.repBase = when; } else { delete editing.repeat; delete editing.repBase; }
  } else {
    const t = { id: uid(), docId: null, title, text: title, section: '', alarmAt: when, done: false, pre: false, fired: false, missed: false, manual: true, priority: +$('#ePri').value || 3 };
    if ($('#eDep').value) t.dependsOn = [$('#eDep').value];
    if (rep) { t.repeat = rep; t.repBase = when; }
    S.tasks.push(t);
  }
  save(); render(); toast(_t("Alarm लग गया: {0}{1}", [full(when), (rep ? ' · 🔁 ' + C.repeatLabel(rep, S.settings.lang) : '')]));
};
$('#howSpeak').onclick = () => howTask && say(howSpeakText);
$('#howStop').onclick = stopSpeaking;
$('#howDlg').addEventListener('close', stopSpeaking);

$('#rDone').onclick = () => ringState && markDone(ringState.t);
$('#rHow').onclick = () => { const t = ringState && ringState.t; if (!t) return; ringState.silent = true; stopSpeaking(); openHow(t); };
$('#rSnooze').onclick = () => ringState && snooze(ringState.t, 5);
$('#rStop').onclick = () => { if (ringState) { ringState.stop = true; } endRing(); };

/* settings */

/* ---- Settings: voice library ---- */
const G_ICON = { female: '♀', male: '♂' };
function applyPersona(id) {
  const p = VK.PERSONAS.find(x => x.id === id); if (!p) return;
  Object.assign(S.settings, { persona: id, pvHi: p.hi, pvEn: p.en, style: p.style, pitchSt: p.st }); save(); voiceUI();
}
function voiceUI() {
  const s = S.settings, grid = $('#personaGrid'); if (!grid) return;
  const has = id => !voiceLib.length || voiceLib.some(v => v.id === id);
  grid.innerHTML = VK.PERSONAS.filter(p => has(p.hi) && has(p.en)).map(p => {
    const g = (voiceById(p.hi) || {}).gender || (p.hi === 'hi-priyamvada' ? 'female' : 'male');
    return `<button class="persona ${s.persona === p.id ? 'on' : ''}" data-persona="${p.id}"><b>${G_ICON[g]} ${esc(p.name)}</b><small>${esc(_t(p.tag))}</small></button>`;
  }).join('');
  const opt = (lang, cur) => voiceLib.filter(v => v.lang === lang).map(v => `<option value="${esc(v.id)}" ${v.id === cur ? 'selected' : ''}>${G_ICON[v.gender] || ''} ${esc(_t(v.name))} — ${esc(_t(v.desc))}</option>`).join('') || '<option value="">—</option>';
  $('#setPvHi').innerHTML = opt('hi', s.pvHi); $('#setPvEn').innerHTML = opt('en', s.pvEn);
  $('#setStyle').innerHTML = Object.entries(VK.STYLES).map(([k, v]) => `<option value="${k}" ${k === s.style ? 'selected' : ''}>${esc(_t(v.name))} — ${esc(_t(v.desc))}</option>`).join('');
  $('#setPitchSt').value = s.pitchSt; $('#oPitchSt').textContent = (+s.pitchSt > 0 ? '+' : '') + s.pitchSt;
  $('#setHinglish').checked = s.hinglish !== false;
  /* voice engine: the phone's Google voice (Indian) is the most natural; Piyu's own (Piper) works everywhere */
  const native = isNativeApp() && PiyuNative.ttsAvail;
  $('#engineRow').hidden = !native;
  if (native) {
    $('#setEngine').value = s.engine || 'auto';
    const L = speechLang(), seen = new Set(), vs = ((phoneTts && phoneTts[L] && phoneTts[L].voices) || []).filter(v => /_(IN|PK|BD)$/i.test(v.locale) && !/-language$/.test(v.name)).sort((a, b) => (a.network ? 1 : 0) - (b.network ? 1 : 0) || a.name.localeCompare(b.name)).filter(v => { const k = v.name.replace(/-(local|network)$/, ''); if (seen.has(k)) return false; seen.add(k); return true; });
    $('#setPhoneVoice').innerHTML = `<option value="">${esc(_t('अपने-आप (सबसे अच्छी)'))}</option>` + vs.map((v, i) => `<option value="${esc(v.name)}" ${((s.phv || {})[L]) === v.name ? 'selected' : ''}>${esc(_t('आवाज़'))} ${i + 1} · ${esc(v.locale)}${v.network ? ' · online' : ''}</option>`).join('');
    const ok = !!(phoneTts && phoneTts[L] && phoneTts[L].ok);
    $('#phoneVoiceHint').textContent = ok ? '✅ ' + _t('Phone की भारतीय आवाज़ चालू है') : '⚠ ' + _t('Phone में इस भाषा की आवाज़ नहीं है — नीचे बटन से Google की आवाज़ install करें');
    $('#phoneVoiceInstall').hidden = ok;
  }
  $('#voiceLibHint').textContent = voiceLib.length ? (_t("{0} आवाज़ें उपलब्ध · {1}", [voiceLib.length, (voiceGender() === 'male' ? _t("पुरुष आवाज़ चुनी है, इसलिए Piyu पुल्लिंग में बोलेगी (\"बताऊँगा\")।") : _t("महिला आवाज़ चुनी है (\"बताऊँगी\")।"))])) : _t("आवाज़ें ./run.sh (server) चलाने पर मिलती हैं।");
}
function bindVoiceLib() {
  const s = S.settings;
  $('#personaGrid').onclick = e => { const b = e.target.closest('[data-persona]'); if (b) { applyPersona(b.dataset.persona); say(_t(SAMPLE.hi)); } };
  $('#setPvHi').onchange = e => { s.pvHi = e.target.value; s.persona = ''; save(); voiceUI(); say(_t(SAMPLE.hi)); };
  $('#setPvEn').onchange = e => { s.pvEn = e.target.value; s.persona = ''; save(); voiceUI(); say(SAMPLE.en); };
  $('#setEngine').onchange = e => { s.engine = e.target.value; save(); voiceUI(); say(_t(SAMPLE.hi)); };
  $('#setPhoneVoice').onchange = e => { const L = speechLang(); s.phv = Object.assign({}, s.phv || {}, { [L]: e.target.value }); save(); say(_t(SAMPLE.hi)); };
  $('#phoneVoiceInstall').onclick = () => PiyuNative.ttsOpenSettings();
  $('#setStyle').onchange = e => { s.style = e.target.value; s.persona = ''; save(); voiceUI(); say(_t(SAMPLE.hi)); };
  $('#setPitchSt').oninput = e => { s.pitchSt = +e.target.value; $('#oPitchSt').textContent = (s.pitchSt > 0 ? '+' : '') + s.pitchSt; };
  $('#setPitchSt').onchange = () => { save(); say(_t(SAMPLE.hi)); };
  $('#setHinglish').onchange = e => { s.hinglish = e.target.checked; save(); };
  $('#voiceCheck').onclick = voiceDiag;
  $('#tryHi').onclick = () => tryVoice('hi'); $('#tryHg').onclick = () => tryVoice('hg'); $('#tryEn').onclick = () => tryVoice('en');
}
const SAMPLE = { hi: 'नमस्ते, मैं पीयू हूँ। मैं आपको हर काम याद दिलाऊँगी। आज आपके तीन काम हैं।', hg: 'abhi kya karna hai? Razorpay webhook add karo aur payment test karo, phir mujhe batana.', en: 'Hello, I am Piyu. You have three tasks today, and I will remind you before each one.' };

function bindSettings() {
  const s = S.settings;
  $('#setLang').value = s.lang; $('#setRate').value = s.rate; $('#setPitch').value = s.pitch; $('#setVol').value = s.vol; $('#setPre').value = s.preMin; $('#setCall').value = s.call; $('#setWake').checked = s.wake;
  const out = () => { $('#oRate').textContent = (+s.rate).toFixed(2); $('#oPitch').textContent = (+s.pitch).toFixed(2); $('#oVol').textContent = Math.round(s.vol * 100) + '%'; };
  out();
  $('#setCompress').checked = s.compress !== false; $('#setCompress').onchange = e => { s.compress = e.target.checked; save(); };
  $('#setMic').value = s.micLang || ''; $('#setMic').onchange = e => { s.micLang = e.target.value; save(); };
  $('#setLang').onchange = e => changeLang(e.target.value);
  $('#setVoiceHi').onchange = e => { s.voiceHi = e.target.value; save(); fillVoiceSelects(); };
  $('#setVoiceEn').onchange = e => { s.voiceEn = e.target.value; save(); fillVoiceSelects(); };
  $('#setRate').oninput = e => { s.rate = +e.target.value; out(); save(); };
  $('#setPitch').oninput = e => { s.pitch = +e.target.value; out(); save(); };
  $('#setVol').oninput = e => { s.vol = +e.target.value; out(); save(); };
  $('#setPre').onchange = e => { s.preMin = Math.min(60, Math.max(1, +e.target.value || 10)); save(); render(); };
  $('#setCall').onchange = e => { s.call = e.target.value.trim() || _t("सर"); save(); render(); };
  $('#setWake').onchange = e => { s.wake = e.target.checked; save(); if (s.wake) keepAwake(); else if (wl) { wl.release(); wl = null; } };
  $('#testVoice').onclick = () => say(_t2("नमस्ते {0}, मैं पीयू हूँ। आपकी पर्सनल असिस्टेंट। मैं आपको हर काम समय से पहले याद दिलाऊँगी, और पूछने पर बताऊँगी कि उसे कैसे करना है।", [CALL()], "Hello {0}, I am Piyu, your personal assistant. I will remind you of every task ahead of time, and explain how to do it whenever you ask.", [callEn()]));
  $('#setBrief').checked = s.briefOn; $('#setBM').value = s.briefMorning; $('#setBN').value = s.briefNight;
  $('#setBrief').onchange = e => { s.briefOn = e.target.checked; save(); };
  $('#setBM').onchange = e => { if (e.target.value) { s.briefMorning = e.target.value; save(); } };
  $('#setBN').onchange = e => { if (e.target.value) { s.briefNight = e.target.value; save(); } };
  $('#setQ').checked = s.quietOn; $('#setQF').value = s.quietFrom; $('#setQT').value = s.quietTo; $('#setQH').checked = s.quietHard;
  $('#setQ').onchange = e => { s.quietOn = e.target.checked; save(); render(); };
  $('#setQF').onchange = e => { if (e.target.value) { s.quietFrom = e.target.value; save(); render(); } };
  $('#setQT').onchange = e => { if (e.target.value) { s.quietTo = e.target.value; save(); render(); } };
  $('#setQH').onchange = e => { s.quietHard = e.target.checked; save(); };
  const MT = { calm: [_t("शांत"), 'Calm voice sample.'], urgent: [_t("तेज़"), 'Urgent voice sample.'], gentle: [_t("मुलायम"), 'Gentle voice sample.'] };
  Object.keys(MT).forEach(m => $('#mood_' + m).onclick = () => say(T(_t("{0}, यह {1} अंदाज़ की आवाज़ है। ऐसे मैं आपसे बात करूँगी।", [CALL(), MT[m][0]]), MT[m][1]), { mood: m }));
  $('#setWakeWord').checked = !!s.wakeOn; $('#setWakeWord').onchange = e => { e.target.checked ? wakeEnable() : wakeDisable(); };
  $('#setWeb').onchange = e => { s.webOn = e.target.checked; save(); webUI(); };
  $('#setMindOn').checked = S.mind.on; $('#setMindOn').onchange = e => { S.mind.on = e.target.checked; touchMind(); save(); };
  $('#setMindRoman').checked = s.mindRoman !== false; $('#setMindRoman').onchange = e => { s.mindRoman = e.target.checked; save(); };
  $('#setMindEmp').checked = s.mindEmpathy !== false; $('#setMindEmp').onchange = e => { s.mindEmpathy = e.target.checked; save(); };
  $('#setMindAsk').checked = s.mindAsk !== false; $('#setMindAsk').onchange = e => { s.mindAsk = e.target.checked; save(); };
  $('#openMem').onclick = openMem;
  $('#setAi').onchange = e => { s.aiOn = e.target.checked; save(); aiUI(); if (s.aiOn) refreshAI(); };
  $('#setAiModel').onchange = e => { s.aiModel = e.target.value; save(); refreshAI(); };
  $('#setOcr').value = s.ocrLang; $('#setOcr').onchange = e => { s.ocrLang = e.target.value; save(); };
  $('#testBM').onclick = () => speakBrief('morning'); $('#testBN').onclick = () => speakBrief('night');
  $('#notifBtn').onclick = async () => {
    if (!('Notification' in window)) return toast(_t("इस browser में notification नहीं है"));
    const p = await Notification.requestPermission(); toast(p === 'granted' ? _t("🔔 Notification चालू") : _t("Notification बंद है — browser settings में अनुमति दें"));
  };
  $('#testAlarm').onclick = () => { const t = { id: 'test', title: _t2("यह Piyu का test alarm है", [], "This is a Piyu test alarm", []), text: '', alarmAt: Date.now() }; if (!ringState) startRing(t, '🔔 Test'); };
  $('#resetBtn').onclick = () => {
    if (!confirm(_t("सारे documents और काम मिट जाएँगे (backup पहले ले लें)। पक्का?"))) return;
    S.docs = []; S.tasks = []; save(); render(); syncNow(); toast(_t("सब मिटा दिया"));
  };
  $('#setToken').value = s.token || '';
  $('#setToken').onchange = e => { s.token = e.target.value.trim(); save(); syncNow(true); detectNeural(); refreshAI(); refreshWeb(); };
  /* Android app only: server address + real phone-alarm permission */
  if (window.PiyuNative && PiyuNative.isNative) {
    document.querySelectorAll('.nativeOnly').forEach(x => x.hidden = false);
    $('#setServer').value = s.serverUrl || window.PIYU_DEFAULT_SERVER || '';
    $('#setServer').onchange = e => { s.serverUrl = e.target.value.trim(); save(); syncNow(true); detectNeural(); refreshAI(); refreshWeb(); };
    permInfo = async () => { const p = await PiyuNative.permission(); $('#nativeInfo').textContent = p === 'granted' ? _t("✅ फ़ोन अलार्म चालू — app बंद होने पर भी बजेंगे") : _t("⚠ अनुमति नहीं है — अलार्म बंद app में नहीं बजेंगे"); };
    $('#alarmTest').onclick = async () => { const ok = await PiyuNative.testAlarm(8); toast(ok ? _t('8 सेकंड में test alarm बजेगा — app को minimise कर दीजिए') : _t('यह सुविधा इस app-version में नहीं है — app update करें')); };
    $('#nativePerm').onclick = async () => { await PiyuNative.requestPermissions(); await permInfo(); nativeNow(); };
    permInfo(); $('#permCard').hidden = false; renderPerms();
    const bgInfo = async () => { const st = await PiyuNative.bgStatus(); $('#bgInfo').textContent = !st ? '' : (st.wanted ? '✅ ' + _t('background में चालू') : '⚠ ' + _t('background बंद')) + ' · ' + (st.batteryExempt ? '🔋 ' + _t('बैटरी: बिना रोक') : '⚠ ' + _t('बैटरी: सीमित (alarm देर से बज सकते हैं)')); };
    $('#bgBattery').onclick = async () => { await PiyuNative.requestBattery(); setTimeout(bgInfo, 1500); };
    $('#logoutBtn').onclick = async () => {
      if (!confirm(_t('Logout करने पर Piyu background में बंद हो जाएगी और फ़ोन के alarm हट जाएँगे। पक्का?'))) return;
      await PiyuNative.bgStop(); await PiyuNative.cancelAll();
      s.loggedIn = false; s.pinHash = ''; await Store.save(S); (window.reloadApp || (() => location.reload()))();
    };
    bgInfo();
    $('#updCheck').onclick = () => { $('#updInfo').textContent = _t("जाँच रही हूँ…"); checkAppUpdate(true); };
    checkAppUpdate(true);
  }
  $('#syncBtn').onclick = () => { toast(_t("Sync हो रहा है…")); syncNow(true).then(() => toast(_t(syncInfo.msg))); };
  $('#expBtn').onclick = async () => {
    await pullBlobs();
    const data = await Store.exportAll(S);
    const a = document.createElement('a'); const d = new Date();
    a.href = URL.createObjectURL(new Blob([JSON.stringify(data)], { type: 'application/json' }));
    a.download = 'piyu-backup-' + d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) + '.json'; a.click();
    toast(_t("Backup file download हो गई"));
  };
  $('#impFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      if (data.piyu !== 1 || !data.state) throw new Error(_t("यह Piyu की backup file नहीं है"));
      const replace = confirm(_t("पुराने data की जगह backup रखें?\n\nOK = Replace (सिर्फ backup का data)\nCancel = Merge (दोनों मिला दें)"));
      const R = data.state, now = Date.now();
      await Store.importBlobs(data.blobs);
      if (replace) {
        S.docs = R.docs || []; S.tasks = R.tasks || [];
        S.docs.concat(S.tasks).forEach(x => x.updatedAt = now);
        const ids = new Set(S.docs.concat(S.tasks).map(x => x.id));
        S.tombstones = (S.tombstones || []).filter(t => !ids.has(t.id));
        if (R.settings) { const keep = Object.fromEntries(Store.DEVICE_KEYS.map(k => [k, S.settings[k]])); Object.assign(S.settings, DEF.settings, R.settings, keep); }
      } else {
        const ids = new Set((R.docs || []).concat(R.tasks || []).map(x => x.id));
        S.tombstones = (S.tombstones || []).filter(t => !ids.has(t.id));
        Store.mergeState(S, Object.assign({}, R, { tombstones: [], settingsAt: 0 }));
      }
      snapshot(); stamp(); save(); render(); syncNow();
      toast(_t("Backup वापस आ गया: {0} documents, {1} काम", [S.docs.length, S.tasks.length]));
    } catch (err) { toast(_t("Backup नहीं खुला: {0}", [err.message])); }
  };
}

/* the UI language changed: redraw everything that was built from strings */
/* the language of the whole app: chosen on the start screen, from the 🌐 button, or in Settings; also picked from the phone's language on a brand-new install */
const LANG_LIST = [['hi', 'हिन्दी'], ['en', 'English'], ['bn', 'বাংলা'], ['mr', 'मराठी'], ['ur', 'اردو']];
async function changeLang(l) {
  const s = S.settings; if (!LANG_LIST.some(x => x[0] === l)) return; s.lang = l; s.langSet = true;
  if (/^(eng|hin|ben|mar|urd)/.test(s.ocrLang || 'eng+hin')) { s.ocrLang = { bn: 'ben+eng', mr: 'mar+eng+hin', ur: 'urd+eng' }[l] || 'eng+hin'; const o = $('#setOcr'); if (o) o.value = s.ocrLang; }   // photo-to-text reads the script of the chosen language
  save(); await PiyuI18n.setLang(l); PiyuI18n.applyDom(); relang(); langChips();
  const d = $('#langDlg'); if (d && d.open) d.close();
}
function langChips() { $$('.langChips').forEach(box => { box.innerHTML = LANG_LIST.map(([k, n]) => `<button type="button" class="lc ${S.settings.lang === k ? 'on' : ''}" data-l="${k}" lang="${k}">${n}</button>`).join(''); }); const sl = $('#setLang'); if (sl) sl.value = S.settings.lang; }
document.addEventListener('click', e => { const b = e.target.closest('.langChips [data-l]'); if (b) changeLang(b.dataset.l); if (e.target.closest('#langBtn')) { langChips(); try { $('#langDlg').showModal(); } catch (er) { } } });
function detectLang() {
  const s = S.settings; if (window.__PIYU_NO_DETECT || s.langSet || S.tasks.length || S.docs.length || s.loggedIn || s.mode || s.sname || s.token) return;     // only a brand-new install: nobody's existing choice is ever changed
  const nl = (navigator.languages && navigator.languages[0] || navigator.language || 'hi').toLowerCase().slice(0, 2), m = { en: 'en', hi: 'hi', bn: 'bn', mr: 'mr', ur: 'ur' }[nl];
  if (m && m !== s.lang) { s.lang = m; s.langSet = true; if (m !== 'hi') s.ocrLang = { en: 'eng+hin', bn: 'ben+eng', mr: 'mar+eng+hin', ur: 'urd+eng' }[m] || s.ocrLang; }
}
function relang() {
  try { if (window.PiyuStudent) PiyuStudent.rerender(); } catch (e) { }
  try { renderChips(); render(); voiceUI(); fillVoiceSelects(); showSync(); aiUI(); webUI(); refreshAI(); refreshWeb(); wakeUI(); } catch (e) { console.warn('relang', e); }
  if (typeof nativeNow === 'function') nativeNow();
}
/* quick chips */
const CHIPS = ['अभी क्या करना है?', 'मेरे बारे में क्या याद है?', 'और बताओ', 'आज का काम', 'सारे alarm दिखाओ', 'नियम बताओ', 'कल का काम'];
const renderChips = () => { $('#chips').innerHTML = CHIPS.map(c => `<button type="button" data-q="${esc(c)}">${_t(c)}</button>`).join(''); };
renderChips();
$('#chips').onclick = e => { if (e.target.tagName === 'BUTTON') ask(e.target.dataset.q || e.target.textContent); };

/* ================= boot ================= */
/* ---------- permissions (Android app): mic, speaker/volume, notifications, exact alarms, battery, camera ---------- */
let permCache = {};
const PERM_ROWS = [
  { k: 'mic', icon: '🎤', name: 'Microphone', why: 'बोलकर Piyu से बात करने के लिए', ok: p => p.mic === 'granted', need: true },
  { k: 'volume', icon: '🔊', name: 'Speaker / आवाज़', why: 'Piyu की आवाज़ सुनने के लिए (phone का media volume चालू होना चाहिए)', ok: p => !(p.volume === 0), btn: 'आवाज़ बढ़ाएँ', note: p => p.volumeMax ? ' · volume ' + p.volume + '/' + p.volumeMax : '' },
  { k: 'notif', icon: '🔔', name: 'Notifications', why: 'alarm और याद दिलाने के लिए', ok: p => p.notif === undefined || p.notif === 'granted', need: true },
  { k: 'exact', icon: '⏰', name: 'सटीक Alarm', why: 'ठीक समय पर alarm बजाने के लिए', ok: p => p.exact === undefined || p.exact === 'granted', need: true },
  { k: 'lock', icon: '📱', name: 'Lock screen पर alarm', why: 'phone lock हो तब भी alarm का पूरा screen खुले', ok: p => p.fullScreen === undefined || !!p.fullScreen, need: true },
  { k: 'battery', icon: '🔋', name: 'Battery: बिना रोक', why: 'phone सोने पर भी Piyu चलती रहे', ok: p => p.batteryExempt === undefined || !!p.batteryExempt, need: true },
  { k: 'camera', icon: '📷', name: 'Camera', why: 'photo खींचकर काम से जोड़ने के लिए', ok: p => p.camera === 'granted' }
];
async function refreshPerms() { try { permCache = await PiyuNative.perms(); } catch (e) { } return permCache; }
async function askPerm(k) {
  const before = permCache; const p = await PiyuNative.ask(k); permCache = p;
  const row = PERM_ROWS.find(r => r.k === k);
  if (row && !row.ok(p) && (k === 'mic' || k === 'camera') && before && before[k] === 'denied') { toast(_t('अनुमति बंद है — phone की Settings खुल रही है, वहाँ Permissions में चालू कीजिए')); PiyuNative.openSettings(); }
  return p;
}
async function ensurePerm(k) {            // used by features: asks only if it is missing
  const p = await refreshPerms(); const row = PERM_ROWS.find(r => r.k === k);
  if (!row || row.ok(p)) return true;
  await askPerm(k); return row.ok(permCache);
}
async function renderPerms() {
  const box = $('#permList'); if (!box) return;
  const p = await refreshPerms();
  box.innerHTML = PERM_ROWS.map(r => { const ok = r.ok(p); return `<div class="prow"><span>${r.icon} <b>${esc(_t(r.name))}</b><small>${esc(_t(r.why))}${r.note ? esc(r.note(p)) : ''}</small></span><span>${ok ? '✅' : `<button class="btn sm" data-perm="${r.k}">${esc(_t(r.btn || 'अनुमति दें'))}</button>`}</span></div>`; }).join('');
  box.querySelectorAll('[data-perm]').forEach(b => b.onclick = async () => { await askPerm(b.dataset.perm); renderPerms(); });
}
async function askAllPerms() { for (const k of ['mic', 'notif', 'exact', 'lock', 'battery', 'camera']) { const row = PERM_ROWS.find(r => r.k === k); if (!row.ok(await refreshPerms())) { await askPerm(k); await sleep(400); } } if ((await refreshPerms()).volume === 0) await PiyuNative.ask('volume'); renderPerms(); nativeNow(); }
async function permsOnboard() {           // right after sign-in / start: one clear explanation, then the system asks one by one
  if (!isNativeApp() || !PiyuNative.bgAvailable) return;
  const p = await refreshPerms(); const miss = PERM_ROWS.filter(r => r.need && !r.ok(p));
  let last = 0; try { last = +localStorage.getItem('piyu.permAsk') || 0; } catch (e) { }
  if (!miss.length || Date.now() - last < 12 * 3600e3) return;
  $('#permDlgList').innerHTML = miss.map(r => `<div class="prow"><span>${r.icon} <b>${esc(_t(r.name))}</b><small>${esc(_t(r.why))}</small></span></div>`).join('');
  try { $('#permDlg').showModal(); } catch (e) { }
}
$('#permAll').onclick = askAllPerms;
$('#permDlgOk').onclick = async () => { $('#permDlg').close(); try { localStorage.setItem('piyu.permAsk', String(Date.now())); } catch (e) { } await askAllPerms(); };
$('#permDlgLater').onclick = () => { $('#permDlg').close(); try { localStorage.setItem('piyu.permAsk', String(Date.now())); } catch (e) { } };
document.addEventListener('visibilitychange', () => { if (!document.hidden && isNativeApp() && $('#permList') && $('#permList').offsetParent) renderPerms(); });
/* the camera button: ask first (the phone's file-chooser cannot ask by itself once it was refused) */
document.addEventListener('click', e => { const t = e.target; if (t && t.id === 'attCam' && isNativeApp() && permCache.camera && permCache.camera !== 'granted') { e.preventDefault(); askPerm('camera').then(p => toast(p.camera === 'granted' ? _t('📷 अनुमति मिल गई — अब कैमरे का बटन फिर दबाइए') : _t('Camera की अनुमति नहीं मिली'))); } }, true);

/* Android app: sign-in on this phone. While signed in, Piyu keeps running in the background (foreground service, restarts after reboot) until Logout. */
const isNativeApp = () => !!(window.PiyuNative && PiyuNative.isNative);
const sha = async t => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode('piyu:' + t)))].map(b => b.toString(16).padStart(2, '0')).join('');
function loginUI() {
  if (!isNativeApp()) return;
  const s = S.settings, need = !s.loggedIn || s.pinHash;
  if (!need) { $('#startBtn').click(); return; }      // already signed in, no PIN: open straight away
  $('#loginBox').hidden = false; $('#pinForgot').hidden = !(s.loggedIn && s.pinHash);
  $('#startBtn').textContent = s.loggedIn ? _t('अनलॉक') : _t('Login');
  $('#loginPin').placeholder = s.loggedIn ? _t('अपना PIN डालें') : _t('PIN बनाएँ (वैकल्पिक)');
  $('#loginToken').hidden = !!(s.token || s.loggedIn);      // first sign-in on a phone: the server token, typed once
}
/* forgot the PIN: the server's Sync token (which only the owner has) removes it — a wrong token removes nothing */
$('#pinForgot').onclick = async () => {
  const tk = $('#loginToken'), msg = $('#loginMsg');
  if (tk.hidden) { tk.hidden = false; tk.placeholder = _t('Sync token डालकर PIN हटाएँ'); tk.focus(); msg.textContent = _t('Sync token डालें, फिर यही बटन दोबारा दबाएँ'); return; }
  const t = tk.value.trim(); if (!t) return;
  const v = await verifyToken(t);
  if (v.ok) { S.settings.token = t; ME = v.me || {}; S.settings.pinHash = ''; S.settings.loggedIn = false; save(); tk.value = ''; tk.hidden = true; loginUI(); msg.textContent = _t('PIN हटा दिया — नया PIN बनाइए (या खाली छोड़कर Login दबाइए)'); return; }
  msg.textContent = '⚠ ' + tokenProblemText(v.code); return;
};
async function nativeLogin() {       // true = may open the app
  if (!isNativeApp()) return true;
  const s = S.settings, pin = $('#loginPin').value.trim();
  if (s.loggedIn && !s.pinHash) return true;
  if (s.loggedIn) { if ((await sha(pin)) === s.pinHash) return true; $('#loginMsg').textContent = _t('PIN ग़लत है'); $('#loginPin').value = ''; $('#loginPin').focus(); return false; }
  if (pin && !/^\d{4,6}$/.test(pin)) { $('#loginMsg').textContent = _t('PIN 4 से 6 अंकों का होना चाहिए'); return false; }
  const tk = ($('#loginToken').value || '').trim();
  if (tk) { const v = await verifyToken(tk); if (!v.ok) { $('#loginMsg').textContent = '⚠ ' + tokenProblemText(v.code); return false; } s.token = tk; ME = v.me || {}; }
  s.loggedIn = true; s.pinHash = pin ? await sha(pin) : ''; save(); return true;
}
async function bgOn() {
  if (!isNativeApp() || !PiyuNative.bgAvailable || !S.settings.loggedIn) return;
  await PiyuNative.bgStart({ title: 'Piyu', text: _t('Piyu चालू है — आपके alarm सुरक्षित हैं') });
}
/* keyboard "Go/Enter" submits, tapping a field brings it into view above the keyboard, and a wrong PIN is shown clearly */
['loginPin', 'loginToken'].forEach(id => { const el = document.getElementById(id); if (!el) return; el.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); $('#startBtn').click(); } }); el.addEventListener('focus', () => setTimeout(() => el.scrollIntoView({ block: 'center', behavior: 'smooth' }), 300)); el.addEventListener('input', () => { $('#loginMsg').textContent = ''; }); });
$('#loginPin').addEventListener('input', e => { e.target.value = e.target.value.replace(/[^0-9]/g, '').slice(0, 6); });
$('#startBtn').onclick = async () => {
  await storeReady; await deviceReady;
  if (window.PiyuStudent && !PiyuStudent.ensureMode()) return;
  if (!(await nativeLogin())) return;
  bgOn(); permsOnboard(); refreshPerms();
  await detectNeural();
  $('#splash').hidden = true; $('#app').hidden = false;
  if (window.PiyuStudent) { PiyuStudent.applyMode(); setTimeout(() => { PiyuStudent.onboard(); PiyuStudent.autoTick(); }, 900); setInterval(() => PiyuStudent.autoTick(), 600000); }
  loadMe(); setTimeout(trackBeat, 2500);
  audio(); keepAwake();
  if ('Notification' in window && Notification.permission === 'default') Notification.requestPermission().catch(() => { });
  if (!synth && !neural) toast(_t("आवाज़ उपलब्ध नहीं — ./run.sh से चलाएँ"));
  bindSettings(); bindVoiceLib(); voiceUI(); fillVoiceSelects(); render(); tick();
  setInterval(tick, 1000);
  if (S.settings.wakeOn) wakeEnable(); else wakeUI();
  refreshAI(); setInterval(refreshAI, 300000); loadVoiceLib(); refreshWeb(); setInterval(refreshWeb, 300000);
  if (window.PiyuNative && PiyuNative.available) {
    PiyuNative.onAction = (id, act) => {
      const t = S.tasks.find(x => x.id === id); if (!t) return;
      if (act === 'done') markDone(t); else if (act === 'snooze') snooze(t, 5);
    };
    PiyuNative.ttsInfo().then(i => { phoneTts = i; voiceUI(); });
    PiyuNative.init().then(() => { permInfo(); nativeNow(); PiyuNative.pollActions(); });      // permissions are asked by the one clear dialog (permsOnboard) and by Settings → 🔐 अनुमतियाँ
    setInterval(nativeNow, 300000);
    setTimeout(checkAppUpdate, 6000); setInterval(checkAppUpdate, 6 * 3600e3);
  }
  syncNow(); setInterval(syncNow, 60000); showSync();
  addBub(_t2("नमस्ते {0}, {1} जी! मैं पीयू हूँ, आप मेरे बॉस हैं। अपना document upload कीजिए, मैं उसमें से आपके काम निकालकर alarm लगा दूँगी। किसी काम को कैसे करना है, यह भी मुझसे पूछ सकते हैं।", [CALL(), OWNER()], "Hello {0}! I am Piyu. Upload a document and I will pull out your tasks and set alarms. Ask me how to do any of them.", [callEn()]), 'pi');
  const n = nextTask();
  say(_t2("नमस्ते {0}, मैं पीयू हूँ, आपकी असिस्टेंट। आप मेरे बॉस {1} हैं।", [CALL(), OWNER()], "Hello {0}, I am Piyu. You are my boss, {1}.", [callEn(), S.settings.ownerEn]) + (n ? _t2(" आपका अगला काम {0} है: {1}", [full(n.alarmAt), n.title], " Your next task is at {0}: {1}", [full(n.alarmAt), n.title]) : _t2(" आप कोई document upload कर सकते हैं।", [], " You can upload a document.", [])));
};

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) navigator.serviceWorker.register('sw.js').catch(() => { });
