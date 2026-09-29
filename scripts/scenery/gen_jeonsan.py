"""
계명대학교 정보전산원(전산원) 외벽 무늬를 그린다 (사진을 쓰지 않고 모양만 보고 그린 그림).

  python3 scripts/scenery/gen_jeonsan.py <출력 폴더>

참고: 사용자가 2026-09-29 남쪽에서 찍은 정면 사진(IMG_4039)과 OSM 윤곽(약 31 × 28 m)
- 주홍빛 붉은 벽돌 3층, 담쟁이(돌담쟁이)가 1·2층 벽을 거의 덮고 창 둘레만 깎여 있다
- 1층: 흰 세로 창살 넓은 창 / 2층: 흰 틀 창 둘 / 3층: 회색 알루미늄 판과 번갈아 이어진 띠창
- 가운데 칸: 2·3층 흰 틀 유리창 + 층 사이 회색 판, 1층은 벽돌 기둥 사이 유리문 (차양은 모형)
- 지붕: 주홍 기와 모임지붕, 깊은 흰 처마 (모형)
담쟁이는 벽 무늬와 따로, 투명 바탕 위 잎 그림(ivy_*.png)으로 그려 벽 앞에 한 겹 더 세운다 → 입체감과 그림자.
크기는 m 단위, 1 m = PX 픽셀.

만드는 것
- js_front.jpg / js_front_ivy.png : 정면 (30 × 12 m)
- js_side.jpg  / js_side_ivy.png  : 옆·뒷면 (28 × 12 m)
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "facades"
os.makedirs(OUT, exist_ok=True)
PX = 48
H_M = 12.0  # 벽 높이 (처마 밑)

BRICK = (156, 72, 52)
FRAME = (240, 240, 236)
PANEL = (168, 178, 190)  # 회색 알루미늄 판
PANEL_DARK = (132, 142, 154)
GLASS_TOP = (150, 150, 142)
GLASS_BOT = (70, 72, 70)
DARK = (34, 36, 38)
LEAF = [(52, 78, 34), (64, 92, 40), (78, 104, 46), (44, 66, 30), (92, 112, 52), (70, 86, 40), (86, 100, 44)]


def m(v):
    return round(v * PX)


def brick_canvas(w_m, h_m):
    w, h = m(w_m), m(h_m)
    img = np.zeros((h, w, 3), np.float32)
    bw, bh = 0.23 * PX, 0.07 * PX
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy / bh).astype(int)
    col = ((xx + (row % 2) * bw / 2) / bw).astype(int)
    r = np.random.default_rng(5).random((row.max() + 2, col.max() + 2))[row, col]
    img[:] = np.array(BRICK, np.float32) * (0.86 + 0.22 * r)[..., None]
    img[r > 0.92] *= 0.75
    mortar = ((yy % bh) < 1) | (((xx + (row % 2) * bw / 2) % bw) < 1)
    img[mortar] = np.array((182, 170, 158), np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def rect(d, x0, y0, x1, y1, fill):
    """아래가 y=0 인 m 좌표 → 그림 좌표 (위가 0)."""
    H = d.im.size[1]
    a, b = m(x0), H - m(y1)
    d.rectangle([a, b, max(a, m(x1) - 1), max(b, H - m(y0) - 1)], fill=fill)


def glass(d, x0, y0, x1, y1):
    H = d.im.size[1]
    top, bot = H - m(y1), H - m(y0)
    for py in range(top, bot):
        t = (py - top) / max(1, bot - top - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(GLASS_TOP, GLASS_BOT))
        d.line([m(x0), py, m(x1) - 1, py], fill=c)


def window(d, x0, y0, w, h, cols=3, rows=2, frame=FRAME, bar=0.06, sill=True):
    rect(d, x0 - 0.1, y0 - 0.1, x0 + w + 0.1, y0 + h + 0.1, frame)
    glass(d, x0 + 0.05, y0 + 0.05, x0 + w - 0.05, y0 + h - 0.05)
    for k in range(1, cols):
        x = x0 + w * k / cols
        rect(d, x - bar / 2, y0, x + bar / 2, y0 + h, frame)
    for k in range(1, rows):
        y = y0 + h * k / rows
        rect(d, x0, y - bar / 2, x0 + w, y + bar / 2, frame)
    if sill:
        rect(d, x0 - 0.2, y0 - 0.22, x0 + w + 0.2, y0 - 0.1, FRAME)


def barred(d, x0, y0, w, h):
    """1층 창: 어두운 창 앞에 흰 세로 창살."""
    rect(d, x0 - 0.12, y0 - 0.12, x0 + w + 0.12, y0 + h + 0.12, FRAME)
    rect(d, x0, y0, x0 + w, y0 + h, DARK)
    glass(d, x0 + 0.1, y0 + h * 0.55, x0 + w - 0.1, y0 + h - 0.1)
    x = x0 + 0.1
    while x < x0 + w - 0.05:
        rect(d, x, y0, x + 0.045, y0 + h, FRAME)
        x += 0.13
    for y in (y0 + 0.08, y0 + h * 0.5, y0 + h - 0.12):
        rect(d, x0, y, x0 + w, y + 0.05, FRAME)
    rect(d, x0 - 0.25, y0 - 0.3, x0 + w + 0.25, y0 - 0.12, FRAME)


def band(d, x0, x1, y0=9.2, y1=11.7, win=2.6, pier=0.5):
    """3층 띠창: 회색 판 기둥과 창을 번갈아."""
    rect(d, x0, y0 - 0.25, x1, y1, PANEL)
    rect(d, x0, y0 - 0.25, x1, y0 - 0.15, PANEL_DARK)
    x = x0 + pier
    while x + win <= x1 + 0.01:
        window(d, x, y0, win, y1 - y0 - 0.1, cols=3, rows=2, sill=False)
        x += win + pier


def plinth(d, W):
    rect(d, 0, 0, W, 0.7, (150, 146, 138))
    rect(d, 0, 0.65, W, 0.72, (120, 116, 110))


def save(img, name, alpha=None):
    img = img.filter(ImageFilter.GaussianBlur(0.35))
    if alpha is not None:
        img = img.convert("RGBA")
        img.putalpha(alpha)
        img.save(os.path.join(OUT, name))
    else:
        img.convert("RGB").save(os.path.join(OUT, name), quality=88)
    print("✓", name, img.size)


def ivy(W, regions, holes, seed):
    """담쟁이: regions(덮는 곳) − holes(창 둘레) 안에 잎을 촘촘히. 가장자리는 들쭉날쭉하게, 아래로 늘어진 줄기도."""
    w, h = m(W), m(H_M)
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    for (x0, y0, x1, y1) in regions:
        md.rectangle([m(x0), h - m(y1), m(x1), h - m(y0)], fill=255)
    rng = np.random.default_rng(seed)
    # 가장자리 들쭉날쭉: 흐리게 한 뒤 저주파 잡음을 더해 다시 자른다
    noise = Image.fromarray((rng.random((h // 16 + 2, w // 16 + 2)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    f = np.asarray(mask.filter(ImageFilter.GaussianBlur(PX * 0.35)), np.float32) / 255
    n = np.asarray(noise, np.float32) / 255
    cover = (f + (n - 0.5) * 0.7) > 0.5
    hole = Image.new("L", (w, h), 0)
    hd = ImageDraw.Draw(hole)
    for (x0, y0, x1, y1) in holes:  # 창 둘레는 깎아 둔다 (10 cm 여유)
        hd.rectangle([m(x0 - 0.1), h - m(y1 + 0.1), m(x1 + 0.1), h - m(y0 - 0.1)], fill=255)
    cover &= np.asarray(hole) == 0
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ys, xs = np.nonzero(cover)
    count = int(len(xs) / 14)
    pick = rng.integers(0, len(xs), count)
    # 두 겹: 먼저 짙은 잎(그늘), 그 위에 밝은 잎
    for layer, (lo, hi, dark) in enumerate(((0, 4, 0.62), (0, 7, 1.0))):
        for k in pick[layer::2]:
            x, y = xs[k], ys[k]
            r = rng.uniform(0.07, 0.14) * PX
            c = LEAF[rng.integers(lo, hi)]
            t = dark * rng.uniform(0.85, 1.12)
            col = tuple(int(min(255, v * t)) for v in c) + (255,)
            e = r * rng.uniform(0.7, 1.0)
            d.ellipse([x - r, y - e, x + r, y + e], fill=col)
    # 아래로 늘어진 줄기 몇 가닥
    for _ in range(int(W * 1.2)):
        k = rng.integers(0, len(xs))
        x, y = xs[k], ys[k]
        L = rng.uniform(0.4, 1.6) * PX
        for s in range(int(L / 3)):
            yy = y + s * 3
            xx = x + np.sin(s * 0.4) * 2
            if yy >= h:
                break
            r = rng.uniform(0.05, 0.09) * PX
            d.ellipse([xx - r, yy - r, xx + r, yy + r], fill=LEAF[rng.integers(0, 4)] + (255,))
    return img


def front():
    W = 30.0
    img = brick_canvas(W, H_M)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    holes = []
    # 가운데 칸 (x 10.5–19.5): 양옆 회색 판, 2·3층 유리창, 층 사이 회색 판, 1층 유리문
    rect(d, 10.5, 4.0, 11.1, 11.7, PANEL)
    rect(d, 18.9, 4.0, 19.5, 11.7, PANEL)
    window(d, 11.25, 5.2, 7.5, 2.7, cols=4, rows=3, sill=False)
    rect(d, 11.1, 7.95, 18.9, 9.15, PANEL)
    rect(d, 11.1, 8.5, 18.9, 8.56, PANEL_DARK)
    window(d, 11.25, 9.2, 7.5, 2.45, cols=4, rows=3, sill=False)
    rect(d, 12.0, 0.7, 18.0, 3.9, DARK)
    for x in (12.2, 13.7, 15.2, 16.7):
        glass(d, x, 0.75, x + 1.35, 3.75)
    holes += [(10.5, 3.9, 19.5, 12.0), (12.0, 0.7, 18.0, 3.9)]
    # 날개: 1층 창살 창, 2층 흰 틀 창 둘, 3층 띠창
    for x0 in (1.4, 5.8, 21.6, 26.0):
        barred(d, x0, 1.3, 2.6, 2.3)
        holes.append((x0, 1.3, x0 + 2.6, 3.6))
    for x0 in (2.2, 6.0, 21.8, 25.6):
        window(d, x0, 5.3, 2.3, 2.4, cols=3, rows=2)
        holes.append((x0 - 0.2, 5.1, x0 + 2.5, 7.8))
    band(d, 0.0, 10.5)
    band(d, 19.5, 30.0)
    holes += [(0, 8.9, 10.5, 12), (19.5, 8.9, 30, 12)]
    save(img, "js_front.jpg")
    # 담쟁이 (사진처럼): 왼쪽 날개는 2층까지, 가운데 칸 옆은 3층까지 기어오르고, 오른쪽 날개는 3층 창 사이까지
    regions = [(0.4, 0.5, 10.5, 8.9), (9.2, 8.9, 10.6, 11.6), (19.5, 0.5, 29.6, 9.0), (19.4, 8.9, 20.2, 11.9),
               (10.4, 0.5, 11.9, 3.2), (18.1, 0.5, 19.6, 3.2)]
    save_ivy(ivy(W, regions, [h for h in holes if h[1] < 8.8 or h[2] - h[0] < 3], 11), "js_front_ivy.png")


def side():
    W = 28.0
    img = brick_canvas(W, H_M)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    holes = []
    for k in range(6):
        x0 = 0.9 + k * 4.6
        barred(d, x0, 1.3, 2.6, 2.3)
        window(d, x0 + 0.15, 5.3, 2.3, 2.4, cols=3, rows=2)
        holes += [(x0, 1.3, x0 + 2.6, 3.6), (x0 - 0.05, 5.1, x0 + 2.65, 7.8)]
    band(d, 0.0, W, win=2.55, pier=0.5)
    save(img, "js_side.jpg")
    regions = [(0.3, 0.5, 15.5, 8.9), (18.0, 0.5, 27.7, 6.2), (0.3, 8.9, 1.2, 11.6), (22.0, 6.0, 27.7, 8.9)]
    save_ivy(ivy(W, regions, holes, 23), "js_side_ivy.png")


def save_ivy(img, name):
    img.filter(ImageFilter.GaussianBlur(0.3)).save(os.path.join(OUT, name))
    print("✓", name, img.size)


if __name__ == "__main__":
    front()
    side()
