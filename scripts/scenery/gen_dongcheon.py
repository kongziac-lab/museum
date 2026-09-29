"""
계명대학교 동천관(東泉館, 대학원) 외벽 무늬를 그린다 (사진을 쓰지 않고 모양만 보고 그린 그림).

  python3 scripts/scenery/gen_dongcheon.py <출력 폴더>

참고: 사용자가 2026-09 현장에서 찍은 사진 3장(정면·북서쪽·현관 박공)과 OSM 윤곽(약 78 × 37 m)
- 붉은 갈색 벽돌(#8E4B3E) + 흰 화강암(#E4E0D6) 테두리, 흰 창틀에 하늘빛 유리
- 날개 한 칸(4 m): 1·2층은 쐐기돌 인방·창턱이 있는 짝창, 3층은 짙은 틀의 넓은 띠창, 맨 위 흰 처마 돌림띠
- 가운데(현관 뒤): 3층 높이 유리 커튼월 + 양옆 벽돌
- 양 끝 박공동(13 m): 모서리 흰 귓돌(길고 짧게 번갈아), 양옆 홑창, 박공 속 작은 다락창
- 박공동 가운데 돌출창: 흰 돌 틀 속 큰 창 셋, 층 사이 벽돌 판에 흰 원형 메달리온 둘
- 현관: 프리즈에 '東泉館', 박공(톱니 장식 테두리) 가운데 십자 원형창, 우물반자 천장
크기는 m 단위, 1 m = PX 픽셀. 한자는 macOS 송체(Songti)로 쓴다.

만드는 것
- dc_wing.jpg      : 날개 한 칸 (4 × 15 m) — 가로로 반복
- dc_center.jpg    : 현관 뒤 가운데 벽 (21 × 15 m)
- dc_pav_front.png : 박공동 정면 (13 × 23.5 m, 박공 바깥은 투명)
- dc_pav_side.jpg  : 박공동 옆면 (37 × 15 m)
- dc_bay.jpg       : 돌출창 정면 (4.6 × 13.4 m)
- dc_frieze.jpg    : 현관 프리즈 (20.2 × 0.8 m, '東泉館')
- dc_pediment.png  : 현관 박공 (20.2 × 5.6 m, 삼각형 바깥 투명)
- dc_coffer.jpg    : 현관 우물반자 한 칸 (2.8 × 2.8 m)
- dc_fence.png     : 테라스 난간 (3 × 0.9 m, 빈 곳 투명)
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "facades"
os.makedirs(OUT, exist_ok=True)
PX = 48  # 1 m 당 픽셀

BRICK = (142, 75, 62)
STONE = (228, 224, 214)
STONE_SHADE = (196, 191, 180)
FRAME = (244, 244, 240)
GLASS_TOP = (150, 186, 214)
GLASS_BOT = (62, 92, 124)
CURTAIN = (74, 80, 86)
IRON = (52, 54, 56)
TEXT = (38, 38, 40)
FONT = "/System/Library/Fonts/Supplemental/Songti.ttc"


def m(v):
    return round(v * PX)


def brick_canvas(w_m, h_m):
    """벽돌 바탕: 벽돌 한 장 0.23 × 0.07 m, 색이 조금씩 다르다 (검붉은 벽돌이 섞인다)."""
    w, h = m(w_m), m(h_m)
    img = np.zeros((h, w, 3), np.float32)
    bw, bh = 0.23 * PX, 0.07 * PX
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy / bh).astype(int)
    col = ((xx + (row % 2) * bw / 2) / bw).astype(int)
    rnd = np.random.default_rng(3).random((row.max() + 2, col.max() + 2))  # 벽돌마다 한 번 뽑은 난수
    r = rnd[row, col]
    tone = 0.86 + 0.22 * r
    dark = r > 0.9
    img[:] = np.array(BRICK, np.float32) * tone[..., None]
    img[dark] *= 0.72
    mortar = ((yy % bh) < 1) | (((xx + (row % 2) * bw / 2) % bw) < 1)
    img[mortar] = np.array((176, 166, 156), np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def rect(d, x0, y0, x1, y1, fill):
    """아래가 y=0 인 m 좌표 → 그림 좌표 (위가 0)."""
    H = d.im.size[1]
    a, b = m(x0), H - m(y1)
    d.rectangle([a, b, max(a, m(x1) - 1), max(b, H - m(y0) - 1)], fill=fill)


def glass(d, x0, y0, x1, y1):
    """하늘이 비친 유리: 위가 밝고 아래가 짙다."""
    H = d.im.size[1]
    top, bot = H - m(y1), H - m(y0)
    for py in range(top, bot):
        t = (py - top) / max(1, bot - top - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(GLASS_TOP, GLASS_BOT))
        d.line([m(x0), py, m(x1) - 1, py], fill=c)


def window(d, x0, y0, w, h, cols=2, rows=2, sash=0.45, surround=0.2, keystone=True):
    """흰 돌 테두리 창: 위쪽은 cols × rows 칸, 아래쪽 sash 비율은 세로로 나뉜 미닫이창."""
    x1, y1 = x0 + w, y0 + h
    rect(d, x0 - surround, y0 - surround, x1 + surround, y1 + surround, STONE)  # 테두리
    rect(d, x0 - surround - 0.08, y0 - surround - 0.12, x1 + surround + 0.08, y0 - surround, STONE_SHADE)  # 창턱
    if keystone:
        rect(d, x0 + w / 2 - 0.18, y1 + surround - 0.05, x0 + w / 2 + 0.18, y1 + surround + 0.18, STONE)
        rect(d, x0 + w / 2 - 0.18, y1 + surround + 0.14, x0 + w / 2 + 0.18, y1 + surround + 0.18, STONE_SHADE)
    rect(d, x0, y0, x1, y1, FRAME)
    f = 0.07
    glass(d, x0 + f, y0 + f, x1 - f, y1 - f)
    split = y0 + h * sash if sash else y0
    bar = 0.05
    if sash:
        rect(d, x0, split - bar, x1, split + bar, FRAME)
        rect(d, x0 + w / 2 - bar, y0, x0 + w / 2 + bar, split, FRAME)
    for k in range(1, cols):
        x = x0 + w * k / cols
        rect(d, x - bar, split, x + bar, y1, FRAME)
    for k in range(1, rows):
        y = split + (y1 - split) * k / rows
        rect(d, x0, y - bar, x1, y + bar, FRAME)


def band_window(d, x0, y0, x1, y1, cols=3, transom=0.8):
    """짙은 틀의 넓은 띠창 (날개 3층)."""
    rect(d, x0, y0, x1, y1, CURTAIN)
    glass(d, x0 + 0.08, y0 + 0.08, x1 - 0.08, y1 - 0.08)
    for k in range(1, cols):
        x = x0 + (x1 - x0) * k / cols
        rect(d, x - 0.05, y0, x + 0.05, y1, CURTAIN)
    rect(d, x0, y1 - transom - 0.05, x1, y1 - transom + 0.05, CURTAIN)


def medallion(d, cx, cy, r):
    """흰 돌 원형 메달리온 (테두리 + 안쪽 원판)."""
    H = d.im.size[1]
    for rr, c in ((r, STONE_SHADE), (r * 0.9, STONE), (r * 0.74, STONE_SHADE), (r * 0.68, STONE)):
        d.ellipse([m(cx - rr), H - m(cy + rr), m(cx + rr), H - m(cy - rr)], fill=c)


def quoins(d, x_edge, side, y0, y1, long=0.95, short=0.55, block=0.42):
    """모서리 흰 귓돌: 긴 돌과 짧은 돌을 번갈아 (side = +1 이면 x_edge 에서 오른쪽으로)."""
    y, k = y0, 0
    while y < y1 - 0.05:
        t = min(y + block, y1)
        w = long if k % 2 == 0 else short
        xa, xb = sorted((x_edge, x_edge + side * w))
        rect(d, xa, y + 0.03, xb, t - 0.03, STONE)
        rect(d, xa, y + 0.03, xb, y + 0.08, STONE_SHADE)
        y, k = t, k + 1


def cornice(d, x0, x1, y0, y1):
    """흰 처마 돌림띠 + 톱니(dentil) 그늘 줄."""
    rect(d, x0, y0, x1, y1, STONE)
    rect(d, x0, y0, x1, y0 + 0.06, STONE_SHADE)
    x = x0
    while x < x1:
        rect(d, x, y0 + 0.22, min(x + 0.09, x1), y0 + 0.36, STONE_SHADE)
        x += 0.2
    rect(d, x0, y1 - 0.14, x1, y1 - 0.08, STONE_SHADE)


def plinth(d, W):
    rect(d, 0, 0, W, 0.9, tuple(int(c * 0.78) for c in BRICK))
    rect(d, 0, 0.9, W, 1.05, STONE)


def save(img, name, alpha=None):
    img = img.filter(ImageFilter.GaussianBlur(0.35))
    if alpha is not None:
        img = img.convert("RGBA")
        img.putalpha(alpha)
        img.save(os.path.join(OUT, name))
    else:
        img.convert("RGB").save(os.path.join(OUT, name), quality=88)
    print("✓", name, img.size)


# 층 높이 (바닥 0.9 m 위): 1층 창 1.9–4.4, 2층 6.2–8.7, 3층 10.5–13.4, 처마 14.1–15.0
F1, F2, F3 = 1.9, 6.2, 10.5


def wing():
    W, H = 4.0, 15.0
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    for y in (F1, F2):
        for x in (0.62, 2.23):
            window(d, x, y, 1.15, 2.5, cols=2, rows=2, surround=0.16)
    rect(d, 0, 10.05, W, 10.25, STONE)
    band_window(d, 0.3, F3, W - 0.3, 13.6, cols=3)
    cornice(d, 0, W, 14.1, H)
    save(img, "dc_wing.jpg")


def center():
    W, H = 21.0, 15.0
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    g0, g1 = 4.5, W - 4.5
    for x in (1.6, W - 2.85):
        for y in (F1, F2):
            window(d, x, y, 1.25, 2.5, surround=0.18)
        band_window(d, x - 0.4, F3, x + 1.65, 13.6, cols=2)
    # 3층 높이 유리 커튼월 (1.5 m 간격 세로 멀리언, 층마다 짙은 띠)
    rect(d, g0, 0.9, g1, 14.1, CURTAIN)
    glass(d, g0 + 0.1, 1.0, g1 - 0.1, 14.0)
    x = g0
    while x <= g1 + 0.01:
        rect(d, x - 0.06, 0.9, x + 0.06, 14.1, CURTAIN)
        x += 1.5
    for y in (5.2, 9.6):
        rect(d, g0, y - 0.2, g1, y + 0.2, CURTAIN)
    for y in (3.3, 7.6, 12.0):
        rect(d, g0, y - 0.04, g1, y + 0.04, CURTAIN)
    # 가운데 출입문 (짙은 테두리 두 짝)
    cx = W / 2
    rect(d, cx - 2.1, 0.9, cx + 2.1, 3.6, (40, 44, 48))
    for x in (cx - 1.95, cx + 0.1):
        glass(d, x, 1.0, x + 1.85, 3.45)
    cornice(d, 0, W, 14.1, H)
    save(img, "dc_center.jpg")


def pav_front():
    W, H, E = 13.0, 23.5, 15.0
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    quoins(d, 0, +1, 1.05, E - 0.5)
    quoins(d, W, -1, 1.05, E - 0.5)
    for cx in (2.45, W - 2.45):
        for y in (F1, F2, F3):
            window(d, cx - 0.65, y, 1.3, 2.55, surround=0.2)
    # 가운데는 돌출창(모형)이 가린다 — 뒤는 벽돌
    rect(d, 0, E - 0.55, W, E, STONE)
    rect(d, 0, E - 0.55, W, E - 0.48, STONE_SHADE)
    # 박공 속 다락창
    window(d, W / 2 - 0.5, 17.4, 1.0, 1.8, cols=2, rows=2, sash=0, surround=0.22, keystone=False)
    Hh = img.size[1]
    apex = (m(W / 2), Hh - m(H))
    left, right = (0, Hh - m(E)), (m(W), Hh - m(E))
    d.line([left, apex, right], fill=STONE, width=m(0.5), joint="curve")  # 박공 가장자리 흰 돌
    alpha = Image.new("L", img.size, 255)
    a = ImageDraw.Draw(alpha)
    a.polygon([(0, 0), (m(W), 0), right, apex, left], fill=0)
    save(img, "dc_pav_front.png", alpha=alpha.filter(ImageFilter.GaussianBlur(0.6)))


def pav_side():
    W, H = 37.0, 15.0
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    plinth(d, W)
    quoins(d, 0, +1, 1.05, 14.1)
    quoins(d, W, -1, 1.05, 14.1)
    cols = [3.3 + k * 4.35 for k in range(8)]
    for k, cx in enumerate(cols):
        if k in (2, 5):  # 3칸짜리 돌출창 자리 (흰 돌 틀 + 층 사이 메달리온)
            for xa in (cx - 1.75, cx + 1.55):
                rect(d, xa, 1.3, xa + 0.2, 13.8, STONE)
            rect(d, cx - 1.75, 13.6, cx + 1.75, 13.8, STONE)
            for y in (F1, F2, F3):
                window(d, cx - 1.45, y - 0.1, 2.9, 2.6, cols=4, rows=2, surround=0.0, keystone=False)
            for y in (5.35, 9.65):
                for dx in (-0.75, 0.75):
                    medallion(d, cx + dx, y, 0.4)
        else:
            for y in (F1, F2, F3):
                window(d, cx - 0.62, y, 1.24, 2.5, surround=0.18)
    cornice(d, 0, W, 14.1, H)
    save(img, "dc_pav_side.jpg")


def bay():
    """박공동 가운데 돌출창 (지면 0.9 → 14.3 m): 큰 창 셋 + 층 사이 메달리온 판."""
    W, H = 4.6, 13.4
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    rect(d, 0, 0, 0.3, H, STONE)
    rect(d, W - 0.3, 0, W, H, STONE)
    for y0 in (1.0, 5.3, 9.6):  # 창 아래·위 흰 돌 띠
        rect(d, 0, y0 - 0.3, W, y0, STONE)
        rect(d, 0, y0 - 0.3, W, y0 - 0.24, STONE_SHADE)
        window(d, 0.4, y0, W - 0.8, 2.7, cols=5, rows=2, sash=0.5, surround=0.0, keystone=False)
        rect(d, 0, y0 + 2.7, W, y0 + 2.95, STONE)
    for y in (4.3, 8.6):  # 메달리온 판 (가운데 흰 기둥띠로 나뉜다)
        rect(d, W / 2 - 0.12, y - 0.7, W / 2 + 0.12, y + 0.7, STONE)
        for dx in (-1.05, 1.05):
            medallion(d, W / 2 + dx, y, 0.42)
    rect(d, 0, H - 0.4, W, H, STONE)
    save(img, "dc_bay.jpg")


def frieze():
    global PX
    PX, px = 120, PX  # 글자는 가까이서도 읽히게 더 촘촘히
    W, H = 20.2, 0.8
    img = Image.new("RGB", (m(W), m(H)), STONE)
    d = ImageDraw.Draw(img)
    rect(d, 0, 0, W, 0.05, STONE_SHADE)
    rect(d, 0, H - 0.05, W, H, STONE_SHADE)
    font = ImageFont.truetype(FONT, m(0.56), index=2)  # Songti TC Bold (번체 글자가 있는 면)
    for ch, dx in zip("東泉館", (-4.2, 0.0, 4.2)):  # 가운데 기둥 사이마다 한 자씩
        d.text((m(W / 2 + dx), m(H / 2)), ch, font=font, fill=TEXT, anchor="mm")
    save(img, "dc_frieze.jpg")
    PX = px


def pediment():
    W, H = 20.2, 5.6
    img = Image.new("RGB", (m(W), m(H)), STONE)
    d = ImageDraw.Draw(img)
    Hh = img.size[1]
    # 돌 이음 줄
    for y in np.arange(0.9, H, 0.9):
        d.line([0, Hh - m(y), m(W), Hh - m(y)], fill=STONE_SHADE, width=1)
        off = (int(y / 0.9) % 2) * 0.9
        for x in np.arange(off, W, 1.8):
            d.line([m(x), Hh - m(y), m(x), Hh - m(y - 0.9)], fill=STONE_SHADE, width=1)
    # 둘레 테두리: 바깥 흰 띠 → 톱니 줄 → 안쪽 그늘
    tri = lambda inset: [  # noqa: E731
        (m(inset * 2.2), Hh - m(inset)),
        (m(W / 2), Hh - m(H - inset * 1.2)),
        (m(W - inset * 2.2), Hh - m(inset)),
    ]
    d.line(tri(0.18) + [tri(0.18)[0]], fill=STONE, width=m(0.36))
    for k in range(0, 60):
        t = k / 60
        for (xa, ya), (xb, yb) in ((tri(0.5)[0], tri(0.5)[1]), (tri(0.5)[1], tri(0.5)[2])):
            x, y = xa + (xb - xa) * t, ya + (yb - ya) * t
            d.rectangle([x - 2, y - 2, x + 2, y + 2], fill=STONE_SHADE)
    d.line([(0, Hh - m(0.55)), (m(W), Hh - m(0.55))], fill=STONE_SHADE, width=m(0.1))
    # 가운데 십자 원형창
    cx, cy, r = W / 2, 2.55, 0.85
    rect(d, cx - 0.14, cy - r - 0.55, cx + 0.14, cy + r + 0.55, STONE_SHADE)
    rect(d, cx - r - 0.55, cy - 0.14, cx + r + 0.55, cy + 0.14, STONE_SHADE)
    d.ellipse([m(cx - r - 0.2), Hh - m(cy + r + 0.2), m(cx + r + 0.2), Hh - m(cy - r - 0.2)], fill=STONE_SHADE)
    d.ellipse([m(cx - r), Hh - m(cy + r), m(cx + r), Hh - m(cy - r)], fill=GLASS_BOT)
    for rr in (0.62, 0.3):
        d.ellipse([m(cx - rr), Hh - m(cy + rr), m(cx + rr), Hh - m(cy - rr)], outline=FRAME, width=m(0.06))
    for k in range(4):
        a = k * math.pi / 4
        d.line([m(cx - math.cos(a) * r), Hh - m(cy - math.sin(a) * r), m(cx + math.cos(a) * r), Hh - m(cy + math.sin(a) * r)], fill=FRAME, width=m(0.05))
    alpha = Image.new("L", img.size, 0)
    ImageDraw.Draw(alpha).polygon([(0, Hh), (m(W / 2), 0), (m(W), Hh)], fill=255)
    save(img, "dc_pediment.png", alpha=alpha.filter(ImageFilter.GaussianBlur(0.6)))


def coffer():
    W = 2.8
    img = Image.new("RGB", (m(W), m(W)), STONE)
    d = ImageDraw.Draw(img)
    rect(d, 0.35, 0.35, W - 0.35, W - 0.35, STONE_SHADE)
    rect(d, 0.55, 0.55, W - 0.55, W - 0.55, (210, 206, 196))
    rect(d, 0.8, 0.8, W - 0.8, W - 0.8, (186, 182, 172))
    save(img, "dc_coffer.jpg")


def fence():
    W, H = 3.0, 0.9
    img = Image.new("RGB", (m(W), m(H)), IRON)
    alpha = Image.new("L", img.size, 0)
    a = ImageDraw.Draw(alpha)
    Hh = img.size[1]
    lw = max(2, m(0.04))
    a.rectangle([0, 0, m(W), m(0.06)], fill=255)  # 위 난간대
    a.rectangle([0, Hh - m(0.06), m(W), Hh], fill=255)
    for x in np.arange(0, W + 0.01, 1.5):  # 기둥
        a.rectangle([m(x) - lw, 0, m(x) + lw, Hh], fill=255)
    for x in np.arange(0, W, 0.5):  # 마름모 살
        a.line([m(x), Hh - m(0.06), m(x + 0.25), m(0.06)], fill=255, width=lw)
        a.line([m(x + 0.25), m(0.06), m(x + 0.5), Hh - m(0.06)], fill=255, width=lw)
    save(img, "dc_fence.png", alpha=alpha)


if __name__ == "__main__":
    wing()
    center()
    pav_front()
    pav_side()
    bay()
    frieze()
    pediment()
    coffer()
    fence()
