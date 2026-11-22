#!/usr/bin/env python3
# page-repeats.py (S339): usage: python3 page-repeats.py DIST_CLIENT_DIR
# Flags statements a page says twice inside <main> (closer, header, footer,
# menu skipped). It catches word-level repeats; read each page for the same
# idea said in new words, which it cannot see.
# Per page: find repeated or near-repeated statements inside <main>, ignoring
# the sitewide closer, header, footer and menu. Prints pairs to review by eye.
import re, sys, glob, html, difflib, os
from html.parser import HTMLParser
class P(HTMLParser):
    def __init__(s): super().__init__(); s.stack=[]; s.blocks=[]; s.cur=None; s.inmain=0; s.skip=0
    def handle_starttag(s,t,a):
        a=dict(a); c=a.get('class') or ''
        if t=='main': s.inmain+=1
        if t in('script','style','svg','noscript') or any(k in c for k in ('wc-closer','closer','textbar','menu-panel','wc-foot','sr-only')): s.skip+=1; s.stack.append(('skip',t)); return
        s.stack.append(('n',t))
        if s.inmain and not s.skip and t in('p','li','h1','h2','h3','h4','dt','dd','figcaption','summary','span','a') and s.cur is None and t not in('span','a'): s.cur=[t,'']
    def handle_endtag(s,t):
        while s.stack:
            k,tt=s.stack.pop()
            if k=='skip': s.skip-=1
            if tt==t: break
        if t=='main': s.inmain-=1
        if s.cur and s.cur[0]==t:
            txt=re.sub(r'\s+',' ',s.cur[1]).strip()
            if len(txt)>25: s.blocks.append((t,txt))
            s.cur=None
    def handle_data(s,d):
        if s.cur is not None and not s.skip: s.cur[1]+=d
root=sys.argv[1]
for f in sorted(glob.glob(root+'/**/*.html',recursive=True)):
    rel=os.path.relpath(f,root)
    if any(x in rel for x in ('lamp','404','onboard','wall')): continue
    p=P(); p.feed(open(f).read()); b=p.blocks; hits=[]
    for i in range(len(b)):
        for j in range(i+1,len(b)):
            r=difflib.SequenceMatcher(None,b[i][1].lower(),b[j][1].lower()).ratio()
            # shared long phrase
            m=difflib.SequenceMatcher(None,b[i][1].lower(),b[j][1].lower()).find_longest_match(0,len(b[i][1]),0,len(b[j][1]))
            if r>0.6 or m.size>=40: hits.append((round(r,2),m.size,b[i][1][:110],b[j][1][:110]))
    if hits:
        print('##',rel,len(b),'blocks')
        for h in hits[:8]: print('  ',h[0],h[1],'|',h[2],'||',h[3])
