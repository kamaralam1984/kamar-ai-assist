/* Piyu OCR — Tesseract.js running fully offline from ./vendor/ocr (Hindi + English). Browser only. */
(function (root) {
  'use strict';
  let worker = null, workerLangs = '', tessP = null, logger = null, gen = 0;

  function loadTess() {
    if (root.Tesseract) return Promise.resolve();
    if (tessP) return tessP;
    tessP = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'vendor/ocr/tesseract.min.js';
      s.onload = () => res(); s.onerror = () => { tessP = null; rej(new Error('OCR files (vendor/ocr) नहीं मिलीं')); };
      document.head.appendChild(s);
    });
    return tessP;
  }

  async function getWorker(langs) {
    await loadTess();
    if (worker && workerLangs === langs) return worker;
    if (worker) { try { await worker.terminate(); } catch (e) { } worker = null; }
    const mine = ++gen;
    const w = await root.Tesseract.createWorker(langs.split('+'), 1, {
      workerPath: 'vendor/ocr/worker.min.js', corePath: 'vendor/ocr/', langPath: 'vendor/ocr/lang',
      gzip: false, cacheMethod: 'none', workerBlobURL: false,
      logger: m => { if (logger) logger(m); }
    });
    if (mine !== gen) { try { await w.terminate(); } catch (e) { } throw new Error('OCR रद्द किया'); }   // cancelled while loading
    worker = w; workerLangs = langs; return w;
  }

  /* grayscale + auto-levels (1st..99th percentile) and sensible size, so phone photos read better */
  async function prepare(src) {
    let bmp, w, h;
    if (src instanceof Blob) { bmp = await createImageBitmap(src, { imageOrientation: 'from-image' }); w = bmp.width; h = bmp.height; }
    else { bmp = src; w = src.width; h = src.height; }
    const big = Math.max(w, h);
    const scale = big < 1400 ? Math.min(3, 1800 / big) : big > 2600 ? 2600 / big : 1;
    const c = document.createElement('canvas'); c.width = Math.max(1, Math.round(w * scale)); c.height = Math.max(1, Math.round(h * scale));
    const x = c.getContext('2d', { willReadFrequently: true });
    x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
    x.imageSmoothingQuality = 'high'; x.drawImage(bmp, 0, 0, c.width, c.height);
    if (bmp.close) try { bmp.close(); } catch (e) { }
    const img = x.getImageData(0, 0, c.width, c.height), d = img.data, hist = new Uint32Array(256);
    for (let i = 0; i < d.length; i += 4) { const g = (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000 | 0; d[i] = g; hist[g]++; }
    const total = c.width * c.height; let acc = 0, lo = 0, hi = 255;
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= total * 0.01) { lo = v; break; } }
    acc = 0; for (let v = 255; v >= 0; v--) { acc += hist[v]; if (acc >= total * 0.01) { hi = v; break; } }
    const span = Math.max(40, hi - lo);
    for (let i = 0; i < d.length; i += 4) { const v = Math.max(0, Math.min(255, (d[i] - lo) * 255 / span)); d[i] = d[i + 1] = d[i + 2] = v; }
    x.putImageData(img, 0, 0);
    return c;
  }

  /* recognize(imageBlobOrCanvas, {langs, onProgress(stage, 0..1), signal}) -> {text, confidence} */
  async function recognize(src, o) {
    o = o || {};
    if (o.signal && o.signal.aborted) throw new Error('OCR रद्द किया');
    let onAbort;
    const aborted = new Promise((_, rej) => { if (o.signal) { onAbort = () => rej(new Error('OCR रद्द किया')); o.signal.addEventListener('abort', onAbort); } });
    const run = (async () => {
      const canvas = await prepare(src);
      const w = await getWorker(o.langs || 'eng+hin');
      logger = m => { if (o.onProgress && m.status) o.onProgress(m.status, m.progress || 0); };
      const r = await w.recognize(canvas);
      return { text: r.data.text || '', confidence: r.data.confidence || 0 };
    })();
    try { return await Promise.race([run, aborted]); }
    finally { if (o.signal && onAbort) o.signal.removeEventListener('abort', onAbort); logger = null; }
  }

  function cancel() { gen++; const w = worker; worker = null; workerLangs = ''; if (w) try { w.terminate(); } catch (e) { } }

  root.PiyuOCR = { recognize, cancel };
})(window);
