"""
Blender로 전시 배경 모델을 만든다 → public/scenery/*.glb

  node scripts/scenery/gen-trees.mjs <작업폴더>/trees
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
      --python scripts/scenery/build_scenery.py -- --work <작업폴더> --out public/scenery

<작업폴더>에는 trees/*.obj(gen-trees.mjs 결과)와 Poly Haven 2k 텍스처가 있어야 한다
(granite_tile_{Diffuse,nor_gl,arm}_2k.jpg). 없으면 public/scenery/tex의 1k 텍스처를 쓴다.

만드는 것
- fountain.glb : 계명대학교 창립 120주년 기념 분수를 본뜬 3단 화강암 분수 + 흰 자갈 띠.
                 앰비언트 오클루전을 Cycles로 구워 두 번째 UV의 occlusion 텍스처로 넣는다.
                 물 표면(water_*)과 물줄기 위치(jet_*)는 빈 노드로 넣고, 움직이는 물은 웹에서 그린다.
- trees.glb    : ez-tree 나무 8종 (나무껍질 + 잎). 잎 법선은 수관 바깥쪽을 향하게 바꿔 덩어리감을 살린다.
"""

import math
import os
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
opts = dict(zip(argv[::2], argv[1::2]))
WORK = os.path.abspath(opts.get("--work", "scenery-src"))
OUT = os.path.abspath(opts.get("--out", "public/scenery"))
REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
EZ = os.path.join(REPO, "node_modules", "@dgreenheck", "ez-tree", "src", "lib", "assets")
TMP = os.path.join(WORK, "blender_tmp")
os.makedirs(TMP, exist_ok=True)
os.makedirs(OUT, exist_ok=True)


def log(*a):
    print("[scenery]", *a, flush=True)


# ───────────────────────── 공통 ─────────────────────────


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    s = bpy.context.scene
    s.unit_settings.system = "METRIC"
    s.render.engine = "CYCLES"
    s.cycles.device = "CPU"
    try:
        prefs = bpy.context.preferences.addons["cycles"].preferences
        prefs.compute_device_type = "METAL"
        prefs.get_devices()
        for d in prefs.devices:
            d.use = True
        s.cycles.device = "GPU"
    except Exception as e:  # GPU가 없으면 CPU로
        log("GPU 사용 불가, CPU로 굽습니다:", e)
    world = bpy.data.worlds.new("World")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.8, 0.85, 0.9, 1)
    s.world = world


def texpath(name_2k, name_1k):
    p = os.path.join(WORK, "ph", name_2k)
    if os.path.exists(p):
        return p
    return os.path.join(OUT, "tex", name_1k)


def load_image(path, non_color=False):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    return img


def gltf_output_group():
    """glTF 내보내기가 occlusion 텍스처를 인식하는 노드 그룹."""
    ng = bpy.data.node_groups.get("glTF Material Output")
    if ng:
        return ng
    ng = bpy.data.node_groups.new("glTF Material Output", "ShaderNodeTree")
    ng.interface.new_socket(name="Occlusion", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.interface.new_socket(name="Thickness", in_out="INPUT", socket_type="NodeSocketFloat")
    ng.nodes.new("NodeGroupInput")
    return ng


def pbr_material(name, diffuse, normal=None, arm=None, rough=0.8, tint=None, uv="UVMap"):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = uv
    if diffuse:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = load_image(diffuse)
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
        if tint:
            bsdf.inputs["Base Color"].default_value = (*tint, 1)
    elif tint:
        bsdf.inputs["Base Color"].default_value = (*tint, 1)
    if normal:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = load_image(normal, True)
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nm.uv_map = uv
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    if arm:
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = load_image(arm, True)
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        nt.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
        # 돌·벽돌은 금속이 아니다 (파란 채널을 이으면 glTF metallicFactor=1 로 나가 어둡게 반사된다)
        bsdf.inputs["Metallic"].default_value = 0.0
    else:
        bsdf.inputs["Roughness"].default_value = rough
        bsdf.inputs["Metallic"].default_value = 0.0
    return m


def box(name, sx, sy, z0, z1, bevel=0.0, segments=2):
    """바닥 z0 ~ 위 z1, 가운데 (0,0)인 상자."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co.x *= sx
        v.co.y *= sy
        v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, segments=segments, affect="EDGES", profile=0.5)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    return ob


def frame(name, outer, inner, z0, z1, bevel=0.0):
    """정사각 테두리(가운데가 빈 틀)."""
    w = (outer - inner) / 2
    parts = []
    for i, (cx, cy, sx, sy) in enumerate(
        [
            (0, (outer - w) / 2, outer, w),
            (0, -(outer - w) / 2, outer, w),
            ((outer - w) / 2, 0, w, inner),
            (-(outer - w) / 2, 0, w, inner),
        ]
    ):
        ob = box(f"{name}_{i}", sx, sy, z0, z1, bevel)
        ob.location = (cx, cy, 0)
        parts.append(ob)
    return join(parts, name)


def join(objs, name):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    if len(objs) > 1:
        bpy.ops.object.join()
    ob = bpy.context.view_layer.objects.active
    ob.name = name
    ob.data.name = name
    return ob


def box_uv(ob, tile, name="UVMap"):
    """면마다 가장 가까운 축으로 평면 투영 (tile m = 텍스처 1장)."""
    me = ob.data
    if name not in me.uv_layers:
        me.uv_layers.new(name=name)
    bm = bmesh.new()
    bm.from_mesh(me)
    uvl = bm.loops.layers.uv[name]
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for lp in f.loops:
            c = lp.vert.co
            if ax == 2:
                u, v = c.x, c.y
            elif ax == 0:
                u, v = c.y, c.z
            else:
                u, v = c.x, c.z
            lp[uvl].uv = (u / tile, v / tile)
    bm.to_mesh(me)
    bm.free()


def empty(name, loc):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = 0.1
    e.location = loc
    bpy.context.collection.objects.link(e)
    return e


# ───────────────────────── 흰 자갈 텍스처 (타일링) ─────────────────────────


def pebble_images(size=1024, count=2600, seed=7):
    """1m 타일 = size px. 3~6cm 흰 자갈을 빽빽하게 (가장자리를 넘는 자갈은 반대편에도 그려 이음새 없이 반복)."""
    rng = np.random.default_rng(seed)
    pad = 40
    big = size + 2 * pad
    h = np.zeros((big, big), np.float32)
    col = np.full((big, big, 3), 0.66, np.float32)  # 틈새(모래) 색
    for _ in range(count):
        cx, cy = rng.uniform(0, size, 2)
        rx = rng.uniform(14, 30)
        ry = rx * rng.uniform(0.6, 0.95)
        ang = rng.uniform(0, math.pi)
        ca, sa = math.cos(ang), math.sin(ang)
        tone = rng.uniform(0.8, 0.98)
        warm = rng.uniform(-0.025, 0.025)
        c = np.array([tone + warm, tone, tone - warm * 1.5], np.float32)
        r = int(rx) + 2
        for ox in (-size, 0, size):
            for oy in (-size, 0, size):
                x0, y0 = cx + ox + pad, cy + oy + pad
                xa, xb = max(int(x0) - r, 0), min(int(x0) + r + 1, big)
                ya, yb = max(int(y0) - r, 0), min(int(y0) + r + 1, big)
                if xa >= xb or ya >= yb:
                    continue
                yy, xx = np.mgrid[ya:yb, xa:xb].astype(np.float32)
                dx, dy = xx - x0, yy - y0
                u = (dx * ca + dy * sa) / rx
                v = (-dx * sa + dy * ca) / ry
                dome = np.sqrt(np.clip(1 - (u * u + v * v), 0, 1)) * (0.55 + 0.45 * rx / 30)
                hw = h[ya:yb, xa:xb]
                mask = dome > hw
                hw[mask] = dome[mask]
                shade = 0.88 + 0.12 * dome
                cw = col[ya:yb, xa:xb]
                cw[mask] = c[None, :] * shade[mask][:, None]
    h = h[pad : pad + size, pad : pad + size]
    col = col[pad : pad + size, pad : pad + size]
    gy, gx = np.gradient(h)
    strength = 6.0
    nx, ny = -gx * strength, gy * strength
    nz = np.ones_like(h)
    ln = np.sqrt(nx * nx + ny * ny + nz * nz)
    nrm = np.stack([nx / ln, ny / ln, nz / ln], -1) * 0.5 + 0.5

    def to_image(name, rgb, non_color):
        img = bpy.data.images.new(name, size, size, alpha=False)
        if non_color:
            img.colorspace_settings.name = "Non-Color"
        px = np.concatenate([rgb[::-1], np.ones((size, size, 1), np.float32)], -1)
        img.pixels.foreach_set(px.ravel())
        path = os.path.join(TMP, f"{name}.png")
        img.filepath_raw = path
        img.file_format = "PNG"
        img.save()
        return path

    # sRGB 저장용 (감마 적용)
    return to_image("pebble_color", np.power(np.clip(col, 0, 1), 1 / 2.2), False), to_image("pebble_normal", nrm, True)


# ───────────────────────── 분수 ─────────────────────────

# 단: (한 변 m, 바닥 z, 윗면 z) — 윗면이 곧 물 밑바닥, 그 위에 테두리돌과 물
TIERS = [(10.0, 0.0, 0.40), (7.2, 0.40, 0.85), (4.6, 0.85, 1.35)]
COPING_W = 0.32
COPING_H = 0.12
WATER_DEPTH = 0.04  # 테두리돌 윗면보다 이만큼 낮게 물


def build_fountain():
    reset()
    granite = pbr_material(
        "granite",
        texpath("granite_tile_Diffuse_2k.jpg", "granite_tile_diffuse.jpg"),
        texpath("granite_tile_nor_gl_2k.jpg", "granite_tile_nor_gl.jpg"),
        texpath("granite_tile_arm_2k.jpg", "granite_tile_arm.jpg"),
    )
    coping = pbr_material(
        "granite_coping",
        texpath("granite_tile_Diffuse_2k.jpg", "granite_tile_diffuse.jpg"),
        texpath("granite_tile_nor_gl_2k.jpg", "granite_tile_nor_gl.jpg"),
        None,
        rough=0.45,
        tint=(1, 1, 1),
    )
    pc, pn = pebble_images()
    pebble = pbr_material("pebbles", pc, pn, None, rough=0.7)

    parts = []
    for i, (size, z0, z1) in enumerate(TIERS):
        body = box(f"tier{i}", size, size, z0, z1, bevel=0.01)
        box_uv(body, 1.6)
        body.data.materials.append(granite)
        cp = frame(f"coping{i}", size + 0.04, size - 2 * COPING_W, z1, z1 + COPING_H, bevel=0.025)
        box_uv(cp, 1.6)
        cp.data.materials.append(coping)
        parts += [body, cp]

    # 맨 아래 단 둘레 흰 자갈 띠 (살짝 볼록)
    base = TIERS[0][0]
    band = frame("pebbles", base + 1.6, base + 0.02, -0.02, 0.05, bevel=0.03)
    box_uv(band, 1.0)
    band.data.materials.append(pebble)
    parts.append(band)

    fountain = join(parts, "fountain")
    for p in fountain.data.polygons:
        p.use_smooth = False

    # 앰비언트 오클루전 굽기 (두 번째 UV)
    me = fountain.data
    lm = me.uv_layers.new(name="lightmap")
    me.uv_layers.active = lm
    bpy.ops.object.select_all(action="DESELECT")
    fountain.select_set(True)
    bpy.context.view_layer.objects.active = fountain
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.004, scale_to_bounds=True)
    bpy.ops.object.mode_set(mode="OBJECT")

    ao = bpy.data.images.new("fountain_ao", 1024, 1024, alpha=False)
    ao.colorspace_settings.name = "Non-Color"
    ng = gltf_output_group()
    for m in fountain.data.materials:
        nt = m.node_tree
        uvn = nt.nodes.new("ShaderNodeUVMap")
        uvn.uv_map = "lightmap"
        t = nt.nodes.new("ShaderNodeTexImage")
        t.image = ao
        nt.links.new(uvn.outputs["UV"], t.inputs["Vector"])
        nt.nodes.active = t
        sep = nt.nodes.new("ShaderNodeSeparateColor")
        nt.links.new(t.outputs["Color"], sep.inputs["Color"])
        g = nt.nodes.new("ShaderNodeGroup")
        g.node_tree = ng
        nt.links.new(sep.outputs["Red"], g.inputs["Occlusion"])

    # 땅 (굽기용, 내보내지 않음)
    ground = box("ground_tmp", 60, 60, -0.3, -0.02)
    s = bpy.context.scene
    s.cycles.samples = 96
    s.world.light_settings.distance = 1.2
    s.render.bake.margin = 6
    bpy.ops.object.select_all(action="DESELECT")
    fountain.select_set(True)
    bpy.context.view_layer.objects.active = fountain
    log("분수 AO 굽는 중…")
    bpy.ops.object.bake(type="AO")
    ao.filepath_raw = os.path.join(TMP, "fountain_ao.png")
    ao.file_format = "PNG"
    ao.save()
    bpy.data.objects.remove(ground)
    # 원래 UV를 첫 번째(TEXCOORD_0)로
    me.uv_layers.active = me.uv_layers["UVMap"]
    me.uv_layers["UVMap"].active_render = True

    # 물 표면 (굽기가 끝난 뒤에 만들어야 물밑 바닥이 새까맣게 구워지지 않는다). 웹에서 물 재질로 바꿔 그린다.
    waters = []
    for i, (size, z0, z1) in enumerate(TIERS):
        inner = size - 2 * COPING_W
        w = box(f"water_{i}", inner, inner, z1 + COPING_H - WATER_DEPTH - 0.001, z1 + COPING_H - WATER_DEPTH)
        wm = bpy.data.materials.new(f"water_{i}")
        wm.use_nodes = True
        wm.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.2, 0.3, 0.35, 1)
        w.data.materials.append(wm)
        waters.append(w)

    # 물줄기 위치
    top = TIERS[2]
    wz = lambda t: t[2] + COPING_H - WATER_DEPTH
    empty("jet_center", (0, 0, wz(top)))
    for k in range(12):
        a = k / 12 * math.tau
        empty(f"jet_ring_{k:02d}", (math.cos(a) * 1.35, math.sin(a) * 1.35, wz(top)))
    for ti, per_side in [(1, 5), (0, 7)]:
        size = TIERS[ti][0]
        inset = size / 2 - COPING_W - 0.28
        k = 0
        for side in range(4):
            for j in range(per_side):
                t = (j + 0.5) / per_side * 2 - 1
                x, y = [(t * inset, inset), (inset, -t * inset), (-t * inset, -inset), (-inset, t * inset)][side]
                empty(f"jet_t{ti}_{k:02d}", (x, y, wz(TIERS[ti])))
                k += 1

    export(os.path.join(OUT, "fountain.glb"), [fountain, *waters, *[o for o in bpy.data.objects if o.type == "EMPTY"]])
    if "--preview" in opts:
        render_preview(opts["--preview"], target=(0, 0, 1.2), cam=(13, -15, 4.5))
    return fountain


def render_preview(path, target, cam):
    """확인용 Cycles 렌더 (HDRI 조명 + 잔디 바닥)."""
    s = bpy.context.scene
    hdr = os.path.join(OUT, "env", "sky_1k.hdr")
    if os.path.exists(hdr):
        nt = s.world.node_tree
        env = nt.nodes.new("ShaderNodeTexEnvironment")
        env.image = load_image(hdr)
        nt.links.new(env.outputs["Color"], nt.nodes["Background"].inputs["Color"])
        nt.nodes["Background"].inputs["Strength"].default_value = 1.0
    g = box("preview_ground", 80, 80, -0.3, -0.01)
    g.data.materials.append(
        pbr_material("grass_prev", os.path.join(OUT, "tex", "sparse_grass_diffuse.jpg"), None, None, rough=0.95)
    )
    box_uv(g, 2.0)
    cd = bpy.data.cameras.new("cam")
    cd.lens = 32
    c = bpy.data.objects.new("cam", cd)
    bpy.context.collection.objects.link(c)
    c.location = cam
    d = Vector(target) - Vector(cam)
    c.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    s.camera = c
    s.render.resolution_x, s.render.resolution_y = 1280, 720
    s.cycles.samples = 48
    s.cycles.use_denoising = True
    s.view_settings.view_transform = "AgX"
    s.render.filepath = path
    bpy.ops.render.render(write_still=True)
    log("미리보기 →", path)


# ───────────────────────── 나무 ─────────────────────────

TREE_HEIGHT = {
    "oak_a": 11.0,
    "oak_b": 12.5,
    "ash_a": 13.0,
    "aspen_a": 12.0,
    "pine_a": 10.5,
    "pine_b": 6.5,
    "bush_a": 1.7,
    "bush_b": 1.3,
}


def bark_material(kind):
    name = f"bark_{kind}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    d = os.path.join(EZ, "bark")
    m = pbr_material(name, f"{d}/{kind}_color_1k.jpg", f"{d}/{kind}_normal_1k.jpg", None, rough=0.9)
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = load_image(f"{d}/{kind}_roughness_1k.jpg", True)
    nt.links.new(nt.nodes["UV Map"].outputs["UV"], t.inputs["Vector"])
    nt.links.new(t.outputs["Color"], nt.nodes["Principled BSDF"].inputs["Roughness"])
    m.use_backface_culling = True  # 닫힌 줄기: 뒷면은 그리지 않는다
    return m


def leaf_material(kind):
    name = f"leaves_{kind}"
    if name in bpy.data.materials:
        return bpy.data.materials[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = load_image(os.path.join(EZ, "leaves", f"{kind}_color.png"))
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    rnd = nt.nodes.new("ShaderNodeMath")
    rnd.operation = "ROUND"
    nt.links.new(t.outputs["Alpha"], rnd.inputs[0])
    nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.75
    m.use_backface_culling = False
    return m


def build_trees():
    import json

    reset()
    meta = json.load(open(os.path.join(WORK, "trees", "trees.json")))
    objs = []
    for i, (name, info) in enumerate(meta.items()):
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.wm.obj_import(filepath=os.path.join(WORK, "trees", f"{name}.obj"), forward_axis="NEGATIVE_Z", up_axis="Y")
        imported = list(bpy.context.selected_objects)
        s = TREE_HEIGHT[name] / info["height"]
        for ob in imported:
            part = "bark" if ob.name.startswith("bark") else "leaves"
            ob.name = f"{name}_{part}"
            ob.data.name = ob.name
            ob.scale = (s, s, s)
            ob.data.materials.clear()
            if part == "bark":
                ob.data.materials.append(bark_material(info["bark"]["type"]))
            else:
                ob.data.materials.append(leaf_material(info["leaves"]["type"]))
        # OBJ(Y 위) → Blender(Z 위) 회전까지 메시에 굽는다: 웹에서 인스턴싱하면 노드 회전이 빠진다
        bpy.ops.object.transform_apply(location=False, rotation=True, scale=True)
        for ob in imported:
            ob.data.uv_layers[0].name = "UVMap"
            if ob.name.endswith("_bark"):
                for p in ob.data.polygons:
                    p.use_smooth = True
                # 껍질은 잎에 거의 가려진다 → 삼각형을 크게 줄인다 (관목은 더)
                dec = ob.modifiers.new("decimate", "DECIMATE")
                dec.ratio = 0.12 if name.startswith("bush") else 0.3
            else:
                leaf_normals(ob)
            ob.location.x = i * 20  # 미리보기용으로 늘어놓기 (웹에서는 원점 기준으로 다시 둔다)
        objs += imported
        log(f"나무 {name}: 높이 {TREE_HEIGHT[name]}m")
    for ob in objs:
        ob.location.x = 0
    export(os.path.join(OUT, "trees.glb"), objs)


def leaf_normals(ob):
    """잎 카드 법선을 수관 중심에서 바깥쪽으로 → 잎 덩어리가 부드럽게 음영진다."""
    me = ob.data
    co = np.zeros(len(me.vertices) * 3, np.float32)
    me.vertices.foreach_get("co", co)
    co = co.reshape(-1, 3)
    lo, hi = co.min(0), co.max(0)
    center = (lo + hi) / 2
    center[2] = lo[2] + (hi[2] - lo[2]) * 0.45
    d = co - center
    d /= np.linalg.norm(d, axis=1, keepdims=True) + 1e-6
    d = d * 0.75 + np.array([0, 0, 0.25], np.float32)
    d /= np.linalg.norm(d, axis=1, keepdims=True)
    for p in me.polygons:
        p.use_smooth = True
    me.normals_split_custom_set_from_vertices([Vector(v) for v in d])


# ───────────────────────── 내보내기 ─────────────────────────


def join_by_material(root):
    """한 건물(빈 물체) 아래 조각 메시를 재질별로 합친다 → 웹에서 그리기 호출이 줄어든다.
    사진 면(photo_ 이름)은 따로 모으고, 자식이 있는 메시와 빈 물체(gate_text 등)는 그대로 둔다."""
    groups = {}
    for o in root.children:
        if o.type != "MESH" or o.children:
            continue
        key = (o.name.startswith("photo_"), tuple(m.name if m else "" for m in o.data.materials))
        groups.setdefault(key, []).append(o)
    for (is_photo, mats), objs in groups.items():
        if len(objs) < 2:
            continue
        bpy.ops.object.select_all(action="DESELECT")
        for o in objs:
            o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        objs[0].name = f"{'photo_' if is_photo else ''}{root.name}_{mats[0] if mats else 'mesh'}"


def export(path, objs, draco=True):
    bpy.ops.object.select_all(action="DESELECT")
    for o in objs:
        o.select_set(True)
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_apply=True,
        export_texcoords=True,
        export_normals=True,
        export_image_format="WEBP",
        export_image_quality=82,
        export_draco_mesh_compression_enable=draco,
        export_draco_mesh_compression_level=7,
        export_draco_position_quantization=14,
        export_draco_normal_quantization=10,
        export_draco_texcoord_quantization=14,
        export_extras=False,
        export_cameras=False,
        export_lights=False,
    )
    log("→", path, f"{os.path.getsize(path) / 1e6:.2f}MB")


# ───────────────────────── 계명대 건물 (campus.glb) ─────────────────────────
#
# 사진 외벽(prep_facades.py 결과)을 입힌 건물 + 모델링한 정문.
# 건물마다 원점 = 정면 아래 가운데, 정면은 Blender -Y (웹에서는 +Z) 를 본다. 웹에서 분수 쪽을 보게 돌려 세운다.
# 사진을 입힌 면은 이름이 photo_ 로 시작 → 웹에서 조명 없이(사진 그대로) 그린다.


def quad(name, pts, uvs, mat, parent):
    """pts: 네 꼭짓점 (반시계, 바깥에서 볼 때), uvs: 네 UV."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in pts]
    f = bm.faces.new(vs)
    uvl = bm.loops.layers.uv.new("UVMap")
    for lp, uv in zip(f.loops, uvs):
        lp[uvl].uv = uv
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def wall(name, a, b, z0, z1, mat, parent, tile=None, v=(0.0, 1.0), u0=0.0, vr=None):
    """a→b 방향으로 선 벽 (바깥쪽 = 진행 방향의 오른쪽). tile=(가로 m, 세로 m)이면 반복 UV, vr로 세로 UV를 따로 정할 수 있다."""
    ax, ay = a
    bx, by = b
    length = math.hypot(bx - ax, by - ay)
    if tile:
        u1 = u0 + length / tile[0]
        va, vb = vr if vr else (z0 / tile[1], z1 / tile[1])
    else:
        u1, (va, vb) = 1.0, v
    return quad(
        name,
        [(ax, ay, z0), (bx, by, z0), (bx, by, z1), (ax, ay, z1)],
        [(u0, va), (u1, va), (u1, vb), (u0, vb)],
        mat,
        parent,
    )


def box_walls(prefix, x0, x1, y0, y1, z0, z1, mat, parent, tile=None, front=True, roof_mat=None):
    """직육면체 네 벽(+지붕). 정면(y0, -Y 쪽)은 front=False면 생략."""
    obs = []
    if front:
        obs.append(wall(f"{prefix}_front", (x0, y0), (x1, y0), z0, z1, mat, parent, tile))
    obs.append(wall(f"{prefix}_right", (x1, y0), (x1, y1), z0, z1, mat, parent, tile))
    obs.append(wall(f"{prefix}_back", (x1, y1), (x0, y1), z0, z1, mat, parent, tile))
    obs.append(wall(f"{prefix}_left", (x0, y1), (x0, y0), z0, z1, mat, parent, tile))
    if roof_mat:
        obs.append(quad(f"{prefix}_roof", [(x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)], [(0, 0)] * 4, roof_mat, parent))
    return obs


def gable_roof(name, x0, x1, y0, y1, z0, ridge, mat, parent, along="y", ends=True):
    """박공지붕 (along 방향으로 용마루). ends=False면 양 끝 삼각형 없이 지붕면만 (박공벽을 따로 세울 때)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if along == "y":
        xm = (x0 + x1) / 2
        v = [bm.verts.new(p) for p in [(x0, y0, z0), (xm, y0, ridge), (x1, y0, z0), (x0, y1, z0), (xm, y1, ridge), (x1, y1, z0)]]
    else:
        ym = (y0 + y1) / 2
        v = [bm.verts.new(p) for p in [(x0, y0, z0), (x0, ym, ridge), (x0, y1, z0), (x1, y0, z0), (x1, ym, ridge), (x1, y1, z0)]]
    for f in [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2)][0 if ends else 2 :]:
        bm.faces.new([v[i] for i in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (lp.vert.co.x / 4, (lp.vert.co.y + lp.vert.co.z) / 4)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def hip_roof(name, x0, x1, y0, y1, z0, z1, mat, parent, overhang=0.6):
    """모임지붕 (네 면이 모두 경사, 긴 쪽으로 용마루)."""
    x0, x1, y0, y1 = x0 - overhang, x1 + overhang, y0 - overhang, y1 + overhang
    w, d = x1 - x0, y1 - y0
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if w >= d:
        i = d / 2
        pts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0 + i, (y0 + y1) / 2, z1), (x1 - i, (y0 + y1) / 2, z1)]
        faces = [(0, 1, 5, 4), (2, 3, 4, 5), (1, 2, 5), (3, 0, 4)]
    else:
        i = w / 2
        pts = [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), ((x0 + x1) / 2, y0 + i, z1), ((x0 + x1) / 2, y1 - i, z1)]
        faces = [(0, 1, 4), (1, 2, 5, 4), (2, 3, 5), (3, 0, 4, 5)]
    v = [bm.verts.new(p) for p in pts]
    for f in faces:
        bm.faces.new([v[k] for k in f])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for lp in f.loops:
            lp[uvl].uv = (lp.vert.co.x / 3, (lp.vert.co.y + lp.vert.co.z) / 3)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def photo_material(name, path, alpha=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = load_image(path)
    nt.links.new(t.outputs["Color"], bsdf.inputs["Base Color"])
    if alpha:
        rnd = nt.nodes.new("ShaderNodeMath")
        rnd.operation = "ROUND"
        nt.links.new(t.outputs["Alpha"], rnd.inputs[0])
        nt.links.new(rnd.outputs[0], bsdf.inputs["Alpha"])
    bsdf.inputs["Roughness"].default_value = 0.9
    return m


def lit_material(name, path, alpha=False):
    """그린 외벽 무늬 — 장면 빛을 받는 재질 (photo_ 가 아니므로 웹에서 조명 계산)."""
    m = photo_material(name, path, alpha)
    m.node_tree.nodes["Principled BSDF"].inputs["Roughness"].default_value = 0.85
    return m


def plain_material(name, rgb, rough=0.8, metal=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    return m


def building(name):
    e = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(e)
    return e


def fluted_column(name, radius, height, parent, loc, mat, flutes=20):
    """세로 홈이 파인 이오니아식 기둥 (주춧돌 + 몸통 + 주두)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    seg = flutes * 3
    shaft0, shaft1 = height * 0.06, height * 0.92
    rings = []
    for z, r in [(shaft0, radius), (shaft1, radius * 0.9)]:
        ring = []
        for k in range(seg):
            a = k / seg * math.tau
            rr = r * (1 - 0.06 * abs(math.sin(a * flutes / 2)))
            ring.append(bm.verts.new((math.cos(a) * rr, math.sin(a) * rr, z)))
        rings.append(ring)
    for k in range(seg):
        a, b = rings[0][k], rings[0][(k + 1) % seg]
        c, d = rings[1][(k + 1) % seg], rings[1][k]
        bm.faces.new([a, b, c, d])
    # 주춧돌: 네모 받침 + 둥근 테
    for (z0, z1, r, sq) in [(0, height * 0.03, radius * 1.45, True), (height * 0.03, shaft0, radius * 1.2, False)]:
        if sq:
            geom = bmesh.ops.create_cube(bm, size=1)["verts"]
            for v in geom:
                v.co.x *= r * 2
                v.co.y *= r * 2
                v.co.z = z0 + (v.co.z + 0.5) * (z1 - z0)
        else:
            geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=r, radius2=radius, depth=z1 - z0)["verts"]
            for v in geom:
                v.co.z += (z0 + z1) / 2
    # 주두: 둥근 받침 + 소용돌이(양옆 원통) + 네모 판
    geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=24, radius1=radius * 0.95, radius2=radius * 1.15, depth=height * 0.03)["verts"]
    for v in geom:
        v.co.z += shaft1 + height * 0.015
    for sx in (-1, 1):
        geom = bmesh.ops.create_cone(bm, cap_ends=True, segments=16, radius1=radius * 0.32, radius2=radius * 0.32, depth=radius * 2.2)["verts"]
        for v in geom:
            v.co.y, v.co.z = v.co.z, v.co.y  # 소용돌이 축은 앞뒤(Y)
            v.co.x += sx * radius * 1.05
            v.co.z += shaft1 + height * 0.035
    geom = bmesh.ops.create_cube(bm, size=1)["verts"]
    for v in geom:
        v.co.x *= radius * 2.7
        v.co.y *= radius * 2.7
        v.co.z = height * 0.965 + (v.co.z + 0.5) * height * 0.035
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    ob.location = loc
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def slab(name, x0, x1, y0, y1, z0, z1, mat, parent, bevel=0.0):
    ob = box(name, x1 - x0, y1 - y0, z0, z1, bevel=bevel)
    ob.location = ((x0 + x1) / 2, (y0 + y1) / 2, 0)
    ob.data.materials.append(mat)
    ob.parent = parent
    return ob


def pediment(name, x0, x1, y0, y1, z0, height, mat, parent):
    ob = gable_roof(name, x0, x1, y0, y1, z0, z0 + height, mat, parent, along="y")
    return ob


def tri(name, pts, uvs, mat, parent):
    """삼각형 한 장 (pts 반시계, 바깥에서 볼 때)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    f = bm.faces.new([bm.verts.new(p) for p in pts])
    uvl = bm.loops.layers.uv.new("UVMap")
    for lp, uv in zip(f.loops, uvs):
        lp[uvl].uv = uv
    bm.normal_update()
    bm.to_mesh(me)
    bm.free()
    me.materials.append(mat)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.parent = parent
    return ob


def build_dongcheon(F, stone, roof_green, hedge, rock, props):
    """동천관(東泉館, 대학원) — 사용자가 찍은 사진 3장 + OSM 윤곽(78 × 37 m)을 따른 실측 m.
    원점 = 가운데 현관 축, 박공동 정면 선(y=0). 정면(북쪽, 분수 광장 쪽)은 Blender −Y.
    가운데 3층 유리 커튼월 앞 이오니아식 기둥 8개 현관(프리즈 '東泉館', 십자 원형창 박공) →
    양옆 3층 날개(1·2층 짝창, 3층 띠창) → 양 끝 박공동(흰 귓돌, 돌출창·메달리온). 지붕은 녹색 동판.
    현관 앞 계단(정면에서 보아 왼쪽, 동쪽)과 벽돌 화단 위 검은 돌 조형물(오른쪽, 서쪽), 날개 앞 난간 두른 테라스, 그 앞 벽돌 마당 가운데 반송·향나무·돌 둔덕."""
    dc = building("bld_dongcheon")
    wing = lit_material("dc_wing", f"{F}/dc_wing.jpg")
    center = lit_material("dc_center", f"{F}/dc_center.jpg")
    pav_front = lit_material("dc_pav_front", f"{F}/dc_pav_front.png", alpha=True)
    pav_side = lit_material("dc_pav_side", f"{F}/dc_pav_side.jpg")
    bay = lit_material("dc_bay", f"{F}/dc_bay.jpg")
    frieze = lit_material("dc_frieze", f"{F}/dc_frieze.jpg")
    ped = lit_material("dc_pediment", f"{F}/dc_pediment.png", alpha=True)
    coffer = lit_material("dc_coffer", f"{F}/dc_coffer.jpg")
    fence = lit_material("dc_fence", f"{F}/dc_fence.png", alpha=True)
    granite = plain_material("dc_granite", (0.55, 0.53, 0.5), rough=0.85)
    brick = plain_material("dc_brick", (0.26, 0.085, 0.06), rough=0.9)
    E, FL = 15.0, 0.9  # 처마 높이, 1층 바닥

    # ── 양 끝 박공동 (13 × 37 m, 처마 15 m, 용마루 23.5 m) ──
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 26.0, sx * 39.0))
        quad(f"dc_pav_front{sx:+d}", [(x0, 0, 0), (x1, 0, 0), (x1, 0, 23.5), (x0, 0, 23.5)], [(0, 0), (1, 0), (1, 1), (0, 1)], pav_front, dc)
        quad(f"dc_pav_back{sx:+d}", [(x1, 37, 0), (x0, 37, 0), (x0, 37, 23.5), (x1, 37, 23.5)], [(0, 0), (1, 0), (1, 1), (0, 1)], pav_front, dc)
        xo, xi = (x1, x0) if sx > 0 else (x0, x1)  # 바깥 옆면, 안쪽(날개 쪽) 옆면
        a, b = ((xo, 0), (xo, 37)) if sx > 0 else ((xo, 37), (xo, 0))
        wall(f"dc_pav_side{sx:+d}", a, b, 0, E, pav_side, dc, tile=(37, E))
        for (ya, yb) in ((0.0, 2.5), (18.5, 37.0)):  # 날개 앞·뒤로 드러난 안쪽 옆면
            a, b = ((xi, yb), (xi, ya)) if sx > 0 else ((xi, ya), (xi, yb))
            wall(f"dc_pav_inner{sx:+d}_{ya:.0f}", a, b, 0, E, pav_side, dc, tile=(37, E), u0=ya / 37)
        gable_roof(f"dc_pav_roof{sx:+d}", x0 - 0.35, x1 + 0.35, -0.45, 37.45, E, 23.95, roof_green, dc, along="y", ends=False)
        # 가운데 돌출창 (4.6 m 폭, 0.55 m 앞으로) + 흰 돌 옆면·갓
        cx = sx * 32.5
        bx0, bx1 = cx - 2.3, cx + 2.3
        quad(f"dc_bay{sx:+d}", [(bx0, -0.55, FL), (bx1, -0.55, FL), (bx1, -0.55, 14.3), (bx0, -0.55, 14.3)], [(0, 0), (1, 0), (1, 1), (0, 1)], bay, dc)
        wall(f"dc_bay_l{sx:+d}", (bx0, 0), (bx0, -0.55), FL, 14.3, stone, dc)
        wall(f"dc_bay_r{sx:+d}", (bx1, -0.55), (bx1, 0), FL, 14.3, stone, dc)
        slab(f"dc_bay_cap{sx:+d}", bx0 - 0.12, bx1 + 0.12, -0.7, 0.05, 14.3, 14.55, stone, dc)
        slab(f"dc_bay_foot{sx:+d}", bx0 - 0.08, bx1 + 0.08, -0.65, 0.05, 0.0, FL, stone, dc)

    # ── 3층 날개 (15.5 m, 앞면 2.5 m 들어감) + 흰 처마 돌림띠 + 녹색 모임지붕 ──
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 10.5, sx * 26.0))
        wall(f"dc_wing_front{sx:+d}", (x0, 2.5), (x1, 2.5), 0, E, wing, dc, tile=(4.0, E))
        wall(f"dc_wing_back{sx:+d}", (x1, 18.5), (x0, 18.5), 0, E, wing, dc, tile=(4.0, E))
        slab(f"dc_wing_cornice{sx:+d}", x0, x1, 2.15, 2.5, E - 0.45, E + 0.05, stone, dc)
        hip_roof(f"dc_wing_roof{sx:+d}", x0, x1, 2.5, 18.5, E, E + 3.8, roof_green, dc, overhang=0.4)

    # ── 현관 뒤 가운데 몸체 (21 × 24.5 m, 유리 커튼월) ──
    quad("dc_center_front", [(-10.5, 3.5, 0), (10.5, 3.5, 0), (10.5, 3.5, E), (-10.5, 3.5, E)], [(0, 0), (1, 0), (1, 1), (0, 1)], center, dc)
    wall("dc_center_side_e", (10.5, 2.5), (10.5, 28), 0, E, wing, dc, tile=(4.0, E))
    wall("dc_center_side_w", (-10.5, 28), (-10.5, 2.5), 0, E, wing, dc, tile=(4.0, E))
    wall("dc_center_back", (10.5, 28), (-10.5, 28), 0, E, wing, dc, tile=(4.0, E))
    hip_roof("dc_center_roof", -10.5, 10.5, 3.5, 28, E, E + 4.5, roof_green, dc, overhang=0.4)

    # ── 현관: 기단·계단 → 이오니아식 기둥 8개(앞 4, 옆 2씩) → 우물반자 → 아키트레이브·프리즈·코니스 → 박공 ──
    slab("dc_portico_base", -10.8, 10.8, -11.2, 3.5, 0, FL, granite, dc)
    for i in range(6):  # 계단은 정면에서 보아 왼쪽 3/5, 오른쪽은 조형물 화단 (사진 IMG_4038)
        slab(f"dc_step{i}", -8.8, 1.8, -11.2 - (i + 1) * 0.4, -11.2 - i * 0.4, 0, FL - (i + 1) * 0.15, granite, dc)
    slab("dc_sculpt_bed", 2.4, 9.4, -14.2, -11.2, 0, FL, brick, dc)
    slab("dc_sculpt_bed_cap", 2.3, 9.5, -14.3, -11.1, FL, FL + 0.1, stone, dc)
    # 검은 돌 조형물: 윤이 나는 검은 화강암 알(길이 2.4 m, 지름 2 m), 앞을 평평하게 잘라 북서쪽 위로 기울였다. 흰 이오니아식 주두 위에 얹힘
    black = plain_material("dc_black_granite", (0.018, 0.019, 0.021), rough=0.18)
    sx_, sy_ = 5.4, -12.7
    fluted_column("dc_sculpt_pedestal", 0.36, 1.05, dc, (sx_, sy_, FL + 0.1), stone, flutes=16)
    me = bpy.data.meshes.new("dc_sculpture")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=24, radius=1.0)
    for v in bm.verts:
        v.co = Vector((v.co.x * 1.0, v.co.y * 1.35, v.co.z * 1.0))
    cut = bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, -0.65, 0), plane_no=(0, -1, 0), clear_outer=True)
    rim = [e for e in cut["geom_cut"] if isinstance(e, bmesh.types.BMEdge)]
    cap = bmesh.ops.edgeloop_fill(bm, edges=rim)["faces"]
    rot = Matrix.Rotation(0.45, 3, "Z") @ Matrix.Rotation(-0.35, 3, "X")  # 잘린 면이 앞(북) 오른쪽(서) 위를 본다
    bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=rot)
    bmesh.ops.translate(bm, verts=bm.verts, vec=(sx_, sy_ + 0.2, FL + 0.1 + 1.05 + 0.78))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = f not in cap
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("dc_sculpture", me)
    ob.data.materials.append(black)
    bpy.context.collection.objects.link(ob)
    ob.parent = dc
    colH, colR = 12.4, 0.62
    spots = [(x, -9.8) for x in (-8.7, -2.9, 2.9, 8.7)] + [(sx * 8.7, y) for sx in (-1, 1) for y in (-5.7, -1.6)]
    for k, (x, y) in enumerate(spots):
        fluted_column(f"dc_col{k}", colR, colH, dc, (x, y, FL), stone, flutes=20)
    top = FL + colH  # 13.3
    quad("dc_soffit", [(-9.9, -10.2, top - 0.02), (-9.9, 3.5, top - 0.02), (9.9, 3.5, top - 0.02), (9.9, -10.2, top - 0.02)],
         [(-9.9 / 2.8, -10.2 / 2.8), (-9.9 / 2.8, 3.5 / 2.8), (9.9 / 2.8, 3.5 / 2.8), (9.9 / 2.8, -10.2 / 2.8)], coffer, dc)
    slab("dc_architrave", -10.1, 10.1, -10.4, 3.5, top, top + 0.8, stone, dc)
    slab("dc_frieze_block", -10.1, 10.1, -10.4, 3.5, top + 0.8, top + 1.6, stone, dc)
    quad("dc_frieze", [(-10.1, -10.42, top + 0.8), (10.1, -10.42, top + 0.8), (10.1, -10.42, top + 1.6), (-10.1, -10.42, top + 1.6)], [(0, 0), (1, 0), (1, 1), (0, 1)], frieze, dc)
    slab("dc_cornice", -10.55, 10.55, -10.85, 3.5, top + 1.6, top + 2.1, stone, dc, bevel=0.05)
    pz, peak = top + 2.1, 21.0
    gable_roof("dc_pediment_block", -10.55, 10.55, -10.85, -10.15, pz, peak, stone, dc, along="y")
    tri("dc_pediment", [(-10.55, -10.87, pz), (10.55, -10.87, pz), (0, -10.87, peak)], [(0, 0), (1, 0), (0.5, 1)], ped, dc)
    gable_roof("dc_portico_roof", -10.75, 10.75, -10.95, 4.2, pz - 0.05, peak + 0.25, roof_green, dc, along="y", ends=False)

    # ── 날개·박공동 앞 테라스 (벽돌 옹벽 + 흰 돌 갓 + 마름모 무늬 쇠 난간) ──
    for sx in (-1, 1):
        x0, x1 = sorted((sx * 10.8, sx * 39.6))
        slab(f"dc_terrace{sx:+d}", x0, x1, -4.0, 2.5, 0, FL, brick, dc)
        slab(f"dc_terrace_cap{sx:+d}", x0, x1, -4.1, -3.65, FL, FL + 0.12, stone, dc)
        wall(f"dc_fence{sx:+d}", (x0, -3.88), (x1, -3.88), FL + 0.12, FL + 1.02, fence, dc, tile=(3.0, 0.9), vr=(0, 1))

    # ── 현관 앞 둔덕: 화강암 테 + 회양목 + 반송 · 둥근 향나무 · 자연석 (광장 소품을 옮겨 심는다) ──
    cy = -19.0
    me = bpy.data.meshes.new("dc_mound_curb")
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=40, radius1=4.6, radius2=4.6, depth=0.35)
    for v in bm.verts:
        v.co += Vector((0, cy, 0.175))
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("dc_mound_curb", me)
    ob.data.materials.append(granite)
    bpy.context.collection.objects.link(ob)
    ob.parent = dc
    me = bpy.data.meshes.new("dc_mound")
    bm = bmesh.new()
    bmesh.ops.create_icosphere(bm, subdivisions=3, radius=1.0, calc_uvs=True)
    for v in list(bm.verts):
        v.co = Vector((v.co.x * 4.4, v.co.y * 4.4 + cy, max(v.co.z, 0) * 0.9 + 0.3))
    bm.to_mesh(me)
    bm.free()
    for poly in me.polygons:
        poly.use_smooth = True
    ob = bpy.data.objects.new("dc_mound", me)
    ob.data.materials.append(hedge)
    bpy.context.collection.objects.link(ob)
    ob.parent = dc

    def plant(kind, x, y, z, s, rot=0.0):
        mtx = Matrix.Translation((x, y, z)) @ Matrix.Rotation(rot, 4, "Z") @ Matrix.Scale(s, 4)
        for ch in props[kind].children:
            if ch.type != "MESH":
                continue
            c = ch.copy()
            c.data = ch.data.copy()
            c.data.transform(mtx @ ch.matrix_basis)
            c.matrix_basis = Matrix.Identity(4)
            c.name = f"dc_{kind}_{ch.name}"
            bpy.context.collection.objects.link(c)
            c.parent = dc

    plant("pine", 0.4, cy + 0.3, 0.9, 1.35, 0.6)
    plant("ball", 8.2, -12.5, FL + 0.1, 0.75, 0.4)  # 조형물 옆 둥근 향나무
    plant("ball", 3.4, -13.4, FL + 0.1, 0.45, 1.2)
    for k, (x, y, s) in enumerate([(-2.8, cy - 1.6, 0.75), (2.9, cy - 1.2, 0.8), (-1.2, cy - 3.0, 0.55), (1.6, cy - 3.0, 0.6), (-3.2, cy + 1.4, 0.65), (3.0, cy + 1.8, 0.7)]):
        plant("ball", x, y, 0.35, s, k)
    for k, (x, y, s, r) in enumerate([(-1.8, cy - 3.6, 0.9, 0.3), (0.3, cy - 3.9, 0.7, -0.2), (2.6, cy - 3.2, 1.0, 1.1), (-3.9, cy - 0.6, 0.8, 1.5), (3.8, cy + 0.2, 0.75, 1.9)]):
        plant("rock", x, y, 0.1, s, r)


def build_campus():
    reset()
    F = os.path.join(WORK, "facades")
    stone = plain_material("stone_white", (0.92, 0.91, 0.88), rough=0.5)
    roof_grey = plain_material("roof_grey", (0.36, 0.36, 0.37), rough=0.9)
    roof_blue = plain_material("roof_blue", (0.09, 0.13, 0.33), rough=0.55)
    roof_dark = plain_material("roof_dark", (0.18, 0.18, 0.2), rough=0.8)
    brick_flat = plain_material("photo_brick_plain", (0.42, 0.18, 0.13), rough=0.9)

    # ── 동산도서관: 정면 사진 54 × 30 m (앞 건물 27 m + 뒤로 물러난 윗부분) ──
    lib = building("bld_library")
    W, H, D = 54.0, 30.0, 32.0
    split = 27.0 / H
    face = photo_material("photo_library_face", f"{F}/library_face.png", alpha=True)
    tile = photo_material("photo_library_tile", f"{F}/library_tile.jpg")
    quad("photo_library_front", [(-W / 2, 0, 0), (W / 2, 0, 0), (W / 2, 0, 27), (-W / 2, 0, 27)], [(0, 0), (1, 0), (1, split), (0, split)], face, lib)
    quad("photo_library_top", [(-W / 2, 4, 27), (W / 2, 4, 27), (W / 2, 4, H), (-W / 2, 4, H)], [(0, split), (1, split), (1, 1), (0, 1)], face, lib)
    box_walls("photo_library", -W / 2 + 0.02, W / 2 - 0.02, 0.02, D, 0, 27, tile, lib, tile=(13.5, 16.0), front=False, roof_mat=roof_grey)
    box_walls("library_pent", -15.7, 15.7, 4.05, D - 6, 27, H - 0.1, brick_flat, lib, roof_mat=roof_grey, front=False)

    # ── 본관: 가운데 사진 34.5 × 25 m (포르티코·탑) + 양 날개 22 m(창 한 칸 반복) + 파란 지붕 ──
    mn = building("bld_main")
    W, H = 34.5, 25.0
    face = photo_material("photo_main_face", f"{F}/main_face.png", alpha=True)
    wing = photo_material("photo_main_wing", f"{F}/main_wing.jpg")
    quad("photo_main_front", [(-W / 2, 0, 0), (W / 2, 0, 0), (W / 2, 0, H), (-W / 2, 0, H)], [(0, 0), (1, 0), (1, 1), (0, 1)], face, mn)
    box_walls("photo_main_center", -W / 2, W / 2, 0.05, 16, 0, 10.5, wing, mn, tile=(1.38, 8.4), front=False)
    gable_roof("main_roof_c", -W / 2 - 0.4, W / 2 + 0.4, -0.3, 16.4, 10.5, 14.0, roof_blue, mn, along="x")
    box_walls("main_tower", -3.2, 3.2, 3, 9.4, 10.5, 16.5, brick_flat, mn, front=False, roof_mat=roof_grey)
    for sx in (-1, 1):
        x0, x1 = sorted((sx * W / 2, sx * (W / 2 + 22)))
        # 날개 정면: 창 한 칸(1.38 m)을 반복, 아래 3 m는 벽돌 바탕
        wall(f"photo_main_wing_front{sx:+d}", (x0, 0), (x1, 0), 3.0, 10.5, wing, mn, tile=(1.38, 8.4), vr=(0.0, 0.852))
        wall(f"photo_main_plinth{sx:+d}", (x0, 0), (x1, 0), 0, 3.0, brick_flat, mn)
        box_walls(f"photo_main_wing{sx:+d}", x0, x1, 0.05, 14, 0, 10.5, wing, mn, tile=(1.38, 8.4), front=False)
        gable_roof(f"main_roof{sx:+d}", x0 - 0.2, x1 + 0.2, -0.4, 14.4, 10.5, 13.0, roof_blue, mn, along="x")

    # ── 아담스채플관 (궁산 기슭, 1999) — 실측 m. 교차 검증한 명세(OSM 윤곽 75 × 25 m, 사진 비례)를 따른다.
    # 원점 = 가운데 박공 아래 남쪽 측랑 벽 선, 남쪽 지면(G0). X: 서쪽 끝 −35 … 동쪽 꼬리 43.5 (+X = 동북동).
    # 정면(남남동)은 Blender −Y. 높이: 측랑 처마 12.5, 본당 처마 17, 용마루 20, 가운데 박공 21.5, 탑 23, 돔 꼭대기 31.9.
    ad = building("bld_adams")
    a_aisle = lit_material("adams_aisle", f"{F}/adams_aisle.jpg")
    a_clere = lit_material("adams_clerestory", f"{F}/adams_clerestory.jpg")
    a_tower = lit_material("adams_tower", f"{F}/adams_tower.jpg")
    a_front = lit_material("adams_front", f"{F}/adams_front.png", alpha=True)
    a_drum = lit_material("adams_drum", f"{F}/adams_drum.jpg")
    a_brick = lit_material("adams_brick", f"{F}/adams_brick.jpg")
    roof_gg = plain_material("roof_greygreen", (0.11, 0.18, 0.15), rough=0.55, metal=0.2)
    roof_dk = plain_material("roof_charcoal", (0.045, 0.05, 0.05), rough=0.6)
    bronze = plain_material("dome_bronze", (0.058, 0.043, 0.033), rough=0.5, metal=0.3)
    paving = plain_material("terrace_paving", (0.6, 0.58, 0.53), rough=0.9)
    white = plain_material("stone_trim", (0.77, 0.75, 0.69), rough=0.6)

    def cone(name, x, y, z, r, h, seg=4, mat=None):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=seg, radius1=r, radius2=0.0, depth=h)
        if seg == 4:
            bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.pi / 4, 3, "Z"))
        for v in bm.verts:
            v.co += Vector((x, y, z + h / 2))
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(mat or white)
        bpy.context.collection.objects.link(ob)
        ob.parent = ad

    def lean_to(name, x0, x1, y_low, y_high, z_low, z_high, mat):
        """측랑 홑지붕 (y_low 쪽 처마 z_low → y_high 쪽 z_high)."""
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        v = [bm.verts.new(p) for p in [(x0, y_low, z_low), (x1, y_low, z_low), (x1, y_high, z_high), (x0, y_high, z_high)]]
        bm.faces.new(v)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        if bm.faces[0].normal.z < 0:
            bm.faces[0].normal_flip()
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(name, me)
        ob.data.materials.append(mat)
        bpy.context.collection.objects.link(ob)
        ob.parent = ad

    def hall(name, x0, x1):
        """측랑(남·북) + 채광층 + 본당 지붕 한 구간."""
        wall(f"{name}_south", (x0, 0), (x1, 0), 0, 12.5, a_aisle, ad, tile=(5.0, 12.5))
        wall(f"{name}_north", (x1, 24), (x0, 24), 0, 12.5, a_aisle, ad, tile=(5.0, 12.5))
        wall(f"{name}_clere_s", (x0, 5), (x1, 5), 12.5, 17, a_clere, ad, tile=(5.0, 4.5), vr=(0, 1))
        wall(f"{name}_clere_n", (x1, 19), (x0, 19), 12.5, 17, a_clere, ad, tile=(5.0, 4.5), vr=(0, 1))
        lean_to(f"{name}_aisle_s", x0, x1, -0.5, 5, 12.4, 13.3, roof_dk)
        lean_to(f"{name}_aisle_n", x0, x1, 24.5, 19, 12.4, 13.3, roof_dk)
        gable_roof(f"{name}_nave", x0, x1, 4.6, 19.4, 17, 20, roof_gg, ad, along="x")
        # 흰 버팀 기둥 머리 (측랑 처마 위로 1.8 m, 칸마다)
        k = 0
        x = x0
        while x <= x1 + 0.01:
            cone(f"{name}_pin{k}", x + 0.4, -0.25, 12.5, 0.55, 1.8)
            x += 5.0
            k += 1

    def tower(name, x0, x1, y0=-0.5, y1=6.0, h=20.0, peak=23.0):
        box_walls(name, x0, x1, y0, y1, 0, h, a_tower, ad, tile=(x1 - x0, 20.0))
        gable_roof(f"{name}_cap", x0 - 0.3, x1 + 0.3, y0 - 0.3, y1 + 0.3, h, peak, roof_dk, ad, along="y")
        xm = (x0 + x1) / 2
        for yy, nm in ((y0 - 0.32, "s"), (y1 + 0.32, "n")):  # 남·북 박공 삼각형 (벽돌) + 흰 박공 테두리
            tri = bpy.data.meshes.new(f"{name}_gable_{nm}")
            bm = bmesh.new()
            vs = [bm.verts.new(p) for p in [(x0, yy, h), (x1, yy, h), (xm, yy, peak - 0.1)]]
            f = bm.faces.new(vs if nm == "s" else list(reversed(vs)))
            uvl = bm.loops.layers.uv.new("UVMap")
            for lp in f.loops:
                lp[uvl].uv = (lp.vert.co.x / 4, lp.vert.co.z / 4)
            bm.normal_update()
            bm.to_mesh(tri)
            bm.free()
            ob = bpy.data.objects.new(f"{name}_gable_{nm}", tri)
            ob.data.materials.append(a_brick)
            bpy.context.collection.objects.link(ob)
            ob.parent = ad
            for sgn in (-1, 1):
                e = bpy.data.meshes.new(f"{name}_rake_{nm}{sgn:+d}")
                bm = bmesh.new()
                bmesh.ops.create_cube(bm, size=1.0)
                L = math.hypot((x1 - x0) / 2, peak - h) + 0.3
                for v in bm.verts:
                    v.co.x *= L
                    v.co.y *= 0.4
                    v.co.z *= 0.35
                ang = math.atan2(peak - h, (x1 - x0) / 2) * sgn
                bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(ang, 3, "Y"))
                for v in bm.verts:
                    v.co += Vector((xm + sgn * (x1 - x0) / 4, yy + (-0.08 if nm == "s" else 0.08), h + (peak - h) / 2))
                bm.to_mesh(e)
                bm.free()
                ob = bpy.data.objects.new(f"{name}_rake_{nm}{sgn:+d}", e)
                ob.data.materials.append(white)
                bpy.context.collection.objects.link(ob)
                ob.parent = ad

    # 서쪽 탑 + 탑 뒤 덩어리, 서쪽 본당
    tower("adams_tower_w", -35.0, -28.5)
    box_walls("adams_back_w", -35.0, -28.5, 6.0, 24.0, 0, 16.0, a_brick, ad, tile=(4, 4), front=False)
    gable_roof("adams_back_w_roof", -35.3, -28.2, 6.0, 24.3, 16.0, 19.0, roof_dk, ad, along="y")
    hall("adams_hall_w", -28.5, -5.5)
    hall("adams_hall_e", 5.5, 25.5)
    # 가운데: 돌출 박공(폭 11 m, 4 m 앞으로) + 본당을 잇는 몸체
    quad("adams_front", [(-5.5, -4, 0), (5.5, -4, 0), (5.5, -4, 21.5), (-5.5, -4, 21.5)], [(0, 0), (1, 0), (1, 1), (0, 1)], a_front, ad)
    wall("adams_front_side_w", (-5.5, 0), (-5.5, -4), 0, 17.5, a_brick, ad, tile=(4, 4))
    wall("adams_front_side_e", (5.5, -4), (5.5, 0), 0, 17.5, a_brick, ad, tile=(4, 4))
    box_walls("adams_center", -5.5, 5.5, 0, 24, 0, 17, a_brick, ad, tile=(4, 4), front=False)
    gable_roof("adams_center_roof", -5.9, 5.9, -4.3, 5.5, 17.5, 21.5, roof_gg, ad, along="y")
    gable_roof("adams_center_nave", -5.5, 5.5, 4.6, 19.4, 17, 20, roof_gg, ad, along="x")
    for sx in (-1, 1):  # 박공 양옆 흰 돌 기둥 → 뾰족탑
        slab(f"adams_pier{sx:+d}", sx * 4.8 - 0.7, sx * 4.8 + 0.7, -4.5, -3.2, 0, 21.0, stone, ad, 0.03)
        cone(f"adams_pier_pin{sx:+d}", sx * 4.8, -3.85, 21.0, 0.9, 1.6)
    # 동쪽: 탑 E1 · 낮은 연결부 · 탑 E2 · 뒤 덩어리 · 낮은 꼬리
    tower("adams_tower_e1", 25.5, 31.5)
    wall("adams_link_s", (31.5, 0), (34.0, 0), 0, 16.0, a_brick, ad, tile=(4, 4))
    gable_roof("adams_link_roof", 31.3, 34.2, -0.3, 6.3, 16.0, 18.0, roof_dk, ad, along="y")
    tower("adams_tower_e2", 34.0, 40.5)
    box_walls("adams_back_e", 25.5, 40.5, 6.0, 24.0, 0, 16.0, a_brick, ad, tile=(4, 4), front=False)
    gable_roof("adams_back_e_roof", 25.2, 40.8, 5.7, 24.3, 16.0, 19.0, roof_gg, ad, along="x")
    box_walls("adams_tail", 40.5, 43.5, 0.0, 14.0, 0, 11.0, a_aisle, ad, tile=(5.0, 12.5), roof_mat=roof_dk)
    for (x0, x1, y0, y1) in ((40.4, 43.6, -0.1, 0.2), (43.3, 43.6, -0.1, 14.1)):
        slab("adams_tail_rail", x0, x1, y0, y1, 11.0, 12.0, white, ad)

    # 돔: 벽돌 받침(13 m) + 흰 난간·모서리 뾰족탑 → 흰 드럼(지름 9.5 m, 아치 창 14) → 흰 띠 → 청동빛 돔 → 랜턴 → 피뢰침
    cyc = 12.0
    box_walls("adams_dome_base", -6.5, 6.5, cyc - 6.5, cyc + 6.5, 17.0, 22.0, a_brick, ad, tile=(4, 4), roof_mat=paving)
    for (x0, x1, y0, y1) in ((-6.5, 6.5, cyc - 6.5, cyc - 6.25), (-6.5, 6.5, cyc + 6.25, cyc + 6.5), (-6.5, -6.25, cyc - 6.5, cyc + 6.5), (6.25, 6.5, cyc - 6.5, cyc + 6.5)):
        slab("adams_balustrade", x0, x1, y0, y1, 22.0, 22.9, white, ad)
    for sx in (-1, 1):
        for sy in (-1, 1):
            slab(f"adams_dpier{sx:+d}{sy:+d}", sx * 6.5 - 0.6, sx * 6.5 + 0.6, cyc + sy * 6.5 - 0.6, cyc + sy * 6.5 + 0.6, 17.0, 23.5, stone, ad)
            cone(f"adams_dpin{sx:+d}{sy:+d}", sx * 6.5, cyc + sy * 6.5, 23.5, 0.8, 1.6)

    def ring(name, r, z0, z1, mat, seg=32, tile=None):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        uvl = bm.loops.layers.uv.new("UVMap")
        bot, top = [], []
        for k in range(seg + 1):
            a = k / seg * math.tau
            bot.append(bm.verts.new((math.cos(a) * r, cyc + math.sin(a) * r, z0)))
            top.append(bm.verts.new((math.cos(a) * r, cyc + math.sin(a) * r, z1)))
        circ = math.tau * r
        for k in range(seg):
            f = bm.faces.new([bot[k], bot[k + 1], top[k + 1], top[k]])
            for lp in f.loops:
                kk = k if lp.vert in (bot[k], top[k]) else k + 1
                u = (kk / seg) * (circ / tile[0] if tile else 1)
                v = 0 if lp.vert in bot else (1 if not tile else (z1 - z0) / tile[1])
                lp[uvl].uv = (u, v)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = ad
        return ob

    ring("adams_drum", 4.75, 22.0, 25.5, a_drum, seg=28, tile=(math.tau * 4.75 / 14, 3.5))
    ring("adams_drum_cornice", 5.05, 25.5, 25.85, white, seg=40)
    dome = bpy.data.meshes.new("adams_dome")
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=40, v_segments=16, radius=4.75)
    for v in list(bm.verts):
        if v.co.z < -0.01:
            bm.verts.remove(v)
    for v in bm.verts:
        a = math.atan2(v.co.y, v.co.x)
        k = 1 - 0.022 * (1 - abs(math.cos(a * 10)))  # 갈빗대 20개
        v.co.x *= k
        v.co.y *= k
        v.co.z = v.co.z * (6.0 / 4.75) + 25.85
        v.co.y += cyc
    bm.to_mesh(dome)
    bm.free()
    for p in dome.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new("adams_dome", dome)
    ob.data.materials.append(bronze)
    bpy.context.collection.objects.link(ob)
    ob.parent = ad
    ring("adams_lantern", 0.75, 31.5, 33.2, bronze, seg=16)
    cone("adams_lantern_cap", 0, cyc, 33.2, 0.9, 0.7, seg=16, mat=bronze)
    slab("adams_rod", -0.05, 0.05, cyc - 0.05, cyc + 0.05, 33.9, 36.0, roof_dk, ad)

    # 남쪽 반원 테라스 (반지름 16, 위 5 m) + 흰 난간 + 남쪽 계단
    me = bpy.data.meshes.new("adams_terrace")
    bm = bmesh.new()
    seg = 32
    rim_b, rim_t = [], []
    for k in range(seg + 1):
        a = math.pi + k / seg * math.pi  # y < 0 (정면 쪽) 반원
        rim_b.append(bm.verts.new((math.cos(a) * 16, math.sin(a) * 16, 0)))
        rim_t.append(bm.verts.new((math.cos(a) * 16, math.sin(a) * 16, 5)))
    for k in range(seg):
        bm.faces.new([rim_b[k], rim_b[k + 1], rim_t[k + 1], rim_t[k]])
    bm.faces.new(rim_t)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    uvl = bm.loops.layers.uv.new("UVMap")
    for f in bm.faces:
        for lp in f.loops:
            c = lp.vert.co
            lp[uvl].uv = ((c.x + c.y) / 4, c.z / 4 if abs(f.normal.z) < 0.5 else c.y / 4)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("adams_terrace", me)
    ob.data.materials.append(a_brick)
    ob.data.materials.append(paving)
    for p in ob.data.polygons:
        p.material_index = 1 if abs(p.normal.z) > 0.5 else 0
    bpy.context.collection.objects.link(ob)
    ob.parent = ad
    ring_b = bpy.data.meshes.new("adams_terrace_rail")
    bm = bmesh.new()
    inner, outer, inner_t, outer_t = [], [], [], []
    for k in range(seg + 1):
        a = math.pi + k / seg * math.pi
        for lst, r, z in ((inner, 15.75, 5), (outer, 16.0, 5), (inner_t, 15.75, 6.1), (outer_t, 16.0, 6.1)):
            lst.append(bm.verts.new((math.cos(a) * r, math.sin(a) * r, z)))
    for k in range(seg):
        if abs(math.cos(math.pi + (k + 0.5) / seg * math.pi)) < 0.14:
            continue  # 계단 자리 비움
        bm.faces.new([outer[k], outer[k + 1], outer_t[k + 1], outer_t[k]])
        bm.faces.new([inner[k + 1], inner[k], inner_t[k], inner_t[k + 1]])
        bm.faces.new([outer_t[k], outer_t[k + 1], inner_t[k + 1], inner_t[k]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(ring_b)
    bm.free()
    ob = bpy.data.objects.new("adams_terrace_rail", ring_b)
    ob.data.materials.append(white)
    bpy.context.collection.objects.link(ob)
    ob.parent = ad
    for i in range(10):  # 계단 (너비 4.5 m, 반원 앞에서 아래로)
        slab(f"adams_step{i}", -2.25, 2.25, -16 - (i + 1) * 0.8, -16 - i * 0.8, 0, 5 - i * 0.5, paving, ad)

    # ── 전산교육원(정보전산원) — 광장 동쪽 가장자리, 약 28 × 30 m 3층 붉은 벽돌 + 주황 기와 모임지붕 ──
    ed = building("bld_edu")
    ed_floors = photo_material("photo_edu_floors", f"{F}/main_floors.jpg")
    roof_terra = plain_material("roof_terracotta", (0.42, 0.13, 0.06), rough=0.7)
    box_walls("photo_edu", -14, 14, 0, 30, 0, 9.56, ed_floors, ed, tile=(1.38, 6.37))  # 3층 (창 두 층 무늬 1.5장)
    hip_roof("edu_roof", -14, 14, 0, 30, 9.56, 14.5, roof_terra, ed, overhang=0.9)

    # ── 계명한학촌 (도서관과 채플 사이 비탈) — 돌 기단 + 흰 벽·나무 기둥 + 짙은 기와 모임지붕 한옥 세 채 ──
    hk = building("bld_hanok")
    plaster = plain_material("hanok_wall", (0.78, 0.74, 0.66), rough=0.9)
    timber = plain_material("hanok_timber", (0.22, 0.12, 0.06), rough=0.8)
    giwa = plain_material("roof_giwa", (0.055, 0.06, 0.07), rough=0.6)
    for k, (cx, cy, w, d, rot) in enumerate([(0, 0, 17, 8, 0), (-12, 10, 12, 6.5, math.pi / 2), (12, 10, 12, 6.5, math.pi / 2)]):
        e = bpy.data.objects.new(f"hanok_{k}", None)
        bpy.context.collection.objects.link(e)
        e.parent = hk
        e.location = (cx, cy, 0)
        e.rotation_euler.z = rot
        slab(f"hanok_{k}_base", -w / 2 - 1.2, w / 2 + 1.2, -d / 2 - 1.2, d / 2 + 1.2, 0, 0.9, stone, e)
        box_walls(f"hanok_{k}_wall", -w / 2, w / 2, -d / 2, d / 2, 0.9, 4.2, plaster, e)
        for x in [(-w / 2) + i * w / 4 for i in range(5)]:
            for y in (-d / 2 - 0.05, d / 2 + 0.05):
                slab(f"hanok_{k}_post_{x:.1f}_{y:.1f}", x - 0.15, x + 0.15, y - 0.15, y + 0.15, 0.9, 4.2, timber, e)
        slab(f"hanok_{k}_beam_f", -w / 2 - 0.1, w / 2 + 0.1, -d / 2 - 0.2, -d / 2 + 0.1, 3.8, 4.3, timber, e)
        hip_roof(f"hanok_{k}_roof", -w / 2, w / 2, -d / 2, d / 2, 4.2, 7.4, giwa, e, overhang=1.8)

    # ── 광장 양옆 건물 (영상 속 녹색 지붕 붉은 벽돌 건물) ──
    roof_green = plain_material("roof_green", (0.22, 0.38, 0.3), rough=0.6)
    lib_tile = bpy.data.materials["photo_library_tile"]
    sw = building("bld_side_w")  # 4층, 도서관 창 무늬
    box_walls("photo_side_w", -28, 28, 0, 16, 0, 16, lib_tile, sw, tile=(13.5, 16.0))
    gable_roof("side_w_roof", -28.4, 28.4, -0.4, 16.4, 16, 20.5, roof_green, sw, along="x")

    # ── 광장 소품: 다듬은 반송 · 둥근 향나무 · 자연석 표석 ──
    hedge = pbr_material("hedge", os.path.join(OUT, "tex", "hedge_diffuse.jpg"), os.path.join(OUT, "tex", "hedge_nor_gl.jpg"), None, rough=0.85)
    pine_bark = bark_material("pine")
    rock = pbr_material("rock", os.path.join(OUT, "tex", "granite_diffuse.jpg"), os.path.join(OUT, "tex", "granite_nor_gl.jpg"), None, rough=0.8)
    rock.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.55, 0.54, 0.52, 1)
    rnd = np.random.default_rng(12)

    def blob(name, center, scale, subdiv, jitter, mat, parent):
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_icosphere(bm, subdivisions=subdiv, radius=1.0, calc_uvs=True)
        for v in bm.verts:
            k = 1 + (rnd.random() - 0.5) * 2 * jitter
            v.co = Vector((v.co.x * scale[0] * k, v.co.y * scale[1] * k, v.co.z * scale[2] * k)) + Vector(center)
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = parent
        return ob

    def limb(name, a, b, r0, r1, mat, parent):
        a, b = Vector(a), Vector(b)
        d = b - a
        me = bpy.data.meshes.new(name)
        bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=False, segments=10, radius1=r0, radius2=r1, depth=d.length, calc_uvs=True)
        rot = d.to_track_quat("Z", "Y").to_matrix().to_4x4()
        for v in bm.verts:
            v.co = rot @ Vector((v.co.x, v.co.y, v.co.z + d.length / 2)) + a
        bm.to_mesh(me)
        bm.free()
        for p in me.polygons:
            p.use_smooth = True
        me.materials.append(mat)
        ob = bpy.data.objects.new(name, me)
        bpy.context.collection.objects.link(ob)
        ob.parent = parent
        return ob

    tp = building("prop_topiary_pine")  # 구름처럼 층층이 다듬은 반송 (높이 ≈ 4 m)
    trunk = [(0, 0, 0), (0.25, 0.05, 0.9), (-0.15, 0.1, 1.8), (0.1, -0.05, 2.7), (0.0, 0.0, 3.4)]
    for i in range(len(trunk) - 1):
        limb(f"tp_trunk{i}", trunk[i], trunk[i + 1], 0.2 - i * 0.035, 0.2 - (i + 1) * 0.035, pine_bark, tp)
    pads = [(-1.35, 0.3, 1.85, 1.25), (1.25, -0.35, 2.25, 1.15), (-0.8, -1.0, 2.75, 0.95), (0.75, 0.85, 3.0, 0.95), (0.05, 0.0, 3.65, 0.9)]
    for i, (x, y, z, r) in enumerate(pads):
        base = trunk[min(int(z / 0.9), 3)]
        limb(f"tp_branch{i}", base, (x * 0.8, y * 0.8, z - 0.15), 0.08, 0.04, pine_bark, tp)
        blob(f"tp_pad{i}", (x, y, z), (r, r * 0.9, r * 0.38), 3, 0.1, hedge, tp)
    tb = building("prop_topiary_ball")  # 둥글게 다듬은 향나무 (반지름 1 m, 웹에서 크기 조절)
    blob("tb_ball", (0, 0, 0.85), (1.0, 1.0, 0.85), 3, 0.06, hedge, tb)
    rk = building("prop_rock")  # 자연석 표석 (웹에서 크기 조절)
    blob("rock_body", (0, 0, 0.95), (0.8, 0.32, 1.0), 2, 0.14, rock, rk)

    # ── 정문: 가운데 박공 현관(기둥 2×2쌍) + 양쪽 열주랑 (현관과 열주랑 사이로 차도가 지난다) ──
    gt = building("bld_gate")
    colH, colR = 8.2, 0.55
    for sx in (-1, 1):
        for x in (5.6, 7.4):
            for y in (-1.8, 1.8):
                fluted_column(f"gate_col{sx:+d}_{x}_{y}", colR, colH, gt, (sx * x, y, 0), stone)
    top = colH
    slab("gate_architrave", -8.6, 8.6, -2.6, 2.6, top, top + 0.7, stone, gt, 0.03)
    slab("gate_frieze", -8.5, 8.5, -2.5, 2.5, top + 0.7, top + 1.5, stone, gt)
    slab("gate_cornice", -8.9, 8.9, -2.9, 2.9, top + 1.5, top + 1.9, stone, gt, 0.05)
    pediment("gate_pediment", -8.9, 8.9, -2.9, 2.9, top + 1.9, 3.1, stone, gt)
    wH, wR = 6.4, 0.42
    for sx in (-1, 1):
        for k in range(6):
            x = sx * (16.0 + k * 2.9)
            for y in (-1.3, 1.3):
                fluted_column(f"gate_wcol{sx:+d}_{k}_{y}", wR, wH, gt, (x, y, 0), stone, flutes=16)
        x0, x1 = sorted((sx * 15.2, sx * 31.3))
        slab(f"gate_wing_arch{sx:+d}", x0, x1, -1.9, 1.9, wH, wH + 0.55, stone, gt, 0.03)
        slab(f"gate_wing_frieze{sx:+d}", x0 + 0.1, x1 - 0.1, -1.8, 1.8, wH + 0.55, wH + 1.1, stone, gt)
        slab(f"gate_wing_cornice{sx:+d}", x0 - 0.3, x1 + 0.3, -2.1, 2.1, wH + 1.1, wH + 1.45, stone, gt, 0.04)
        slab(f"gate_wing_step{sx:+d}", x0 - 0.5, x1 + 0.5, -2.3, 2.3, -0.1, 0.15, stone, gt)
    # 정문 글자 자리 (웹에서 '계명대학교'를 새긴다)
    e = empty("gate_text", (0, -2.52, top + 1.1))
    e.parent = gt

    build_dongcheon(F, stone, roof_green, hedge, rock, {"pine": tp, "ball": tb, "rock": rk})

    roots = [o.name for o in bpy.data.objects if o.type == "EMPTY" and o.parent is None and o.name.startswith(("bld_", "prop_"))]
    for n in roots:
        join_by_material(bpy.data.objects[n])
    if "--dongcheon" in opts:  # 동천관만 따로 (Draco 없이) → dongcheon_update.py 가 지금 campus.glb 에 끼워 넣는다
        dc = bpy.data.objects["bld_dongcheon"]
        export(opts["--dongcheon"], [dc, *dc.children_recursive], draco=False)
        return
    export(os.path.join(OUT, "campus.glb"), [o for o in bpy.data.objects])
    if "--preview" in opts:
        for o in bpy.data.objects:
            if o.parent is None and o.type == "EMPTY" and o.name.startswith("bld_"):
                pos = {"bld_library": (0, 60, 0), "bld_main": (80, 40, 0), "bld_adams": (-60, 170, 0), "bld_edu": (45, 50, 0), "bld_hanok": (-50, 90, 0), "bld_side_w": (-45, 20, 0), "bld_dongcheon": (60, 0, 0), "bld_gate": (0, -20, 0)}
                rot = {"bld_library": 0, "bld_main": math.pi / 2, "bld_adams": -0.3, "bld_edu": math.pi / 2, "bld_hanok": -0.4, "bld_side_w": -math.pi / 2, "bld_dongcheon": math.pi / 2, "bld_gate": 0}
                o.location = pos[o.name]
                o.rotation_euler.z = rot[o.name]
            elif o.parent is None and o.type == "EMPTY" and o.name.startswith("prop_"):
                o.location = {"prop_topiary_pine": (-8, 0, 0), "prop_topiary_ball": (8, 0, 0), "prop_rock": (4, -4, 0)}[o.name]
        render_preview(opts["--preview"], target=(0, 30, 10), cam=(0, -60, 8))


if __name__ == "__main__":
    what = opts.get("--only", "all")
    if what in ("all", "fountain"):
        build_fountain()
    if what in ("all", "trees"):
        build_trees()
    if what in ("all", "campus"):
        build_campus()
