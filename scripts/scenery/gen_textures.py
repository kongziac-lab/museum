"""
계명대 분수 광장 바닥·화단·산 재질을 그려서 만든다 (이음새 없이 반복되는 텍스처).

  python3 scripts/scenery/gen_textures.py public/scenery/tex

색은 광장에서 찍은 사진에서 뽑았다 (햇빛 받은 포장 벽돌 ≈ sRGB 217,158,125 → 바탕색은 조금 어둡게).
만드는 것 (이름_diffuse / _nor_gl / _arm, ARM = AO·거칠기·금속)
- herringbone : 90° 헤링본 포장 벽돌 (벽돌 20×10 cm, 한 장 = 1.6 m)
- wallbrick   : 화단 벽 붉은 벽돌 (길이쌓기, 한 장 = 1.2 × 0.6 m)
- granite     : 화단 뚜껑·경계석 밝은 화강암 (한 장 = 0.8 m)
- asphalt     : 대로 아스팔트 (한 장 = 3 m)
- hedge       : 회양목·향나무 잎 (한 장 = 0.8 m)
- canopy      : 먼 산 숲 지붕 (한 장 = 60 m)
"""

import math
import os
import sys

import numpy as np
from PIL import Image, ImageFilter

OUT = sys.argv[1] if len(sys.argv) > 1 else "tex"
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1203)


def srgb(rgb):
    return np.array(rgb, np.float32) / 255.0


def normal_from_height(h, strength):
    gy, gx = np.gradient(np.pad(h, 1, mode="wrap"))[:2] if False else np.gradient(h)
    # 반복 이음새에서도 매끄럽게: 가장자리는 반대편과 이어서 미분
    gx = (np.roll(h, -1, 1) - np.roll(h, 1, 1)) / 2
    gy = (np.roll(h, -1, 0) - np.roll(h, 1, 0)) / 2
    nx, ny, nz = -gx * strength, gy * strength, np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    return np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5


def value_noise(size, cells, seed, octaves=4):
    """이음새 없는 값 노이즈 (0~1)."""
    r = np.random.default_rng(seed)
    out = np.zeros((size, size), np.float32)
    amp, tot = 1.0, 0.0
    for o in range(octaves):
        c = cells * (2**o)
        g = r.random((c, c)).astype(np.float32)
        img = Image.fromarray((g * 255).astype(np.uint8)).resize((size, size), Image.BICUBIC)
        # BICUBIC은 가장자리가 반복되지 않으므로 타일 3×3에서 가운데를 잘라 쓴다
        big = Image.fromarray((np.tile(g, (3, 3)) * 255).astype(np.uint8)).resize((size * 3, size * 3), Image.BICUBIC)
        a = np.asarray(big, np.float32)[size : 2 * size, size : 2 * size] / 255
        out += a * amp
        tot += amp
        amp *= 0.5
    return out / tot


def save(name, color, nrm, ao, rough, q=88):
    Image.fromarray((np.clip(color, 0, 1) ** (1 / 2.2) * 255).astype(np.uint8)).save(f"{OUT}/{name}_diffuse.jpg", quality=q)
    Image.fromarray((nrm * 255).astype(np.uint8)).save(f"{OUT}/{name}_nor_gl.jpg", quality=92)
    arm = np.stack([ao, rough, np.zeros_like(ao)], -1)
    Image.fromarray((np.clip(arm, 0, 1) * 255).astype(np.uint8)).save(f"{OUT}/{name}_arm.jpg", quality=90)
    print("✓", name)


def lin(rgb):
    return srgb(rgb) ** 2.2


# ───────────── 헤링본 포장 ─────────────
def herringbone(size=1024, units=16):
    """벽돌 = 2×1 칸. (x−y) mod 4 == 0 에서 가로 벽돌, == 3 에서 세로 벽돌이 시작하면 빈틈없이 90° 헤링본."""
    px = size / units
    brick_id = -np.ones((units, units), np.int32)
    bricks = []
    for y in range(units):
        for x in range(units):
            d = (x - y) % 4
            if d == 0:
                cells = [(x, y), ((x + 1) % units, y)]
            elif d == 3:
                cells = [(x, y), (x, (y + 1) % units)]
            else:
                continue
            bid = len(bricks)
            bricks.append(cells)
            for cx, cy in cells:
                brick_id[cy, cx] = bid
    assert (brick_id >= 0).all()
    base = lin((150, 88, 66))
    tints = []
    for _ in bricks:
        t = base * (0.82 + rng.random() * 0.32)
        t = t * np.array([1 + (rng.random() - 0.5) * 0.12, 1 + (rng.random() - 0.5) * 0.1, 1 + (rng.random() - 0.5) * 0.14])
        tints.append(t)
    tints = np.array(tints, np.float32)
    yy, xx = np.mgrid[0:size, 0:size]
    cx = (xx / px).astype(int) % units
    cy = (yy / px).astype(int) % units
    bid = brick_id[cy, cx]
    # 벽돌 경계: 이웃 픽셀과 벽돌 번호가 다르면 줄눈
    edge = np.zeros((size, size), np.float32)
    for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
        edge = np.maximum(edge, (np.roll(bid, (dy, dx), (0, 1)) != bid).astype(np.float32))
    dist = np.asarray(Image.fromarray((edge * 255).astype(np.uint8)).filter(ImageFilter.MaxFilter(5)), np.float32) / 255
    grain = value_noise(size, 64, 5, 3)
    color = tints[bid] * (0.9 + 0.2 * grain[..., None])
    mortar = lin((150, 140, 128))
    m = np.clip(edge * 0.9, 0, 1)[..., None]
    color = color * (1 - m) + mortar * m
    height = 1 - 0.6 * dist - 0.4 * edge + grain * 0.08
    save("herringbone", color, normal_from_height(height, 3.0), 1 - 0.35 * dist, 0.82 + 0.1 * dist)


# ───────────── 화단 벽 벽돌 ─────────────
def wallbrick(w=1024, h=512):
    rows, per = 10, 6  # 0.6 m 높이에 10단, 1.2 m 폭에 벽돌 6장
    rh, bw = h / rows, w / per
    yy, xx = np.mgrid[0:h, 0:w]
    row = (yy / rh).astype(int)
    off = (row % 2) * bw / 2
    col = (((xx + off) / bw).astype(int)) % per
    bid = row * per + col
    r = np.random.default_rng(9)
    tints = np.array([lin((118, 46, 34)) * (0.8 + r.random() * 0.4) for _ in range(rows * per)], np.float32)
    fy = (yy % rh) / rh
    fx = ((xx + off) % bw) / bw
    joint = ((fy < 0.12) | (fx < 0.035)).astype(np.float32)
    grain = value_noise(w, 32, 11, 3)[:h, :w] if w == h else np.asarray(Image.fromarray((value_noise(w, 32, 11, 3) * 255).astype(np.uint8)).resize((w, h)), np.float32) / 255
    color = tints[bid] * (0.88 + 0.24 * grain[..., None])
    mortar = lin((178, 172, 162))
    color = color * (1 - joint[..., None]) + mortar * joint[..., None]
    height = 1 - joint * 0.8 + grain * 0.05
    save("wallbrick", color, normal_from_height(height, 2.0), 1 - 0.3 * joint, 0.85 + 0.1 * joint)


# ───────────── 밝은 화강암 ─────────────
def granite(size=512):
    n = value_noise(size, 8, 21, 4)
    base = lin((178, 176, 172)) * (0.92 + 0.12 * n[..., None])
    r = np.random.default_rng(3)
    speck = r.random((size, size))
    dark = (speck < 0.09).astype(np.float32)
    white = (speck > 0.94).astype(np.float32)
    color = base * (1 - dark[..., None] * 0.7) + white[..., None] * 0.08
    color = np.asarray(Image.fromarray((np.clip(color, 0, 1) * 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(0.6)), np.float32) / 255
    height = n * 0.3 + dark * 0.05
    save("granite", color, normal_from_height(height, 1.2), np.ones((size, size)) * 0.98, 0.55 + 0.1 * n)


# ───────────── 아스팔트 ─────────────
def asphalt(size=1024):
    n = value_noise(size, 16, 31, 5)
    r = np.random.default_rng(4)
    speck = r.random((size, size))
    color = lin((72, 72, 74)) * (0.85 + 0.25 * n[..., None])
    color = color * (1 + (speck > 0.97)[..., None] * 0.5) * (1 - (speck < 0.03)[..., None] * 0.4)
    height = n * 0.5 + (speck > 0.97) * 0.2
    save("asphalt", color, normal_from_height(height, 1.5), np.ones((size, size)), 0.9 - 0.1 * n)


# ───────────── 잎 (생울타리·다듬은 나무) ─────────────
def hedge(size=512, count=5200):
    h = np.zeros((size, size), np.float32)
    color = np.tile(lin((34, 52, 22)), (size, size, 1)).astype(np.float32)
    r = np.random.default_rng(7)
    for _ in range(count):
        cx, cy = r.random(2) * size
        rad = 4 + r.random() * 6
        ang = r.random() * math.pi
        tone = lin((50, 86, 34)) * (0.6 + r.random() * 0.8)
        z = r.random()
        rr = int(rad) + 2
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                x0, y0 = cx + ox, cy + oy
                xa, xb = max(int(x0) - rr, 0), min(int(x0) + rr, size)
                ya, yb = max(int(y0) - rr, 0), min(int(y0) + rr, size)
                if xa >= xb or ya >= yb:
                    continue
                yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
                dx, dy = xx - x0, yy - y0
                u = (dx * math.cos(ang) + dy * math.sin(ang)) / rad
                v = (-dx * math.sin(ang) + dy * math.cos(ang)) / (rad * 0.5)
                d = u * u + v * v
                leaf = d < 1
                zz = z + (1 - d) * 0.15
                hw = h[ya:yb, xa:xb]
                m = leaf & (zz > hw)
                hw[m] = zz[m]
                cw = color[ya:yb, xa:xb]
                cw[m] = tone * (0.75 + 0.35 * zz[m])[:, None]
    ao = 0.45 + 0.55 * h
    save("hedge", color * ao[..., None], normal_from_height(h, 5.0), ao, np.full_like(h, 0.8))


# ───────────── 먼 산 숲 지붕 ─────────────
def canopy(size=1024, count=2600):
    """위에서 본 나무 꼭대기 덩어리 (빛은 남동쪽 위에서) — 멀리서 산을 덮으면 숲처럼 보인다."""
    h = np.zeros((size, size), np.float32)
    color = np.tile(lin((20, 34, 16)), (size, size, 1)).astype(np.float32)
    r = np.random.default_rng(17)
    palette = [lin(c) for c in [(46, 70, 34), (38, 62, 30), (58, 82, 40), (30, 50, 26), (70, 88, 44), (52, 60, 34)]]
    L = np.array([0.45, -0.45, 0.77])
    for _ in range(count):
        cx, cy = r.random(2) * size
        rad = 7 + r.random() * 12
        tone = palette[r.integers(len(palette))] * (0.8 + r.random() * 0.4)
        rr = int(rad) + 2
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                x0, y0 = cx + ox, cy + oy
                xa, xb = max(int(x0) - rr, 0), min(int(x0) + rr, size)
                ya, yb = max(int(y0) - rr, 0), min(int(y0) + rr, size)
                if xa >= xb or ya >= yb:
                    continue
                yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
                dx, dy = (xx - x0) / rad, (yy - y0) / rad
                d2 = dx * dx + dy * dy
                inside = d2 < 1
                dz = np.sqrt(np.clip(1 - d2, 0, 1))
                shade = np.clip(dx * L[0] + dy * L[1] + dz * L[2], 0.15, 1)
                hw = h[ya:yb, xa:xb]
                zz = dz * rad / 20
                m = inside & (zz > hw)
                hw[m] = zz[m]
                cw = color[ya:yb, xa:xb]
                cw[m] = tone * (0.55 + 0.6 * shade[m])[:, None]
    save("canopy", color, normal_from_height(h, 2.0), 0.6 + 0.4 * np.clip(h * 2, 0, 1), np.full_like(h, 0.95), q=86)


if __name__ == "__main__":
    herringbone()
    wallbrick()
    granite()
    asphalt()
    hedge()
    canopy()
