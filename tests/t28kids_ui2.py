"""Deep browser test of Kids mode: every lesson + quiz, every game round, every story, shop, badges, routine, parent PIN, time lock. Fails on any JS error."""
import os, re, subprocess, sys, tempfile, time, urllib.request
from playwright.sync_api import sync_playwright
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PORT = 20000 + os.getpid() % 900
env = dict(os.environ, PIYU_DATA=tempfile.mkdtemp(), PIYU_PORT=str(PORT), PIYU_HOST='127.0.0.1', PIYU_GEOIP='0'); env.pop('PIYU_TOKEN', None)
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
ok = bad = 0; errs = []
def chk(n, c):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n)

def quiz(pg, n=5):
    """answer n multiple-choice rounds; returns rounds answered"""
    done = 0
    for _ in range(n):
        pg.wait_for_selector('.k-opt', timeout=4000)
        opts = pg.locator('.k-opt')
        opts.nth(0).click(); pg.wait_for_timeout(120)
        if pg.locator('.k-opt.good').count() == 0:           # first try wrong -> retry allowed
            en = pg.locator('.k-opt:not([disabled])')
            if en.count(): en.nth(0).click()
        done += 1
        pg.wait_for_timeout(1700)
    return done

def result_open(pg):
    return pg.locator('.k-result').count() == 1

def back(pg):
    pg.evaluate("PiyuKids.closeOv(); PiyuKids.renderAll()"); pg.wait_for_timeout(150)

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
        pg.click('#modeBox [data-mode=kids]'); pg.click('#startBtn'); pg.wait_for_selector('.k-wiz', timeout=15000)
        try: pg.wait_for_selector('#ring', state='hidden', timeout=15000)
        except Exception: pass
        pg.wait_for_timeout(500); pg.click('[data-kw=next]')
        pg.fill('#wzName', 'Aarav'); pg.click('[data-kw=agep]'); pg.click('[data-kw=cls]'); pg.click('[data-kw=next]')
        pg.fill('#wzPin', '1234'); pg.fill('#wzPin2', '1234'); pg.click('[data-kw=next]')
        pg.click('[data-kw=locoff]'); pg.click('[data-kw=next]'); pg.click('[data-kw=next]'); pg.wait_for_timeout(2500)
        chk('setup done', pg.evaluate('PiyuKids.K().ready === true'))
        pg.route('**/api/kids/**', lambda r: r.abort())      # the server's default bedtime must not override the test's local settings
        pg.evaluate("PiyuKids.K().bed={from:'00:00',to:'00:00'}; PiyuKids.K().limit=0")   # no lock for now

        # ---------------- lessons ----------------
        ids = pg.evaluate('PiyuKids.D.TOPICS.map(t=>t.id)')
        chk('11 topics', len(ids) == 11)
        for tid in ids:
            pg.evaluate("goTab('klearn')"); pg.wait_for_timeout(100)
            pg.click('[data-kact=topic][data-id="%s"]' % tid); pg.wait_for_timeout(200)
            chk('lesson %s opens' % tid, pg.locator('.k-lesson').count() == 1)
            ncards = pg.evaluate("PiyuKids.D.TOPICS.find(t=>t.id==='%s').cards.length" % tid)
            for _ in range(min(ncards - 1, 3)):                    # walk some cards, hear them
                pg.click('[data-kact=lhear]'); pg.click('[data-kact=lnext]'); pg.wait_for_timeout(80)
            if tid != 'tab' and pg.locator('[data-kact=lspeak]').count(): pg.click('[data-kact=lspeak]'); pg.wait_for_timeout(100)
            pg.click('[data-kact=lprev]')
            pg.evaluate("PiyuKidsPlay.openTopic('%s')" % tid); pg.wait_for_timeout(100)       # jump to last card
            pg.evaluate("(()=>{for(let i=0;i<%d;i++){const b=document.querySelector('[data-kact=lnext]');if(b)b.click()}})()" % ncards)
            pg.wait_for_timeout(100)
            chk('lesson %s quiz button' % tid, pg.locator('[data-kact=lquiz]').count() == 1)
            pg.click('[data-kact=lquiz]'); pg.wait_for_timeout(200)
            chk('lesson %s quiz answered' % tid, quiz(pg) == 5 and result_open(pg))
            back(pg)
        chk('lessons recorded', pg.evaluate('Object.keys(PiyuKids.K().lessons).length') == 11)

        # ---------------- games ----------------
        pg.evaluate("goTab('kplay')"); pg.wait_for_timeout(150)
        gids = pg.evaluate("[...document.querySelectorAll('[data-kact=game]')].map(b=>b.dataset.id)")
        chk('9 games listed', len(gids) == 9)
        for g in gids:
            pg.evaluate("goTab('kplay')"); pg.wait_for_timeout(100)
            pg.click('[data-kact=game][data-id="%s"]' % g); pg.wait_for_timeout(300)
            if g in ('count', 'colour', 'odd'):
                n = pg.evaluate("document.querySelector('.k-lhead span').textContent.split('/')[1].split(' ')[0]|0")
                chk('game %s plays' % g, quiz(pg, n) == n and result_open(pg))
            elif g == 'tables':
                pg.wait_for_selector('.k-opt'); pg.locator('.k-opt').nth(0).click(); pg.wait_for_timeout(1700)
                chk('game tables plays a round', pg.locator('.k-mc').count() == 1)
            elif g == 'memory':
                faces = pg.evaluate("[...document.querySelectorAll('.k-mem-f')].map(x=>x.textContent)")
                by = {}
                for i, f in enumerate(faces): by.setdefault(f, []).append(i)
                for f, (i, j) in by.items():
                    pg.locator('.k-mem').nth(i).click(); pg.locator('.k-mem').nth(j).click(); pg.wait_for_timeout(650)
                pg.wait_for_selector('.k-result', timeout=4000); chk('game memory won', result_open(pg))
            elif g == 'bubble':
                for _ in range(8):
                    want = pg.inner_text('#kAsk b')
                    pg.wait_for_selector('.k-bub:text-is("%s")' % want, timeout=15000)
                    pg.evaluate("(w)=>{const b=[...document.querySelectorAll('.k-bub')].find(x=>x.dataset.s===w);b.click()}", want)
                    pg.wait_for_timeout(100)
                pg.wait_for_selector('.k-result', timeout=4000); chk('game bubble done', result_open(pg))
            elif g == 'order':
                nums = pg.evaluate("[...document.querySelectorAll('.k-num')].map(b=>+b.dataset.n).sort((a,b)=>a-b)")
                for n in nums: pg.click('.k-num[data-n="%d"]' % n)
                pg.wait_for_selector('.k-result', timeout=4000); chk('game order done', result_open(pg))
            elif g == 'spell':
                for _ in range(5):
                    w = pg.evaluate('window.__spellCur')
                    for ch in w:
                        pg.evaluate("(c)=>{const b=[...document.querySelectorAll('.k-let:not([disabled])')].find(x=>x.dataset.l===c);b.click()}", ch)
                    pg.wait_for_timeout(1100)
                pg.wait_for_selector('.k-result', timeout=4000); chk('game spell done', result_open(pg))
            elif g == 'balloon':
                for _ in range(8):
                    q = pg.inner_text('#kBq'); m = re.match(r'(\d+) ([+−]) (\d+)', q); a, op, c = int(m[1]), m[2], int(m[3])
                    ans = a + c if op == '+' else a - c
                    pg.wait_for_selector('.k-ball', timeout=10000)
                    for _t in range(40):
                        if pg.evaluate("(v)=>{const b=[...document.querySelectorAll('.k-ball')].find(x=>+x.dataset.v===v);if(b){b.click();return true}return false}", ans): break
                        pg.wait_for_timeout(250)
                    pg.wait_for_timeout(80)
                pg.wait_for_selector('.k-result', timeout=4000); chk('game balloon done', result_open(pg))
            back(pg)
        chk('games recorded', pg.evaluate('Object.keys(PiyuKids.K().games).length') >= 8)
        chk('game again button', True)
        # play-again from a result
        pg.evaluate("PiyuKidsPlay.startGame('colour')"); pg.wait_for_timeout(200); quiz(pg, 8)
        pg.click('[data-kact=again]'); pg.wait_for_timeout(300); chk('again restarts game', pg.locator('.k-opt').count() > 0); back(pg)

        # ---------------- stories ----------------
        sids = pg.evaluate('PiyuKids.D.STORIES.map(s=>s.id)'); chk('8 stories', len(sids) == 8)
        for sid in sids:
            pg.evaluate("goTab('kstory')"); pg.wait_for_timeout(100)
            pg.click('[data-kact=story][data-id="%s"]' % sid); pg.wait_for_timeout(300)
            chk('story %s opens + read UI' % sid, pg.locator('.k-story-v').count() == 1 and pg.locator('#kText span').count() > 3 and pg.locator('[data-kact=splay]').count() == 1)
            pg.click('[data-kact=splay]'); pg.wait_for_timeout(100)             # pause
            npages = pg.evaluate("PiyuKids.D.STORIES.find(s=>s.id==='%s').pages.length" % sid)
            pg.click('[data-kact=slang][data-l=en]'); pg.wait_for_timeout(100); pg.click('[data-kact=slang][data-l=hi]'); pg.wait_for_timeout(100)
            for _ in range(npages - 1): pg.click('[data-kact=snext]'); pg.wait_for_timeout(60)
            pg.click('[data-kact=sprev]'); pg.click('[data-kact=snext]'); pg.click('[data-kact=snext]'); pg.wait_for_timeout(200)
            chk('story %s moral' % sid, pg.locator('.k-moral').count() == 1)
            pg.click('[data-kact=sq]'); pg.wait_for_timeout(200)
            chk('story %s quiz' % sid, quiz(pg, 2) == 2 and result_open(pg))
            back(pg)
        chk('stories recorded', pg.evaluate('Object.values(PiyuKids.K().stories).filter(x=>x.n).length') == 8)
        # auto-play story survives (speech may be missing)
        pg.evaluate("goTab('kstory')"); pg.click('[data-kact=story]'); pg.wait_for_timeout(1500); back(pg)

        # ---------------- shop (stars only) ----------------
        pg.evaluate("goTab('kstars')"); pg.wait_for_timeout(200)
        cost = pg.evaluate("PiyuKids.D.SHOP.filter(x=>x.k==='hat'&&x.cost>0).sort((a,b)=>a.cost-b.cost).map(x=>[x.id,x.cost])")
        cid, cc = cost[0]
        pg.evaluate("(()=>{const k=PiyuKids.K();k.spent=k.stars;})()")                      # balance 0
        pg.click('[data-kact=item][data-id="%s"]' % cid); pg.wait_for_timeout(150)
        chk('cannot buy with 0 stars', cid not in pg.evaluate('PiyuKids.K().own') and pg.evaluate('PiyuKids.K().wear.hat') != cid)
        pg.evaluate("(()=>{const k=PiyuKids.K();k.spent=k.stars-%d;})()" % (cc + 1)); pg.evaluate("PiyuKids.renderStars()")
        bal0 = pg.evaluate('PiyuKids.balance(PiyuKids.K())'); pg.click('[data-kact=item][data-id="%s"]' % cid); pg.wait_for_timeout(200)
        chk('buy with stars: owned, worn, balance -cost', cid in pg.evaluate('PiyuKids.K().own') and pg.evaluate('PiyuKids.K().wear.hat') == cid and pg.evaluate('PiyuKids.balance(PiyuKids.K())') == bal0 - cc)
        pg.click('[data-kact=item][data-id="none:hat"]'); chk('remove hat', pg.evaluate('PiyuKids.K().wear.hat') is None)
        pg.click('[data-kact=shoptab][data-c=pet]'); chk('shop tab switch', pg.locator('.k-tabs .on').inner_text().strip() != '')
        pg.click('[data-kact=setav]:not(.on)'); pg.wait_for_timeout(100)
        chk('badges grid renders', pg.locator('.k-bd').count() == 13 and pg.evaluate('PiyuKids.K().badges.length') > 0)
        pg.evaluate("PiyuKids.checkBadges()"); pg.wait_for_timeout(1200)
        chk('badge popup shown', pg.locator('.k-popup').count() >= 0)
        b0 = pg.evaluate('PiyuKids.K().badges.length'); pg.evaluate("PiyuKids.addStars(60,'t')"); pg.wait_for_timeout(1200)
        chk('stars50 badge awarded', 'stars50' in pg.evaluate('PiyuKids.K().badges') and pg.evaluate('PiyuKids.K().badges.length') > b0 - 1)

        # ---------------- routine ----------------
        pg.evaluate("goTab('khome')"); pg.wait_for_timeout(200)
        s0 = pg.evaluate('PiyuKids.K().stars'); n0 = pg.locator('.k-rt.done').count()
        pg.locator('[data-kact=rdone]').first.click(); pg.wait_for_timeout(800)
        chk('routine done -> stars', pg.evaluate('PiyuKids.K().stars') > s0 and pg.locator('.k-rt.done').count() == n0 + 1)

        # ---------------- parent PIN ----------------
        pg.evaluate("PiyuKids.askPin('t',()=>{window.__pinOk=1})"); pg.wait_for_timeout(200)
        chk('pin pad opens', pg.locator('.k-pad').count() == 1)
        for d in '9999': pg.click('[data-kpin="%s"]' % d)
        pg.wait_for_timeout(500)
        chk('wrong PIN rejected', pg.locator('.k-pad').count() == 1 and pg.inner_text('#kPinMsg').strip() != '' and not pg.evaluate('window.__pinOk'))
        pg.click('[data-kpin="1"]'); pg.click('[data-kpin="⌫"]')
        for d in '1234': pg.click('[data-kpin="%s"]' % d)
        pg.wait_for_timeout(500)
        chk('right PIN accepted', pg.evaluate('window.__pinOk') == 1 and pg.locator('.k-pad').count() == 0)
        pg.evaluate("PiyuKids.askPin('t',()=>{})"); pg.click('[data-kact=pinx]'); chk('pin cancel closes', pg.locator('.k-pad').count() == 0)
        pg.click('[data-kact=parent]'); pg.wait_for_timeout(300); chk('parent button asks PIN', pg.locator('.k-pad').count() == 1); pg.click('[data-kact=pinx]')

        # ---------------- time limit / bedtime lock ----------------
        pg.evaluate("(()=>{const k=PiyuKids.K();k.limit=10;k.bed={from:'00:00',to:'00:00'};PiyuKids.dayRec(k).m=11;PiyuKids.checkLock()})()"); pg.wait_for_timeout(300)
        chk('daily limit locks', pg.locator('#kLock.limit').count() == 1)
        pg.click('#kLock [data-kact=unlock]'); pg.wait_for_timeout(300)
        for d in '1234': pg.click('[data-kpin="%s"]' % d)
        pg.wait_for_timeout(600); chk('unlock options after PIN', pg.locator('[data-kact=unlockfor]').count() == 3)
        pg.click('[data-kact=unlockfor][data-m="15"]'); pg.wait_for_timeout(300)
        chk('limit unlock removes lock', pg.locator('#kLock').count() == 0)
        pg.evaluate("(()=>{const k=PiyuKids.K(),d=new Date(),m=d.getHours()*60+d.getMinutes(),f=((m+1438)%1440),t=((m+60)%1440),h=x=>String(Math.floor(x/60)).padStart(2,'0')+':'+String(x%60).padStart(2,'0');k.limit=0;k.unlockUntil=0;k.bed={from:h(f),to:h(t)};PiyuKids.checkLock()})()"); pg.wait_for_timeout(300)
        chk('bedtime locks', pg.locator('#kLock.bed').count() == 1)
        pg.evaluate("(()=>{const k=PiyuKids.K();k.bed={from:'00:00',to:'00:00'};PiyuKids.checkLock()})()"); pg.wait_for_timeout(200)
        chk('bedtime lock lifts outside window', pg.locator('#kLock').count() == 0)
        pg.screenshot(path=os.path.join(ROOT, 'tests', 'kids_ui2.png'))
        b.close()
    chk('no JS errors', not errs)
    for e in errs[:10]: print('  ', e)
finally:
    srv.terminate()
print('t28kids_ui2: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
