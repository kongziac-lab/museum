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
from mathutils import Vector

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
        bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
        for ob in imported:
            ob.data.uv_layers[0].name = "UVMap"
            if ob.name.endswith("_bark"):
                for p in ob.data.polygons:
                    p.use_smooth = True
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


def export(path, objs):
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
        export_draco_mesh_compression_enable=True,
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


def gable_roof(name, x0, x1, y0, y1, z0, ridge, mat, parent, along="y"):
    """박공지붕 (along 방향으로 용마루)."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    if along == "y":
        xm = (x0 + x1) / 2
        v = [bm.verts.new(p) for p in [(x0, y0, z0), (xm, y0, ridge), (x1, y0, z0), (x0, y1, z0), (xm, y1, ridge), (x1, y1, z0)]]
    else:
        ym = (y0 + y1) / 2
        v = [bm.verts.new(p) for p in [(x0, y0, z0), (x0, ym, ridge), (x0, y1, z0), (x1, y0, z0), (x1, ym, ridge), (x1, y1, z0)]]
    for f in [(0, 1, 2), (5, 4, 3), (0, 3, 4, 1), (1, 4, 5, 2)]:
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

    # ── 광장 양옆 건물 (영상 속 녹색 지붕 붉은 벽돌 건물) ──
    roof_green = plain_material("roof_green", (0.22, 0.38, 0.3), rough=0.6)
    lib_tile = bpy.data.materials["photo_library_tile"]
    floors = photo_material("photo_main_floors", f"{F}/main_floors.jpg")
    sw = building("bld_side_w")  # 4층, 도서관 창 무늬
    box_walls("photo_side_w", -28, 28, 0, 16, 0, 16, lib_tile, sw, tile=(13.5, 16.0))
    gable_roof("side_w_roof", -28.4, 28.4, -0.4, 16.4, 16, 20.5, roof_green, sw, along="x")
    se = building("bld_side_e")  # 4층, 본관 날개 창 무늬
    box_walls("photo_side_e", -24, 24, 0, 14, 0, 12.74, floors, se, tile=(1.38, 6.37))
    gable_roof("side_e_roof", -24.4, 24.4, -0.4, 14.4, 12.74, 16.5, roof_green, se, along="x")

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

    export(os.path.join(OUT, "campus.glb"), [o for o in bpy.data.objects])
    if "--preview" in opts:
        for o in bpy.data.objects:
            if o.parent is None and o.type == "EMPTY" and o.name.startswith("bld_"):
                pos = {"bld_library": (0, 60, 0), "bld_main": (-70, 150, 15), "bld_side_w": (-45, 20, 0), "bld_side_e": (45, 20, 0), "bld_gate": (0, -20, 0)}
                rot = {"bld_library": 0, "bld_main": -0.4, "bld_side_w": -math.pi / 2, "bld_side_e": math.pi / 2, "bld_gate": 0}
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
