"""Admin helpers: what a user has done (student progress / business tasks) and how the server is doing. Read-only, standard library only."""
import json, os, shutil, time

DAY = 864e5


def _num(x, d=0):
    try:
        return float(x)
    except (TypeError, ValueError):
        return d


def student_summary(state, now_ms=None):
    """Profile + progress of a student, computed from the user's own synced state (settings, courses, attempts, cards, sdays)."""
    now = now_ms or int(time.time() * 1000)
    s = state or {}
    st = s.get('settings') or {}
    prof = {k: st.get(k) for k in ('sname', 'sage', 'sphone', 'sclass', 'sboard', 'sschool', 'smedium', 'sgoalText', 'ssubjects', 'sweakest', 'sgoal')}
    prof['mode'] = st.get('mode') or 'business'
    prof['auto'] = bool(st.get('sauto'))
    plan = st.get('splan') or {}
    prof['window'] = '%s-%s' % (plan.get('from', ''), plan.get('to', '')) if plan else ''
    courses = [c for c in (s.get('courses') or []) if isinstance(c, dict)]
    attempts = [a for a in (s.get('attempts') or []) if isinstance(a, dict)]
    cards = [c for c in (s.get('cards') or []) if isinstance(c, dict)]
    sdays = [d for d in (s.get('sdays') or []) if isinstance(d, dict)]
    cmap = {}
    for a in attempts:                                               # recent attempts count more (half-life 14 days), like the app's own analysis
        w = 0.5 ** (max(0, now - _num(a.get('at'))) / (14 * DAY))
        for it in a.get('items') or []:
            k = (a.get('course'), it.get('ch'))
            o = cmap.setdefault(k, [0.0, 0.0])
            o[0] += w * _num(it.get('got')); o[1] += w * _num(it.get('marks'))
    out_courses, weak, total_ch, done_ch = [], [], 0, 0
    for c in courses:
        chs = [x for x in (c.get('chapters') or []) if isinstance(x, dict)]
        done = [x for x in chs if x.get('studied')]
        total_ch += len(chs); done_ch += len(done)
        accs = []
        for x in chs:
            g, m = cmap.get((c.get('id'), x.get('id')), (0, 0))
            if m > 0:
                a = g / m
                accs.append(a)
                if a < 0.5:
                    weak.append({'course': c.get('name'), 'chapter': x.get('title'), 'acc': round(a * 100)})
        out_courses.append({'name': c.get('name'), 'chapters': len(chs), 'studied': len(done), 'minutes': round(sum(_num(x.get('mins')) for x in chs)),
                            'acc': round(sum(accs) / len(accs) * 100) if accs else None, 'exam': c.get('exam') or None})
    last = sorted(attempts, key=lambda a: -_num(a.get('at')))[:5]
    day = time.strftime('%Y-%m-%d', time.gmtime(now / 1000 + 330 * 60))
    mins_total = sum(_num(d.get('min')) for d in sdays)
    week = sum(_num(d.get('min')) for d in sdays if str(d.get('id', '')) >= time.strftime('%Y-%m-%d', time.gmtime((now - 6 * DAY) / 1000 + 330 * 60)))
    ids = {d.get('id') for d in sdays if _num(d.get('min')) > 0 or _num(d.get('cards')) > 0 or _num(d.get('q')) > 0}
    streak, t = 0, now
    if time.strftime('%Y-%m-%d', time.gmtime(t / 1000 + 330 * 60)) not in ids:
        t -= DAY
    while time.strftime('%Y-%m-%d', time.gmtime(t / 1000 + 330 * 60)) in ids:
        streak += 1; t -= DAY
    sessions_planned = [t for t in (s.get('tasks') or []) if isinstance(t, dict) and t.get('study')]
    return {
        'profile': prof, 'courses': out_courses,
        'chaptersTotal': total_ch, 'chaptersStudied': done_ch,
        'quizzes': len(attempts), 'quizAvg': round(sum(_num(a.get('got')) for a in attempts) / max(1, sum(_num(a.get('max')) for a in attempts)) * 100) if attempts else None,
        'lastQuizzes': [{'at': a.get('at'), 'got': a.get('got'), 'max': a.get('max'), 'course': next((c.get('name') for c in courses if c.get('id') == a.get('course')), '')} for a in last],
        'weak': sorted(weak, key=lambda x: x['acc'])[:6],
        'cards': {'total': len(cards), 'due': sum(1 for c in cards if _num(c.get('due')) <= now and (_num(c.get('reps')) > 0 or _num(c.get('lapses')) > 0)),
                  'mature': sum(1 for c in cards if _num(c.get('interval')) >= 21), 'mistakes': sum(1 for c in cards if c.get('kind') == 'mistake')},
        'minutesTotal': round(mins_total), 'minutesWeek': round(week), 'streak': streak,
        'sessions': {'planned': len(sessions_planned), 'done': sum(1 for t in sessions_planned if t.get('done'))},
        'today': day,
    }


def business_summary(state, now_ms=None):
    now = now_ms or int(time.time() * 1000)
    s = state or {}
    tasks = [t for t in (s.get('tasks') or []) if isinstance(t, dict) and not t.get('study')]
    return {'tasks': len(tasks), 'done': sum(1 for t in tasks if t.get('done')), 'pending': sum(1 for t in tasks if not t.get('done')),
            'overdue': sum(1 for t in tasks if not t.get('done') and _num(t.get('alarmAt')) and _num(t.get('alarmAt')) < now - 3600e3),
            'docs': len(s.get('docs') or [])}


def health(data_dir='/', ai_models=None):
    """CPU load, memory, swap, disk, uptime of THIS server (Linux /proc; harmless elsewhere)."""
    h = {}
    try:
        l1, l5, l15 = os.getloadavg(); h['load'] = [round(l1, 2), round(l5, 2), round(l15, 2)]; h['cpus'] = os.cpu_count() or 1
    except OSError:
        pass
    try:
        mi = {}
        with open('/proc/meminfo') as f:
            for ln in f:
                k, v = ln.split(':', 1); mi[k] = int(v.split()[0]) // 1024
        h['mem'] = {'total': mi.get('MemTotal', 0), 'available': mi.get('MemAvailable', 0), 'swapTotal': mi.get('SwapTotal', 0), 'swapUsed': mi.get('SwapTotal', 0) - mi.get('SwapFree', 0)}
    except Exception:
        pass
    try:
        du = shutil.disk_usage(data_dir if os.path.exists(data_dir) else '/'); h['disk'] = {'total': du.total // 2 ** 20, 'free': du.free // 2 ** 20}
    except Exception:
        pass
    try:
        with open('/proc/uptime') as f:
            h['uptime'] = int(float(f.read().split()[0]))
    except Exception:
        pass
    h['ai'] = ai_models or []
    return h


def storage(acc):
    """size of every user's database (MB)"""
    out = []
    for u in acc.list():
        p = acc.user_db(u['id']) if os.path.isdir(acc.user_dir(u['id'])) else None
        out.append({'id': u['id'], 'name': u['name'], 'mb': round(os.path.getsize(p) / 2 ** 20, 2) if p and os.path.exists(p) else 0})
    return out
