/* Piyu media: make uploaded photos / scanned PDFs small (and quick to sync) without hurting readability. Runs in the browser, no server, no cost.
   optimize(file)   -> { blob, changed, from, to, kind }   photos: resized (long side <= 1800 px) + JPEG at the highest quality that fits ~400 KB
                                                            PDFs that are mostly page-images (scans): pages re-rendered at <= 1500 px as JPEG pages
                                                            everything else (text PDFs, Word, PowerPoint, small files): returned unchanged */
(function (root) {
  'use strict';
  const KB = 1024;
  const toBlob = (c, type, q) => new Promise(r => c.toBlob(r, type, q));
  const same = f => ({ blob: f, changed: false, from: f.size, to: f.size });

  /* ---------------- photos ---------------- */
  async function optimizeImage(file, o) {
    o = Object.assign({ maxSide: 1800, target: 400 * KB, minQ: 0.6, skipBelow: 200 * KB }, o || {});
    if (!/^image\/(jpeg|png|webp|bmp)$/.test(file.type) || file.size <= o.skipBelow) return same(file);
    let bmp; try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); } catch (e) { return same(file); }
    let scale = Math.min(1, o.maxSide / Math.max(bmp.width, bmp.height)), best = null;
    // does the picture use transparency? (then keep PNG instead of flattening it onto white)
    let alpha = false;
    if (file.type === 'image/png') {
      const t = document.createElement('canvas'); t.width = t.height = 48; const x = t.getContext('2d', { willReadFrequently: true }); x.drawImage(bmp, 0, 0, 48, 48);
      const d = x.getImageData(0, 0, 48, 48).data; for (let i = 3; i < d.length; i += 4) if (d[i] < 250) { alpha = true; break; }
    }
    for (let round = 0; round < 4; round++) {
      const w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
      const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
      if (!alpha) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
      x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h);
      if (alpha) { best = { blob: await toBlob(c, 'image/png'), w, h, type: 'image/png', ext: 'png' }; break; }
      let q = 0.88, blob;
      for (;;) { blob = await toBlob(c, 'image/jpeg', q); if (blob.size <= o.target || q <= o.minQ) break; q = Math.max(o.minQ, q - 0.06); }
      best = { blob, w, h, type: 'image/jpeg', ext: 'jpg', q };
      if (blob.size <= o.target * 1.4) break;
      scale *= 0.82;                               // still big at the lowest quality: shrink the picture a little more
    }
    if (bmp.close) try { bmp.close(); } catch (e) { }
    if (!best || best.blob.size >= file.size * 0.92) return same(file);
    const name = (file.name || 'photo').replace(/\.[a-z0-9]+$/i, '') + '.' + best.ext;
    return { blob: new File([best.blob], name, { type: best.type }), changed: true, from: file.size, to: best.blob.size, kind: 'image', w: best.w, h: best.h };
  }

  /* ---------------- scanned / image-heavy PDFs ---------------- */
  let pdfjsP = null;
  function pdfjs() {
    return pdfjsP || (pdfjsP = import('./vendor/pdf.min.mjs').then(m => { m.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', location.href).href; return m; }));
  }
  const enc = new TextEncoder();
  function buildPdf(pages) {                       // pages: [{w,h (points), jpeg:Uint8Array, pw, ph (pixels)}]
    const parts = [], offs = []; let len = 0;
    const push = b => { const u = typeof b === 'string' ? enc.encode(b) : b; parts.push(u); len += u.length; };
    const obj = (n, fn) => { offs[n] = len; push(n + ' 0 obj\n'); fn(); push('\nendobj\n'); };
    push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
    const N = pages.length, kids = pages.map((_, i) => (3 + i * 3) + ' 0 R').join(' ');
    obj(1, () => push('<< /Type /Catalog /Pages 2 0 R >>'));
    obj(2, () => push('<< /Type /Pages /Kids [' + kids + '] /Count ' + N + ' >>'));
    pages.forEach((p, i) => {
      const pg = 3 + i * 3, ct = pg + 1, im = pg + 2, content = 'q ' + p.w.toFixed(2) + ' 0 0 ' + p.h.toFixed(2) + ' 0 0 cm /Im0 Do Q';
      obj(pg, () => push('<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ' + p.w.toFixed(2) + ' ' + p.h.toFixed(2) + '] /Resources << /XObject << /Im0 ' + im + ' 0 R >> >> /Contents ' + ct + ' 0 R >>'));
      obj(ct, () => push('<< /Length ' + content.length + ' >>\nstream\n' + content + '\nendstream'));
      obj(im, () => { push('<< /Type /XObject /Subtype /Image /Width ' + p.pw + ' /Height ' + p.ph + ' /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ' + p.jpeg.length + ' >>\nstream\n'); push(p.jpeg); push('\nendstream'); });
    });
    const xref = len, total = 3 + N * 3;
    let x = 'xref\n0 ' + total + '\n0000000000 65535 f \n';
    for (let n = 1; n < total; n++) x += String(offs[n]).padStart(10, '0') + ' 00000 n \n';
    push(x + 'trailer\n<< /Size ' + total + ' /Root 1 0 R >>\nstartxref\n' + xref + '\n%%EOF\n');
    return new Blob(parts, { type: 'application/pdf' });
  }
  async function optimizePdf(file, o) {
    o = Object.assign({ minSize: 1200 * KB, maxPages: 150, maxSide: 1500, q: 0.72, bytesPerPage: 220 * KB, onProgress: null }, o || {});
    if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name || '')) return same(file);
    if (file.size < o.minSize) return same(file);
    let doc;
    try { const lib = await pdfjs(); doc = await lib.getDocument({ data: new Uint8Array(await file.arrayBuffer()) }).promise; } catch (e) { return same(file); }
    const n = doc.numPages;
    if (n > o.maxPages || file.size / n < o.bytesPerPage) return same(file);        // small pages = mostly text/vector: leave it exactly as it is
    // a text PDF can be big too: if pages carry real text, keep the original (searchable, sharp)
    try { const t = await (await doc.getPage(1)).getTextContent(); if (t.items.map(i => i.str).join('').trim().length > 400) return same(file); } catch (e) { }
    const pages = [];
    for (let i = 1; i <= n; i++) {
      if (o.onProgress) o.onProgress(i, n);
      const pg = await doc.getPage(i), v1 = pg.getViewport({ scale: 1 }), s = Math.min(3, o.maxSide / Math.max(v1.width, v1.height)), v = pg.getViewport({ scale: s });
      const c = document.createElement('canvas'); c.width = Math.round(v.width); c.height = Math.round(v.height);
      const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
      await pg.render({ canvasContext: x, viewport: v }).promise;
      const jb = await toBlob(c, 'image/jpeg', o.q);
      pages.push({ w: v1.width, h: v1.height, pw: c.width, ph: c.height, jpeg: new Uint8Array(await jb.arrayBuffer()) });
      pg.cleanup && pg.cleanup();
    }
    if (doc.destroy) try { doc.destroy(); } catch (e) { }
    const out = buildPdf(pages);
    if (out.size >= file.size * 0.7) return same(file);                              // not worth it
    return { blob: new File([out], file.name, { type: 'application/pdf' }), changed: true, from: file.size, to: out.size, kind: 'pdf', pages: n };
  }


  /* ---------------- Word / PowerPoint / Excel: shrink the big pictures inside (a .docx/.pptx is a zip), keep everything else byte-for-byte ---------------- */
  const inflateRaw = async u8 => new Uint8Array(await new Response(new Blob([u8]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = u8 => { let c = 0xFFFFFFFF; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  function readZip(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength); let e = u8.length - 22;
    while (e >= 0 && dv.getUint32(e, true) !== 0x06054b50) e--;
    if (e < 0) return null;
    const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const ents = [];
    for (let i = 0; i < n; i++) {
      if (p + 46 > u8.length || dv.getUint32(p, true) !== 0x02014b50) return null;
      const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true), lho = dv.getUint32(p + 42, true);
      if (csize === 0xFFFFFFFF || usize === 0xFFFFFFFF || lho === 0xFFFFFFFF) return null;                  // zip64: leave such files alone
      ents.push({ name: new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nl)), method: dv.getUint16(p + 10, true), crc: dv.getUint32(p + 16, true), csize, usize, lho, cd: u8.slice(p, p + 46 + nl + el + cl) });
      p += 46 + nl + el + cl;
    }
    return ents;
  }
  async function shrinkPicture(bytes, name, o) {
    const png = /\.png$/i.test(name), type = png ? 'image/png' : 'image/jpeg';
    let bmp; try { bmp = await createImageBitmap(new Blob([bytes], { type })); } catch (e) { return null; }
    const scale = Math.min(1, o.maxSide / Math.max(bmp.width, bmp.height)), w = Math.max(1, Math.round(bmp.width * scale)), h = Math.max(1, Math.round(bmp.height * scale));
    const c = document.createElement('canvas'); c.width = w; c.height = h; const x = c.getContext('2d');
    if (!png) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); }
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, w, h); if (bmp.close) try { bmp.close(); } catch (e) { }
    let blob = await toBlob(c, type, 0.8);
    if (!png) for (let q = 0.8; blob && blob.size > bytes.length * 0.7 && q > 0.55;) { q -= 0.08; blob = await toBlob(c, type, q); }
    if (!blob || blob.size > bytes.length * 0.8) return null;
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function optimizeOffice(file, o) {
    o = Object.assign({ minSize: 1500 * KB, maxSide: 1600, minPic: 150 * KB, onProgress: null }, o || {});
    if (!/\.(docx|pptx|xlsx)$/i.test(file.name || '') || file.size < o.minSize || typeof DecompressionStream === 'undefined') return same(file);
    const u8 = new Uint8Array(await file.arrayBuffer()), ents = readZip(u8); if (!ents) return same(file);
    const pics = ents.filter(e => /(^|\/)media\/[^/]+\.(png|jpe?g)$/i.test(e.name) && e.usize >= o.minPic && (e.method === 0 || e.method === 8)); if (!pics.length) return same(file);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength), parts = [], cds = []; let off = 0, k = 0;
    const raw = e => { const s = e.lho + 30 + dv.getUint16(e.lho + 26, true) + dv.getUint16(e.lho + 28, true); return u8.subarray(s, s + e.csize); };
    for (const e of ents) {
      let data = raw(e), method = e.method, crc = e.crc, usize = e.usize;
      if (pics.includes(e)) {
        if (o.onProgress) o.onProgress(++k, pics.length);
        try { const full = e.method === 8 ? await inflateRaw(data) : data, small = await shrinkPicture(full, e.name, o); if (small) { data = small; method = 0; crc = crc32(small); usize = small.length; } } catch (er) { }
      }
      const nameB = new TextEncoder().encode(e.name), lh = new Uint8Array(30 + nameB.length), lv = new DataView(lh.buffer);
      lh.set(u8.subarray(e.lho + 10, e.lho + 14), 10);                         // time + date of the original entry
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, method, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, data.length, true); lv.setUint32(22, usize, true); lv.setUint16(26, nameB.length, true); lh.set(nameB, 30);
      const cd = e.cd.slice(), cv = new DataView(cd.buffer); cv.setUint16(8, 0x0800, true); cv.setUint16(10, method, true); cv.setUint32(16, crc, true); cv.setUint32(20, data.length, true); cv.setUint32(24, usize, true); cv.setUint32(42, off, true);
      parts.push(lh, data); cds.push(cd); off += lh.length + data.length;
    }
    const cdSize = cds.reduce((a, c) => a + c.length, 0), end = new Uint8Array(22), ev = new DataView(end.buffer);
    ev.setUint32(0, 0x06054b50, true); ev.setUint16(8, ents.length, true); ev.setUint16(10, ents.length, true); ev.setUint32(12, cdSize, true); ev.setUint32(16, off, true);
    const out = new Blob([...parts, ...cds, end], { type: file.type || 'application/octet-stream' });
    if (out.size >= file.size * 0.85) return same(file);
    return { blob: new File([out], file.name, { type: file.type }), changed: true, from: file.size, to: out.size, kind: 'office', pics: pics.length };
  }

  async function optimize(file, o) {
    try {
      if (/^image\//.test(file.type)) return await optimizeImage(file, o);
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return await optimizePdf(file, o);
      if (/\.(docx|pptx|xlsx)$/i.test(file.name || '')) return await optimizeOffice(file, o);
    } catch (e) { console.warn('media', e); }
    return same(file);
  }
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  root.PiyuMedia = { optimize, optimizeImage, optimizePdf, optimizeOffice, buildPdf, fmt, readZip, crc32, MAX_UPLOAD: 100 * 1024 * 1024 };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PiyuMedia;
})(typeof self !== 'undefined' ? self : this);
