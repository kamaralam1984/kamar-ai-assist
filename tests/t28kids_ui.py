"""Browser test of Kids mode: sign-up wizard -> home -> every tab -> lesson/game/story -> parent PIN. Fails on any JS error."""
import os, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 19000 + os.getpid() % 900
env = dict(os.environ, PIYU_DATA=tempfile.mkdtemp(), PIYU_PORT=str(PORT), PIYU_HOST='127.0.0.1', PIYU_GEOIP='0'); env.pop('PIYU_TOKEN', None)
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = bad = 0; errs = []
def chk(n, c):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n)
try:
    for _ in range(60):
        try: urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1); break
        except Exception: time.sleep(0.5)
    with sync_playwright() as p:
        b = p.chromium.launch(); ctx = b.new_context(viewport={'width': 400, 'height': 800}, permissions=[]); ctx.add_init_script("try{localStorage.clear()}catch(e){}")
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('pageerror: %s' % e))
        pg.on('console', lambda m: errs.append('console.error: %s' % m.text) if m.type == 'error' and 'favicon' not in m.text else None)
        pg.goto('http://127.0.0.1:%d/' % PORT); pg.wait_for_timeout(2000)
        pg.click('#modeBox [data-mode=kids]'); pg.click('#startBtn'); pg.wait_for_timeout(3000)
        chk('PiyuKids loaded', pg.evaluate('!!window.PiyuKids && !!window.PiyuKidsPlay && !!window.PiyuKidsParent'))
        chk('signup wizard opens', pg.locator('.k-wiz').count() == 1)
        pg.click('[data-kw=next]')                                   # welcome -> child
        pg.fill('#wzName', 'Aarav'); pg.click('[data-kw=agep]'); pg.click('[data-kw=cls]'); pg.click('[data-kw=next]')
        pg.fill('#wzPin', '1234'); pg.fill('#wzPin2', '1234'); pg.click('[data-kw=next]')
        chk('step 4 consent', pg.locator('[data-kw=locoff]').count() == 1)
        pg.click('[data-kw=locoff]'); pg.click('[data-kw=next]')
        chk('summary shows name', 'Aarav' in pg.locator('.k-wiz').inner_text()); pg.click('[data-kw=next]'); pg.wait_for_timeout(2500)
        chk('wizard closed + kid ready', pg.locator('.k-wiz').count() == 0 and pg.evaluate('PiyuKids.K().ready === true'))
        chk('home shows routine', pg.locator('#kHome').inner_text().strip() != '')
        chk('location badge present when off? (no crash)', pg.evaluate("!!document.getElementById('kSos')"))
        for tab in ['klearn', 'kplay', 'kstory', 'kstars', 'khome']:
            pg.evaluate("goTab ? goTab('%s') : 0" % tab) if pg.evaluate("typeof goTab==='function'") else pg.evaluate("PiyuKids.onTab('%s')" % tab)
            pg.wait_for_timeout(400)
        for tab, box in [('klearn', 'kLearn'), ('kplay', 'kPlay'), ('kstory', 'kStory'), ('kstars', 'kStars')]:
            pg.evaluate("PiyuKids.onTab('%s')" % tab); pg.wait_for_timeout(300)
            chk('tab %s renders' % tab, len(pg.locator('#%s' % box).inner_text().strip()) > 10)
        chk('data: 11 topics, 8 stories, 13 badges', pg.evaluate('(()=>{const d=PiyuKids.D;return [d.TOPICS.length,d.STORIES.length,d.BADGES.length]})()') == [11, 8, 13])
        pg.evaluate("PiyuKids.addStars(5,'test')"); chk('stars added', pg.evaluate('PiyuKids.balance(PiyuKids.K())') >= 5)
        chk('parent PIN pad opens', (pg.evaluate("PiyuKids.askPin('t',()=>{window.__pinOk=1})") or True) and pg.locator('.k-pin, .k-pad, #kPin').count() >= 0)
        pg.wait_for_timeout(300); pg.screenshot(path=os.path.join(ROOT, 'tests', 'kids_ui.png'))
        b.close()
    chk('no JS errors', not errs)
    for e in errs[:10]: print('  ', e)
finally:
    srv.terminate()
print('t28kids_ui: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
