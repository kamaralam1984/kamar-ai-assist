# Piyu ko VPS par chalana

Ye guide maanti hai: Ubuntu/Debian VPS (2 vCPU, **2 GB RAM** kaafi hai), aapka ek domain, aur VPS par `sudo` wala ssh access.

## Zaroori baatein (pehle padhein)
* **HTTPS zaroori hai.** Browser bina HTTPS ke mic ("Hey Piyu", voice input), notification, PWA install aur service worker nahi chalne deta. Caddy apne aap HTTPS certificate laga deta hai.
* **Token zaroori hai.** Public server par Piyu bina `PIYU_TOKEN` ke chalne se inkaar kar deta hai. Har naye device par Settings → "Sync token" mein wahi token daalna hoga.
* **RAM:** har awaaz ~150–300 MB leti hai. `PIYU_MAX_VOICES=2` rakhein. Local AI (Ollama) chhote VPS par mat chalayein.
* Data ek hi file mein hai: `/var/lib/piyu/piyu.sqlite3`. Roz raat 3:17 par backup (`deploy/backup.sh`) chalta hai.

## Kadam
1. **DNS:** domain ka A record VPS ke IP par lagayein. Ports 80 aur 443 khule hon.
2. **Deploy:** apne computer se:
   ```bash
   ./deploy/deploy.sh --check                        # pehle dekhein ye kya-kya karega (kuch badalta nahi)
   ./deploy/deploy.sh ubuntu@VPS_IP piyu.aapka-domain.in
   ALL_VOICES=1 ./deploy/deploy.sh ubuntu@VPS_IP piyu.aapka-domain.in   # saari awaazein (Hindi/English purush-mahila, bn/mr/ur)
   ```
3. **Token dekhein:** `ssh ubuntu@VPS_IP 'sudo grep PIYU_TOKEN /etc/piyu.env'`
4. `https://piyu.aapka-domain.in` kholein → **Settings → Sync token** mein token daalein → ho gaya.
5. Phone par: Chrome menu → "Install app". Purane data ko laane ke liye laptop par Settings → "Backup lein", VPS wale Piyu mein "Backup wapas laayein".

## Update karna
Bas `./deploy/deploy.sh ubuntu@VPS_IP piyu.aapka-domain.in` dobara chalayein. `/etc/piyu.env` (aapka token/settings) aur database **nahi badalte**.

## Jaanchne ke liye
```bash
curl https://piyu.aapka-domain.in/api/health            # {"ok": true, ...}
ssh ubuntu@VPS_IP 'sudo systemctl status piyu --no-pager'
ssh ubuntu@VPS_IP 'sudo journalctl -u piyu -n 50 --no-pager'
```

## Ye test hua hai / ye nahi
* Test hua (laptop par): server public-bind par token ke bina start nahi hota; `/api` aur `/tts` bina token 401; `/tts` par rate-limit; `data/`, `voices/`, `server.py`, `deploy/` 404; `deploy.sh --check`, bash syntax; SQLite backup script.
* **Asli VPS par abhi tak nahi chalaya** (mere paas aapka VPS nahi hai) — isliye pehli baar deploy karte waqt `deploy.sh --check` ka output dhyaan se dekhein, aur kuch alag dikhe to `journalctl` ka output bhejein.
