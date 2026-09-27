"use client";

import { useMemo } from "react";
import { createPortal } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FONT, SCENERY, useCanvasTexture } from "./common";
import type { SitePlan } from "./sitePlan";

/**
 * 계명대학교 건물들 (scripts/scenery/build_scenery.py → campus.glb): 정문 · 동산도서관 · 언덕 위 본관 · 대로 옆 건물.
 * 도서관·본관 정면과 벽 무늬는 실제 사진(Wikimedia Commons, 출처: /credits.html)을 입힌 면이라
 * 조명 없이 사진 그대로 그리고, 정문·지붕 등 모델링한 부분은 장면 빛을 받는다.
 */
export function Campus({ site }: { site: SitePlan }) {
  const gltf = useGLTF(SCENERY.campus, SCENERY.draco);
  const plan = site.buildings;

  const nodes = useMemo(() => {
    const photoMats = new Map<THREE.Material, THREE.Material>();
    const photo = (m: THREE.Material) => {
      let out = photoMats.get(m);
      if (!out) {
        const src = m as THREE.MeshStandardMaterial;
        if (src.map) src.map.anisotropy = 8;
        out = new THREE.MeshBasicMaterial({ map: src.map, alphaTest: 0.5, color: new THREE.Color(0.93, 0.93, 0.93) });
        photoMats.set(m, out);
      }
      return out;
    };
    return plan.map((p) => {
      const src = gltf.scene.getObjectByName(p.node);
      if (!src) return null;
      const obj = src.clone(true);
      obj.position.set(p.x, p.y ?? 0, p.z);
      obj.rotation.set(0, p.rot, 0);
      obj.scale.setScalar(p.scale ?? 1);
      obj.traverse((o) => {
        const m = o as THREE.Mesh;
        if (!m.isMesh) return;
        if (o.name.startsWith("photo_")) {
          m.material = photo(m.material as THREE.Material);
          m.receiveShadow = false;
        } else {
          m.castShadow = true;
          m.receiveShadow = true;
        }
      });
      return obj;
    });
  }, [gltf, plan]);

  const gate = nodes[plan.findIndex((p) => p.node === "bld_gate")];
  const textAnchor = useMemo(() => gate?.getObjectByName("gate_text") ?? null, [gate]);

  return (
    <group>
      {nodes.map((o, i) => (o ? <primitive key={`${plan[i].node}-${i}`} object={o} /> : null))}
      {textAnchor && <GateText anchor={textAnchor} />}
    </group>
  );
}

useGLTF.preload(SCENERY.campus, SCENERY.draco);

/** 정문 가운데 띠에 새긴 '계 명 대 학 교' */
function GateText({ anchor }: { anchor: THREE.Object3D }) {
  const tex = useCanvasTexture(
    1400,
    120,
    (g) => {
      g.fillStyle = "rgba(95,92,86,0.9)";
      g.font = `600 84px ${FONT}`;
      g.textAlign = "center";
      g.textBaseline = "middle";
      const chars = "계명대학교".split("");
      chars.forEach((c, i) => g.fillText(c, 700 + (i - 2) * 190, 64));
    },
    []
  );
  // 앵커는 정문 모델 안의 빈 노드(띠 앞면 2cm 앞) → 그 자리에 글자판을 붙인다
  return createPortal(
    <mesh>
      <planeGeometry args={[9, 0.77]} />
      <meshStandardMaterial map={tex} transparent roughness={0.7} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>,
    anchor
  );
}
