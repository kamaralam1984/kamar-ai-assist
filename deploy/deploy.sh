#!/usr/bin/env bash
# Deploy Piyu to a fresh Ubuntu/Debian VPS.
#   ./deploy/deploy.sh --check                       # print every step, change nothing (safe on your laptop)
#   ./deploy/deploy.sh user@your.vps.ip piyu.example.com
# Needs: ssh access with sudo on the VPS, DNS A record of the domain -> VPS IP, ports 80/443 open.
set -euo pipefail
HERE="$(cd "$(dirname "$0")/.." && pwd)"
CHECK=0; if [ "${1:-}" = "--check" ]; then CHECK=1; shift; fi
TARGET="${1:-user@your-vps}"; DOMAIN="${2:-piyu.example.com}"
step() { echo "== $*"; }
run()  { if [ "$CHECK" = 1 ]; then echo "   [dry-run] $*"; else eval "$*"; fi; }
rr()   { run "ssh -o StrictHostKeyChecking=accept-new $TARGET \"$*\""; }

step "1. copy the app (no venv, no local data, no local secrets)"
run "rsync -az --delete --exclude .venv --exclude data --exclude __pycache__ --exclude '*.pyc' --exclude .git --exclude 'voices/*.onnx' --exclude 'vendor/**/*.map' '$HERE/' $TARGET:/tmp/piyu-src/"
step "2. system packages, service user, directories"
rr "sudo apt-get update -y && sudo apt-get install -y python3-venv python3-pip caddy curl sqlite3 rsync"
rr "sudo useradd --system --home /opt/piyu --shell /usr/sbin/nologin piyu 2>/dev/null || true"
rr "sudo mkdir -p /opt/piyu /var/lib/piyu /var/backups/piyu && sudo rsync -a /tmp/piyu-src/ /opt/piyu/ && sudo chown -R piyu:piyu /opt/piyu /var/lib/piyu"
step "3. python environment + Piper"
rr "sudo -u piyu python3 -m venv /opt/piyu/.venv && sudo -u piyu /opt/piyu/.venv/bin/pip install --upgrade pip piper-tts numpy"
step "4. voices (Hindi + English female by default; ALL_VOICES=1 for the whole library)"
rr "cd /opt/piyu && sudo -u piyu env ALL_VOICES=\${ALL_VOICES:-0} bash deploy/fetch_voices.sh"
step "5. configuration (created once; NOT overwritten on later deploys)"
rr "test -f /etc/piyu.env || { sudo install -m 600 /opt/piyu/deploy/env.example /etc/piyu.env && sudo sed -i \\\"s|CHANGE-ME-long-random-string|\\\$(openssl rand -base64 24)|\\\" /etc/piyu.env; }"
step "6. systemd service + HTTPS reverse proxy"
rr "sudo install -m 644 /opt/piyu/deploy/piyu.service /etc/systemd/system/piyu.service && sudo systemctl daemon-reload && sudo systemctl enable --now piyu"
rr "sudo sed 's/piyu.example.com/$DOMAIN/' /opt/piyu/deploy/Caddyfile | sudo tee /etc/caddy/Caddyfile >/dev/null && sudo systemctl reload caddy"
step "7. nightly backup"
rr "echo '17 3 * * * root /opt/piyu/deploy/backup.sh' | sudo tee /etc/cron.d/piyu-backup >/dev/null"
step "8. done — open https://$DOMAIN , then Settings -> 'Sync token' = the PIYU_TOKEN inside /etc/piyu.env on the VPS"
echo "   show the token:  ssh $TARGET 'sudo grep PIYU_TOKEN /etc/piyu.env'"
