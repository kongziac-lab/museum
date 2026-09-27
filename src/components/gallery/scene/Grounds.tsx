"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { WALK, type GalleryLayout } from "@/lib/gallery";
import { SCENERY, preparePbr } from "./common";
import { campusPlan } from "./campusPlan";

const GRASS_TILE = 2.4; // m
const BRICK_TILE = 1.8;
const GRANITE_TILE = 1.6;
/** 멀리 있는 잔디가 HDRI 속 잔디(지평선)와 이어지는 색 (sRGB 98,107,58) */
const FAR_LAWN = new THREE.Color().setRGB(98 / 255, 107 / 255, 58 / 255, THREE.SRGBColorSpace);

export function useGranite() {
  const set = useTexture([SCENERY.tex("granite_tile_diffuse"), SCENERY.tex("granite_tile_nor_gl"), SCENERY.tex("granite_tile_arm")]);
  return useMemo(() => preparePbr(set, 1 / GRANITE_TILE), [set]);
}

/* ───────────────────────── 잔디 ───────────────────────── */

export function Lawn({ layout }: { layout: GalleryLayout }) {
  const set = useTexture([SCENERY.tex("sparse_grass_diffuse"), SCENERY.tex("sparse_grass_nor_gl"), SCENERY.tex("sparse_grass_arm")]);
  const size = layout.radius + 190;
  const { geometry, material } = useMemo(() => {
    const g = new THREE.CircleGeometry(size, 128);
    g.rotateX(-Math.PI / 2);
    // UV = 월드 좌표(m) → 텍스처 반복은 재질에서
    const p = g.getAttribute("position");
    const uv = g.getAttribute("uv");
    for (let i = 0; i < p.count; i++) uv.setXY(i, p.getX(i), -p.getZ(i));
    const tex = preparePbr(set, 1 / GRASS_TILE);
    const m = new THREE.MeshStandardMaterial({ ...tex, roughness: 1, normalScale: new THREE.Vector2(0.9, 0.9) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uFar = { value: FAR_LAWN };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
        .replace(
          "#include <worldpos_vertex>",
          "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;"
        );
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nuniform vec3 uFar;")
        .replace(
          "#include <map_fragment>",
          `
          // 같은 무늬가 반복돼 보이지 않게: 크기·방향이 다른 두 번 샘플 + 아주 큰 얼룩
          vec2 uvA = vMapUv;
          vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.37 + 0.23;
          vec4 cA = texture2D(map, uvA);
          vec4 cB = texture2D(map, uvB);
          float blotch = texture2D(map, vMapUv * 0.041 + 0.5).g;
          vec4 sampledDiffuseColor = mix(cA, cB, 0.45);
          sampledDiffuseColor.rgb *= mix(0.78, 1.14, smoothstep(0.18, 0.42, blotch));
          float farK = smoothstep(55.0, 175.0, length(vWorldPos.xz));
          sampledDiffuseColor.rgb = mix(sampledDiffuseColor.rgb, uFar, farK);
          diffuseColor *= sampledDiffuseColor;
          `
        );
    };
    return { geometry: g, material: m };
  }, [set, size]);
  return <mesh geometry={geometry} material={material} receiveShadow />;
}

/* ───────────────────────── 산책로 ───────────────────────── */

type Pt = [number, number];

/** 가운데 선을 따라 폭 w인 띠 (위를 보는 면). v = 길이(m), u = 폭 방향(m). */
function ribbon(center: Pt[], w: number, y: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  let run = 0;
  for (let i = 0; i < center.length; i++) {
    const [x, z] = center[i];
    const [nx, nz] = center[Math.min(i + 1, center.length - 1)];
    const [px, pz] = center[Math.max(i - 1, 0)];
    let tx = nx - px;
    let tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) run += Math.hypot(x - center[i - 1][0], z - center[i - 1][1]);
    // 진행 방향 기준 왼쪽 = (tz, -tx)
    for (const s of [-1, 1]) {
      pos.push(x + tz * s * (w / 2), y, z - tx * s * (w / 2));
      uv.push((s * w) / 2, run);
    }
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k, k - 1, k - 1, k, k + 1);
    }
  }
  return geom(pos, uv, idx);
}

/** 가운데 선을 따라 폭 w · 높이 h 인 턱 (윗면 + 양옆면). */
function curb(center: Pt[], w: number, h: number) {
  const pos: number[] = [];
  const uv: number[] = [];
  const idx: number[] = [];
  // 단면: 왼쪽 바닥 → 왼쪽 위 → 오른쪽 위 → 오른쪽 바닥
  const prof: [number, number][] = [
    [-w / 2, -0.05],
    [-w / 2, h],
    [w / 2, h],
    [w / 2, -0.05],
  ];
  const profU = [0, h + 0.05, h + 0.05 + w, 2 * (h + 0.05) + w];
  let run = 0;
  for (let i = 0; i < center.length; i++) {
    const [x, z] = center[i];
    const [nx, nz] = center[Math.min(i + 1, center.length - 1)];
    const [px, pz] = center[Math.max(i - 1, 0)];
    let tx = nx - px;
    let tz = nz - pz;
    const l = Math.hypot(tx, tz) || 1;
    tx /= l;
    tz /= l;
    if (i > 0) run += Math.hypot(x - center[i - 1][0], z - center[i - 1][1]);
    prof.forEach(([o, y], j) => {
      pos.push(x + tz * o, y, z - tx * o);
      uv.push(profU[j], run);
    });
    if (i > 0) {
      const a = (i - 1) * 4;
      const b = i * 4;
      for (let j = 0; j < 3; j++) idx.push(a + j, b + j, a + j + 1, a + j + 1, b + j, b + j + 1);
    }
  }
  return geom(pos, uv, idx);
}

function geom(pos: number[], uv: number[], idx: number[]) {
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // 앞뒤가 뒤집혀 있으면 법선을 위로
  const n = g.getAttribute("normal");
  if (n.count && n.getY(0) < -0.5) {
    g.setIndex(idx.map((_, i) => idx[i - (i % 3) + [0, 2, 1][i % 3]]));
    g.computeVertexNormals();
  }
  return g;
}

function arc(r: number, from: number, to: number, step = 0.04): Pt[] {
  const n = Math.max(2, Math.ceil(Math.abs(to - from) / step));
  return Array.from({ length: n + 1 }, (_, k) => {
    const phi = from + ((to - from) * k) / n;
    return [Math.sin(phi) * r, Math.cos(phi) * r] as Pt;
  });
}

export function Paths({ layout }: { layout: GalleryLayout }) {
  const brickSet = useTexture([
    SCENERY.tex("red_brick_pavers_diffuse"),
    SCENERY.tex("red_brick_pavers_nor_gl"),
    SCENERY.tex("red_brick_pavers_arm"),
  ]);
  const granite = useGranite();
  const { radius: R, entranceZ } = layout;
  const w = WALK.pathWidth;

  const geos = useMemo(() => {
    const curbW = 0.16;
    const curbH = 0.07;
    const inner = R - w / 2 - curbW / 2;
    const outer = R + w / 2 + curbW / 2;
    // 진입로가 들어오는 자리는 바깥 턱을 비운다
    const gap = Math.asin((w / 2 + curbW) / outer);
    const approachEnd = entranceZ + 5;
    const approach: Pt[] = [];
    for (let z = approachEnd; z >= R - 0.2; z -= 0.5) approach.push([0, z]);
    return {
      ring: ribbon(arc(R, 0, Math.PI * 2 + 0.02), w, 0.012),
      approach: ribbon(approach, w, 0.016),
      curbs: [
        curb(arc(inner, 0, Math.PI * 2 + 0.01), curbW, curbH),
        curb(arc(outer, gap, Math.PI * 2 - gap), curbW, curbH),
        curb(
          approach.filter(([, z]) => z >= outer * Math.cos(gap)).map(([, z]) => [w / 2 + curbW / 2, z] as Pt),
          curbW,
          curbH
        ),
        curb(
          approach.filter(([, z]) => z >= outer * Math.cos(gap)).map(([, z]) => [-w / 2 - curbW / 2, z] as Pt),
          curbW,
          curbH
        ),
      ],
    };
  }, [R, entranceZ, w]);

  const brick = useMemo(() => {
    const t = preparePbr(brickSet, 1 / BRICK_TILE);
    return new THREE.MeshStandardMaterial({ ...t, roughness: 1, normalScale: new THREE.Vector2(1.2, 1.2) });
  }, [brickSet]);
  // 경계석: 밝은 화강암 (무늬는 노멀·거칠기만 빌려 쓴다)
  const stone = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        normalMap: granite.normalMap,
        roughnessMap: granite.roughnessMap,
        roughness: 1,
        color: "#cdc9c1",
        side: THREE.DoubleSide,
      }),
    [granite]
  );

  // 건물 앞 벽돌 광장 + 정문 아래 광장
  const plazas = useMemo(() => {
    return campusPlan(layout)
      .map((p) => {
        const gate = p.node === "bld_gate";
        const w = gate ? 20 : p.w + 6;
        const d = gate ? 12 : p.plaza;
        if (d <= 0) return null;
        const g = new THREE.PlaneGeometry(w, d);
        const uv = g.getAttribute("uv");
        for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * w, uv.getY(i) * d);
        g.rotateX(-Math.PI / 2);
        // 건물 기준 앞쪽(d/2)으로 옮긴 뒤 건물 방향으로 돌린다
        g.translate(0, gate ? 0.008 : 0.01, gate ? 0 : d / 2);
        g.rotateY(p.rot);
        g.translate(p.x, 0, p.z);
        return g;
      })
      .filter((g): g is THREE.PlaneGeometry => g !== null);
  }, [layout]);

  return (
    <group>
      {plazas.map((g, i) => (
        <mesh key={`plaza${i}`} geometry={g} material={brick} receiveShadow />
      ))}
      <mesh geometry={geos.ring} material={brick} receiveShadow />
      <mesh geometry={geos.approach} material={brick} receiveShadow />
      {geos.curbs.map((g, i) => (
        <mesh key={i} geometry={g} material={stone} receiveShadow castShadow />
      ))}
    </group>
  );
}
