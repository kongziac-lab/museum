import type { GalleryLayout } from "@/lib/gallery";

/**
 * 계명대학교 건물 배치 — 분수 광장을 둘러싼 캠퍼스.
 * 건물 모델(campus.glb)은 원점 = 정면 아래 가운데, 정면이 +Z. rot 만큼 돌려 분수 쪽을 보게 세운다.
 * 숲(Forest)과 바닥(Grounds)도 이 배치를 보고 건물 자리·정면 시야를 비워 둔다.
 */
export interface Placement {
  node: string;
  x: number;
  z: number;
  /** Y축 회전 (정면 +Z 가 향하는 쪽) */
  rot: number;
  /** 정면 폭, 건물 깊이 (m) */
  w: number;
  d: number;
  /** 정면 앞 벽돌 광장 깊이 (m, 0이면 없음) */
  plaza: number;
}

export function campusPlan(layout: GalleryLayout): Placement[] {
  const R = layout.radius;
  const facing = (x: number, z: number) => Math.atan2(-x, -z); // 원점(분수)을 보게
  const nw = { x: -(R + 25), z: -(R + 25) };
  return [
    // 입구: 정문 (정면이 바깥, 관람객이 지나 들어온다)
    { node: "bld_gate", x: 0, z: R + 14, rot: 0, w: 54, d: 0, plaza: 0 },
    // 분수 너머 북쪽: 동산도서관
    { node: "bld_library", x: 0, z: -(R + 32), rot: 0, w: 54, d: 32, plaza: 16 },
    // 동쪽: 본관
    { node: "bld_main", x: R + 34, z: -2, rot: -Math.PI / 2, w: 78.5, d: 16, plaza: 12 },
    // 서쪽: 채플
    { node: "bld_chapel", x: -(R + 30), z: 3, rot: Math.PI / 2, w: 25, d: 30, plaza: 12 },
    // 북서쪽: 전산관 자리
    { node: "bld_computing", ...nw, rot: facing(nw.x, nw.z), w: 32, d: 20, plaza: 8 },
  ];
}

/** 월드 좌표 → 건물 기준 좌표 (lx: 정면 가로, lz: 정면 앞쪽 +) */
function toLocal(p: Placement, x: number, z: number) {
  const dx = x - p.x;
  const dz = z - p.z;
  const c = Math.cos(p.rot);
  const s = Math.sin(p.rot);
  return { lx: dx * c - dz * s, lz: dx * s + dz * c };
}

/**
 * 나무를 심으면 안 되는 곳: 건물 자리 + 정면에서 산책로까지의 시야.
 * margin 만큼 넉넉히 본다.
 */
export function blockedByCampus(plan: Placement[], layout: GalleryLayout, x: number, z: number, margin = 3) {
  for (const p of plan) {
    const { lx, lz } = toLocal(p, x, z);
    if (p.node === "bld_gate") {
      // 정문 자리 + 입구 쪽(바깥, +Z)에서 정문이 가리지 않게 앞마당
      if (Math.abs(lx) < p.w / 2 + margin && lz > -3 - margin && lz < 30) return true;
      continue;
    }
    const toRing = Math.hypot(p.x, p.z) - (layout.radius + 3);
    if (Math.abs(lx) < p.w / 2 + margin && lz > -p.d - margin && lz < Math.max(toRing, p.plaza) + margin) return true;
  }
  return false;
}
