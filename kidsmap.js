/* Piyu Kids — the free map. Two views of the same thing:
     • RADAR: a built-in schematic map (rings = distance) that works with no internet and no map service at all;
     • MAP: real streets from OpenStreetMap (free tiles, loaded only while a parent has the map open; "© OpenStreetMap contributors" is always shown).
   Draws: the child (pulsing dot, accuracy circle), safe places (circles), the parent (optional), and the last hours of the trail. window.PiyuKidsMap */
(function (root) {
  'use strict';
  const R = 6371000, rad = d => d * Math.PI / 180;
  function dist(a, b, c, d) { const p1 = rad(a), p2 = rad(c), x = Math.sin((p2 - p1) / 2) ** 2 + Math.cos(p1) * Math.cos(p2) * Math.sin(rad(d - b) / 2) ** 2; return 2 * R * Math.asin(Math.min(1, Math.sqrt(x))); }
  function bearing(a, b, c, d) { const y = Math.sin(rad(d - b)) * Math.cos(rad(c)), x = Math.cos(rad(a)) * Math.sin(rad(c)) - Math.sin(rad(a)) * Math.cos(rad(c)) * Math.cos(rad(d - b)); return Math.atan2(y, x); }
  const fmtDist = m => m < 950 ? Math.round(m / 10) * 10 + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0) + ' km';
  const TILE = 256, MAXZ = 18, MINZ = 3;
  /* spherical mercator, world pixel at zoom z */
  const wx = (lng, z) => (lng + 180) / 360 * TILE * 2 ** z;
  const wy = (lat, z) => { const s = Math.sin(rad(lat)); return (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * TILE * 2 ** z; };
  const ilng = (x, z) => x / (TILE * 2 ** z) * 360 - 180;
  const ilat = (y, z) => { const n = Math.PI - 2 * Math.PI * y / (TILE * 2 ** z); return 180 / Math.PI * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n))); };
  const metersPerPx = (lat, z) => 156543.03392 * Math.cos(rad(lat)) / 2 ** z;
  const PLACE_COL = { home: '#22c55e', school: '#3b82f6', tuition: '#a855f7', other: '#f59e0b' };
  const PLACE_ICON = { home: '🏠', school: '🏫', tuition: '📚', other: '📍' };

  /* opts: { child:{lat,lng,acc,at}, places:[{name,type,lat,lng,r}], parent:{lat,lng}, trail:[{lat,lng,at}], pick:false, onPick(lat,lng), mode:'radar'|'map', labels:{...} }  */
  function mount(host, opts) {
    host.classList.add('kmap'); host.innerHTML = '';
    const M = { o: Object.assign({ mode: 'radar' }, opts), host };
    const bar = document.createElement('div'); bar.className = 'kmap-bar';
    bar.innerHTML = '<button data-m="radar" type="button">📡 ' + (M.o.labels && M.o.labels.radar || 'Radar') + '</button><button data-m="map" type="button">🗺️ ' + (M.o.labels && M.o.labels.map || 'Map') + '</button>';
    const stage = document.createElement('div'); stage.className = 'kmap-stage';
    const cv = document.createElement('canvas'); cv.className = 'kmap-cv'; const tiles = document.createElement('div'); tiles.className = 'kmap-tiles';
    const attr = document.createElement('div'); attr.className = 'kmap-attr'; attr.innerHTML = '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors';
    const zoom = document.createElement('div'); zoom.className = 'kmap-zoom'; zoom.innerHTML = '<button data-z="1" type="button" aria-label="zoom in">+</button><button data-z="-1" type="button" aria-label="zoom out">−</button><button data-z="0" type="button" aria-label="centre">◎</button>';
    const cross = document.createElement('div'); cross.className = 'kmap-cross'; cross.hidden = !M.o.pick; cross.textContent = '📍';
    stage.append(tiles, cv, attr, zoom, cross); host.append(bar, stage);
    M.cv = cv; M.tiles = tiles; M.attr = attr; M.stage = stage; M.cross = cross;
    M.view = { lat: 0, lng: 0, z: 16, rr: 500 }; M.fit = true; M.imgs = new Map();
    bar.onclick = e => { const b = e.target.closest('[data-m]'); if (b) setMode(M, b.dataset.m); };
    zoom.onclick = e => { const b = e.target.closest('[data-z]'); if (!b) return; const d = +b.dataset.z; if (d === 0) { M.fit = true; fitView(M); } else { M.fit = false; if (M.mode === 'map') M.view.z = Math.max(MINZ, Math.min(MAXZ, M.view.z + d)); else M.view.rr = Math.max(60, Math.min(60000, M.view.rr * (d > 0 ? 0.6 : 1.7))); } draw(M); };
    /* drag to move, wheel to zoom (map) */
    let drag = null;
    stage.addEventListener('pointerdown', e => { if (e.target.closest('.kmap-zoom,a')) return; drag = { x: e.clientX, y: e.clientY, lat: M.view.lat, lng: M.view.lng }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => {
      if (!drag) return; const dx = e.clientX - drag.x, dy = e.clientY - drag.y; if (Math.abs(dx) + Math.abs(dy) > 3) M.fit = false;
      if (M.mode === 'map') { M.view.lng = ilng(wx(drag.lng, M.view.z) - dx, M.view.z); M.view.lat = ilat(wy(drag.lat, M.view.z) - dy, M.view.z); }
      else { const mpp = M.view.rr * 2 / Math.min(M.w, M.h), dLat = dy * mpp / 111320, dLng = -dx * mpp / (111320 * Math.cos(rad(drag.lat))); M.view.lat = drag.lat + dLat; M.view.lng = drag.lng + dLng; }
      draw(M);
    });
    const up = () => { drag = null; if (M.o.pick && M.o.onPick) M.o.onPick(M.view.lat, M.view.lng); };
    stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', () => { drag = null; });
    stage.addEventListener('wheel', e => { if (M.mode !== 'map') return; e.preventDefault(); M.fit = false; M.view.z = Math.max(MINZ, Math.min(MAXZ, M.view.z + (e.deltaY < 0 ? 1 : -1))); draw(M); }, { passive: false });
    const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(() => draw(M)) : null; if (ro) ro.observe(stage);
    M.destroy = () => { if (ro) ro.disconnect(); M.dead = true; };
    M.update = o => { Object.assign(M.o, o); if (M.fit) fitView(M); draw(M); };
    M.setMode = m => setMode(M, m);
    setMode(M, M.o.mode, true);
    return M;
  }
  function setMode(M, m, first) {
    M.mode = m === 'map' ? 'map' : 'radar'; M.o.mode = M.mode;
    M.host.querySelectorAll('.kmap-bar [data-m]').forEach(b => b.classList.toggle('on', b.dataset.m === M.mode));
    M.tiles.hidden = M.mode !== 'map'; M.attr.hidden = M.mode !== 'map';
    if (M.mode !== 'map') { M.tiles.innerHTML = ''; M.imgs.clear(); }
    M.fit = true; fitView(M); draw(M);
  }
  function points(M) {
    const o = M.o, p = []; if (o.child) p.push(o.child); (o.places || []).forEach(x => p.push(x)); if (o.parent) p.push(o.parent); return p;
  }
  function fitView(M) {
    const o = M.o, c = o.child || (o.places || [])[0] || o.parent; if (!c) { M.view = { lat: 20.59, lng: 78.96, z: 4, rr: 3000000 }; return; }
    const pts = points(M); let lat = c.lat, lng = c.lng, far = 150;
    pts.forEach(p => { far = Math.max(far, dist(c.lat, c.lng, p.lat, p.lng) + (p.r || 0) * 0.5); });
    M.view.lat = lat; M.view.lng = lng; M.view.rr = far * 1.35;
    const w = M.w || 320, h = M.h || 320, min = Math.min(w, h);
    for (let z = MAXZ; z >= MINZ; z--) { if (metersPerPx(lat, z) * min / 2 >= M.view.rr) { M.view.z = z; break; } M.view.z = MINZ; }
  }
  function size(M) {
    const r = M.stage.getBoundingClientRect(), dpr = Math.min(2, root.devicePixelRatio || 1); M.w = Math.max(160, r.width); M.h = Math.max(160, r.height);
    if (M.cv.width !== Math.round(M.w * dpr)) { M.cv.width = Math.round(M.w * dpr); M.cv.height = Math.round(M.h * dpr); M.cv.style.width = M.w + 'px'; M.cv.style.height = M.h + 'px'; }
    return dpr;
  }
  /* world → screen */
  function toScreen(M, lat, lng) {
    const v = M.view;
    if (M.mode === 'map') return { x: M.w / 2 + wx(lng, v.z) - wx(v.lng, v.z), y: M.h / 2 + wy(lat, v.z) - wy(v.lat, v.z) };
    const mpp = v.rr * 2 / Math.min(M.w, M.h), d = dist(v.lat, v.lng, lat, lng), b = bearing(v.lat, v.lng, lat, lng);
    return { x: M.w / 2 + Math.sin(b) * d / mpp, y: M.h / 2 - Math.cos(b) * d / mpp };
  }
  const mToPx = (M, m, lat) => M.mode === 'map' ? m / metersPerPx(lat, M.view.z) : m / (M.view.rr * 2 / Math.min(M.w, M.h));
  function draw(M) {
    if (M.dead || !M.stage.isConnected) return; const dpr = size(M), cx = M.cv.getContext('2d'); if (M.fit && M.lastW !== M.w) { M.lastW = M.w; fitView(M); } cx.setTransform(dpr, 0, 0, dpr, 0, 0); cx.clearRect(0, 0, M.w, M.h);
    const dark = !M.o.light;
    if (M.mode === 'map') drawTiles(M); else drawRadar(M, cx);
    const o = M.o;
    /* trail */
    if (o.trail && o.trail.length > 1) { cx.save(); cx.lineWidth = 3; cx.lineJoin = 'round'; cx.strokeStyle = 'rgba(255,209,102,.9)'; cx.shadowColor = 'rgba(255,209,102,.6)'; cx.shadowBlur = 6; cx.setLineDash([2, 6]); cx.beginPath(); o.trail.forEach((p, i) => { const s = toScreen(M, p.lat, p.lng); if (i) cx.lineTo(s.x, s.y); else cx.moveTo(s.x, s.y); }); cx.stroke(); cx.restore(); }
    /* places */
    (o.places || []).forEach(p => { const s = toScreen(M, p.lat, p.lng), r = Math.max(10, mToPx(M, p.r || 100, p.lat)), col = PLACE_COL[p.type] || PLACE_COL.other;
      cx.beginPath(); cx.arc(s.x, s.y, r, 0, 7); cx.fillStyle = col + '33'; cx.fill(); cx.lineWidth = 2; cx.strokeStyle = col; cx.setLineDash([6, 5]); cx.stroke(); cx.setLineDash([]);
      cx.font = '20px system-ui,"Noto Color Emoji",sans-serif'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(PLACE_ICON[p.type] || '📍', s.x, s.y);
      if (p.name) { cx.font = '700 11px system-ui,sans-serif'; cx.lineWidth = 3; cx.strokeStyle = M.mode === 'map' ? '#fff' : '#0b1030'; cx.strokeText(p.name, s.x, s.y + 20); cx.fillStyle = M.mode === 'map' ? '#111' : '#fff'; cx.fillText(p.name, s.x, s.y + 20); } });
    /* parent */
    if (o.parent) { const s = toScreen(M, o.parent.lat, o.parent.lng); cx.beginPath(); cx.arc(s.x, s.y, 8, 0, 7); cx.fillStyle = '#38bdf8'; cx.fill(); cx.lineWidth = 3; cx.strokeStyle = '#fff'; cx.stroke(); cx.font = '700 10px system-ui'; cx.fillStyle = M.mode === 'map' ? '#0c4a6e' : '#bae6fd'; cx.textAlign = 'center'; cx.fillText(o.labels && o.labels.parent || 'Parent', s.x, s.y - 14); }
    /* child */
    if (o.child) { const s = toScreen(M, o.child.lat, o.child.lng), ar = o.child.acc ? mToPx(M, o.child.acc, o.child.lat) : 0, t = (Date.now() % 1800) / 1800;
      if (ar > 6) { cx.beginPath(); cx.arc(s.x, s.y, Math.min(ar, 140), 0, 7); cx.fillStyle = 'rgba(244,63,94,.12)'; cx.fill(); }
      cx.beginPath(); cx.arc(s.x, s.y, 10 + t * 22, 0, 7); cx.strokeStyle = 'rgba(244,63,94,' + (0.7 * (1 - t)) + ')'; cx.lineWidth = 3; cx.stroke();
      cx.beginPath(); cx.arc(s.x, s.y, 11, 0, 7); cx.fillStyle = '#f43f5e'; cx.fill(); cx.lineWidth = 3; cx.strokeStyle = '#fff'; cx.stroke();
      cx.font = '14px system-ui,"Noto Color Emoji"'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(o.childIcon || '🧒', s.x, s.y + 1);
      cx.font = '700 11px system-ui'; cx.lineWidth = 3; cx.strokeStyle = M.mode === 'map' ? '#fff' : '#0b1030'; cx.strokeText(o.childName || '', s.x, s.y - 20); cx.fillStyle = M.mode === 'map' ? '#be123c' : '#fecdd3'; cx.fillText(o.childName || '', s.x, s.y - 20);
      if (!M.anim) { M.anim = true; const loop = () => { if (M.dead || !M.stage.isConnected) { M.anim = false; return; } if (M.o.child && !document.hidden) { draw(M); } setTimeout(() => requestAnimationFrame(loop), 120); }; requestAnimationFrame(loop); } }
    else if (!(o.places || []).length) { cx.fillStyle = dark ? '#cbd5e1' : '#334155'; cx.font = '600 14px system-ui'; cx.textAlign = 'center'; cx.fillText(o.labels && o.labels.empty || '—', M.w / 2, M.h / 2); }
  }
  function drawRadar(M, cx) {
    const w = M.w, h = M.h, c = { x: w / 2, y: h / 2 }, rmax = Math.min(w, h) / 2 - 6, mpp = M.view.rr * 2 / Math.min(w, h);
    const g = cx.createRadialGradient(c.x, c.y, 0, c.x, c.y, Math.max(w, h) * 0.7); g.addColorStop(0, '#0f2a4a'); g.addColorStop(1, '#050a1c'); cx.fillStyle = g; cx.fillRect(0, 0, w, h);
    /* nice ring distances */
    const target = M.view.rr / 3, pw = 10 ** Math.floor(Math.log10(target)), step = [1, 2, 5, 10].map(m => m * pw).find(m => m >= target) || pw * 10;
    cx.lineWidth = 1; cx.font = '600 10px system-ui'; cx.textAlign = 'left'; cx.textBaseline = 'alphabetic';
    for (let m = step; m / mpp < Math.max(w, h); m += step) { const r = m / mpp; cx.beginPath(); cx.arc(c.x, c.y, r, 0, 7); cx.strokeStyle = 'rgba(56,189,248,.28)'; cx.stroke(); if (r < rmax + 40) { cx.fillStyle = 'rgba(147,210,255,.8)'; cx.fillText(fmtDist(m), c.x + 4, c.y - r + 12); } }
    cx.strokeStyle = 'rgba(56,189,248,.18)'; cx.beginPath(); cx.moveTo(c.x, 0); cx.lineTo(c.x, h); cx.moveTo(0, c.y); cx.lineTo(w, c.y); cx.stroke();
    /* sweeping beam */
    const a = (Date.now() / 2600) % 1 * Math.PI * 2, bg = cx.createConicGradient ? cx.createConicGradient(a, c.x, c.y) : null;
    if (bg) { bg.addColorStop(0, 'rgba(34,211,238,.28)'); bg.addColorStop(0.12, 'rgba(34,211,238,0)'); bg.addColorStop(1, 'rgba(34,211,238,0)'); cx.fillStyle = bg; cx.beginPath(); cx.arc(c.x, c.y, Math.max(w, h), 0, 7); cx.fill(); }
    cx.fillStyle = 'rgba(255,255,255,.7)'; cx.font = '700 11px system-ui'; cx.textAlign = 'center'; cx.fillText('N', c.x, 14);
  }
  function drawTiles(M) {
    const v = M.view, z = Math.round(v.z), cxw = wx(v.lng, z), cyw = wy(v.lat, z), x0 = cxw - M.w / 2, y0 = cyw - M.h / 2, n = 2 ** z;
    const tx0 = Math.floor(x0 / TILE), tx1 = Math.floor((x0 + M.w) / TILE), ty0 = Math.floor(y0 / TILE), ty1 = Math.floor((y0 + M.h) / TILE), want = new Set();
    for (let ty = Math.max(0, ty0); ty <= Math.min(n - 1, ty1); ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const tw = ((tx % n) + n) % n, key = z + '/' + tw + '/' + ty; want.add(key + '@' + tx);
      let img = M.imgs.get(key + '@' + tx);
      if (!img) { img = document.createElement('img'); img.className = 'kmap-tile'; img.alt = ''; img.decoding = 'async'; img.referrerPolicy = 'strict-origin-when-cross-origin'; img.draggable = false; img.src = 'https://tile.openstreetmap.org/' + key + '.png'; img.onerror = () => { img.style.opacity = 0; }; M.imgs.set(key + '@' + tx, img); M.tiles.appendChild(img); }
      img.style.transform = 'translate(' + Math.round(tx * TILE - x0) + 'px,' + Math.round(ty * TILE - y0) + 'px)';
    }
    if (M.imgs.size > 60) M.imgs.forEach((img, k) => { if (!want.has(k)) { img.remove(); M.imgs.delete(k); } });
  }
  root.PiyuKidsMap = { mount, dist, bearing, fmtDist, wx, wy, ilat, ilng, metersPerPx, PLACE_ICON };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PiyuKidsMap;
})(typeof self !== 'undefined' ? self : this);
