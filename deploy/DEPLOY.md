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


---
## Server that already runs nginx and other sites (what was actually deployed on 2026-09-30)
`deploy/deploy_nginx.sh` — used for the shared Ubuntu 22.04 VPS (2 vCPU / 8 GB, 18 other site names, Docker, PM2, MongoDB, Postgres). Nothing existing is touched:
* Piyu listens only on `127.0.0.1:8090` (systemd `piyu`, own user `piyu`, `Nice=10`, `CPUQuota=100%`, `MemoryMax=1200M`, `TasksMax=256` so it can never starve the other sites);
* its own nginx virtual hosts (`piyu-sslip`, `piyu-ai`) are *added* (config tested with `nginx -t` before a graceful `reload`; removed again if the test fails);
* free Let's Encrypt certificates via `certbot --nginx` (auto-renew timer already existed); hostnames: `ai.kvlbusinesssolutions.com` (DNS A record -> the VPS IP, set in GoDaddy) and `187-127-148-237.sslip.io`;
* the app is protected by a long random **token** in `/etc/piyu.env` (mode 600) — read it with `ssh ... "grep PIYU_TOKEN /etc/piyu.env"`; the server answers 401 without it;
* database `/var/lib/piyu/piyu.sqlite3` (seeded once from the local database, never overwritten later), nightly backup `/etc/cron.d/piyu-backup` -> `/var/backups/piyu`;
* voices on the server: Hindi, English, Bengali, Marathi, Urdu (328 MB). `ALL_VOICES=1 bash deploy/fetch_voices.sh` adds the other six (disk was 87 % full: 13 GB free at deploy time).
Update later:  `SSHPASS=... ./deploy/deploy_nginx.sh root@IP 22 ai.kvlbusinesssolutions.com` (idempotent) — or rsync the folder and `systemctl restart piyu`.
Safety checks used: a read-only baseline of every site name (HTTP + HTTPS status) and services (nginx, docker, mongod, redis, postgres, cloudflared, pm2 count) before the first change and again after every step; all identical.
Note found on that server (not caused by Piyu): the PM2 app `8rupiya` had restarted ~98,600 times and keeps restarting (nginx logs `connect() failed ... 127.0.0.1:3002`) — it gives occasional 502s; worth a look by whoever owns it.
