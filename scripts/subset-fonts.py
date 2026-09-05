#!/usr/bin/env python3
"""Build the self-hosted web fonts for winterscode.com.

Inputs are the @fontsource latin builds (Plex, Mono) and the two Fraunces
variable files already in public/_fonts. Outputs land in public/_fonts under
the names fonts.css references.

Why each step, measured 2026-09-05 (S168) on the homepage, PSI mobile:
  Blocking every font took perf 89 to 99 in a controlled run, so font bytes
  are the whole gap. 240KB of fonts rode the critical path.
  Plex:  TrueType hinting dropped. Only legacy Windows GDI ever read it;
         Chrome, Android, iOS, macOS and DirectWrite ignore it. 22.6KB to ~14KB.
  Mono:  the programming ligature set (calt) dropped. It is a label face on
         this site, never a code face. 21.2KB to ~8.5KB.
  Fraunces: wght axis clipped to the weights the site uses (400 to 700).
         lamp.astro keeps the full-range originals under their old names
         because it sets Fraunces at 100 and 200.

Needs: python3 with fonttools and brotli (pip install fonttools brotli).
The VPS MCP container has neither; run it in a sandbox and push the files.
Usage: python3 scripts/subset-fonts.py SRC_DIR OUT_DIR
  SRC_DIR holds: fraunces-normal.woff2 fraunces-italic.woff2
                 ibm-plex-sans-latin-{400,500,600}-normal.woff2
                 jetbrains-mono-latin-{400,500}-normal.woff2
"""
import io, os, sys
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

SRC, OUT = sys.argv[1], sys.argv[2]
os.makedirs(OUT, exist_ok=True)

# Latin + Latin-1 + general punctuation + the arrows and symbols the site sets.
UNICODES = (set(range(0x20, 0x7F)) | set(range(0xA0, 0x100)) | set(range(0x2000, 0x2070))
            | {0x0131, 0x0152, 0x0153, 0x02BB, 0x02BC, 0x02C6, 0x02DA, 0x02DC, 0x0304, 0x0308, 0x0329,
               0x2074, 0x20AC, 0x2122, 0x2190, 0x2191, 0x2192, 0x2193, 0x2212, 0x2215,
               0x2316, 0x25B2, 0x25C9, 0x26A1, 0x2715, 0x2B22, 0xFEFF, 0xFFFD})
TEXT_FEATURES = ['kern', 'liga', 'mark', 'mkmk', 'ccmp', 'locl']

def sub(src, dst, hinting):
    o = subset.Options()
    o.flavor = 'woff2'; o.hinting = hinting; o.layout_features = TEXT_FEATURES
    o.name_IDs = ['*']; o.notdef_outline = True; o.recalc_bounds = True
    f = subset.load_font(src, o); s = subset.Subsetter(o); s.populate(unicodes=UNICODES); s.subset(f)
    f.save(dst)
    return os.path.getsize(src), os.path.getsize(dst)

def clip(src, dst, lo, hi):
    f = instancer.instantiateVariableFont(TTFont(src), {'wght': (lo, hi)}, inplace=False, updateFontNames=False)
    f.flavor = 'woff2'; f.save(dst)
    return os.path.getsize(src), os.path.getsize(dst)

jobs = [
    ('ibm-plex-sans-latin-400-normal.woff2', 'plex-sans-400.woff2', sub, (False,)),
    ('ibm-plex-sans-latin-500-normal.woff2', 'plex-sans-500.woff2', sub, (False,)),
    ('ibm-plex-sans-latin-600-normal.woff2', 'plex-sans-600.woff2', sub, (False,)),
    ('jetbrains-mono-latin-400-normal.woff2', 'jetbrains-mono-400.woff2', sub, (False,)),
    ('jetbrains-mono-latin-500-normal.woff2', 'jetbrains-mono-500.woff2', sub, (False,)),
    ('fraunces-normal.woff2', 'fraunces-normal-400-700.woff2', clip, (400, 700)),
    ('fraunces-italic.woff2', 'fraunces-italic-400-700.woff2', clip, (400, 700)),
]
for src, dst, fn, args in jobs:
    a, b = fn(os.path.join(SRC, src), os.path.join(OUT, dst), *args)
    print(f'{dst:34s} {a:7d} -> {b:6d}  ({100 - b * 100 // a}% smaller)')
