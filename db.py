"""Piyu SQL layer (SQLite, Python standard library only — no paid service, one file to back up).

Tables
  meta(key, value)                        rev counter, settings, settings_at, extra top-level keys
  docs(id, name, added, updated_at, rules_json)
  blocks(id, doc_id, idx, kind, text)     every paragraph/heading of every document
  blocks_fts                              FTS5 full-text index over blocks.text (kept in sync by triggers)
  tasks(id, doc_id, title, section, alarm_at, done, done_at, missed, priority, updated_at, data)
                                          `data` is the full task JSON, so nothing is ever lost
  tombstones(kind, id, at)                deletions, so synced devices do not resurrect items
  blobs(id, type, size, created, data)    attachments
"""
import json, os, sqlite3, time

SCHEMA = """
PRAGMA journal_mode=WAL;
CREATE TABLE IF NOT EXISTS meta(key TEXT PRIMARY KEY, value TEXT);
CREATE TABLE IF NOT EXISTS docs(id TEXT PRIMARY KEY, name TEXT, added INTEGER, updated_at INTEGER, rules_json TEXT);
CREATE TABLE IF NOT EXISTS blocks(id INTEGER PRIMARY KEY AUTOINCREMENT, doc_id TEXT NOT NULL REFERENCES docs(id) ON DELETE CASCADE, idx INTEGER, kind TEXT, text TEXT);
CREATE INDEX IF NOT EXISTS blocks_doc ON blocks(doc_id, idx);
CREATE VIRTUAL TABLE IF NOT EXISTS blocks_fts USING fts5(text, content='blocks', content_rowid='id', tokenize='unicode61 remove_diacritics 0');
CREATE TRIGGER IF NOT EXISTS blocks_ai AFTER INSERT ON blocks BEGIN INSERT INTO blocks_fts(rowid, text) VALUES (new.id, new.text); END;
CREATE TRIGGER IF NOT EXISTS blocks_ad AFTER DELETE ON blocks BEGIN INSERT INTO blocks_fts(blocks_fts, rowid, text) VALUES ('delete', old.id, old.text); END;
CREATE TABLE IF NOT EXISTS tasks(id TEXT PRIMARY KEY, doc_id TEXT, title TEXT, section TEXT, alarm_at INTEGER, done INTEGER DEFAULT 0, done_at INTEGER, missed INTEGER DEFAULT 0, priority INTEGER, updated_at INTEGER, data TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS tasks_alarm ON tasks(alarm_at);
CREATE INDEX IF NOT EXISTS tasks_done ON tasks(done, done_at);
CREATE TABLE IF NOT EXISTS tombstones(kind TEXT, id TEXT, at INTEGER, PRIMARY KEY(kind, id));
CREATE TABLE IF NOT EXISTS blobs(id TEXT PRIMARY KEY, type TEXT, size INTEGER, created INTEGER, data BLOB);
CREATE TABLE IF NOT EXISTS web_cache(key TEXT PRIMARY KEY, at INTEGER, payload TEXT);
"""

KNOWN = {'docs', 'tasks', 'settings', 'settingsAt', 'tombstones'}


def connect(path):
    con = sqlite3.connect(path, timeout=30, isolation_level=None)  # we manage transactions explicitly
    con.execute('PRAGMA foreign_keys=ON')
    con.execute('PRAGMA busy_timeout=30000')
    return con


def init(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    con = connect(path)
    con.executescript(SCHEMA)
    con.execute("INSERT OR IGNORE INTO meta(key,value) VALUES('rev','0')")
    con.close()


def _meta(con, key, default=None):
    r = con.execute('SELECT value FROM meta WHERE key=?', (key,)).fetchone()
    return r[0] if r else default


def _set_meta(con, key, value):
    con.execute('INSERT INTO meta(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', (key, value))


def get_rev(con):
    return int(_meta(con, 'rev', '0'))


def is_empty(con):
    return con.execute('SELECT (SELECT COUNT(*) FROM tasks)+(SELECT COUNT(*) FROM docs)+(SELECT COUNT(*) FROM tombstones)').fetchone()[0] == 0 \
        and _meta(con, 'settings') is None


def read_state(con):
    """Rebuild the exact JSON state the browser keeps."""
    if is_empty(con):
        return None
    docs = []
    blocks = {}
    for doc_id, kind, text in con.execute('SELECT doc_id, kind, text FROM blocks ORDER BY doc_id, idx'):
        blocks.setdefault(doc_id, []).append({'k': kind, 't': text})
    for id_, name, added, upd, rules in con.execute('SELECT id,name,added,updated_at,rules_json FROM docs ORDER BY added'):
        docs.append({'id': id_, 'name': name, 'added': added, 'updatedAt': upd, 'blocks': blocks.get(id_, []), 'rules': json.loads(rules or '[]')})
    tasks = [json.loads(r[0]) for r in con.execute('SELECT data FROM tasks ORDER BY alarm_at')]
    tomb = [{'kind': k, 'id': i, 'at': a} for k, i, a in con.execute('SELECT kind,id,at FROM tombstones')]
    st = {'docs': docs, 'tasks': tasks, 'tombstones': tomb,
          'settings': json.loads(_meta(con, 'settings', '{}')), 'settingsAt': int(_meta(con, 'settings_at', '0'))}
    st.update(json.loads(_meta(con, 'extra', '{}')))
    return st


def write_state(con, state, base_rev):
    """Replace the stored state with `state` if base_rev is current. Returns new rev, or None if stale."""
    con.execute('BEGIN IMMEDIATE')
    try:
        rev = get_rev(con)
        if base_rev != rev:
            con.execute('ROLLBACK')
            return None
        # ---- docs + blocks (rewrite blocks only when a doc is new or its updatedAt changed) ----
        incoming = {d['id']: d for d in state.get('docs', [])}
        have = {r[0]: r[1] for r in con.execute('SELECT id, updated_at FROM docs')}
        for did in set(have) - set(incoming):
            con.execute('DELETE FROM docs WHERE id=?', (did,))          # cascades to blocks (+ fts via trigger)
        for did, d in incoming.items():
            upd = int(d.get('updatedAt') or d.get('added') or 0)
            if did in have and have[did] == upd:
                con.execute('UPDATE docs SET name=?, rules_json=? WHERE id=?', (d.get('name'), json.dumps(d.get('rules', []), ensure_ascii=False), did))
                continue
            con.execute('DELETE FROM blocks WHERE doc_id=?', (did,))
            con.execute('INSERT INTO docs(id,name,added,updated_at,rules_json) VALUES(?,?,?,?,?) '
                        'ON CONFLICT(id) DO UPDATE SET name=excluded.name, added=excluded.added, updated_at=excluded.updated_at, rules_json=excluded.rules_json',
                        (did, d.get('name'), d.get('added'), upd, json.dumps(d.get('rules', []), ensure_ascii=False)))
            con.executemany('INSERT INTO blocks(doc_id,idx,kind,text) VALUES(?,?,?,?)',
                            [(did, i, b.get('k', 'p'), b.get('t', '')) for i, b in enumerate(d.get('blocks', []))])
        # ---- tasks ----
        tasks = state.get('tasks', [])
        ids = {t['id'] for t in tasks}
        for (tid,) in con.execute('SELECT id FROM tasks').fetchall():
            if tid not in ids:
                con.execute('DELETE FROM tasks WHERE id=?', (tid,))
        con.executemany(
            'INSERT INTO tasks(id,doc_id,title,section,alarm_at,done,done_at,missed,priority,updated_at,data) VALUES(?,?,?,?,?,?,?,?,?,?,?) '
            'ON CONFLICT(id) DO UPDATE SET doc_id=excluded.doc_id,title=excluded.title,section=excluded.section,alarm_at=excluded.alarm_at,done=excluded.done,'
            'done_at=excluded.done_at,missed=excluded.missed,priority=excluded.priority,updated_at=excluded.updated_at,data=excluded.data',
            [(t['id'], t.get('docId'), t.get('title'), t.get('section'), t.get('alarmAt'), 1 if t.get('done') else 0, t.get('doneAt'),
              1 if t.get('missed') else 0, t.get('priority'), t.get('updatedAt'), json.dumps(t, ensure_ascii=False)) for t in tasks])
        # ---- tombstones, settings, unknown top-level keys ----
        con.execute('DELETE FROM tombstones')
        con.executemany('INSERT OR REPLACE INTO tombstones(kind,id,at) VALUES(?,?,?)', [(t['kind'], t['id'], t['at']) for t in state.get('tombstones', [])])
        _set_meta(con, 'settings', json.dumps(state.get('settings', {}), ensure_ascii=False))
        _set_meta(con, 'settings_at', str(int(state.get('settingsAt') or 0)))
        _set_meta(con, 'extra', json.dumps({k: v for k, v in state.items() if k not in KNOWN}, ensure_ascii=False))
        rev += 1
        _set_meta(con, 'rev', str(rev))
        con.execute('COMMIT')
        return rev
    except Exception:
        con.execute('ROLLBACK')
        raise


# ------------------------- queries the browser cannot do cheaply -------------------------
def search(con, q, limit=8, doc_id=None):
    """FTS5 search over all document blocks. Each word is prefix-matched; results ranked by bm25."""
    words = [w for w in ''.join(c if (c.isalnum() or c in '_₹') else ' ' for c in q).split() if w]
    if not words:
        return []
    match = ' OR '.join('"%s"*' % w.replace('"', '') for w in words[:12])
    sql = ('SELECT b.doc_id, d.name, b.idx, b.kind, b.text, bm25(blocks_fts) AS score '
           'FROM blocks_fts JOIN blocks b ON b.id = blocks_fts.rowid JOIN docs d ON d.id = b.doc_id '
           'WHERE blocks_fts MATCH ?' + (' AND b.doc_id = ?' if doc_id else '') + ' ORDER BY score LIMIT ?')
    args = [match] + ([doc_id] if doc_id else []) + [int(limit)]
    return [{'docId': r[0], 'doc': r[1], 'idx': r[2], 'kind': r[3], 'text': r[4], 'score': r[5]} for r in con.execute(sql, args)]


def stats(con, days=14, now_ms=None, tz_offset_min=0):
    """Progress numbers computed in SQL. Days are in the caller's local time (tz_offset_min = minutes east of UTC)."""
    now_ms = now_ms or int(time.time() * 1000)
    off = tz_offset_min * 60000
    day = 86400000
    today0 = ((now_ms + off) // day) * day - off
    first = today0 - (days - 1) * day
    per_day = {}
    for d, n in con.execute('SELECT (done_at + ?) / ? AS d, COUNT(*) FROM tasks WHERE done=1 AND done_at >= ? GROUP BY d', (off, day, first)):
        per_day[d * day - off] = n
    series = [{'day0': first + i * day, 'done': per_day.get(first + i * day, 0)} for i in range(days)]
    tot = con.execute('SELECT COUNT(*), SUM(done), SUM(missed), '
                      'SUM(CASE WHEN done=0 AND alarm_at < ? THEN 1 ELSE 0 END) FROM tasks', (now_ms,)).fetchone()
    ontime = con.execute('SELECT COUNT(*), SUM(CASE WHEN done_at <= alarm_at + 900000 THEN 1 ELSE 0 END) FROM tasks WHERE done=1 AND done_at IS NOT NULL AND done_at >= ? AND alarm_at IS NOT NULL', (first,)).fetchone()
    by_section = [{'section': r[0] or '—', 'total': r[1], 'done': r[2] or 0} for r in con.execute(
        'SELECT section, COUNT(*), SUM(done) FROM tasks GROUP BY section ORDER BY COUNT(*) DESC LIMIT 8')]
    # streak: consecutive days (ending today, or yesterday if today has none yet) with >= 1 completed task
    days_with = {s['day0'] for s in series if s['done']}
    cur = today0 if today0 in days_with else today0 - day
    streak = 0
    while cur in days_with:
        streak += 1
        cur -= day
    return {'total': tot[0] or 0, 'done': tot[1] or 0, 'missed': tot[2] or 0, 'overdue': tot[3] or 0,
            'onTimePct': round(100.0 * (ontime[1] or 0) / ontime[0], 1) if ontime[0] else None,
            'streak': streak, 'series': series, 'bySection': by_section}


def put_blob(con, bid, ctype, data):
    con.execute('INSERT INTO blobs(id,type,size,created,data) VALUES(?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET type=excluded.type,size=excluded.size,data=excluded.data',
                (bid, ctype, len(data), int(time.time() * 1000), data))


def get_blob(con, bid):
    return con.execute('SELECT type, data FROM blobs WHERE id=?', (bid,)).fetchone()


def del_blob(con, bid):
    con.execute('DELETE FROM blobs WHERE id=?', (bid,))


def migrate_json(con, json_path):
    """One-time import of the old data/state.json (+ blobs dir) into SQL."""
    if not os.path.exists(json_path) or not is_empty(con):
        return False
    with open(json_path, encoding='utf-8') as f:
        state = json.load(f)
    rev_path = os.path.join(os.path.dirname(json_path), 'rev.txt')
    write_state(con, state, get_rev(con))
    bdir = os.path.join(os.path.dirname(json_path), 'blobs')
    if os.path.isdir(bdir):
        for fn in os.listdir(bdir):
            if fn.endswith('.type'):
                continue
            p = os.path.join(bdir, fn)
            ct = open(p + '.type').read().strip() if os.path.exists(p + '.type') else 'application/octet-stream'
            put_blob(con, fn, ct, open(p, 'rb').read())
    os.replace(json_path, json_path + '.migrated')
    if os.path.exists(rev_path):
        os.replace(rev_path, rev_path + '.migrated')
    return True


def gc_blobs(con, older_than_ms=86400000, now_ms=None):
    """Delete attachments no task refers to any more (older than a day, so a blob uploaded a moment before its task is saved is safe).
    Uses SQLite's JSON1: every task's data->'$.attachments'[*].id is the set of referenced blobs."""
    now_ms = now_ms or int(time.time() * 1000)
    cur = con.execute(
        "DELETE FROM blobs WHERE created < ? AND id NOT IN ("
        " SELECT json_extract(a.value, '$.id') FROM tasks, json_each(tasks.data, '$.attachments') a WHERE json_extract(a.value, '$.id') IS NOT NULL)",
        (now_ms - older_than_ms,))
    return cur.rowcount


def ai_context(con, q, k=5, max_chars=2800):
    """What the local LLM may see: the best-matching document excerpts (FTS5/bm25) + the pending task list. Nothing else."""
    hits = search(con, q, k)
    ex, used = [], 0
    for h in hits:
        t = h['text'][:560]
        if used + len(t) > max_chars:
            break
        ex.append({'doc': h['doc'], 'text': t}); used += len(t)
    tasks = [{'title': r[0], 'due': r[1], 'priority': r[2]} for r in con.execute(
        'SELECT title, alarm_at, priority FROM tasks WHERE done=0 ORDER BY alarm_at LIMIT 10')]
    return ex, tasks


# ---------------------------------------------------------------- web answer cache (a repeated question costs no network)
def web_cache_get(con, key, ttl_s=7 * 86400, now=None):
    now = now or int(time.time())
    r = con.execute('SELECT at, payload FROM web_cache WHERE key=?', (key,)).fetchone()
    if not r or now - r[0] > ttl_s:
        return None
    try:
        return json.loads(r[1])
    except Exception:
        return None


def web_cache_put(con, key, obj, now=None, keep=500):
    now = now or int(time.time())
    con.execute('INSERT INTO web_cache(key,at,payload) VALUES(?,?,?) ON CONFLICT(key) DO UPDATE SET at=excluded.at, payload=excluded.payload', (key, now, json.dumps(obj, ensure_ascii=False)))
    con.execute('DELETE FROM web_cache WHERE key NOT IN (SELECT key FROM web_cache ORDER BY at DESC LIMIT ?)', (keep,))
