#!/usr/bin/env node
/* Build a fine-tuning dataset (JSONL, chat format) from YOUR OWN documents, using Piyu's study engine (study.js) — free, offline.
   usage:  node finetune/make_dataset.js state.json [max=900] > finetune/dataset.jsonl
   state.json = export of your Piyu state (GET /api/state with your token -> .state), or any JSON {docs:[{name,blocks:[{k,t}]}]}.
   Every record = what the server sends to the model (system + excerpts + question) -> a short, grounded, spoken-style answer,
   plus "not in the document" refusals so the model learns not to invent. */
const fs = require('fs'), path = require('path');
const SY = require(path.join(__dirname, '..', 'study.js'));
const file = process.argv[2], max = +process.argv[3] || 900;
if (!file) { console.error('usage: node finetune/make_dataset.js state.json [max]'); process.exit(1); }
let st = JSON.parse(fs.readFileSync(file, 'utf8')); st = st.state || st;
const SYSTEM = 'You are Piyu, a calm, respectful Indian personal assistant and teacher. Speak natural, simple Hindi, Hinglish or Indian English like a friendly colleague, in short spoken sentences with no markdown or emojis. Answer only from the given document excerpts and tasks; if the answer is not there, say so. Keep every name, number and date exactly as written.';
const r = SY.rng(42), pick = a => a[Math.floor(r() * a.length)];
const hasDev = s => /[ऀ-ॿ]/.test(s);
const WRAP = {
  hi: [t => 'जी, दस्तावेज़ के हिसाब से ' + t, t => 'सीधी बात यह है कि ' + t, t => 'ध्यान से सुनिए। ' + t],
  en: [t => 'According to the document, ' + t.charAt(0).toLowerCase() + t.slice(1), t => 'Simply put: ' + t, t => 'Here is what it says. ' + t]
};
const NOTFOUND = { hi: ['यह जानकारी दस्तावेज़ में नहीं मिली, इसलिए मैं अंदाज़ा नहीं लगाऊँगी।', 'दस्तावेज़ में इसका ज़िक्र नहीं है।'], en: ['I could not find this in the document, so I will not guess.', 'The document does not mention this.'] };
const out = [];
const push = (excerpts, q, a) => out.push({ messages: [{ role: 'system', content: SYSTEM }, { role: 'user', content: 'DOCUMENT EXCERPTS:\n' + excerpts.map((e, i) => '[' + (i + 1) + '] ' + e).join('\n') + '\n\nQUESTION: ' + q }, { role: 'assistant', content: a }] });
(st.docs || []).forEach(d => {
  const blocks = d.blocks || []; if (!blocks.length) return;
  const chs = SY.chaptersFromBlocks(blocks, { minChars: 300 }), chapters = chs.map(c => ({ id: c.id, title: c.title, text: SY.chapterText(blocks, c) })), pool = SY.buildPool('ft', chapters);
  const allSents = pool.sents.map(x => x.s);
  const ctx = (own) => { const ex = [own]; for (let i = 0; i < 2; i++) ex.push(pick(allSents)); return ex.sort(() => r() - 0.5).map(s => s.slice(0, 400)); };
  [2, 5].forEach(m => SY.make(pool, m, 60, r).forEach(q => {
    const lang = hasDev(q.model) ? 'hi' : 'en', sents = SY.splitSentences(q.model), ans = sents.slice(0, m === 2 ? 1 : 3).join(' ');
    push(m === 2 ? ctx(sents[0] || ans) : sents.slice(0, 4).concat([pick(allSents)]).map(s => s.slice(0, 400)), q.q, pick(WRAP[lang])(ans));
  }));
  SY.make(pool, 1, 80, r).forEach(q => { if (!q.src) return; const lang = hasDev(q.src) ? 'hi' : 'en'; push(ctx(q.src), (lang === 'hi' ? 'इसका सही उत्तर क्या है? ' : 'What is the right answer? ') + q.q.replace(/^(Fill in the blank:|रिक्त स्थान भरिए:)\s*/, ''), pick(WRAP[lang])(q.options[q.answer] + (lang === 'hi' ? ' है।' : '.')) ); });
  // refusals: a question about something else, excerpts unrelated
  for (let i = 0; i < 25; i++) { const lang = hasDev(allSents[0] || '') ? 'hi' : 'en'; push([pick(allSents), pick(allSents)].map(s => s.slice(0, 400)), lang === 'hi' ? pick(['कल मौसम कैसा रहेगा?', 'भारत की राजधानी की आबादी कितनी है?', 'इसकी कीमत कितनी है?']) : pick(['What will the weather be tomorrow?', 'Who won the last cricket match?', 'What is the price of this?']), pick(NOTFOUND[lang])); }
});
out.sort(() => r() - 0.5);
out.slice(0, max).forEach(o => console.log(JSON.stringify(o)));
console.error('records:', Math.min(out.length, max), '(of', out.length + ')');
