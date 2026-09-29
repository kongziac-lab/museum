"""
build_scenery.py 의 건물 한 채만 만들어 따로 내보낸다 (Blender). campus.glb 전체를 다시 굽지 않고
swap_buildings.py 로 지금 campus.glb 에 끼워 넣기 위한 단계다 (사진 외벽 작업 폴더가 없어도 된다).
광장 소품(다듬은 반송·둥근 향나무·표석)과 산울타리(hedge) 재질은 지금 campus.glb 에서 가져다 쓴다.
  - 봉경관(사회과학대학): bld_bongkyung  (gen_bongkyung.py)

  python3 scripts/scenery/gen_bongkyung.py $W/facades
  npx @gltf-transform/cli copy public/scenery/campus.glb $W/campus_raw.glb           # Draco 풀기
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/export_building.py -- \\
      --work $W --src $W/campus_raw.glb --build bongkyung --glb $W/buildings.glb [--preview $W/preview.png]
  /Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup --python scripts/scenery/swap_buildings.py -- \\
      --src $W/campus_raw.glb --add $W/buildings.glb --out $W/campus_new.glb
  npx @gltf-transform/cli webp $W/campus_new.glb $W/campus_webp.glb --quality 88
  npx @gltf-transform/cli draco $W/campus_webp.glb public/scenery/campus.glb

--preview 를 주면 사진(IMG_4042)을 찍은 자리(분수 기준 서 49 m · 남 49 m, 눈높이)에서 Cycles 로 한 장 그린다.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bpy  # noqa: E402
from mathutils import Vector  # noqa: E402

import build_scenery as bs  # noqa: E402

opts = bs.opts
bs.reset()
bpy.ops.import_scene.gltf(filepath=opts["--src"])
props = {k: bpy.data.objects[f"prop_{n}"] for k, n in (("pine", "topiary_pine"), ("ball", "topiary_ball"), ("rock", "rock"))}
hedge = bpy.data.materials["hedge"]
campus = {o.name for o in bpy.data.objects}

getattr(bs, f"build_{opts['--build']}")(os.path.join(bs.WORK, "facades"), hedge, props)
roots = [o for o in bpy.data.objects if o.name not in campus and o.parent is None and o.name.startswith("bld_")]
for r in roots:
    bs.join_by_material(r)
objs = [x for r in roots for x in (r, *r.children_recursive)]
bs.export(opts["--glb"], objs, draco=False)

if "--preview" in opts:
    # 원래 campus 는 숨기고(소품만 원점에 모여 있다) 새 건물만, 웹 자리 그대로 두고 그린다
    for o in bpy.data.objects:
        if o.name in campus:
            o.hide_render = True
    ox, oz = bs.BONGKYUNG_ORIGIN

    def P(x, z, y):
        return (x - ox, oz - z, y)

    for r in roots:
        r.location = (0, 0, 0)
    court = bs.box("preview_court", 400, 400, -0.2, 0.0)  # 앞마당 벽돌 포장 대신 넓은 바닥
    court.data.materials.append(bs.plain_material("preview_court", (0.33, 0.14, 0.1), rough=0.95))
    bs.render_preview(opts["--preview"], target=P(-100.0, 24.0, 7.5), cam=P(-49.0, 49.0, 1.6))
    # 동쪽 끝을 비스듬히, 조금 높은 데서 한 장 더
    cam = bpy.context.scene.camera
    cam.location = Vector(P(-30.0, 60.0, 9.0))
    cam.rotation_euler = (Vector(P(-110.0, 20.0, 6.0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = opts["--preview"].replace(".png", "_2.png")
    bpy.ops.render.render(write_still=True)
