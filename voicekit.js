/* Piyu voice kit: speaking styles (andaaz), situational moods, personas and gender-correct Hindi. Pure logic, browser + Node. */
(function (root) {
  'use strict';

  /* Speaking styles: base speed (Piper length_scale, higher = slower), expressiveness (noise, nw) and pitch in semitones */
  const STYLES = {
    normal:    { name: 'सामान्य', desc: 'रोज़मर्रा की स्वाभाविक आवाज़', sp: 1.00, noise: 0.60, nw: 0.60, st: 0 },
    soft:      { name: 'मुलायम', desc: 'धीमी, नरम और सुकून देने वाली', sp: 1.10, noise: 0.45, nw: 0.45, st: -0.5 },
    cheerful:  { name: 'खुशमिज़ाज', desc: 'चहकती, थोड़ी तेज़ और ऊँची', sp: 0.94, noise: 0.75, nw: 0.80, st: 1.2 },
    serious:   { name: 'गंभीर', desc: 'ठहरी हुई, भारी और संजीदा', sp: 1.08, noise: 0.40, nw: 0.40, st: -1.2 },
    story:     { name: 'कहानी सुनाने वाला', desc: 'धीमा, उतार-चढ़ाव वाला अंदाज़', sp: 1.18, noise: 0.80, nw: 0.90, st: 0 },
    energetic: { name: 'जोशीला', desc: 'तेज़ और जोश से भरा', sp: 0.86, noise: 0.80, nw: 0.80, st: 0.8 },
    night:     { name: 'रात की फुसफुसाहट', desc: 'बहुत धीमी और शांत', sp: 1.25, noise: 0.30, nw: 0.30, st: -0.8 }
  };
  /* situational moods change the style a little (multiplier on speed, additions on the rest) */
  const MOOD = {
    calm:   { sp: 1.00, noise: 0.00, nw: 0.00, st: 0.0 },
    urgent: { sp: 0.88, noise: 0.20, nw: 0.20, st: 0.3 },
    gentle: { sp: 1.12, noise: -0.15, nw: -0.20, st: -0.3 },
    cheerful: { sp: 0.95, noise: 0.15, nw: 0.15, st: 0.8 }
  };
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));

  /* -> { speed, noise, nw, pitch } ready for /tts.   learned = {sp, noise, st} deltas Piyu has learnt for this situation */
  function voiceParams(style, mood, rate, stOffset, learned) {
    const s = STYLES[style] || STYLES.normal, m = MOOD[mood] || MOOD.calm, l = learned || {};
    const speed = clamp(s.sp * m.sp * (1 + (l.sp || 0)) / (rate || 1), 0.7, 1.6);
    return {
      speed: +speed.toFixed(2),
      noise: +clamp(s.noise + m.noise + (l.noise || 0), 0.2, 0.95).toFixed(2),
      nw: +clamp(s.nw + m.nw + (l.noise || 0), 0.2, 0.95).toFixed(2),
      pitch: +clamp(s.st + m.st + (stOffset || 0) + (l.st || 0), -5, 5).toFixed(2)
    };
  }

  /* Personas = voice + style bundles */
  const PERSONAS = [
    { id: 'piyu',   name: 'Piyu', tag: 'मुलायम महिला', hi: 'hi-priyamvada', en: 'en-jenny', style: 'normal', st: 0 },
    { id: 'priya',  name: 'Priya', tag: 'खुशमिज़ाज महिला', hi: 'hi-priyamvada', en: 'en-amy', style: 'cheerful', st: 0.5 },
    { id: 'kahani', name: 'Kahaniwali', tag: 'कहानी सुनाने वाली', hi: 'hi-priyamvada', en: 'en-alba', style: 'story', st: 0 },
    { id: 'aarav',  name: 'Aarav', tag: 'शांत पुरुष', hi: 'hi-pratham', en: 'en-ryan', style: 'normal', st: 0 },
    { id: 'rohan',  name: 'Rohan', tag: 'जोशीला पुरुष', hi: 'hi-rohan', en: 'en-northern', style: 'energetic', st: 0 },
    { id: 'guru',   name: 'Guru', tag: 'गंभीर पुरुष', hi: 'hi-pratham', en: 'en-northern', style: 'serious', st: -0.5 }
  ];

  /* Hindi first-person feminine -> masculine, for a male voice. Only forms Piyu actually uses about herself. */
  const MASC = [
    [/(ू|ऊ)(ँ|ं)गी/g, '$1$2गा'],                        // करूँगी / बताऊँगी / दूँगी / दिलाऊँगी  -> ...गा
    [/(रही|रहीं)(\s+)(हूँ|हूं|थी)/g, (m, a, sp, c) => 'रहा' + sp + (c === 'थी' ? 'था' : c)],
    [/([ा-ौ])ती(\s+)(हूँ|हूं)/g, '$1ता$2$3'],
    [/([क-ह])ती(\s+)(हूँ|हूं)/g, '$1ता$2$3'],
    [/सकती/g, 'सकता'], [/चाहती/g, 'चाहता'],
    [/समझी(\s+)नहीं/g, 'समझा$1नहीं'],
    [/नहीं(\s+)पाई/g, 'नहीं$1पाया'],
    [/सुनती(\s+)रहेगी/g, 'सुनता$1रहेगा'], [/सुनती(\s+)रहूँगी/g, 'सुनता$1रहूँगा'],
    [/मैं(\s+)(.{0,20}?)गई(\s+)हूँ/g, 'मैं$1$2गया$3हूँ']
  ];
  function genderize(text, gender) {
    if (gender !== 'male' || !text) return text;
    return MASC.reduce((t, [re, to]) => t.replace(re, to), String(text));
  }

  const api = { STYLES, MOOD, PERSONAS, voiceParams, genderize };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.VK = api;
})(typeof self !== 'undefined' ? self : this);
