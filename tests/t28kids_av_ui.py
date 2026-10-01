"""Live mic/camera (Feature 28 add-on): the CHILD's own toggle (kids.js) and the PARENT's live view (kidsparent.js), driven in two real browsers
with fake media devices so no real mic/camera is needed. Covers: admin can't enable without agreement, child turns a switch on, the capture starts
and the unmissable red banner shows, the linked parent can open/see-or-hear it live, closing ends it and the banner disappears, the child's own
"रोको" turns the switch off server-side. Fails on any JS error."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
os.environ['PIYU_GEOIP'] = '0'
from access import Access
D = tempfile.mkdtemp(); A = Access(D)
kid, mom, stranger = A.add('Kid'), A.add('Mom'), A.add('Stranger')
PORT = 21000 + os.getpid() % 900
OWNER_TOK = 'owner-secret-token-for-test-1234567890'
env = dict(os.environ, PIYU_DATA=D, PIYU_PORT=str(PORT), PIYU_TOKEN=OWNER_TOK, PIYU_HOST='127.0.0.1', PIYU_GEOIP='0')
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = bad = 0; errs = []
def chk(n, c):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n)
def dev(u): return ('0' * 32 + u['name'].encode().hex())[-32:]
def call(u, method, path, body=None):
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={'X-Piyu-Token': u['token'], 'X-Piyu-Device': dev(u), 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=10) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def owner_call(method, path, body=None):
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={'X-Piyu-Token': OWNER_TOK, 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=10) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
PIN = '1234'
try:
    for _ in range(60):
        try: urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1); break
        except Exception: time.sleep(0.5)

    # ---- before any agreement: the owner cannot flip kids_av on for either account ----
    s, r = owner_call('POST', '/api/admin/users/%d/features' % kid['id'], {'features': {'kids_av': True}}); chk('admin blocked without agreement', s == 400 and r['error'] == 'av_agree')
    s, r = call(kid, 'POST', '/api/kids/av/agree', {}); chk('kid agrees', s == 200)
    s, r = call(mom, 'POST', '/api/kids/av/agree', {}); chk('mom agrees', s == 200)
    s, r = owner_call('POST', '/api/admin/users/%d/features' % kid['id'], {'features': {'kids_av': True}}); chk('admin enables for kid after agreement', s == 200 and r['features']['kids_av'])
    s, r = owner_call('POST', '/api/admin/users/%d/features' % mom['id'], {'features': {'kids_av': True}}); chk('admin enables for mom after agreement', s == 200 and r['features']['kids_av'])

    def route(ctx):
        ctx.route('**/*', lambda rt: rt.continue_() if rt.request.url.startswith('http://127.0.0.1:%d' % PORT) else rt.abort())
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errs.append('%s pageerror: %s' % (tag, e)))
        pg.on('console', lambda m: errs.append('%s console.error: %s' % (tag, m.text)) if m.type == 'error' and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)
    def boot(b, u, tag, extra_init=''):
        ctx = b.new_context(viewport={'width': 400, 'height': 800}, permissions=['microphone', 'camera']); route(ctx)
        ctx.add_init_script("try{localStorage.setItem('piyu.device','%s')}catch(e){}%s" % (dev(u), extra_init))
        pg = ctx.new_page(); watch(pg, tag); pg.on('dialog', lambda d: d.accept())
        pg.goto('http://127.0.0.1:%d/' % PORT); pg.wait_for_timeout(2000)
        pg.evaluate("applyToken(%s)" % json.dumps(u['token'])); pg.wait_for_timeout(1500)
        return ctx, pg

    with sync_playwright() as p:
        b = p.chromium.launch(args=['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'])

        # ================= CHILD'S PHONE =================
        kctx, kp = boot(b, kid, 'kid', "window.__PIYU_TEST_MODE='kids';")
        kp.click('#modeBox [data-mode=kids]'); kp.click('#startBtn'); kp.wait_for_timeout(2000)
        kp.click('[data-kw=next]')
        kp.fill('#wzName', 'Rani'); kp.click('[data-kw=next]')
        kp.fill('#wzPin', PIN); kp.fill('#wzPin2', PIN); kp.click('[data-kw=next]')
        kp.click('[data-kw=locoff]'); kp.click('[data-kw=next]'); kp.click('[data-kw=next]'); kp.wait_for_timeout(2000)
        chk('kid signed up', kp.evaluate('PiyuKids.K().ready === true'))
        call(kid, 'POST', '/api/kids/config', {'pin': PIN, 'config': {'bed': {'from': '00:01', 'to': '00:02'}}})   # keep the bedtime lock out of the way regardless of the real clock
        kp.evaluate("PiyuKids.K().bed = {from:'00:01', to:'00:02'}; PiyuKids.checkLock && PiyuKids.checkLock();")
        kp.wait_for_timeout(300)

        kp.click('[data-kact=avset]'); kp.wait_for_timeout(600)
        chk('av settings open, already agreed (no agree button)', kp.locator('[data-kact=avagree]').count() == 0 and kp.locator('[data-kact=avtoggle]').count() == 2)
        kp.click('[data-kact=avtoggle][data-kind=mic]'); kp.wait_for_timeout(1500)
        chk('mic capture started (no crash) and switch is on', kp.evaluate("PiyuKids && true") and kp.locator('[data-kact=avtoggle][data-kind=mic].on').count() == 1)
        kp.click('[data-kact=closeov]'); kp.wait_for_timeout(300)
        chk('banner NOT shown yet (nobody watching)', kp.locator('#kAvBanner:visible').count() == 0)
        s, r = call(kid, 'GET', '/api/kids/av'); chk('server sees mic on', s == 200 and r['mic']['on'] and not r['mic']['live'])

        s, r = call(kid, 'POST', '/api/kids/code', {'pin': PIN}); code = r.get('code'); chk('link code', s == 200 and len(code or '') == 6)

        # ================= PARENT'S PHONE =================
        mctx, mp = boot(b, mom, 'mom')
        mp.evaluate('PiyuKidsParent.family()'); mp.wait_for_timeout(600)
        mp.fill('#kfCode', code); mp.click('[data-kf=link]'); mp.wait_for_timeout(1500)
        chk('mom linked to Rani', mp.locator('.k-child').count() == 1)
        mp.click('.k-child'); mp.wait_for_timeout(1200)
        mp.click('[data-kp=tab][data-t=safe]'); mp.wait_for_timeout(600)
        chk('av card shows mic is on, listen button present', mp.locator('[data-kp=avopen][data-kind=mic]').count() == 1)
        chk('cam listen button absent (cam still off)', mp.locator('[data-kp=avopen][data-kind=cam]').count() == 0)

        mp.click('[data-kp=avopen][data-kind=mic]'); mp.wait_for_timeout(500)
        chk('live view opened', mp.locator('[data-kp=avclose]').count() == 1)

        kp.wait_for_timeout(2600)                                        # let the child push at least one real chunk and the parent poll for it
        mp.wait_for_timeout(2600)
        chk('child now shows the red "someone is watching" banner', kp.locator('#kAvBanner:visible').count() == 1 and kp.locator('#kAvBanner [data-kact=avstopall]').count() == 1)
        chk('parent is actually receiving live audio (not stale)', mp.locator('#avStale:visible').count() == 0)
        s, r = call(kid, 'GET', '/api/kids/av'); chk('server agrees it is live', s == 200 and r['mic']['live'])

        mp.click('[data-kp=avclose]'); mp.wait_for_timeout(600)
        chk('parent back on the safety tab after closing', mp.locator('[data-kp=avopen][data-kind=mic]').count() == 1)
        kp.wait_for_timeout(3600)                                        # the child's own poll notices live went false
        chk('child banner disappears once the parent stops watching', kp.locator('#kAvBanner:visible').count() == 0)

        # the child's own "रोको" on the toggle screen turns the switch fully off, server-side
        kp.click('[data-kact=avset]'); kp.wait_for_timeout(500)
        kp.click('[data-kact=avtoggle][data-kind=mic]'); kp.wait_for_timeout(500)
        s, r = call(kid, 'GET', '/api/kids/av'); chk('child turned mic back off', s == 200 and not r['mic']['on'])

        # a stranger (not linked) must not be able to open or pull, even though the switch could be on
        call(kid, 'POST', '/api/kids/av', {'mic': True})
        s, r = call(stranger, 'POST', '/api/family/child/%d/av/open' % kid['id'], {'kind': 'mic'}); chk('stranger cannot open a live session', s == 403)

        chk('no JS errors on either phone', not errs)
        for e in errs[:12]: print('  ', e)
        kctx.close(); mctx.close(); b.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
print('t28kids_av_ui: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
