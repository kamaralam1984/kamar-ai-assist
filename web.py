"""Piyu web lookup — zero cost, no API keys.

Sources (all free, no key):  Wikipedia REST/search (hi/en) · DuckDuckGo Instant Answer + HTML results · optional self-hosted SearXNG.
Google search and ChatGPT have no free official API, so they are NOT called (the app offers "open in Google / ChatGPT" links instead).

Safety: every fetch goes through `fetch()`, which
  * accepts http/https only, no credentials in the URL,
  * resolves the host itself and refuses private / loopback / link-local / multicast / reserved addresses (SSRF),
  * then CONNECTS TO THAT RESOLVED IP (pinned) so DNS-rebinding cannot swap the address after the check,
  * re-validates every redirect hop (max 3), caps size and time, accepts text-like content types only.

Config (env):
  PIYU_WEB            comma list of sources, default "wikipedia,ddg"; "off" disables the feature on this server
  PIYU_SEARXNG        base URL of your own SearXNG instance (JSON output enabled)
  PIYU_WIKI_BASE / PIYU_DDG_API / PIYU_DDG_HTML   endpoint overrides (used by tests)
  PIYU_WEB_ALLOW      comma list of host:port that may be private (tests only; empty in production)
"""
import gzip, html, http.client, ipaddress, json, os, re, socket, ssl, time, urllib.parse
from html.parser import HTMLParser

UA = 'PiyuAssistant/1.0 (+personal assistant; polite, low volume)'
MAX_BYTES = 700_000
TEXT_TYPES = ('text/html', 'application/json', 'text/plain', 'application/xhtml', 'application/xml', 'text/xml')


def sources():
    v = os.environ.get('PIYU_WEB', 'wikipedia,ddg').strip().lower()
    if v in ('off', '0', 'no', 'false', ''):
        return []
    out = [s.strip() for s in v.split(',') if s.strip() in ('wikipedia', 'ddg', 'searxng')]
    if os.environ.get('PIYU_SEARXNG') and 'searxng' not in out:
        out.append('searxng')
    return out


# ------------------------------------------------------------------------------------------ safe fetch
class WebError(Exception):
    pass


def _allowed_private(host, port):
    allow = {x.strip() for x in os.environ.get('PIYU_WEB_ALLOW', '').split(',') if x.strip()}
    return ('%s:%s' % (host, port)) in allow


def resolve_public(host, port):
    """-> a public IP for host, or raises WebError. (Only host:port listed in PIYU_WEB_ALLOW may be private.)"""
    try:
        infos = socket.getaddrinfo(host, port, type=socket.SOCK_STREAM)
    except socket.gaierror as e:
        raise WebError('dns: %s' % e)
    ips = []
    for fam, _, _, _, sa in infos:
        ip = ipaddress.ip_address(sa[0])
        ips.append(ip)
    if not ips:
        raise WebError('dns: no address')
    if _allowed_private(host, port):
        return str(ips[0])
    for ip in ips:
        if not ip.is_global or ip.is_multicast or ip.is_reserved or ip.is_link_local or ip.is_loopback or ip.is_private:
            raise WebError('blocked address: %s' % ip)
    return str(ips[0])


class _PinnedHTTP(http.client.HTTPConnection):
    def __init__(self, host, ip, port, timeout):
        super().__init__(host, port, timeout=timeout)
        self._ip = ip

    def connect(self):
        self.sock = socket.create_connection((self._ip, self.port), self.timeout)


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, ip, port, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self._ip = ip

    def connect(self):
        sock = socket.create_connection((self._ip, self.port), self.timeout)
        self.sock = self._context.wrap_socket(sock, server_hostname=self.host)


def fetch(url, timeout=6, max_bytes=MAX_BYTES, headers=None, max_redirects=3, want=None):
    """-> (final_url, content_type, body_bytes). Raises WebError."""
    for hop in range(max_redirects + 1):
        u = urllib.parse.urlsplit(url)
        if u.scheme not in ('http', 'https'):
            raise WebError('scheme not allowed')
        if u.username or u.password or '@' in u.netloc:
            raise WebError('credentials in url')
        host = u.hostname
        if not host:
            raise WebError('no host')
        port = u.port or (443 if u.scheme == 'https' else 80)
        ip = resolve_public(host, port)
        conn = (_PinnedHTTPS if u.scheme == 'https' else _PinnedHTTP)(host, ip, port, timeout)
        path = (u.path or '/') + ('?' + u.query if u.query else '')
        h = {'User-Agent': UA, 'Accept': want or 'text/html,application/json;q=0.9,*/*;q=0.5', 'Accept-Encoding': 'gzip', 'Accept-Language': 'hi,en;q=0.8', 'Connection': 'close'}
        h.update(headers or {})
        try:
            conn.request('GET', path, headers=h)
            r = conn.getresponse()
            if r.status in (301, 302, 303, 307, 308):
                loc = r.getheader('Location')
                conn.close()
                if not loc:
                    raise WebError('redirect without location')
                url = urllib.parse.urljoin(url, loc)
                continue
            if r.status != 200:
                raise WebError('http %s' % r.status)
            ctype = (r.getheader('Content-Type') or '').split(';')[0].strip().lower()
            if not any(ctype.startswith(t) for t in TEXT_TYPES):
                raise WebError('content-type not allowed: %s' % ctype)
            raw = r.read(max_bytes + 1)
            if len(raw) > max_bytes:
                raw = raw[:max_bytes]                                   # truncate instead of failing: the start of a page is what we need
            if (r.getheader('Content-Encoding') or '') == 'gzip':
                try:
                    raw = gzip.GzipFile(fileobj=__import__('io').BytesIO(raw)).read(max_bytes)
                except Exception:
                    raise WebError('bad gzip')
            return url, ctype, raw
        except (socket.timeout, TimeoutError):
            raise WebError('timeout')
        except (OSError, http.client.HTTPException) as e:
            raise WebError('network: %s' % e)
        finally:
            try:
                conn.close()
            except Exception:
                pass
    raise WebError('too many redirects')


def _text(raw, ctype=''):
    m = re.search(rb'charset=["\']?([\w-]+)', raw[:2000], re.I)
    for enc in ([m.group(1).decode('ascii', 'ignore')] if m else []) + ['utf-8', 'latin-1']:
        try:
            return raw.decode(enc)
        except Exception:
            continue
    return raw.decode('utf-8', 'replace')


# ------------------------------------------------------------------------------------------ readable text
class _Readable(HTMLParser):
    SKIP = {'script', 'style', 'noscript', 'nav', 'footer', 'header', 'aside', 'form', 'svg', 'iframe', 'button', 'select', 'template'}
    BLOCK = {'p', 'div', 'li', 'h1', 'h2', 'h3', 'h4', 'br', 'tr', 'section', 'article', 'blockquote'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.skip = 0
        self.paras, self.cur, self.title, self._in_title, self.in_main = [], [], '', False, 0
        self.main_paras = []

    def handle_starttag(self, tag, attrs):
        if tag in self.SKIP:
            self.skip += 1
        if tag == 'title':
            self._in_title = True
        if tag in ('article', 'main'):
            self.in_main += 1
        if tag in self.BLOCK:
            self._flush()

    def handle_endtag(self, tag):
        if tag in self.SKIP and self.skip:
            self.skip -= 1
        if tag == 'title':
            self._in_title = False
        if tag in ('article', 'main') and self.in_main:
            self._flush(); self.in_main -= 1
        if tag in self.BLOCK:
            self._flush()

    def handle_data(self, d):
        if self._in_title:
            self.title += d
        elif not self.skip:
            self.cur.append(d)

    def _flush(self):
        t = re.sub(r'\s+', ' ', ''.join(self.cur)).strip()
        self.cur = []
        if len(t) >= 50:
            (self.main_paras if self.in_main else self.paras).append(t)


def page_paragraphs(raw, limit=12):
    p = _Readable()
    try:
        p.feed(_text(raw)); p._flush()
    except Exception:
        pass
    paras = p.main_paras or p.paras
    seen, out = set(), []
    for t in paras:
        k = t[:60]
        if k in seen or len(re.findall(r'[\wऀ-ॿ]+', t)) < 8:
            continue
        seen.add(k); out.append(t[:900])
        if len(out) >= limit:
            break
    return re.sub(r'\s+', ' ', p.title).strip()[:200], out


# ------------------------------------------------------------------------------------------ backends
def _lang(q):
    return 'hi' if re.search(r'[ऀ-ॿ]', q) else 'en'


def wikipedia(q, lang=None, limit=2):
    base = os.environ.get('PIYU_WIKI_BASE', 'https://{lang}.wikipedia.org')
    out = []
    for lg in ([lang or _lang(q)] + (['en'] if (lang or _lang(q)) != 'en' else [])):
        b = base.format(lang=lg)
        try:
            _, _, raw = fetch(b + '/w/api.php?action=query&list=search&format=json&utf8=1&srlimit=%d&srsearch=%s' % (limit, urllib.parse.quote(q)), want='application/json')
            hits = json.loads(_text(raw)).get('query', {}).get('search', [])
        except (WebError, ValueError):
            continue
        for h in hits[:limit]:
            title = h.get('title', '')
            try:
                _, _, raw = fetch(b + '/api/rest_v1/page/summary/' + urllib.parse.quote(title.replace(' ', '_'), safe=''), want='application/json')
                j = json.loads(_text(raw))
            except (WebError, ValueError):
                continue
            ex = (j.get('extract') or '').strip()
            if len(ex) < 40 or j.get('type') == 'disambiguation':
                continue
            url = ((j.get('content_urls') or {}).get('desktop') or {}).get('page') or (b + '/wiki/' + urllib.parse.quote(title.replace(' ', '_')))
            out.append({'title': j.get('title', title), 'url': url, 'snippet': ex[:1200], 'source': 'wikipedia'})
        if out:
            break
    return out


def ddg_instant(q):
    api = os.environ.get('PIYU_DDG_API', 'https://api.duckduckgo.com/')
    try:
        _, _, raw = fetch(api + '?format=json&no_html=1&skip_disambig=1&no_redirect=1&q=' + urllib.parse.quote(q), want='application/json')
        j = json.loads(_text(raw))
    except (WebError, ValueError):
        return []
    out = []
    if j.get('AbstractText'):
        out.append({'title': j.get('Heading') or q, 'url': j.get('AbstractURL') or '', 'snippet': j['AbstractText'][:1200], 'source': 'duckduckgo'})
    if j.get('Answer') and isinstance(j['Answer'], str):
        out.append({'title': 'Answer', 'url': j.get('AbstractURL') or '', 'snippet': j['Answer'][:400], 'source': 'duckduckgo'})
    for t in (j.get('RelatedTopics') or [])[:4]:
        if isinstance(t, dict) and t.get('Text') and t.get('FirstURL'):
            out.append({'title': t['Text'][:80], 'url': t['FirstURL'], 'snippet': t['Text'][:400], 'source': 'duckduckgo'})
    return out


class _DDG(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.results, self._cur, self._mode = [], None, None

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        cls = a.get('class') or ''
        if tag == 'a' and 'result__a' in cls:
            self._cur = {'title': '', 'url': _ddg_url(a.get('href') or ''), 'snippet': '', 'source': 'duckduckgo'}
            self.results.append(self._cur); self._mode = 'title'
        elif tag in ('a', 'div', 'td') and 'result__snippet' in cls and self._cur is not None:
            self._mode = 'snippet'

    def handle_endtag(self, tag):
        if tag == 'a' and self._mode == 'title':
            self._mode = None
        elif tag in ('a', 'div', 'td') and self._mode == 'snippet':
            self._mode = None

    def handle_data(self, d):
        if self._cur is None or not self._mode:
            return
        self._cur[self._mode] += d


def _ddg_url(href):
    if href.startswith('//'):
        href = 'https:' + href
    u = urllib.parse.urlsplit(href)
    if u.path.startswith('/l/'):
        q = urllib.parse.parse_qs(u.query).get('uddg')
        if q:
            return q[0]
    return href


def ddg_html(q, limit=5):
    base = os.environ.get('PIYU_DDG_HTML', 'https://html.duckduckgo.com/html/')
    try:
        _, _, raw = fetch(base + '?q=' + urllib.parse.quote(q), want='text/html')
    except WebError:
        return []
    p = _DDG()
    try:
        p.feed(_text(raw))
    except Exception:
        return []
    out = []
    for r in p.results:
        r['title'] = re.sub(r'\s+', ' ', r['title']).strip(); r['snippet'] = re.sub(r'\s+', ' ', r['snippet']).strip()
        if r['url'].startswith('http') and r['title']:
            out.append(r)
        if len(out) >= limit:
            break
    return out


def searxng(q, limit=6):
    base = os.environ.get('PIYU_SEARXNG', '').rstrip('/')
    if not base:
        return []
    try:
        _, _, raw = fetch(base + '/search?format=json&q=' + urllib.parse.quote(q), want='application/json')
        j = json.loads(_text(raw))
    except (WebError, ValueError):
        return []
    return [{'title': r.get('title', ''), 'url': r.get('url', ''), 'snippet': (r.get('content') or '')[:600], 'source': 'searxng'} for r in (j.get('results') or [])[:limit] if r.get('url')]


JUNK_HOSTS = ('youtube.com', 'youtu.be', 'instagram.com', 'facebook.com', 'fb.com', 'tiktok.com', 'twitter.com', 'x.com', 'pinterest.', 'reddit.com/user', 'quora.com', 'snapchat.com', 'linkedin.com')


def _junk(url):
    try:
        h = (urllib.parse.urlsplit(url).hostname or '').lower()
    except ValueError:
        return True
    return any(h == j or h.endswith('.' + j) or (j.endswith('.') and j in h) for j in JUNK_HOSTS)


def search(q, lang=None):
    """Merge all enabled sources; Wikipedia / instant answers first (they are usually the direct answer), then web results."""
    q = re.sub(r'\s+', ' ', q).strip()[:200]
    if not q:
        return []
    srcs = sources()
    res = []
    if 'wikipedia' in srcs:
        res += wikipedia(q, lang)
    if 'ddg' in srcs:
        res += ddg_instant(q)
        if len(res) < 4:
            res += ddg_html(q)
    if 'searxng' in srcs:
        res += searxng(q)
    seen, out = set(), []
    for r in res:
        if r['url'] and _junk(r['url']):
            continue                                              # video/social pages are noise for factual questions
        k = (r['url'] or r['title']).split('#')[0].rstrip('/')
        if k in seen:
            continue
        seen.add(k); out.append(r)
    return out


# ------------------------------------------------------------------------------------------ passages + extractive answer
_STOP = set('a an the and or of to in on at for is are was be it this that with as by from i you we he she they what who when where why how which do does did can will kya kaise kab kahan kyun kaun kitna hai hain ka ki ke ko se me mein par aur ya bhi क्या कैसे कब कहाँ क्यों कौन कितना है हैं का की के को से में पर और या भी'.split())


def _tok(s):
    return [w for w in re.findall(r'[\wऀ-ॿ]+', s.lower()) if len(w) > 1 and w not in _STOP]


def gather(q, lang=None, fetch_pages=2, budget_s=9):
    """-> {'results': [...], 'passages': [{'text','url','title','source'}]}"""
    t0 = time.time()
    results = search(q, lang)
    passages = []
    for r in results:
        if r['snippet']:
            passages.append({'text': r['snippet'], 'url': r['url'], 'title': r['title'], 'source': r['source']})
    n = 0
    for r in results:
        if n >= fetch_pages or time.time() - t0 > budget_s:
            break
        host = (urllib.parse.urlsplit(r['url']).hostname or '') if r['url'].startswith('http') else ''
        if r['source'] == 'wikipedia' or not host or host.endswith('wikipedia.org') or host.endswith('duckduckgo.com'):
            continue                                                # we already hold Wikipedia's summary; ddg internal links carry nothing new
        try:
            _, _, raw = fetch(r['url'], timeout=5)
        except WebError:
            continue
        n += 1
        title, paras = page_paragraphs(raw)
        for t in paras[:6]:
            passages.append({'text': t, 'url': r['url'], 'title': title or r['title'], 'source': 'page'})
    return {'results': results, 'passages': passages}


def _sentences(t):
    return [s.strip() for s in re.split(r'(?<=[.!?।])\s+', t) if 25 <= len(s.strip()) <= 400]


_WHEN = re.compile(r'\b(when|what year|which year|date|kab)\b|कब|किस साल|कौन सा साल|तारीख', re.I)
_WHO = re.compile(r'\b(who|whom|built|founded|invented|discovered|wrote|created|kisne|kaun)\b|किसने|कौन|बनवाया|बनाया|लिखा', re.I)
_HOWMANY = re.compile(r'\b(how many|how much|how long|how far|how tall|kitna|kitne)\b|कितना|कितने|कितनी', re.I)
_WHERE = re.compile(r'\b(where|kahan)\b|कहाँ|कहां', re.I)


def _qbonus(q, s):
    """Prefer sentences that look like the kind of answer the question asks for."""
    b = 0.0
    if _WHEN.search(q) and re.search(r'\b(1[0-9]{3}|20[0-9]{2})\b|\b\d{1,2} (January|February|March|April|May|June|July|August|September|October|November|December)\b|[०-९]{4}|\b(19|20)\d\d\b', s):
        b += 0.5
    if _WHO.search(q) and (re.search(r'\b(by|from) [A-Z][a-z]+', s) or re.search(r'\b[A-Z][a-z]+ [A-Z][a-z]+\b', s) or 'ने ' in s or 'commissioned' in s or 'built' in s):
        b += 0.4
    if _HOWMANY.search(q) and re.search(r'\d', s):
        b += 0.4
    if _WHERE.search(q) and re.search(r'\b(in|at|near|on the) [A-Z]', s):
        b += 0.3
    return b


def extractive(q, passages, n=3):
    """Pick the n most relevant sentences (query-term overlap, earlier + shorter preferred). -> {'answer', 'sources':[{title,url}]}"""
    qt = set(_tok(q))
    if not qt or not passages:
        return {'answer': '', 'sources': []}
    scored = []
    for pi, p in enumerate(passages):
        for si, s in enumerate(_sentences(p['text'])):
            toks = _tok(s)
            hit = len(qt & set(toks))
            if not hit:
                continue
            tt = set(_tok(p.get('title') or '')); extra = len(tt - qt)
            tbonus = (0.35 if tt and tt <= qt else 0)      # a page whose title IS the thing asked about beats one that merely mentions it
            score = hit / len(qt) + tbonus + (0.25 if pi == 0 and si == 0 else 0) - 0.02 * si - 0.03 * pi + (0.1 if p['source'] in ('wikipedia',) else 0) + _qbonus(q, s) - (0.25 if len(s) < 45 else 0)
            side = extra >= 2 and not (tt and tt <= qt)             # side-topic page: its title has extra words the question never used
            if side:
                score *= 0.6
            scored.append((score, pi, si, s, p, side))
    if not scored:
        # nothing shares words with the question: fall back to the first sentence of the first passage (definitions)
        p = passages[0]; ss = _sentences(p['text'])
        return {'answer': ' '.join(ss[:2]), 'sources': [{'title': p['title'], 'url': p['url']}]} if ss else {'answer': '', 'sources': []}
    scored.sort(key=lambda x: -x[0])
    best = scored[0][0]
    scored = [x for x in scored if not x[5] or x[0] >= best * 0.85]     # a side-topic sentence must be almost as good as the best one
    chosen, seen = [], set()
    for sc, pi, si, s, p, side in scored:
        key = s[:50].lower()
        if key in seen:
            continue
        seen.add(key); chosen.append((pi, si, s, p))
        if len(chosen) >= n:
            break
    chosen.sort(key=lambda x: (x[0], x[1]))
    srcs, seenu = [], set()
    for pi, si, s, p in chosen:
        if p['url'] and p['url'] not in seenu:
            seenu.add(p['url']); srcs.append({'title': p['title'], 'url': p['url']})
    return {'answer': ' '.join(x[2] for x in chosen), 'sources': srcs[:4]}
