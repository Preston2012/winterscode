#!/usr/bin/env python3
"""Compare two folders of screenshots pixel for pixel. Prints each file as SAME,
or DIFF with the size change and the bounding box of changed pixels.
Usage: python3 scripts/audit/pixel-diff.py BEFORE_DIR AFTER_DIR"""
import sys, os
from PIL import Image, ImageChops
a, b = sys.argv[1], sys.argv[2]
for f in sorted(os.listdir(a)):
    x, y = Image.open(os.path.join(a, f)).convert('RGB'), Image.open(os.path.join(b, f)).convert('RGB')
    if x.size != y.size:
        print(f'DIFF {f:50s} size {x.size} -> {y.size}'); continue
    box = ImageChops.difference(x, y).getbbox()
    print(f"{'SAME' if box is None else 'DIFF'} {f:50s} {'' if box is None else box}")
