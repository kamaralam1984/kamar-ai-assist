#!/usr/bin/env bash
# Deploy Piyu to a server that ALREADY runs nginx (and other apps). Nothing existing is touched: Piyu gets its own port on 127.0.0.1,
# its own system user, its own nginx virtual host, and (optionally) a free HTTPS certificate.
#   ./deploy/deploy_nginx.sh --check root@1.2.3.4 22 my.domain.or.1-2-3-4.sslip.io      # dry run: prints every step
#   SSHPASS='...' ./deploy/deploy_nginx.sh root@1.2.3.4 22 1-2-3-4.sslip.io             # password login (never written to disk)
#   ./deploy/deploy_nginx.sh root@1.2.3.4 22 1-2-3-4.sslip.io                          # key login
# Env: PIYU_PORT (default 8090)  EXTRA_LANGS=1 (default: + Bengali/Marathi/Urdu voices)  ALL_VOICES=1 (all 11 voices, ~750 MB)  SEED_DB=path (copy this SQLite DB on FIRST deploy only)
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CHECK=0; if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
TARGET="${1:?root@host}"; SSHP="${2:-22}"; HOST="${3:?domain}"; PORT="${PIYU_PORT:-8090}"
SSH=(ssh -p "$SSHP" -o StrictHostKeyChecking=accept-new -o ConnectTimeout=20 -o ServerAliveInterval=20)
RS=(rsync -az -e "ssh -p $SSHP -o StrictHostKeyChecking=accept-new")
if [ -n "${SSHPASS:-}" ]; then SSH=(sshpass -e "${SSH[@]}" -o PreferredAuthentications=password -o PubkeyAuthentication=no); RS=(sshpass -e "${RS[@]}"); fi
step() { echo "== $*"; }
rr()   { if [ "$CHECK" = 1 ]; then echo "   [dry-run] ssh $TARGET: $*"; else "${SSH[@]}" "$TARGET" "$*"; fi; }
cp_()  { if [ "$CHECK" = 1 ]; then echo "   [dry-run] rsync $*"; else "${RS[@]}" "$@"; fi; }

step "0. look before touching (read-only)"
rr "hostname; . /etc/os-release; echo \$PRETTY_NAME; nproc; free -m | sed -n 2p; df -h / | tail -1; ss -ltn | awk '{print \$4}' | grep -c ':$PORT\$' | sed 's/^/port $PORT in use (0 = free): /'; nginx -v 2>&1; ls /etc/nginx/sites-enabled"
step "1. copy the app (no venv, no local data, no test folders, no Android sources)"
cp_ --delete --exclude .venv --exclude data --exclude __pycache__ --exclude '*.pyc' --exclude .git --exclude 'voices/*.onnx' --exclude android_app --exclude dist --exclude _img --exclude _imp --exclude _h.pdf --exclude node_modules --exclude 'vendor/**/*.map' "$HERE/" "$TARGET:/tmp/piyu-src/"
step "2. packages (only what is missing), service user, folders"
rr "export DEBIAN_FRONTEND=noninteractive; apt-get update -y >/dev/null && NEEDRESTART_MODE=l NEEDRESTART_SUSPEND=1 apt-get install -y --no-install-recommends --no-upgrade python3-venv python3-pip curl sqlite3 rsync certbot python3-certbot-nginx >/dev/null"
rr "id piyu >/dev/null 2>&1 || useradd --system --home /opt/piyu --shell /usr/sbin/nologin piyu; mkdir -p /opt/piyu /var/lib/piyu /var/backups/piyu && rsync -a /tmp/piyu-src/ /opt/piyu/ && chown -R piyu:piyu /opt/piyu /var/lib/piyu"
step "3. python environment + Piper (voices are downloaded on the server itself)"
rr "test -x /opt/piyu/.venv/bin/python || sudo -u piyu python3 -m venv /opt/piyu/.venv; sudo -u piyu /opt/piyu/.venv/bin/pip install -q --upgrade pip piper-tts numpy"
rr "cd /opt/piyu && sudo -u piyu env ALL_VOICES=${ALL_VOICES:-0} EXTRA_LANGS=${EXTRA_LANGS:-1} bash deploy/fetch_voices.sh"
if [ -n "${SEED_DB:-}" ]; then step "3b. first deploy only: seed the database"; if [ "$CHECK" = 1 ]; then echo "   [dry-run] copy $SEED_DB -> /var/lib/piyu/piyu.sqlite3 if it does not exist yet"; else "${RS[@]}" "$SEED_DB" "$TARGET:/tmp/piyu-seed.sqlite3"; "${SSH[@]}" "$TARGET" "test -f /var/lib/piyu/piyu.sqlite3 || { install -o piyu -g piyu -m 600 /tmp/piyu-seed.sqlite3 /var/lib/piyu/piyu.sqlite3; echo seeded; }; rm -f /tmp/piyu-seed.sqlite3"; fi; fi
step "4. configuration (created once, never overwritten)"
rr "test -f /etc/piyu.env || { install -m 600 /opt/piyu/deploy/env.example /etc/piyu.env && sed -i \"s|CHANGE-ME-long-random-string|\$(openssl rand -base64 24 | tr -d '/+=')|; s|^PIYU_PORT=.*|PIYU_PORT=$PORT|\" /etc/piyu.env; echo created /etc/piyu.env; }"
step "5. systemd service"
rr "install -m 644 /opt/piyu/deploy/piyu.service /etc/systemd/system/piyu.service && systemctl daemon-reload && systemctl enable --now piyu && sleep 4 && systemctl is-active piyu && curl -s http://127.0.0.1:$PORT/api/health"
step "6. nginx virtual host for $HOST (added next to your existing sites; config is tested before reload; rolled back on error)"
rr "sed 's/HOST/$HOST/; s/PORT/$PORT/' /opt/piyu/deploy/nginx-piyu.conf > /etc/nginx/sites-available/piyu && ln -sf /etc/nginx/sites-available/piyu /etc/nginx/sites-enabled/piyu && { nginx -t && systemctl reload nginx; } || { rm -f /etc/nginx/sites-enabled/piyu; echo 'nginx test failed: piyu vhost removed, nothing changed'; exit 1; }"
step "7. free HTTPS certificate (Let's Encrypt) — needs $HOST to resolve to this server and port 80 open"
rr "certbot --nginx -d $HOST --non-interactive --agree-tos --register-unsafely-without-email --redirect && nginx -t && systemctl reload nginx"
step "8. nightly backup"
rr "echo '17 3 * * * root /opt/piyu/deploy/backup.sh' > /etc/cron.d/piyu-backup"
step "9. verify"
rr "curl -s -o /dev/null -w 'https: %{http_code}\n' https://$HOST/api/health; grep '^PIYU_TOKEN' /etc/piyu.env | sed 's/=.*/=(hidden)/'"
echo "   Sync token:  ssh -p $SSHP $TARGET \"grep PIYU_TOKEN /etc/piyu.env\""
