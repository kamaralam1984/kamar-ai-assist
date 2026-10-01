"""Piyu Kids: the server side of Kids mode and the Family (parent) link. Free, standard library only.

  * a child's profile, daily routine, screen-time limits, safe places (home / school / ...) are kept here, so a PARENT on another phone can read and change them;
  * the child's progress events (routine done, stars, games, lessons, stories) are stored for the parent's report;
  * the child's phone posts its location only while the PARENT has given consent; the server decides "arrived / left" (geofence), "late", "location off", SOS
    and writes alerts that the parent's phone fetches;
  * location points are kept 7 days, events 60 days, alerts 30 days; nothing else about the child is stored.
"""
import base64, hashlib, hmac, json, math, os, re, secrets, threading, time

DAY = 86400000
KINDS = ('routine_done', 'star', 'game', 'lesson', 'story', 'speak', 'photo', 'session', 'badge', 'level', 'mood', 'weak')
PLACE_TYPES = ('home', 'school', 'tuition', 'other')
HHMM = re.compile(r'^([01]?\d|2[0-3]):[0-5]\d$')
DEFAULT_ROUTINE = [
    {'id': 'wake', 'icon': '🌅', 'title': 'Uth jao', 'time': '06:30', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'brush', 'icon': '🪥', 'title': 'Brush karo', 'time': '06:45', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'food', 'icon': '🥣', 'title': 'Nashta karo', 'time': '07:15', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'school', 'icon': '🎒', 'title': 'School jao', 'time': '07:45', 'days': [1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'home', 'icon': '✏️', 'title': 'Homework karo', 'time': '17:00', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'play', 'icon': '⚽', 'title': 'Khelo', 'time': '18:00', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'dinner', 'icon': '🍛', 'title': 'Khana khao', 'time': '20:00', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
    {'id': 'sleep', 'icon': '🌙', 'title': 'So jao', 'time': '21:00', 'days': [0, 1, 2, 3, 4, 5, 6], 'on': True},
]
DEFAULT_CFG = {'routine': DEFAULT_ROUTINE, 'limit_min': 90, 'bed': {'from': '21:00', 'to': '06:30'}, 'places': [], 'late_min': 30, 'gps_off_min': 20,
               'school': {'arrive_by': '08:30', 'days': [1, 2, 3, 4, 5]}, 'loc_every': 2, 'av': {'mic': False, 'cam': False}}
AV_KINDS = ('mic', 'cam')
AV_STALE_MS = 20000                                                     # a parent who hasn't polled this long is treated as "not watching"
AV_MAX_MS = 15 * 60000                                                  # a live session must be re-opened (fresh notice to the child) after this long
AV_MAX_CHUNK = 260 * 1024                                               # raw bytes, before base64 (one short audio clip or one small camera frame)

SCHEMA = """
CREATE TABLE IF NOT EXISTS kid_profile(uid INTEGER PRIMARY KEY, name TEXT, age INTEGER, cls TEXT, avatar TEXT, pin_hash TEXT, created INTEGER, consent INTEGER DEFAULT 0, consent_at INTEGER);
CREATE TABLE IF NOT EXISTS kid_config(uid INTEGER PRIMARY KEY, json TEXT, updated INTEGER);
CREATE TABLE IF NOT EXISTS kid_state(uid INTEGER, place_id TEXT, inside INTEGER DEFAULT 0, since INTEGER, PRIMARY KEY(uid, place_id));
CREATE TABLE IF NOT EXISTS kid_flags(uid INTEGER, key TEXT, at INTEGER, PRIMARY KEY(uid, key));
CREATE TABLE IF NOT EXISTS kid_events(id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, at INTEGER, kind TEXT, data TEXT);
CREATE INDEX IF NOT EXISTS kid_events_uid ON kid_events(uid, at);
CREATE TABLE IF NOT EXISTS locs(id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, at INTEGER, lat REAL, lng REAL, acc REAL, batt INTEGER);
CREATE INDEX IF NOT EXISTS locs_uid ON locs(uid, at);
CREATE TABLE IF NOT EXISTS loc_share(uid INTEGER PRIMARY KEY, on_ INTEGER DEFAULT 0, at INTEGER, lat REAL, lng REAL);
CREATE TABLE IF NOT EXISTS family_links(child_uid INTEGER, parent_uid INTEGER, since INTEGER, PRIMARY KEY(child_uid, parent_uid));
CREATE TABLE IF NOT EXISTS family_codes(code TEXT PRIMARY KEY, child_uid INTEGER, exp INTEGER);
CREATE TABLE IF NOT EXISTS parent_codes(code TEXT PRIMARY KEY, parent_uid INTEGER, exp INTEGER);
CREATE TABLE IF NOT EXISTS kid_msgs(id INTEGER PRIMARY KEY AUTOINCREMENT, child_uid INTEGER, parent_uid INTEGER, at INTEGER, text TEXT);
CREATE TABLE IF NOT EXISTS parent_alerts(id INTEGER PRIMARY KEY AUTOINCREMENT, parent_uid INTEGER, child_uid INTEGER, at INTEGER, kind TEXT, title TEXT, body TEXT, lat REAL, lng REAL, seen INTEGER DEFAULT 0);
CREATE INDEX IF NOT EXISTS parent_alerts_p ON parent_alerts(parent_uid, id);
CREATE TABLE IF NOT EXISTS kid_av_agree(uid INTEGER PRIMARY KEY, at INTEGER, ip TEXT, ver TEXT);
"""
AV_AGREE_TEXT_VERSION = '1'                                               # bump this if the agreement wording changes; old agreements then no longer count


def haversine(lat1, lng1, lat2, lng2):
    """metres between two points"""
    R = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    a = math.sin((p2 - p1) / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(math.radians(lng2 - lng1) / 2) ** 2
    return 2 * R * math.asin(min(1.0, math.sqrt(a)))


def _num(x, lo, hi, d):
    try:
        v = float(x)
    except (TypeError, ValueError):
        return d
    return d if v != v else max(lo, min(hi, v))


def _clip(s, n):
    return re.sub(r'[\x00-\x1f<>]', '', str(s or '')).strip()[:n]


def hm_to_min(s):
    m = HHMM.match(str(s or ''))
    return int(m.group(1)) * 60 + int(s.split(':')[1]) if m else 0


class Kids:
    def __init__(self, acc):
        self.acc = acc
        self.lock = acc.lock
        with acc._con() as c:
            c.executescript(SCHEMA)
        self._pin_fail = {}
        self._pin_lock = threading.Lock()
        self._link_fail = {}                                                 # parent uid -> times of wrong family codes; None -> all parents
        self._av = {}                                                        # (child_uid, 'mic'|'cam') -> live session; in memory only, never written to disk
        self._av_lock = threading.Lock()

    def _c(self):
        return self.acc._con()

    # ------------------------------------------------------------------ profile + parent PIN
    def _hash_pin(self, pin, salt=None):
        salt = salt or secrets.token_hex(8)
        return 'pin$%s$%s' % (salt, hashlib.pbkdf2_hmac('sha256', ('piyu-pin:' + str(pin)).encode(), salt.encode(), 60000).hex())

    def set_profile(self, uid, name, age, cls, avatar, pin=None):
        name = _clip(name, 30)
        if len(name) < 1:
            return 'name'
        if pin is not None and not re.match(r'^\d{4}$', str(pin)):
            return 'pin'
        now = int(time.time() * 1000)
        with self.lock, self._c() as c:
            old = c.execute('SELECT pin_hash FROM kid_profile WHERE uid=?', (uid,)).fetchone()
            ph = self._hash_pin(pin) if pin is not None else (old['pin_hash'] if old else None)
            if not ph:
                return 'pin'
            c.execute('INSERT INTO kid_profile(uid,name,age,cls,avatar,pin_hash,created) VALUES(?,?,?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET name=excluded.name, age=excluded.age, cls=excluded.cls, avatar=excluded.avatar, pin_hash=excluded.pin_hash',
                      (uid, name, int(_num(age, 2, 18, 8)), _clip(cls, 20), _clip(avatar, 8) or '🦁', ph, now))
            if not c.execute('SELECT 1 FROM kid_config WHERE uid=?', (uid,)).fetchone():
                c.execute('INSERT INTO kid_config(uid,json,updated) VALUES(?,?,?)', (uid, json.dumps(DEFAULT_CFG), now))
        return None

    def profile(self, uid):
        with self._c() as c:
            r = c.execute('SELECT uid,name,age,cls,avatar,created,consent,consent_at FROM kid_profile WHERE uid=?', (uid,)).fetchone()
        return dict(r) if r else None

    def check_pin(self, uid, pin):
        """True/False; 5 wrong tries in 10 minutes lock the PIN for that child"""
        now = time.time()
        with self._pin_lock:
            tries = [t for t in self._pin_fail.get(uid, []) if now - t < 600]
            self._pin_fail[uid] = tries
            if len(tries) >= 5:
                return None
            self._pin_fail[uid] = tries + [now]                              # count this try BEFORE checking (parallel guesses cannot share one slot)
        with self._c() as c:
            r = c.execute('SELECT pin_hash FROM kid_profile WHERE uid=?', (uid,)).fetchone()
        ok = False
        if r and r['pin_hash']:
            try:
                _, salt, h = r['pin_hash'].split('$')
                ok = hmac.compare_digest(self._hash_pin(pin, salt).split('$')[2], h)
            except Exception:
                ok = False
        if ok:
            with self._pin_lock:
                self._pin_fail.pop(uid, None)
        return ok

    def change_pin(self, uid, old, new):
        if not re.match(r'^\d{4}$', str(new)):
            return 'pin'
        ok = self.check_pin(uid, old)
        if ok is None:
            return 'locked'
        if not ok:
            return 'wrong'
        return self.set_profile(uid, *(lambda p: (p['name'], p['age'], p['cls'], p['avatar']))(self.profile(uid)), pin=new)

    # ------------------------------------------------------------------ configuration (set by the parent)
    def config(self, uid):
        with self._c() as c:
            r = c.execute('SELECT json FROM kid_config WHERE uid=?', (uid,)).fetchone()
        cfg = json.loads(json.dumps(DEFAULT_CFG))
        if r:
            try:
                cfg.update(json.loads(r['json']))
            except Exception:
                pass
        return cfg

    def set_config(self, uid, new):
        try:
            return self._set_config(uid, new)
        except (TypeError, ValueError, AttributeError, OverflowError):
            return 'json'

    def _set_config(self, uid, new):
        cfg = self.config(uid)
        if not isinstance(new, dict):
            return 'json'
        if 'routine' in new:
            out, seen = [], set()
            for it in (new['routine'] or [])[:20]:
                if not isinstance(it, dict):
                    continue
                iid = re.sub(r'[^a-z0-9_]', '', str(it.get('id') or secrets.token_hex(3)).lower())[:12] or secrets.token_hex(3)
                if iid in seen or not HHMM.match(str(it.get('time', ''))):
                    continue
                seen.add(iid)
                out.append({'id': iid, 'icon': _clip(it.get('icon'), 4) or '⭐', 'title': _clip(it.get('title'), 40) or 'Kaam', 'time': str(it['time']).zfill(5),
                            'days': sorted({int(d) for d in (it.get('days') or []) if str(d).isdigit() and 0 <= int(d) <= 6}) or [0, 1, 2, 3, 4, 5, 6], 'on': bool(it.get('on', True))})
            cfg['routine'] = out
        if 'limit_min' in new:
            cfg['limit_min'] = int(_num(new['limit_min'], 0, 600, 90))
        if isinstance(new.get('bed'), dict):
            f, t = str(new['bed'].get('from', '')), str(new['bed'].get('to', ''))
            if HHMM.match(f) and HHMM.match(t):
                cfg['bed'] = {'from': f.zfill(5), 'to': t.zfill(5)}
        if 'late_min' in new:
            cfg['late_min'] = int(_num(new['late_min'], 5, 180, 30))
        if 'gps_off_min' in new:
            cfg['gps_off_min'] = int(_num(new['gps_off_min'], 10, 120, 20))
        if 'loc_every' in new:
            cfg['loc_every'] = int(_num(new['loc_every'], 1, 10, 2))
        if isinstance(new.get('school'), dict) and HHMM.match(str(new['school'].get('arrive_by', ''))):
            cfg['school'] = {'arrive_by': str(new['school']['arrive_by']).zfill(5), 'days': sorted({int(d) for d in (new['school'].get('days') or []) if str(d).isdigit() and 0 <= int(d) <= 6})}
        if 'places' in new:
            places, ids = [], set()
            for p in (new['places'] or [])[:10]:
                if not isinstance(p, dict) or p.get('type') not in PLACE_TYPES:
                    continue
                lat, lng = _num(p.get('lat'), -90, 90, None), _num(p.get('lng'), -180, 180, None)
                if lat is None or lng is None:
                    continue
                pid = re.sub(r'[^a-z0-9_]', '', str(p.get('id') or secrets.token_hex(3)).lower())[:12] or secrets.token_hex(3)
                if pid in ids:
                    continue
                ids.add(pid)
                places.append({'id': pid, 'name': _clip(p.get('name'), 30) or p['type'].title(), 'type': p['type'], 'lat': round(lat, 6), 'lng': round(lng, 6), 'r': int(_num(p.get('r'), 50, 1000, 100))})
            cfg['places'] = places
            with self.lock, self._c() as c:                                  # forget "inside" for places that no longer exist
                c.execute('DELETE FROM kid_state WHERE uid=? AND place_id NOT IN (%s)' % ','.join('?' * len(ids)) if ids else 'DELETE FROM kid_state WHERE uid=?', (uid, *ids) if ids else (uid,))
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_config(uid,json,updated) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET json=excluded.json, updated=excluded.updated', (uid, json.dumps(cfg), int(time.time() * 1000)))
        return None

    def set_consent(self, uid, on):
        with self.lock, self._c() as c:
            c.execute('UPDATE kid_profile SET consent=?, consent_at=? WHERE uid=?', (1 if on else 0, int(time.time() * 1000) if on else None, uid))
            if not on:
                c.execute('DELETE FROM kid_state WHERE uid=?', (uid,))
                c.execute('DELETE FROM kid_flags WHERE uid=?', (uid,))
                c.execute('DELETE FROM locs WHERE uid=?', (uid,))                # no consent -> no stored location history
                c.execute("UPDATE parent_alerts SET lat=NULL, lng=NULL WHERE child_uid=? AND kind!='sos'", (uid,))
        return True

    # ------------------------------------------------------------------ the live mic/camera AGREEMENT (only the account owner's own family gets this free;
    # every other user must agree to it themselves, in their own account, before the owner turns it on for them in the admin panel)
    def av_agree(self, uid, ip=''):
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_av_agree(uid,at,ip,ver) VALUES(?,?,?,?) ON CONFLICT(uid) DO UPDATE SET at=excluded.at, ip=excluded.ip, ver=excluded.ver',
                      (uid, int(time.time() * 1000), _clip(ip, 64), AV_AGREE_TEXT_VERSION))
        return True

    def av_agreed(self, uid):
        with self._c() as c:
            r = c.execute('SELECT at, ver FROM kid_av_agree WHERE uid=?', (uid,)).fetchone()
        return bool(r and r['ver'] == AV_AGREE_TEXT_VERSION)

    def av_agreement(self, uid):
        with self._c() as c:
            r = c.execute('SELECT at, ver FROM kid_av_agree WHERE uid=?', (uid,)).fetchone()
        return dict(r) if r else None

    # ------------------------------------------------------------------ live mic / camera (only while the CHILD's own toggle is on; never recorded)
    def _av_purge(self, uid, kind, now):
        """drop a parent's claim once they stop polling (AV_STALE_MS) or after AV_MAX_MS (must re-open -> a fresh notice to the child). Caller holds _av_lock."""
        key = (uid, kind)
        sess = self._av.get(key)
        if not sess:
            return None
        for pid in [p for p, v in sess['parents'].items() if now - v['last'] > AV_STALE_MS or now - v['started'] > AV_MAX_MS]:
            sess['parents'].pop(pid, None)
        if not sess['parents']:
            self._av.pop(key, None)
            return None
        return sess

    def av_set(self, uid, mic=None, cam=None):
        """the CHILD's own switch (no PIN: this is the child's decision, not the parent's). Turning a kind off ends any live session for it at once."""
        if not self.profile(uid):
            return None
        cfg = self.config(uid)
        av = dict(cfg.get('av') or {'mic': False, 'cam': False})
        if mic is not None:
            av['mic'] = bool(mic)
        if cam is not None:
            av['cam'] = bool(cam)
        cfg['av'] = av
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_config(uid,json,updated) VALUES(?,?,?) ON CONFLICT(uid) DO UPDATE SET json=excluded.json, updated=excluded.updated', (uid, json.dumps(cfg), int(time.time() * 1000)))
        with self._av_lock:
            for kind in AV_KINDS:
                if not av.get(kind):
                    self._av.pop((uid, kind), None)
        return av

    def av_status(self, uid):
        """for the child's own phone: which switches are on, and whether a parent is ACTUALLY watching right now (drives the on-screen notice)."""
        cfg = self.config(uid)
        now = int(time.time() * 1000)
        out = {}
        with self._av_lock:
            for kind in AV_KINDS:
                out[kind] = {'on': bool((cfg.get('av') or {}).get(kind)), 'live': bool(self._av_purge(uid, kind, now))}
        return out

    def av_open(self, parent, uid, kind):
        """-> (ok, reason).  Only a linked parent, and only while the CHILD has that switch on. Logged as an event (no media is ever stored)."""
        if kind not in AV_KINDS or not self.is_parent(parent, uid):
            return False, 'denied'
        if not (self.config(uid).get('av') or {}).get(kind):
            return False, 'off'
        now = int(time.time() * 1000)
        with self._av_lock:
            sess = self._av.setdefault((uid, kind), {'parents': {}, 'chunk': None, 'mime': '', 'at': 0})
            sess['parents'][parent] = {'last': now, 'started': now}
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_events(uid,at,kind,data) VALUES(?,?,?,?)', (uid, now, 'av_open', json.dumps({'kind': kind})))
        return True, None

    def av_close(self, parent, uid, kind):
        if kind not in AV_KINDS:
            return False
        with self._av_lock:
            sess = self._av.get((uid, kind))
            if sess:
                sess['parents'].pop(parent, None)
                if not sess['parents']:
                    self._av.pop((uid, kind), None)
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_events(uid,at,kind,data) VALUES(?,?,?,?)', (uid, int(time.time() * 1000), 'av_close', json.dumps({'kind': kind})))
        return True

    def av_push(self, uid, kind, data_b64, mime):
        """the child uploads the newest chunk; kept in memory only (never written to disk/DB), and only while a parent is actually watching."""
        if kind not in AV_KINDS or not data_b64 or not isinstance(data_b64, str) or len(data_b64) > int(AV_MAX_CHUNK * 1.4):
            return False
        now = int(time.time() * 1000)
        with self._av_lock:
            sess = self._av_purge(uid, kind, now)
            if not sess:
                return False                                                # nobody is watching: nothing to do with it
            try:
                raw = base64.b64decode(data_b64, validate=True)
            except Exception:
                return False
            if not raw or len(raw) > AV_MAX_CHUNK:
                return False
            sess['chunk'], sess['mime'], sess['at'] = data_b64, _clip(mime, 60) or 'application/octet-stream', now
        return True

    def av_pull(self, parent, uid, kind):
        """-> dict for the parent's live view, or None (not linked, switch off, or this parent never opened it)."""
        if kind not in AV_KINDS or not self.is_parent(parent, uid):
            return None
        now = int(time.time() * 1000)
        with self._av_lock:
            sess = self._av_purge(uid, kind, now)
            if not sess or parent not in sess['parents']:
                return None
            sess['parents'][parent]['last'] = now
            chunk, mime, at = sess['chunk'], sess['mime'], sess['at']
        return {'live': True, 'chunk': chunk, 'mime': mime, 'at': at}

    def _av_drop(self, uid):
        """forget every live session that touches this account, as a child or as a watching parent (used on unlink / delete)."""
        with self._av_lock:
            for key in list(self._av.keys()):
                if key[0] == uid:
                    self._av.pop(key, None)
                else:
                    sess = self._av.get(key)
                    if sess:
                        sess['parents'].pop(uid, None)
                        if not sess['parents']:
                            self._av.pop(key, None)

    # ------------------------------------------------------------------ progress events (for the parent's report)
    def add_events(self, uid, events):
        n, now = 0, int(time.time() * 1000)
        if not isinstance(events, list) or not self.profile(uid):
            return 0
        with self.lock, self._c() as c:
            if c.execute('SELECT COUNT(*) FROM kid_events WHERE uid=? AND at>?', (uid, now - 3600000)).fetchone()[0] > 2000:
                return 0                                                     # flood guard
            for e in events[:200]:
                if not isinstance(e, dict) or e.get('kind') not in KINDS:
                    continue
                at = int(_num(e.get('at'), now - 7 * DAY, now + 60000, now))
                data = json.dumps(e.get('data') if isinstance(e.get('data'), (dict, list, str, int, float)) else {}, ensure_ascii=False)[:500]
                c.execute('INSERT INTO kid_events(uid,at,kind,data) VALUES(?,?,?,?)', (uid, at, e['kind'], data))
                n += 1
        return n

    # ------------------------------------------------------------------ family links
    def link_code(self, child):
        with self.lock, self._c() as c:
            c.execute('DELETE FROM family_codes WHERE exp<? OR child_uid=?', (int(time.time() * 1000), child))
            while True:
                code = ''.join(secrets.choice('0123456789') for _ in range(6))
                if not c.execute('SELECT 1 FROM family_codes WHERE code=?', (code,)).fetchone():
                    break
            c.execute('INSERT INTO family_codes(code,child_uid,exp) VALUES(?,?,?)', (code, child, int(time.time() * 1000) + 15 * 60000))
        return code

    def link(self, parent, code):
        """-> (child_uid, None) | (None, 'code'|'self'|'slow').  Wrong codes are limited per parent (5 / 15 min) and for the whole server (60 / 10 min)."""
        now = time.time()
        with self._pin_lock:
            mine = [t for t in self._link_fail.get(parent, []) if now - t < 900]
            allf = [t for t in self._link_fail.get(None, []) if now - t < 600]
            self._link_fail[parent], self._link_fail[None] = mine, allf
            if len(mine) >= 5 or len(allf) >= 60:
                return None, 'slow'
            if len(self._link_fail) > 5000:
                self._link_fail = {None: allf, parent: mine}
        with self.lock, self._c() as c:
            r = c.execute('SELECT child_uid, exp FROM family_codes WHERE code=?', (str(code or '').strip(),)).fetchone()
            if not r or r['exp'] < now * 1000:
                with self._pin_lock:
                    self._link_fail[parent] = mine + [now]; self._link_fail[None] = allf + [now]
                return None, 'code'
            if r['child_uid'] == parent:
                return None, 'self'
            c.execute('INSERT OR REPLACE INTO family_links(child_uid,parent_uid,since) VALUES(?,?,?)', (r['child_uid'], parent, int(time.time() * 1000)))
            c.execute('DELETE FROM family_codes WHERE code=?', (str(code).strip(),))
            return r['child_uid'], None

    def unlink(self, child, parent):
        with self.lock, self._c() as c:
            c.execute('DELETE FROM family_links WHERE child_uid=? AND parent_uid=?', (child, parent))
            c.execute('DELETE FROM parent_alerts WHERE child_uid=? AND parent_uid=?', (child, parent))     # an ex-parent keeps no locations
            c.execute('DELETE FROM kid_msgs WHERE child_uid=? AND parent_uid=?', (child, parent))
        with self._av_lock:
            for kind in AV_KINDS:                                           # an ex-parent instantly loses any live mic/camera session too
                sess = self._av.get((child, kind))
                if sess:
                    sess['parents'].pop(parent, None)
                    if not sess['parents']:
                        self._av.pop((child, kind), None)

    # ------------------------------------------------------------------ the PARENT's own invite code (so a brand-new child device never needs a
    # server token: it enters this code, which both creates its own account AND links it to this parent, in one step -- see server.kids_join)
    def parent_code(self, parent):
        with self.lock, self._c() as c:
            c.execute('DELETE FROM parent_codes WHERE exp<? OR parent_uid=?', (int(time.time() * 1000), parent))
            while True:
                code = ''.join(secrets.choice('0123456789') for _ in range(6))
                if not c.execute('SELECT 1 FROM parent_codes WHERE code=?', (code,)).fetchone():
                    break
            c.execute('INSERT INTO parent_codes(code,parent_uid,exp) VALUES(?,?,?)', (code, parent, int(time.time() * 1000) + 30 * 60000))
        return code

    def parent_code_peek(self, code):
        """-> parent_uid, or None for a bad/expired code. Read-only; brute-force limiting is the caller's job (server.py has the IP)."""
        with self._c() as c:
            r = c.execute('SELECT parent_uid, exp FROM parent_codes WHERE code=?', (str(code or '').strip(),)).fetchone()
        return r['parent_uid'] if r and r['exp'] >= time.time() * 1000 else None

    def parent_code_link(self, code, child):
        parent = self.parent_code_peek(code)
        if parent is None or parent == child:
            return None
        with self.lock, self._c() as c:
            c.execute('INSERT OR REPLACE INTO family_links(child_uid,parent_uid,since) VALUES(?,?,?)', (child, parent, int(time.time() * 1000)))
        return parent

    def children_of(self, parent):
        with self._c() as c:
            return [r[0] for r in c.execute('SELECT child_uid FROM family_links WHERE parent_uid=? ORDER BY since', (parent,))]

    def parents_of(self, child):
        with self._c() as c:
            return [r[0] for r in c.execute('SELECT parent_uid FROM family_links WHERE child_uid=?', (child,))]

    def is_parent(self, parent, child):
        with self._c() as c:
            return bool(c.execute('SELECT 1 FROM family_links WHERE child_uid=? AND parent_uid=?', (child, parent)).fetchone())

    # ------------------------------------------------------------------ location, geofence, alerts
    def _alert(self, child, kind, title, body, lat=None, lng=None, c=None):
        now = int(time.time() * 1000)
        own = c is None
        con = c or self._c()
        try:
            for p in self.parents_of(child):
                con.execute('INSERT INTO parent_alerts(parent_uid,child_uid,at,kind,title,body,lat,lng) VALUES(?,?,?,?,?,?,?,?)', (p, child, now, kind, title, body, lat, lng))
                con.execute('DELETE FROM parent_alerts WHERE parent_uid=? AND id NOT IN (SELECT id FROM parent_alerts WHERE parent_uid=? ORDER BY id DESC LIMIT 300)', (p, p))
            if own:
                con.commit()
        finally:
            if own:
                con.close()

    def _flag(self, uid, key):
        with self._c() as c:
            r = c.execute('SELECT at FROM kid_flags WHERE uid=? AND key=?', (uid, key)).fetchone()
        return r['at'] if r else None

    def _set_flag(self, uid, key, at=None):
        with self.lock, self._c() as c:
            c.execute('INSERT OR REPLACE INTO kid_flags(uid,key,at) VALUES(?,?,?)', (uid, key, at or int(time.time() * 1000)))

    def _clear_flag(self, uid, key):
        with self.lock, self._c() as c:
            c.execute('DELETE FROM kid_flags WHERE uid=? AND key=?', (uid, key))

    def post_loc(self, uid, lat, lng, acc=0, batt=None, at=None):
        """-> (ok, reason).  Stored only while the parent's consent is on. Runs the geofence."""
        p = self.profile(uid)
        if not p or not p['consent']:
            return False, 'consent'
        lat, lng = _num(lat, -90, 90, None), _num(lng, -180, 180, None)
        if lat is None or lng is None:
            return False, 'coords'
        now = int(time.time() * 1000)
        at = int(_num(at, now - 3600000, now + 60000, now)); acc = _num(acc, 0, 100000, 0)
        with self.lock, self._c() as c:
            if not c.execute('SELECT 1 FROM locs WHERE uid=? AND at>?', (uid, now - 5000)).fetchone():     # more than one stored fix per 5 s is just a flood
                c.execute('INSERT INTO locs(uid,at,lat,lng,acc,batt) VALUES(?,?,?,?,?,?)', (uid, at, lat, lng, acc, None if batt is None else int(_num(batt, 0, 100, 0))))
        was_off = self._flag(uid, 'gps_off')
        if was_off:
            self._clear_flag(uid, 'gps_off')
            self._alert(uid, 'gps_on', '📍 %s ki location wapas aa gayi' % p['name'], 'Location phir se aa rahi hai.', lat, lng)
        if acc <= 150:
            self._geofence(uid, p, lat, lng, now)
        return True, None

    def _geofence(self, uid, p, lat, lng, now):
        cfg = self.config(uid)
        for pl in cfg['places']:
            d = haversine(lat, lng, pl['lat'], pl['lng'])
            with self._c() as c:
                r = c.execute('SELECT inside FROM kid_state WHERE uid=? AND place_id=?', (uid, pl['id'])).fetchone()
            inside = bool(r and r['inside'])
            now_in = (d <= pl['r'] * 1.3) if inside else (d <= pl['r'])
            if r and now_in == inside:
                continue
            if not r:                                                        # first time we see this place: just remember where the child is, no alert
                with self.lock, self._c() as c:
                    c.execute('INSERT OR REPLACE INTO kid_state(uid,place_id,inside,since) VALUES(?,?,?,?)', (uid, pl['id'], 1 if now_in else 0, now))
                continue
            with self.lock, self._c() as c:
                c.execute('INSERT OR REPLACE INTO kid_state(uid,place_id,inside,since) VALUES(?,?,?,?)', (uid, pl['id'], 1 if now_in else 0, now))
            t = time.strftime('%I:%M %p', time.gmtime(now / 1000 + 330 * 60))
            icon = {'home': '🏠', 'school': '🏫', 'tuition': '📚'}.get(pl['type'], '📍')
            if now_in:
                self._alert(uid, 'arrive', '%s %s %s pahunch gaya' % ('✅' if pl['type'] == 'school' else icon, p['name'], pl['name']), '%s — %s' % (pl['name'], t), lat, lng)
                self._clear_flag(uid, 'late_home')
                if pl['type'] == 'school':
                    self._set_flag(uid, 'school_ok_%s' % time.strftime('%Y%m%d', time.gmtime(now / 1000 + 330 * 60)))
            else:
                self._alert(uid, 'leave', '%s %s %s se nikal gaya' % (icon, p['name'], pl['name']), '%s — %s' % (pl['name'], t), lat, lng)
                if pl['type'] in ('school', 'tuition'):
                    self._set_flag(uid, 'late_home', now)
                    self._clear_flag(uid, 'late_sent')
            with self.lock, self._c() as c:
                c.execute('INSERT INTO kid_events(uid,at,kind,data) VALUES(?,?,?,?)', (uid, now, 'mood', json.dumps({'geo': 'arrive' if now_in else 'leave', 'place': pl['name']})))

    CHECKINS = {'ok': 'Main theek hoon ✅', 'home': 'Main ghar pahunch gaya 🏠', 'school': 'Main school pahunch gaya 🏫', 'late': 'Mujhe thodi der ho jayegi ⏰', 'call': 'Mujhe phone karo 📞', 'pick': 'Mujhe lene aa jao 🚗'}

    def checkin(self, uid, key):
        p = self.profile(uid)
        if not p or key not in self.CHECKINS:
            return False
        last = self.last_loc(uid) if p['consent'] else None
        self._alert(uid, 'checkin', '💬 %s: %s' % (p['name'], self.CHECKINS[key]), '', last and last['lat'], last and last['lng'])
        return True

    def send_msg(self, parent, child, text):
        text = _clip(text, 200)
        if not text or not self.is_parent(parent, child):
            return False
        with self.lock, self._c() as c:
            c.execute('INSERT INTO kid_msgs(child_uid,parent_uid,at,text) VALUES(?,?,?,?)', (child, parent, int(time.time() * 1000), text))
            c.execute('DELETE FROM kid_msgs WHERE child_uid=? AND id NOT IN (SELECT id FROM kid_msgs WHERE child_uid=? ORDER BY id DESC LIMIT 30)', (child, child))
        return True

    def msgs_since(self, child, since=0):
        with self._c() as c:
            return [dict(r) for r in c.execute('SELECT id,at,text FROM kid_msgs WHERE child_uid=? AND id>? ORDER BY id LIMIT 10', (child, int(since or 0)))]

    def sos(self, uid, lat=None, lng=None):
        p = self.profile(uid) or {'name': 'Bachcha'}
        lat, lng = _num(lat, -90, 90, None), _num(lng, -180, 180, None)
        if lat is None or lng is None:
            last = self.last_loc(uid) if p.get('consent') else None
            lat, lng = (last['lat'], last['lng']) if last else (None, None)
        with self._c() as c:
            if c.execute("SELECT 1 FROM parent_alerts WHERE child_uid=? AND kind='sos' AND at>?", (uid, int(time.time() * 1000) - 15000)).fetchone():
                return True                                                  # repeated taps: one alert is enough
        self._alert(uid, 'sos', '🚨 SOS — %s ko madad chahiye!' % p['name'], 'Abhi dekhiye aur phone kijiye.', lat, lng)
        return True

    def last_loc(self, uid):
        with self._c() as c:
            r = c.execute('SELECT * FROM locs WHERE uid=? ORDER BY at DESC LIMIT 1', (uid,)).fetchone()
        return dict(r) if r else None

    def locs(self, uid, hours=24, limit=500):
        t0 = int(time.time() * 1000) - int(_num(hours, 1, 168, 24)) * 3600000
        with self._c() as c:
            return [dict(r) for r in c.execute('SELECT at,lat,lng,acc,batt FROM locs WHERE uid=? AND at>? ORDER BY at DESC LIMIT ?', (uid, t0, limit))][::-1]

    def share_set(self, uid, on, lat=None, lng=None):
        now = int(time.time() * 1000)
        with self.lock, self._c() as c:
            c.execute('INSERT INTO loc_share(uid,on_,at,lat,lng) VALUES(?,?,?,?,?) ON CONFLICT(uid) DO UPDATE SET on_=excluded.on_, at=CASE WHEN excluded.lat IS NOT NULL THEN excluded.at ELSE at END, lat=COALESCE(excluded.lat, lat), lng=COALESCE(excluded.lng, lng)',
                      (uid, 1 if on else 0, now, _num(lat, -90, 90, None), _num(lng, -180, 180, None)))
            if not on:
                c.execute('UPDATE loc_share SET lat=NULL, lng=NULL WHERE uid=?', (uid,))

    def parent_pos(self, children_parents):
        for pid in children_parents:
            with self._c() as c:
                r = c.execute('SELECT lat,lng,at FROM loc_share WHERE uid=? AND on_=1 AND lat IS NOT NULL', (pid,)).fetchone()
            if r and time.time() * 1000 - r['at'] < 30 * 60000:
                return dict(r)
        return None

    def alerts_since(self, parent, since=0, limit=30):
        with self._c() as c:
            return [dict(r) for r in c.execute('SELECT * FROM parent_alerts WHERE parent_uid=? AND id>? ORDER BY id LIMIT ?', (parent, int(since or 0), limit))]

    def alerts_recent(self, parent, n=40):
        with self._c() as c:
            return [dict(r) for r in c.execute('SELECT * FROM parent_alerts WHERE parent_uid=? ORDER BY id DESC LIMIT ?', (parent, n))]

    def alerts_seen(self, parent, upto):
        with self.lock, self._c() as c:
            c.execute('UPDATE parent_alerts SET seen=1 WHERE parent_uid=? AND id<=?', (parent, int(upto or 0)))

    # ------------------------------------------------------------------ the parent's view
    def day_key(self, ms):
        return time.strftime('%Y-%m-%d', time.gmtime(ms / 1000 + 330 * 60))

    def report(self, child, days=7):
        now = int(time.time() * 1000)
        t0 = now - days * DAY
        with self._c() as c:
            ev = [dict(r) for r in c.execute('SELECT at,kind,data FROM kid_events WHERE uid=? AND at>? ORDER BY at', (child, t0))]
        per = {}
        weak = {}
        for e in ev:
            d = per.setdefault(self.day_key(e['at']), {'routine': 0, 'stars': 0, 'minutes': 0.0, 'games': 0, 'lessons': 0, 'stories': 0})
            try:
                data = json.loads(e['data'])
            except Exception:
                data = {}
            k = e['kind']
            if k == 'routine_done':
                d['routine'] += 1
            elif k == 'star':
                d['stars'] += int(_num((data or {}).get('n', 1), 0, 20, 1)) if isinstance(data, dict) else 1
            elif k == 'session':
                d['minutes'] += _num((data or {}).get('min', 0), 0, 600, 0) if isinstance(data, dict) else 0
            elif k == 'game':
                d['games'] += 1
            elif k == 'weak':
                if isinstance(data, dict) and data.get('tag'):
                    weak[str(data['tag'])[:40]] = weak.get(str(data['tag'])[:40], 0) + 1
            elif k == 'lesson':
                d['lessons'] += 1
            elif k == 'story':
                d['stories'] += 1
        out = []
        for i in range(days - 1, -1, -1):
            k = self.day_key(now - i * DAY)
            d = per.get(k, {'routine': 0, 'stars': 0, 'minutes': 0.0, 'games': 0, 'lessons': 0, 'stories': 0})
            out.append(dict(d, day=k, minutes=round(d['minutes'], 1)))
        streak = 0
        for d in reversed(out):
            if d['routine'] or d['minutes'] or d['games'] or d['lessons']:
                streak += 1
            elif d['day'] != out[-1]['day']:
                break
        cfg = self.config(child)
        today = out[-1]
        sched = [r for r in cfg['routine'] if r['on'] and int(time.strftime('%w', time.gmtime(now / 1000 + 330 * 60))) in r['days']]
        done_ids = set()
        for e in ev:
            if e['kind'] == 'routine_done' and self.day_key(e['at']) == today['day']:
                try:
                    done_ids.add(str(json.loads(e['data']).get('id')))
                except Exception:
                    pass
        return {'days': out, 'streak': streak, 'weak': sorted(weak.items(), key=lambda x: -x[1])[:5],
                'today': {'scheduled': len(sched), 'done': len([r for r in sched if r['id'] in done_ids]), 'missed': [r['title'] for r in sched if r['id'] not in done_ids and hm_to_min(r['time']) < (int(time.gmtime(now / 1000 + 330 * 60).tm_hour) * 60 + time.gmtime(now / 1000 + 330 * 60).tm_min)], 'done_ids': sorted(done_ids)},
                'stars_total': sum(d['stars'] for d in out), 'minutes_total': round(sum(d['minutes'] for d in out), 1)}

    def feed(self, child, n=40):
        with self._c() as c:
            return [dict(r) for r in c.execute("SELECT at,kind,data FROM kid_events WHERE uid=? AND kind IN ('routine_done','star','game','lesson','story','speak','photo','badge','level') ORDER BY at DESC LIMIT ?", (child, n))]

    def summary(self, child, parent=None):
        p = self.profile(child)
        if not p:
            return None
        last = self.last_loc(child) if p['consent'] else None               # no consent -> no location, whatever is stored
        cfg = self.config(child)
        pos = self.parent_pos([parent] if parent is not None else [])      # only the asking parent's own shared position, never another parent's
        places = []
        if last:
            for pl in cfg['places']:
                places.append({'id': pl['id'], 'name': pl['name'], 'type': pl['type'], 'm': round(haversine(last['lat'], last['lng'], pl['lat'], pl['lng']))})
        rep = self.report(child, 7)
        with self._c() as c:
            st = {r['place_id']: bool(r['inside']) for r in c.execute('SELECT place_id,inside FROM kid_state WHERE uid=?', (child,))}
        return {'id': child, 'name': p['name'], 'age': p['age'], 'cls': p['cls'], 'avatar': p['avatar'], 'consent': bool(p['consent']), 'consentAt': p['consent_at'],
                'last': last, 'places': places, 'inside': [pl['name'] for pl in cfg['places'] if st.get(pl['id'])],
                'parentDist': round(haversine(last['lat'], last['lng'], pos['lat'], pos['lng'])) if last and pos else None,
                'streak': rep['streak'], 'today': rep['today'], 'starsToday': rep['days'][-1]['stars'], 'minutesToday': rep['days'][-1]['minutes'], 'limit': cfg['limit_min']}

    def export(self, child):
        with self._c() as c:
            ev = [dict(r) for r in c.execute('SELECT at,kind,data FROM kid_events WHERE uid=? ORDER BY at', (child,))]
            lc = [dict(r) for r in c.execute('SELECT at,lat,lng,acc FROM locs WHERE uid=? ORDER BY at', (child,))]
        return {'profile': self.profile(child), 'config': self.config(child), 'events': ev, 'locations': lc}

    def delete_data(self, child, keep_profile=False):
        self._av_drop(child)                                                # kill any live mic/camera session first -- the most sensitive thing to forget
        with self.lock, self._c() as c:
            for t in ('kid_events', 'locs', 'kid_state', 'kid_flags'):
                c.execute('DELETE FROM %s WHERE uid=?' % t, (child,))
            c.execute('DELETE FROM parent_alerts WHERE child_uid=?', (child,))
            c.execute('DELETE FROM kid_msgs WHERE child_uid=?', (child,))
            if not keep_profile:
                c.execute('DELETE FROM family_links WHERE parent_uid=?', (child,))          # the same account as a PARENT: links, alerts, messages, shared position
                c.execute('DELETE FROM parent_alerts WHERE parent_uid=?', (child,))
                c.execute('DELETE FROM kid_msgs WHERE parent_uid=?', (child,))
                c.execute('DELETE FROM loc_share WHERE uid=?', (child,))
                for t in ('kid_profile', 'kid_config'):
                    c.execute('DELETE FROM %s WHERE uid=?' % t, (child,))
                c.execute('DELETE FROM family_links WHERE child_uid=?', (child,))
                c.execute('DELETE FROM family_codes WHERE child_uid=?', (child,))
        with self._pin_lock:
            self._pin_fail.pop(child, None)

    # ------------------------------------------------------------------ background checks (run about once a minute)
    def tick(self, now=None):
        now = now or int(time.time() * 1000)
        with self._c() as c:
            kids = [dict(r) for r in c.execute('SELECT uid,name FROM kid_profile WHERE consent=1')]
        hhmm = time.gmtime(now / 1000 + 330 * 60)
        mins, wd = hhmm.tm_hour * 60 + hhmm.tm_min, int(time.strftime('%w', hhmm))
        day = time.strftime('%Y%m%d', hhmm)
        n = 0
        for k in kids:
            uid, cfg = k['uid'], self.config(k['uid'])
            last = self.last_loc(uid)
            # location switched off / phone dead during the day
            if 6 * 60 <= mins <= 22 * 60 and last and now - last['at'] > cfg['gps_off_min'] * 60000 and not self._flag(uid, 'gps_off'):
                self._set_flag(uid, 'gps_off', now); n += 1
                self._alert(uid, 'gps_off', '⚠ %s ki location %d minute se nahi aa rahi' % (k['name'], cfg['gps_off_min']), 'Phone band, battery khatam ya location band ho sakti hai.', last['lat'], last['lng'])
            # left school / tuition, not home in time
            lh = self._flag(uid, 'late_home')
            if lh and now - lh > cfg['late_min'] * 60000 and not self._flag(uid, 'late_sent'):
                self._set_flag(uid, 'late_sent', now); n += 1
                self._alert(uid, 'late', '⏰ %s ko nikle %d minute ho gaye, abhi ghar nahi pahuncha' % (k['name'], int((now - lh) / 60000)), 'Aakhri jagah dekhne ke liye app kholiye.', last and last['lat'], last and last['lng'])
            # school not reached by the set time
            sc = cfg['school']
            if wd in sc['days'] and mins >= hm_to_min(sc['arrive_by']) and mins < hm_to_min(sc['arrive_by']) + 120 and any(p['type'] == 'school' for p in cfg['places']) \
                    and not self._flag(uid, 'school_ok_' + day) and not self._flag(uid, 'school_late_' + day):
                self._set_flag(uid, 'school_late_' + day, now); n += 1
                self._alert(uid, 'school_late', '🏫 %s abhi tak school nahi pahuncha (%s tak aana tha)' % (k['name'], sc['arrive_by']), 'Parent se baat kijiye.', last and last['lat'], last and last['lng'])
        return n

    def purge(self):
        now = int(time.time() * 1000)
        with self.lock, self._c() as c:
            c.execute('DELETE FROM locs WHERE at<?', (now - 7 * DAY,))
            c.execute('DELETE FROM kid_events WHERE at<?', (now - 60 * DAY,))
            c.execute('DELETE FROM parent_alerts WHERE at<?', (now - 30 * DAY,))
            c.execute('DELETE FROM kid_flags WHERE at<? AND key LIKE "school_%"', (now - 3 * DAY,))
            c.execute('DELETE FROM family_codes WHERE exp<?', (now,))
            c.execute('DELETE FROM parent_codes WHERE exp<?', (now,))
