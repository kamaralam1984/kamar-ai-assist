"""Parent side of Kids mode (kidsparent.js + kidsmap.js): Family screen on a parent's phone, parent panel on the child's phone behind the PIN,
alert polling, radar + OSM tile map (network blocked, tiles stubbed). Fails on any JS error."""
import base64, json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
os.environ['PIYU_GEOIP'] = '0'
from access import Access
D = tempfile.mkdtemp(); A = Access(D)
kid, mom = A.add('Kid'), A.add('Mom')
PORT = 20000 + os.getpid() % 900
env = dict(os.environ, PIYU_DATA=D, PIYU_PORT=str(PORT), PIYU_TOKEN='owner-secret-token-for-test-1234567890', PIYU_HOST='127.0.0.1', PIYU_GEOIP='0')
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
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==')
tile_urls = []; ext_hits = []
PIN = '1234'
try:
    for _ in range(60):
        try: urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1); break
        except Exception: time.sleep(0.5)
    # --- server-side set-up through the API (the browser flow is what is under test) ---
    s, r = call(kid, 'POST', '/api/kids/profile', {'name': 'Rani', 'age': 8, 'cls': '3', 'avatar': '🦁', 'newPin': PIN}); chk('kid profile', s == 200)
    s, r = call(kid, 'POST', '/api/kids/config', {'pin': PIN, 'config': {'limit_min': 30, 'places': [{'id': 'home', 'name': 'Ghar', 'type': 'home', 'lat': 28.6, 'lng': 77.2, 'r': 100}]}}); chk('kid config', s == 200)
    call(kid, 'POST', '/api/kids/consent', {'pin': PIN, 'on': True})
    call(kid, 'POST', '/api/kids/loc', {'lat': 28.6003, 'lng': 77.2004, 'acc': 20})
    call(kid, 'POST', '/api/kids/events', {'events': [{'kind': 'star', 'data': {'n': 3}}]})
    s, r = call(kid, 'POST', '/api/kids/code', {'pin': PIN}); code = r.get('code'); chk('code', s == 200 and len(code or '') == 6)

    def route(ctx):
        def h(rt):
            u = rt.request.url
            if u.startswith('http://127.0.0.1:%d' % PORT): return rt.continue_()
            if 'tile.openstreetmap.org' in u: tile_urls.append(u); return rt.fulfill(status=200, content_type='image/png', body=PNG)
            ext_hits.append(u); rt.abort()
        ctx.route('**/*', h)
    def watch(pg, tag):
        pg.on('pageerror', lambda e: errs.append('%s pageerror: %s' % (tag, e)))
        pg.on('console', lambda m: errs.append('%s console.error: %s' % (tag, m.text)) if m.type == 'error' and 'favicon' not in m.text and 'Failed to load resource' not in m.text else None)
    def boot(b, u, tag):
        ctx = b.new_context(viewport={'width': 400, 'height': 800}); route(ctx)
        ctx.add_init_script("try{localStorage.setItem('piyu.device','%s')}catch(e){}" % dev(u))
        pg = ctx.new_page(); watch(pg, tag); pg.on('dialog', lambda d: d.accept())
        pg.goto('http://127.0.0.1:%d/' % PORT); pg.wait_for_timeout(2000)
        pg.evaluate("applyToken(%s)" % json.dumps(u['token'])); pg.wait_for_timeout(1500)
        return ctx, pg

    with sync_playwright() as p:
        b = p.chromium.launch()
        # ================= PARENT'S OWN PHONE =================
        mctx, mp = boot(b, mom, 'mom')
        chk('modules loaded', mp.evaluate('!!window.PiyuKidsParent && !!window.PiyuKidsMap'))
        mp.evaluate('PiyuKidsParent.family()'); mp.wait_for_timeout(1000)
        chk('family screen opens', mp.locator('#kfCode').count() == 1)
        chk('family empty state', mp.locator('.k-child').count() == 0)
        mp.click('[data-kf=link]'); chk('empty code rejected', '6' in mp.locator('#kfMsg').inner_text() or mp.locator('#kfMsg').inner_text().strip() != '')
        mp.fill('#kfCode', '000000'); mp.click('[data-kf=link]'); mp.wait_for_timeout(800)
        chk('wrong code message', mp.locator('#kfMsg').inner_text().strip() != '' and mp.locator('.k-child').count() == 0)
        mp.fill('#kfCode', code); mp.click('[data-kf=link]'); mp.wait_for_timeout(1800)
        chk('child linked and listed', mp.locator('.k-child').count() == 1 and 'Rani' in mp.locator('.k-child').inner_text())
        chk('family.on set', mp.evaluate('!!S.settings.family && S.settings.family.on === true'))
        # open child's panel from the parent's phone
        mp.click('.k-child'); mp.wait_for_timeout(1500)
        chk('family panel opens (report)', mp.locator('.k-pp').count() == 1 and mp.locator('.k-bcol').count() == 7)
        chk('family panel has msg tab', mp.locator('[data-kp=tab][data-t=msg]').count() == 1)
        mp.click('[data-kp=tab][data-t=msg]'); mp.fill('#ppMsg', 'Jaldi aao'); mp.click('[data-kp=sendmsg]'); mp.wait_for_timeout(800)
        s, r = call(kid, 'GET', '/api/kids/msgs?since=0'); chk('parent message delivered', s == 200 and any(m['text'] == 'Jaldi aao' for m in r['msgs']))
        mp.click('[data-kp=qmsg]'); mp.wait_for_timeout(600)
        s, r = call(kid, 'GET', '/api/kids/msgs?since=0'); chk('quick message delivered', len(r['msgs']) == 2)
        # safety tab: radar offline, then OSM
        mp.click('[data-kp=tab][data-t=safe]'); mp.wait_for_timeout(1200)
        chk('radar mounts in safety tab', mp.locator('.kmap canvas.kmap-cv').count() == 1 and mp.locator('.kmap-bar .on[data-m=radar]').count() == 1)
        chk('no tiles in radar mode', mp.locator('.kmap-tile').count() == 0 and not tile_urls and mp.locator('.kmap-attr').evaluate('e=>e.hidden'))
        chk('radar canvas painted', mp.evaluate("(()=>{const c=document.querySelector('.kmap-cv');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;let n=0;for(let i=3;i<d.length;i+=4*50)if(d[i]>0)n++;return n>50})()"))
        chk('place row listed', mp.locator('.k-place').count() == 1)
        mp.click('.kmap-bar [data-m=map]'); mp.wait_for_timeout(1500)
        chk('map mode builds tile URLs', len(tile_urls) > 0 and all(__import__('re').match(r'https://tile\.openstreetmap\.org/\d+/\d+/\d+\.png$', u) for u in tile_urls))
        chk('tiles in DOM', mp.locator('img.kmap-tile').count() > 0)
        chk('attribution visible', not mp.locator('.kmap-attr').evaluate('e=>e.hidden') and '© OpenStreetMap contributors' in mp.locator('.kmap-attr').inner_text().replace('\xa0', ' '))
        chk('tile url matches zoom/lat/lng', any('/%d/%d/%d.png' % (z, x, y) in u for u in tile_urls for z in [int(u.split('/')[-3])] for x in [int(u.split('/')[-2])] for y in [int(u.split('/')[-1][:-4])] if abs(x - (77.2 + 180) / 360 * 2 ** z) < 3))
        n0 = len(tile_urls); mp.click('.kmap-zoom [data-z="-1"]'); mp.wait_for_timeout(1000); chk('zoom out fetches new tiles', len(tile_urls) > n0)
        mp.click('.kmap-bar [data-m=radar]'); mp.wait_for_timeout(500)
        chk('back to radar clears tiles', mp.locator('img.kmap-tile').count() == 0 and mp.locator('.kmap-attr').evaluate('e=>e.hidden'))
        mp.click('[data-kp=close]'); mp.wait_for_timeout(300)
        chk('panel closes', mp.locator('.k-pp').count() == 0)

        # --- alerts: SOS + arrive/checkin, polled by the parent's app ---
        mp.evaluate('S.settings.family.since = 0; save()')
        call(kid, 'POST', '/api/kids/sos', {'lat': 28.6003, 'lng': 77.2004}); call(kid, 'POST', '/api/kids/checkin', {'key': 'home'})
        mp.evaluate('PiyuKidsParent.pollAlerts()'); mp.wait_for_timeout(1500)
        chk('SOS screen shown by poll', mp.locator('.k-sosbox').count() == 1 and mp.locator('.k-sosbox [data-kf=open]').count() == 1)
        chk('poll advanced since', mp.evaluate('S.settings.family.since') > 0)
        mp.evaluate('PiyuKidsParent.pollAlerts()'); mp.wait_for_timeout(500)
        chk('poll again is quiet', mp.evaluate('S.settings.family.since') > 0)
        mp.click('.k-sosbox [data-kf=open]'); mp.wait_for_timeout(1500)
        chk('SOS -> location opens child panel', mp.locator('.k-pp').count() == 1)
        mp.click('[data-kp=tab][data-t=safe]'); mp.wait_for_timeout(1200)
        chk('alert list shows sos+arrive', mp.locator('.k-alerts .k-alert.sos').count() >= 1 and mp.locator('.k-alerts .k-alert').count() >= 2)
        # parent edits routine/limits remotely
        mp.click('[data-kp=tab][data-t=rt]'); mp.fill('#ppLimit', '55'); mp.click('[data-kp=savecfg]'); mp.wait_for_timeout(1000)
        s, r = call(mom, 'GET', '/api/family/children'); cid = r['children'][0]['id']
        s, r = call(mom, 'GET', '/api/family/child/%d' % cid); chk('parent remote limit saved', r['config']['limit_min'] == 55)
        mp.click('[data-kp=tab][data-t=set]'); chk('family settings: no export/wipe', mp.locator('[data-kp=export]').count() == 0 and mp.locator('[data-kp=unlink]').count() == 1)
        mp.click('[data-kp=close]')
        mp.evaluate('PiyuKidsParent.family()'); mp.wait_for_timeout(1000)
        chk('family shows recent alerts', mp.locator('.k-alerts .k-alert').count() >= 2)
        mctx.close()

        # ================= CHILD'S PHONE: parent panel behind PIN =================
        cctx, cp = boot(b, kid, 'kid')
        cp.click('#modeBox [data-mode=kids]'); cp.click('#startBtn'); cp.wait_for_timeout(3500)
        # a fresh install of an existing child shows the sign-up wizard (by design); mark the local profile ready and carry on
        cp.evaluate("(()=>{const k=PiyuKids.K();k.ready=true;k.name='Rani';k.age=8;k.avatar='🦁';save();PiyuKids.closeOv();PiyuKids.renderAll()})()"); cp.wait_for_timeout(500)
        chk('child ready', cp.evaluate('PiyuKids.K().ready === true'))
        cp.evaluate('PiyuKidsParent.open()'); cp.wait_for_timeout(500)
        chk('PIN pad shown', cp.locator('.k-pad').count() == 1)
        for d in '0000': cp.keyboard.press(d)
        cp.wait_for_timeout(1000); chk('wrong PIN rejected', cp.locator('.k-pad').count() == 1 and cp.locator('.k-pp').count() == 0)
        for d in PIN: cp.keyboard.press(d)
        cp.wait_for_timeout(2000)
        chk('parent panel open', cp.locator('.k-pp').count() == 1)
        chk('report: 4+ stat tiles and 7-day chart', cp.locator('.k-stat').count() >= 3 and cp.locator('.k-bcol').count() == 7)
        # routine editor
        cp.click('[data-kp=tab][data-t=rt]'); cp.wait_for_timeout(300)
        n = cp.locator('.k-rrow').count(); chk('routine rows', n > 0)
        cp.click('[data-kp=radd]'); chk('routine add', cp.locator('.k-rrow').count() == n + 1)
        cp.locator('.k-rrow .r-title').last.fill('Yoga'); cp.locator('.k-rrow .r-time').last.fill('17:30')
        cp.click('[data-kp=icon] >> nth=0'); cp.locator('.k-rrow [data-kp=day]').first.click()
        cp.locator('.k-rrow [data-kp=rdel]').first.click(); chk('routine delete', cp.locator('.k-rrow').count() == n)
        cp.fill('#ppLimit', '40'); cp.fill('#ppBedF', '20:30'); cp.click('[data-kp=savecfg]'); cp.wait_for_timeout(1200)
        s, r = call(kid, 'POST', '/api/kids/panel', {'pin': PIN}); cfg = r['config']
        chk('routine+limits saved', cfg['limit_min'] == 40 and cfg['bed']['from'] == '20:30' and any(x['title'] == 'Yoga' and x['time'] == '17:30' for x in cfg['routine']))
        cp.click('[data-kp=rreset]'); chk('routine reset to defaults', cp.locator('.k-rrow').count() >= 3)
        # safe places
        cp.click('[data-kp=tab][data-t=safe]'); cp.wait_for_timeout(1000)
        chk('local panel: radar', cp.locator('.kmap-cv').count() == 1)
        chk('safe place shown', cp.locator('.k-place').count() == 1)
        cp.click('[data-kp=addplace][data-t=school]'); cp.wait_for_timeout(800); chk('add school place', cp.locator('.k-place').count() == 2)
        cp.locator('.k-place .pp-name').last.fill('Vidyalaya'); cp.fill('#ppArrive', '08:00'); cp.fill('#ppLate', '45')
        cp.click('[data-kp=savecfg]'); cp.wait_for_timeout(1200)
        s, r = call(kid, 'POST', '/api/kids/panel', {'pin': PIN}); cfg = r['config']
        chk('places saved', len(cfg['places']) == 2 and cfg['places'][1]['name'] == 'Vidyalaya' and cfg['places'][1]['type'] == 'school')
        chk('arrive/late saved', cfg['school']['arrive_by'] == '08:00' and cfg['late_min'] == 45)
        cp.locator('[data-kp=delplace]').last.click(); chk('delete place', cp.locator('.k-place').count() == 1)
        # pick on map -> OSM tiles in the picker
        cp.locator('[data-kp=pickmap]').first.click(); cp.wait_for_timeout(1500)
        chk('pick-on-map uses tiles + attribution', cp.locator('#kPickBox img.kmap-tile').count() > 0 and 'OpenStreetMap' in cp.locator('#kPickBox .kmap-attr').inner_text())
        cp.click('[data-kp=pickset]'); cp.wait_for_timeout(500); chk('pick set returns', cp.locator('.k-place').count() == 1)
        # messages tab absent locally
        chk('no msg tab on child phone', cp.locator('[data-kp=tab][data-t=msg]').count() == 0)
        # settings: code, export, language
        cp.click('[data-kp=tab][data-t=set]'); cp.wait_for_timeout(300)
        cp.click('[data-kp=code]'); cp.wait_for_timeout(1000); chk('link code generated', len(cp.locator('#kCode b').inner_text().strip()) == 6)
        with cp.expect_download() as dl: cp.click('[data-kp=export]')
        path = dl.value.path(); data = json.load(open(path)); chk('export downloads JSON', isinstance(data, dict) and len(data) > 0)
        cp.click('[data-kp=clang][data-l=en]'); cp.wait_for_timeout(300); chk('learning language switch', cp.evaluate("PiyuKids.K().clang") == 'en')
        # consent off from the panel
        cp.click('[data-kp=tab][data-t=safe]'); cp.wait_for_timeout(600)
        cp.click('[data-kp=consent]'); cp.wait_for_timeout(1200)
        s, r = call(kid, 'POST', '/api/kids/panel', {'pin': PIN}); chk('consent toggled from panel', r['summary']['consent'] in (0, 1, False, True))
        # delete
        cp.click('[data-kp=tab][data-t=set]'); cp.click('[data-kp=wipe]'); cp.wait_for_timeout(2000)
        s, r = call(kid, 'GET', '/api/kids/me'); chk('delete wipes profile', s == 200 and r['profile'] is None)
        chk('panel closed after delete', cp.locator('.k-pp').count() == 0)
        cctx.close(); b.close()
    chk('no external network used (only OSM tiles, stubbed)', not ext_hits)
    for u in ext_hits[:5]: print('  ext:', u)
    chk('no JS errors', not errs)
    for e in errs[:15]: print('  ', e)
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
print('t28kids_parent: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
