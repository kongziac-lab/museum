"""
느티나무 잎 뭉치 텍스처 (1024², 알파): 가는 가지에 작은 톱니 잎이 촘촘히 달린 둥근 뭉치.

  python3 scripts/scenery/zelkova_leaf.py $W/zelkova_leaves.png      (pip install pillow)
"""

import math
import random
import sys

from PIL import Image, ImageDraw, ImageFilter

random.seed(12)
S = 1024
img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
d = ImageDraw.Draw(img)
cx, cy = S / 2, S / 2

twigs = []
for _ in range(9):
    a = random.uniform(0, 2 * math.pi)
    L = random.uniform(0.25, 0.46) * S
    x0, y0 = cx + random.uniform(-40, 40), cy + random.uniform(-40, 40)
    pts = [(x0, y0)]
    for _ in range(1, 9):
        a += random.uniform(-0.25, 0.25)
        x0 += math.cos(a) * L / 8
        y0 += math.sin(a) * L / 8
        pts.append((x0, y0))
    twigs.append(pts)
    d.line(pts, fill=(84, 66, 48, 255), width=4)


def leaf(x, y, ang, length, width, col):
    """톱니 가장자리 잎 하나 + 잎맥"""
    pts = []
    n = 18
    for i in range(n + 1):
        t = i / n
        pts.append((t * length, -width * math.sin(math.pi * t) * (1 + 0.12 * (i % 2))))
    for i in range(n, -1, -1):
        t = i / n
        pts.append((t * length, width * math.sin(math.pi * t) * (1 + 0.12 * (i % 2))))
    c, s = math.cos(ang), math.sin(ang)
    d.polygon([(x + px * c - py * s, y + px * s + py * c) for px, py in pts], fill=col)
    d.line([(x, y), (x + length * 0.9 * c, y + length * 0.9 * s)], fill=(max(col[0] - 25, 0), max(col[1] - 30, 0), max(col[2] - 20, 0), 255), width=1)


greens = [(52, 92, 38), (64, 108, 44), (78, 122, 50), (92, 136, 58), (44, 80, 34), (108, 146, 64)]
for pts in twigs:
    for i in range(1, len(pts)):
        (x0, y0), (x1, y1) = pts[i - 1], pts[i]
        base = math.atan2(y1 - y0, x1 - x0)
        for _ in range(5):
            t = random.random()
            x, y = x0 + (x1 - x0) * t, y0 + (y1 - y0) * t
            for side in (-1, 1):
                g = random.choice(greens)
                v = random.uniform(0.85, 1.12)
                leaf(x, y, base + side * random.uniform(0.6, 1.1), random.uniform(46, 70), random.uniform(12, 17), (int(g[0] * v), int(g[1] * v), int(g[2] * v), 255))
for _ in range(160):  # 가운데를 더 채운다
    r = random.uniform(0, 0.3) * S
    a = random.uniform(0, 2 * math.pi)
    g = random.choice(greens)
    v = random.uniform(0.8, 1.05)
    leaf(cx + r * math.cos(a), cy + r * math.sin(a), random.uniform(0, 6.28), random.uniform(44, 64), random.uniform(12, 16), (int(g[0] * v), int(g[1] * v), int(g[2] * v), 255))
img.filter(ImageFilter.GaussianBlur(0.4)).save(sys.argv[1])
print("wrote", sys.argv[1])
