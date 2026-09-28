"""
2026-09-28 에 찍은 성서캠퍼스 사진(reference-media 브랜치 public/img, HEIC)으로 photo_update.py 가 쓰는 텍스처를 만든다.

  python3 scripts/scenery/prep_photo_textures.py <사진 폴더> <작업 폴더> <NotoSerifKR-700.ttf>

필요: pip install pillow pillow-heif numpy opencv-python-headless
만드는 것 (작업 폴더):
  library_face_new.png  동산도서관 정면 (IMG_4020 을 기존 텍스처와 같은 틀로 원근 보정, 사람 지우기, 하늘 투명)
  library_tile_new.jpg  옆벽 창 무늬 (위에서 4×4 창을 잘라 낸 것)
  granite_black.jpg · granite_white.jpg · granite_rock.jpg  비석·표석 돌 무늬
  stele_a/b/c.jpg · plaque_*.jpg  새김 글씨 무늬 (읽을 수 있는 실제 문구가 아님. '계명인 상'·'1996' 만 사진 그대로)

한글 글꼴: npm 의 @fontsource/noto-serif-kr 에서 korean-700 woff2 를 fontTools 로 ttf 로 풀어 쓴다.
"""

import glob
import os
import random
import sys
from collections import deque

import cv2
import numpy as np
import pillow_heif
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

pillow_heif.register_heif_opener()
SRC, OUT, FONT = sys.argv[1], sys.argv[2], sys.argv[3]
os.makedirs(OUT, exist_ok=True)


def photo(name):
    f = glob.glob(os.path.join(SRC, name + ".*"))[0]
    return ImageOps.exif_transpose(Image.open(f)).convert("RGB")


# ───────────────────────── 도서관 정면 ─────────────────────────
# 기존 library_face(2048×1135, 표시 2000 폭 기준 ×1.024)의 가운데 몸체 네 모서리에
# IMG_4020(2000 폭으로 줄인 좌표)의 같은 모서리를 맞춘다.
im = photo("IMG_4020")
k = im.size[0] / 2000
src = np.array([(352, 405), (1595, 435), (1719, 1250), (256, 1255)], float) * k
dst = np.array([(210, 108), (1874, 115), (1874, 1135), (210, 1135)], float)
A, B = [], []
for (x, y), (u, v) in zip(dst, src):
    A += [[x, y, 1, 0, 0, 0, -u * x, -u * y], [0, 0, 0, x, y, 1, -v * x, -v * y]]
    B += [u, v]
coef = np.linalg.solve(np.array(A), np.array(B))
rect = cv2.cvtColor(np.array(im.transform((2048, 1135), Image.PERSPECTIVE, tuple(coef), Image.BICUBIC)), cv2.COLOR_RGB2BGR)
H, W = rect.shape[:2]
s = 1.024
# 앞을 지나가던 사람 지우기 (표시 좌표 사각형)
mask = np.zeros((H, W), np.uint8)
for x0, y0, x1, y1 in [(1030, 990, 1118, 1108), (1160, 1000, 1258, 1108), (985, 1028, 1030, 1105), (795, 995, 835, 1100), (570, 1028, 610, 1105), (1305, 1005, 1345, 1100), (1485, 1035, 1525, 1100), (1175, 1020, 1200, 1060)]:
    cv2.rectangle(mask, (int(x0 * s), int(y0 * s)), (int(x1 * s), int(y1 * s)), 255, -1)
face = cv2.inpaint(rect, mask, 9, cv2.INPAINT_TELEA)
# 하늘: 지붕선 위에서 하늘처럼 밝고 무채색인 곳만 투명하게
b, g, r = [face[:, :, i].astype(int) for i in range(3)]
mx, mn = np.maximum(np.maximum(r, g), b), np.minimum(np.minimum(r, g), b)
sky = (mx > 170) & ((mx - mn) < 50)
alpha = np.full((H, W), 255, np.uint8)
ys, xs = np.arange(H)[:, None], np.arange(W)[None, :]
for x0, x1, y in [(0, 15, 1108), (15, 300, 40), (300, 1715, 10), (1715, 1985, 55), (1985, 2000, 1108)]:
    region = (xs >= x0 * s) & (xs < x1 * s) & (ys < y * s)
    if y == 1108:
        region &= sky
    alpha[region] = 0
alpha[(alpha == 0) & (~sky) & (ys > 5)] = 255
rgba = cv2.cvtColor(face, cv2.COLOR_BGR2BGRA)
rgba[:, :, 3] = cv2.morphologyEx(alpha, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
cv2.imwrite(os.path.join(OUT, "library_face_new.png"), rgba)
# 옆벽: 창 4×4
crop = face[int(215 * s) : int((215 + 580) * s), int(395 * s) : int((395 + 505.2) * s)]
cv2.imwrite(os.path.join(OUT, "library_tile_new.jpg"), cv2.resize(crop, (512, 609), interpolation=cv2.INTER_AREA), [cv2.IMWRITE_JPEG_QUALITY, 90])

# ───────────────────────── 돌 무늬 ─────────────────────────
rng = np.random.default_rng(3)


def granite(base, spots, n, size=512, blur=0.6):
    img = np.zeros((size, size, 3), float)
    img[:] = base
    for col, frac, rad in spots:
        cnt = int(n * frac)
        for x, y, rr in zip(rng.integers(0, size, cnt), rng.integers(0, size, cnt), rng.uniform(0.6, rad, cnt)):
            ri = int(np.ceil(rr))
            for dx in range(-ri, ri + 1):
                for dy in range(-ri, ri + 1):
                    if dx * dx + dy * dy <= rr * rr:
                        img[(y + dy) % size, (x + dx) % size] = col
    img = np.clip(img + rng.normal(0, 6, (size, size, 1)), 0, 255).astype(np.uint8)
    return Image.fromarray(img).filter(ImageFilter.GaussianBlur(blur))


granite((38, 38, 40), [((70, 70, 74), 0.5, 1.6), ((18, 18, 20), 0.35, 1.8), ((110, 110, 112), 0.15, 1.0)], 9000).save(os.path.join(OUT, "granite_black.jpg"), quality=90)
granite((205, 203, 198), [((150, 148, 146), 0.45, 1.8), ((235, 233, 228), 0.35, 2.0), ((95, 95, 98), 0.2, 1.2)], 9000).save(os.path.join(OUT, "granite_white.jpg"), quality=90)
S = 512
base = np.zeros((S, S, 3))
base[:] = (112, 110, 104)
low = rng.normal(0, 1, (16, 16))
low = np.array(Image.fromarray(((low - low.min()) / np.ptp(low) * 255).astype(np.uint8)).resize((S, S), Image.BICUBIC)) / 255.0
base = base * (0.75 + 0.45 * low[..., None])
spots = rng.random((S, S))
base[spots < 0.08] *= 0.55
base[spots > 0.95] *= 1.35
Image.fromarray(np.clip(base + rng.normal(0, 7, (S, S, 1)), 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.7)).save(os.path.join(OUT, "granite_rock.jpg"), quality=90)

# ───────────────────────── 새김 글씨 무늬 ─────────────────────────
random.seed(9)
SYL = "가나다라마바사아자차카타파하고노도로모보소오조초토포호구누두루무부수우주추투푸후기니디리미비시이지치키티피히"
F = lambda size: ImageFont.truetype(FONT, size)  # noqa: E731


def rnd(n):
    return "".join(random.choice(SYL) for _ in range(n))


for name, cols in (("stele_a.jpg", 9), ("stele_b.jpg", 12), ("stele_c.jpg", 10)):
    Wp, Hp = 512, 1024
    img = Image.new("RGB", (Wp, Hp), (20, 20, 22))
    d = ImageDraw.Draw(img)
    for _ in range(4000):
        c = random.randint(26, 44)
        d.point((random.randrange(Wp), random.randrange(Hp)), (c, c, c + 2))
    f = F(int(Wp / cols * 0.6))
    x = Wp - Wp / cols * 0.95
    for _ in range(cols - 1):
        y = 50
        for _ in range(int((Hp - 100) / (f.size * 1.1))):
            d.text((x, y), random.choice(SYL), font=f, fill=(105, 103, 98))
            y += f.size * 1.1
        x -= Wp / cols
    img.filter(ImageFilter.GaussianBlur(1.3)).save(os.path.join(OUT, name), quality=88)


def carved(name, Wp, Hp, title, lines, sub=None, border=False):
    img = Image.new("RGB", (Wp, Hp), (196, 194, 188))
    d = ImageDraw.Draw(img)
    for _ in range(Wp * Hp // 40):
        c = random.randint(150, 230)
        d.point((random.randrange(Wp), random.randrange(Hp)), (c, c - 2, c - 6))
    ink = (118, 116, 112)
    if border:
        for kk in range(3):
            d.rounded_rectangle((18 + kk * 9, 18 + kk * 9, Wp - 18 - kk * 9, Hp - 18 - kk * 9), radius=40, outline=ink, width=3)
    y = int(Hp * 0.09)
    if title:
        ft = F(int(Wp * 0.075))
        d.text(((Wp - d.textlength(title, font=ft)) / 2, y), title, font=ft, fill=(80, 78, 74))
        y += int(ft.size * 1.9)
    f = F(int(Wp * 0.034))
    for _ in range(lines):
        d.text((int(Wp * 0.12), y), rnd(random.randint(14, 22)), font=f, fill=ink)
        y += int(f.size * 1.55)
    if sub:
        fs = F(int(Wp * 0.04))
        d.text(((Wp - d.textlength(sub, font=fs)) / 2, Hp - int(Hp * 0.12)), sub, font=fs, fill=(80, 78, 74))
    img.filter(ImageFilter.GaussianBlur(0.9)).save(os.path.join(OUT, name), quality=88)


carved("plaque_keimyung.jpg", 1024, 768, "계명인 상", 8, sub="1996")
carved("plaque_book.jpg", 1024, 640, None, 9)
carved("plaque_shield.jpg", 640, 900, None, 14, border=True)
print("wrote textures to", OUT)
