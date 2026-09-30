#!/usr/bin/env bash
# Build dist/piyu-debug.apk.   Needs ~/piyu-android-tools (JDK 21 + Android SDK) — see plan.md / setup script.
set -euo pipefail
cd "$(dirname "$0")"
export PIYU_VC=${PIYU_VC:-$(( $(date +%s) / 60 ))}   # versionCode: minutes since 1970, always increasing
export JAVA_HOME=~/piyu-android-tools/jdk21 ANDROID_HOME=~/piyu-android-tools/sdk ANDROID_SDK_ROOT=~/piyu-android-tools/sdk
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
bash build_www.sh
sed -i "s/versionCode [0-9]*/versionCode $PIYU_VC/; s/versionName \".*\"/versionName \"1.$PIYU_VC\"/" android/app/build.gradle
npx cap sync android
python3 patch_android.py
echo "sdk.dir=$ANDROID_HOME" > android/local.properties
(cd android && ./gradlew --no-daemon assembleDebug)
mkdir -p ../dist && cp android/app/build/outputs/apk/debug/app-debug.apk ../dist/piyu-debug.apk
ls -la ../dist/piyu-debug.apk
