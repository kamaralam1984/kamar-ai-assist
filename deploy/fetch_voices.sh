#!/usr/bin/env bash
# Download the Piper voices listed in voices/catalog.json (skips files that already exist). Run on the VPS inside /opt/piyu.
set -euo pipefail
cd "$(dirname "$0")/.."; mkdir -p voices
B=https://huggingface.co/rhasspy/piper-voices/resolve/main
get() { f="voices/$2.onnx"; [ -s "$f" ] && { echo "have $2"; return; }; curl -fL --retry 3 -o "$f" "$B/$1/$2.onnx"; curl -fL --retry 3 -o "$f.json" "$B/$1/$2.onnx.json"; echo "got $2"; }
# minimum set: Hindi + English female. Add the rest only if the VPS has the RAM/disk (each ~60-75 MB on disk).
get hi/hi_IN/priyamvada/medium hi_IN-priyamvada-medium
get en/en_GB/jenny_dioco/medium en_GB-jenny_dioco-medium
if [ "${EXTRA_LANGS:-0}" = "1" ] || [ "${ALL_VOICES:-0}" = "1" ]; then
  get bn/bn_BD/google/medium bn_BD-google-medium
  get mr/mr_IN/google/medium mr_IN-google-medium
  get ur/ur_PK/aegis_female/medium ur_PK-aegis_female-medium
fi
if [ "${ALL_VOICES:-0}" = "1" ]; then
  get hi/hi_IN/pratham/medium hi_IN-pratham-medium
  get hi/hi_IN/rohan/medium hi_IN-rohan-medium
  get en/en_US/amy/medium en_US-amy-medium
  get en/en_US/ryan/medium en_US-ryan-medium
  get en/en_GB/alba/medium en_GB-alba-medium
  get en/en_GB/northern_english_male/medium en_GB-northern_english_male-medium
  get bn/bn_BD/google/medium bn_BD-google-medium
  get mr/mr_IN/google/medium mr_IN-google-medium
  get ur/ur_PK/aegis_female/medium ur_PK-aegis_female-medium
fi
