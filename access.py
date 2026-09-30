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
import hashlib, hmac, os, re, secrets, shutil, sqlite3, threading, time

NAME_RE = re.compile(r'^[^\x00-\x1f<>]{2,60}$')
SCHEMA = """
CREATE TABLE IF NOT EXISTS users(
  id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT NOT NULL, phone TEXT DEFAULT '', token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'pending', reg_device TEXT DEFAULT '', device_hash TEXT DEFAULT '',
  created INTEGER, approved INTEGER, bound INTEGER, last_seen INTEGER, last_ip TEXT DEFAULT '', note TEXT DEFAULT '');
CREATE INDEX IF NOT EXISTS users_regdev ON users(reg_device);
"""


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

    # ---------- data of one user ----------
    def user_dir(self, uid):
        return os.path.join(self.dir, 'users', str(int(uid)))

    def user_db(self, uid):
        d = self.user_dir(uid)
        os.makedirs(d, exist_ok=True)
        return os.path.join(d, 'piyu.sqlite3')
