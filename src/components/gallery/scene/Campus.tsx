"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { FONT, SCENERY, useCanvasTexture } from "./common";
import type { SitePlan } from "./sitePlan";

/**
 * 계명대학교 건물들 (scripts/scenery/build_scenery.py → campus.glb): 정문 · 동산도서관 · 언덕 위 본관 · 대로 옆 건물.
 * 도서관 정면·옆벽은 2026-09-28 에 찍은 사진, 본관 등은 Wikimedia Commons 사진(출처: /credits.html)을 입힌 면이라
 * 조명 없이 사진 그대로 그리고, 정문·지붕 등 모델링한 부분은 장면 빛을 받는다.
 * 조형물(prop_*: 정문 앞 책 표석, 비석, 계명인 상, 시비, 가로등, 벤치)은 scripts/scenery/photo_update.py 로 만들었다.
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

  // 조형물: 같은 모델을 여러 자리에 복제 (그림자 받기·드리우기)
  const props = useMemo(
    () =>
      site.props.map((p) => {
        const src = gltf.scene.getObjectByName(p.node);
        if (!src) return null;
        const obj = src.clone(true);
        obj.position.set(p.x, p.y ?? 0, p.z);
        obj.rotation.set(0, p.rot, 0);
        obj.scale.setScalar(p.scale ?? 1);
        obj.traverse((o) => {
          if ((o as THREE.Mesh).isMesh) o.castShadow = o.receiveShadow = true;
        });
        return obj;
      }),
    [gltf, site.props]
  );

  const gate = nodes[plan.findIndex((p) => p.node === "bld_gate")];
  const textAnchor = useMemo(() => gate?.getObjectByName("gate_text") ?? null, [gate]);
  const sign = props[site.props.findIndex((p) => p.node === "prop_gate_sign")];
  const signKo = useMemo(() => sign?.getObjectByName("sign_text_ko") ?? null, [sign]);
  const signEn = useMemo(() => sign?.getObjectByName("sign_text_en") ?? null, [sign]);

  return (
    <group>
      {nodes.map((o, i) => (o ? <primitive key={`${plan[i].node}-${i}`} object={o} /> : null))}
      {props.map((o, i) => (o ? <primitive key={`${site.props[i].node}-p${i}`} object={o} /> : null))}
      {textAnchor && <GateText anchor={textAnchor} />}
      {signKo && <SignText anchor={signKo} text="계명대학교" font={`800 SIZE "Nanum Gothic"`} w={4.3} h={0.62} spacing={0.42} />}
      {signEn && <SignText anchor={signEn} text="KEIMYUNG UNIVERSITY" font={`400 SIZE "Uncial Antiqua"`} w={4.6} h={0.5} spacing={0.02} />}
    </group>
  );
}

/**
 * 정문 앞 책 표석의 금색 글자 (책등 앞면, 앵커 = 책등 가운데 1cm 앞).
 * 글꼴은 사진(IMG_3994)에 가깝게: 한글은 굵은 고딕, 영문은 언셜체. font 의 SIZE 자리에 크기가 들어간다.
 */
function SignText({ anchor, text, font, w, h, spacing }: { anchor: THREE.Object3D; text: string; font: string; w: number; h: number; spacing: number }) {
  // 캔버스에만 쓰는 글꼴은 저절로 받지 않으므로 직접 불러오고, 오면 다시 그린다
  const [ready, setReady] = useState(false);
  useEffect(() => {
    document.fonts
      ?.load(font.replace("SIZE", "100px"), text)
      .then(() => setReady(true))
      .catch(() => {});
  }, [font, text]);
  const W = 2048;
  const H = Math.round((W * h) / w);
  const tex = useCanvasTexture(
    W,
    H,
    (g) => {
      const size = H * 0.78;
      g.font = `${font.replace("SIZE", `${size}px`)}, ${FONT}`;
      g.textBaseline = "middle";
      const chars = [...text];
      const gap = size * spacing;
      const widths = chars.map((c) => g.measureText(c).width);
      const total = widths.reduce((a, b) => a + b, 0) + gap * (chars.length - 1);
      const scale = Math.min(1, (W * 0.96) / total);
      g.save();
      g.translate(W / 2, H / 2);
      g.scale(scale, 1);
      // 금박: 위는 밝고 아래는 짙은 금, 가는 그림자로 새긴 느낌
      const grad = g.createLinearGradient(0, -size / 2, 0, size / 2);
      grad.addColorStop(0, "#f3d98a");
      grad.addColorStop(0.5, "#c99a3a");
      grad.addColorStop(1, "#8a6420");
      let x = -total / 2;
      chars.forEach((c, i) => {
        g.fillStyle = "rgba(0,0,0,0.55)";
        g.fillText(c, x + 3, 4);
        g.fillStyle = grad;
        g.fillText(c, x, 0);
        x += widths[i] + gap;
      });
      g.restore();
    },
    [text, font, spacing, ready]
  );
  return createPortal(
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial map={tex} transparent metalness={0.55} roughness={0.35} depthWrite={false} polygonOffset polygonOffsetFactor={-2} />
    </mesh>,
    anchor
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
