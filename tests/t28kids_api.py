"""HTTP API of Kids mode: starts a real server on a temp data dir and drives /api/kids/* and /api/family/*."""
import json, os, subprocess, sys, tempfile, time, urllib.request, urllib.error
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__))); sys.path.insert(0, ROOT)
os.environ['PIYU_GEOIP'] = '0'
from access import Access
D = tempfile.mkdtemp(); A = Access(D)
kid, mom, stranger = A.add('Kid'), A.add('Mom'), A.add('Stranger')
PORT = 18000 + os.getpid() % 1000
env = dict(os.environ, PIYU_DATA=D, PIYU_PORT=str(PORT), PIYU_TOKEN='owner-secret-token-for-test-1234567890', PIYU_HOST='127.0.0.1', PIYU_GEOIP='0')
srv = subprocess.Popen([sys.executable, os.path.join(ROOT, 'server.py')], env=env, cwd=ROOT, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
ok = bad = 0
def chk(n, c):
    global ok, bad
    if c: ok += 1
    else: bad += 1; print('FAIL', n)
def call(u, method, path, body=None):
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={'X-Piyu-Token': u['token'], 'X-Piyu-Device': 'device-id-for-' + u['name'] + '-test', 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=10) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def owner_call(method, path, body=None):
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method, data=None if body is None else json.dumps(body).encode(),
                               headers={'X-Piyu-Token': env['PIYU_TOKEN'], 'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(r, timeout=10) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
def raw(tok, dev, method, path, body=None):
    headers = {'Content-Type': 'application/json'}
    if tok: headers['X-Piyu-Token'] = tok
    if dev: headers['X-Piyu-Device'] = dev
    r = urllib.request.Request('http://127.0.0.1:%d%s' % (PORT, path), method=method, data=None if body is None else json.dumps(body).encode(), headers=headers)
    try:
        with urllib.request.urlopen(r, timeout=10) as f: return f.status, json.loads(f.read() or b'{}')
    except urllib.error.HTTPError as e: return e.code, json.loads(e.read() or b'{}')
try:
    for _ in range(60):
        try: urllib.request.urlopen('http://127.0.0.1:%d/' % PORT, timeout=1); break
        except Exception: time.sleep(0.5)
    s, r = call(kid, 'GET', '/api/kids/me'); chk('me empty', s == 200 and r['profile'] is None)
    s, r = call(kid, 'POST', '/api/kids/profile', {'name': 'Rani', 'age': 8, 'cls': '3', 'avatar': '🦁', 'newPin': '12'}); chk('bad pin 400', s == 400)
    s, r = call(kid, 'POST', '/api/kids/profile', {'name': 'Rani', 'age': 8, 'cls': '3', 'avatar': '🦁', 'newPin': '1234'}); chk('sign-up', s == 200 and r['profile']['name'] == 'Rani')
    s, r = call(kid, 'POST', '/api/kids/profile', {'name': 'Hack', 'age': 8}); chk('edit needs PIN', s == 403)
    s, r = call(kid, 'POST', '/api/kids/config', {'pin': '0000', 'config': {'limit_min': 30}}); chk('config wrong pin', s == 403)
    s, r = call(kid, 'POST', '/api/kids/config', {'pin': '1234', 'config': {'limit_min': 30, 'places': [{'id': 'home', 'name': 'Ghar', 'type': 'home', 'lat': 28.6, 'lng': 77.2, 'r': 100}]}}); chk('config ok', s == 200 and r['config']['limit_min'] == 30)
    s, r = call(kid, 'POST', '/api/kids/loc', {'lat': 28.6, 'lng': 77.2}); chk('loc without consent 403', s == 403 and r['why'] == 'consent')
    s, r = call(kid, 'POST', '/api/kids/consent', {'pin': '1234', 'on': True}); chk('consent', s == 200 and r['profile']['consent'] == 1)
    s, r = call(kid, 'POST', '/api/kids/loc', {'lat': 28.6, 'lng': 77.2, 'acc': 10}); chk('loc ok', s == 200)
    s, r = call(kid, 'POST', '/api/kids/events', {'events': [{'kind': 'star', 'data': {'n': 2}}, {'kind': 'zzz'}]}); chk('events', s == 200 and r['n'] == 1)
    s, r = call(kid, 'POST', '/api/kids/code', {'pin': '1234'}); code = r.get('code'); chk('link code', s == 200 and len(code or '') == 6)
    s, r = call(stranger, 'GET', '/api/family/child/%d' % 1); chk('stranger blocked', s == 403)
    s, r = call(mom, 'POST', '/api/family/link', {'code': '999999'}); chk('bad code', s == 400)
    s, r = call(mom, 'POST', '/api/family/link', {'code': code}); chk('parent links', s == 200 and r['child']['profile']['name'] == 'Rani' if 'profile' in r.get('child', {}) else s == 200)
    s, r = call(mom, 'GET', '/api/family/children'); chk('children list', s == 200 and len(r['children']) == 1)
    cid = kid['id']
    s, r = call(mom, 'GET', '/api/family/child/%d' % cid); chk('child panel', s == 200 and r['config']['limit_min'] == 30 and len(r['locs']) == 1)
    s, r = call(mom, 'POST', '/api/family/child/%d/config' % cid, {'config': {'limit_min': 45}}); chk('parent edits config', s == 200 and r['config']['limit_min'] == 45)
    s, r = call(kid, 'POST', '/api/kids/sos', {'lat': 28.6, 'lng': 77.2}); chk('sos', s == 200 and r['parents'] == 1)
    s, r = call(kid, 'POST', '/api/kids/checkin', {'key': 'home'}); chk('checkin', s == 200)
    s, r = call(kid, 'POST', '/api/kids/checkin', {'key': 'bad'}); chk('bad checkin', s == 400)
    s, r = call(mom, 'GET', '/api/family/alerts'); kinds = [a['kind'] for a in r['alerts']]; chk('alerts sos+checkin', s == 200 and 'sos' in kinds and 'checkin' in kinds)
    s, r = call(mom, 'GET', '/api/family/alerts?since=%d' % r['alerts'][0]['id']); chk('alerts since', s == 200 and r['alerts'] == [])
    s, r = call(mom, 'POST', '/api/family/msg', {'child': cid, 'text': 'Jaldi aao'}); chk('parent msg', s == 200)
    s, r = call(stranger, 'POST', '/api/family/msg', {'child': cid, 'text': 'hi'}); chk('stranger msg refused', s == 403)
    s, r = call(kid, 'GET', '/api/kids/msgs?since=0'); chk('child gets msg', s == 200 and r['msgs'][0]['text'] == 'Jaldi aao')
    s, r = call(mom, 'POST', '/api/family/pos', {'on': True, 'lat': 28.61, 'lng': 77.21}); chk('parent pos', s == 200)
    s, r = call(mom, 'POST', '/api/family/child/%d/consent' % cid, {'on': False}); chk('parent turns location off', s == 200)
    s, r = call(kid, 'POST', '/api/kids/loc', {'lat': 28.6, 'lng': 77.2}); chk('loc blocked after off', s == 403)
    s, r = call(kid, 'POST', '/api/kids/panel', {'pin': '1234'}); chk('child panel via pin', s == 200 and 'report' in r)
    s, r = call(kid, 'POST', '/api/kids/export', {'pin': '1234'}); chk('export', s == 200)
    for _ in range(6): s, r = call(kid, 'POST', '/api/kids/verify', {'pin': '0000'})
    chk('pin lock 429', s == 429)
    s, r = call(kid, 'POST', '/api/kids/delete', {'pin': '1234'}); chk('locked even for right pin', s == 429)
    s, r = call(mom, 'POST', '/api/family/child/%d/unlink' % cid, {}); chk('unlink', s == 200)
    s, r = call(mom, 'GET', '/api/family/child/%d' % cid); chk('after unlink 403', s == 403)
    # ---- review regressions
    s, r = call(mom, 'GET', '/api/family/child/%d?hours=nan' % cid); chk('hours=nan no 500', s == 403)       # unlinked now
    s, r = call(mom, 'POST', '/api/family/msg', {'child': 'abc', 'text': 'x'}); chk('msg bad child no 500', s == 403)
    for _ in range(6): s, r = call(stranger, 'POST', '/api/family/link', {'code': '000001'})
    chk('link brute force limited', s == 429)
    s, r = call(stranger, 'POST', '/api/ai/chat', {'q': 'hi', 'kid': True}); chk('kid ai w/o profile no 500', s in (200, 503))
    # ---- live mic/camera: off by default, gated by an in-app agreement + an owner-only admin switch, child's own toggle, parent must be linked
    kid3, mom3 = A.add('Kid3'), A.add('Mom3')
    s, r = call(kid3, 'POST', '/api/kids/profile', {'name': 'Vivaan', 'age': 9, 'cls': '4', 'avatar': '🐯', 'newPin': '1234'}); chk('av: kid3 signs up', s == 200)
    s, r = call(kid3, 'POST', '/api/kids/code', {'pin': '1234'}); code3 = r.get('code')
    s, r = call(mom3, 'POST', '/api/family/link', {'code': code3}); chk('av: mom3 links', s == 200)
    s, r = call(kid3, 'GET', '/api/kids/av'); chk('av: feature off by default -> 403', s == 403 and r['error'] == 'feature')
    s, r = owner_call('POST', '/api/admin/users/%d/features' % kid3['id'], {'features': {'kids_av': True}}); chk('av: admin cannot enable without agreement', s == 400 and r['error'] == 'av_agree')
    n_before = owner_call('GET', '/api/admin/users')[1]['users']
    s, r = owner_call('POST', '/api/admin/users', {'name': 'SneakyKid', 'features': {'kids_av': True}})
    chk('av: creating a brand-new user with kids_av already on is refused', s == 400 and r['error'] == 'av_agree')
    chk('av: the refused create-with-kids_av made no user at all', len(owner_call('GET', '/api/admin/users')[1]['users']) == len(n_before))
    s, r = call(kid3, 'POST', '/api/kids/av/agree', {}); chk('av: kid3 agrees', s == 200)
    s, r = call(mom3, 'POST', '/api/kids/av/agree', {}); chk('av: mom3 agrees', s == 200)
    s, r = owner_call('POST', '/api/admin/users/%d/features' % kid3['id'], {'features': {'kids_av': True}}); chk('av: admin enables for kid3 after agreement', s == 200 and r['features']['kids_av'])
    s, r = owner_call('POST', '/api/admin/users/%d/features' % mom3['id'], {'features': {'kids_av': True}}); chk('av: admin enables for mom3 after agreement', s == 200 and r['features']['kids_av'])
    s, r = call(kid3, 'GET', '/api/kids/av'); chk('av: status now reachable, both off', s == 200 and r == {'mic': {'on': False, 'live': False}, 'cam': {'on': False, 'live': False}})
    cid3 = kid3['id']
    s, r = call(mom3, 'POST', '/api/family/child/%d/av/open' % cid3, {'kind': 'mic'}); chk('av: open refused while child toggle is off', s == 400 and r['error'] == 'off')
    s, r = call(kid3, 'POST', '/api/kids/av', {'mic': True}); chk('av: kid3 turns mic on (no PIN needed)', s == 200 and r['mic'])
    s, r = call(stranger, 'POST', '/api/family/child/%d/av/open' % cid3, {'kind': 'mic'}); chk('av: a non-parent cannot open', s == 403)
    s, r = call(mom3, 'POST', '/api/family/child/%d/av/open' % cid3, {'kind': 'mic'}); chk('av: linked parent opens mic', s == 200 and r['ok'])
    s, r = call(kid3, 'GET', '/api/kids/av'); chk('av: child sees it is live now', s == 200 and r['mic']['live'])
    import base64 as _b64
    chunk3 = _b64.b64encode(b'a-short-audio-chunk').decode()
    s, r = call(kid3, 'POST', '/api/kids/av/push', {'kind': 'mic', 'data': chunk3, 'mime': 'audio/webm'}); chk('av: child pushes a chunk', s == 200 and r['ok'])
    s, r = call(kid3, 'POST', '/api/kids/av/push', {'kind': 'mic', 'data': 'z' * 450000, 'mime': 'audio/webm'}); chk('av: oversized push body rejected (413) before parsing', s == 413)
    s, r = call(mom3, 'GET', '/api/family/child/%d/av/pull?kind=mic' % cid3); chk('av: parent pulls the live chunk (oversized push did not overwrite it)', s == 200 and r.get('live') and r.get('chunk') == chunk3)
    s, r = call(stranger, 'GET', '/api/family/child/%d/av/pull?kind=mic' % cid3); chk('av: a non-parent cannot pull', s == 403)
    s, r = call(mom3, 'POST', '/api/family/child/%d/av/close' % cid3, {'kind': 'mic'}); chk('av: parent closes', s == 200 and r['ok'])
    s, r = call(kid3, 'GET', '/api/kids/av'); chk('av: child sees live go false again', s == 200 and not r['mic']['live'])
    s, r = call(kid3, 'POST', '/api/kids/av', {'mic': False}); chk('av: kid3 turns mic back off', s == 200 and not r['mic'])
    # ---- parent invite code: a brand-new child device joins with ONLY the code, no token ever ----
    mom4 = A.add('Mom4')
    s, r = call(mom4, 'POST', '/api/family/code', {}); pcode = r.get('code'); chk('parent gets an invite code', s == 200 and len(pcode or '') == 6)
    s, r = raw(None, None, 'GET', '/api/kids/code/check?code=000000'); chk('no-auth code check: bad', s == 200 and r['ok'] is False)
    s, r = raw(None, None, 'GET', '/api/kids/code/check?code=%s' % pcode); chk('no-auth code check: good', s == 200 and r['ok'] is True)
    DEV4 = 'device-id-for-a-brand-new-kid-4567'
    s, r = raw(None, None, 'POST', '/api/kids/join', {'code': '000000', 'device': DEV4, 'name': 'Chintu', 'age': 7, 'cls': '2', 'avatar': '🐼', 'newPin': '1234'})
    chk('join: wrong code refused, no account made', s == 400 and r['error'] == 'code')
    s, r = raw(None, None, 'POST', '/api/kids/join', {'code': pcode, 'device': DEV4, 'name': 'Chintu', 'age': 7, 'cls': '2', 'avatar': '🐼', 'newPin': '1234'})
    chk('join: correct code creates the account + hands back a token', s == 200 and r.get('token') and r['profile']['name'] == 'Chintu')
    kid_tok, kid_id = r['token'], r['profile']['uid']
    s, r = raw(kid_tok, DEV4, 'GET', '/api/kids/me'); chk('new kid can use its own fresh token', s == 200 and r['profile']['name'] == 'Chintu')
    s, r = call(mom4, 'GET', '/api/family/children'); chk('mom is already linked to the new kid, no separate link step', s == 200 and any(c['id'] == kid_id for c in r['children']))
    s, r = raw(kid_tok, DEV4, 'GET', '/api/me'); chk('new kid account cannot use business/student (feature-locked)', s == 200 and r['features']['kids'] and not r['features']['student'] and not r['features']['business'] and not r['features']['kids_av'])
    s, r = raw('wrong-device-token-not-real', 'some-other-device-id-16ch', 'GET', '/api/kids/me'); chk('a stranger cannot use a fake token', s == 401)
    s, r = raw(None, None, 'POST', '/api/kids/join', {'code': pcode, 'device': 'short', 'name': 'Xx', 'newPin': '1234'}); chk('join: bad device id refused', s == 400 and r['error'] == 'device')
    s, r = raw(None, None, 'POST', '/api/kids/join', {'code': pcode, 'device': DEV4 + 'b', 'name': '', 'newPin': '1234'}); chk('join: bad name refused, no half-made account', s == 400 and r['error'] == 'name')
    n_users_before = len(owner_call('GET', '/api/admin/users')[1]['users'])
    s, r = raw(None, None, 'POST', '/api/kids/join', {'code': pcode, 'device': DEV4 + 'c', 'name': 'x' * 100000, 'newPin': '1234'})
    chk('join: oversized no-auth body rejected (413) before parsing, no account made', s == 413 and len(owner_call('GET', '/api/admin/users')[1]['users']) == n_users_before)
finally:
    srv.terminate()
    try: srv.wait(5)
    except Exception: srv.kill()
print('t28kids_api: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
