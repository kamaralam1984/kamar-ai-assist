"""Parent mode: a first-class 4th card (Business/Student/Parent/Child) with its own home/alerts/settings tabs — a dashboard of linked children,
not a popup buried in Settings. The per-child deep-dive (report/safety+map/routine/messages/settings) is the same tested overlay as before,
just reached from a card here. Fails on any JS error."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
os.environ['PIYU_GEOIP'] = '0'
from access import Access
D = tempfile.mkdtemp(); A = Access(D)
kid, kid2, mom = A.add('Kid'), A.add('Kid2'), A.add('Mom')
PORT = 24000 + os.getpid() % 900
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
    call(kid, 'POST', '/api/kids/profile', {'name': 'Rani', 'age': 8, 'cls': '3', 'avatar': '🦁', 'newPin': '1234'})
    s, r = call(kid, 'POST', '/api/kids/code', {'pin': '1234'}); code = r['code']
    call(kid2, 'POST', '/api/kids/profile', {'name': 'Tani', 'age': 6, 'cls': '1', 'avatar': '🐯', 'newPin': '1234'})
    s, r = call(kid2, 'POST', '/api/kids/code', {'pin': '1234'}); code2 = r['code']
    with sync_playwright() as p:
        b = p.chromium.launch()
        ctx = b.new_context(viewport={'width': 400, 'height': 800})
        ctx.add_init_script("try{localStorage.setItem('piyu.device','%s')}catch(e){}" % dev(mom))
        pg = ctx.new_page()
        pg.on('dialog', lambda d: d.accept())
        pg.on('pageerror', lambda e: errs.append('pageerror: %s' % e))
        pg.on('console', lambda m: errs.append('console.error: %s' % m.text) if m.type == 'error' and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)
        pg.goto('http://127.0.0.1:%d/' % PORT); pg.wait_for_timeout(1800)
        pg.evaluate("applyToken(%s)" % json.dumps(mom['token'])); pg.wait_for_timeout(1000)

        chk('mode chooser has exactly 4 cards', pg.locator('#modeBox .modeCard').count() == 4)
        order = [pg.locator('#modeBox .modeCard').nth(i).get_attribute('data-mode') for i in range(4)]
        chk('cards are Business, Student, Parent, Child in that order', order == ['business', 'student', 'parent', 'kids'])

        pg.click('#modeBox [data-mode=parent]'); pg.click('#startBtn'); pg.wait_for_timeout(1800)
        chk('entering Parent shows the parent theme + badge', pg.evaluate("document.body.dataset.mode") == 'parent' and 'Parent' in pg.locator('#modeBadge').inner_text())
        chk('nav has होम/अलर्ट/सेटिंग, not Business or Child tabs', pg.locator('nav [data-tab=phome]').count() == 1 and pg.locator('nav [data-tab=home]').count() == 0 and pg.locator('nav [data-tab=khome]').count() == 0)
        chk('empty dashboard shows add-child cards, no child yet', pg.locator('[data-pd=pcode]').count() == 1 and pg.locator('.p-card').count() == 0)

        pg.fill('#pdCode', code); pg.click('[data-pd=link]'); pg.wait_for_timeout(1500)
        chk('linking a real child shows it on the dashboard', pg.locator('.p-card').count() == 1 and 'Rani' in pg.locator('.p-card').inner_text())
        pg.click('.p-card'); pg.wait_for_timeout(1000)
        chk('tapping the card opens the full child panel (report/safety/routine/msg/settings)', pg.locator('.k-tabs.pp button').count() == 5)
        pg.click('[data-kp=close]'); pg.wait_for_timeout(500)
        chk('closing the child panel returns to the dashboard, not a blank screen', pg.locator('.p-card').count() == 1)

        pg.click('nav [data-tab=palerts]'); pg.wait_for_timeout(600)
        chk('alerts tab renders', pg.locator('#pAlerts').count() == 1)
        pg.click('nav [data-tab=pset]'); pg.wait_for_timeout(600)
        chk('settings tab has a new invite-code generator and a mode switcher', pg.locator('[data-pd=pcode]').count() == 1 and pg.locator('#pSet [data-mode]').count() == 4)

        # switching away and back must not leave stale polling/UI broken
        pg.click('#pSet [data-mode=business]'); pg.wait_for_timeout(800)
        chk('switched cleanly to Business', pg.evaluate("document.body.dataset.mode") == 'business' and pg.locator('#tab-home.active').count() == 1)
        pg.evaluate("S.settings.mode='parent'; PiyuStudent.applyMode();"); pg.wait_for_timeout(1000)
        chk('switching back to Parent shows the dashboard again, still linked', pg.evaluate("document.body.dataset.mode") == 'parent' and pg.locator('.p-card').count() == 1)

        # the Settings tab's own "add a child" form (visited earlier) is still sitting in the DOM (tabs are hidden, not destroyed).
        # Adding a 2nd child from the Home tab must not collide with it (duplicate ids used to make the Home form read/write the wrong input).
        pg.click('[data-pd=addch]'); pg.wait_for_timeout(300)
        chk('a 2nd "add child" form on Home does not duplicate any id already used by the Settings tab\'s form',
            pg.evaluate("(() => { const ids = [...document.querySelectorAll('[id^=pdCode],[id^=pdPCode],[id^=pdMsg]')].map(e => e.id); return ids.length >= 4 && ids.length === new Set(ids).size; })()"))
        pg.fill('#tab-phome input[id^=pdCode]', code2); pg.click('#tab-phome [data-pd=link]'); pg.wait_for_timeout(1500)
        chk('linking the 2nd child from Home reads the Home input, not the stale Settings-tab one', pg.locator('.p-card').count() == 2 and 'Tani' in pg.locator('#tab-phome').inner_text())

        # unlinking from a child's own settings must refresh the dashboard (the new "home"), not pop the old family() list on top of it
        pg.locator('.p-card', has_text='Tani').click(); pg.wait_for_timeout(1000)
        pg.click('[data-kp=tab][data-t=set]'); pg.wait_for_timeout(300)
        pg.click('[data-kp=unlink]'); pg.wait_for_timeout(1500)
        chk('unlink returns to the Parent dashboard (not the legacy family popup) with the card gone',
            pg.locator('.k-pp').count() == 0 and pg.locator('#kfCode').count() == 0 and pg.locator('.p-card').count() == 1 and 'Tani' not in pg.locator('#tab-phome').inner_text())

        chk('no JS errors', not errs)
        for e in errs[:12]: print('  ', e)
        b.close()
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
print('t28parent_mode_ui: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
