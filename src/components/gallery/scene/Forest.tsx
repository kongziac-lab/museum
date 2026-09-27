"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { WALK, type GalleryLayout } from "@/lib/gallery";
import { SCENERY, rng, type Quality } from "./common";
import { blockedByCampus, campusPlan } from "./campusPlan";

/**
 * 나무 (ez-tree로 모양을 만들고 Blender에서 다듬은 trees.glb).
 * 종류마다 나무껍질·잎을 인스턴싱해서 백여 그루도 가볍게 그린다.
 */

type Place = { x: number; z: number; rot: number; scale: number; tint: number };

const BIG = ["oak_a", "oak_b", "ash_a", "aspen_a", "pine_a", "pine_b"] as const;
const BIG_WEIGHT = [0.22, 0.18, 0.2, 0.08, 0.17, 0.15];

function placeTrees(layout: GalleryLayout, quality: Quality) {
  const R = layout.radius;
  const r = rng(4242);
  const out: Record<string, Place[]> = {};
  const add = (name: string, p: Place) => (out[name] ??= []).push(p);
  const taken: [number, number, number][] = [];
  const free = (x: number, z: number, d: number) => taken.every(([tx, tz, td]) => Math.hypot(tx - x, tz - z) > Math.max(d, td));
  const pick = () => {
    let v = r();
    for (let i = 0; i < BIG.length; i++) if ((v -= BIG_WEIGHT[i]) <= 0) return BIG[i];
    return BIG[0];
  };
  const inApproach = (x: number, z: number, pad: number) => z > R - 2 && Math.abs(x) < WALK.pathWidth / 2 + pad;
  // 계명대 건물 자리와 정면 시야는 비워 둔다
  const plan = campusPlan(layout);
  const onCampus = (x: number, z: number, m = 4) => blockedByCampus(plan, layout, x, z, m);

  // 산책로 바깥 숲 (안쪽은 비워 분수가 잘 보이게)
  const target = quality === "high" ? 75 : 40;
  const inner = R + WALK.pathWidth / 2 + 5;
  const outer = R + 62;
  let guard = 0;
  let count = 0;
  while (count < target && guard++ < target * 40) {
    // 면적이 고르게: 반지름은 제곱근 분포
    const rad = Math.sqrt(inner * inner + r() * (outer * outer - inner * inner));
    const phi = r() * Math.PI * 2;
    const x = Math.sin(phi) * rad;
    const z = Math.cos(phi) * rad;
    if (inApproach(x, z, 10) || onCampus(x, z)) continue;
    const near = rad < inner + 8;
    if (!free(x, z, near ? 6.5 : 5.2)) continue;
    taken.push([x, z, 5]);
    add(pick(), { x, z, rot: r() * 6.28, scale: 0.8 + r() * 0.45, tint: r() });
    count++;
  }
  // 산책로 바깥 가장자리 관목
  const edge = R + WALK.pathWidth / 2 + 1.4;
  const step = 2.6 / edge;
  for (let phi = 0; phi < Math.PI * 2; phi += step * (0.8 + r() * 0.5)) {
    const x = Math.sin(phi) * edge;
    const z = Math.cos(phi) * edge;
    if (inApproach(x, z, 2.2) || r() < 0.18) continue;
    add(r() < 0.6 ? "bush_a" : "bush_b", { x, z, rot: r() * 6.28, scale: 0.8 + r() * 0.5, tint: r() });
  }
  // 분수 자갈 띠 네 모서리
  for (let k = 0; k < 4; k++) {
    const a = Math.PI / 4 + (k * Math.PI) / 2;
    add("bush_a", { x: Math.sin(a) * 9.2, z: Math.cos(a) * 9.2, rot: r() * 6.28, scale: 0.9, tint: r() });
  }
  return out;
}

export function Forest({ layout, quality }: { layout: GalleryLayout; quality: Quality }) {
  const gltf = useGLTF(SCENERY.trees, SCENERY.draco);
  const places = useMemo(() => placeTrees(layout, quality), [layout, quality]);
  const parts = useMemo(() => {
    const byName: Record<string, THREE.Mesh> = {};
    gltf.scene.traverse((o) => {
      if ((o as THREE.Mesh).isMesh) byName[o.name] = o as THREE.Mesh;
    });
    return byName;
  }, [gltf]);
  const wind = useMemo(() => ({ value: 0 }), []);
  useFrame((_, dt) => {
    wind.value += Math.min(dt, 0.1);
  });

  return (
    <group>
      {Object.entries(places).map(([name, list]) => {
        const bark = parts[`${name}_bark`];
        const leaves = parts[`${name}_leaves`];
        if (!bark || !leaves) return null;
        return <TreeKind key={name} bark={bark} leaves={leaves} list={list} wind={wind} shadows={quality === "high" || !name.startsWith("bush")} />;
      })}
    </group>
  );
}

useGLTF.preload(SCENERY.trees, SCENERY.draco);

function leafMaterial(src: THREE.Material, wind: { value: number }) {
  const m = (src as THREE.MeshStandardMaterial).clone();
  m.transparent = false;
  m.alphaTest = 0.5;
  m.side = THREE.DoubleSide;
  m.roughness = 0.8;
  m.onBeforeCompile = (shader) => {
    shader.uniforms.uWind = wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          vec3 ip = vec3(instanceMatrix[3][0], instanceMatrix[3][1], instanceMatrix[3][2]);
        #else
          vec3 ip = vec3(0.0);
        #endif
        float ph = ip.x * 0.37 + ip.z * 0.21;
        float k = max(transformed.y, 0.0) * 0.012;
        transformed.x += sin(uWind * 1.3 + ph + transformed.y * 0.35) * k;
        transformed.z += cos(uWind * 1.05 + ph * 1.7 + transformed.x * 0.4) * k * 0.8;`
      );
  };
  m.customProgramCacheKey = () => "leaf-wind";
  return m;
}

function TreeKind({
  bark,
  leaves,
  list,
  wind,
  shadows,
}: {
  bark: THREE.Mesh;
  leaves: THREE.Mesh;
  list: Place[];
  wind: { value: number };
  shadows: boolean;
}) {
  const barkRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const leafMat = useMemo(() => leafMaterial(leaves.material as THREE.Material, wind), [leaves, wind]);

  useLayoutEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    const up = new THREE.Vector3(0, 1, 0);
    list.forEach((p, i) => {
      q.setFromAxisAngle(up, p.rot);
      m.compose(new THREE.Vector3(p.x, 0, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
      barkRef.current?.setMatrixAt(i, m);
      leafRef.current?.setMatrixAt(i, m);
      // 나무마다 잎 색을 조금씩 다르게
      c.setRGB(0.86 + p.tint * 0.2, 0.9 + p.tint * 0.14, 0.8 + (1 - p.tint) * 0.12);
      leafRef.current?.setColorAt(i, c);
    });
    for (const ref of [barkRef, leafRef]) {
      const im = ref.current;
      if (!im) continue;
      im.instanceMatrix.needsUpdate = true;
      if (im.instanceColor) im.instanceColor.needsUpdate = true;
      im.computeBoundingSphere();
    }
  }, [list]);

  return (
    <group>
      <instancedMesh ref={barkRef} args={[bark.geometry, bark.material as THREE.Material, list.length]} castShadow={shadows} receiveShadow />
      <instancedMesh ref={leafRef} args={[leaves.geometry, leafMat, list.length]} castShadow={shadows} receiveShadow />
    </group>
  );
}
