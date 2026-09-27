"use client";

import { useMemo } from "react";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCENERY } from "./common";
import { projectUV, type SiteMaterials } from "./Grounds";
import type { Planter, SitePlan } from "./sitePlan";

/**
 * 화강암 뚜껑을 얹은 벽돌 화단 (사진 속 광장 화단) + 안에 심은 회양목·반송·둥근 향나무·표석.
 * 반송·향나무·표석 모양은 campus.glb 의 prop_* (Blender) 를 복제해 쓴다.
 */

const WALL_H = 0.55;
const CAP = 0.32;

function planterGeos(p: Planter) {
  const wall: THREE.BufferGeometry[] = [];
  const cap: THREE.BufferGeometry[] = [];
  const soil: THREE.BufferGeometry[] = [];
  if (p.round) {
    const r = p.w;
    const w = new THREE.CylinderGeometry(r, r, WALL_H, 40, 1, true);
    w.translate(p.x, WALL_H / 2, p.z);
    wall.push(projectUV(w));
    const c = new THREE.CylinderGeometry(r + 0.05, r + 0.05, 0.1, 40, 1, false);
    c.translate(p.x, WALL_H + 0.05, p.z);
    cap.push(projectUV(c));
    const s = new THREE.CircleGeometry(r - CAP, 40).rotateX(-Math.PI / 2).translate(p.x, WALL_H + 0.105, p.z);
    soil.push(projectUV(s));
  } else {
    const w = new THREE.BoxGeometry(p.w, WALL_H, p.d).translate(p.x, WALL_H / 2, p.z);
    wall.push(projectUV(w));
    for (const [cx, cz, sx, sz] of [
      [p.x, p.z - p.d / 2 + CAP / 2, p.w + 0.1, CAP + 0.05],
      [p.x, p.z + p.d / 2 - CAP / 2, p.w + 0.1, CAP + 0.05],
      [p.x - p.w / 2 + CAP / 2, p.z, CAP + 0.05, p.d - CAP * 2],
      [p.x + p.w / 2 - CAP / 2, p.z, CAP + 0.05, p.d - CAP * 2],
    ]) {
      cap.push(projectUV(new THREE.BoxGeometry(sx, 0.1, sz).translate(cx, WALL_H + 0.05, cz)));
    }
    soil.push(projectUV(new THREE.PlaneGeometry(p.w - CAP * 2, p.d - CAP * 2).rotateX(-Math.PI / 2).translate(p.x, WALL_H + 0.06, p.z)));
  }
  return { wall, cap, soil };
}

function mergeAll(list: THREE.BufferGeometry[]) {
  const nonIndexed = list.map((g) => (g.index ? g.toNonIndexed() : g));
  let count = 0;
  for (const g of nonIndexed) count += g.getAttribute("position").count;
  const out = new THREE.BufferGeometry();
  for (const name of ["position", "normal", "uv"] as const) {
    const size = name === "uv" ? 2 : 3;
    const arr = new Float32Array(count * size);
    let o = 0;
    for (const g of nonIndexed) {
      const a = g.getAttribute(name);
      arr.set(a.array as Float32Array, o);
      o += a.count * size;
    }
    out.setAttribute(name, new THREE.BufferAttribute(arr, size));
  }
  out.computeBoundingSphere();
  return out;
}

export function Planters({ plan, mats }: { plan: SitePlan; mats: SiteMaterials }) {
  const gltf = useGLTF(SCENERY.campus, SCENERY.draco);

  const { walls, caps, soils, hedges } = useMemo(() => {
    const wall: THREE.BufferGeometry[] = [];
    const cap: THREE.BufferGeometry[] = [];
    const soil: THREE.BufferGeometry[] = [];
    const hedge: THREE.BufferGeometry[] = [];
    for (const p of plan.planters) {
      const g = planterGeos(p);
      wall.push(...g.wall);
      cap.push(...g.cap);
      soil.push(...g.soil);
      if (p.fill === "hedge") {
        // 사각으로 다듬은 회양목 (사진 속 화단)
        const b = new THREE.BoxGeometry(p.w - CAP * 2 - 0.1, 0.75, p.d - CAP * 2 - 0.1, 6, 2, 3);
        const pos = b.getAttribute("position");
        for (let i = 0; i < pos.count; i++) {
          // 모서리를 둥글게 부풀려 다듬은 나무 느낌
          const x = pos.getX(i);
          const z = pos.getZ(i);
          const y = pos.getY(i);
          pos.setXYZ(i, x * (1 + 0.02 * Math.sin(z * 3.1)), y + 0.03 * Math.sin(x * 4.3 + z * 2.2), z);
        }
        b.computeVertexNormals();
        b.translate(p.x, WALL_H + 0.1 + 0.375, p.z);
        hedge.push(projectUV(b));
      }
    }
    return { walls: mergeAll(wall), caps: mergeAll(cap), soils: mergeAll(soil), hedges: hedge.length ? mergeAll(hedge) : null };
  }, [plan]);

  // 반송·향나무·표석 복제
  const props = useMemo(() => {
    const pick = (name: string) => gltf.scene.getObjectByName(name);
    const pine = pick("prop_topiary_pine");
    const ball = pick("prop_topiary_ball");
    const rock = pick("prop_rock");
    const out: THREE.Object3D[] = [];
    const put = (src: THREE.Object3D | undefined, x: number, y: number, z: number, s: number, rot: number) => {
      if (!src) return;
      const o = src.clone(true);
      o.position.set(x, y, z);
      o.scale.setScalar(s);
      o.rotation.set(0, rot, 0);
      o.traverse((m) => {
        if ((m as THREE.Mesh).isMesh) m.castShadow = m.receiveShadow = true;
      });
      out.push(o);
    };
    let k = 0;
    for (const p of plan.planters) {
      const top = WALL_H + 0.1;
      const rot = (k++ * 2.39) % (Math.PI * 2);
      if (p.fill === "pine") put(pine, p.x, top, p.z, 1.05, rot);
      if (p.fill === "ball") put(ball, p.x, top, p.z, p.round ? Math.min(p.w * 0.6, 1.4) : 1.2, rot);
      if (p.fill === "balls") for (const dz of [-3.2, 0, 3.2]) put(ball, p.x, top, p.z + dz, 1.05, rot + dz);
      if (p.rock) put(rock, p.x + (p.round ? p.w * 0.55 : p.w * 0.32), top, p.z + (p.round ? 0.2 : 0), 1.1, 0.4 + rot);
    }
    // 비석 무리 옆 큰 자연석
    put(rock, plan.steles.x + 5.2, 0, plan.steles.z + 0.6, 1.5, 0.3);
    return out;
  }, [gltf, plan]);

  return (
    <group>
      <mesh geometry={walls} material={mats.wall} castShadow receiveShadow />
      <mesh geometry={caps} material={mats.granite} castShadow receiveShadow />
      <mesh geometry={soils} material={mats.grass} receiveShadow />
      {hedges && <mesh geometry={hedges} material={mats.hedge} castShadow receiveShadow />}
      {props.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </group>
  );
}
