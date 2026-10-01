"""No-token child self sign-up: a parent (already registered, real browser) generates an invite code on the Family screen; a totally fresh
child device (never had any token) picks Kids mode, is asked for that code instead of a server token, enters it, finishes the normal wizard,
and ends up signed in and already linked to the parent -- no admin approval step anywhere. Fails on any JS error."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
os.environ['PIYU_GEOIP'] = '0'
from access import Access
D = tempfile.mkdtemp(); A = Access(D)
mom = A.add('Mom')
PORT = 22000 + os.getpid() % 900
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
try:
    for _ in range(60):
        try: urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1); break
        except Exception: time.sleep(0.5)

    def route(ctx):
        ctx.route('**/*', lambda rt: rt.continue_() if rt.request.url.startswith('http://127.0.0.1:%d' % PORT) else rt.abort())
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errs.append('%s pageerror: %s' % (tag, e)))
        pg.on('console', lambda m: errs.append('%s console.error: %s' % (tag, m.text)) if m.type == 'error' and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)

    with sync_playwright() as p:
        b = p.chromium.launch()

        # ================= PARENT: an existing, already-registered account generates an invite code =================
        mctx = b.new_context(viewport={'width': 400, 'height': 800}); route(mctx)
        mctx.add_init_script("try{localStorage.setItem('piyu.device','%s')}catch(e){}" % dev(mom))
        mp = mctx.new_page(); watch(mp, 'mom'); mp.on('dialog', lambda d: d.accept())
        mp.goto('http://127.0.0.1:%d/' % PORT); mp.wait_for_timeout(2000)
        mp.evaluate("applyToken(%s)" % json.dumps(mom['token'])); mp.wait_for_timeout(1200)
        mp.evaluate('PiyuKidsParent.family()'); mp.wait_for_timeout(600)
        chk('new-child card present', mp.locator('[data-kf=pcode]').count() == 1)
        mp.click('[data-kf=pcode]'); mp.wait_for_timeout(600)
        code = mp.locator('#kfPCode b').inner_text().strip()
        chk('parent got a 6-digit invite code', len(code) == 6 and code.isdigit())

        # ================= CHILD: a totally fresh device, no token, nothing applied =================
        kctx = b.new_context(viewport={'width': 400, 'height': 800}); route(kctx)
        kctx.add_init_script("window.__PIYU_TEST_MODE='kids';")
        kp = kctx.new_page(); watch(kp, 'kid'); kp.on('dialog', lambda d: d.accept())
        kp.goto('http://127.0.0.1:%d/' % PORT); kp.wait_for_timeout(2000)
        kp.click('#modeBox [data-mode=kids]'); kp.click('#startBtn'); kp.wait_for_timeout(2200)
        chk('fresh device is asked for a parent code, NOT a server token', kp.locator('#jcIn').count() == 1 and not kp.evaluate("document.getElementById('tokDlg') && document.getElementById('tokDlg').open"))

        # a background sync failure (401, no token yet) must not pop the adult token dialog even during the brief probe spinner
        # BEFORE #jcIn/.k-wiz exist (openSignup() marks this window with window.__ovTab === 'kjoingate' throughout)
        kp.evaluate("PiyuKids.ov('<div class=\"k-center\"><div class=\"k-spin\"></div></div>', 'kjoingate', 'k-ov-solid'); askToken('token');")
        kp.wait_for_timeout(500)
        chk('token dialog stays closed during the join-gate probe window (no #jcIn/.k-wiz yet)', not kp.evaluate("document.getElementById('tokDlg').open"))
        kp.evaluate("PiyuKids.openSignup(false)"); kp.wait_for_timeout(800)
        chk('join gate is back after the probe window', kp.locator('#jcIn').count() == 1)

        kp.fill('#jcIn', '000000'); kp.click('[data-kact=jcnext]'); kp.wait_for_timeout(1200)
        chk('wrong code rejected, still on the gate', kp.locator('#jcIn').count() == 1 and kp.locator('#jcMsg').inner_text().strip() != '')
        kp.fill('#jcIn', code); kp.click('[data-kact=jcnext]'); kp.wait_for_timeout(800)
        chk('correct code moves into the normal sign-up wizard', kp.locator('.k-wiz').count() == 1 and kp.locator('#jcIn').count() == 0)

        kp.click('[data-kw=next]')
        kp.fill('#wzName', 'Aarohi'); kp.click('[data-kw=next]')
        kp.fill('#wzPin', '1234'); kp.fill('#wzPin2', '1234'); kp.click('[data-kw=next]')
        kp.click('[data-kw=locoff]'); kp.click('[data-kw=next]'); kp.click('[data-kw=next]'); kp.wait_for_timeout(2200)
        chk('child signed up and is ready', kp.evaluate('PiyuKids.K().ready === true'))
        kp.wait_for_timeout(2000)                                        # let any stale, already-queued askToken() resolve (and now no-op, since a token exists)
        chk('a real server token was issued and stored silently (no dialog ever shown)', kp.evaluate("!!S.settings.token") and kp.evaluate("document.getElementById('tokDlg') && document.getElementById('tokDlg').open") in (False, None))

        # the profile really exists server-side under that fresh token, and the parent is ALREADY linked -- no separate link step (query through
        # the page itself: the real per-device token the browser generated is only known to that page, not reconstructible from Python)
        me = kp.evaluate("PiyuKids.api('/api/kids/me')")
        chk('server has the profile under the auto-issued token', me['ok'] and me['j']['profile']['name'] == 'Aarohi')
        s, r = call(mom, 'GET', '/api/family/children'); chk('parent is already linked to the new child, with no extra step', s == 200 and any(c['name'] == 'Aarohi' for c in r['children']))
        meFull = kp.evaluate("PiyuKids.api('/api/me')")
        f = meFull['j']['features']
        chk('new account is feature-locked (no student/business/kids_av)', meFull['ok'] and f['kids'] and not f['student'] and not f['business'] and not f['kids_av'])

        # a made-up token must still be refused
        s, r = call({'name': 'x', 'token': 'not-a-real-token-at-all'}, 'GET', '/api/kids/me'); chk('a made-up token is refused', s == 401)

        chk('no JS errors on either phone', not errs)
        for e in errs[:12]: print('  ', e)
        kctx.close(); mctx.close(); b.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
print('t28kids_join_ui: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
