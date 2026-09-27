"""
계명대학교 아담스채플관 외벽 무늬를 그린다 (사진을 쓰지 않고 모양만 보고 그린 그림).

  python3 scripts/scenery/gen_chapel.py <출력 폴더>

참고: 사용자가 준 사진·캠퍼스 소개 영상·Commons 사진 설명·OSM 윤곽을 교차 검증한 명세
- 적갈색 벽돌(#9A4B35) + 흰 화강암 테두리(#E3E0D7), 창은 흰 테두리의 어두운 스테인드글라스(#2B3440)
- 측랑 한 칸(5 m): 흰 버팀 기둥띠 사이에 긴 아치 창 둘, 아래층(테라스 밑)에 작은 아치 창 둘
- 채광층 한 칸: 둥근 창 하나 + 벽돌 치장 띠
- 탑(6.5 m 사각): 모서리는 벽돌, 짝 아치 창 3줄, 꼭대기 가까이 둥근 창
- 가운데 박공(11 m): 흰 돌 기둥띠 양옆, 장미창(8잎) 아래 계단식 벽돌 아치 속 큰 아치 창, 테라스 높이에 문과 차양
크기는 m 단위, 1 m = PX 픽셀. 산 중턱(약 360 m 밖)에서 보이는 정도로 단순하게.

만드는 것
- adams_aisle.jpg      : 측랑 한 칸 (5 × 12.5 m) — 가로로 반복
- adams_clerestory.jpg : 채광층 한 칸 (5 × 4.5 m)
- adams_tower.jpg      : 탑 한 면 (6.5 × 20 m)
- adams_front.png      : 가운데 박공 정면 (11 × 21.5 m, 박공 바깥은 투명)
- adams_drum.jpg       : 드럼 한 칸 (2.13 × 3.5 m) — 둘레로 반복 (14칸)
- adams_brick.jpg      : 무늬 없는 벽돌 (4 × 4 m)
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageDraw, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "facades"
os.makedirs(OUT, exist_ok=True)
PX = 48  # 1 m 당 픽셀

BRICK = (154, 75, 53)
BRICK_DARK = (122, 58, 42)
STONE = (227, 224, 215)
STONE_SHADE = (201, 197, 186)
GLASS = (43, 52, 64)
GLASS_HI = (80, 96, 112)
WHITE = (236, 235, 230)


def brick_canvas(w_m, h_m):
    """벽돌 바탕: 벽돌 한 장 0.25 × 0.075 m, 색이 조금씩 다르다."""
    w, h = round(w_m * PX), round(h_m * PX)
    img = np.zeros((h, w, 3), np.float32)
    bw, bh = 0.25 * PX, 0.075 * PX
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy / bh).astype(int)
    col = ((xx + (row % 2) * bw / 2) / bw).astype(int)
    seed = (row * 7919 + col * 104729) % 1000
    tone = 0.86 + 0.24 * ((seed * 37 % 100) / 100.0)
    img[:] = np.array(BRICK, np.float32) * tone[..., None]
    mortar = ((yy % bh) < 1) | (((xx + (row % 2) * bw / 2) % bw) < 1)
    img[mortar] = np.array((190, 176, 160), np.float32)
    return Image.fromarray(np.clip(img, 0, 255).astype(np.uint8))


def m(v):
    return round(v * PX)


def rect(d, x0, y0, x1, y1, fill):
    """아래가 y=0 인 m 좌표 → 그림 좌표 (위가 0)."""
    H = d.im.size[1]
    d.rectangle([m(x0), H - m(y1), m(x1) - 1, H - m(y0) - 1], fill=fill)


def arch_window(d, cx, y0, w, h, frame=0.16, mullion=True):
    """아치 창 (흰 테두리 + 어두운 유리)."""
    H = d.im.size[1]
    r = w / 2
    for pad, color in ((frame, STONE), (0.0, GLASS)):
        x0, x1 = cx - r - pad, cx + r + pad
        top = y0 + h - r
        d.rectangle([m(x0), H - m(top), m(x1), H - m(y0 - pad)], fill=color)
        d.ellipse([m(x0), H - m(top + r + pad), m(x1), H - m(top - r - pad)], fill=color)
    if mullion:
        d.line([m(cx), H - m(y0 + h - 0.2), m(cx), H - m(y0)], fill=STONE_SHADE, width=max(1, m(0.05)))
    d.rectangle([m(cx - r * 0.7), H - m(y0 + h * 0.72), m(cx - r * 0.2), H - m(y0 + h * 0.5)], fill=GLASS_HI)


def round_window(d, cx, cy, dia, frame=0.2, spokes=0):
    H = d.im.size[1]
    r = dia / 2
    d.ellipse([m(cx - r - frame), H - m(cy + r + frame), m(cx + r + frame), H - m(cy - r - frame)], fill=STONE)
    d.ellipse([m(cx - r), H - m(cy + r), m(cx + r), H - m(cy - r)], fill=GLASS)
    for k in range(spokes):
        a = k / spokes * math.tau
        d.line([m(cx), H - m(cy), m(cx + math.cos(a) * r), H - m(cy + math.sin(a) * r)], fill=STONE, width=max(1, m(0.12)))
    if spokes:
        rr = r * 0.28
        d.ellipse([m(cx - rr), H - m(cy + rr), m(cx + rr), H - m(cy - rr)], fill=STONE)


def rusticated(d, x0, x1, y0, y1, block=0.7):
    """흰 화강암을 쌓은 기둥띠 (블록마다 조금 다른 색, 이음 줄)."""
    y, k = y0, 0
    while y < y1:
        t = min(y + block, y1)
        inset = 0.08 if k % 2 else 0.0
        c = tuple(int(v * (0.94 + 0.08 * ((k * 37) % 7) / 7)) for v in STONE)
        rect(d, x0 + inset, y, x1 - inset, t - 0.04, c)
        rect(d, x0 + inset, t - 0.04, x1 - inset, t, STONE_SHADE)
        y, k = t, k + 1


def dentil(d, x0, x1, y, h=0.25, step=0.35):
    """벽돌 치장 띠 (흰 이빨 무늬)."""
    rect(d, x0, y, x1, y + 0.08, STONE)
    x = x0
    while x < x1:
        rect(d, x, y - h, min(x + step / 2, x1), y, STONE_SHADE)
        x += step


def save(img, name, alpha=None):
    img = img.filter(ImageFilter.GaussianBlur(0.4))
    if alpha is not None:
        img = img.convert("RGBA")
        img.putalpha(alpha)
        img.save(os.path.join(OUT, name))
    else:
        img.convert("RGB").save(os.path.join(OUT, name), quality=88)
    print("✓", name, img.size)


def aisle():
    W, H = 5.0, 12.5
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    rusticated(d, 0, W, 0, 1.0, block=1.0)  # 아래 받침
    rect(d, 0, 5.0, W, 5.3, STONE)  # 테라스 높이 띠
    for cx in (W / 2 - 0.95, W / 2 + 0.95):
        arch_window(d, cx, 1.6, 0.8, 2.4, frame=0.12, mullion=False)  # 아래층 (테라스 밑)
        arch_window(d, cx, 6.5, 1.0, 5.3, frame=0.15)  # 위층 긴 창
    dentil(d, 0, W, 12.2)
    rusticated(d, 0, 0.8, 0, H, block=0.9)  # 흰 버팀 기둥띠 (칸 왼쪽 끝)
    save(img, "adams_aisle.jpg")


def clerestory():
    W, H = 5.0, 4.5
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    round_window(d, W / 2, 2.1, 1.6, spokes=8)
    dentil(d, 0, W, 4.2)
    save(img, "adams_clerestory.jpg")


def tower():
    W, H = 6.5, 20.0
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    rusticated(d, 0, W, 0, 1.0, block=1.0)
    for y in (2.2, 7.2, 12.2):
        for cx in (W / 2 - 0.8, W / 2 + 0.8):
            arch_window(d, cx, y, 0.9, 3.2, frame=0.13, mullion=False)
        rect(d, 0, y - 0.45, W, y - 0.3, STONE)
    round_window(d, W / 2, 17.6, 2.0, spokes=8)
    dentil(d, 0, W, 19.7)
    save(img, "adams_tower.jpg")


def front():
    W, H = 11.0, 21.5
    shoulder = 17.5
    img = brick_canvas(W, H)
    d = ImageDraw.Draw(img)
    cx = W / 2
    rusticated(d, 0, W, 0, 1.0, block=1.0)
    # 계단식 벽돌 아치 속 큰 아치 창
    Hh = img.size[1]
    for k, pad in enumerate((1.0, 0.65, 0.3)):
        c = BRICK_DARK if k % 2 == 0 else (140, 66, 48)
        r = 2.0 + pad
        d.ellipse([m(cx - r), Hh - m(13.0 + r), m(cx + r), Hh - m(13.0 - r)], fill=c)
        d.rectangle([m(cx - r), Hh - m(13.0), m(cx + r), Hh - m(6.0)], fill=c)
    arch_window(d, cx, 6.0, 4.0, 9.0, frame=0.25)
    round_window(d, cx, 16.4, 3.8, frame=0.4, spokes=8)  # 장미창
    # 테라스 높이 문 + 흰 차양
    arch_window(d, cx, 0.0, 2.0, 3.2, frame=0.2, mullion=False)
    rect(d, cx - 2.4, 5.0, cx + 2.4, 5.5, STONE)
    rusticated(d, 0, 1.4, 0, H)
    rusticated(d, W - 1.4, W, 0, H)
    alpha = Image.new("L", img.size, 255)
    a = ImageDraw.Draw(alpha)
    left = [(m(1.4), Hh - m(shoulder)), (m(cx), Hh - m(H - 0.15)), (m(W - 1.4), Hh - m(shoulder))]
    a.polygon([(m(1.4), 0), (m(W - 1.4), 0), left[2], left[1], left[0]], fill=0)
    d.line(left, fill=STONE, width=m(0.6), joint="curve")
    save(img, "adams_front.png", alpha=alpha.filter(ImageFilter.GaussianBlur(0.6)))


def drum():
    W, H = 2.13, 3.5
    img = Image.new("RGB", (m(W), m(H)), WHITE)
    d = ImageDraw.Draw(img)
    rect(d, 0, 0, W, 0.3, STONE_SHADE)
    rect(d, 0, H - 0.35, W, H, STONE_SHADE)
    arch_window(d, W / 2, 0.7, 0.8, 2.0, frame=0.0, mullion=False)
    save(img, "adams_drum.jpg")


def plain():
    save(brick_canvas(4, 4), "adams_brick.jpg")


if __name__ == "__main__":
    aisle()
    clerestory()
    tower()
    front()
    drum()
    plain()
