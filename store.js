/* Piyu storage: IndexedDB (state + blobs), merge logic for sync, backup/restore. No DOM dependency except indexedDB. */
(function (root) {
  'use strict';
  const DB = 'piyu', VER = 1;
  let dbp = null;
  const LISTS = [['tasks', 'task'], ['docs', 'doc'], ['facts', 'fact'], ['episodes', 'ep'], ['days', 'day'], ['kb', 'kb']];
  const DEVICE_KEYS = ['voiceHi', 'voiceEn', 'token', 'wake', 'wakeOn', 'serverUrl', 'loggedIn', 'pinHash'];

  function open() {
    if (dbp) return dbp;
    dbp = new Promise((res, rej) => {
      if (typeof indexedDB === 'undefined') return rej(new Error('no indexedDB'));
      const r = indexedDB.open(DB, VER);
      r.onupgradeneeded = () => { const d = r.result; d.createObjectStore('kv'); d.createObjectStore('blobs'); };
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
    return dbp;
  }
  async function tx(store, mode, fn) {
    const d = await open();
    return new Promise((res, rej) => {
      const t = d.transaction(store, mode), s = t.objectStore(store);
      const rq = fn(s);   // an IDBRequest; its .result is only valid once the transaction completed (undefined = key not found)
      t.oncomplete = () => res(rq ? rq.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  }
  const kvGet = k => tx('kv', 'readonly', s => s.get(k));
  const kvPut = (k, v) => tx('kv', 'readwrite', s => s.put(v, k));

  /* ----- state ----- */
  async function load() {
    let st = null;
    try { st = await kvGet('state'); } catch (e) { }
    if (!st) { // one-time migration from the old localStorage version
      try {
        const old = JSON.parse(localStorage.getItem('piyu.v1'));
        if (old) { st = old; await kvPut('state', st); localStorage.removeItem('piyu.v1'); }
      } catch (e) { }
    }
    return st;
  }
  async function save(state) { try { await kvPut('state', JSON.parse(JSON.stringify(state))); return true; } catch (e) { return false; } }

  /* ----- blobs (attachments) ----- */
  const putBlob = (id, blob) => tx('blobs', 'readwrite', s => s.put(blob, id));
  const getBlob = id => tx('blobs', 'readonly', s => s.get(id));
  const delBlob = id => tx('blobs', 'readwrite', s => s.delete(id));
  const allBlobKeys = () => tx('blobs', 'readonly', s => s.getAllKeys());

  /* ----- merge remote state into local, in place. Returns true if local changed. ----- */
  function mergeState(L, R) {
    let ch = false;
    const tomb = new Map();
    [].concat(L.tombstones || [], R.tombstones || []).forEach(t => {
      const k = t.kind + ':' + t.id;
      if (!tomb.has(k) || tomb.get(k) < t.at) tomb.set(k, t.at);
    });
    const now = Date.now();
    L.tombstones = [...tomb].map(([k, at]) => { const i = k.indexOf(':'); return { kind: k.slice(0, i), id: k.slice(i + 1), at }; }).filter(t => now - t.at < 60 * 864e5);
    LISTS.forEach(([list, kind]) => {
      L[list] = L[list] || [];
      const n0 = L[list].length;
      L[list] = L[list].filter(x => { const at = tomb.get(kind + ':' + x.id); return !(at && at >= (x.updatedAt || 0)); });
      if (L[list].length !== n0) ch = true;
      const map = new Map(L[list].map(x => [x.id, x]));
      (R[list] || []).forEach(r => {
        const at = tomb.get(kind + ':' + r.id);
        if (at && at >= (r.updatedAt || 0)) return;
        const l = map.get(r.id);
        if (!l) { L[list].push(r); map.set(r.id, r); ch = true; }
        else if ((r.updatedAt || 0) > (l.updatedAt || 0)) { Object.keys(l).forEach(k => delete l[k]); Object.assign(l, r); ch = true; }
      });
    });
    if (R.mind && (!L.mind || (R.mind.updatedAt || 0) > (L.mind.updatedAt || 0))) { L.mind = R.mind; ch = true; }   // learnt profile / voice preferences: newest wins
    if ((R.settingsAt || 0) > (L.settingsAt || 0) && R.settings) {
      const keep = {}; DEVICE_KEYS.forEach(k => keep[k] = L.settings[k]);
      Object.assign(L.settings, R.settings, keep);   // in place: the Settings screen holds a reference to this object
      L.settingsAt = R.settingsAt; ch = true;
    }
    return ch;
  }

  /* ----- backup / restore ----- */
  function b64(buf) { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); }
  async function exportAll(state) {
    const blobs = {};
    for (const k of await allBlobKeys()) {
      const b = await getBlob(k); if (!b) continue;
      blobs[k] = { type: b.type, data: b64(await b.arrayBuffer()) };
    }
    return { piyu: 1, at: Date.now(), state, blobs };
  }
  async function importBlobs(blobs) {
    for (const k of Object.keys(blobs || {})) {
      const bin = atob(blobs[k].data), u = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
      await putBlob(k, new Blob([u], { type: blobs[k].type }));
    }
  }

  root.Store = { load, save, putBlob, getBlob, delBlob, allBlobKeys, mergeState, exportAll, importBlobs, DEVICE_KEYS, LISTS };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.Store;
})(typeof self !== 'undefined' ? self : this);
