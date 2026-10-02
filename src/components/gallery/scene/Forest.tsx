"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF } from "@react-three/drei";
import * as THREE from "three";
import { SCENERY, rng, type Quality } from "./common";
import { blockedBySite, groundHeight, type SitePlan } from "./sitePlan";

/**
 * 나무 (ez-tree로 모양을 만들고 Blender에서 다듬은 trees.glb, 광장 느티나무는 zelkova.py).
 * 종류마다 나무껍질·잎을 인스턴싱해서 백여 그루도 가볍게 그린다.
 */

type Place = { x: number; y: number; z: number; rot: number; scale: number; tint: number };

const BIG = ["oak_a", "oak_b", "ash_a", "aspen_a", "pine_a", "pine_b"] as const;
const BIG_WEIGHT = [0.17, 0.15, 0.14, 0.06, 0.26, 0.22];

/** 광장 가로수(느티나무) · 대로 가로수 · 모서리 은행나무 · 둘레 잔디밭의 소나무와 활엽수 */
function placeTrees(plan: SitePlan, quality: Quality) {
  const r = rng(4242);
  const out: Record<string, Place[]> = {};
  const add = (name: string, p: Place) => (out[name] ??= []).push(p);
  const taken: [number, number, number][] = [];
  const free = (x: number, z: number, d: number) => taken.every(([tx, tz, td]) => Math.hypot(tx - x, tz - z) > Math.max(d, td));
  // 언덕·건물 터 위에서도 땅에 딱 붙게
  const put = (name: string, x: number, z: number, scale: number, gap = 5) => {
    add(name, { x, y: groundHeight(plan, x, z), z, rot: r() * 6.28, scale, tint: r() });
    taken.push([x, z, gap]);
  };
  const pick = () => {
    let v = r();
    for (let i = 0; i < BIG.length; i++) if ((v -= BIG_WEIGHT[i]) <= 0) return BIG[i];
    return BIG[0];
  };

  // 광장 양옆 격자 틀 느티나무 (Blender 로 만든 빽빽한 수관, scripts/scenery/zelkova.py)
  plan.gratedTrees.forEach(([x, z], i) => put(i % 2 ? "zelkova_a" : "zelkova_b", x, z, 0.95 + r() * 0.15, 4));
  // 광장 남쪽 모서리 은행나무 (사진)
  for (const s of [-1, 1]) put("aspen_a", s * (plan.plazaX + 4), plan.plazaS - 6, 0.95);
  // 광장 북동쪽 숲 (도서관 동쪽 ~ 전산원 뒤): 이 쪽을 보는 작품들 뒤로 빈 잔디와 먼 산 대신 빽빽한 나무가 서게.
  // 수관이 넓고 가벼운 느티나무를 겹쳐 심고, 광장에 가까운 두 줄은 나무 사이 밑을 낮은 소나무로 채운다
  const step = quality === "high" ? 10 : 13;
  const x0 = plan.plazaX + 5;
  const z0 = -14;
  for (let gx = x0; gx < plan.plazaX + 70; gx += step) {
    for (let gz = z0; gz > plan.plazaN - 40; gz -= step) {
      const x = gx + (r() - 0.5) * step * 0.5;
      const z = gz + (r() - 0.5) * step * 0.5;
      if (!blockedBySite(plan, x, z, 2)) put(r() < 0.5 ? "zelkova_a" : "zelkova_b", x, z, 1.1 + r() * 0.3, step * 0.55);
      const front = gx < x0 + step * 2 || gz > z0 - step * 2;
      const ux = gx + step / 2;
      const uz = gz - step / 2;
      if (front && !blockedBySite(plan, ux, uz, 2)) put("pine_b", ux, uz, 1.2 + r() * 0.35, 3);
    }
  }
  // 대로 가로수
  for (let z = plan.plazaS + 16; z < plan.roadS; z += 10) {
    for (const s of [-1, 1]) put(z % 20 < 10 ? "oak_b" : "ash_a", s * (plan.roadX + 2.2), z, 0.95 + r() * 0.1, 4);
  }
  // 둘레 잔디밭: 광장·대로·건물 자리를 비워 두고 소나무 위주로
  const target = quality === "high" ? 90 : 45;
  let guard = 0;
  let count = 0;
  while (count < target && guard++ < target * 60) {
    const x = (r() * 2 - 1) * 150;
    const z = plan.plazaN - 60 + r() * (plan.roadS + 40 - (plan.plazaN - 60));
    if (blockedBySite(plan, x, z, 3)) continue;
    if (Math.abs(x) < plan.plazaX + 3 && z < plan.plazaS && z > plan.plazaN) continue;
    const near = Math.abs(x) < plan.plazaX + 14;
    if (!free(x, z, near ? 6.5 : 5.5)) continue;
    put(pick(), x, z, 0.85 + r() * 0.45);
    count++;
  }
  // 광장 가장자리 잔디의 관목
  for (let z = plan.plazaS - 3; z > plan.plazaN; z -= 3.4) {
    for (const s of [-1, 1]) {
      if (r() < 0.35) continue;
      const x = s * (plan.plazaX + 1.4 + r() * 1.5);
      if (blockedBySite(plan, x, z, 1)) continue;
      add(r() < 0.6 ? "bush_a" : "bush_b", { x, y: groundHeight(plan, x, z), z, rot: r() * 6.28, scale: 0.8 + r() * 0.5, tint: r() });
    }
  }
  return out;
}

export function Forest({ site, quality }: { site: SitePlan; quality: Quality }) {
  const gltf = useGLTF(SCENERY.trees, SCENERY.draco);
  const places = useMemo(() => placeTrees(site, quality), [site, quality]);
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
    // 멀리 있는 잎: 밉맵에서 알파가 흐려져 잘려 나가므로(줄기만 남음) 밉 단계만큼 알파를 키운다
    shader.fragmentShader = shader.fragmentShader.replace(
      "#include <alphatest_fragment>",
      `#ifdef USE_MAP
        vec2 texel = vMapUv * vec2(textureSize(map, 0));
        vec2 ddx = dFdx(texel);
        vec2 ddy = dFdy(texel);
        float lod = 0.5 * log2(max(dot(ddx, ddx), dot(ddy, ddy)));
        diffuseColor.a *= 1.0 + max(lod, 0.0) * 0.25;
      #endif
      #include <alphatest_fragment>`
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
      m.compose(new THREE.Vector3(p.x, p.y - 0.15, p.z), q, new THREE.Vector3(p.scale, p.scale, p.scale));
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
