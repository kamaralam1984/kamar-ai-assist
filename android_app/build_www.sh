#!/usr/bin/env bash
# Copy the web app (no server files, no voices, no data) into android_app/www for Capacitor.
set -euo pipefail
cd "$(dirname "$0")"; SRC=..
rm -rf www; mkdir -p www/vendor/ocr/lang
for f in index.html style.css app.js core.js store.js ocr.js translit.js voicekit.js mind.js media.js i18n.js native.js manifest.webmanifest icon.svg; do cp "$SRC/$f" "www/$f"; done
mkdir -p www/i18n; cp "$SRC"/i18n/pack.*.js www/i18n/
cp "$SRC/vendor/pdf.min.mjs" "$SRC/vendor/pdf.worker.min.mjs" www/vendor/
cp "$SRC"/vendor/ocr/*.js www/vendor/ocr/ ; cp "$SRC"/vendor/ocr/lang/* www/vendor/ocr/lang/
# app version (monotonic, minutes since epoch) so the app can tell when the server has a newer APK
echo "window.PIYU_APP_VC=${PIYU_VC:-1}; window.PIYU_DEFAULT_SERVER='${PIYU_SERVER:-}';" > www/appver.js
sed -i 's#<script src="native.js"></script>#<script src="appver.js"></script><script src="native.js"></script>#' www/index.html
grep -q 'native.js' www/index.html || { echo "index.html does not load native.js"; exit 1; }
echo "www ready: $(du -sh www | cut -f1)"
