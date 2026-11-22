#!/usr/bin/env python3
"""Find words that join across a tag with no space between them, the way a text
extractor, a copy and paste, or a reader that drops visually hidden text sees them.
Usage: python3 scripts/audit/run-together.py dist/client   (after a build)
Inline seams (two inline elements, no space) are the ones to fix; seams across
block elements read as separate lines in every extractor.
Prints page, the joined text, and the two tags at the seam."""
import sys, glob, re
from html.parser import HTMLParser

VOID = {'br', 'img', 'hr', 'input', 'meta', 'link', 'source', 'wbr'}
SKIP = {'script', 'style', 'noscript', 'svg', 'template', 'head'}

class P(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack, self.nodes, self.since = [], [], []
    def handle_starttag(self, t, a):
        cls = dict(a).get('class') or ''
        if t in VOID:
            self.since.append(t); return
        self.stack.append((t, 'sr-only' in cls.split() or 'visually-hidden' in cls.split()))
        self.since.append('<' + t)
    def handle_endtag(self, t):
        for i in range(len(self.stack) - 1, -1, -1):
            if self.stack[i][0] == t:
                del self.stack[i:]; break
        self.since.append('/' + t)
    def handle_data(self, d):
        if any(t in SKIP for t, _ in self.stack): return
        hidden = any(h for _, h in self.stack)
        if not d.strip():
            if d: self.nodes.append((' ', False, list(self.since))); self.since = []
            return
        self.nodes.append((d, hidden, list(self.since))); self.since = []

BLOCK = set('p div li ul ol dd dt dl h1 h2 h3 h4 h5 h6 section article header footer nav details '
            'summary br tr td th figcaption figure blockquote main aside table tbody thead form '
            'fieldset legend label button option select'.split())
# Same skip as og-cards.mjs: /lamp is Preston's own page outside the business site.
SKIP_PAGES = {'/lamp.html'}
hits = 0
root = sys.argv[1].rstrip('/')
for f in sorted(glob.glob(root + '/**/*.html', recursive=True)):
    page = f[len(root):]
    if page in SKIP_PAGES: continue
    p = P(); p.feed(open(f, encoding='utf-8').read())
    vis = [(d, s) for d, h, s in p.nodes if not h]   # what an extractor that drops sr-only sees
    seen = set()
    for (a, _), (b, tags) in zip(vis, vis[1:]):
        if a == ' ' or b == ' ' or not tags or a[-1].isspace() or b[0].isspace(): continue
        if {t.strip('</') for t in tags} & BLOCK: continue
        if not (re.search(r'[A-Za-z0-9.,:;!?)]$', a) and re.match(r'[A-Za-z0-9(]', b)): continue
        key = (a[-24:], b[:24])
        if key in seen: continue
        seen.add(key); hits += 1
        print(f"{page:44s} ...{a[-24:]!r} | {b[:24]!r}   {' '.join(tags)[:60]}")
print('SEAMS', hits)
sys.exit(1 if hits else 0)
