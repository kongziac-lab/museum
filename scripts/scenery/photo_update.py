"""
사용자가 찍은 성서캠퍼스 사진(2026-09-28, reference-media 브랜치 public/img)으로 campus.glb 를 고친다 (Blender).

  - 동산도서관 정면·옆벽 사진을 새 사진으로 (prep_photo_facade.py 결과)
  - 정문 앞 두루마리 표석, 광장 비석·책 모양 비석·계명인 상 바위, 주황 가로등, 벤치 (prop_* 노드)

기존 campus.glb 는 Draco 로 압축돼 있어 Blender 로 바로 못 읽는다 → gltf-transform 으로 풀고 다시 묶는다:

  npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb
  python3 scripts/scenery/photo_update.py -- --src $W/campus_raw.glb --tex $W --out $W/campus_new.glb
  npx @gltf-transform/cli draco $W/campus_new.glb public/scenery/campus.glb

(Blender 4.2: `pip install bpy==4.2.0` 로 파이썬 모듈로 써도 된다)
"""

import math
import os
import sys

import bpy  # noqa: E402  (bpy 를 먼저 불러야 bmesh 가 있다)
import bmesh  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
args = dict(zip(argv[::2], argv[1::2]))
SRC = args["--src"]
TEX = args["--tex"]
OUT = args["--out"]


def log(*a):
    print("[photo_update]", *a, flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SRC)

# ───────────────────────── 도서관 사진 바꾸기 ─────────────────────────


def swap_image(name, path):
    im = bpy.data.images.get(name)
    if im is None:
        raise SystemExit(f"image {name} not found")
    im.name = name + "_old"
    new = bpy.data.images.load(path)
    n = 0
    for m in bpy.data.materials:
        if not m.use_nodes:
            continue
        for node in m.node_tree.nodes:
            if node.type == "TEX_IMAGE" and node.image == im:
                node.image = new
                n += 1
    new.name = name
    log("swapped", name, "→", os.path.basename(path), "in", n, "nodes")


swap_image("library_face", os.path.join(TEX, "library_face_new.png"))
swap_image("library_tile", os.path.join(TEX, "library_tile_new.jpg"))

# ───────────────────────── 공통 도구 ─────────────────────────


def image_material(name, path, rough=0.6, metal=0.0, tile=1.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = bpy.data.images.load(path, check_existing=True)
    if tile != 1.0:
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (tile, tile, 1)
        coord = nt.nodes.new("ShaderNodeTexCoord")
        nt.links.new(coord.outputs["UV"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], tex.inputs["Vector"])
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    return m


def color_material(name, rgb, rough=0.6, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    bsdf = m.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = metal
    return m


def finish(ob, mat, parent, bevel=0.0, segments=2, smooth=False):
    """재질을 입히고, 모서리를 깎고(베벨), 상자 투영 UV 를 만들어 부모 아래에 둔다."""
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    if bevel > 0:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = segments
        mod.limit_method = "ANGLE"
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    # 상자 투영 UV (1 m = 텍스처 한 장)
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for loop in f.loops:
            co = ob.matrix_world @ loop.vert.co
            loop[uv].uv = (co.y, co.z) if ax == 0 else (co.x, co.z) if ax == 1 else (co.x, co.y)
    bm.to_mesh(ob.data)
    bm.free()
    if smooth:
        for p in ob.data.polygons:
            p.use_smooth = True
    ob.parent = parent
    return ob


def cube(name, sx, sy, sz, loc):
    bpy.ops.mesh.primitive_cube_add(size=1, location=loc)
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (sx, sy, sz)
    bpy.ops.object.transform_apply(scale=True)
    return ob


def cylinder_x(name, r, length, loc, verts=40):
    """X 축으로 누운 원기둥"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=(0, math.pi / 2, 0))
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.transform_apply(rotation=True)
    return ob


def cylinder_y(name, r, length, loc, verts=40):
    """Y 축(앞뒤)으로 누운 원기둥"""
    bpy.ops.mesh.primitive_cylinder_add(vertices=verts, radius=r, depth=length, location=loc, rotation=(math.pi / 2, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    bpy.ops.object.transform_apply(rotation=True)
    return ob


def spiral(name, cx, y, cz, r0, r1, turns, thick, mat, parent, sign=1):
    """이오니아 기둥머리 소용돌이: 앞면(y)에 도드라진 나선 줄"""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = thick
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    n = int(turns * 48)
    sp.points.add(n - 1)
    for i in range(n):
        t = i / (n - 1)
        a = sign * t * turns * 2 * math.pi + math.pi / 2
        r = r0 + (r1 - r0) * t
        sp.points[i].co = (cx + r * math.cos(a), y, cz + r * math.sin(a), 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    ob = bpy.context.active_object
    ob.data.materials.clear()
    ob.data.materials.append(mat)
    for p in ob.data.polygons:
        p.use_smooth = True
    ob.parent = parent
    return ob


def empty(name, loc, parent):
    ob = bpy.data.objects.new(name, None)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def root(name):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    return ob


G_BLACK = image_material("granite_black", os.path.join(TEX, "granite_black.jpg"), rough=0.32)
G_WHITE = image_material("granite_white", os.path.join(TEX, "granite_white.jpg"), rough=0.7)

# ───────────────────────── 정문 앞 표석: 책 두 권 + 이오니아 기둥머리 받침 ─────────────────────────
# (IMG_3994·3995) 검은 화강암 책 두 권을 포개 눕히고 등(책등)에 금색 글자 — 위 '계명대학교', 아래 'KEIMYUNG UNIVERSITY'.
# 흰 화강암 이오니아 기둥머리(양끝 소용돌이) 위에 얹혔다. 원점 = 받침 아래 가운데, 정면(책등) = Blender −Y (웹 +Z).


def build_gate_sign():
    R = root("prop_gate_sign")
    # 받침: 아래 받침돌 · 가운데 둥근 몸(에키누스) · 윗판(아바쿠스) · 양끝 소용돌이
    finish(cube("sign_plinth", 3.3, 1.2, 0.14, (0, 0, 0.07)), G_WHITE, R, bevel=0.03)
    finish(cylinder_x("sign_echinus", 0.26, 3.2, (0, 0, 0.3), 48), G_WHITE, R, smooth=True)
    finish(cube("sign_echinus_block", 3.2, 1.1, 0.3, (0, 0, 0.27)), G_WHITE, R, bevel=0.06, segments=3)
    finish(cube("sign_abacus", 4.3, 1.5, 0.1, (0, 0, 0.57)), G_WHITE, R, bevel=0.02)
    for s in (-1, 1):
        x = s * 1.92
        finish(cylinder_y(f"sign_volute_{s}", 0.3, 1.46, (x, 0, 0.3), 56), G_WHITE, R, bevel=0.03, smooth=True)
        for face_y, turn in ((-0.735, s), (0.735, -s)):
            spiral(f"sign_volute_spiral_{s}_{face_y}", x, face_y, 0.3, 0.27, 0.05, 2.3, 0.018, G_WHITE, R, sign=turn)
    # 책 두 권: 등은 살짝 볼록(납작한 타원기둥), 위아래 표지판이 책등·옆으로 조금 나온다
    BULGE = 0.14

    def book(name, L, D, T, z0, dx):
        r = T / 2 - 0.03
        zc = z0 + T / 2
        front = -(D / 2 - BULGE)  # 책등이 시작되는 면
        finish(cube(f"{name}_block", L - 0.08, D - BULGE, T - 0.1, (dx, (front + D / 2) / 2, zc)), G_BLACK, R, bevel=0.01)
        sp = cylinder_x(f"{name}_spine", r, L - 0.08, (dx, front, zc), 48)
        sp.scale = (1, BULGE / r, 1)
        bpy.ops.object.transform_apply(scale=True)
        finish(sp, G_BLACK, R, smooth=True)
        for zz in (z0 + 0.03, z0 + T - 0.03):
            finish(cube(f"{name}_cover", L, D - BULGE + 0.03, 0.06, (dx, (front - 0.03 + D / 2) / 2, zz)), G_BLACK, R, bevel=0.015)
        # 등 앞면 글자 자리 (웹에서 캔버스 글자를 붙인다)
        return (dx, front - BULGE - 0.01, zc)
    lo = book("sign_book_low", 5.3, 1.9, 0.95, 0.62, 0.0)
    hi = book("sign_book_high", 5.0, 1.8, 0.9, 0.62 + 0.95, -0.12)
    empty("sign_text_en", lo, R)
    empty("sign_text_ko", hi, R)
    log("built prop_gate_sign")
    return R


build_gate_sign()

# ───────────────────────── 광장 조형물 (사진 IMG_4001 · 4004 · 4006 · 4014 · 4019 · 4021) ─────────────────────────
# 비석·표석 글씨는 멀리서 새김 글씨로 보이는 무늬(읽을 수 있는 실제 문구가 아님). '계명인 상'·'1996' 만 사진 그대로.


def panel_material(name, file, rough=0.35):
    return image_material(name, os.path.join(TEX, file), rough=rough)


def front_panel(name, w, h, loc, mat, parent):
    """앞면(−Y)에 붙이는 얇은 판 — UV 가 판 전체(0~1)에 맞는다"""
    bpy.ops.mesh.primitive_plane_add(size=1, location=loc, rotation=(math.pi / 2, 0, 0))
    ob = bpy.context.active_object
    ob.name = name
    ob.scale = (w, h, 1)
    bpy.ops.object.transform_apply(rotation=True, scale=True)
    ob.data.materials.append(mat)
    ob.parent = parent
    return ob


def rough_stone(name, sx, sy, sz, loc, mat, parent, seed=1, amount=0.08, subdiv=3, round_shape=True, taper=1.0):
    """다듬지 않은 돌: 상자를 잘게 나누고(둥글게 또는 모서리 그대로) 구름 무늬로 겉을 울퉁불퉁하게 민다.
    나눈 뒤 원래 크기(sx·sy·sz)로 되돌리고, 바닥이 loc 의 z − sz/2 에 닿게 놓는다."""
    ob = cube(name, 1, 1, 1, (0, 0, 0))
    mod = ob.modifiers.new("sub", "SUBSURF")
    mod.levels = subdiv
    mod.subdivision_type = "CATMULL_CLARK" if round_shape else "SIMPLE"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    tex = bpy.data.textures.new(f"{name}_noise", "CLOUDS")
    tex.noise_scale = 0.45
    tex.noise_depth = 2
    disp = ob.modifiers.new("disp", "DISPLACE")
    disp.texture = tex
    disp.texture_coords = "GLOBAL"
    disp.strength = amount
    ob.location = (seed * 7.3, seed * 3.1, 0)  # 돌마다 다른 무늬
    bpy.ops.object.modifier_apply(modifier=disp.name)
    ob.location = (0, 0, 0)
    xs = [v.co.x for v in ob.data.vertices]
    ys = [v.co.y for v in ob.data.vertices]
    zs = [v.co.z for v in ob.data.vertices]
    kx, ky, kz = sx / (max(xs) - min(xs)), sy / (max(ys) - min(ys)), sz / (max(zs) - min(zs))
    cx, cy, cz = (max(xs) + min(xs)) / 2, (max(ys) + min(ys)) / 2, min(zs)
    for v in ob.data.vertices:
        z = (v.co.z - cz) * kz
        t = 1 - (1 - taper) * (z / sz) ** 1.5  # 위로 갈수록 좁게
        v.co = ((v.co.x - cx) * kx * t, (v.co.y - cy) * ky * (0.5 + 0.5 * t), z)
    ob.location = (loc[0], loc[1], loc[2] - sz / 2)
    return finish(ob, mat, parent, smooth=round_shape)


BLACK_A = panel_material("stele_a", "stele_a.jpg")
BLACK_B = panel_material("stele_b", "stele_b.jpg")
BLACK_C = panel_material("stele_c", "stele_c.jpg")
PLAQUE_K = panel_material("plaque_keimyung", "plaque_keimyung.jpg", 0.7)
PLAQUE_B = panel_material("plaque_book", "plaque_book.jpg", 0.7)
PLAQUE_S = panel_material("plaque_shield", "plaque_shield.jpg", 0.7)
COPPER = color_material("lamp_copper", (0.62, 0.27, 0.12), rough=0.38, metal=0.75)
GLOBE = color_material("lamp_globe", (0.95, 0.94, 0.9), rough=0.25)
WOOD = color_material("bench_wood", (0.52, 0.24, 0.1), rough=0.55)
IRON = color_material("bench_iron", (0.92, 0.92, 0.9), rough=0.4, metal=0.4)
ROCK = image_material("rock_weathered", os.path.join(TEX, "granite_rock.jpg"), rough=0.85)


def build_steles():
    """비석 넷 (IMG_4019): 두 단 화강암 단 위, 거친 화강암 틀에 검은 오석 판을 끼웠다. 원점 = 단 아래 가운데."""
    R = root("prop_steles")
    finish(cube("steles_step1", 9.6, 5.0, 0.2, (0, 0, 0.1)), G_WHITE, R, bevel=0.02)
    finish(cube("steles_step2", 8.6, 4.0, 0.2, (0, 0.15, 0.3)), G_WHITE, R, bevel=0.02)
    stones = [  # x, 폭, 두께, 높이, 판 재질, 돌림
        (-3.1, 1.5, 0.55, 2.7, BLACK_A, 0.05),
        (-1.55, 1.15, 0.45, 1.85, BLACK_C, 0.0),
        (0.35, 1.95, 0.6, 3.4, BLACK_B, -0.03),
        (2.45, 1.6, 0.5, 2.45, BLACK_C, -0.12),
    ]
    for i, (x, w, t, h, mat, rot) in enumerate(stones):
        z0 = 0.4
        g = root(f"steles_stone_{i}")
        g.parent = R
        g.location = (x, 0.1, 0)
        g.rotation_euler = (0, 0, rot)
        rough_stone(f"steles_frame_{i}", w, t, h, (0, 0, z0 + h / 2), G_WHITE, g, seed=i + 3, amount=0.05, subdiv=4, round_shape=False)
        front_panel(f"steles_panel_{i}", w * 0.66, h * 0.78, (0, -t / 2 - 0.035, z0 + h * 0.52), mat, g)
        # 받침돌
        finish(cube(f"steles_foot_{i}", w + 0.2, t + 0.2, 0.12, (0, 0, z0 - 0.04)), G_WHITE, g, bevel=0.02)
    log("built prop_steles")


def build_book_stone():
    """펼친 책 모양 비석 (IMG_4021·4022): 흰 화강암, 가운데 새김 판, 두 단 받침. 원점 = 받침 아래 가운데."""
    R = root("prop_book_stone")
    finish(cube("book_base1", 3.7, 1.4, 0.32, (0, 0, 0.16)), G_WHITE, R, bevel=0.03)
    finish(cube("book_base2", 3.3, 1.1, 0.2, (0, 0.05, 0.42)), G_WHITE, R, bevel=0.03)
    for s in (-1, 1):
        pg = cube(f"book_page_{s}", 1.55, 0.42, 1.55, (0, 0, 0))
        pg.location = (s * 0.76, 0.12 - 0.12, 0.52 + 0.78)
        pg.rotation_euler = (0, 0, -s * 0.16)
        bpy.ops.object.transform_apply(location=False, rotation=True)
        finish(pg, G_WHITE, R, bevel=0.05, segments=3)
    # 책 양끝 말린 가장자리
    for s in (-1, 1):
        finish(cylinder_y(f"book_curl_{s}", 0.12, 0.44, (s * 1.52, 0.12, 1.3), 24), G_WHITE, R, smooth=True)
        bpy.context.active_object.scale = (1, 1, 1)
    front_panel("book_plaque", 1.9, 1.05, (0, -0.33, 1.33), PLAQUE_B, R)
    log("built prop_book_stone")


def build_shield_stone():
    """방패 모양 시비 (IMG_4004): 흰 화강암 방패 + 받침. 원점 = 받침 아래 가운데."""
    R = root("prop_shield_stone")
    finish(cube("shield_base", 1.7, 1.0, 0.5, (0, 0, 0.25)), G_WHITE, R, bevel=0.04)
    # 방패 윤곽: 옆은 곧게 내려오다 아래 1/3 에서 둥글게 모여 뾰족, 위는 살짝 부푼 아치
    W, H = 1.35, 1.95
    low = H * 0.36  # 뾰족해지기 시작하는 높이
    pts = []
    for i in range(21):  # 윗변 왼→오
        t = i / 20
        pts.append((-W / 2 + W * t, H + 0.09 * math.sin(math.pi * t)))
    pts.append((W / 2, low))  # 오른쪽 옆변
    for i in range(1, 21):  # 오른쪽 → 아래 꼭짓점 (사분원)
        a = i / 20 * math.pi / 2
        pts.append((W / 2 * math.cos(a), low - low * math.sin(a)))
    for i in range(1, 20):  # 꼭짓점 → 왼쪽
        a = math.pi / 2 - i / 20 * math.pi / 2
        pts.append((-W / 2 * math.cos(a), low - low * math.sin(a)))
    pts.append((-W / 2, low))
    bm = bmesh.new()
    verts = [bm.verts.new((x, 0, z + 0.5)) for x, z in pts]
    face = bm.faces.new(verts)
    ext = bmesh.ops.extrude_face_region(bm, geom=[face])
    for v in [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]:
        v.co.y += 0.34
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new("shield")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("shield_body", me)
    bpy.context.collection.objects.link(ob)
    ob.location = (0, -0.17, 0)
    bpy.context.view_layer.objects.active = ob
    finish(ob, G_WHITE, R, bevel=0.03)
    front_panel("shield_plaque", 1.0, 1.35, (0, -0.19, 0.5 + 1.2), PLAQUE_S, R)
    log("built prop_shield_stone")


def build_keimyung_rock():
    """계명인 상 (IMG_4001): 넓적한 바위 위에 구멍 뚫린 선돌, 앞에 새김 판. 원점 = 가운데 땅."""
    R = root("prop_keimyung_rock")
    rough_stone("krock_base", 3.2, 1.9, 0.5, (0, 0.2, 0.25), ROCK, R, seed=11, amount=0.3, subdiv=4, round_shape=False)
    stone = rough_stone("krock_stand", 1.3, 0.8, 2.3, (0.1, 0.25, 0.42 + 1.15), ROCK, R, seed=17, amount=0.35, subdiv=4, round_shape=False, taper=0.62)
    # 구멍: 앞뒤로 뚫는다
    hole = cylinder_y("krock_hole", 0.14, 2.0, (0.2, 0.25, 2.05), 24)
    b = stone.modifiers.new("hole", "BOOLEAN")
    b.operation = "DIFFERENCE"
    b.object = hole
    bpy.context.view_layer.objects.active = stone
    bpy.ops.object.modifier_apply(modifier=b.name)
    bpy.data.objects.remove(hole)
    # 앞 새김 판 (비스듬히 누운 판석)
    plq = root("krock_plaque")
    plq.parent = R
    plq.location = (0.4, -2.0, 0.0)
    plq.rotation_euler = (0, 0, 0)
    finish(cube("krock_plaque_slab", 1.3, 1.0, 0.18, (0, 0, 0.09)), G_WHITE, plq, bevel=0.02)
    pn = front_panel("krock_plaque_face", 1.18, 0.88, (0, 0, 0.185), PLAQUE_K, plq)
    pn.rotation_euler = (-math.pi / 2, 0, 0)  # 윗면에 눕힌다 (글씨가 남쪽에서 읽히게)
    log("built prop_keimyung_rock")


def build_lamp():
    """광장 가로등 (IMG_4014·4018): 구리빛 기둥, 소용돌이 팔, 둥근 등. 원점 = 받침 아래, 팔은 −Y 쪽."""
    R = root("prop_lamp")
    bpy.ops.mesh.primitive_cylinder_add(vertices=8, radius=0.2, depth=0.55, location=(0, 0, 0.275))
    finish(bpy.context.active_object, COPPER, R, bevel=0.02)
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.085, radius2=0.055, depth=3.9, location=(0, 0, 0.55 + 1.95))
    finish(bpy.context.active_object, COPPER, R, smooth=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=16, ring_count=8, radius=0.09, location=(0, 0, 4.5))
    finish(bpy.context.active_object, COPPER, R, smooth=True)
    for zz in (1.2, 3.6):
        bpy.ops.mesh.primitive_torus_add(major_radius=0.085, minor_radius=0.025, location=(0, 0, zz))
        finish(bpy.context.active_object, COPPER, R, smooth=True)
    # 소용돌이 팔: 기둥 위에서 앞(−Y)으로 뻗어 나온 곡선
    cu = bpy.data.curves.new("lamp_arm", "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 0.022
    sp = cu.splines.new("POLY")
    arm = []
    for i in range(40):
        t = i / 39
        arm.append((0, -0.75 * t, 4.25 + 0.18 * math.sin(math.pi * t) - 0.05 * t))
    for i in range(1, 30):  # 끝에서 아래로 말리는 작은 소용돌이
        a = i / 29 * 1.6 * math.pi
        r = 0.12 * (1 - i / 40)
        arm.append((0, -0.75 - r * math.sin(a), 4.2 - 0.12 + r * math.cos(a)))
    sp.points.add(len(arm) - 1)
    for p, c in zip(sp.points, arm):
        p.co = (*c, 1)
    ob = bpy.data.objects.new("lamp_arm", cu)
    bpy.context.collection.objects.link(ob)
    bpy.context.view_layer.objects.active = ob
    ob.select_set(True)
    bpy.ops.object.convert(target="MESH")
    finish(bpy.context.active_object, COPPER, R, smooth=True)
    # 등: 작은 갓 + 둥근 유리
    bpy.ops.mesh.primitive_cone_add(vertices=16, radius1=0.12, radius2=0.03, depth=0.1, location=(0, -0.6, 4.2))
    finish(bpy.context.active_object, COPPER, R, smooth=True)
    bpy.ops.mesh.primitive_uv_sphere_add(segments=20, ring_count=12, radius=0.19, location=(0, -0.6, 3.98))
    finish(bpy.context.active_object, GLOBE, R, smooth=True)
    log("built prop_lamp")


def build_bench():
    """광장 벤치 (IMG_4006·4015): 흰 쇠다리, 갈색 나무 등받이·앉음판. 원점 = 가운데 땅, 앉는 쪽 = −Y."""
    R = root("prop_bench")
    L = 1.8
    for i in range(4):  # 앉음판 널
        finish(cube(f"bench_seat_{i}", L, 0.1, 0.04, (0, -0.2 + i * 0.12, 0.45)), WOOD, R, bevel=0.008)
    for i in range(3):  # 등받이 널 (살짝 뒤로)
        ob = cube(f"bench_back_{i}", L, 0.03, 0.1, (0, 0.24 + i * 0.03, 0.62 + i * 0.13))
        ob.rotation_euler = (math.radians(-12), 0, 0)
        bpy.ops.object.transform_apply(rotation=True)
        finish(ob, WOOD, R, bevel=0.008)
    for s in (-1, 1):  # 옆다리 (앞다리 · 뒷다리 · 팔걸이)
        x = s * (L / 2 - 0.1)
        finish(cube(f"bench_leg_f_{s}", 0.05, 0.05, 0.45, (x, -0.22, 0.225)), IRON, R)
        finish(cube(f"bench_leg_b_{s}", 0.05, 0.05, 0.95, (x, 0.28, 0.475)), IRON, R)
        finish(cube(f"bench_rail_{s}", 0.05, 0.55, 0.04, (x, 0.03, 0.42)), IRON, R)
        finish(cube(f"bench_arm_{s}", 0.06, 0.5, 0.04, (x, 0.0, 0.66)), IRON, R)
        finish(cube(f"bench_armpost_{s}", 0.04, 0.04, 0.22, (x, -0.22, 0.55)), IRON, R)
    log("built prop_bench")


build_steles()
build_book_stone()
build_shield_stone()
build_keimyung_rock()
build_lamp()
build_bench()


def join_by_material(root_name):
    """조형물 하나의 메시를 재질별로 하나씩 합친다 (웹에서 그리는 횟수를 줄인다). 빈 노드(글자 자리)는 남긴다."""
    root_ob = bpy.data.objects[root_name]
    meshes = [o for o in root_ob.children_recursive if o.type == "MESH"]
    groups = {}
    for o in meshes:
        groups.setdefault(o.data.materials[0].name if o.data.materials else "", []).append(o)
    bpy.ops.object.select_all(action="DESELECT")
    for mat, obs in groups.items():
        for o in obs:  # 부모를 떼고 월드 변환을 굳힌 뒤 합친다
            mw = o.matrix_world.copy()
            o.parent = None
            o.matrix_world = mw
        bpy.ops.object.select_all(action="DESELECT")
        for o in obs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = obs[0]
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
        if len(obs) > 1:
            bpy.ops.object.join()
        j = bpy.context.active_object
        j.name = f"{root_name}_{mat}"
        j.parent = root_ob
        j.matrix_parent_inverse = root_ob.matrix_world.inverted()
    # 비게 된 중간 빈 노드 정리 (글자 자리 sign_text_* 는 남긴다)
    for o in list(root_ob.children_recursive):
        if o.type == "EMPTY" and not o.name.startswith("sign_text") and not o.children:
            bpy.data.objects.remove(o)
    log("joined", root_name, "→", len(groups), "meshes")


if "--preview" not in args:
    for n in ("prop_gate_sign", "prop_steles", "prop_book_stone", "prop_shield_stone", "prop_keimyung_rock", "prop_lamp", "prop_bench"):
        join_by_material(n)

# ───────────────────────── 미리보기 (선택: --preview 노드이름 --shot 파일) ─────────────────────────


def preview(node, path, cam_loc, target, lens=35):
    keep = bpy.data.objects[node]
    keepset = {keep, *keep.children_recursive}
    for ob in bpy.data.objects:
        ob.hide_render = ob not in keepset
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 24
    sc.cycles.device = "CPU"
    sc.render.resolution_x, sc.render.resolution_y = 960, 600
    sc.render.filepath = path
    world = bpy.data.worlds.new("w")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.8
    sc.world = world
    for ob in [o for o in bpy.data.objects if o.name in ("sun", "cam")]:
        bpy.data.objects.remove(ob)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = lens
    cam.location = cam_loc
    bpy.context.collection.objects.link(cam)
    d = (target[0] - cam_loc[0], target[1] - cam_loc[1], target[2] - cam_loc[2])
    import mathutils

    cam.rotation_euler = mathutils.Vector(d).to_track_quat("-Z", "Y").to_euler()
    sc.camera = cam
    bpy.ops.render.render(write_still=True)
    log("preview", path)


if "--preview" in args:
    # --preview "노드|x,y,z,tx,ty,tz;노드|..." --shot 폴더
    for job in args["--preview"].split(";"):
        node, cam = job.split("|")
        x, y, z, tx, ty, tz = (float(v) for v in cam.split(","))
        preview(node, os.path.join(args["--shot"], f"pv_{node}.png"), (x, y, z), (tx, ty, tz))
    raise SystemExit(0)

# ───────────────────────── 내보내기 ─────────────────────────

bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    export_image_format="AUTO",
    export_apply=True,
    export_yup=True,
    export_extras=True,
)
log("wrote", OUT)
