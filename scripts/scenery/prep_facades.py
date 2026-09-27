"""
계명대학교 건물 사진(Wikimedia Commons, 출처는 public/credits.html)을 3D 건물 외벽 텍스처로 다듬는다.

  python3 scripts/scenery/prep_facades.py <사진 폴더> <출력 폴더>

사진 폴더: library_a.jpg · rose.jpg(채플) · main_a.jpg (내려받는 방법은 scripts/scenery/README.md)
각 사진마다
  1) 원근 바로잡기 (세로선이 기울어진 사진만)
  2) 건물 정면만 자르기
  3) 하늘 도려내기: 지붕선 다각형 밖 + 그 안에서도 바깥 하늘과 이어진 파란 픽셀 → 투명
  4) 옆·뒷면용 반복 무늬(창 줄) 잘라 내기
좌표는 원본 사진 픽셀 기준 (미리보기에 격자를 그려 읽었다).
"""

import json
import os
import sys
from collections import deque

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageOps

SRC = sys.argv[1] if len(sys.argv) > 1 else "."
OUT = sys.argv[2] if len(sys.argv) > 2 else "facades"
os.makedirs(OUT, exist_ok=True)


def load(name):
    return ImageOps.exif_transpose(Image.open(os.path.join(SRC, name))).convert("RGB")


def perspective(im, src_quad, dst_quad):
    """src 사각형(TL,TR,BR,BL)을 dst 사각형으로 보내는 투영 변환."""
    # PIL.transform은 출력 좌표 → 입력 좌표 계수가 필요하다
    A, b = [], []
    for (x, y), (u, v) in zip(dst_quad, src_quad):
        A.append([x, y, 1, 0, 0, 0, -u * x, -u * y])
        A.append([0, 0, 0, x, y, 1, -v * x, -v * y])
        b += [u, v]
    coef = np.linalg.solve(np.array(A, float), np.array(b, float))
    return im.transform(im.size, Image.PERSPECTIVE, coef.tolist(), Image.BICUBIC)


def sky_alpha(im, keep_poly=None, removable=None, blue=(40, 15)):
    """하늘 = (다각형 밖) ∪ (바깥 하늘과 이어진 파란 픽셀). removable(x,y)가 거짓인 곳은 지우지 않는다."""
    a = np.asarray(im).astype(np.int16)
    h, w, _ = a.shape
    r, g, bb = a[..., 0], a[..., 1], a[..., 2]
    is_blue = (bb > r + blue[0]) & (bb > g + blue[1]) & (bb > 110)
    outside = np.zeros((h, w), bool)
    if keep_poly:
        m = Image.new("L", (w, h), 0)
        ImageDraw.Draw(m).polygon(keep_poly, fill=255)
        outside = np.asarray(m) == 0
    cand = is_blue | outside
    if removable is not None:
        yy, xx = np.mgrid[0:h, 0:w]
        cand &= removable(xx, yy) | outside
    sky = np.zeros((h, w), bool)
    q = deque()
    for x in range(w):
        if cand[0, x]:
            sky[0, x] = True
            q.append((0, x))
    for y in range(h):
        for x in (0, w - 1):
            if cand[y, x] and not sky[y, x] and (outside[y, x] or y < h * 0.6):
                sky[y, x] = True
                q.append((y, x))
    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not sky[ny, nx] and cand[ny, nx]:
                sky[ny, nx] = True
                q.append((ny, nx))
    alpha = Image.fromarray(np.where(sky, 0, 255).astype(np.uint8))
    # 가장자리 부드럽게 (하늘 쪽으로 1px 줄이고 살짝 흐림)
    alpha = alpha.filter(ImageFilter.MinFilter(3)).filter(ImageFilter.GaussianBlur(0.8))
    rgba = im.copy()
    rgba.putalpha(alpha)
    return rgba


def save(img, name, width):
    h = round(img.height * width / img.width)
    img = img.resize((width, h), Image.LANCZOS)
    path = os.path.join(OUT, name)
    if img.mode == "RGBA":
        img.save(path)
    else:
        img.save(path, quality=88)
    return img.size


meta = {}

# ── 동산도서관 (정면 사진, 원근 거의 없음) ──
lib = load("library_a.jpg")
s = lib.width / 1000  # 미리보기(1000px) → 원본
crop = tuple(round(v * s) for v in (70, 10, 915, 478))
face = lib.crop(crop)
# 앞쪽 난간(미리보기 y≈60) 아래와 건물 가로 범위 안쪽의 파란색(현수막)은 지우지 않는다
cut_y = (60 - 10) * s
face = sky_alpha(face, removable=lambda x, y: (y < cut_y) | (x < 8 * s) | (x > (910 - 70) * s))
meta["library"] = {"face": save(face, "library_face.png", 2048)}
# 옆면: 가운데 창 네 칸 × 네 층 (창 간격 52.6px, 층 간격 62.5px에 맞춰 이음새 없이 반복)
tile = lib.crop(tuple(round(v * s) for v in (455, 92, 665.4, 342)))
meta["library"]["tile"] = save(tile, "library_tile.jpg", 512)

# ── 채플 (아래에서 올려 찍어 양쪽 탑이 안으로 기움 → 세로 바로잡기) ──
ch = load("rose.jpg")
s = ch.width / 1000
src = [(123, 195), (792, 160), (838, 610), (95, 610)]
dst = [(95, 195), (838, 160), (838, 610), (95, 610)]
ch = perspective(ch, [(x * s, y * s) for x, y in src], [(x * s, y * s) for x, y in dst])
face = ch.crop(tuple(round(v * s) for v in (93, 55, 840, 652)))
face = sky_alpha(face, blue=(45, 20))
meta["chapel"] = {"face": save(face, "chapel_face.png", 1536)}
tile = ch.crop(tuple(round(v * s) for v in (128, 330, 245, 520)))
meta["chapel"]["tile"] = save(tile, "chapel_tile.jpg", 256)

# ── 본관 (포르티코·탑: 지붕선 다각형으로 구름까지 걸러냄) ──
mn = load("main_a.jpg")
poly = [
    (0, 2448), (0, 1297), (548, 1297), (551, 1249), (855, 1156), (855, 996), (891, 996), (891, 909),
    (935, 901), (935, 800), (964, 800), (964, 546), (978, 546), (992, 505), (1030, 489), (1030, 409),
    (1060, 372), (1090, 409), (1090, 489), (1130, 505), (1149, 546), (1159, 546), (1159, 800),
    (1203, 800), (1203, 901), (1283, 909), (1283, 996), (1304, 996), (1304, 1066), (1877, 1300),
    (1880, 1341), (2448, 1341), (2448, 2448),
]
# 파란 기와지붕(y > 1240)은 하늘로 잘못 지워지지 않게 보호 — 그 위(탑 난간 사이 등)만 파란색을 지운다
face = sky_alpha(mn, keep_poly=poly, removable=lambda x, y: y < 1240)
face = face.crop((0, 360, 2448, 2135))
meta["main"] = {"face": save(face, "main_face.png", 2048)}
# 날개 벽: 창 한 칸(소나무·석상이 없는 x 441~539)을 지붕부터 1층 창까지 잘라 가로로 반복
wing = mn.crop((441, 1302, 539, 1898))
meta["main"]["wing"] = save(wing, "main_wing.jpg", 128)
# 지붕·처마 없이 두 층만 (위아래로도 이어 붙일 수 있게) — 광장 옆 건물 벽
floors = mn.crop((441, 1446, 539, 1898))
meta["main"]["floors"] = save(floors, "main_floors.jpg", 128)

json.dump(meta, open(os.path.join(OUT, "facades.json"), "w"), indent=1)
print(json.dumps(meta))
