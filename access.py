"""Piyu access control: who may use this server.

Model (only active when the server has an owner token, PIYU_TOKEN):
  * the OWNER uses PIYU_TOKEN: works on any device, sees the admin panel and the owner's own data;
  * every other person is a USER: they ask for access (name + phone + a secret id made by their device), the backend makes a token for
    them that does NOTHING until the owner approves and hands it over (phone / WhatsApp). The first device that presents the token
    is bound to it for ever: the same token on another device is refused until the owner resets the binding.
  * every user has a separate database (users/<id>/piyu.sqlite3): nobody sees anybody else's documents.

status:  pending  -> asked, owner has not approved      (token exists but is refused)
         approved -> owner approved, token not used yet  (first device will bind)
         active   -> bound to one device
         revoked  -> switched off by the owner
"""
import hashlib, hmac, ipaddress, json, os, queue, re, secrets, shutil, sqlite3, threading, time, urllib.request

NAME_RE = re.compile(r'^[^\x00-\x1f<>]{2,60}$')
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', reg_device TEXT DEFAULT '', device_hash TEXT DEFAULT '',
  created INTEGER, approved INTEGER, bound INTEGER, last_seen INTEGER, last_ip TEXT DEFAULT '', note TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS users_regdev ON users(reg_device);
CREATE TABLE IF NOT EXISTS sessions(id TEXT PRIMARY KEY, uid INTEGER, start INTEGER, last INTEGER, ip TEXT, country TEXT DEFAULT '', cc TEXT DEFAULT '', city TEXT DEFAULT '', ua TEXT DEFAULT '', device TEXT DEFAULT '', secs REAL DEFAULT 0, mode TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS sessions_uid ON sessions(uid, start);
CREATE TABLE IF NOT EXISTS usage(uid INTEGER, day TEXT, tab TEXT, secs REAL DEFAULT 0, PRIMARY KEY(uid, day, tab));
CREATE TABLE IF NOT EXISTS logins(id INTEGER PRIMARY KEY AUTOINCREMENT, uid INTEGER, at INTEGER, ip TEXT, country TEXT DEFAULT '', cc TEXT DEFAULT '', city TEXT DEFAULT '', ua TEXT DEFAULT '', ok INTEGER DEFAULT 1, why TEXT DEFAULT '');
CREATE TABLE IF NOT EXISTS audit(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, actor TEXT, action TEXT, target TEXT, detail TEXT);
CREATE TABLE IF NOT EXISTS security(id INTEGER PRIMARY KEY AUTOINCREMENT, at INTEGER, kind TEXT, ip TEXT, country TEXT DEFAULT '', detail TEXT);
CREATE TABLE IF NOT EXISTS geo(ip TEXT PRIMARY KEY, country TEXT, cc TEXT, region TEXT, city TEXT, isp TEXT, at INTEGER);
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS admin_sessions(hash TEXT PRIMARY KEY, exp INTEGER);
"""
FEATURES = ('voice', 'ai', 'web', 'docs', 'student', 'business')
EXTRA_COLS = (('features', "TEXT DEFAULT ''"), ('country', "TEXT DEFAULT ''"), ('cc', "TEXT DEFAULT ''"), ('city', "TEXT DEFAULT ''"), ('last_ua', "TEXT DEFAULT ''"), ('first_seen', 'INTEGER'))
TZ_MIN = int(os.environ.get('PIYU_TZ_MIN', '330'))                      # the day boundary for usage statistics (default: India, UTC+5:30)
EMAIL_RE = re.compile(r'^[A-Za-z0-9._%+\-]{1,64}@[A-Za-z0-9.\-]{1,190}\.[A-Za-z]{2,24}$')
PASS_RE = re.compile(r'^[\x21-\x7e]{8,64}$')
SID_RE = re.compile(r'^[0-9a-f]{8,40}$')


def day_of(ms):
    return time.strftime('%Y-%m-%d', time.gmtime(ms / 1000 + TZ_MIN * 60))


def is_private(ip):
    try:
        a = ipaddress.ip_address(ip)
        return a.is_private or a.is_loopback or a.is_link_local
    except ValueError:
        return True


def sha(s):
    return hashlib.sha256(('piyu-device:' + str(s)).encode('utf-8')).hexdigest()


def clean_phone(p):
    d = re.sub(r'\D', '', str(p or ''))
    return d[:15] if 8 <= len(d) <= 15 else ''


class Access:
    def __init__(self, data_dir):
        self.dir = data_dir
        self.path = os.path.join(data_dir, 'access.sqlite3')
        self.lock = threading.RLock()
        os.makedirs(data_dir, exist_ok=True)
        with self._con() as c:
            c.executescript(SCHEMA)
            have = {r[1] for r in c.execute('PRAGMA table_info(users)')}
            for col, typ in EXTRA_COLS:
                if col not in have:
                    c.execute('ALTER TABLE users ADD COLUMN %s %s' % (col, typ))
        self._geo_q, self._geo_pending, self._geo_thread = queue.Queue(), set(), None
        self.geo_on = os.environ.get('PIYU_GEOIP', '1') != '0'
        try:
            os.chmod(self.path, 0o600)
        except OSError:
            pass

    def _con(self):
        c = sqlite3.connect(self.path, timeout=15)
        c.row_factory = sqlite3.Row
        return c

    @staticmethod
    def new_token():
        return secrets.token_urlsafe(24)

    # ---------- a person asks for access ----------
    def register(self, name, phone, device, ip=''):
        name = re.sub(r'\s+', ' ', str(name or '')).strip()
        if not NAME_RE.match(name):
            return None, 'name'
        device = str(device or '')
        if not 16 <= len(device) <= 200:
            return None, 'device'
        dh = sha(device)
        with self.lock, self._con() as c:
            r = c.execute('SELECT * FROM users WHERE reg_device=?', (dh,)).fetchone()
            if r:
                return dict(r), None                                   # same device asked before: same request, no duplicates
            if c.execute("SELECT COUNT(*) FROM users WHERE status='pending'").fetchone()[0] >= 300:
                return None, 'full'
            c.execute('INSERT INTO users(name,phone,token,status,reg_device,created,last_ip) VALUES(?,?,?,?,?,?,?)',
                      (name, clean_phone(phone), self.new_token(), 'pending', dh, int(time.time() * 1000), ip))
            return dict(c.execute('SELECT * FROM users WHERE id=last_insert_rowid()').fetchone()), None

    def status_for_device(self, device):
        if not 16 <= len(str(device or '')) <= 200:
            return 'none'
        with self._con() as c:
            r = c.execute('SELECT status FROM users WHERE reg_device=? OR device_hash=?', (sha(device), sha(device))).fetchone()
        return r['status'] if r else 'none'

    # ---------- the owner adds / changes users ----------
    def add(self, name, phone=''):                                     # owner creates a user by hand (already approved)
        name = re.sub(r'\s+', ' ', str(name or '')).strip()
        if not NAME_RE.match(name):
            return None
        now = int(time.time() * 1000)
        with self.lock, self._con() as c:
            c.execute('INSERT INTO users(name,phone,token,status,created,approved) VALUES(?,?,?,?,?,?)', (name, clean_phone(phone), self.new_token(), 'approved', now, now))
            return dict(c.execute('SELECT * FROM users WHERE id=last_insert_rowid()').fetchone())

    def get(self, uid):
        with self._con() as c:
            r = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
        return dict(r) if r else None

    def list(self):
        with self._con() as c:
            return [dict(r) for r in c.execute('SELECT * FROM users ORDER BY (status="pending") DESC, created DESC')]

    def act(self, uid, action):
        now = int(time.time() * 1000)
        with self.lock, self._con() as c:
            u = c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone()
            if not u:
                return None
            if action == 'approve':
                if u['status'] in ('pending', 'revoked'):
                    c.execute("UPDATE users SET status=?, approved=? WHERE id=?", ('active' if u['device_hash'] else 'approved', now, uid))
            elif action == 'revoke':
                c.execute("UPDATE users SET status='revoked' WHERE id=?", (uid,))
            elif action == 'restore':
                c.execute("UPDATE users SET status=? WHERE id=?", ('active' if u['device_hash'] else 'approved', uid))
            elif action == 'reset':                                    # the person got a new phone / cleared the app: let the next device bind
                c.execute("UPDATE users SET device_hash='', bound=NULL, status=CASE WHEN status='active' THEN 'approved' ELSE status END WHERE id=?", (uid,))
            elif action == 'regen':                                    # a new token; old one dies at once, binding is cleared
                c.execute("UPDATE users SET token=?, device_hash='', bound=NULL, status=CASE WHEN status='active' THEN 'approved' ELSE status END WHERE id=?", (self.new_token(), uid))
            elif action == 'delete':
                c.execute('DELETE FROM users WHERE id=?', (uid,))
                shutil.rmtree(self.user_dir(uid), ignore_errors=True)
                for t in ('sessions', 'usage', 'logins'):
                    c.execute('DELETE FROM %s WHERE uid=?' % t, (uid,))
                return {'deleted': True}
            else:
                return 'unknown'
            return dict(c.execute('SELECT * FROM users WHERE id=?', (uid,)).fetchone())

    def note(self, uid, text):
        with self.lock, self._con() as c:
            c.execute('UPDATE users SET note=? WHERE id=?', (str(text or '')[:200], uid))

    # ---------- every request of a user passes here ----------
    def authorize(self, token, device, ip=''):
        """-> (user, None) or (None, 'token' | 'pending' | 'revoked' | 'device')"""
        token = str(token or '')
        if not token or len(token) > 200:
            return None, 'token'
        hit = None
        with self.lock, self._con() as c:
            for r in c.execute('SELECT * FROM users'):                 # constant-time compare against every token: no timing leak
                if hmac.compare_digest(r['token'], token):
                    hit = r
            if hit is None:
                return None, 'token'
            if hit['status'] == 'revoked':
                return None, 'revoked'
            if hit['status'] == 'pending':
                return None, 'pending'
            dev = str(device or '')
            if not 16 <= len(dev) <= 200:
                return None, 'device'
            dh, now = sha(dev), int(time.time() * 1000)
            if not hit['device_hash']:                                  # first device to use this token: bound for ever
                c.execute("UPDATE users SET device_hash=?, bound=?, status='active' WHERE id=?", (dh, now, hit['id']))
            elif not hmac.compare_digest(hit['device_hash'], dh):
                return None, 'device'
            c.execute('UPDATE users SET last_seen=?, last_ip=? WHERE id=?', (now, ip, hit['id']))
            return dict(c.execute('SELECT * FROM users WHERE id=?', (hit['id'],)).fetchone()), None


    # ---------- per-user feature switches ----------
    @staticmethod
    def feature_map(u):
        f = {k: True for k in FEATURES}
        try:
            for k, v in json.loads((u or {}).get('features') or '{}').items():
                if k in f:
                    f[k] = bool(v)
        except Exception:
            pass
        return f

    def set_features(self, uid, feats):
        cur = self.feature_map(self.get(uid))
        for k, v in (feats or {}).items():
            if k in cur:
                cur[k] = bool(v)
        if not cur['student'] and not cur['business']:
            cur['business'] = True                                     # a user always keeps at least one kind of account
        with self.lock, self._con() as c:
            c.execute('UPDATE users SET features=? WHERE id=?', (json.dumps(cur), uid))
        return cur

    # ---------- the owner creates a user / sets a password ----------
    def create(self, name, phone='', password=None, owner_token='', feats=None):
        name = re.sub(r'\s+', ' ', str(name or '')).strip()
        if not NAME_RE.match(name):
            return None, 'name'
        if password:
            err = self._pass_ok(password, owner_token, None)
            if err:
                return None, err
        now = int(time.time() * 1000)
        with self.lock, self._con() as c:
            c.execute('INSERT INTO users(name,phone,token,status,created,approved) VALUES(?,?,?,?,?,?)', (name, clean_phone(phone), password or self.new_token(), 'approved', now, now))
            u = dict(c.execute('SELECT * FROM users WHERE id=last_insert_rowid()').fetchone())
        if feats:
            self.set_features(u['id'], feats)
            u = self.get(u['id'])
        return u, None

    def _pass_ok(self, value, owner_token, uid):
        if not PASS_RE.match(str(value or '')):
            return 'weak'                                              # 8-64 printable characters, no spaces
        if owner_token and hmac.compare_digest(str(value), owner_token):
            return 'taken'
        with self._con() as c:
            for r in c.execute('SELECT id, token FROM users'):
                if r['id'] != uid and hmac.compare_digest(r['token'], str(value)):
                    return 'taken'
        return None

    def setpass(self, uid, value, owner_token=''):
        err = self._pass_ok(value, owner_token, uid)
        if err:
            return None, err
        with self.lock, self._con() as c:
            if not c.execute('SELECT 1 FROM users WHERE id=?', (uid,)).fetchone():
                return None, 'none'
            c.execute('UPDATE users SET token=? WHERE id=?', (str(value), uid))
        return self.get(uid), None


    # ---------- the owner's own login to the admin panel: e-mail + password (stored only as a salted PBKDF2 hash) ----------
    @staticmethod
    def _pw_hash(pw, salt=None, iters=200000):
        salt = salt or os.urandom(16)
        return 'pbkdf2$%d$%s$%s' % (iters, salt.hex(), hashlib.pbkdf2_hmac('sha256', str(pw).encode('utf-8'), salt, iters).hex())

    @staticmethod
    def _pw_check(pw, stored):
        try:
            _, it, salt, h = stored.split('$')
            got = hashlib.pbkdf2_hmac('sha256', str(pw).encode('utf-8'), bytes.fromhex(salt), int(it))
            return hmac.compare_digest(got, bytes.fromhex(h))
        except Exception:
            return False

    def has_admin(self):
        return bool(self.meta_get('admin_email'))

    def admin_email(self):
        return self.meta_get('admin_email')

    def set_admin(self, email, password):
        email = str(email or '').strip().lower()
        if not EMAIL_RE.match(email):
            return 'email'
        if not 8 <= len(str(password or '')) <= 128:
            return 'weak'
        self.meta_set('admin_email', email)
        self.meta_set('admin_hash', self._pw_hash(password))
        with self.lock, self._con() as c:
            c.execute('DELETE FROM admin_sessions')                     # a new password logs every old browser out
        return None

    def check_admin(self, email, password):
        stored = self.meta_get('admin_hash')
        ok_mail = hmac.compare_digest(str(email or '').strip().lower().encode(), (self.meta_get('admin_email') or '\0').encode())
        ok_pw = self._pw_check(password, stored or self._pw_hash('x', b'0' * 16))        # always do the slow hash: no timing hint about which part was wrong
        return bool(stored) and ok_mail and ok_pw

    def new_admin_session(self, ttl=12 * 3600):
        tok = secrets.token_urlsafe(32); now = int(time.time())
        with self.lock, self._con() as c:
            c.execute('DELETE FROM admin_sessions WHERE exp<?', (now,))
            c.execute('INSERT INTO admin_sessions(hash,exp) VALUES(?,?)', (hashlib.sha256(tok.encode()).hexdigest(), now + ttl))
        return tok

    def valid_admin_session(self, tok):
        if not tok or len(tok) > 200:
            return False
        with self._con() as c:
            r = c.execute('SELECT exp FROM admin_sessions WHERE hash=?', (hashlib.sha256(str(tok).encode()).hexdigest(),)).fetchone()
        return bool(r) and r['exp'] > time.time()

    def drop_admin_session(self, tok):
        with self.lock, self._con() as c:
            c.execute('DELETE FROM admin_sessions WHERE hash=?', (hashlib.sha256(str(tok).encode()).hexdigest(),))

    # ---------- audit + security log ----------
    def audit(self, actor, action, target='', detail=''):
        with self.lock, self._con() as c:
            c.execute('INSERT INTO audit(at,actor,action,target,detail) VALUES(?,?,?,?,?)', (int(time.time() * 1000), str(actor)[:40], str(action)[:40], str(target)[:80], str(detail)[:300]))
            c.execute('DELETE FROM audit WHERE id < (SELECT MAX(id) FROM audit) - 3000')

    def sec(self, kind, ip, detail=''):
        g = self.geo(ip) or {}
        with self.lock, self._con() as c:
            c.execute('INSERT INTO security(at,kind,ip,country,detail) VALUES(?,?,?,?,?)', (int(time.time() * 1000), kind, ip, g.get('country', ''), str(detail)[:200]))
            c.execute('DELETE FROM security WHERE id < (SELECT MAX(id) FROM security) - 3000')

    def meta_get(self, key, default=''):
        with self._con() as c:
            r = c.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
        return r['value'] if r else default

    def meta_set(self, key, value):
        with self.lock, self._con() as c:
            c.execute('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, str(value)))

    # ---------- where is the user (country of the IP, from the free ip-api.com service; cached, never blocks a request) ----------
    def geo(self, ip):
        ip = str(ip or '')
        if not ip or is_private(ip):
            return {'country': 'Local network', 'cc': '--', 'region': '', 'city': '', 'isp': ''}
        with self._con() as c:
            r = c.execute('SELECT * FROM geo WHERE ip=?', (ip,)).fetchone()
        if r and time.time() * 1000 - r['at'] < 30 * 864e5:
            return dict(r)
        if self.geo_on and ip not in self._geo_pending:
            self._geo_pending.add(ip)
            self._geo_q.put(ip)
            if not self._geo_thread or not self._geo_thread.is_alive():
                self._geo_thread = threading.Thread(target=self._geo_worker, daemon=True)
                self._geo_thread.start()
        return dict(r) if r else None

    def _geo_worker(self):
        while True:
            try:
                ip = self._geo_q.get(timeout=30)
            except queue.Empty:
                return
            try:
                with urllib.request.urlopen('http://ip-api.com/json/%s?fields=status,country,countryCode,regionName,city,isp' % ip, timeout=4) as r:
                    j = json.loads(r.read())
                if j.get('status') == 'success':
                    self.geo_store(ip, j.get('country', ''), j.get('countryCode', ''), j.get('regionName', ''), j.get('city', ''), j.get('isp', ''))
            except Exception:
                with self._con() as c:                                  # remember the failure for a while: do not hammer the service
                    c.execute('INSERT OR REPLACE INTO geo(ip,country,cc,region,city,isp,at) VALUES(?,?,?,?,?,?,?)', (ip, '', '', '', '', '', int(time.time() * 1000) - 29 * 864e5))
            finally:
                self._geo_pending.discard(ip)
            time.sleep(1.5)                                             # the free service allows 45 requests a minute

    def geo_store(self, ip, country, cc, region='', city='', isp=''):
        now = int(time.time() * 1000)
        with self.lock, self._con() as c:
            c.execute('INSERT OR REPLACE INTO geo(ip,country,cc,region,city,isp,at) VALUES(?,?,?,?,?,?,?)', (ip, country, cc, region, city, isp, now))
            c.execute("UPDATE sessions SET country=?, cc=?, city=? WHERE ip=? AND country=''", (country, cc, city, ip))
            c.execute("UPDATE logins SET country=?, cc=?, city=? WHERE ip=? AND country=''", (country, cc, city, ip))
            c.execute("UPDATE security SET country=? WHERE ip=? AND country=''", (country, ip))
            c.execute("UPDATE users SET country=?, cc=?, city=? WHERE last_ip=?", (country, cc, city, ip))

    # ---------- usage tracking: sessions, time on each page ----------
    def track(self, uid, sid, ip, ua, device, tab, dt, vis, mode=''):
        if not SID_RE.match(str(sid or '')):
            return False
        now = int(time.time() * 1000)
        try:
            dt = max(0.0, min(60.0, float(dt or 0))) if vis else 0.0
        except (TypeError, ValueError):
            dt = 0.0
        tab = re.sub(r'[^a-z0-9_:\-]', '', str(tab or 'app').lower())[:24] or 'app'
        mode = str(mode or '')[:12]
        g = self.geo(ip) or {}
        with self.lock, self._con() as c:
            s = c.execute('SELECT id FROM sessions WHERE id=?', (sid,)).fetchone()
            if not s:
                c.execute('INSERT INTO sessions(id,uid,start,last,ip,country,cc,city,ua,device,secs,mode) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)',
                          (sid, uid, now, now, ip, g.get('country', ''), g.get('cc', ''), g.get('city', ''), str(ua)[:200], str(device)[:16], dt, str(mode)[:12]))
                c.execute('INSERT INTO logins(uid,at,ip,country,cc,city,ua,ok,why) VALUES(?,?,?,?,?,?,?,1,?)', (uid, now, ip, g.get('country', ''), g.get('cc', ''), g.get('city', ''), str(ua)[:200], 'session'))
                c.execute('DELETE FROM sessions WHERE start < ?', (now - 120 * 864e5,))
                c.execute('DELETE FROM logins WHERE at < ?', (now - 120 * 864e5,))
            else:
                c.execute('UPDATE sessions SET last=?, secs=secs+?, mode=CASE WHEN ?<>\'\' THEN ? ELSE mode END WHERE id=?', (now, dt, str(mode)[:12], str(mode)[:12], sid))
            if dt > 0:
                c.execute('INSERT INTO usage(uid,day,tab,secs) VALUES(?,?,?,?) ON CONFLICT(uid,day,tab) DO UPDATE SET secs=secs+excluded.secs', (uid, day_of(now), tab, dt))
            if uid:
                c.execute('UPDATE users SET last_seen=?, last_ip=?, last_ua=?, country=CASE WHEN ?<>\'\' THEN ? ELSE country END, cc=CASE WHEN ?<>\'\' THEN ? ELSE cc END, city=CASE WHEN ?<>\'\' THEN ? ELSE city END, first_seen=COALESCE(first_seen, ?) WHERE id=?',
                          (now, ip, str(ua)[:200], g.get('country', ''), g.get('country', ''), g.get('cc', ''), g.get('cc', ''), g.get('city', ''), g.get('city', ''), now, uid))
        return True

    def online(self, now=None, window=90000):
        now = now or int(time.time() * 1000)
        with self._con() as c:
            return [dict(r) for r in c.execute('SELECT * FROM sessions WHERE last>? ORDER BY last DESC', (now - window,))]

    def usage_of(self, uid, days=30):
        now = int(time.time() * 1000); first = day_of(now - days * 864e5)
        with self._con() as c:
            tabs = [dict(r) for r in c.execute('SELECT tab, SUM(secs) AS secs FROM usage WHERE uid=? AND day>=? GROUP BY tab ORDER BY secs DESC', (uid, first))]
            byday = [dict(r) for r in c.execute('SELECT day, SUM(secs) AS secs FROM usage WHERE uid=? AND day>=? GROUP BY day ORDER BY day', (uid, first))]
            n = c.execute('SELECT COUNT(*) FROM sessions WHERE uid=?', (uid,)).fetchone()[0]
            tot = c.execute('SELECT COALESCE(SUM(secs),0) FROM usage WHERE uid=?', (uid,)).fetchone()[0]
        return {'tabs': tabs, 'days': byday, 'sessions': n, 'total': tot}

    def sessions_of(self, uid, n=15):
        with self._con() as c:
            return [dict(r) for r in c.execute('SELECT * FROM sessions WHERE uid=? ORDER BY start DESC LIMIT ?', (uid, n))]

    def logins_of(self, uid, n=15):
        with self._con() as c:
            return [dict(r) for r in c.execute('SELECT * FROM logins WHERE uid=? ORDER BY at DESC LIMIT ?', (uid, n))]

    def usage_totals(self, days=7):
        first = day_of(int(time.time() * 1000) - days * 864e5)
        with self._con() as c:
            return {r['uid']: r['secs'] for r in c.execute('SELECT uid, SUM(secs) AS secs FROM usage WHERE day>=? GROUP BY uid', (first,))}

    def trend(self, days=14):
        now = int(time.time() * 1000); first = day_of(now - (days - 1) * 864e5)
        with self._con() as c:
            rows = {r['day']: (r['u'], r['secs']) for r in c.execute('SELECT day, COUNT(DISTINCT uid) AS u, SUM(secs) AS secs FROM usage WHERE day>=? GROUP BY day', (first,))}
        out = []
        for i in range(days - 1, -1, -1):
            d = day_of(now - i * 864e5)
            out.append({'day': d, 'users': rows.get(d, (0, 0))[0], 'secs': rows.get(d, (0, 0))[1]})
        return out

    def countries(self, days=30):
        t0 = int(time.time() * 1000) - days * 864e5
        with self._con() as c:
            return [dict(r) for r in c.execute("SELECT cc, country, COUNT(DISTINCT uid) AS users, COUNT(*) AS sessions FROM sessions WHERE start>? AND country<>'' GROUP BY cc, country ORDER BY sessions DESC LIMIT 12", (t0,))]

    def recent(self, table, n=40):
        assert table in ('audit', 'security', 'logins')
        with self._con() as c:
            return [dict(r) for r in c.execute('SELECT * FROM %s ORDER BY id DESC LIMIT ?' % table, (n,))]

    def purge_user_logs(self, uid):
        with self.lock, self._con() as c:
            for t in ('sessions', 'usage', 'logins'):
                c.execute('DELETE FROM %s WHERE uid=?' % t, (uid,))

    # ---------- data of one user ----------
    def user_dir(self, uid):
        return os.path.join(self.dir, 'users', str(int(uid)))

    def user_db(self, uid):
        d = self.user_dir(uid)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, 'piyu.sqlite3')
