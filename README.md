# Piyu — aapki personal assistant

Document (PDF, Word, PowerPoint, text, **photo/scanned**) upload karein → Piyu usme se kaam, samay aur niyam nikaalti hai, **alarm** lagaati hai, samay se pehle **bolkar** batati hai, aur poochhne par "kaise karna hai" samjhati hai. Koi paid API nahi.

## Chalana
```bash
./run.sh            # http://localhost:8080  (sirf aapke computer par)
./run.sh --lan      # doosre device (phone) se bhi; token console mein dikhega
```
Pehli baar: "Piyu ko jagayein" dabayein (browser ko awaaz chalane ke liye ek tap chahiye). Chrome/Edge behtar hain.

## Kya-kya hai
| | |
|---|---|
| **Documents** | PDF, DOC/DOCX, PPT/PPTX, TXT/MD/CSV/HTML/RTF, photo aur camera, scanned PDF (OCR, Hindi+English, offline) |
| **Kaam** | samay/tarikh apne aap, priority, "pehle ye phir wo" dependencies, roz/hafte/mahine ke repeat, checklist aur **Guide mode** (ek-ek step bolkar) |
| **Alarm** | 10 min pehle (badal sakte hain) + samay par, snooze, Focus mode, Quiet hours, subah ka plan / raat ka saar, Calendar (.ics) export |
| **Awaaz** | apni offline neural awaaz (Piper): Hindi/English, **mahila aur purush**, 7 andaaz, 6 persona, Hinglish (Roman Hindi) sahi padhna, "Hey Piyu" bolkar jagana |
| **Piyu ka Mind** | aapke bolne ka andaaz, bhaav aur aadatein seekhti hai, usi andaaz mein jawab deti hai, sawaal poochhti hai, awaaz ka lehja aapke hisaab se sudhaarti hai — sab dikhta, badalta aur mitta sakte hain |
| **Jawab kahan se** | pehle aapke documents → phir Piyu ki seekhi hui yaaddaasht → phir (aapke chaahne par) muft internet khoj (Wikipedia/DuckDuckGo) → warna Google/ChatGPT ke "khol" buttons |
| **Local AI** | Ollama ho to khule sawaalon ke jawab wahi banata hai (optional) |
| **Data** | Python + SQLite backend, IndexedDB, device-se-device sync, backup/restore |
| **Progress** | dashboard: roz kitne kaam hue, streak, samay par %, section-wise |

## Live server
https://ai.kvlbusinesssolutions.com (Sync token chahiye) · APK: https://ai.kvlbusinesssolutions.com/apk/piyu.apk · deploy ka tareeka: `deploy/DEPLOY.md`

## Bhashayein
Hindi (Hinglish) · English · বাংলা · मराठी · اردو — Settings → भाषा. Poori UI, Piyu ki bolti awaaz (har bhasha ki apni neural awaaz), phone-alarm ka text aur photo se text (OCR) — sab chuni hui bhasha mein; Urdu right-to-left. Common commands (aaj/kal/abhi kya karna hai/niyam/ho gaya/focus/…) teeno nayi bhashaon mein samajhti hai. Translations machine-written hain — kisi native speaker se ek baar check karwa lein.

## Android app (APK)
`android_app/release_apk.sh` → `apk/piyu.apk` (aur `~/Downloads/Piyu.apk`). Phone mein install karein → **Login** (optional PIN) → Settings mein "Piyu server" ka address (`http://<PC-ya-VPS>:8080`) daalein.
- Login ke baad Piyu **background mein chalti rehti hai** (foreground service + phone restart ke baad apne aap wapas) — Logout dabane tak. App band/swipe karne par bhi alarm bajte hain.
- Settings ka 🔋 button dabakar "unrestricted battery" allow karein (Xiaomi/Oppo/Vivo par zaroori). *Force stop* karne par Android sab rok deta hai.
- Naya version banate hi `release_apk.sh` chalayein: phone ke Piyu mein "🆕 naya Piyu — Update" dikhega, ek tap se install (Android silent install nahi karne deta; hamesha isi computer par build karein, warna signature nahi milega).

## Files
`server.py` (backend) · `db.py` (SQL) · `web.py` (muft web khoj, SSRF-safe) · `core.js` (documents padhna/kaam nikalna) · `app.js` (screen) · `mind.js` (yaaddaasht/seekhna) · `translit.js` (Hinglish) · `voicekit.js` (awaaz) · `ocr.js` · `store.js` · `vendor/` (pdf.js, Tesseract) · `voices/` (Piper) · `deploy/` (VPS kit) · `plan.md` (poori yojana + har feature ka test-natija).

## Honest seemayein
* Browser mein alarm tab bajta hai jab Piyu ka tab khula ho. Band hone par bhi bajane ke liye Android app (login ke baad background service) ya Calendar export.
* "Hey Piyu" Chrome ki speech service se chalta hai (jahan on-device milta hai wahan offline). Asli awaaz/shor mein pehchan tested nahi.
* Seekhna machine-learning nahi, saade aankde + niyam hain; galat samajh sakti hai — isliye sab dikhta aur badalne layak hai.
* Google/ChatGPT ki muft official API nahi hai, isliye unhe seedha nahi bulaate.
* Bengali/Marathi/Urdu ki translations machine-written hain (native speaker review baaki); emotion/aadat seekhna, "Hey Piyu" aur task-samay ki pehchan Hindi/Hinglish/English mein hi hai.
* Android: koi bhi app "100% kabhi band nahi" ki guarantee nahi de sakti — Force stop ya aggressive battery-saver rok sakta hai (Settings ka 🔋 button dekhein). Login sirf is phone ka local login hai.
* VPS par asli deploy abhi aapke check karne ke liye baaki hai (`deploy/DEPLOY.md`).
# kamar-ai-assist


## Docker (optional)
```bash
echo "PIYU_TOKEN=$(openssl rand -base64 24)" > .env      # your owner token / admin password
bash deploy/fetch_voices.sh                              # downloads the Piper voices into ./voices
docker compose up -d                                     # http://127.0.0.1:8080  (admin: /admin)
```
The container is read-only, runs as a non-root user with all capabilities dropped, keeps its data in the `piyu-data` volume and has a health check. Put nginx/Caddy in front for HTTPS. Local AI (Ollama) on the host is reached through `PIYU_OLLAMA` (default `http://host.docker.internal:11434`).

## Admin panel
Open `/admin` and enter the owner token (`PIYU_TOKEN`). Create/approve users, set or change passwords, switch features on/off per user, see who is online and from which country, how long each user stayed on each page, student progress, server health, security events and the audit log. `PIYU_GEOIP=0` turns the country lookup off; `PIYU_TZ_MIN` sets the day boundary (default 330 = India).

## Kids mode (bachchon ke liye, free)
Start screen par **👶 Kids** chuniye. Mata-pita 2 minute me setup karte hain: bachche ka naam / umar / class / avatar, 4 ank ka **Parent PIN**, aur (chahein to) 📍 location safety.

- **Aaj**: roz ka routine (uthna, brush, school, homework, khel, so jao) alarm + halki awaaz ke saath; "ho gaya" par ⭐ star, level, streak, badge, avatar sajana (sirf stars se, paisa nahi).
- **Seekho** (11 paath + speak-and-check + quiz), **Khelo** (9 chhote khel), **Kahani** (8 kahaniyan, awaaz me, saath me shabd chamakte hain), **Homework photo** (OCR + safe local AI).
- **Parent panel** (PIN ke peeche): report, 7 din ka chart, kamzor topic, routine / time limit / bedtime lock badalna, message, data export / delete.
- **Family** (Settings → Family): apne phone se bachche ko 6 ank ke code se jodein; report, alerts ("school pahuncha / nikla", late, location band, 🆘 SOS) aur naksha apne phone par.
- **Naksha** free: built-in radar (bina internet) ya OpenStreetMap (sirf tab load hota hai jab parent map khole).
- **Privacy**: location sirf parent ki sahmati se, bachche ki screen par hamesha "📍 location chalu" dikhta hai, sirf parent dekh sakta hai (Admin ko sirf on/off), 7 din baad apne-aap mit jaati hai. Bachche ke liye chat / links / khula internet nahi; AI sirf padhai-kahani.
- **Admin**: Kids ko `kids` switch se on/off kar sakte hain.
- Android (naya APK chahiye): `PiyuFamilyService` location bhejti hai (sirf sahmati ON hone par) aur parent ke phone par alerts laati hai, app band hone par bhi.
- Tests: `t28kids_py.py`, `t28kids_api.py`, `t28kids_ui*.js`, `t28kids_fam.js`.
