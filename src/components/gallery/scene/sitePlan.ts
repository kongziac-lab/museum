import type { GalleryLayout } from "@/lib/gallery";

/**
 * 계명대학교 성서캠퍼스 정문 → 대로 → 벽돌 광장 → 분수 → 동산도서관 (남 → 북, +z → −z).
 * 캠퍼스 소개 영상(0~36초)과 광장에서 찍은 사진을 보고 거리만 줄여 배치했다.
 * 분수가 원점, 작품이 도는 원의 반지름이 R. 모든 위치는 R을 기준으로 잡아 작품 수가 늘어도 겹치지 않는다.
 */

export interface Placement {
  node: string;
  x: number;
  y?: number;
  z: number;
  /** Y축 회전 (모델 정면 +Z 가 향하는 쪽) */
  rot: number;
  /** 정면 폭, 깊이 (나무를 비울 자리 계산용) */
  w: number;
  d: number;
}

export interface Planter {
  x: number;
  z: number;
  /** 네모: 가로(x)·세로(z) / 둥근: 반지름 */
  w: number;
  d: number;
  round?: boolean;
  /** 안에 심은 것 */
  fill: "hedge" | "pine" | "ball" | "balls" | "grass";
  rock?: boolean;
}

export interface SitePlan {
  R: number;
  /** 광장 반폭, 남쪽 끝, 북쪽 끝 */
  plazaX: number;
  plazaS: number;
  plazaN: number;
  /** 분수 잔디 화단 반폭 */
  bed: number;
  /** 대로: 남쪽 끝(정문 너머), 차도 반폭, 가운데 보행로 반폭, 보도 바깥 */
  roadS: number;
  roadX: number;
  medianX: number;
  walkX: number;
  gateZ: number;
  buildings: Placement[];
  planters: Planter[];
  /** 광장 가로수 (격자 틀) */
  gratedTrees: [number, number][];
  /** 흰 화강암 계단 띠 z 위치 */
  steps: number[];
  /** 비석 받침 */
  steles: { x: number; z: number };
  /** 본관이 선 언덕 (가우스 봉우리) */
  hill: { x: number; z: number; h: number; r: number };
}

export function sitePlan(layout: GalleryLayout): SitePlan {
  const R = layout.radius;
  const plazaX = Math.max(24, R + 8);
  const plazaS = R + 36;
  const plazaN = -(R + 44);
  const gateZ = R + 80;
  const hill = { x: -135, z: -(R + 230), h: 26, r: 90 };

  const buildings: Placement[] = [
    { node: "bld_gate", x: 0, z: gateZ, rot: 0, w: 64, d: 6 },
    { node: "bld_library", x: 0, z: plazaN - 2, rot: 0, w: 54, d: 32 },
    // 대로 양옆 녹색 지붕 건물 (정면이 대로를 본다)
    { node: "bld_side_w", x: -44, z: R + 58, rot: Math.PI / 2, w: 56, d: 16 },
    { node: "bld_side_e", x: 42, z: R + 52, rot: -Math.PI / 2, w: 48, d: 14 },
    // 왼쪽 뒤 먼 언덕 위 본관 (광장을 내려다본다)
    { node: "bld_main", x: hill.x, z: hill.z, rot: Math.atan2(-hill.x, -hill.z), w: 78.5, d: 16 },
  ];

  const planters: Planter[] = [
    // 남쪽: 가운데 둥근 향나무·표석, 양옆 네모 화단과 둥근 향나무
    { x: 0, z: R + 12, w: 3.2, d: 3.2, round: true, fill: "ball", rock: true },
    { x: -9, z: R + 29, w: 1.8, d: 1.8, round: true, fill: "ball" },
    { x: 9, z: R + 29, w: 1.8, d: 1.8, round: true, fill: "ball" },
    { x: -14, z: R + 17, w: 6, d: 2.6, fill: "hedge" },
    { x: 14, z: R + 17, w: 6, d: 2.6, fill: "hedge" },
    { x: -15, z: R + 8, w: 3.4, d: 3.4, fill: "pine" },
    { x: 15, z: R + 8, w: 3.4, d: 3.4, fill: "pine" },
    // 북쪽: 가운데 긴 화단(둥근 향나무 셋), 반송 화단, 회양목 화단
    { x: 0, z: -(R + 20), w: 3, d: 10, fill: "balls" },
    { x: -14, z: -(R + 8), w: 3.4, d: 3.4, fill: "pine" },
    { x: 14, z: -(R + 8), w: 3.4, d: 3.4, fill: "pine" },
    { x: 13, z: -(R + 28), w: 7, d: 2.6, fill: "hedge", rock: true },
    { x: -6, z: -(R + 34), w: 5, d: 2.4, fill: "hedge" },
    { x: 6, z: -(R + 36), w: 5, d: 2.4, fill: "grass" },
  ];

  const gratedTrees: [number, number][] = [];
  const edge = plazaX - 3;
  for (let z = plazaS - 4; z > plazaN + 6; z -= 9) {
    if (Math.abs(z) < R + 4) continue; // 작품 원 옆은 비운다
    gratedTrees.push([-edge, z], [edge, z]);
  }

  const plan: SitePlan = {
    R,
    plazaX,
    plazaS,
    plazaN,
    bed: 9,
    roadS: gateZ + 40,
    roadX: 15,
    medianX: 7.6,
    walkX: 19,
    gateZ,
    buildings,
    planters,
    gratedTrees,
    steps: [R + 22, R + 22.6, R + 23.2],
    steles: { x: -13, z: -(R + 16) },
    hill,
  };
  // 본관은 언덕 꼭대기 땅 높이에 조금 묻어 세운다
  const main = buildings.find((b) => b.node === "bld_main")!;
  main.y = groundHeight(plan, main.x, main.z) - 1.5;
  return plan;
}

/** 언덕 높이 (본관 언덕 + 멀리 둘러싼 산) — 땅(Terrain)과 본관 위치가 같이 쓴다 */
export function groundHeight(plan: SitePlan, x: number, z: number) {
  const { hill } = plan;
  const d = Math.hypot(x, z);
  const dh = Math.hypot(x - hill.x, z - hill.z);
  // 광장 둘레(110 m 안)는 평평하게
  const flat = Math.min(Math.max((d - 110) / 60, 0), 1);
  let h = hill.h * Math.exp(-(dh * dh) / (2 * hill.r * hill.r)) * flat * flat * (3 - 2 * flat);
  // 광장에서 멀어질수록 숲 언덕이 솟는다
  const ring = Math.max(0, d - 190) / 260;
  if (ring > 0) {
    const a = Math.atan2(z, x);
    const ridge = 0.55 + 0.25 * Math.sin(a * 3 + 1.1) + 0.15 * Math.sin(a * 7 + 0.4) + 0.08 * Math.sin(a * 13 + 2.3);
    h += Math.min(ring, 1) ** 1.6 * 110 * ridge;
  }
  return h;
}

/** 나무를 심지 않을 곳: 광장·대로·건물·화단 */
export function blockedBySite(plan: SitePlan, x: number, z: number, margin = 2.5) {
  if (Math.abs(x) < plan.plazaX + margin - 4 && z < plan.plazaS + margin && z > plan.plazaN - 36) return true;
  if (Math.abs(x) < plan.walkX + margin && z >= plan.plazaS - 2 && z < plan.roadS + 8) return true;
  for (const b of plan.buildings) {
    const dx = x - b.x;
    const dz = z - b.z;
    const c = Math.cos(b.rot);
    const s = Math.sin(b.rot);
    const lx = dx * c - dz * s;
    const lz = dx * s + dz * c;
    if (Math.abs(lx) < b.w / 2 + margin && lz > -b.d - margin && lz < 8 + margin) return true;
  }
  return false;
}
