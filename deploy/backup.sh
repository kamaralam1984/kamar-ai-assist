#!/usr/bin/env bash
# Consistent SQLite backup (safe while Piyu is running). Cron example:  17 3 * * *  /opt/piyu/deploy/backup.sh
set -euo pipefail
DATA="${PIYU_DATA:-/var/lib/piyu}"; OUT="${1:-/var/backups/piyu}"; mkdir -p "$OUT"
STAMP="$(date +%Y%m%d-%H%M)"
python3 - "$DATA/piyu.sqlite3" "$OUT/piyu-$STAMP.sqlite3" <<'PY'
import sqlite3, sys
src = sqlite3.connect(sys.argv[1]); dst = sqlite3.connect(sys.argv[2]); src.backup(dst); dst.close(); src.close()
PY
gzip -f "$OUT/piyu-$STAMP.sqlite3"
find "$OUT" -name 'piyu-*.sqlite3.gz' -mtime +30 -delete
echo "backup: $OUT/piyu-$STAMP.sqlite3.gz"
