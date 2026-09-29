"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SCENERY, preparePbr } from "./common";
import type { SitePlan } from "./sitePlan";

/*
 * 광장 바닥: 헤링본 벽돌 포장 · 분수 잔디 화단 · 대로(아스팔트·가운데 보행로·보도) · 흰 화강암 띠 · 가로수 틀 · 비석.
 * 모든 면의 UV는 m 단위이고, 재질 텍스처가 한 장 크기(TILE)로 반복한다.
 */

const TILE = { brick: 1.6, granite: 0.8, asphalt: 3, grass: 2.4, wall: 1.2, hedge: 0.8 };

/* ───────────────────────── 재질 ───────────────────────── */

export function useSiteMaterials() {
  const brick = useTexture([SCENERY.tex("herringbone_diffuse"), SCENERY.tex("herringbone_nor_gl"), SCENERY.tex("herringbone_arm")]);
  const granite = useTexture([SCENERY.tex("granite_diffuse"), SCENERY.tex("granite_nor_gl"), SCENERY.tex("granite_arm")]);
  const asphalt = useTexture([SCENERY.tex("asphalt_diffuse"), SCENERY.tex("asphalt_nor_gl"), SCENERY.tex("asphalt_arm")]);
  const grass = useTexture([SCENERY.tex("sparse_grass_diffuse"), SCENERY.tex("sparse_grass_nor_gl"), SCENERY.tex("sparse_grass_arm")]);
  const wall = useTexture([SCENERY.tex("wallbrick_diffuse"), SCENERY.tex("wallbrick_nor_gl"), SCENERY.tex("wallbrick_arm")]);
  const hedge = useTexture([SCENERY.tex("hedge_diffuse"), SCENERY.tex("hedge_nor_gl"), SCENERY.tex("hedge_arm")]);
  return useMemo(() => {
    const std = (set: THREE.Texture[], tile: number | [number, number], extra: THREE.MeshStandardMaterialParameters = {}) => {
      const t = preparePbr(set, 1);
      const [tx, ty] = typeof tile === "number" ? [tile, tile] : tile;
      for (const tex of set) tex.repeat.set(1 / tx, 1 / ty);
      return new THREE.MeshStandardMaterial({ ...t, roughness: 1, ...extra });
    };
    return {
      brick: std(brick, TILE.brick, { normalScale: new THREE.Vector2(1.1, 1.1) }),
      granite: std(granite, TILE.granite, { roughness: 1 }),
      asphalt: std(asphalt, TILE.asphalt),
      grass: std(grass, TILE.grass, { normalScale: new THREE.Vector2(0.9, 0.9) }),
      wall: std(wall, [TILE.wall, TILE.wall / 2]),
      hedge: std(hedge, TILE.hedge, { normalScale: new THREE.Vector2(1.4, 1.4) }),
      paint: new THREE.MeshStandardMaterial({ color: "#e9e7e1", roughness: 0.8 }),
      dark: new THREE.MeshStandardMaterial({ color: "#2b2c2e", roughness: 0.45, metalness: 0.1 }),
      grate: new THREE.MeshStandardMaterial({ color: "#3a3631", roughness: 0.7, metalness: 0.5 }),
    };
  }, [brick, granite, asphalt, grass, wall, hedge]);
}

export type SiteMaterials = ReturnType<typeof useSiteMaterials>;

/* ───────────────────────── 도형 도우미 ───────────────────────── */

/** 면 방향에 맞춰 UV를 m 단위로 투영 (상자·원통 모두) */
export function projectUV(g: THREE.BufferGeometry, ox = 0, oz = 0) {
  const p = g.getAttribute("position");
  const n = g.getAttribute("normal");
  const uv = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) {
    const ax = Math.abs(n.getX(i));
    const ay = Math.abs(n.getY(i));
    const az = Math.abs(n.getZ(i));
    const x = p.getX(i) + ox;
    const y = p.getY(i);
    const z = p.getZ(i) + oz;
    if (ay >= ax && ay >= az) [uv[i * 2], uv[i * 2 + 1]] = [x, -z];
    else if (ax >= az) [uv[i * 2], uv[i * 2 + 1]] = [z, y];
    else [uv[i * 2], uv[i * 2 + 1]] = [x, y];
  }
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  return g;
}

/** 바닥에 까는 사각형 (x0..x1, z0..z1, 높이 y) */
function rect(x0: number, x1: number, z0: number, z1: number, y: number) {
  const g = new THREE.PlaneGeometry(x1 - x0, z1 - z0);
  g.rotateX(-Math.PI / 2);
  g.translate((x0 + x1) / 2, y, (z0 + z1) / 2);
  return projectUV(g);
}

/** 상자 (가운데 x,z, 바닥 y0) */
function slab(cx: number, cz: number, w: number, d: number, y0: number, h: number) {
  const g = new THREE.BoxGeometry(w, h, d);
  g.translate(cx, y0 + h / 2, cz);
  return projectUV(g);
}

/** 여러 도형을 재질별로 한 덩어리로 (그리는 횟수를 줄인다) */
function merge(list: THREE.BufferGeometry[]) {
  if (list.length === 0) return null;
  const out = new THREE.BufferGeometry();
  let count = 0;
  for (const g of list) count += g.getAttribute("position").count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const uv = new Float32Array(count * 2);
  const idx: number[] = [];
  let o = 0;
  for (const g0 of list) {
    const g = g0.index ? g0 : g0;
    const p = g.getAttribute("position");
    const n = g.getAttribute("normal");
    const u = g.getAttribute("uv");
    pos.set(p.array as Float32Array, o * 3);
    nrm.set(n.array as Float32Array, o * 3);
    uv.set(u.array as Float32Array, o * 2);
    if (g.index) for (let i = 0; i < g.index.count; i++) idx.push(g.index.getX(i) + o);
    else for (let i = 0; i < p.count; i++) idx.push(i + o);
    o += p.count;
  }
  out.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  out.setAttribute("normal", new THREE.BufferAttribute(nrm, 3));
  out.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  out.setIndex(idx);
  out.computeBoundingSphere();
  return out;
}

/** 원호 띠 (가운데 cx,cz, 반지름 r, 폭 w, 각도 a0~a1: 0 = +x, 반시계) */
function arcBand(cx: number, cz: number, r: number, w: number, a0: number, a1: number, y: number) {
  const n = Math.max(8, Math.ceil(Math.abs(a1 - a0) * r / 0.6));
  const pos: number[] = [];
  const idx: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = a0 + ((a1 - a0) * i) / n;
    for (const rr of [r - w / 2, r + w / 2]) pos.push(cx + Math.cos(a) * rr, y, cz - Math.sin(a) * rr);
    if (i > 0) {
      const k = i * 2;
      idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setIndex(idx);
  g.computeVertexNormals();
  if (g.getAttribute("normal").getY(0) < 0) {
    const ix = g.getIndex()!.array as Uint16Array | Uint32Array;
    for (let i = 0; i < ix.length; i += 3) [ix[i + 1], ix[i + 2]] = [ix[i + 2], ix[i + 1]];
    g.computeVertexNormals();
  }
  return projectUV(g);
}

/* ───────────────────────── 광장 · 대로 ───────────────────────── */

export function Site({ plan, mats }: { plan: SitePlan; mats: SiteMaterials }) {
  const geos = useMemo(() => {
    const { plazaX, plazaS, plazaN, bed, roadS, roadX, medianX, walkX } = plan;
    const brick: THREE.BufferGeometry[] = [];
    const granite: THREE.BufferGeometry[] = [];
    const asphalt: THREE.BufferGeometry[] = [];
    const grass: THREE.BufferGeometry[] = [];
    const paint: THREE.BufferGeometry[] = [];
    const dark: THREE.BufferGeometry[] = [];
    const grate: THREE.BufferGeometry[] = [];
    const hedge: THREE.BufferGeometry[] = [];

    // 광장 (분수 잔디 화단 자리는 비워서 네 조각으로)
    brick.push(rect(-plazaX, plazaX, bed, plazaS, 0.01), rect(-plazaX, plazaX, plazaN, -bed, 0.01));
    brick.push(rect(-plazaX, -bed, -bed, bed, 0.01), rect(bed, plazaX, -bed, bed, 0.01));
    // 도서관 앞까지 이어지는 포장
    brick.push(rect(-30, 30, plazaN - 14, plazaN, 0.01));

    // 분수 잔디 화단 + 흰 화강암 경계석
    grass.push(rect(-bed, bed, -bed, bed, 0.02));
    const cw = 0.36;
    granite.push(
      slab(0, -bed, bed * 2 + cw, cw, 0, 0.18),
      slab(0, bed, bed * 2 + cw, cw, 0, 0.18),
      slab(-bed, 0, cw, bed * 2, 0, 0.18),
      slab(bed, 0, cw, bed * 2, 0, 0.18)
    );

    // 흰 화강암 계단 띠 (영상 28초: 광장을 가로지르는 흰 줄)
    for (const z of plan.steps) granite.push(slab(0, z, plazaX * 2 - 6, 0.34, 0, 0.04));
    // 광장 입구 곡선 띠 (영상 25초)
    const cz = plazaS + 5;
    for (const r of [11, 15, 19]) {
      const half = Math.acos(Math.min(1, 5 / r)) * 0.95;
      // 광장 쪽(북쪽, a ≈ π/2)으로 휘는 부분만
      granite.push(arcBand(0, cz, r, 0.34, Math.PI / 2 - half, Math.PI / 2 + half, 0.035));
    }

    // 가로수 격자 틀
    for (const [x, z] of plan.gratedTrees) {
      granite.push(slab(x, z, 1.9, 1.9, 0, 0.05));
      grate.push(rect(x - 0.8, x + 0.8, z - 0.8, z + 0.8, 0.055));
    }

    // 비석 무리는 조형물(prop_steles, campus.glb)로 세운다

    // 대로: 차도(아스팔트) · 가운데 보행로와 화단 · 보도
    const z0 = plazaS;
    asphalt.push(rect(medianX, roadX, z0, roadS, 0.012), rect(-roadX, -medianX, z0, roadS, 0.012));
    // 광장 남쪽 끝을 가로지르는 길 (회전 교차로 대신) — 서쪽은 바우어관 앞에서 끝나고, 동쪽은 동천관 앞마당을 따라간다
    asphalt.push(rect(-(walkX + 21), plan.crossE, z0, z0 + 12, 0.011));
    const [fx0, fx1, fz0, fz1] = plan.forecourt;
    brick.push(rect(fx0, fx1, fz0, fz1, 0.013));
    brick.push(rect(-1.6, 1.6, z0 + 12, roadS, 0.013));
    grass.push(rect(1.6, medianX, z0 + 12, roadS, 0.014), rect(-medianX, -1.6, z0 + 12, roadS, 0.014));
    for (const s of [-1, 1]) {
      granite.push(slab(s * medianX, (z0 + 12 + roadS) / 2, 0.3, roadS - z0 - 12, 0, 0.15));
      granite.push(slab(s * 1.6, (z0 + 12 + roadS) / 2, 0.22, roadS - z0 - 12, 0, 0.1));
      // 가운데 화단 산울타리 — 서쪽은 정문 앞 책 표석 자리(gateZ + 14 ± 3.5)를 비운다
      const cuts = s < 0 ? [[plan.gateZ + 10.5, plan.gateZ + 17.5]] : [];
      let from = z0 + 14;
      for (const [c0, c1] of [...cuts, [roadS - 2, roadS - 2]]) {
        if (c0 > from) hedge.push(projectUV(new THREE.BoxGeometry(1.1, 0.7, c0 - from).translate(s * 4.6, 0.35, (from + c0) / 2)));
        from = c1;
      }
      brick.push(rect(s > 0 ? roadX : -walkX, s > 0 ? walkX : -roadX, z0 + 12, roadS, 0.013));
      granite.push(slab(s * roadX, (z0 + 12 + roadS) / 2, 0.3, roadS - z0 - 12, 0, 0.14));
    }
    // 차선: 가장자리 실선 · 가운데 점선 · 건널목
    for (const s of [-1, 1]) {
      paint.push(rect(s * (medianX + 0.3) - 0.07, s * (medianX + 0.3) + 0.07, z0 + 12, roadS, 0.02));
      paint.push(rect(s * (roadX - 0.3) - 0.07, s * (roadX - 0.3) + 0.07, z0 + 12, roadS, 0.02));
      const mid = s * (medianX + roadX) / 2;
      for (let z = z0 + 16; z < roadS - 2; z += 9) paint.push(rect(mid - 0.07, mid + 0.07, z, z + 4.5, 0.02));
    }
    for (let x = -walkX; x < walkX; x += 1.1) paint.push(rect(x, x + 0.55, z0 + 3.5, z0 + 8.5, 0.02));
    // 동천관 현관 앞 건널목
    const dx = (fx0 + fx1) / 2;
    for (let z = z0 + 0.6; z < z0 + 11.5; z += 1.1) paint.push(rect(dx - 2.5, dx + 2.5, z, z + 0.55, 0.02));

    return {
      brick: merge(brick),
      granite: merge(granite),
      asphalt: merge(asphalt),
      grass: merge(grass),
      paint: merge(paint),
      dark: merge(dark),
      grate: merge(grate),
      hedge: merge(hedge),
    };
  }, [plan]);

  return (
    <group>
      {geos.brick && <mesh geometry={geos.brick} material={mats.brick} receiveShadow />}
      {geos.granite && <mesh geometry={geos.granite} material={mats.granite} receiveShadow castShadow />}
      {geos.asphalt && <mesh geometry={geos.asphalt} material={mats.asphalt} receiveShadow />}
      {geos.grass && <mesh geometry={geos.grass} material={mats.grass} receiveShadow />}
      {geos.paint && <mesh geometry={geos.paint} material={mats.paint} receiveShadow />}
      {geos.dark && <mesh geometry={geos.dark} material={mats.dark} receiveShadow castShadow />}
      {geos.grate && <mesh geometry={geos.grate} material={mats.grate} receiveShadow />}
      {geos.hedge && <mesh geometry={geos.hedge} material={mats.hedge} receiveShadow castShadow />}
    </group>
  );
}
