"""
campus.glb 의 동천관(대학원)을 새 모델로 바꾼다 (Blender).

옛 모델(bld_side_e, 사진 무늬 상자 + 박공지붕) 또는 이미 넣은 bld_dongcheon 을 지우고,
build_scenery.py 가 따로 내보낸 dongcheon.glb(bld_dongcheon)를 넣는다. 다른 건물·조형물은 그대로.
사진으로 고친 campus.glb(photo_update.py)를 다시 만들지 않고 그 위에 덧대기 위한 단계다.

  python3 scripts/scenery/gen_dongcheon.py $W/facades
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      --python scripts/scenery/build_scenery.py -- --work $W --out $W/out --only campus --dongcheon $W/dongcheon.glb
  npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb           # Draco 풀기
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \\
      --python scripts/scenery/dongcheon_update.py -- --src $W/campus_raw.glb --dongcheon $W/dongcheon.glb --out $W/campus_new.glb
  npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
  npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb
"""

import sys

import bpy

argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
args = dict(zip(argv[::2], argv[1::2]))


def log(*a):
    print("[dongcheon_update]", *a, flush=True)


bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=args["--src"])

# 옛 동천관 지우기
old = [o for o in bpy.data.objects if o.parent is None and o.name.split(".")[0] in ("bld_side_e", "bld_dongcheon")]
for root in old:
    doomed = [root, *root.children_recursive]
    log("remove", root.name, len(doomed), "objects")
    bpy.data.batch_remove(doomed)
bpy.data.orphans_purge(do_recursive=True)

# 새 동천관 넣기 — 같은 이름 재질(stone_white, roof_green, hedge …)은 campus.glb 쪽 것을 같이 쓴다
before = set(bpy.data.materials)
bpy.ops.import_scene.gltf(filepath=args["--dongcheon"])
for m in set(bpy.data.materials) - before:
    base = m.name.rsplit(".", 1)[0]
    orig = bpy.data.materials.get(base)
    if orig is not None and orig is not m and orig in before:
        m.user_remap(orig)
        log("share material", base)
bpy.data.orphans_purge(do_recursive=True)
roots = [o.name for o in bpy.data.objects if o.parent is None and o.name.startswith("bld_dongcheon")]
assert roots == ["bld_dongcheon"], roots

bpy.ops.export_scene.gltf(
    filepath=args["--out"],
    export_format="GLB",
    export_image_format="AUTO",
    export_apply=True,
    export_yup=True,
    export_extras=True,
)
log("wrote", args["--out"])
