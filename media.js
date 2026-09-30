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
    o = Object.assign({ minSize: 1200 * KB, maxPages: 20, maxSide: 1500, q: 0.72, bytesPerPage: 220 * KB, onProgress: null }, o || {});
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

  async function optimize(file, o) {
    try {
      if (/^image\//.test(file.type)) return await optimizeImage(file, o);
      if (file.type === 'application/pdf' || /\.pdf$/i.test(file.name || '')) return await optimizePdf(file, o);
    } catch (e) { console.warn('media', e); }
    return same(file);
  }
  const fmt = b => b >= 1048576 ? (b / 1048576).toFixed(1) + ' MB' : Math.max(1, Math.round(b / 1024)) + ' KB';
  root.PiyuMedia = { optimize, optimizeImage, optimizePdf, buildPdf, fmt };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.PiyuMedia;
})(typeof self !== 'undefined' ? self : this);
