#!/usr/bin/env python3
"""og-check.py (S339 round 4b): strict share-card check over every built page, then over HTTP.
Usage: python3 scripts/cards/og-check.py dist/client BASE_URL   (after a build; BASE_URL is the host the build points its cards at)
Per page: og:title, og:description, og:url == canonical, og:image absolute https,
og:image:width/height match the real file, og:image:type matches the bytes,
og:image:alt, twitter:card summary_large_image, twitter:image == og:image,
title length, description length. Per card over HTTP: 200, content-type image/*,
under 300 KB (WhatsApp drops larger previews), 1200x630, RGB baseline-readable.
Exits 1 when anything is BAD, so a build or deploy gate can stop on it."""
import sys, re, os, io, glob, html, urllib.request
from PIL import Image
dist, base = sys.argv[1].rstrip('/'), sys.argv[2].rstrip('/')

def meta(doc, key, attr='property'):
    m = re.search(r'<meta %s="%s" content="([^"]*)"' % (attr, re.escape(key)), doc)
    return html.unescape(m.group(1)) if m else None

def get(u):
    req = urllib.request.Request(u, headers={'User-Agent': 'facebookexternalhit/1.1'})
    with urllib.request.urlopen(req, timeout=20) as r:
        return r.status, r.headers.get('content-type', ''), r.read()

bad, cards = 0, {}
# Same skip as og-cards.mjs: /lamp is Preston's own page outside the business site.
SKIP = {'/lamp'}
for f in sorted(glob.glob(dist + '/**/*.html', recursive=True)):
    page = f[len(dist):].replace('/index.html', '/').replace('.html', '') or '/'
    if page in SKIP:
        print(f'skip {page}'); continue
    doc = open(f, encoding='utf-8').read()
    probs = []
    noindex = 'name="robots" content="noindex' in doc
    canon = re.search(r'<link rel="canonical" href="([^"]+)"', doc)
    canon = canon.group(1) if canon else None
    t, d = meta(doc, 'og:title'), meta(doc, 'og:description')
    img, alt = meta(doc, 'og:image'), meta(doc, 'og:image:alt')
    w, h, typ = meta(doc, 'og:image:width'), meta(doc, 'og:image:height'), meta(doc, 'og:image:type')
    tw, twi = meta(doc, 'twitter:card', 'name'), meta(doc, 'twitter:image', 'name')
    if not t: probs.append('no og:title')
    elif len(t) > 70: probs.append(f'og:title {len(t)} chars')
    if not d: probs.append('no og:description')
    elif not 50 <= len(d) <= 200: probs.append(f'og:description {len(d)} chars')
    if meta(doc, 'og:url') != canon: probs.append('og:url != canonical')
    if not img: probs.append('NO og:image')
    else:
        if not img.startswith('https://'): probs.append('og:image not absolute https')
        if not alt: probs.append('no og:image:alt')
        if tw != 'summary_large_image': probs.append(f'twitter:card {tw}')
        if twi != img: probs.append('twitter:image != og:image')
        local = dist + re.sub(r'^https?://[^/]+', '', img).split('?')[0]
        if not os.path.exists(local): probs.append('card file missing in build')
        else:
            data = open(local, 'rb').read()
            im = Image.open(io.BytesIO(data))
            if (str(im.size[0]), str(im.size[1])) != (w, h): probs.append(f'declared {w}x{h}, real {im.size}')
            if im.size != (1200, 630): probs.append(f'size {im.size}')
            real = 'image/jpeg' if im.format == 'JPEG' else 'image/' + im.format.lower()
            if typ != real: probs.append(f'og:image:type {typ}, bytes {real}')
            if im.mode != 'RGB': probs.append(f'mode {im.mode}')
            if im.format == 'JPEG' and im.info.get('progression'): probs.append('progressive jpeg')
            if len(data) > 300_000: probs.append(f'{len(data)//1024} KB > 300')
            cards[img] = page
    bad += bool(probs)
    print(f"{'BAD ' if probs else 'ok  '}{page:42s} {'noindex ' if noindex else ''}{(img or '-').split('/', 3)[-1]:40s} {'; '.join(probs)}")

print('\nHTTP pass on', base)
for img, page in sorted(cards.items()):
    path = re.sub(r'^https?://[^/]+', '', img)
    try:
        st, ct, data = get(base + path)
        ok = st == 200 and ct.startswith('image/') and Image.open(io.BytesIO(data)).size == (1200, 630)
        if not ok: bad += 1
        print(f"{'ok  ' if ok else 'BAD '}{path:45s} {st} {ct} {len(data)//1024}KB")
    except Exception as e:
        bad += 1; print('BAD ', path, e)
print('PAGES', len(glob.glob(dist + '/**/*.html', recursive=True)), 'CARDS', len(cards), 'BAD', bad)
sys.exit(1 if bad else 0)
