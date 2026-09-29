"""
계명대학교 봉경관(鳳卿館, 사회과학대학·사회관) 외벽 무늬를 그린다 (사진을 쓰지 않고 모양만 보고 그린 그림).

  python3 scripts/scenery/gen_bongkyung.py <출력 폴더>

참고: 사용자가 2026-09-29 동남쪽 앞마당에서 찍은 사진(IMG_4042)과 OSM 윤곽(북쪽 날개 78 × 21.5 m + 남쪽 날개 20 × 72 m …)
- 짙은 붉은 벽돌 4층 평지붕, 밝은 회색 금속 난간 갓돌
- 창은 두 개씩 한 칸(약 6.3 m): 흰 알루미늄 창(위 채광창 둘 + 아래 미닫이 셋), 회색 돌 인방·창턱, 칸 사이 가는 신축 줄눈
- 1층 창은 흰 세로 창살 / 남쪽 날개 동쪽 면 1층은 벽돌 기둥 사이 어두운 유리 현관, 그 위 띠에 현판 다섯(가운데 셋 '鳳 卿 館')
- 긴 남쪽 면과 동쪽 끝 면의 1·2층을 담쟁이가 덮었다
담쟁이는 벽 무늬와 따로, 투명 바탕 위 잎 그림으로 그려 벽 앞에 한 겹 더 세운다 (gen_jeonsan.py 와 같은 방법).
크기는 m 단위, 1 m = PX 픽셀.

만드는 것
- bk_bay.jpg       : 벽 한 칸 (6.3 × 16 m, 가로로 되풀이) — 모델이 벽 길이에 맞춰 칸 수를 정수로 맞춘다
- bk_brick.jpg     : 창 없는 벽돌 (4 × 4 m 되풀이) — 현관 안쪽 벽·기둥
- bk_lobby.jpg     : 현관 안쪽 유리벽 (LOBBY_W × LOBBY_H m)
- bk_plaques.png   : 현판 띠 (투명 바탕, LOBBY_W × 0.8 m)
- bk_south_ivy.png : 북쪽 날개 남쪽 면 담쟁이 (SOUTH_N 칸)
- bk_east_ivy.png  : 북쪽 날개 동쪽 끝 면 담쟁이 (EAST_N 칸)
"""

import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

OUT = sys.argv[1] if len(sys.argv) > 1 else "facades"
os.makedirs(OUT, exist_ok=True)
PX = 48

# build_scenery.build_bongkyung 과 같은 치수
BAY = 6.3  # 한 칸 (창 둘)
H_M = 16.0  # 벽 높이 (갓돌 밑)
FLOOR0, PITCH = 0.3, 3.6  # 1층 바닥, 층 높이
SILL, WIN_H, WIN_W = 0.95, 2.2, 2.4  # 바닥에서 창턱까지, 창 높이·폭
LOBBY_W, LOBBY_H = 13.09, 3.7  # 현관 폭(남쪽 날개 72 m 를 11칸으로 나눈 두 칸)·높이
SOUTH_L, SOUTH_N = 57.6, 9  # 긴 남쪽 면 길이·칸 수
EAST_L, EAST_N = 21.4, 3

BRICK = (128, 52, 42)
MORTAR = (160, 132, 120)
FRAME = (238, 238, 234)
STONE = (176, 174, 168)
STONE_DARK = (142, 140, 134)
GLASS_TOP = (168, 176, 180)
GLASS_BOT = (74, 80, 84)
DARK = (30, 32, 34)
LEAF = [(52, 78, 34), (64, 92, 40), (78, 104, 46), (44, 66, 30), (92, 112, 52), (70, 86, 40), (86, 100, 44)]


def m(v):
    return round(v * PX)


def brick_canvas(w_m, h_m, seed=5):
    w, h = m(w_m), m(h_m)
    img = np.zeros((h, w, 3), np.float32)
    bw, bh = 0.23 * PX, 0.075 * PX
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy / bh).astype(int)
    col = ((xx + (row % 2) * bw / 2) / bw).astype(int)
    r = np.random.default_rng(seed).random((row.max() + 2, col.max() + 2))[row, col]
    img[:] = np.array(BRICK, np.float32) * (0.84 + 0.26 * r)[..., None]
    img[r > 0.93] *= 0.8
    mortar = ((yy % bh) < 1) | (((xx + (row % 2) * bw / 2) % bw) < 1)
    img[mortar] = np.array(MORTAR, np.float32)
    # 되풀이 이음매가 보이지 않게 가로 끝은 벽돌 줄이 맞도록 (bw 의 배수가 아니어도 줄눈만 조금 어긋난다)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def rect(d, x0, y0, x1, y1, fill):
    """아래가 y=0 인 m 좌표 → 그림 좌표 (위가 0)."""
    H = d.im.size[1]
    a, b = m(x0), H - m(y1)
    d.rectangle([a, b, max(a, m(x1) - 1), max(b, H - m(y0) - 1)], fill=fill)


def glass(d, x0, y0, x1, y1, top=GLASS_TOP, bot=GLASS_BOT):
    H = d.im.size[1]
    t0, b0 = H - m(y1), H - m(y0)
    for py in range(t0, b0):
        t = (py - t0) / max(1, b0 - t0 - 1)
        c = tuple(int(a + (b - a) * t) for a, b in zip(top, bot))
        d.line([m(x0), py, m(x1) - 1, py], fill=c)


def window(d, x0, y0, bars=False):
    """흰 알루미늄 창: 위 채광창 둘 + 아래 미닫이 셋, 회색 돌 인방·창턱과 얇은 돌 문설주."""
    w, h = WIN_W, WIN_H
    # 돌 테두리 (문설주 얇게, 인방·창턱은 양옆으로 조금 더)
    rect(d, x0 - 0.12, y0 - 0.02, x0 + w + 0.12, y0 + h + 0.02, STONE_DARK)
    rect(d, x0 - 0.2, y0 + h, x0 + w + 0.2, y0 + h + 0.2, STONE)
    rect(d, x0 - 0.2, y0 + h + 0.18, x0 + w + 0.2, y0 + h + 0.2, STONE_DARK)
    rect(d, x0 - 0.2, y0 - 0.16, x0 + w + 0.2, y0, STONE)
    rect(d, x0 - 0.2, y0 - 0.18, x0 + w + 0.2, y0 - 0.14, STONE_DARK)
    # 창틀과 유리
    rect(d, x0, y0, x0 + w, y0 + h, FRAME)
    tr = h * 0.3  # 채광창
    glass(d, x0 + 0.07, y0 + h - tr + 0.03, x0 + w / 2 - 0.03, y0 + h - 0.07, (200, 206, 208), (150, 158, 162))
    glass(d, x0 + w / 2 + 0.03, y0 + h - tr + 0.03, x0 + w - 0.07, y0 + h - 0.07, (200, 206, 208), (150, 158, 162))
    low = h - tr
    rng = np.random.default_rng(int(x0 * 100 + y0 * 7))
    for k in range(3):
        a = x0 + 0.07 + k * (w - 0.14) / 3
        b = a + (w - 0.14) / 3 - 0.06
        # 창마다 블라인드·커튼 조금씩 달리
        if rng.random() < 0.35:
            glass(d, a, y0 + 0.07, b, y0 + low - 0.03, (212, 212, 206), (176, 176, 170))
        else:
            glass(d, a, y0 + 0.07, b, y0 + low - 0.03)
        rect(d, b, y0 + 0.07, b + 0.06, y0 + low, FRAME)
    rect(d, x0, y0 + low - 0.04, x0 + w, y0 + low + 0.04, FRAME)
    if bars:  # 1층: 흰 세로 창살
        x = x0 + 0.12
        while x < x0 + w - 0.06:
            rect(d, x, y0, x + 0.04, y0 + h, FRAME)
            x += 0.16
        rect(d, x0, y0 + h * 0.45, x0 + w, y0 + h * 0.45 + 0.05, FRAME)


def bay_windows(d, u0, floors=(0, 1, 2, 3)):
    """한 칸(u0 부터 BAY m)의 창들, 창 구멍 목록을 돌려준다 (담쟁이를 깎을 곳)."""
    holes = []
    for f in floors:
        y = FLOOR0 + f * PITCH + SILL
        for x in (0.55, 0.55 + WIN_W + 0.5):
            window(d, u0 + x, y, bars=(f == 0))
            holes.append((u0 + x - 0.2, y - 0.2, u0 + x + WIN_W + 0.2, y + WIN_H + 0.2))
    return holes


def plinth(d, W):
    rect(d, 0, 0, W, 0.6, (150, 146, 138))
    rect(d, 0, 0.56, W, 0.62, (118, 114, 108))


def save(img, name):
    img = img.filter(ImageFilter.GaussianBlur(0.35))
    img.convert("RGB").save(os.path.join(OUT, name), quality=88)
    print("✓", name, img.size)


def bay():
    img = brick_canvas(BAY, H_M)
    d = ImageDraw.Draw(img)
    plinth(d, BAY)
    bay_windows(d, 0.0)
    # 칸 사이 신축 줄눈 (칸 끝 = 되풀이 이음매)
    rect(d, 0, 0.6, 0.03, H_M, (96, 40, 34))
    save(img, "bk_bay.jpg")


def brick():
    img = brick_canvas(4.0, 4.0, seed=9)
    save(img, "bk_brick.jpg")


def lobby():
    """현관 안쪽: 어두운 유리 커튼월 + 여닫이 유리문 두 쌍."""
    W, H = LOBBY_W, LOBBY_H
    img = Image.new("RGB", (m(W), m(H)), DARK)
    d = ImageDraw.Draw(img)
    glass(d, 0, 0, W, H, (92, 98, 102), (26, 28, 30))
    x = 0.0
    while x < W:
        rect(d, x, 0, x + 0.08, H, (54, 56, 58))
        x += 1.1
    rect(d, 0, 2.7, W, 2.78, (54, 56, 58))
    for cx in (W * 0.3, W * 0.7):
        rect(d, cx - 1.2, 0, cx + 1.2, 2.5, (40, 42, 44))
        glass(d, cx - 1.12, 0.05, cx - 0.04, 2.42, (110, 116, 118), (36, 38, 40))
        glass(d, cx + 0.04, 0.05, cx + 1.12, 2.42, (110, 116, 118), (36, 38, 40))
        rect(d, cx - 0.2, 0.9, cx - 0.12, 1.5, (180, 180, 176))
        rect(d, cx + 0.12, 0.9, cx + 0.2, 1.5, (180, 180, 176))
    # 안쪽 게시판·불빛 몇 개
    rect(d, 1.0, 1.0, 1.6, 1.9, (150, 128, 70))
    for x in (2.2, 6.4, 10.6):
        rect(d, x, 3.4, x + 0.8, 3.5, (220, 214, 190))
    save(img, "bk_lobby.jpg")


def plaques():
    """현판 띠: 가운데 짙은 회색 판 셋에 밝은 회색 '鳳 卿 館', 양 끝은 밝은 돌판 (투명 바탕)."""
    W, H = LOBBY_W, 0.8
    img = Image.new("RGBA", (m(W), m(H)), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = 0.62  # 판 한 변
    font = None
    for path, idx in (("/System/Library/Fonts/Supplemental/Songti.ttc", 1), ("/System/Library/Fonts/Hiragino Sans GB.ttc", 0)):
        try:
            font = ImageFont.truetype(path, m(s * 0.78), index=idx)
            break
        except OSError:
            continue
    xs = [W / 2 + k * 2.3 for k in (-2, -1, 0, 1, 2)]
    for k, cx in enumerate(xs):
        x0, y0 = m(cx - s / 2), m((H - s) / 2)
        box = [x0, y0, x0 + m(s), y0 + m(s)]
        if k in (0, 4):
            d.rectangle(box, fill=(196, 194, 188, 255), outline=(150, 148, 142, 255), width=2)
        else:
            d.rectangle(box, fill=(44, 46, 50, 255), outline=(24, 24, 26, 255), width=2)
            ch = "鳳卿館"[k - 1]
            if font:
                d.text((x0 + m(s) / 2, y0 + m(s) / 2), ch, font=font, fill=(198, 198, 192, 255), anchor="mm")
    img.save(os.path.join(OUT, "bk_plaques.png"))
    print("✓ bk_plaques.png", img.size)


def ivy(W, H, regions, holes, seed):
    """담쟁이: regions(덮는 곳) − holes(창 둘레) 안에 잎을 촘촘히. 가장자리는 들쭉날쭉, 아래로 늘어진 줄기도."""
    w, h = m(W), m(H)
    mask = Image.new("L", (w, h), 0)
    md = ImageDraw.Draw(mask)
    for (x0, y0, x1, y1) in regions:
        md.rectangle([m(x0), h - m(y1), m(x1), h - m(y0)], fill=255)
    rng = np.random.default_rng(seed)
    noise = Image.fromarray((rng.random((h // 16 + 2, w // 16 + 2)) * 255).astype(np.uint8)).resize((w, h), Image.BICUBIC)
    f = np.asarray(mask.filter(ImageFilter.GaussianBlur(PX * 0.4)), np.float32) / 255
    n = np.asarray(noise, np.float32) / 255
    cover = (f + (n - 0.5) * 0.75) > 0.5
    hole = Image.new("L", (w, h), 0)
    hd = ImageDraw.Draw(hole)
    for (x0, y0, x1, y1) in holes:
        hd.rectangle([m(x0), h - m(y1), m(x1), h - m(y0)], fill=255)
    cover &= np.asarray(hole) == 0
    img = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    ys, xs = np.nonzero(cover)
    if len(xs) == 0:
        return img
    pick = rng.integers(0, len(xs), int(len(xs) / 14))
    for layer, (lo, hi, dark) in enumerate(((0, 4, 0.62), (0, 7, 1.0))):
        for k in pick[layer::2]:
            x, y = xs[k], ys[k]
            r = rng.uniform(0.07, 0.14) * PX
            c = LEAF[rng.integers(lo, hi)]
            t = dark * rng.uniform(0.85, 1.12)
            col = tuple(int(min(255, v * t)) for v in c) + (255,)
            e = r * rng.uniform(0.7, 1.0)
            d.ellipse([x - r, y - e, x + r, y + e], fill=col)
    # 창 앞으로 늘어진 줄기 (사진처럼 창 위를 가로질러 흘러내린다)
    for _ in range(int(W * 1.5)):
        k = rng.integers(0, len(xs))
        x, y = xs[k], ys[k]
        L = rng.uniform(0.5, 2.2) * PX
        for s in range(int(L / 3)):
            yy = y + s * 3
            xx = x + np.sin(s * 0.35) * 2.5
            if yy >= h:
                break
            r = rng.uniform(0.05, 0.09) * PX
            d.ellipse([xx - r, yy - r, xx + r, yy + r], fill=LEAF[rng.integers(0, 4)] + (255,))
    return img.filter(ImageFilter.GaussianBlur(0.3))


def wall_holes(L, n):
    """길이 L 벽을 n 칸으로 나눴을 때(칸 폭을 늘여 맞춘다) 창 구멍 — 담쟁이 그림도 같은 비율로 그린다."""
    k = L / (n * BAY)
    holes = []
    for i in range(n):
        for f in range(4):
            y = FLOOR0 + f * PITCH + SILL
            for x in (0.55, 0.55 + WIN_W + 0.5):
                holes.append(((i * BAY + x - 0.2) * k, y - 0.25, (i * BAY + x + WIN_W + 0.2) * k, y + WIN_H + 0.25))
    return holes


def south_ivy():
    """긴 남쪽 면 (서 → 동, 그림 왼쪽 = 현관 날개 쪽 모서리). 사진: 가운데 ~ 동쪽 끝 1·2층, 군데군데 3층까지."""
    W, H = SOUTH_L, 11.5
    regions = [(20.0, 0.3, 57.4, 7.6), (27.0, 7.4, 31.0, 10.8), (44.0, 7.4, 50.0, 9.8), (8.0, 0.3, 15.0, 3.5), (55.0, 7.0, 57.6, 11.2)]
    img = ivy(W, H, regions, wall_holes(SOUTH_L, SOUTH_N), 31)
    img.save(os.path.join(OUT, "bk_south_ivy.png"))
    print("✓ bk_south_ivy.png", img.size)


def east_ivy():
    """동쪽 끝 면 (남 → 북). 사진: 남쪽 모서리부터 1·2층을 거의 덮고 모서리를 타고 3층까지."""
    W, H = EAST_L, 11.5
    regions = [(0.0, 0.3, 14.0, 7.8), (0.0, 7.6, 2.2, 11.2), (14.0, 0.3, 21.2, 4.0)]
    img = ivy(W, H, regions, wall_holes(EAST_L, EAST_N), 37)
    img.save(os.path.join(OUT, "bk_east_ivy.png"))
    print("✓ bk_east_ivy.png", img.size)


if __name__ == "__main__":
    bay()
    brick()
    lobby()
    plaques()
    south_ivy()
    east_ivy()
