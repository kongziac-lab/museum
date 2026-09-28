"""
광장 가장자리 느티나무 (사진 IMG_4006 · 4015 · 영상): 낮게 갈라지는 줄기와 넓고 빽빽한 둥근 수관.
trees.glb 에 zelkova_a · zelkova_b (각각 _bark · _leaves) 를 더한다 (Blender 4.2 / bpy).

  npx @gltf-transform/cli copy public/scenery/trees.glb $W/trees_raw.glb
  python3 scripts/scenery/zelkova.py -- --src $W/trees_raw.glb --leaf $W/zelkova_leaves.png --out $W/trees_new.glb
  npx @gltf-transform/cli webp $W/trees_new.glb $W/trees_webp.glb --quality 88
  npx @gltf-transform/cli draco $W/trees_webp.glb public/scenery/trees.glb

잎 텍스처(zelkova_leaves.png)는 scripts/scenery/zelkova_leaf.py 로 그린다.
"""

import math
import random
import sys

import bpy  # noqa: E402
import bmesh  # noqa: E402
from mathutils import Matrix, Vector  # noqa: E402

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
args = dict(zip(argv[::2], argv[1::2]))


def log(*a):
    print("[zelkova]", *a, flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args["--src"])
for name in [o.name for o in bpy.data.objects if o.name.startswith("zelkova_")]:
    bpy.data.objects.remove(bpy.data.objects[name])  # 다시 돌려도 두 벌이 되지 않게

BARK = bpy.data.materials["bark_oak"]
LEAF = bpy.data.materials.new("leaves_zelkova")
LEAF.use_nodes = True
nt = LEAF.node_tree
bsdf = nt.nodes["Principled BSDF"]
tex = nt.nodes.new("ShaderNodeTexImage")
tex.image = bpy.data.images.load(args["--leaf"])
nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
nt.links.new(tex.outputs["Alpha"], bsdf.inputs["Alpha"])
bsdf.inputs["Roughness"].default_value = 0.8
if hasattr(LEAF, "blend_method"):
    LEAF.blend_method = "CLIP"


def tube(points, radii, name):
    """점과 굵기로 가지 하나 (끝이 가늘어지는 관)"""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = 1.0
    cu.bevel_resolution = 2
    cu.use_fill_caps = True
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, c, r in zip(sp.points, points, radii):
        p.co = (*c, 1)
        p.radius = r
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    return ob


def build(name, seed, height, spread, limbs, cards):
    rnd = random.Random(seed)
    parts = []
    # 줄기: 2.2 m 에서 갈라진다
    split = 2.0 + rnd.random() * 0.6
    parts.append(tube([(0, 0, -0.2), (0, 0, split * 0.5), (0.05, 0.02, split + 0.3)], [0.36, 0.3, 0.26], f"{name}_trunk"))
    ctr = Vector((0, 0, split + (height - split) * 0.5))
    rx, rz = spread, (height - split) * 0.46

    def fit(a, b, k=0.9):
        """a→b 가지가 수관 타원체(k 배) 밖으로 나가면 b 를 안쪽으로 당긴다"""
        for _ in range(12):
            q = b - ctr
            if (q.x / rx) ** 2 + (q.y / rx) ** 2 + (q.z / rz) ** 2 <= k * k:
                break
            b = a + (b - a) * 0.88
        return b

    tips = []
    for i in range(limbs):
        az = i / limbs * 2 * math.pi + rnd.uniform(-0.35, 0.35)
        el = math.radians(rnd.uniform(48, 66))  # 수평에서 올라간 각
        length = rnd.uniform(0.62, 0.8) * height
        d = Vector((math.cos(az) * math.cos(el), math.sin(az) * math.cos(el), math.sin(el)))
        base = Vector((0, 0, split + rnd.uniform(-0.2, 0.3)))
        end = fit(base, base + d * length + Vector((math.cos(az), math.sin(az), 0)) * spread * 0.18)
        length = (end - base).length
        d = (end - base).normalized()
        pts, rs = [], []
        for k in range(6):
            t = k / 5
            p = base + d * length * t
            pts.append(tuple(p))
            rs.append(0.19 * (1 - 0.8 * t) + 0.02)
        parts.append(tube(pts, rs, f"{name}_limb{i}"))
        tips.append(Vector(pts[-1]))
        # 곁가지 둘
        for j in range(2):
            t0 = rnd.uniform(0.45, 0.75)
            s = base + d * length * t0
            az2 = az + rnd.choice((-1, 1)) * rnd.uniform(0.5, 0.9)
            el2 = math.radians(rnd.uniform(25, 50))
            d2 = Vector((math.cos(az2) * math.cos(el2), math.sin(az2) * math.cos(el2), math.sin(el2)))
            l2 = length * rnd.uniform(0.25, 0.38)
            e = fit(s, s + d2 * l2)
            l2 = (e - s).length
            parts.append(tube([tuple(s), tuple(s + d2 * l2 * 0.5), tuple(e)], [0.07, 0.045, 0.02], f"{name}_twig{i}{j}"))
            tips.append(e)
    # 가지를 메시로 합친다
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.convert(target="MESH")
    bpy.ops.object.join()
    bark = bpy.context.active_object
    bark.name = f"{name}_bark"
    bark.data.materials.clear()
    bark.data.materials.append(BARK)
    for poly in bark.data.polygons:
        poly.use_smooth = True
    # 원통 투영 UV (나무껍질)
    bm = bmesh.new()
    bm.from_mesh(bark.data)
    uv = bm.loops.layers.uv.verify()
    for f in bm.faces:
        for lp in f.loops:
            co = lp.vert.co
            lp[uv].uv = (math.atan2(co.y, co.x) / math.pi, co.z * 0.5)
    bm.to_mesh(bark.data)
    bm.free()

    # 수관: 가지 끝을 감싸는 넓은 반구에 잎 뭉치 카드를 촘촘히 (겉에 몰리게)
    bm = bmesh.new()
    uv = bm.loops.layers.uv.verify()
    n = 0
    while n < cards:
        v = Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.45, 1)))
        r = v.length
        if r > 1 or r < 0.001:
            continue
        # 겉 껍질 쪽이 빽빽하게 (0.55 ~ 1), 속은 드문드문
        if r < 0.55 and rnd.random() > 0.25:
            continue
        # 가지 끝 근처를 조금 더
        p = ctr + Vector((v.x * rx, v.y * rx, v.z * rz))
        if min((p - t).length for t in tips) > spread * 0.95 and rnd.random() < 0.5:
            continue
        size = rnd.uniform(1.15, 1.7)
        out = (p - ctr).normalized() if (p - ctr).length > 0.1 else Vector((0, 0, 1))
        nrm = (out * 0.7 + Vector((rnd.uniform(-1, 1), rnd.uniform(-1, 1), rnd.uniform(-0.3, 1))) * 0.6).normalized()
        rot = nrm.to_track_quat("Z", "Y").to_matrix().to_4x4() @ Matrix.Rotation(rnd.uniform(0, 2 * math.pi), 4, "Z")
        corners = [Vector((-0.5, -0.5, 0)), Vector((0.5, -0.5, 0)), Vector((0.5, 0.5, 0)), Vector((-0.5, 0.5, 0))]
        verts = [bm.verts.new(p + (rot @ (c * size).to_4d()).to_3d()) for c in corners]
        f = bm.faces.new(verts)
        flip = rnd.random() < 0.5
        for lp, (u, w) in zip(f.loops, [(0, 0), (1, 0), (1, 1), (0, 1)]):
            lp[uv].uv = (1 - u if flip else u, w)
        n += 1
    me = bpy.data.meshes.new(f"{name}_leaves")
    bm.to_mesh(me)
    bm.free()
    leaves = bpy.data.objects.new(f"{name}_leaves", me)
    bpy.context.collection.objects.link(leaves)
    me.materials.append(LEAF)
    log(name, "bark", len(bark.data.polygons), "cards", cards, "height", height)
    return bark, leaves


made = []
made += build("zelkova_a", 7, 11.0, 7.4, 5, 1500)
made += build("zelkova_b", 19, 12.0, 6.6, 4, 1400)

if "--preview" in args:
    for ob in bpy.data.objects:
        ob.hide_render = ob not in made or not ob.name.startswith("zelkova_a")
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    sc.cycles.samples = 32
    sc.render.resolution_x, sc.render.resolution_y = 900, 700
    w = bpy.data.worlds.new("w")
    w.use_nodes = True
    w.node_tree.nodes["Background"].inputs["Color"].default_value = (0.75, 0.82, 0.9, 1)
    sc.world = w
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3.5
    sun.rotation_euler = (math.radians(45), 0, math.radians(30))
    bpy.context.collection.objects.link(sun)
    cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
    cam.data.lens = 28
    cam.location = (0, -22, 3.5)
    cam.rotation_euler = (Vector((0, 0, 6)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.collection.objects.link(cam)
    sc.camera = cam
    sc.render.filepath = args["--preview"]
    bpy.ops.render.render(write_still=True)
    raise SystemExit(0)

bpy.ops.export_scene.gltf(filepath=args["--out"], export_format="GLB", export_image_format="AUTO", export_apply=True, export_yup=True)
log("wrote", args["--out"])
