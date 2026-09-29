"""
campus.glb 의 건물 몇 채를 새 모델로 바꾼다 (Blender). 다른 건물·조형물은 그대로.

build_scenery.py --export 로 따로 내보낸 건물 모델(--add)에 든 bld_* 와 같은 이름의 건물,
그리고 --drop 으로 준 옛 이름(쉼표로 여럿)을 campus.glb 에서 지우고 새 모델을 넣는다.
사진으로 고친 campus.glb(photo_update.py)를 처음부터 다시 만들지 않고 그 위에 덧대기 위한 단계다.
  - 동천관(대학원): bld_side_e(사진 무늬 상자) → bld_dongcheon  (gen_dongcheon.py)
  - 정보전산원:     bld_edu(행소관 사진 무늬 상자) → 담쟁이 덮인 bld_edu  (gen_jeonsan.py)

  python3 scripts/scenery/gen_dongcheon.py $W/facades
  python3 scripts/scenery/gen_jeonsan.py $W/facades
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/build_scenery.py -- \\
      --work $W --out $W/out --only campus --export bld_dongcheon,bld_edu=$W/buildings.glb
  npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb           # Draco 풀기
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/swap_buildings.py -- \\
      --src $W/campus_raw.glb --add $W/buildings.glb --drop bld_side_e --out $W/campus_new.glb
  npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
  npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb
"""

import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
args = dict(zip(argv[::2], argv[1::2]))


def log(*a):
    print("[swap_buildings]", *a, flush=True)


def roots():
    return {o.name: o for o in bpy.data.objects if o.parent is None}


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args["--add"])
new = sorted(n for n in roots() if n.startswith("bld_"))
bpy.ops.wm.read_factory_settings(use_empty=True)
log("new buildings", new)

bpy.ops.import_scene.gltf(filepath=args["--src"])
drop = set(new) | {n for n in args.get("--drop", "").split(",") if n}
for name, root in roots().items():
    if name.split(".")[0] in drop:
        doomed = [root, *root.children_recursive]
        log("remove", name, len(doomed), "objects")
        bpy.data.batch_remove(doomed)
bpy.data.orphans_purge(do_recursive=True)

# 새 건물 넣기 — 같은 이름 재질(stone_white, roof_green, hedge …)은 campus.glb 쪽 것을 같이 쓴다
before = set(bpy.data.materials)
bpy.ops.import_scene.gltf(filepath=args["--add"])
for m in set(bpy.data.materials) - before:
    base = m.name.rsplit(".", 1)[0]
    orig = bpy.data.materials.get(base)
    if orig is not None and orig is not m and orig in before:
        m.user_remap(orig)
        log("share material", base)
bpy.data.orphans_purge(do_recursive=True)
got = sorted(n for n in roots() if n.split(".")[0] in new)
assert got == new, got

bpy.ops.export_scene.gltf(
    filepath=args["--out"],
    export_format="GLB",
    export_image_format="AUTO",
    export_apply=True,
    export_yup=True,
    export_extras=True,
)
log("wrote", args["--out"])
