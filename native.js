/* Piyu native (Android) bridge — real phone alarms through Capacitor's LocalNotifications (AlarmManager, exact + allowWhileIdle),
   so an alarm rings even when the app is closed or the phone is locked. In a normal browser this file does nothing. */
(function (root) {
  const _t = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr : (k, a) => (a ? k.replace(/\{(\d+)\}/g, (m, i) => a[i]) : k), _t2 = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr2 : (hk, ha) => (ha && ha.length ? hk.replace(/\{(\d+)\}/g, (m, i) => ha[i]) : hk);
  'use strict';
  const cap = root.Capacitor;
  const isNative = !!(cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform());
  const LN = isNative && cap.Plugins && cap.Plugins.LocalNotifications;
  const N = { isNative, available: !!LN, ready: false, onAction: null, lastError: null, perm: 'unknown' };

  async function init() {
    if (!LN || N.ready) return N.ready;
    try {
      await LN.createChannel({ id: 'piyu_alarm', name: 'Piyu alarm', description: 'Task alarms (loud)', importance: 5, visibility: 1, vibration: true, lights: true });
      await LN.createChannel({ id: 'piyu_soft', name: 'Piyu soft alarm', description: 'Quiet-hours alarms', importance: 3, visibility: 1, vibration: false });
      await LN.createChannel({ id: 'piyu_silent', name: 'Piyu silent notice', description: 'Silent notices (quiet hours: silent)', importance: 2, visibility: 1, vibration: false });
      await LN.registerActionTypes({ types: [{ id: 'ALARM', actions: [{ id: 'done', title: _t("✔ हो गया") }, { id: 'snooze', title: _t("5 मिनट बाद") }] }] });
      await LN.addListener('localNotificationActionPerformed', ev => {
        const x = (ev.notification && ev.notification.extra) || {};
        if (N.onAction && x.taskId) N.onAction(x.taskId, ev.actionId === 'done' ? 'done' : ev.actionId === 'snooze' ? 'snooze' : 'open', x.kind);
      });
      N.ready = true;
    } catch (e) { N.lastError = String(e && e.message || e); }
    return N.ready;
  }

  /* notification permission (Android 13+) and the exact-alarm permission (Android 12+) */
  async function requestPermissions() {
    if (!LN) return 'unsupported';
    try {
      const p = await LN.requestPermissions(); N.perm = p.display || 'unknown';
      if (LN.checkExactNotificationSetting) { const e = await LN.checkExactNotificationSetting(); if (e && e.exact_alarm && e.exact_alarm !== 'granted' && LN.changeExactNotificationSetting) await LN.changeExactNotificationSetting(); }
    } catch (e) { N.lastError = String(e && e.message || e); }
    return N.perm;
  }
  async function permission() { if (!LN) return 'unsupported'; try { const p = await LN.checkPermissions(); N.perm = p.display; return p.display; } catch (e) { return 'unknown'; } }

  /* make the phone's pending alarms equal to `plan` (from PiyuCore.planAlarms): cancel the stale, (re)schedule new/changed */
  async function sync(plan) {
    if (!LN) return { added: 0, cancelled: 0 };
    await init();
    /* loud alarms go to Piyu's own alarm clock (rings on the alarm volume, lights the screen, animated full-screen page); quiet / silent ones stay normal notifications */
    if (BG && BG.alarmSync) {
      try {
        const loud = plan.filter(p => p.channelId === 'piyu_alarm');
        await BG.alarmSync({ alarms: loud.map(p => ({ id: p.id, at: p.at, title: p.title, body: p.body, taskId: p.taskId, kind: p.kind, doneLbl: _t("✔ हो गया"), snoozeLbl: _t("5 मिनट बाद"), stopLbl: _t("बंद करें") })) });
        N.nativeAlarms = true; plan = plan.filter(p => p.channelId !== 'piyu_alarm');
      } catch (e) { N.lastError = String(e && e.message || e); }
    }
    try {
      const pend = ((await LN.getPending()).notifications) || [];
      const want = new Map(plan.map(p => [p.id, p])), have = new Map(pend.map(n => [n.id, n]));
      const cancel = pend.filter(n => !want.has(n.id)).map(n => ({ id: n.id }));
      const add = plan.filter(p => {
        const h = have.get(p.id); if (!h) return true;
        const at = h.schedule && h.schedule.at ? new Date(h.schedule.at).getTime() : 0;
        return Math.abs(at - p.at) > 1000 || h.body !== p.body || h.title !== p.title;
      });
      if (cancel.length) await LN.cancel({ notifications: cancel });
      if (add.length) await LN.schedule({ notifications: add.map(p => ({ id: p.id, title: p.title, body: p.body, channelId: p.channelId, actionTypeId: 'ALARM', schedule: { at: new Date(p.at), allowWhileIdle: true }, extra: { taskId: p.taskId, kind: p.kind } })) });
      return { added: add.length, cancelled: cancel.length };
    } catch (e) { N.lastError = String(e && e.message || e); return { added: 0, cancelled: 0, error: N.lastError }; }
  }

  /* open a link outside the app (Chrome Custom Tab) — used to download the new APK */
  async function openUrl(url) {
    const B = isNative && cap.Plugins && cap.Plugins.Browser;
    if (B) { try { await B.open({ url }); return true; } catch (e) { N.lastError = String(e && e.message || e); } }
    try { root.open(url, '_blank'); return true; } catch (e) { return false; }
  }
  /* background running (Android foreground service, restarted after reboot) while the user is signed in */
  const BG = isNative && cap.Plugins && cap.Plugins.PiyuBackground ? cap.Plugins.PiyuBackground : null;
  N.bgAvailable = !!BG;
  N.bgStart = async (o) => { if (!BG) return null; try { return await BG.start(o || {}); } catch (e) { N.lastError = String(e && e.message || e); return null; } };
  N.bgStop = async () => { if (!BG) return null; try { return await BG.stop(); } catch (e) { return null; } };
  N.bgStatus = async () => { if (!BG) return null; try { return await BG.status(); } catch (e) { return null; } };
  N.requestBattery = async () => { if (!BG) return null; try { return await BG.requestBatteryExemption(); } catch (e) { return null; } };
  N.cancelAll = async () => { if (!LN) return; try { const p = (await LN.getPending()).notifications || []; if (p.length) await LN.cancel({ notifications: p.map(x => ({ id: x.id })) }); } catch (e) { } };
  N.appVersion = async () => { if (BG) { try { const i = await BG.appInfo(); if (i && i.versionCode) return +i.versionCode; } catch (e) { } } return root.PIYU_APP_VC || 0; };

  /* ---- permissions (mic, camera, notifications, exact alarms, battery, volume) ---- */
  N.perms = async () => {
    const o = { native: true };
    if (BG && BG.permStatus) { try { Object.assign(o, await BG.permStatus()); } catch (e) { } }
    try { o.fullScreen = await N.fullScreenOk(); } catch (e) { }
    if (LN) {
      try { o.notif = (await LN.checkPermissions()).display; } catch (e) { }
      try { const x = await LN.checkExactNotificationSetting(); o.exact = x && x.exact_alarm; } catch (e) { }
    }
    return o;
  };
  /* name: mic | camera | notif | exact | battery | volume  -> the system asks the user; returns the new status */
  N.ask = async name => {
    try {
      if (name === 'mic' || name === 'camera' || name === 'loc' || name === 'bgloc') await BG.permRequest({ name });
      else if (name === 'notif') await LN.requestPermissions();
      else if (name === 'exact') { if (LN.changeExactNotificationSetting) await LN.changeExactNotificationSetting(); }
      else if (name === 'lock') await N.openFullScreenSettings();
      else if (name === 'battery') await BG.requestBatteryExemption();
      else if (name === 'volume') await BG.volumeUp();
    } catch (e) { N.lastError = String(e && e.message || e); }
    return N.perms();
  };
  /* ---- Piyu Family: child location sharing (only while the parent has it ON) and parent alerts, in a foreground service that also runs with the app closed ---- */
  N.famAvail = !!(BG && BG.famStart);
  N.famStart = async o => { if (!N.famAvail) return null; try { return await BG.famStart(o || {}); } catch (e) { N.lastError = String(e && e.message || e); return null; } };
  N.famStop = async () => { if (!N.famAvail) return null; try { return await BG.famStop(); } catch (e) { return null; } };
  N.famStatus = async () => { if (!N.famAvail) return null; try { return await BG.famStatus(); } catch (e) { return null; } };
  N.locOnce = async () => { if (!BG || !BG.locOnce) return null; try { return await BG.locOnce(); } catch (e) { return null; } };
  N.openSettings = async () => { if (BG) { try { await BG.openAppSettings(); } catch (e) { } } };

  /* ---- the phone's own speech recognition (no browser speech API exists inside an Android WebView) ---- */
  N.speechAvail = false;
  try { if (BG && BG.speechAvailable) BG.speechAvailable().then(r => { N.speechAvail = !!(r && r.available); }).catch(() => { }); } catch (e) { }
  let speechHandles = [];
  N.listen = async (lang, h) => {      // h = { partial(text), done(matches[]), error(code) }
    const off = () => { speechHandles.forEach(x => { try { x.remove(); } catch (e) { } }); speechHandles = []; };
    off();
    speechHandles.push(await BG.addListener('speechPartial', e => h.partial && h.partial((e.matches || [])[0] || '')));
    speechHandles.push(await BG.addListener('speechFinal', e => { off(); h.done && h.done(e.matches || []); }));
    speechHandles.push(await BG.addListener('speechError', e => { off(); h.error && h.error(e.code); }));
    try { await BG.speechStart({ lang }); } catch (e) { off(); h.error && h.error(String(e && e.message || e)); }
  };
  N.stopListening = async () => { if (BG) { try { await BG.speechStop(); } catch (e) { } } };
  N.deviceId = async () => { if (BG && BG.deviceId) { try { const r = await BG.deviceId(); return (r && r.id) || ''; } catch (e) { } } return ''; };
  N.openUrl = openUrl;
  /* ---- the phone's own voice (Google text-to-speech: natural Indian Hindi / Indian English, sentences play back-to-back) ---- */
  N.ttsAvail = !!(BG && BG.ttsSpeak); N.ttsPending = new Map(); N.onTtsIdle = null;
  let ttsH = null, ttsSeq = 0;
  N.ttsInfo = async () => { if (!N.ttsAvail) return null; try { return await BG.ttsInfo(); } catch (e) { return null; } };
  const ttsIdleCheck = () => { const now = Date.now(); N.ttsPending.forEach((t, id) => { if (now - t > 45000) N.ttsPending.delete(id); }); if (!N.ttsPending.size && N.onTtsIdle) N.onTtsIdle(); };
  N.ttsSpeak = async o => {
    if (!ttsH) { ttsH = true; try { await BG.addListener('ttsDone', e => { N.ttsPending.delete(e.id); ttsIdleCheck(); }); } catch (e) { ttsH = null; } }
    const id = 'u' + (++ttsSeq); N.ttsPending.set(id, Date.now());
    try { await BG.ttsSpeak(Object.assign({}, o, { id })); } catch (e) { N.ttsPending.delete(id); throw e; }
    return id;
  };
  N.ttsStop = async () => { N.ttsPending.clear(); if (BG && BG.ttsStop) { try { await BG.ttsStop(); } catch (e) { } } };
  N.ttsOpenSettings = async () => { if (BG && BG.ttsOpenSettings) { try { await BG.ttsOpenSettings(); } catch (e) { } } };
  /* what the user pressed on a ringing alarm while Piyu was closed (Done / Snooze) -> applied to the task list */
  N.pollActions = async () => {
    if (!BG || !BG.alarmActions || !N.onAction) return;
    try { const r = await BG.alarmActions(); (r.actions || []).forEach(a => { if (a.taskId && (a.action === 'done' || a.action === 'snooze')) N.onAction(a.taskId, a.action, a.kind); }); } catch (e) { }
  };
  N.testAlarm = async (seconds) => { if (!BG || !BG.alarmTest) return false; try { await BG.alarmTest({ seconds: seconds || 5, title: _t("⏰ Piyu का test alarm"), body: _t("Alarm ठीक से बज रहा है"), doneLbl: _t("✔ हो गया"), snoozeLbl: _t("5 मिनट बाद"), stopLbl: _t("बंद करें") }); return true; } catch (e) { return false; } };
  N.fullScreenOk = async () => { if (!BG || !BG.fullScreenStatus) return true; try { return !!(await BG.fullScreenStatus()).allowed; } catch (e) { return true; } };
  N.openFullScreenSettings = async () => { if (BG && BG.openFullScreenSettings) { try { await BG.openFullScreenSettings(); } catch (e) { } } };
  if (isNative && root.document) { root.document.addEventListener('visibilitychange', () => { if (!root.document.hidden) N.pollActions(); }); setInterval(() => { if (!root.document.hidden) N.pollActions(); }, 5000); }
  N.init = init; N.requestPermissions = requestPermissions; N.permission = permission; N.sync = sync;
  root.PiyuNative = N;
  if (typeof module !== 'undefined' && module.exports) module.exports = N;
})(typeof self !== 'undefined' ? self : this);
