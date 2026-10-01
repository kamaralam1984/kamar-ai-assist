"""Server logic of Kids mode (kids.py): PIN, consent, geofence, alerts, links, tick, purge, delete."""
import os, sys, tempfile, time
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
os.environ['PIYU_GEOIP'] = '0'
from access import Access
from kids import Kids

ok = bad = 0
def chk(name, cond):
    global ok, bad
    if cond: ok += 1
    else: bad += 1; print('FAIL', name)

acc = Access(tempfile.mkdtemp()); k = Kids(acc)
kid, mom, dad = acc.add('Kid')['id'], acc.add('Mom')['id'], acc.add('Dad')['id']

# profile + PIN
chk('profile bad name', k.set_profile(kid, '', 8, '3', '🦁', '1234') == 'name')
chk('profile bad pin', k.set_profile(kid, 'Rani', 8, '3', '🦁', '12') == 'pin')
chk('profile ok', k.set_profile(kid, 'Rani', 8, '3', '🦁', '1234') is None)
chk('profile read', k.profile(kid)['name'] == 'Rani' and 'pin_hash' not in k.profile(kid))
chk('pin right', k.check_pin(kid, '1234') is True)
chk('pin wrong', k.check_pin(kid, '0000') is False)
for _ in range(4): k.check_pin(kid, '1111')
chk('pin locked after 5 wrong', k.check_pin(kid, '1234') is None)
k._pin_fail.clear()
chk('pin change wrong old', k.change_pin(kid, '9999', '4321') == 'wrong')
chk('pin change ok', k.change_pin(kid, '1234', '4321') is None and k.check_pin(kid, '4321') is True)

# config
chk('config default routine', len(k.config(kid)['routine']) == 8)
chk('config bad time dropped', k.set_config(kid, {'routine': [{'id': 'a', 'time': '25:99', 'title': 'x'}, {'id': 'b', 'time': '7:05', 'title': 'y'}]}) is None and len(k.config(kid)['routine']) == 1)
k.set_config(kid, {'limit_min': 9999}); chk('limit clamped', k.config(kid)['limit_min'] == 600)
HOME, SCH = (28.6000, 77.2000), (28.6200, 77.2200)
k.set_config(kid, {'places': [{'id': 'home', 'name': 'Ghar', 'type': 'home', 'lat': HOME[0], 'lng': HOME[1], 'r': 100},
                              {'id': 'sch', 'name': 'School', 'type': 'school', 'lat': SCH[0], 'lng': SCH[1], 'r': 150},
                              {'id': 'bad', 'name': 'x', 'type': 'nope', 'lat': 1, 'lng': 1}]})
chk('places valid only', len(k.config(kid)['places']) == 2)

# family link
code = k.link_code(kid)
chk('link bad code', k.link(mom, '000000')[1] == 'code')
chk('link self', k.link(kid, code)[1] == 'self')
chk('link ok', k.link(mom, code) == (kid, None))
chk('link single use', k.link(dad, code)[1] == 'code')
chk('is_parent', k.is_parent(mom, kid) and not k.is_parent(dad, kid))
c2 = k.link_code(kid); k.link(dad, c2); chk('two parents', set(k.parents_of(kid)) == {mom, dad})
c3 = k.link_code(kid)
with acc._con() as c: c.execute('UPDATE family_codes SET exp=1')
chk('link expired', k.link(mom, c3)[1] == 'code')

# consent gate
chk('loc refused without consent', k.post_loc(kid, *HOME) == (False, 'consent'))
k.set_consent(kid, True)
chk('loc bad coords', k.post_loc(kid, 'x', 5) == (False, 'coords'))
# geofence: first fix silent, then leave, arrive
n0 = len(k.alerts_recent(mom))
chk('first fix ok', k.post_loc(kid, HOME[0], HOME[1])[0])
chk('first fix silent', len(k.alerts_recent(mom)) == n0)
k.post_loc(kid, HOME[0], HOME[1] + 0.0012)               # ~117 m: inside 1.3*100 hysteresis, still home
chk('hysteresis no flap', len(k.alerts_recent(mom)) == n0)
k.post_loc(kid, HOME[0], HOME[1] + 0.01)                 # ~1 km away
al = k.alerts_recent(mom)
chk('leave alert to all parents', len(al) == n0 + 1 and al[0]['kind'] == 'leave' and len(k.alerts_recent(dad)) == 1)
k.post_loc(kid, SCH[0], SCH[1])
chk('arrive school alert', k.alerts_recent(mom)[0]['kind'] == 'arrive')
chk('inaccurate fix ignored by geofence', (k.post_loc(kid, HOME[0], HOME[1], acc=500) and k.alerts_recent(mom)[0]['kind'] == 'arrive'))
k.post_loc(kid, HOME[0], HOME[1] + 0.05)
k.post_loc(kid, SCH[0], SCH[1] + 0.05)
# leaving school sets late_home flag -> tick fires late alert once
k.post_loc(kid, SCH[0] + 0.0, SCH[1]); k.post_loc(kid, SCH[0], SCH[1] + 0.02)
chk('late flag set', k._flag(kid, 'late_home'))
t = int(time.time() * 1000) + 40 * 60000
before = len(k.alerts_recent(mom, 100))
k.tick(t)
kinds = [a['kind'] for a in k.alerts_recent(mom, 100)[:3]]
chk('late alert fired', 'late' in kinds)
k.tick(t + 1000); chk('late alert once', [a['kind'] for a in k.alerts_recent(mom, 100)].count('late') == 1)

# SOS / checkin / messages
chk('sos', k.sos(kid, 28.6, 77.2) and k.alerts_recent(mom)[0]['kind'] == 'sos')
chk('checkin ok', k.checkin(kid, 'home') and not k.checkin(kid, 'hack'))
chk('msg from non-parent refused', not k.send_msg(999, kid, 'hi'))
chk('msg from parent', k.send_msg(mom, kid, 'Aa jao') and k.msgs_since(kid)[0]['text'] == 'Aa jao')
chk('msgs since', k.msgs_since(kid, k.msgs_since(kid)[0]['id']) == [])
a_id = k.alerts_recent(mom)[0]['id']; k.alerts_seen(mom, a_id)
chk('alerts_since', k.alerts_since(mom, a_id) == [])

# events + report
chk('events filtered', k.add_events(kid, [{'kind': 'star', 'data': {'n': 1}}, {'kind': 'evil'}, 'x']) == 1)
chk('report runs', isinstance(k.report(kid), dict) and isinstance(k.summary(kid, mom), dict))
chk('export has data', 'Rani' in str(k.export(kid)))

# consent off clears state; purge; delete
k.set_consent(kid, False)
chk('consent off blocks loc', k.post_loc(kid, *HOME) == (False, 'consent'))
with acc._con() as c: c.execute('UPDATE locs SET at=1'); 
k.purge(); chk('old locs purged', k.locs(kid, 168) == [] and len(k.alerts_recent(mom)) > 0)
k.delete_data(kid)
chk('delete removes profile', k.profile(kid) is None and k.children_of(mom) == [])

# ---- review regressions (security)
import threading
k2 = Kids(acc); a, b, p2, p3 = (acc.add(n)['id'] for n in ('Anu K', 'Bob K', 'Parent2', 'Parent3'))
k2.set_profile(a, 'Anu', 7, '2', '🦁', '1111'); k2.set_consent(a, True)
k2.post_loc(a, 10.0, 20.0, 5); k2.link(p2, (lambda c: c)(k2.link_code(a)))
chk('summary has location with consent', k2.summary(a, p2)['last'] is not None)
k2.set_consent(a, False)
chk('consent off wipes stored locations', k2.locs(a, 168) == [] and k2.summary(a, p2)['last'] is None)
k2.sos(a); chk('sos without consent has no stored location', k2.alerts_recent(p2)[0]['lat'] is None)
k2.sos(a, 'x', {}); chk('sos junk coords ok', True)
chk('sos repeat deduped', len([x for x in k2.alerts_recent(p2) if x['kind'] == 'sos']) == 1)
# wrong-code brute force limit per parent
for _ in range(5): k2.link(p3, '%06d' % 1)
chk('link locked after 5 wrong codes', k2.link(p3, k2.link_code(a))[1] == 'slow')
# parallel PIN guesses cannot beat the 5-try lock
k2._pin_fail.clear(); res = []
ts = [threading.Thread(target=lambda i=i: res.append(k2.check_pin(a, '%04d' % (2000 + i)))) for i in range(40)]
[t.start() for t in ts]; [t.join() for t in ts]
chk('parallel pin guesses limited to 5', res.count(False) == 5 and res.count(None) == 35)
# poisoned events must not break the parent's report
k2.add_events(a, [{'kind': 'star', 'data': {'n': 'abc'}}, {'kind': 'session', 'data': {'min': 'inf'}}, {'kind': 'star', 'data': {'n': 10 ** 9}}])
chk('report survives junk events', k2.report(a)['stars_total'] <= 25)
chk('events need a profile and a list', k2.add_events(b, [{'kind': 'star'}]) == 0 and k2.add_events(a, 'x') == 0)
chk('config junk does not crash', k2.set_config(a, {'routine': 5}) == 'json' and k2.set_config(a, {'school': {'arrive_by': '8:00', 'days': ['\u00b2']}}) == 'json')
# unlink removes that parent's alerts; parent-side delete is complete; parent_pos only own
k2.set_consent(a, True); k2.share_set(p2, True, 1.0, 2.0)
chk('parentDist only from asking parent', k2.summary(a, p3)['parentDist'] is None)
k2.unlink(a, p2); chk('unlink wipes that parent alerts', k2.alerts_recent(p2) == [])
k2.link(p2, k2.link_code(a)); k2.delete_data(p2)
chk('deleting a parent account removes links and shared pos', k2.children_of(p2) == [] and k2.parent_pos([p2]) is None)
import base64 as _b64
# ---------------------------------------------------------------- live mic/camera (child's own toggle; never recorded; parent must be linked + agreed)
kid2, mom2, dad2 = acc.add('Kid2')['id'], acc.add('Mom2')['id'], acc.add('Outsider')['id']
k.set_profile(kid2, 'Vivaan', 9, '4', '🐯', '1234')
code2 = k.link_code(kid2); k.link(mom2, code2)
chk('av default off', k.av_status(kid2) == {'mic': {'on': False, 'live': False}, 'cam': {'on': False, 'live': False}})
chk('av agreement starts false', not k.av_agreed(mom2))
k.av_agree(mom2, '9.9.9.9')
chk('av agreed after agree()', k.av_agreed(mom2) and k.av_agreement(mom2)['ver'] == '1')
chk('av_set no profile -> None', k.av_set(999999, mic=True) is None)
k.av_set(kid2, mic=True)
chk('av toggle on reflected', k.av_status(kid2)['mic']['on'] and not k.av_status(kid2)['mic']['live'])
chk('av_open: outsider (not linked) refused', k.av_open(dad2, kid2, 'mic') == (False, 'denied'))
chk('av_open: cam still off', k.av_open(mom2, kid2, 'cam') == (False, 'off'))
ok2, err2 = k.av_open(mom2, kid2, 'mic')
chk('av_open: linked parent, toggle on -> ok', ok2 and err2 is None)
chk('av status now live', k.av_status(kid2)['mic']['live'])
chk('av_push: no data refused', not k.av_push(kid2, 'mic', None, 'audio/webm'))
chk('av_push: nobody watching cam -> refused', not k.av_push(kid2, 'cam', _b64.b64encode(b'x').decode(), 'image/jpeg'))
chunk = _b64.b64encode(b'tiny-audio-chunk').decode()
chk('av_push: accepted while mom is watching', k.av_push(kid2, 'mic', chunk, 'audio/webm'))
chk('av_pull: outsider refused', k.av_pull(dad2, kid2, 'mic') is None)
pulled = k.av_pull(mom2, kid2, 'mic')
chk('av_pull: mom gets the chunk', pulled and pulled['chunk'] == chunk and pulled['live'])
chk('av_push: oversized chunk rejected', not k.av_push(kid2, 'mic', _b64.b64encode(b'z' * (260 * 1024 + 10)).decode(), 'audio/webm'))
k.av_set(kid2, mic=False)                                                   # the child turns it off: live ends at once, even mid-session
chk('av off kills live status', not k.av_status(kid2)['mic']['live'])
chk('av push after child turned off: refused', not k.av_push(kid2, 'mic', chunk, 'audio/webm'))
k.av_set(kid2, mic=True); k.av_open(mom2, kid2, 'mic')
k.unlink(kid2, mom2)
chk('unlink kills a live av session at once', k.av_pull(mom2, kid2, 'mic') is None)
k.link(mom2, k.link_code(kid2)); k.av_set(kid2, mic=True); k.av_open(mom2, kid2, 'mic')
k.delete_data(kid2)
chk('delete_data purges any live av session', k.av_pull(mom2, kid2, 'mic') is None)
with k._av_lock:
    k._av[(kid2, 'mic')] = {'parents': {mom2: {'last': int(time.time() * 1000) - 999999, 'started': int(time.time() * 1000) - 999999}}, 'chunk': None, 'mime': '', 'at': 0}
chk('a stale (non-polling) parent is auto-purged', k.av_status(kid2)['mic']['live'] is False)

print('t28kids_py: %d ok, %d failed' % (ok, bad)); sys.exit(1 if bad else 0)
