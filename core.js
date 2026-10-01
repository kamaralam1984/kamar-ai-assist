/* Piyu core — pure logic, no DOM. Works in browser and Node (for tests). */
(function (root) {
  const _t = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr : (k, a) => (a ? k.replace(/\{(\d+)\}/g, (m, i) => a[i]) : k), _t2 = (typeof PiyuI18n !== 'undefined') ? PiyuI18n.tr2 : (hk, ha) => (ha && ha.length ? hk.replace(/\{(\d+)\}/g, (m, i) => ha[i]) : hk);
  'use strict';

  const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
  const DAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
  const HI_DAYS = { 'रविवार': 0, 'सोमवार': 1, 'मंगलवार': 2, 'बुधवार': 3, 'गुरुवार': 4, 'शुक्रवार': 5, 'शनिवार': 6 };
  const MON_RE = '(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|jun(?:e)?|jul(?:y)?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)';

  /* ---------- ZIP / DOCX ---------- */
  async function zipEntry(buf, name) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Yeh valid .docx (ZIP) file nahi hai');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    for (let k = 0; k < count; k++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const fname = new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen));
      if (fname === name) {
        const ln = dv.getUint16(off + 26, true);
        const le = dv.getUint16(off + 28, true);
        const start = off + 30 + ln + le;
        const data = u8.subarray(start, start + csize);
        if (method === 0) return data;
        const ds = new DecompressionStream('deflate-raw');
        const out = await new Response(new Blob([data]).stream().pipeThrough(ds)).arrayBuffer();
        return new Uint8Array(out);
      }
      p += 46 + nlen + elen + clen;
    }
    return null;
  }

  function decodeXml(s) {
    return s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
      .replace(/&#(\d+);/g, (m, n) => String.fromCodePoint(+n))
      .replace(/&#x([0-9a-f]+);/gi, (m, n) => String.fromCodePoint(parseInt(n, 16)))
      .replace(/&amp;/g, '&');
  }

  function paraText(x) {
    x = x.replace(/<w:tab\s*\/>/g, '<w:t>\t</w:t>').replace(/<w:(?:br|cr)\s*\/>/g, '<w:t> </w:t>');
    let t = '';
    const re = /<w:t(?:\s[^>]*)?>([^<]*)<\/w:t>/g;
    let m;
    while ((m = re.exec(x))) t += m[1];
    return decodeXml(t).replace(/\s+/g, ' ').trim();
  }

  function docxXmlToBlocks(xml) {
    const bodyM = xml.match(/<w:body[\s>][\s\S]*<\/w:body>/);
    const body = bodyM ? bodyM[0] : xml;
    const blocks = [];
    const re = /<w:tbl[\s>][\s\S]*?<\/w:tbl>|<w:p[\s>][\s\S]*?<\/w:p>/g;
    let m;
    while ((m = re.exec(body))) {
      const chunk = m[0];
      if (chunk.startsWith('<w:tbl')) {
        const rows = chunk.match(/<w:tr[\s>][\s\S]*?<\/w:tr>/g) || [];
        rows.forEach((tr, ri) => {
          const cells = (tr.match(/<w:tc[\s>][\s\S]*?<\/w:tc>/g) || []).map(tc =>
            (tc.match(/<w:p[\s>][\s\S]*?<\/w:p>/g) || []).map(paraText).filter(Boolean).join(' '));
          if (cells.join('').trim()) blocks.push({ k: 'row', t: cells.join(' | '), cells, first: ri === 0 });
        });
      } else {
        const t = paraText(chunk);
        if (!t) continue;
        const st = (chunk.match(/<w:pStyle\s+w:val="([^"]+)"/) || [])[1] || '';
        const li = /<w:numPr>/.test(chunk) || /^(list|bullet)/i.test(st);
        blocks.push({ k: /^(heading|title|subtitle)/i.test(st) ? 'h' : 'p', t, li });
      }
    }
    return blocks;
  }

  function textToBlocks(text) {
    const blocks = [];
    text.replace(/\r/g, '').split(/\n/).forEach(line => {
      let t = line.trim();
      if (!t) return;
      let li = false;
      const m = t.match(/^(?:[-*•▪◦]|\d{1,2}[.)]|\[[ xX]?\]|TODO:?)\s+(.*)$/);
      if (m) { li = true; t = m[1]; }
      const h = t.match(/^#{1,6}\s+(.*)$/);
      blocks.push(h ? { k: 'h', t: h[1] } : { k: 'p', t, li });
    });
    return blocks;
  }

  /* ---------- PPTX ---------- */
  function zipNames(buf) {
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) return [];
    const count = dv.getUint16(eocd + 10, true); let p = dv.getUint32(eocd + 16, true); const out = [];
    for (let k = 0; k < count && dv.getUint32(p, true) === 0x02014b50; k++) {
      const nlen = dv.getUint16(p + 28, true), elen = dv.getUint16(p + 30, true), clen = dv.getUint16(p + 32, true);
      out.push(new TextDecoder().decode(u8.subarray(p + 46, p + 46 + nlen))); p += 46 + nlen + elen + clen;
    }
    return out;
  }
  function slideParas(xml) {
    return (xml.match(/<a:p[\s>][\s\S]*?<\/a:p>/g) || []).map(p => {
      let t = ''; const re = /<a:t(?:\s[^>]*)?>([^<]*)<\/a:t>/g; let m;
      while ((m = re.exec(p))) t += m[1];
      return { t: decodeXml(t).replace(/\s+/g, ' ').trim(), li: /<a:bu(?!None)/.test(p) };
    }).filter(x => x.t);
  }
  async function pptxToBlocks(u8) {
    const names = zipNames(u8);
    const num = n => +(n.match(/(\d+)\.xml$/) || [0, 0])[1];
    const slides = names.filter(n => /^ppt\/slides\/slide\d+\.xml$/.test(n)).sort((a, b) => num(a) - num(b));
    const dec = new TextDecoder(); const blocks = [];
    for (const n of slides) {
      blocks.push({ k: 'h', t: 'Slide ' + num(n) });
      const x = await zipEntry(u8, n); if (x) slideParas(dec.decode(x)).forEach(p => blocks.push({ k: 'p', t: p.t, li: p.li }));
      const nn = 'ppt/notesSlides/notesSlide' + num(n) + '.xml';
      if (names.includes(nn)) { const y = await zipEntry(u8, nn); if (y) slideParas(dec.decode(y)).filter(p => !/^\d+$/.test(p.t)).forEach(p => blocks.push({ k: 'p', t: p.t, li: false })); }
    }
    return blocks;
  }

  /* ---------- legacy .doc / .ppt (OLE compound file) ---------- */
  function cfbStreams(u8) {
    const dv = new DataView(u8.buffer, u8.byteOffset, u8.byteLength);
    const ss = 1 << dv.getUint16(0x1E, true), ms = 1 << dv.getUint16(0x20, true);
    const sec = i => 512 + i * ss; // for 4096 sectors header occupies one 4096 sector, offset = (i+1)*ss
    const off = i => (ss === 512 ? 512 : ss) + i * ss;
    const readSec = i => u8.subarray(off(i), off(i) + ss);
    const fat = [];
    const difat = []; for (let i = 0; i < 109; i++) { const v = dv.getUint32(0x4C + i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); }
    let dn = dv.getUint32(0x44, true), dc = dv.getUint32(0x48, true);
    while (dc-- > 0 && dn < 0xFFFFFFFA) { const d = new DataView(u8.buffer, u8.byteOffset + off(dn), ss); for (let i = 0; i < ss / 4 - 1; i++) { const v = d.getUint32(i * 4, true); if (v < 0xFFFFFFFA) difat.push(v); } dn = d.getUint32(ss - 4, true); }
    difat.forEach(si => { const d = new DataView(u8.buffer, u8.byteOffset + off(si), ss); for (let i = 0; i < ss / 4; i++) fat.push(d.getUint32(i * 4, true)); });
    const chain = (start, tbl) => { const out = []; let c = start, g = 0; while (c < 0xFFFFFFFA && g++ < 1e6) { out.push(c); c = tbl[c]; } return out; };
    const cat = parts => { let n = 0; parts.forEach(p => n += p.length); const o = new Uint8Array(n); let k = 0; parts.forEach(p => { o.set(p, k); k += p.length; }); return o; };
    const dirBytes = cat(chain(dv.getUint32(0x30, true), fat).map(readSec));
    const ents = []; const dd = new DataView(dirBytes.buffer, dirBytes.byteOffset, dirBytes.byteLength);
    for (let i = 0; i + 128 <= dirBytes.length; i += 128) {
      const nl = dd.getUint16(i + 0x40, true); if (!nl) continue;
      let name = ''; for (let k = 0; k < nl / 2 - 1; k++) name += String.fromCharCode(dd.getUint16(i + k * 2, true));
      ents.push({ name, type: dirBytes[i + 0x42], start: dd.getUint32(i + 0x74, true), size: dd.getUint32(i + 0x78, true) });
    }
    const root = ents.find(e => e.type === 5);
    let mini = null, minifat = null;
    const get = name => {
      const e = ents.find(x => x.name === name); if (!e) return null;
      if (e.size < dv.getUint32(0x38, true) && root) {
        if (!mini) {
          mini = cat(chain(root.start, fat).map(readSec));
          const mf = cat(chain(dv.getUint32(0x3C, true), fat).map(readSec)); const md = new DataView(mf.buffer, mf.byteOffset, mf.byteLength);
          minifat = []; for (let i = 0; i < mf.length / 4; i++) minifat.push(md.getUint32(i * 4, true));
        }
        return cat(chain(e.start, minifat).map(i => mini.subarray(i * ms, i * ms + ms))).subarray(0, e.size);
      }
      return cat(chain(e.start, fat).map(readSec)).subarray(0, e.size);
    };
    return { get, names: ents.map(e => e.name) };
  }

  function wordToBlocks(u8) {
    const f = cfbStreams(u8);
    const wd = f.get('WordDocument'); if (!wd) throw new Error('Yeh Word (.doc) file padh nahi paayi.');
    const dv = new DataView(wd.buffer, wd.byteOffset, wd.byteLength);
    if (dv.getUint16(0, true) !== 0xA5EC) throw new Error('Yeh Word file ka format samajh nahi aaya.');
    if (dv.getUint16(0x0A, true) & 0x0100) throw new Error('Yeh .doc password se locked hai.');
    const tbl = f.get(dv.getUint16(0x0A, true) & 0x0200 ? '1Table' : '0Table');
    const fcClx = dv.getUint32(0x1A2, true), lcbClx = dv.getUint32(0x1A6, true), ccpText = dv.getInt32(0x4C, true);
    if (!tbl || !lcbClx) throw new Error('.doc ka text hissa nahi mila. Kripya .docx me save karke upload karein.');
    const td = new DataView(tbl.buffer, tbl.byteOffset, tbl.byteLength);
    let p = fcClx;
    while (tbl[p] === 1) p += 3 + td.getUint16(p + 1, true);
    if (tbl[p] !== 2) throw new Error('.doc ka piece table nahi mila.');
    const lcb = td.getUint32(p + 1, true), n = ((lcb - 4) / 12) | 0; p += 5;
    let text = '';
    for (let i = 0; i < n; i++) {
      const cp0 = td.getUint32(p + i * 4, true), cp1 = td.getUint32(p + (i + 1) * 4, true);
      let fc = td.getUint32(p + (n + 1) * 4 + i * 8 + 2, true);
      const len = Math.min(cp1, ccpText) - cp0; if (len <= 0) continue;
      if (fc & 0x40000000) { fc = (fc & 0x3FFFFFFF) >>> 1; text += new TextDecoder('windows-1252').decode(wd.subarray(fc, fc + len)); }
      else text += new TextDecoder('utf-16le').decode(wd.subarray(fc, fc + len * 2));
    }
    text = text.replace(/\x13[^\x14\x15]*\x14?/g, '').replace(/\x15/g, '').replace(/\x07/g, ' | ').replace(/[\r\x0B\x0C]/g, '\n').replace(/[\x00-\x08\x0E-\x1F]/g, '');
    return textToBlocks(text);
  }

  function pptToBlocks(u8) {
    const f = cfbStreams(u8); const s = f.get('PowerPoint Document');
    if (!s) throw new Error('Yeh .ppt padh nahi paayi. Kripya .pptx me save karke upload karein.');
    const dv = new DataView(s.buffer, s.byteOffset, s.byteLength);
    const blocks = []; let slide = 0, p = 0;
    while (p + 8 <= s.length) {
      const ver = dv.getUint16(p, true) & 0xF, type = dv.getUint16(p + 2, true), len = dv.getUint32(p + 4, true);
      if (ver === 0xF) { if (type === 0x03EE) { slide++; blocks.push({ k: 'h', t: 'Slide ' + slide }); } p += 8; continue; }
      if (p + 8 + len > s.length) break;
      if (type === 0x0FA0 || type === 0x0FA8) {
        const raw = s.subarray(p + 8, p + 8 + len);
        const t = type === 0x0FA0 ? new TextDecoder('utf-16le').decode(raw) : new TextDecoder('windows-1252').decode(raw);
        t.split(/[\r\x0B\n]+/).map(x => x.replace(/[\x00-\x1F]/g, '').trim()).filter(Boolean).filter(x => /\p{L}/u.test(x) && !/^click to edit|(first|second|third|fourth|fifth|sixth|seventh|eighth|ninth) outline level|^‹#›$|^<#>$|^\d+$/i.test(x)).forEach(x => blocks.push({ k: 'p', t: x, li: false }));
      }
      p += 8 + len;
    }
    return blocks;
  }

  /* ---------- "Hey Piyu" wake word ---------- */
  const WAKE_DEV = new Set(['पीयू', 'पियू', 'प्यू', 'पिउ', 'पीउ', 'पियु', 'प्यु', 'पीयु', 'पीयूं']);
  const WAKE_JOIN = new Set(['piyou', 'peeyou', 'peyou', 'pyou', 'piyu', 'piu', 'pyu', 'peeu']);
  const WAKE_LAT = new Set(['piyu', 'pyu', 'piu', 'pio', 'piyo', 'peeyu', 'peyu', 'piyoo', 'pyoo', 'peeu']);
  const WAKE_NOT = new Set(['piya', 'pia', 'pie', 'pew', 'pay', 'pi', 'pu', 'poo', 'pyaar', 'pyar', 'pyaara']);
  function lev(a, b) {
    const m = a.length, n = b.length; if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) { const cur = [i]; for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = cur; }
    return prev[n];
  }
  /* -> { hit, command } ; command = what was said after the wake word (may be '') */
  function wakeMatch(text) {
    const tk = String(text || '').toLowerCase().normalize('NFC').replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean);
    for (let i = 0; i < Math.min(tk.length, 5); i++) {
      const w = tk[i], j = w + (tk[i + 1] || '');
      if (WAKE_DEV.has(w)) return { hit: true, command: tk.slice(i + 1).join(' ') };
      if (/^[a-z]+$/.test(w) && !WAKE_NOT.has(w) && w.length >= 3 && w[0] === 'p' && (WAKE_LAT.has(w) || lev(w, 'piyu') <= 1)) return { hit: true, command: tk.slice(i + 1).join(' ') };
      if (WAKE_JOIN.has(j) && tk[i + 1]) return { hit: true, command: tk.slice(i + 2).join(' ') };
    }
    return { hit: false, command: '' };
  }

  /* ---------- does a document really answer the question? + Piyu's own knowledge base ---------- */
  function docConfidence(query, text) {
    const q = new Set(tokens(query)); if (!q.size) return 0;
    const t = new Set(tokens(text)); let hit = 0; q.forEach(w => { if (t.has(w)) hit++; });
    return hit / q.size;
  }
  /* strong enough to answer from: at least half of the question's content words AND at least two of them (one for one-word questions) */
  function answersQuery(query, text) {
    const n = new Set(tokens(query)).size, c = docConfidence(query, text);
    return n > 0 && c >= 0.5 && Math.round(c * n) >= Math.min(2, n);
  }
  function jaccard(a, b) {
    const A = new Set(tokens(a)), B = new Set(tokens(b)); if (!A.size || !B.size) return 0;
    let i = 0; A.forEach(w => { if (B.has(w)) i++; }); return i / (A.size + B.size - i);
  }
  function kbFind(kb, query) {
    let best = null, bs = 0;
    (kb || []).forEach(e => { const s = jaccard(query, e.q); if (s > bs) { bs = s; best = e; } });
    return bs >= 0.6 ? best : null;
  }
  /* remember a good answer; near-duplicate questions update the same entry; at most 300 entries (least useful / oldest go first) */
  function kbAdd(kb, q, a, sources, now, uid) {
    now = now || Date.now();
    const ex = kbFind(kb, q);
    if (ex && jaccard(q, ex.q) >= 0.8) { ex.a = a; ex.sources = sources || ex.sources; ex.at = now; ex.up = (ex.up || 0) + 1; return ex; }
    const e = { id: (uid || (() => Math.random().toString(36).slice(2, 10)))(), q: String(q).slice(0, 200), a: String(a).slice(0, 1500), sources: (sources || []).slice(0, 4), at: now, up: 1, uses: 0 };
    kb.push(e);
    if (kb.length > 300) { kb.sort((x, y) => ((x.up || 0) + (x.uses || 0)) - ((y.up || 0) + (y.uses || 0)) || x.at - y.at); kb.splice(0, kb.length - 300); }
    return e;
  }
  const searchLinks = q => ({ google: 'https://www.google.com/search?q=' + encodeURIComponent(q), duckduckgo: 'https://duckduckgo.com/?q=' + encodeURIComponent(q), chatgpt: 'https://chatgpt.com/?q=' + encodeURIComponent(q) });


  /* ---------- "what is on Friday / on 2 October / till 7 October / this week" -> {from, to, kind} or null ---------- */
  const WD = [['sun', /(?:\bsun(?:day)?\b|\bravi?v?ar\b|\bitwar\b|रविवार|इतवार)/], ['mon', /(?:\bmon(?:day)?\b|\bsomvar\b|\bsomwar\b|सोमवार)/], ['tue', /(?:\btue(?:s|sday)?\b|\bmangal(?:v|w)ar\b|मंगलवार)/],
    ['wed', /(?:\bwed(?:nesday)?\b|\bbudh(?:v|w)ar\b|बुधवार)/], ['thu', /(?:\bthu(?:r|rs|rsday)?\b|\bguru(?:v|w)ar\b|\bveer(?:v|w)ar\b|गुरुवार|बृहस्पतिवार|वीरवार)/],
    ['fri', /(?:\bfri(?:day)?\b|\bshukra(?:v|w)ar\b|\bshukrawar\b|शुक्रवार)/], ['sat', /(?:\bsat(?:urday)?\b|\bshani(?:v|w)ar\b|शनिवार)/]];
  const MO = [/(?:\bjan(?:uary)?\b|\bjanvari\b|जनवरी)/, /(?:\bfeb(?:ruary)?\b|\bfarvari\b|फरवरी)/, /(?:\bmar(?:ch)?\b|मार्च)/, /(?:\bapr(?:il)?\b|अप्रैल|अप्रेल)/, /(?:\bmay\b|\bmai\b|मई)/, /(?:\bjun(?:e)?\b|जून)/,
    /(?:\bjul(?:y)?\b|जुलाई)/, /(?:\baug(?:ust)?\b|अगस्त)/, /(?:\bsep(?:t|tember)?\b|सितंबर|सितम्बर)/, /(?:\boct(?:ober)?\b|\boktubar\b|अक्टूबर|अक्तूबर)/, /(?:\bnov(?:ember)?\b|नवंबर|नवम्बर)/, /(?:\bdec(?:ember)?\b|दिसंबर|दिसम्बर)/];
  const RSTOP = new Set(('ka ki ke ko kya hai hain ho karna karne kaam kaaam tak pura poora puri poore sab saara saare mera mere meri mujhe muje batao bataiye bataao bolo dikhao dikha list schedule plan task tasks work works kitne baje kab kaise aur me mein par se the is of for my all till until upto by on what when to do i have hafte hafta week din day date tarikh tareekh tarikh ko wala wali कल आज का की के को क्या है हैं करना काम तक पूरा पूरे सब मेरा मेरे मुझे बताओ बताइए बोलो दिखाओ कितने बजे कब कैसे और में पर से तारीख').split(' '));
  function parseDayRange(text, nowMs) {
    const s = String(text).toLowerCase(), now = new Date(nowMs), sod = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }, DAY = 864e5;
    const today0 = sod(nowMs), until = /(?:\b(?:tak|till|until|upto|by)\b|तक)/.test(s);
    let from = null, to = null, kind = null, used = s;
    const strip = re => { used = used.replace(re, ' '); };
    // a calendar date: "7 october", "october 7", "7 tarikh"
    let m = s.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s*)?([a-zऀ-ॿ]+)/g) || [];
    let day = null, mon = null;
    for (const g of m) { const mm = g.match(/(\d{1,2})\s*(?:st|nd|rd|th)?\s*(?:of\s*)?([a-zऀ-ॿ]+)/); const k = MO.findIndex(r => r.test(mm[2])); if (k >= 0) { day = +mm[1]; mon = k; strip(new RegExp(g.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))); break; } }
    if (day === null) { const g = s.match(/([a-zऀ-ॿ]+)\s*(\d{1,2})(?!\d)/); if (g) { const k = MO.findIndex(r => r.test(g[1])); if (k >= 0) { day = +g[2]; mon = k; strip(new RegExp(g[0])); } } }
    if (day === null) { const g = s.match(/(\d{1,2})\s*(?:tarikh|tareekh|date|तारीख|तारिख)/); if (g) { day = +g[1]; mon = now.getMonth(); if (day < now.getDate()) mon = (mon + 1) % 12; strip(new RegExp(g[0])); } }
    if (day !== null && day >= 1 && day <= 31) {
      let y = now.getFullYear(), d = new Date(y, mon, day); if (sod(d.getTime()) < today0) d = new Date(y + 1, mon, day);
      const d0 = sod(d.getTime()); kind = until ? 'range' : 'day'; from = until ? today0 : d0; to = d0 + DAY;
    } else {
      const w = WD.findIndex(([, re]) => re.test(s));
      if (w >= 0) { let d0 = today0; for (let i = 0; i < 7 && new Date(d0).getDay() !== w; i++) d0 += DAY; kind = until ? 'range' : 'day'; from = until ? today0 : d0; to = d0 + DAY; strip(WD[w][1]); }
      else if (/(?:\bparso\b|परसों|day after tomorrow)/.test(s)) { kind = 'day'; from = today0 + 2 * DAY; to = from + DAY; strip(/(?:\bparso\b|परसों|day after tomorrow)/); }
      else if (/(?:\bhafte\b|\bhafta\b|\bweek\b|हफ्ते|हफ़्ते|सप्ताह)/.test(s)) { kind = 'range'; from = today0; to = today0 + 7 * DAY; strip(/(?:\bhafte\b|\bhafta\b|\bweek\b|हफ्ते|हफ़्ते|सप्ताह)/); }
    }
    if (!kind) return null;
    if (!/(kaam|काम|task|kya|क्या|plan|schedule|list|karna|करना|baje|बजे|kab|कब|work|todo|batao|बताओ|dikhao|दिखाओ|\bdo\b|what|when|agenda|have)/.test(s) && !until) return null;
    const left = used.replace(/[^\p{L}\p{M}\p{N}\s]/gu, ' ').split(/\s+/).filter(w => w && !RSTOP.has(w) && !/^\d+$/.test(w) && !/^(?:tak|till|until|upto|by|ka|ki|ke|ko)$/.test(w));
    if (left.length > 1) return null;          // "sunday morning doors kab" is about ONE task, not a day list
    return { from, to, kind };
  }

  /* ---------- native (Android) alarms: what to hand to the phone's alarm scheduler ---------- */
  function hash32(str) { let h = 2166136261; for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } return ((h >>> 0) % 2147480000) + 1; }
  /* -> [{id, at, title, body, channelId, taskId, kind}]  Channels: piyu_alarm (loud), piyu_soft (quiet-hours volume), piyu_silent (hard quiet).
     Every alarm gets a "pre" notice (lead time from settings / the task) and a "now" notice; policies are evaluated at the alarm's own time. */
  function planAlarms(tasks, settings, now, opts) {
    opts = opts || {};
    const out = [], horizon = now + (opts.days || 14) * 864e5, max = opts.max || 60, hi = settings.lang !== 'en';
    const list = tasks.filter(t => !t.done && t.alarmAt > now + 5000 && t.alarmAt < horizon).sort((a, b) => a.alarmAt - b.alarmAt).slice(0, max);
    list.forEach(t => {
      const lead = (t.preMin || settings.preMin || 10) * 60000, bl = blockers(t, tasks)[0];
      const chan = kind => {
        const at = new Date(kind === 'pre' ? t.alarmAt - lead : t.alarmAt), pol = alertPolicy(kind, t, at, settings, 0);
        return (!pol.speak && !pol.chime) ? 'piyu_silent' : (pol.volume < 1 ? 'piyu_soft' : 'piyu_alarm');
      };
      const note = bl ? (hi ? _t(" · पहले \"{0}\" पूरा करें", [bl.title.slice(0, 40)]) : ' · first finish "' + bl.title.slice(0, 40) + '"') : '';
      const preAt = t.alarmAt - lead;
      if (preAt > now + 5000) out.push({ id: hash32(t.id + ':pre'), at: preAt, title: hi ? _t("⏰ {0} मिनट बाद", [Math.round(lead / 60000)]) : '⏰ In ' + Math.round(lead / 60000) + ' min', body: t.title.slice(0, 120) + note, channelId: chan('pre'), taskId: t.id, kind: 'pre' });
      out.push({ id: hash32(t.id + ':now'), at: t.alarmAt, title: hi ? _t("⏰ अभी करने का समय") : '⏰ Time to do it', body: t.title.slice(0, 120) + note, channelId: chan('now'), taskId: t.id, kind: 'now' });
    });
    return out;
  }

  /* ---------- OCR text -> blocks ---------- */
  function ocrTextToBlocks(text) {
    const blocks = [], bullet = /^([•●▪◦■\-–—*»]|\d{1,2}[.)]|\[[ xX]?\])\s+/;
    text.replace(/\r/g, '').split(/\n\s*\n/).forEach(p => {
      const lines = p.split('\n').map(l => l.replace(/\s+/g, ' ').trim()).filter(l => /[\p{L}\p{N}]{2,}/u.test(l));
      let cur = null;
      lines.forEach(l => {
        const b = bullet.test(l);
        if (b || !cur) { if (cur) blocks.push(cur); cur = { k: 'p', t: l.replace(bullet, ''), li: b }; }
        else if (/[-‐]$/.test(cur.t) && /^[a-z]/.test(l)) cur.t = cur.t.slice(0, -1) + l;     // hyphenated line break
        else cur.t += ' ' + l;
      });
      if (cur) blocks.push(cur);
    });
    blocks.forEach(b => { if (!b.li && b.t.length < 70 && /[A-Z]{4}/.test(b.t) && b.t === b.t.toUpperCase() && !/[.!]$/.test(b.t)) b.k = 'h'; });
    return blocks.filter(b => b.t.length >= 2);
  }

  /* ---------- PDF (pdf.js, bundled in ./vendor, runs fully offline) ---------- */
  /* ---------- PDF page layout: glyph runs -> lines (columns, table rows, headings, paragraphs); pure, tested in Node ---------- */
  const medianOf = a => { if (!a.length) return 0; const t = a.slice().sort((x, y) => x - y); return t[Math.floor(t.length / 2)]; };
  function lineFrom(items) {
    items.sort((a, b) => a.x - b.x);
    const h = Math.max(...items.map(i => i.h)), cells = []; let cell = '', prevEnd = null;
    items.forEach(i => {
      if (prevEnd !== null) {
        const gap = i.x - prevEnd;
        if (gap > 1.5 * h) { cells.push(cell.trim()); cell = ''; }                                  // a wide gap: another table cell / column
        else if (gap > 0.2 * h && !/\s$/.test(cell) && !/^\s/.test(i.s)) cell += ' ';               // a word gap (glyph pieces of one word touch each other: no space)
      }
      cell += i.s; prevEnd = Math.max(prevEnd === null ? -1e9 : prevEnd, i.x + i.w);
    });
    cells.push(cell.trim());
    const cl = cells.filter(Boolean);
    return { t: cl.join(' ').replace(/\s+/g, ' ').trim(), cells: cl, x: items[0].x, x2: prevEnd, y: items[0].y, h };
  }
  /* items = pdf.js text items of ONE page -> { lines (reading order), bodyH } */
  function pdfLines(items) {
    const its = [];
    (items || []).forEach(it => {
      if (!it.str || !it.str.trim()) return;
      const tr = it.transform || [1, 0, 0, 1, 0, 0], h = it.height || Math.abs(tr[3]) || 10;
      its.push({ s: it.str, x: tr[4], y: tr[5], w: it.width > 0 ? it.width : it.str.length * 0.5 * h, h });
    });
    if (!its.length) return { lines: [], bodyH: 10 };
    const bodyH = medianOf(its.flatMap(i => Array(Math.min(20, i.s.length)).fill(i.h))) || 10;
    its.sort((a, b) => b.y - a.y || a.x - b.x);
    const rows = [];
    const overlaps = (r, i) => r.items.some(o => Math.min(o.x + o.w, i.x + i.w) - Math.max(o.x, i.x) > 0.2 * Math.min(o.w, i.w));        // two pieces of the same line never sit on top of each other
    its.forEach(i => { const r = rows.find(z => Math.abs(z.y - i.y) < Math.max(2, 0.45 * Math.min(z.h, i.h)) && !overlaps(z, i)); if (r) { r.items.push(i); r.h = Math.max(r.h, i.h); } else rows.push({ y: i.y, h: i.h, items: [i] }); });
    // two (or more) text columns: an empty vertical band in the middle of the page that almost no line crosses
    const x0 = Math.min(...its.map(i => i.x)), x1 = Math.max(...its.map(i => i.x + i.w)), W = x1 - x0; let gx = null;
    if (W > 200 && rows.length >= 8) {
      const N = 120, cov = new Array(N).fill(0);
      its.forEach(i => { if (i.w > W * 0.4) return; const a = Math.max(0, Math.floor((i.x - x0) / W * N)), b = Math.min(N - 1, Math.floor((i.x + i.w - x0) / W * N)); for (let k = a; k <= b; k++) cov[k]++; });      // wide titles do not count
      const mx = Math.max(1, ...cov); let best = null, run = 0, st = 0;
      for (let k = Math.floor(N * 0.3); k <= Math.ceil(N * 0.7); k++) { if (cov[k] <= Math.max(1, mx * 0.05)) { if (!run) st = k; run++; if (!best || run > best.len) best = { st, len: run }; } else run = 0; }
      if (best && best.len >= 3) {
        const g = x0 + (best.st + best.len / 2) / N * W, left = its.filter(i => i.x + i.w / 2 < g).length, cross = its.filter(i => i.x < g - 1 && i.x + i.w > g + 1).length;
        if (left >= its.length * 0.25 && its.length - left >= its.length * 0.25 && cross <= its.length * 0.08) gx = g;
      }
    }
    const lines = [], seg = { L: [], R: [] };
    const flushSeg = () => { seg.L.forEach(r => lines.push(lineFrom(r))); seg.R.forEach(r => lines.push(lineFrom(r))); seg.L = []; seg.R = []; };
    rows.forEach(r => {
      if (gx === null) { lines.push(lineFrom(r.items)); return; }
      if (r.items.some(i => i.x < gx - 1 && i.x + i.w > gx + 1)) { flushSeg(); lines.push(lineFrom(r.items)); return; }          // a full-width line (title, wide table)
      const L = r.items.filter(i => i.x + i.w / 2 < gx), R = r.items.filter(i => i.x + i.w / 2 >= gx);
      if (L.length) seg.L.push(L); if (R.length) seg.R.push(R);
    });
    flushSeg();
    return { lines, bodyH };
  }
  /* real PDF text whose font has no proper unicode map (old Hindi fonts such as Kruti Dev give "izdk'k la'ys"k.k"): detect it, so the page can be read by OCR instead */
  const COMMON_EN = new Set('the and of to in is are was for with that this from by as on at it be or an which have has not but all can will more their there been if when what who how you your we our they he she his her one each also may any these those such than then so do does did'.split(' '));
  function pdfGarbled(text) {
    const toks = String(text).split(/\s+/).filter(t => t.length > 2); if (toks.length < 12) return false;
    const pua = (text.match(/[-�]/g) || []).length; if (pua > text.length * 0.03) return true;
    const dev = (text.match(/[ऀ-ॿ]/g) || []).length, lat = (text.match(/[A-Za-z]/g) || []).length;
    if (dev >= 30 && (text.match(/(^|\s)[\u093E-\u094D\u0901-\u0903\u093C]|\u094D\s/g) || []).length / dev > 0.008) return true;       // Devanagari with loose vowel signs / a dangling virama: the glyph-to-unicode map of this PDF is broken
    if (lat < 20 || dev > lat * 0.3) return false;
    const weird = toks.filter(t => /[A-Za-z][;'"\[\]{}^~|\\@<>][A-Za-z]|[ØøðñòÐ¼½¾¸¿°ÙÚÛÜ]/.test(t)).length / toks.length;
    const common = toks.filter(t => COMMON_EN.has(t.toLowerCase().replace(/[^a-z]/g, ''))).length / toks.length;
    return weird > 0.12 && common < 0.06;
  }
  const BULLET_RX = /^([•●▪◦■\-–*]|\d{1,2}[.)]|\[[ xX]?\])\s+/;
  /* lines of one page -> blocks: headings (bigger type), table rows, bullets, paragraphs */
  function linesToBlocks(lines, bodyH, out) {
    if (!lines.length) return;
    const gaps = []; for (let i = 1; i < lines.length; i++) { const g = lines[i - 1].y - lines[i].y; if (g > 0) gaps.push(g); }
    const med = medianOf(gaps) || bodyH * 1.3, maxW = Math.max(1, ...lines.map(l => l.x2 - l.x)), left = medianOf(lines.map(l => l.x));
    const tbl = lines.map((l, i) => {
      if (l.cells.length < 2 || l.cells.some(c => c.length > 70)) return false;
      const n = l.cells.length, p = lines[i - 1], q = lines[i + 1];
      return !!((p && p.cells.length === n && p.y > l.y) || (q && q.cells.length === n && q.y < l.y));
    });
    let cur = null, prev = null, head = null;
    const flush = () => { if (cur) out.push(cur); cur = null; };
    lines.forEach((l, i) => {
      if (tbl[i]) { flush(); head = null; out.push({ k: 'p', t: l.cells.join(' | '), row: true }); prev = null; return; }
      const big = l.h >= bodyH * 1.25 && l.t.length < 120 && !/[.,;]$/.test(l.t);
      if (big) {
        if (head && prev && prev.y - l.y < l.h * 2.1) head.t += ' ' + l.t;                   // a title that wraps over two lines
        else { flush(); head = { k: 'h', t: l.t }; out.push(head); }
        prev = l; return;
      }
      head = null;
      const bullet = BULLET_RX.test(l.t), gap = prev ? prev.y - l.y : 0;
      const brk = !cur || !prev || bullet || /^(step|stage|qr|point)\s*\d+\b/i.test(l.t) || gap > med * 1.35 || Math.abs(l.h - prev.h) > prev.h * 0.12
        || (/[.!?।:]$/.test(prev.t) && (prev.x2 - prev.x) < maxW * 0.72) || (l.x - prev.x > bodyH * 1.2 && l.x > left + bodyH);
      if (brk) { flush(); cur = { k: 'p', t: l.t.replace(BULLET_RX, ''), li: bullet }; }
      else cur.t += ' ' + l.t;
      prev = l;
    });
    flush();
  }
  /* page numbers and running headers / footers are not content */
  function dropRepeats(pages) {
    const num = /^(page\s*)?[-–—\s]*\d{1,4}[-–—\s]*(of\s*\d{1,4}|\/\s*\d{1,4})?$/i, key = t => t.toLowerCase().replace(/\d+/g, '#').replace(/\s+/g, ' ').trim();
    const edge = p => [p.lines[0], p.lines[1], p.lines[p.lines.length - 2], p.lines[p.lines.length - 1]].filter(Boolean);
    const count = new Map(); pages.forEach(p => new Set(edge(p).map(l => key(l.t))).forEach(k => count.set(k, (count.get(k) || 0) + 1)));
    const need = Math.max(3, Math.ceil(pages.length * 0.5));
    pages.forEach(p => { const e = new Set(edge(p)); p.lines = p.lines.filter(l => !(e.has(l) && (num.test(l.t.trim()) || (pages.length >= 3 && count.get(key(l.t)) >= need)))); });
  }

  async function pdfToBlocks(buf, opts) {
    opts = opts || {};
    const pdfjs = await import('./vendor/pdf.min.mjs');
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', (document.currentScript && document.currentScript.src) || location.href).href;
    let doc;
    try { doc = await pdfjs.getDocument({ data: new Uint8Array(buf) }).promise; }
    catch (e) { throw new Error(e && e.name === 'PasswordException' ? 'Yeh PDF password se locked hai.' : 'PDF padh nahi paayi: ' + (e.message || e)); }
    const blocks = []; let total = 0, ocrPages = 0, confSum = 0; const maxOcr = opts.maxOcrPages || 60;
    const pages = [];                                    // per page: { lines, bodyH } (text) or { ocr: blocks } (scan / unreadable font)
    for (let pn = 1; pn <= doc.numPages; pn++) {
      const page = await doc.getPage(pn), tc = await page.getTextContent(), lay = pdfLines(tc.items);
      const text = lay.lines.map(l => l.t).join(' '), garbled = lay.lines.length > 0 && pdfGarbled(text);
      if (!lay.lines.length || garbled) {                // no text layer (a scan) or text from a font without unicode: read the picture with OCR
        if (!root.PiyuOCR || ocrPages >= maxOcr) { if (lay.lines.length) { pages.push(lay); total += lay.lines.length; if (garbled) blocks.garbled = true; } continue; }
        if (opts.signal && opts.signal.aborted) throw new Error(_t("OCR रद्द किया"));
        const vp = page.getViewport({ scale: 2.4 }), cv = document.createElement('canvas');
        cv.width = Math.ceil(vp.width); cv.height = Math.ceil(vp.height);
        const cx = cv.getContext('2d'); cx.fillStyle = '#fff'; cx.fillRect(0, 0, cv.width, cv.height);
        await page.render({ canvasContext: cx, viewport: vp }).promise;
        const r = await root.PiyuOCR.recognize(cv, { langs: garbled ? 'hin+eng' : opts.langs, signal: opts.signal, onProgress: (st, f) => opts.onProgress && opts.onProgress(st, f, pn, doc.numPages) });
        ocrPages++; confSum += r.confidence; total++;
        pages.push({ ocr: ocrTextToBlocks(r.text) });
        continue;
      }
      pages.push(lay); total += lay.lines.length;
    }
    dropRepeats(pages.filter(p => p.lines));
    pages.forEach(p => { if (p.ocr) blocks.push(...p.ocr); else linesToBlocks(p.lines, p.bodyH, blocks); });
    if (!total) throw new Error('Is PDF me text nahi mila aur OCR chalu nahi hai. Text wali PDF ya .docx upload karein.');
    // short ALL-CAPS lines become headings
    blocks.forEach(b => { if (b.t.length < 70 && /[A-Z]{4}/.test(b.t) && b.t === b.t.toUpperCase() && !/[.!]$/.test(b.t)) { b.k = 'h'; b.li = false; } });
    if (ocrPages) { blocks.ocrPages = ocrPages; blocks.conf = Math.round(confSum / ocrPages); blocks.truncated = doc.numPages > maxOcr; }
    return blocks;
  }

  async function fileToBlocks(file, opts) {
    opts = opts || {};
    const name = file.name || '';
    const buf = await file.arrayBuffer();
    const u8 = new Uint8Array(buf);
    const isZip = u8[0] === 0x50 && u8[1] === 0x4B;
    const isOle = u8[0] === 0xD0 && u8[1] === 0xCF && u8[2] === 0x11 && u8[3] === 0xE0;
    const isPdf = u8[0] === 0x25 && u8[1] === 0x50 && u8[2] === 0x44 && u8[3] === 0x46;
    let blocks;
    const isImg = (u8[0] === 0x89 && u8[1] === 0x50 && u8[2] === 0x4E && u8[3] === 0x47) || (u8[0] === 0xFF && u8[1] === 0xD8 && u8[2] === 0xFF) || (u8[0] === 0x47 && u8[1] === 0x49 && u8[2] === 0x46) || (u8[0] === 0x42 && u8[1] === 0x4D) ||
      (u8[0] === 0x52 && u8[1] === 0x49 && u8[2] === 0x46 && u8[8] === 0x57 && u8[9] === 0x45) || (u8[0] === 0x49 && u8[1] === 0x49 && u8[2] === 0x2A) || (u8[0] === 0x4D && u8[1] === 0x4D && u8[3] === 0x2A);
    if (isPdf) blocks = await pdfToBlocks(buf, opts);
    else if (isImg) {
      if (!root.PiyuOCR) throw new Error('Photo padhne ke liye OCR chahiye (browser me chalayein).');
      const r = await root.PiyuOCR.recognize(new Blob([u8], { type: file.type || 'image/png' }), { langs: opts.langs, signal: opts.signal, onProgress: (st, f) => opts.onProgress && opts.onProgress(st, f, 1, 1) });
      blocks = ocrTextToBlocks(r.text); blocks.ocrPages = 1; blocks.conf = Math.round(r.confidence);
      if (!blocks.length) throw new Error('Photo me padhne layak text nahi mila. Seedhi, saaf aur roshan photo lein.');
    }
    else if (isZip) {
      const names = zipNames(u8);
      if (names.includes('word/document.xml')) blocks = docxXmlToBlocks(new TextDecoder().decode(await zipEntry(u8, 'word/document.xml')));
      else if (names.some(n => /^ppt\/slides\/slide\d+\.xml$/.test(n))) blocks = await pptxToBlocks(u8);
      else if (names.includes('content.xml')) blocks = textToBlocks(new TextDecoder().decode(await zipEntry(u8, 'content.xml')).replace(/<\/text:(p|h)>/g, '\n').replace(/<[^>]+>/g, ''));
      else throw new Error('Yeh ZIP file Word/PowerPoint document nahi lagti.');
    } else if (isOle) {
      if (/\.ppt$/i.test(name)) blocks = pptToBlocks(u8);
      else if (/\.doc$/i.test(name)) blocks = wordToBlocks(u8);
      else { try { blocks = wordToBlocks(u8); } catch (e) { blocks = pptToBlocks(u8); } }
    } else if (/\.rtf$/i.test(name) || /^\{\\rtf/.test(new TextDecoder().decode(u8.subarray(0, 8)))) {
      blocks = textToBlocks(new TextDecoder('windows-1252').decode(u8).replace(/\\par[d]?\b/g, '\n').replace(/\\'([0-9a-f]{2})/gi, (m, h) => String.fromCharCode(parseInt(h, 16))).replace(/\{\\\*[^{}]*\}/g, '').replace(/\\[a-z]+-?\d* ?/gi, '').replace(/[{}]/g, ''));
    } else if (/\.html?$/i.test(name)) {
      blocks = textToBlocks(new TextDecoder().decode(u8).replace(/<(script|style)[\s\S]*?<\/\1>/gi, '').replace(/<\/(p|div|li|h\d|tr|br)>/gi, '\n').replace(/<[^>]+>/g, ' '));
    } else if (/\.(txt|md|csv|json|log|text)$/i.test(name) || (file.type || '').startsWith('text/') || !/[\x00-\x08]/.test(new TextDecoder('latin1').decode(u8.subarray(0, 512)))) {
      let txt; try { txt = new TextDecoder('utf-8', { fatal: true }).decode(u8); } catch (e) { txt = new TextDecoder('windows-1252').decode(u8); }
      blocks = textToBlocks(txt);
    } else throw new Error('Yeh format supported nahi hai. PDF, DOCX, DOC, PPTX, PPT, TXT, MD, CSV, HTML, RTF upload karein.');
    const meta = { ocrPages: blocks.ocrPages, conf: blocks.conf, truncated: blocks.truncated };
    blocks = blocks.map(b => Object.assign({}, b, { t: b.t.replace(/<\/?(?:b|i|u|font|br|strong|em|span|para|a)\b[^>]*>/gi, '').replace(/\s+/g, ' ').trim() })).filter(b => b.t);
    Object.assign(blocks, meta);
    if (!blocks || !blocks.length) throw new Error('Document me padhne layak text nahi mila.');
    return blocks;
  }

  /* ---------- date / time parsing ---------- */
  const startOfDay = d => { const x = new Date(d); x.setHours(0, 0, 0, 0); return x; };
  const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

  function parseWhen(text, now) {
    const t = text.toLowerCase();
    const cands = [];
    let m;
    const re1 = new RegExp('\\b(\\d{1,2})(?:st|nd|rd|th)?\\s+' + MON_RE + '\\b(?:,?\\s+(\\d{4}))?', 'g');
    while ((m = re1.exec(t))) cands.push({ i: m.index, kind: 'md', day: +m[1], mon: m[2], year: m[3] });
    const re2 = new RegExp('\\b' + MON_RE + '\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b(?:,?\\s+(\\d{4}))?', 'g');
    while ((m = re2.exec(t))) cands.push({ i: m.index, kind: 'md', day: +m[2], mon: m[1], year: m[3] });
    const re3 = /\b(next\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/g;
    while ((m = re3.exec(t))) cands.push({ i: m.index, kind: 'wd', wd: DAYS.indexOf(m[2]), next: !!m[1] });
    Object.keys(HI_DAYS).forEach(k => { const i = t.indexOf(k); if (i >= 0) cands.push({ i, kind: 'wd', wd: HI_DAYS[k] }); });
    const re4 = /\b(today|tonight|tomorrow|aaj|kal)\b|आज|कल/g;
    while ((m = re4.exec(t))) {
      const w = m[0];
      cands.push({ i: m.index, kind: 'rel', off: /tomorrow|kal|कल/.test(w) ? 1 : 0, night: w === 'tonight' });
    }
    cands.sort((a, b) => a.i - b.i);
    const c = cands[0];
    let date = null;
    if (c) {
      const today = startOfDay(now);
      if (c.kind === 'md') {
        const mi = MONTHS.findIndex(x => x.startsWith(c.mon.slice(0, 3)));
        let y = c.year ? +c.year : now.getFullYear();
        date = new Date(y, mi, c.day);
        if (!c.year && date < addDays(today, -183)) date = new Date(y + 1, mi, c.day);
      } else if (c.kind === 'wd') {
        let diff = (c.wd - now.getDay() + 7) % 7;
        if (c.next && diff === 0) diff = 7;
        date = addDays(today, diff);
      } else date = addDays(today, c.off);
    }
    let hh = null, mm = 0;
    const tm = t.match(/\b(\d{1,2})(?:[:.](\d{2}))?\s*([ap])\.?\s?m\b/);
    const t24 = t.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/);
    const hi = t.match(/(\d{1,2})\s*बजे/);
    if (tm && +tm[1] >= 1 && +tm[1] <= 12) {
      hh = (+tm[1]) % 12 + (tm[3] === 'p' ? 12 : 0); mm = +(tm[2] || 0);
    } else if (t24) { hh = +t24[1]; mm = +t24[2]; }
    else if (hi) { hh = +hi[1]; }
    let part = null;
    if (/\b(morning|subah)\b|सुबह/.test(t)) part = 9;
    else if (/\b(afternoon)\b|दोपहर/.test(t)) part = 14;
    else if (/\b(evening|shaam)\b|शाम/.test(t)) part = 18;
    else if (/\b(night|tonight|raat)\b|रात/.test(t)) part = 21;
    if (hi && hh !== null && hh < 12 && part >= 12) hh += 12;
    let hasTime = hh !== null;
    if (!hasTime && part !== null && date) { hh = part; hasTime = true; }
    if (!date && !hasTime) return null;
    if (!date) {
      date = startOfDay(now);
      const cand = new Date(date); cand.setHours(hh, mm, 0, 0);
      if (cand < now) date = addDays(date, 1);
    }
    const d = new Date(date);
    d.setHours(hasTime ? hh : 10, hasTime ? mm : 0, 0, 0);
    return { ts: d.getTime(), hasTime, dateOnly: !hasTime, isToday: startOfDay(d).getTime() === startOfDay(now).getTime() };
  }

  /* ---------- analysis: blocks -> tasks / rules ---------- */
  const TASK_SEC = /step|to.?do|task|action|checklist|kaam|काम|\bfor\s+\S+|tests?\b|plan|agenda|schedule|next|deliverable|homework/i;
  const NO_TASK_SEC = /how it fits|overview|summary|about|background|what it is|notes?\b|functions?\b|database|status|kya karta|kya hai|flow|reference|glossary|prove|introduction|intro\b/i;
  const RULE_SEC = /rule|niyam|नियम|constraint|dos? and don/i;
  const RULE_START = /^(never|do not|don'?t|only\b|always|touch only|test only|must not|avoid|कभी नहीं|मत )/i;
  const VERBS = 'get give send copy add deploy check run test call pay submit prepare review finish complete write update tell set make book buy email meet create fix share upload remind follow confirm arrange collect print clean visit ask pick take put open close install setup schedule plan turn raise ensure verify apply attend join read draft publish approve deliver contact follow-up sign register renew order clear cancel start stop move bring find';
  const VERB_SET = new Set(VERBS.split(' '));
  const HI_VERB = /(करें|करना|कीजिए|करो|भेजें|भेजना|देखें|जमा|तैयार|बनाएं|बनाना|लें\b|दें\b|चेक|भरें|खरीदें|मिलें|कॉल)/;

  function isHeading(b) {
    if (b.k === 'h') return true;
    if (b.k !== 'p') return false;
    const t = b.t;
    if (t.length > 70 || /[.!]$/.test(t)) return false;
    if (b.li && !(/[A-Z]{4}/.test(t) && t === t.toUpperCase())) return false;
    const letters = t.replace(/[^A-Za-z]/g, '');
    if (letters.length >= 4 && letters === letters.toUpperCase()) return true;
    return false;
  }

  function makeTitle(text) {
    let s = text.replace(/^\d{1,2}[.)]\s+/, '').replace(/^((first|then|next|also|finally|after that|और|फिर|today|tomorrow|आज|कल)[,:]?\s+)+/i, '').trim();
    s = s.charAt(0).toUpperCase() + s.slice(1);
    let first = s.split(/(?<=[.!?।])\s+/)[0];
    if (first.length > 110) {
      first = first.slice(0, 110);
      first = first.slice(0, first.lastIndexOf(' ') > 60 ? first.lastIndexOf(' ') : 110) + '…';
    }
    return first.replace(/[.:]$/, '');
  }

  /* one paragraph that holds several "Step 3: … Step 4: …" or "1. … 2. …" items -> separate items */
  function splitItems(t) {
    if ((t.match(/\b(?:Step|Stage)\s*\d+\s*[:.)]/gi) || []).length > 1) return t.split(/\s+(?=(?:Step|Stage)\s*\d+\s*[:.)]\s)/i).map(x => x.trim()).filter(Boolean);
    if (/^\d{1,2}[.)]\s/.test(t) && (t.match(/(?:^|\s)\d{1,2}[.)]\s+\S/g) || []).length > 1) return t.split(/\s+(?=\d{1,2}[.)]\s+\S)/).map(x => x.trim()).filter(Boolean);
    return [t];
  }
  const CODE_LINE = /^(select|insert|update|delete|create|alter)\b[\s\S]*\b(from|into|set|table)\b/i;

  function analyze(blocks, now, opts) {
    now = now || new Date();
    const tasks = [];
    const rules = [];
    let section = '';
    let tableTask = null;
    const seen = new Set();
    const add = (text, sec, opts) => {
      if (!(opts && opts.title)) {
        const parts = splitItems(text);
        if (parts.length > 1) { parts.forEach(x => add(x, sec, Object.assign({}, opts, { _p: 1 }))); return; }
        if (CODE_LINE.test(text)) return;
      }
      const title = (opts && opts.title) || makeTitle(text);
      if (!title || seen.has(title.toLowerCase())) return;
      seen.add(title.toLowerCase());
      const w = parseWhen(opts && opts.whenText ? opts.whenText : text, now);
      const repeat = parseRepeat(text);
      const sn = text.match(/^\W*(?:step|stage|phase|चरण|स्टेप)\s*(\d+)/i);
      tasks.push({ title, text, section: sec, w, deadline: !!(opts && opts.deadline), repeat: repeat || undefined, priority: priorityOf(text, sec, !!(opts && opts.deadline)), stepNo: sn ? +sn[1] : undefined });
    };
    blocks.forEach((b, idx) => {
      if (isHeading(b)) { section = b.t.replace(/\s+/g, ' '); tableTask = null; return; }
      if (b.k === 'row') {
        if (b.first) {
          const ci = b.cells.findIndex(c => /^(task|kaam|काम|action|work|to.?do|item|activity|job)/i.test(c.trim()));
          tableTask = ci >= 0 ? ci : null;
          return;
        }
        if (tableTask !== null && b.cells[tableTask]) {
          add(b.cells.join(' — '), section, { title: b.cells[tableTask].trim(), whenText: b.cells.filter((c, i) => i !== tableTask).join(' ') });
        }
        return;
      }
      const t = b.t;
      const inRule = RULE_SEC.test(section);
      const inTask = TASK_SEC.test(section) && !NO_TASK_SEC.test(section);
      const inNo = NO_TASK_SEC.test(section);
      if (inRule || (RULE_START.test(t) && !b.li && !inTask)) { rules.push(t); return; }
      if (inTask && RULE_START.test(t)) { rules.push(t); return; }
      if (/^deadline\b/i.test(t)) { add(t, section, { title: 'Deadline — ' + makeTitle(t.replace(/^deadline:?\s*/i, '')), deadline: true }); return; }
      if (t.split(/\s+/).length < 3 && !b.li && !VERB_SET.has(t.replace(/^[^A-Za-z\u0900-\u097F]+/, '').split(/[\s,:]+/)[0].toLowerCase())) return;   // drops closing lines like "Jai Shivrai", keeps "Call mom"
      if (inTask) { add(t, section, {}); return; }
      if (inNo) return;
      const first = t.replace(/^[^A-Za-zऀ-ॿ]+/, '').split(/[\s,:]+/)[0].toLowerCase();
      const imperative = VERB_SET.has(first) || HI_VERB.test(t) || /\b(karo|karna|karein|kare|dena|lena|bhejo|bhejna|banao|banana|check karo|dekho)\b/i.test(t);
      const when = parseWhen(t, now);
      if (b.li || (imperative && when)) add(t, section, {});
    });
    linkDeps(tasks);
    scheduleAuto(tasks, now, opts);
    return { tasks, rules };
  }

  function nextSlot(from, win) {
    // win = {from, to} in hours: a learnt preferred window (default: 08:30-21:30, first slot 09:00)
    const lo = win && win.from != null ? win.from : 8.5, hi = win && win.to != null ? win.to : 21.5, start = win && win.from != null ? win.from : 9;
    let d = new Date(from);
    d.setSeconds(0, 0);
    d.setMinutes(Math.ceil(d.getMinutes() / 5) * 5);
    const h = d.getHours() + d.getMinutes() / 60;
    if (h < lo) d.setHours(Math.floor(start), (start % 1) * 60, 0, 0);
    else if (h > hi - (win && win.from != null ? 0.5 : 0)) { d = addDays(d, 1); d.setHours(Math.floor(start), (start % 1) * 60, 0, 0); }
    return d;
  }

  function scheduleAuto(tasks, now, opts) {
    opts = opts || {};
    const win = opts.win && opts.win.from != null ? opts.win : null, delay = (opts.delay || 0) * 60000;
    let cursor = nextSlot(new Date(now.getTime() + 15 * 60000 + delay), win);
    tasks.forEach(tk => {
      const w = tk.w;
      if (w && w.ts && !(w.dateOnly && w.ts < now.getTime() && w.isToday)) {
        tk.alarmAt = w.ts; tk.auto = false; tk.guessed = w.dateOnly;
      } else {
        tk.alarmAt = cursor.getTime(); tk.auto = true;
        cursor = nextSlot(new Date(cursor.getTime() + 30 * 60000), win);
      }
      delete tk.w;
    });
  }

  /* ---------- search (offline, no API) ---------- */
  const STOP = new Set((_t("a an the and or of to in on at for is are was be been it this that with as by from your you i we he she they them his her our their my me mujhe mujhko ko ka ki ke hai hain ho tha thi the ye yeh woh wo se me mein par pe aur ya kya kaise kaisa kab kahan kyun kitna kare karna karo karein batao bataye bataiye बताओ बताइए कैसे क्या है हैं का की के को से में पर और या यह वह कर करना करें करो please tell how what when where why do does did can will should would if then so not no yes just also more any all about into out up down over after before than very")).split(' '));

  function stem(w) {
    if (w.length > 5) w = w.replace(/(ing|ed|es)$/, '');
    if (w.length > 3) w = w.replace(/s$/, '');
    return w;
  }
  function tokens(s) {
    return (String(s).toLowerCase().match(/[\p{L}\p{N}₹_]+/gu) || []).map(stem).filter(w => w.length > 1 && !STOP.has(w));
  }

  function buildIndex(blocks) {
    const docs = blocks.map((b, i) => ({ i, b, tk: new Set(tokens(b.t)) }));
    const df = new Map();
    docs.forEach(d => d.tk.forEach(w => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length || 1;
    return { docs, idf: w => Math.log(1 + N / (1 + (df.get(w) || 0))) };
  }

  function search(index, query, k) {
    const q = tokens(query);
    if (!q.length) return [];
    const res = [];
    index.docs.forEach(d => {
      let s = 0, hit = 0;
      q.forEach(w => { if (d.tk.has(w)) { s += index.idf(w); hit++; } });
      if (hit) res.push({ score: s * (1 + hit / q.length), b: d.b, i: d.i });
    });
    res.sort((a, b) => b.score - a.score);
    return res.slice(0, k || 3);
  }

  function matchTask(tasks, query) {
    const q = new Set(tokens(query));
    if (!q.size) return null;
    let best = null, bs = 0;
    tasks.forEach(t => {
      const tk = tokens(t.title + ' ' + t.text);
      let s = 0;
      tk.forEach(w => { if (q.has(w)) s += 1; });
      const ts = new Set(tokens(t.title));
      ts.forEach(w => { if (q.has(w)) s += 1.5; });
      if (s > bs) { bs = s; best = t; }
    });
    return bs >= 1.5 ? best : null;
  }

  /* how-to: sub-steps from the task text + related lines from the document */
  function howTo(task, blocks) {
    const sentences = task.text.split(/(?<=[.!?।;])\s+/).map(s => s.trim()).filter(s => s.length > 3);
    const idx = buildIndex(blocks.filter(b => b.t !== task.text));
    const related = search(idx, task.title + ' ' + task.text, 4)
      .filter(r => r.score > 2.2)
      .map(r => r.b.t)
      .filter(t => t.length <= 350 && !task.text.includes(t) && !t.includes(task.text))
      .slice(0, 3);
    return { steps: sentences, related };
  }

  /* ---------- priority + dependencies ---------- */
  function priorityOf(text, section, deadline) {
    const t = text.toLowerCase();
    if (deadline || /\b(urgent|asap|immediately|critical|emergency|right now|turant|jaldi|abhi ke abhi)\b|तुरंत|अत्यावश्यक|फौरन|अभी के अभी|जल्दी/.test(t)) return 1;
    if (/\b(important|must|zaroori|zaruri|jaruri|priority|mandatory|compulsory)\b|ज़रूरी|जरूरी|महत्वपूर्ण|अनिवार्य/.test(t) || /important|urgent|priority|zaroori|ज़रूरी|जरूरी/i.test(section)) return 2;
    if (/\b(optional|whenever|if time permits|when free|someday|nice to have|later|baad me|jab time mile)\b|वैकल्पिक|कभी भी|बाद में|फुर्सत/.test(t)) return 4;
    return 3;
  }

  /* t.dep = index of the task that must be finished first (within this analysis), or null */
  function linkDeps(tasks) {
    const SEQ = /step by step|steps?\b|procedure|process|sequence|how to|kaise|क्रम|चरण/i;
    tasks.forEach((t, i) => {
      t.dep = null;
      let prev = null;
      const ex = t.text.match(/\bafter (?:step|stage) ?(\d+)\b/i) || t.text.match(/\bonce (?:step|stage) ?(\d+) is (?:done|complete|finished)\b/i) ||
        t.text.match(/(?:step|stage) ?(\d+) (?:ke baad|ke bad|के बाद)/i) || t.text.match(/(?:jab|जब) (?:step|स्टेप) ?(\d+)/i);
      if (ex) {
        for (let j = i - 1; j >= 0; j--) if (tasks[j].stepNo === +ex[1]) { prev = j; break; }
      }
      if (prev === null && t.stepNo) {
        let best = -1;
        for (let j = i - 1; j >= 0; j--) {
          if (tasks[j].section !== t.section || !tasks[j].stepNo || tasks[j].stepNo >= t.stepNo) continue;
          if (best < 0 || tasks[j].stepNo > tasks[best].stepNo) best = j;
        }
        if (best >= 0) prev = best;
      }
      if (prev === null && !t.stepNo && SEQ.test(t.section) && i > 0 && tasks[i - 1].section === t.section) prev = i - 1;
      if (prev === null && i > 0 && tasks[i - 1].section === t.section && /^\W*(then|next|after that|phir|uske baad|iske baad|इसके बाद|उसके बाद|फिर)\b/i.test(t.text)) prev = i - 1;
      if (prev !== null && prev !== i) t.dep = prev;
    });
  }

  /* runtime helpers (tasks have ids and t.dependsOn = [ids]) */
  const blockers = (t, all) => (t.dependsOn || []).map(id => all.find(x => x.id === id)).filter(x => x && !x.done);
  function wouldCycle(taskId, depId, all) {
    const seen = new Set(); const stack = [depId];
    while (stack.length) {
      const id = stack.pop(); if (id === taskId) return true;
      if (seen.has(id)) continue; seen.add(id);
      const x = all.find(y => y.id === id); if (x) (x.dependsOn || []).forEach(d => stack.push(d));
    }
    return false;
  }
  const PRI_BASE = { 1: 100, 2: 70, 3: 40, 4: 10 };
  function taskScore(t, now, blocked) {
    if (blocked) return -1000;
    let s = PRI_BASE[t.priority || 3];
    const h = (t.alarmAt - now) / 3600000;
    if (h < 0) s += 60; else if (h < 1) s += 50; else if (h < 3) s += 35; else if (h < 24) s += 25; else if (h < 48) s += 10; else s -= Math.min(20, Math.floor(h / 24));
    return s;
  }
  /* the single task Piyu recommends doing now: highest score among not-done, not-blocked tasks */
  function pickNext(all, now) {
    let best = null, bs = -Infinity;
    all.forEach(t => {
      if (t.done) return;
      const s = taskScore(t, now, blockers(t, all).length > 0);
      if (s > bs || (s === bs && best && t.alarmAt < best.alarmAt)) { best = t; bs = s; }
    });
    return bs > -1000 ? best : null;
  }
  function whyNext(t, now, lang) {
    const hi = lang !== 'en', r = [];
    r.push({ 1: hi ? _t("सबसे ज़रूरी (P1)") : 'top priority (P1)', 2: hi ? _t("ज़रूरी (P2)") : 'high priority (P2)', 3: '', 4: hi ? _t("कम ज़रूरी (P4)") : 'low priority (P4)' }[t.priority || 3]);
    const h = (t.alarmAt - now) / 3600000;
    if (h < 0) r.push(hi ? _t("समय निकल चुका है") : 'overdue'); else if (h < 1) r.push(hi ? _t("एक घंटे के अंदर") : 'within an hour'); else if (h < 3) r.push(hi ? _t("कुछ ही घंटों में") : 'in a few hours'); else if (h < 24) r.push(hi ? _t("आज") : 'today');
    r.push(hi ? _t("कोई रुकावट नहीं") : 'nothing blocks it');
    return r.filter(Boolean).join(' · ');
  }

  /* ---------- progress dashboard numbers (same definitions as db.stats in SQL, so both always agree) ---------- */
  function buildStats(tasks, now, days) {
    days = Math.max(1, days || 14);
    const nowMs = now.getTime(), today0 = startOfDay(now).getTime();
    const first = startOfDay(addDays(now, -(days - 1))).getTime();
    const series = [];
    for (let i = 0; i < days; i++) { const d0 = startOfDay(addDays(new Date(first), i)); series.push({ day0: d0.getTime(), done: 0 }); }
    const idx = new Map(series.map((x, i) => [dkey(new Date(x.day0)), i]));
    let doneRange = 0, ontime = 0, ontimeN = 0;
    tasks.forEach(t => {
      if (!t.done || !t.doneAt) return;
      const i = idx.get(dkey(new Date(t.doneAt)));
      if (i === undefined) return;
      series[i].done++; doneRange++;
      if (t.alarmAt) { ontimeN++; if (t.doneAt <= t.alarmAt + 900000) ontime++; }
    });
    const scope = tasks.filter(t => t.alarmAt >= first || (t.done && t.doneAt >= first));
    const sec = new Map();
    scope.forEach(t => { const k = t.section || '—'; const o = sec.get(k) || { section: k, total: 0, done: 0 }; o.total++; if (t.done) o.done++; sec.set(k, o); });
    const best = series.reduce((b, x) => x.done > b.done ? x : b, { done: 0, day0: null });
    return {
      days, series, doneRange, doneToday: series[series.length - 1].done,
      pendingToday: tasks.filter(t => !t.done && t.alarmAt >= today0 && t.alarmAt < today0 + 864e5).length,
      overdue: tasks.filter(t => !t.done && t.alarmAt < nowMs).length,
      onTimePct: ontimeN ? Math.round(1000 * ontime / ontimeN) / 10 : null, ontimeN,
      streak: streakDays(tasks, now), avgPerDay: Math.round(10 * doneRange / days) / 10, best,
      bySection: [...sec.values()].sort((a, b) => b.total - a.total || a.section.localeCompare(b.section)).slice(0, 8),
      totalScope: scope.length
    };
  }
  /* round axis maximum: 1,2,4,5,10,20,40,50,100 ... */
  function niceMax(v) { if (v <= 1) return 1; if (v <= 2) return 2; if (v <= 4) return 4; if (v <= 5) return 5; const p = Math.pow(10, Math.floor(Math.log10(v))); for (const m of [1, 2, 4, 5, 10]) if (v <= m * p) return m * p; return 10 * p; }

  /* ---------- quiet hours / focus / voice mood policy ---------- */
  const toMin = str => { const m = String(str || '').match(/^(\d{1,2}):(\d{2})$/); return m && +m[1] < 24 && +m[2] < 60 ? +m[1] * 60 + +m[2] : null; };
  function inQuiet(now, cfg) {
    if (!cfg || !cfg.quietOn) return false;
    const f = toMin(cfg.quietFrom), t = toMin(cfg.quietTo); if (f === null || t === null || f === t) return false;
    const cur = now.getHours() * 60 + now.getMinutes();
    return f < t ? (cur >= f && cur < t) : (cur >= f || cur < t);   // e.g. 23:00 -> 07:00 wraps past midnight
  }
  /* What may Piyu do right now?  kind: 'pre' (10-min heads-up) | 'now' (the alarm) | 'brief' (morning/night plan)
     -> { speak, chime, volume (0..1 multiplier), mood: calm|urgent|gentle, defer } ; defer=true means "not now, try again later" */
  function alertPolicy(kind, task, now, cfg, focusUntil) {
    const focus = !!focusUntil && now.getTime() < focusUntil, quiet = inQuiet(now, cfg), pri = (task && task.priority) || 3;
    const P = { speak: true, chime: true, volume: 1, mood: 'calm', defer: false };
    if (kind === 'brief') { if (focus || quiet) { P.speak = false; P.chime = false; P.defer = true; } return P; }
    if (kind === 'pre') { if (focus || quiet) { P.speak = false; P.chime = false; } return P; }
    P.mood = 'urgent';
    if (quiet && cfg.quietHard) { P.speak = false; P.chime = false; return P; }             // "hard quiet": even alarms are silent (screen + notification only)
    if (focus && pri >= 3) { P.defer = true; P.speak = false; P.chime = false; return P; }  // P3/P4 wait until focus ends
    if (quiet && pri > 1) { P.volume = 0.5; P.mood = 'gentle'; }                            // soft alarm at night; P1 stays loud
    if (focus && pri === 2) P.volume = 0.7;
    return P;
  }
  const MOODS = { calm: { sp: 1, noise: 0.6, nw: 0.6, pitch: 0 }, urgent: { sp: 0.88, noise: 0.8, nw: 0.8, pitch: 0.1 }, gentle: { sp: 1.12, noise: 0.45, nw: 0.4, pitch: -0.05 } };

  /* ---------- morning plan / night summary ---------- */
  const dkey = d => d.getFullYear() * 10000 + (d.getMonth() + 1) * 100 + d.getDate();
  function fmtHM(ts) { const d = new Date(ts); let h = d.getHours(); const ap = h >= 12 ? 'PM' : 'AM'; h = h % 12 || 12; return h + ':' + String(d.getMinutes()).padStart(2, '0') + ' ' + ap; }

  /* consecutive days (ending today, or yesterday if nothing is done yet today) with at least one finished task */
  function streakDays(tasks, now) {
    const days = new Set(tasks.filter(t => t.done && t.doneAt).map(t => dkey(new Date(t.doneAt))));
    let d = startOfDay(now); if (!days.has(dkey(d))) d = addDays(d, -1);
    let n = 0; while (days.has(dkey(d))) { n++; d = addDays(d, -1); }
    return n;
  }

  /* which brief (if any) should fire right now. cfg={on,morning:'HH:MM',night:'HH:MM'}, log={morning:key,night:key}. Catch-up window: 3 h. */
  function briefDue(cfg, log, now) {
    if (!cfg || !cfg.on) return null;
    const key = dkey(now);
    for (const kind of ['morning', 'night']) {
      const m = String(cfg[kind] || '').match(/^(\d{1,2}):(\d{2})$/); if (!m || +m[1] > 23 || +m[2] > 59) continue;
      const t = new Date(now); t.setHours(+m[1], +m[2], 0, 0);
      const diff = now.getTime() - t.getTime();
      if ((log || {})[kind] !== key && diff >= 0 && diff <= 3 * 3600000) return kind;
    }
    return null;
  }

  function buildBrief(kind, tasks, now, lang, call) {
    const hi = lang !== 'en', nowMs = now.getTime();
    const d0 = startOfDay(now).getTime(), d1 = d0 + 864e5, d2 = d1 + 864e5;
    const byAlarm = (a, b) => a.alarmAt - b.alarmAt;
    const pending = tasks.filter(t => !t.done);
    const todayP = pending.filter(t => t.alarmAt >= d0 && t.alarmAt < d1).sort(byAlarm);
    const older = pending.filter(t => t.alarmAt < d0);
    const tomorrow = pending.filter(t => t.alarmAt >= d1 && t.alarmAt < d2).sort(byAlarm);
    const doneToday = tasks.filter(t => t.done && t.doneAt >= d0 && t.doneAt < d1);
    const streak = streakDays(tasks, now);
    const c = call || (hi ? _t("सर") : 'Sir');
    const B = [], S = [];
    const data = { today: todayP.length, older: older.length, tomorrow: tomorrow.length, done: doneToday.length, streak };
    if (kind === 'morning') {
      const p1 = todayP.filter(t => (t.priority || 3) === 1).length;
      const blocked = todayP.filter(t => blockers(t, tasks).length).length;
      const top = pickNext(tasks, nowMs);
      data.p1 = p1; data.blocked = blocked;
      if (!todayP.length && !older.length) {
        B.push(hi ? _t("आज कोई काम तय नहीं है।") : 'Nothing is scheduled for today.');
        S.push(hi ? _t("{0}, आज कोई काम तय नहीं है। चाहें तो कोई document upload कर दीजिए।", [c]) : `${c}, nothing is scheduled today. You can upload a document if you like.`);
      } else {
        B.push(hi ? _t("आज {0} काम हैं{1}।", [todayP.length, (p1 ? _t(", इनमें {0} अत्यावश्यक", [p1]) : '')]) : `${todayP.length} tasks today${p1 ? `, ${p1} of them urgent` : ''}.`);
        S.push(hi ? _t("{0}, आज आपके {1} काम हैं{2}।", [c, todayP.length, (p1 ? _t(", जिनमें {0} अत्यावश्यक हैं", [p1]) : '')]) : `${c}, you have ${todayP.length} tasks today${p1 ? `, ${p1} of them urgent` : ''}.`);
        if (older.length) { B.push(hi ? _t("{0} पुराने काम अभी बाकी हैं।", [older.length]) : `${older.length} older tasks are still pending.`); S.push(hi ? _t("{0} पुराने काम भी बाकी हैं।", [older.length]) : `${older.length} older tasks are also pending.`); }
        const first = todayP.find(t => t.alarmAt >= nowMs) || todayP[0];
        if (first) { B.push(hi ? _t("पहला काम {0}: {1}", [fmtHM(first.alarmAt), first.title]) : `First at ${fmtHM(first.alarmAt)}: ${first.title}`); S.push(hi ? _t("पहला काम {0} पर है: {1}।", [fmtHM(first.alarmAt), first.title]) : `The first one is at ${fmtHM(first.alarmAt)}: ${first.title}.`); }
        if (top && (!first || top.id !== first.id)) { B.push(hi ? _t("सबसे ज़रूरी: {0}", [top.title]) : `Most important: ${top.title}`); S.push(hi ? _t("सबसे ज़रूरी काम है: {0}।", [top.title]) : `The most important one is: ${top.title}.`); }
        if (blocked) { B.push(hi ? _t("{0} काम किसी पिछले काम के इंतज़ार में हैं।", [blocked]) : `${blocked} tasks are waiting on an earlier task.`); S.push(hi ? _t("{0} काम किसी पिछले काम के पूरे होने का इंतज़ार कर रहे हैं।", [blocked]) : `${blocked} tasks are waiting for an earlier task.`); }
      }
      if (streak >= 2) { B.push(hi ? _t("🔥 लगातार {0} दिन का streak।", [streak]) : `🔥 ${streak}-day streak.`); }
      S.push(hi ? _t("हर काम से पहले मैं आपको बता दूँगी। शुभ दिन!") : 'I will remind you before each one. Have a great day!');
      return { kind, title: hi ? _t("☀ आज का प्लान") : '☀ Today\'s plan', bullets: B, speak: S.join(' '), data };
    }
    // night
    const left = todayP;
    data.left = left.length;
    B.push(hi ? _t("आज {0} काम पूरे हुए।", [doneToday.length]) : `${doneToday.length} tasks finished today.`);
    S.push(hi ? _t("{0}, आज आपने {1} काम पूरे किए।", [c, doneToday.length]) : `${c}, you finished ${doneToday.length} tasks today.`);
    if (left.length) {
      const names = left.slice(0, 3).map(t => t.title).join(hi ? '; ' : '; ');
      B.push(hi ? _t("{0} काम बाकी रह गए: {1}", [left.length, names]) : `${left.length} tasks left: ${names}`);
      S.push(hi ? _t("{0} काम बाकी रह गए हैं: {1}।", [left.length, names]) : `${left.length} tasks are left: ${names}.`);
    } else if (doneToday.length) { B.push(hi ? _t("आज का सब काम पूरा — बहुत बढ़िया! 🎉") : 'Everything for today is done — great! 🎉'); S.push(hi ? _t("आज का सारा काम पूरा हो गया। बहुत बढ़िया!") : 'Everything for today is done. Great job!'); }
    if (older.length) B.push(hi ? _t("{0} पुराने काम भी pending हैं।", [older.length]) : `${older.length} older tasks are pending.`);
    if (streak >= 2) { B.push(hi ? _t("🔥 लगातार {0} दिन का streak।", [streak]) : `🔥 ${streak}-day streak.`); S.push(hi ? _t("लगातार {0} दिन का streak चल रहा है।", [streak]) : `You are on a ${streak}-day streak.`); }
    if (tomorrow.length) {
      B.push(hi ? _t("कल {0} काम हैं, पहला {1}: {2}", [tomorrow.length, fmtHM(tomorrow[0].alarmAt), tomorrow[0].title]) : `Tomorrow: ${tomorrow.length} tasks, first at ${fmtHM(tomorrow[0].alarmAt)}: ${tomorrow[0].title}`);
      S.push(hi ? _t("कल {0} काम हैं। पहला {1} पर: {2}।", [tomorrow.length, fmtHM(tomorrow[0].alarmAt), tomorrow[0].title]) : `Tomorrow you have ${tomorrow.length} tasks. The first is at ${fmtHM(tomorrow[0].alarmAt)}: ${tomorrow[0].title}.`);
    } else { B.push(hi ? _t("कल के लिए अभी कोई काम नहीं।") : 'Nothing scheduled for tomorrow yet.'); }
    S.push(hi ? _t("शुभ रात्रि!") : 'Good night!');
    return { kind, title: hi ? _t("🌙 आज का सार") : '🌙 Today\'s summary', bullets: B, speak: S.join(' '), data };
  }

  /* ---------- links ---------- */
  function extractLinks(text) {
    const out = [], seen = new Set(), re = /\b(?:https?:\/\/|www\.)[^\s<>"'`]+/gi;
    let m;
    while ((m = re.exec(text))) {
      let u = m[0].replace(/[.,;:!?)\]}»”’]+$/, '');
      if (/^www\./i.test(u)) u = 'https://' + u;
      let url;
      try { url = new URL(u); } catch (e) { continue; }
      if (!/^https?:$/.test(url.protocol) || !url.hostname.includes('.')) continue;
      if (seen.has(url.href)) continue; seen.add(url.href);
      const path = (url.pathname + url.search).replace(/\/$/, '');
      out.push({ url: url.href, host: url.hostname.replace(/^www\./, ''), label: url.hostname.replace(/^www\./, '') + (path.length > 1 ? (path.length > 24 ? path.slice(0, 22) + '…' : path) : '') });
    }
    return out;
  }

  /* ---------- subtasks (checklist) ---------- */
  function makeSubtasks(text) {
    let t = text.replace(/^\W*(?:step|stage|phase|चरण|स्टेप)\s*\d+\s*[:.)-]\s*/i, '').replace(/\s+/g, ' ').trim();
    // enumerations inside one paragraph: "(1) a (2) b" / "1) a 2) b" / "a) x b) y"
    let parts;
    if ((t.match(/(?:^|\s)\(?\d{1,2}\)\s+\S/g) || []).length >= 2) {
      parts = t.split(/\s+(?=\(?\d{1,2}\)\s+\S)/);
      if (!/^\(?\d{1,2}\)/.test(parts[0])) parts.shift();   // a lead-in such as "Prepare:" is not a step
      parts = parts.map(x => x.replace(/^\(?\d{1,2}\)\s+/, ''));
    } else parts = t.split(/(?<=[.!?।])\s+(?=[A-Z0-9"'(₹ऀ-ॿ])|(?<=;)\s+/);
    parts = parts.map(x => x.replace(/[;]$/, '').trim()).filter(x => x.length >= 4);
    if (parts.length < 2) return [];
    return parts.slice(0, 15).map((x, i) => ({ id: 's' + i, text: x, done: false }));
  }

  /* ---------- recurring alarms ---------- */
  const DAY3 = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const HI_ROMAN = { ravi: 0, som: 1, mangal: 2, budh: 3, guru: 4, brihaspati: 4, shukr: 5, shani: 6 };
  const HI_DEV = { 'रवि': 0, 'सोम': 1, 'मंगल': 2, 'बुध': 3, 'गुरु': 4, 'शुक्र': 5, 'शनि': 6 };
  const EN_DAY_RE = '(?:sun(?:day)?|mon(?:day)?|tue(?:s|sday)?|wed(?:nesday)?|thu(?:r|rs|rsday)?|fri(?:day)?|sat(?:urday)?)';

  function parseRepeat(text) {
    const t = text.toLowerCase().replace(/\s+/g, ' ');
    let m;
    if (/\b(every|each) (week ?days?|working days?)\b|\bweekdays\b|सोमवार से शुक्रवार|\bmon(?:day)? ?(?:-|–|to) ?fri(?:day)?\b|\bsomvar se shukravar\b/.test(t)) return { type: 'weekly', every: 1, days: [1, 2, 3, 4, 5] };
    if ((m = t.match(/\bevery (\d{1,3}) ?(days?|hours?|hrs?|weeks?|months?)\b/) || t.match(/\bhar (\d{1,3}) ?(din|ghante|ghanta|hafte|mahine)\b/) || t.match(/हर (\d{1,3}) ?(दिन|घंटे|घंटा|हफ्ते|सप्ताह|महीने)/))) {
      const n = Math.max(1, +m[1]), u = m[2];
      if (/^(day|din|दिन)/.test(u)) return { type: 'daily', every: n };
      if (/^(hour|hr|ghant|घंट)/.test(u)) return { type: 'hours', every: n };
      if (/^(week|hafte|हफ्ते|सप्ताह)/.test(u)) return { type: 'weekly', every: n, days: null };
      return { type: 'monthly', every: n };
    }
    const days = new Set();
    if ((m = t.match(new RegExp('\\bevery ((?:' + EN_DAY_RE + '(?:\\b ?(?:,|and|&|/|or|\\+) ?)?)+)')))) (m[1].match(new RegExp(EN_DAY_RE, 'g')) || []).forEach(w => days.add(DAY3.indexOf(w.slice(0, 3))));
    if ((m = t.match(/\bhar ((?:(?:ravi|som|mangal|budh|guru|brihaspati|shukr|shani)var\b ?(?:,|aur|and)? ?)+)/))) (m[1].match(/(ravi|som|mangal|budh|guru|brihaspati|shukr|shani)var/g) || []).forEach(w => days.add(HI_ROMAN[w.replace('var', '')]));
    if ((m = t.match(/हर ((?:(?:रवि|सोम|मंगल|बुध|गुरु|शुक्र|शनि)वार ?(?:,|और)? ?)+)/))) (m[1].match(/(रवि|सोम|मंगल|बुध|गुरु|शुक्र|शनि)वार/g) || []).forEach(w => days.add(HI_DEV[w.replace('वार', '')]));
    if (days.size) return { type: 'weekly', every: 1, days: [...days].sort() };
    if (/\b(every ?day|everyday|each day|daily|har ?roz|roz|rozana|har din)\b|प्रतिदिन|रोज़|रोज|हर दिन|हर रोज़/.test(t)) return { type: 'daily', every: 1 };
    if (/\b(weekly|every week|each week|har hafte|har hafta)\b|हर (?:हफ्ते|सप्ताह)|साप्ताहिक/.test(t)) return { type: 'weekly', every: 1, days: null };
    if (/\b(monthly|every month|each month|har (?:mahine|maheene|mahina))\b|हर महीने|मासिक/.test(t)) return { type: 'monthly', every: 1 };
    return null;
  }

  /* First occurrence strictly after both `alarmAt` and `now`; time of day is kept from alarmAt (local time). */
  function nextOccurrence(rep, alarmAt, now) {
    if (!rep || !rep.type) return null;
    now = now == null ? Date.now() : now;
    const after = Math.max(alarmAt, now), base = new Date(alarmAt);
    const H = base.getHours(), M = base.getMinutes();
    const at = d => { const x = new Date(d); x.setHours(H, M, 0, 0); return x.getTime(); };
    const fin = ts => (ts && (!rep.until || ts <= rep.until)) ? ts : null;
    const n = Math.max(1, rep.every || 1);
    let d;
    if (rep.type === 'hours') {
      let ts = alarmAt; const step = n * 3600000;
      if (ts <= after) ts += Math.ceil((after - ts + 1) / step) * step;
      return fin(ts);
    }
    if (rep.type === 'daily') {
      d = new Date(base); d.setHours(H, M, 0, 0);
      for (let i = 0; i < 20000 && d.getTime() <= after; i++) d.setDate(d.getDate() + n);
      return fin(d.getTime());
    }
    if (rep.type === 'weekly') {
      const days = (rep.days && rep.days.length) ? rep.days : [base.getDay()];
      const wk0 = startOfDay(addDays(base, -base.getDay()));
      d = startOfDay(base);
      for (let i = 0; i < 4000; i++) {
        const ts = at(d);
        const weeks = Math.round((startOfDay(addDays(d, -d.getDay())) - wk0) / (7 * 864e5));
        if (ts > after && days.includes(d.getDay()) && weeks % n === 0) return fin(ts);
        d = addDays(d, 1);
      }
      return null;
    }
    if (rep.type === 'monthly') {
      const dom = rep.dom || base.getDate();
      for (let k = 1; k < 2400; k++) {
        const y = base.getFullYear(), mo = base.getMonth() + k * n;
        const last = new Date(y, mo + 1, 0).getDate();
        const ts = new Date(y, mo, Math.min(dom, last), H, M, 0, 0).getTime();
        if (ts > after) return fin(ts);
      }
    }
    return null;
  }

  const DAY_HI = [_t("रवि"), _t("सोम"), _t("मंगल"), _t("बुध"), _t("गुरु"), _t("शुक्र"), _t("शनि")];
  function repeatLabel(rep, lang) {
    if (!rep) return '';
    const hi = lang !== 'en', n = rep.every || 1;
    const dn = i => hi ? DAY_HI[i] : DAY3[i][0].toUpperCase() + DAY3[i].slice(1);
    if (rep.type === 'hours') return hi ? _t("हर {0} घंटे", [n]) : `every ${n} h`;
    if (rep.type === 'daily') return n === 1 ? (hi ? _t("रोज़") : 'daily') : (hi ? _t("हर {0} दिन", [n]) : `every ${n} days`);
    if (rep.type === 'monthly') return n === 1 ? (hi ? _t("हर महीने") : 'monthly') : (hi ? _t("हर {0} महीने", [n]) : `every ${n} months`);
    if (rep.type === 'weekly') {
      const ds = rep.days && rep.days.length ? rep.days : null;
      if (ds && ds.join() === '1,2,3,4,5') return hi ? _t("सोम–शुक्र") : 'weekdays';
      return (n > 1 ? (hi ? _t("हर {0} हफ्ते ", [n]) : `every ${n} wk `) : (hi ? _t("हर हफ्ते ") : 'weekly ')) + (ds ? ds.map(dn).join(', ') : '');
    }
    return '';
  }

  const api = { pdfLines, linesToBlocks, pdfGarbled, dropRepeats, parseDayRange, planAlarms, hash32, docConfidence, answersQuery, jaccard, kbFind, kbAdd, searchLinks, wakeMatch, ocrTextToBlocks, buildStats, niceMax, inQuiet, alertPolicy, MOODS, buildBrief, briefDue, streakDays, fmtHM, extractLinks, makeSubtasks, priorityOf, linkDeps, blockers, wouldCycle, taskScore, pickNext, whyNext, parseRepeat, nextOccurrence, repeatLabel, wordToBlocks, pptToBlocks, pptxToBlocks, fileToBlocks, docxXmlToBlocks, textToBlocks, zipEntry, parseWhen, analyze, buildIndex, search, matchTask, howTo, tokens };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PiyuCore = api;
})(typeof self !== 'undefined' ? self : this);
