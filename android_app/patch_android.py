"""Idempotent patches to the generated Android project: permissions, icons, notification icon."""
import os, re, subprocess, sys, tempfile
HERE = os.path.dirname(os.path.abspath(__file__)); RES = HERE + '/android/app/src/main/res'; MAN = HERE + '/android/app/src/main/AndroidManifest.xml'
m = open(MAN, encoding='utf-8').read()
perms = ['android.permission.USE_EXACT_ALARM', 'android.permission.VIBRATE', 'android.permission.POST_NOTIFICATIONS', 'android.permission.SCHEDULE_EXACT_ALARM', 'android.permission.USE_FULL_SCREEN_INTENT', 'android.permission.FOREGROUND_SERVICE', 'android.permission.FOREGROUND_SERVICE_SPECIAL_USE', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.WAKE_LOCK', 'android.permission.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS']
for p in perms:
    if p not in m:
        m = m.replace('</manifest>', '    <uses-permission android:name="%s" />\n</manifest>' % p)
if 'android:usesCleartextTraffic' not in m:
    m = m.replace('<application', '<application\n        android:usesCleartextTraffic="true"', 1)     # the Piyu server on your Wi-Fi is plain http
if 'in.piyu.assistant.PiyuService' not in m and '.PiyuService' not in m:
    m = m.replace('</application>', '''    <service android:name=".PiyuService" android:exported="false" android:foregroundServiceType="specialUse" android:stopWithTask="false">
            <property android:name="android.app.PROPERTY_SPECIAL_USE_FGS_SUBTYPE" android:value="personal assistant alarms and reminders that must keep running while the user is signed in" />
        </service>
        <receiver android:name=".BootReceiver" android:exported="true">
            <intent-filter>
                <action android:name="android.intent.action.BOOT_COMPLETED" />
                <action android:name="android.intent.action.MY_PACKAGE_REPLACED" />
                <action android:name="android.intent.action.QUICKBOOT_POWERON" />
            </intent-filter>
        </receiver>
    </application>''', 1)
open(MAN, 'w', encoding='utf-8').write(m)
# native sources (background service, boot receiver, Capacitor plugin) + register the plugin in MainActivity
import shutil
JAVA = HERE + '/android/app/src/main/java/in/piyu/assistant'
for f in ('PiyuService.java', 'BootReceiver.java', 'PiyuBackgroundPlugin.java'):
    shutil.copy(HERE + '/native_src/' + f, JAVA + '/' + f)
open(JAVA + '/MainActivity.java', 'w', encoding='utf-8').write('''package in.piyu.assistant;

import android.os.Bundle;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PiyuBackgroundPlugin.class);
        super.onCreate(savedInstanceState);
    }
}
''')
# icons: render icon.svg with headless Chrome, then resize
png = tempfile.mkdtemp() + '/icon512.png'
subprocess.run(['google-chrome', '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars', '--window-size=512,512', '--screenshot=' + png, 'file://' + HERE + '/../icon.svg'], check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
from PIL import Image, ImageDraw
src = Image.open(png).convert('RGBA')
for d, s in {'mdpi': 48, 'hdpi': 72, 'xhdpi': 96, 'xxhdpi': 144, 'xxxhdpi': 192}.items():
    os.makedirs('%s/mipmap-%s' % (RES, d), exist_ok=True)
    im = src.resize((s, s), Image.LANCZOS); im.save('%s/mipmap-%s/ic_launcher.png' % (RES, d)); im.save('%s/mipmap-%s/ic_launcher_round.png' % (RES, d)); im.save('%s/mipmap-%s/ic_launcher_foreground.png' % (RES, d))
    n = {'mdpi': 24, 'hdpi': 36, 'xhdpi': 48, 'xxhdpi': 72, 'xxxhdpi': 96}[d]           # white status-bar glyph
    os.makedirs('%s/drawable-%s' % (RES, d), exist_ok=True)
    g = Image.new('RGBA', (n, n), (0, 0, 0, 0)); dr = ImageDraw.Draw(g); dr.ellipse((n * .12, n * .12, n * .88, n * .88), fill=(255, 255, 255, 255)); dr.ellipse((n * .34, n * .30, n * .58, n * .54), fill=(255, 255, 255, 0))
    g.save('%s/drawable-%s/ic_stat_piyu.png' % (RES, d))
for f in ('mipmap-anydpi-v26/ic_launcher.xml', 'mipmap-anydpi-v26/ic_launcher_round.xml'):   # use the plain PNG icon on every Android version
    p = '%s/%s' % (RES, f)
    if os.path.exists(p): os.remove(p)
print('android project patched')
