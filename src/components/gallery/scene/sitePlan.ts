import type { GalleryLayout } from "@/lib/gallery";

/**
 * 계명대학교 성서캠퍼스 정문 → 대로 → 벽돌 광장 → 분수 → 동산도서관 (남 → 북, +z → −z, 동쪽 = +x, 1 = 1 m).
 * 캠퍼스 소개 영상·광장 사진·캠퍼스 안내도와 OpenStreetMap 건물 윤곽·학교 공식 지도 표시(분수 기준 방위·거리)로 맞췄다.
 * 정문~광장 대로만 실제(약 340 m)보다 줄였고, 나머지는 실제 위치다.
 *  - 도서관 남쪽 벽: 분수 북쪽 64 m
 *  - 전산교육원(정보전산원): 분수 동쪽 40~71 m, 남 21 ~ 북 7 m, 3층
 *  - 행소관(본관): 분수 동쪽 117~195 m 평지, 정면은 남쪽 (광장에서는 전산교육원 뒤)
 *  - 아담스채플: 가운데 박공 발치가 북서 316° 345 m, 광장보다 약 42 m 높은 궁산 기슭, 긴 면이 남남동(155°)을 본다, 약 78 × 24 m
 *  - 계명한학촌: 두 무리 — 북서 333° 181 m(10~15 m 높은 비탈), 316° 228 m(채플 바로 아래, 약 20 m) / 의양관: 서 292° 210 m, 비탈 시작
 *  - 대로 동쪽 동천관(대학원) · 서쪽 바우어관, 북쪽은 궁산 숲, 남쪽으로 트임
 * 분수가 원점, 작품이 도는 원의 반지름이 R.
 */

export interface Placement {
  node: string;
  x: number;
  y?: number;
  z: number;
  /** Y축 회전 (모델 정면 +Z 가 향하는 쪽) */
  rot: number;
  /** 모델 크기 배율 (기본 1) */
  scale?: number;
  /** 비탈 위 건물: 땅을 반지름 r 안에서 높이 h로 고르고 그 위에 세운다 (off = 터 중심의 모델 좌표 [x, z], 배율 전) */
  pad?: { r: number; h: number; off?: [number, number] };
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

/** 조형물 (campus.glb 의 prop_* 를 복제해 세운다) */
export interface Prop {
  node: string;
  x: number;
  y?: number;
  z: number;
  /** Y축 회전 (모델 정면 +Z 가 향하는 쪽) */
  rot: number;
  scale?: number;
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
  /** 비석 무리 (prop_steles) 자리 */
  steles: { x: number; z: number };
  /** 사진(2026-09-28)으로 만든 조형물: 정문 앞 책 표석, 비석, 계명인 상, 시비, 가로등, 벤치 */
  props: Prop[];
  /** 산 중턱 건물 터: 땅을 평평하게 고르고(높이 h), 둘레는 잔디 */
  pads: Pad[];
}

export interface Pad {
  x: number;
  z: number;
  r: number;
  h: number;
}

export function sitePlan(layout: GalleryLayout): SitePlan {
  const R = layout.radius;
  const plazaX = Math.max(36, R + 8);
  const plazaS = R + 36;
  const plazaN = -(R + 44);
  const gateZ = R + 80;
  // 방위(0 = 북, 90 = 동)·거리 → 장면 좌표
  const at = (bearing: number, dist: number) => {
    const a = (bearing * Math.PI) / 180;
    return { x: Math.sin(a) * dist, z: -Math.cos(a) * dist };
  };
  // 정면 방위 → 회전 (모델 정면 +Z)
  const faceTo = (bearing: number) => {
    const a = (bearing * Math.PI) / 180;
    return Math.atan2(Math.sin(a), -Math.cos(a));
  };
  const east = Math.max(R + 23, 40); // 전산교육원 서쪽 벽 (작품 원이 커지면 함께 밀려난다)
  const chapel = at(316, 345);
  const hanokE = at(333, 181);
  const hanokW = at(316, 228);
  const euiyang = at(292, 210);
  const buildings: Placement[] = [
    { node: "bld_gate", x: 0, z: gateZ, rot: 0, w: 64, d: 6 },
    { node: "bld_library", x: 0, z: plazaN - 2, rot: 0, w: 54, d: 32 },
    // 전산교육원: 광장 동쪽 가장자리, 정면이 광장(서쪽)을 본다 (모델 28 m 폭 × 18 m 깊이 → 실제 약 28 × 31 m)
    { node: "bld_edu", x: east, z: 7, rot: -Math.PI / 2, w: 28, d: 31 },
    // 행소관(본관): 전산교육원 뒤 동쪽 평지, 정면은 남쪽
    { node: "bld_main", x: east + 116, z: 3, rot: 0, w: 78.5, d: 16 },
    // 대로 동쪽 동천관(녹색 지붕) · 서쪽 바우어관 (정면이 대로를 본다)
    { node: "bld_side_e", x: 42, z: R + 58, rot: -Math.PI / 2, w: 48, d: 14 },
    { node: "bld_side_w", x: -44, z: R + 62, rot: Math.PI / 2, w: 56, d: 16 },
    // 의양관: 서쪽 비탈 시작 (붉은 벽돌 큰 건물)
    { node: "bld_side_w", x: euiyang.x, z: euiyang.z, rot: faceTo(100), w: 73, d: 21, scale: 1.3, pad: { r: 48, h: 6 } },
    // 궁산 기슭 아담스채플(실제 크기, 긴 면이 남남동). 모델은 서쪽 탑 −35 ~ 동쪽 꼬리 +43.5 m, 앞 테라스·계단 +24 m, 뒤 −24 m
    { node: "bld_adams", x: chapel.x, z: chapel.z, rot: faceTo(155), w: 80, d: 26, pad: { r: 44, h: 42, off: [4.25, -8] } },
    // 그 아래 비탈의 한학촌 두 무리
    { node: "bld_hanok", x: hanokE.x, z: hanokE.z, rot: faceTo(160), w: 40, d: 24, pad: { r: 32, h: 14 } },
    { node: "bld_hanok", x: hanokW.x, z: hanokW.z, rot: faceTo(180), w: 40, d: 24, pad: { r: 30, h: 20 } },
  ];

  const planters: Planter[] = [
    // 남쪽: 가운데 둥근 향나무·표석, 양옆 네모 화단과 둥근 향나무
    { x: 0, z: R + 12, w: 3.4, d: 3.4, round: true, fill: "grass" }, // 계명인 상 (props)
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
  const benches: [number, number][] = [];
  const edge = plazaX - 3;
  for (let z = plazaS - 4; z > plazaN + 6; z -= 9) {
    if (Math.abs(z) < R + 4) continue; // 작품 원 옆은 비운다
    gratedTrees.push([-edge, z], [edge, z]);
    if (Math.abs(z - 4.5) >= R + 4 && z - 4.5 > plazaN + 6) benches.push([-edge - 0.4, z - 4.5], [edge + 0.4, z - 4.5]);
  }

  // 조형물 자리 — 사진의 GPS(분수 기준 방위·거리)에 맞추되, 대로처럼 줄인 곳은 비율대로
  const WALL_H = 0.55; // Planters 의 화단 벽 높이
  const props: Prop[] = [
    // 정문 남쪽 가운데 화단(서쪽 잔디 띠)의 책 표석 — 입구 카메라 쪽으로 조금 돌린다
    { node: "prop_gate_sign", x: -4.6, z: gateZ + 14, rot: 0.3 },
    // 비석 무리 (도서관 서쪽 앞), 책 모양 비석 (동쪽 앞)
    { node: "prop_steles", x: -14, z: -(R + 16), rot: 0 },
    { node: "prop_book_stone", x: 13, z: -(R + 15), rot: -0.15 },
    // 남쪽 반송 화단 옆 방패 모양 시비, 광장 남쪽 가운데 둥근 화단의 계명인 상
    { node: "prop_shield_stone", x: -11, z: R + 9, rot: 0.35 },
    { node: "prop_keimyung_rock", x: 0, y: WALL_H + 0.05, z: R + 12, rot: 0 },
  ];
  for (const [x, z] of benches) props.push({ node: "prop_bench", x, z, rot: x < 0 ? Math.PI / 2 : -Math.PI / 2 });
  // 구리빛 가로등: 광장 둘레 (팔이 광장 안쪽을 보게)
  const lampX = plazaX - 6;
  for (const z of [R + 22, R + 2, -(R + 4), -(R + 26)]) {
    props.push({ node: "prop_lamp", x: -lampX, z, rot: Math.PI / 2 }, { node: "prop_lamp", x: lampX, z, rot: -Math.PI / 2 });
  }
  props.push({ node: "prop_lamp", x: -5, z: -(R + 40), rot: Math.PI / 2 }, { node: "prop_lamp", x: 5, z: -(R + 40), rot: -Math.PI / 2 });

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
    steles: { x: -14, z: -(R + 16) },
    props,
    pads: [],
  };
  // 비탈 위 건물 터를 고르고 그 높이에 세운다 (채플 모델은 원점이 가운데가 아니라서 터 중심을 옮긴다)
  for (const b of buildings) {
    const spec = b.pad;
    if (!spec) continue;
    const s = b.scale ?? 1;
    const [ox, oz] = spec.off ?? [0, 0];
    const cx = b.x + (ox * Math.cos(b.rot) + oz * Math.sin(b.rot)) * s;
    const cz = b.z + (-ox * Math.sin(b.rot) + oz * Math.cos(b.rot)) * s;
    plan.pads.push({ x: cx, z: cz, r: spec.r, h: spec.h });
    b.y = spec.h - 0.3;
  }
  return plan;
}

const smooth = (a: number, b: number, v: number) => {
  const t = Math.min(Math.max((v - a) / (b - a), 0), 1);
  return t * t * (3 - 2 * t);
};

/**
 * 산: 북쪽 궁산은 도서관 뒤(약 130 m)부터 오르기 시작해 채플(345 m) 근처에서 약 50 m (채플 터는 42 m로 깎아 고른다),
 * 서쪽은 의양관(210 m) 무렵부터, 동쪽은 행소관 너머(240 m)부터 오르고, 남쪽(정문 쪽)은 멀리서 낮게.
 */
function mountain(x: number, z: number) {
  const d = Math.hypot(x, z);
  if (d < 1) return 0;
  const n = -z / d; // 1 = 북
  const e = x / d; // 1 = 동
  const start = 300 - 170 * Math.max(n, 0) - 90 * Math.max(-e, 0) - 60 * Math.max(e, 0) + 120 * Math.max(-n, 0);
  const t = Math.max(0, d - start) / 300;
  if (t <= 0) return 0;
  const a = Math.atan2(z, x);
  const ridge = 0.7 + 0.18 * Math.sin(a * 3 + 1.1) + 0.1 * Math.sin(a * 7 + 0.4) + 0.05 * Math.sin(a * 13 + 2.3);
  const tall = 55 + 30 * Math.max(n, 0) + 20 * Math.max(-e, 0) + 20 * Math.max(e, 0) - 25 * Math.max(-n, 0);
  // 한학촌 ≈ 16 · 24 m, 채플 ≈ 54 m, 600 m 북 ≈ 126 m, 1 km 밖 궁산 ≈ 250 m
  return Math.min(t, 3.5) ** 1.1 * tall * ridge;
}

/** 땅 높이 — 땅(Terrain)과 산 중턱 건물 위치가 같이 쓴다. 건물 터(pads)는 평평하게 고른다. */
export function groundHeight(plan: SitePlan, x: number, z: number) {
  let h = mountain(x, z);
  for (const p of plan.pads) {
    const k = smooth(p.r + 45, p.r, Math.hypot(x - p.x, z - p.z));
    h = h * (1 - k) + p.h * k;
  }
  return h;
}

/** 나무를 심지 않을 곳: 광장·대로·건물·화단 */
export function blockedBySite(plan: SitePlan, x: number, z: number, margin = 2.5) {
  if (Math.abs(x) < plan.plazaX + margin - 4 && z < plan.plazaS + margin && z > plan.plazaN - 36) return true;
  if (Math.abs(x) < plan.walkX + margin && z >= plan.plazaS - 2 && z < plan.roadS + 8) return true;
  for (const p of plan.pads) if (Math.hypot(x - p.x, z - p.z) < p.r + margin) return true;
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
