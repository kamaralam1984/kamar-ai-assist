#!/usr/bin/env bash
# Build a NEW Piyu APK and publish it for auto-update:  ../apk/piyu.apk + ../apk/version.json (served by server.py),
# and a copy in ~/Downloads/Piyu.apk.   Phones running the app see "नया Piyu update" and install it with one tap.
#   ./release_apk.sh                       build + publish locally
#   ./release_apk.sh user@vps:/opt/piyu    ...and also copy apk/ to the VPS (rsync over ssh)
# IMPORTANT: always build on THIS computer (same ~/.android/debug.keystore) — Android only installs an update signed by the same key.
set -euo pipefail
cd "$(dirname "$0")"
export PIYU_VC=$(( $(date +%s) / 60 ))
bash build_apk.sh
mkdir -p ../apk
cp ../dist/piyu-debug.apk ../apk/piyu.apk
SHA=$(sha256sum ../apk/piyu.apk | cut -d' ' -f1); SZ=$(stat -c %s ../apk/piyu.apk)
printf '{"versionCode": %s, "versionName": "1.%s", "sha256": "%s", "size": %s, "built": "%s"}\n' "$PIYU_VC" "$PIYU_VC" "$SHA" "$SZ" "$(date -Is)" > ../apk/version.json
mkdir -p ~/Downloads && cp ../apk/piyu.apk ~/Downloads/Piyu.apk
echo "published versionCode $PIYU_VC  ($(du -h ../apk/piyu.apk | cut -f1))"
if [ "${1:-}" != "" ]; then rsync -a ../apk/ "$1/apk/" && echo "pushed to $1/apk/"; fi
