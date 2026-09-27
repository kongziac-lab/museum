/**
 * 분수 광장 둘레 산책로 전시 — 배치 계산과 상태.
 *
 * 분수가 원점에 있고, 산책로는 그 둘레를 원으로 돈다. 입구 진입로는 남쪽(+z)에서 곧게 들어온다.
 * 작품은 길 안쪽(분수 쪽) 잔디에 서서, 어느 작품을 보든 뒤로 분수가 보인다.
 * 관람객(카메라)은 분수를 왼쪽에 두고 길을 따라 걸으며 작품 앞에 한 점씩 멈춘다.
 * 위치는 연속값 t 하나로 표현한다: t = -1 입구, t = i 는 i번째 작품 앞.
 */

import * as THREE from "three";
import { create } from "zustand";
import type { ArtworkSource, ExhibitionBackground, ExhibitionInfo } from "./types";

export const WALK = {
  /** 작품 사이 간격 (m, 길을 따라) */
  spacing: 8,
  /** 길 중심에서 작품까지 옆 거리 (m) */
  sideOffset: 2.6,
  /** 작품 앞 몇 m 뒤(길을 따라)에서 보는지 — 비스듬히(약 30°) 봐서 작품 옆으로 분수가 함께 보이게 */
  viewBack: 2.1,
  heroViewBack: 2.4,
  /** 작품 앞에 설 때 길 바깥쪽으로 비켜서는 거리 (m) */
  viewOut: 1.0,
  /** 작품 긴 변 길이 (m) */
  size: 2.0,
  heroSize: 2.8,
  /** 작품 아래 끝 높이 (m) */
  bottom: 0.85,
  /** 눈높이 (m) */
  eye: 1.62,
  /** 진입로가 원에 닿은 뒤 첫 작품까지 여유 (m) */
  lead: 4,
  /** 길 폭 (m) */
  pathWidth: 2.8,
} as const;

export const RING = {
  /** 산책로 원의 최소 반지름 (분수 자갈 띠 모서리 ≈ 8.2m + 작품·잔디 여유) */
  minRadius: 15,
  /** 입구 진입로 길이 (m) — 정문(원에서 14m 바깥)을 지나 들어온다 */
  approach: 34,
} as const;

export interface Stop {
  index: number;
  art: ArtworkSource;
  side: 1 | -1;
  /** 작품 중심 (월드 좌표) */
  center: THREE.Vector3;
  /** 작품이 바라보는 방향 (Y축 회전, rad) */
  yaw: number;
  /** 작품 가로·세로 (m) */
  w: number;
  h: number;
  /** 길 위 관람 위치까지의 거리 (호 길이, m) */
  viewDist: number;
  /** 부문이 바뀌는 첫 작품이면 그 부문 이름 (표지판) */
  groupStart?: string;
}

export interface GalleryLayout {
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** 산책로 원 반지름 (길 가운데 선) */
  radius: number;
  /** 진입로 시작점 z (x = 0) */
  entranceZ: number;
  stops: Stop[];
  /** t → 카메라 위치·시선 */
  pose: (t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => void;
  /** 호 길이 d → 길 위 점과 접선 */
  at: (d: number) => { p: THREE.Vector3; tan: THREE.Vector3; left: THREE.Vector3 };
}

function aspectOf(a: ArtworkSource): number {
  return a.width && a.height ? a.width / a.height : 1.414;
}

/** 작품 i 까지의 원 위 거리 (진입로가 원에 닿은 곳부터, m) */
function ringDist(i: number) {
  return WALK.lead + (i + 0.5) * WALK.spacing;
}

/** 산책로 곡선과 작품 위치를 만든다. */
export function buildLayout(arts: ArtworkSource[], opts: { portrait?: boolean } = {}): GalleryLayout {
  // 세로 화면(휴대폰)은 화면 폭이 좁아서 길 바깥쪽으로 더 비켜서서 본다.
  const out = WALK.viewOut * (opts.portrait ? 1.3 : 1);
  // 캡션 카드가 화면 아래쪽을 가리므로 작품이 화면 위쪽에 오도록 시선을 낮춘다.
  const lookDrop = opts.portrait ? 0.75 : 0.32;
  const n = Math.max(arts.length, 1);
  // 원 둘레 = 작품이 차지하는 길이 + 마지막 작품과 입구 사이 여유
  const ringNeeded = ringDist(n - 1) + WALK.spacing * 1.8;
  const radius = Math.max(RING.minRadius, ringNeeded / (Math.PI * 2));
  const entranceZ = radius + RING.approach;

  // 진입로(남쪽에서 북쪽으로 곧게) → 원(φ=0 남쪽에서 시작, 분수를 왼쪽에 두고 돈다)
  const pts: THREE.Vector3[] = [];
  for (let z = entranceZ + 2; z > radius + 2.5; z -= 2.5) pts.push(new THREE.Vector3(0, 0, z));
  const phiEnd = (ringDist(n - 1) + WALK.spacing * 0.9) / radius;
  const steps = Math.ceil(phiEnd / 0.08);
  for (let k = 0; k <= steps; k++) {
    const phi = 0.22 + (k / steps) * (phiEnd - 0.22);
    pts.push(new THREE.Vector3(Math.sin(phi) * radius, 0, Math.cos(phi) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const length = curve.getLength();
  // 곡선은 입구보다 2m 뒤에서 시작한다. d = 0 이 입구.
  const origin = 2;
  // 진입로가 원에 닿는 곳까지의 곡선 거리 (모퉁이를 부드럽게 돌아 원래보다 조금 짧다)
  const joinDist = RING.approach - 1.2;

  const at = (d: number) => {
    const u = THREE.MathUtils.clamp((origin + d) / length, 0, 1);
    const p = curve.getPointAt(u);
    const tan = curve.getTangentAt(u).setY(0).normalize();
    const left = new THREE.Vector3(tan.z, 0, -tan.x); // 진행 방향 기준 왼쪽
    return { p, tan, left };
  };

  let prevAward: string | undefined;
  const stops: Stop[] = arts.map((art, i) => {
    const hero = Boolean(art.hero);
    const size = hero ? WALK.heroSize : WALK.size;
    const aspect = aspectOf(art);
    const w = aspect >= 1 ? size : size * aspect;
    const h = aspect >= 1 ? size / aspect : size;
    // 작품은 모두 길 안쪽(분수 쪽)에 — 작품 뒤로 분수가 보인다
    const side: 1 | -1 = 1;
    const artDist = joinDist + ringDist(i);
    const back = hero ? WALK.heroViewBack : WALK.viewBack;
    const { p, left } = at(artDist);
    const offset = hero ? WALK.sideOffset + 0.9 : WALK.sideOffset;
    const center = p.clone().addScaledVector(left, side * offset);
    // 관람 위치(길 바깥쪽)를 거의 정면으로 본다 → 관람객 눈에는 작품 뒤로 분수
    const vp = at(artDist - back);
    const view = vp.p.clone().addScaledVector(vp.left, -side * out);
    const yaw = Math.atan2(view.x - center.x, view.z - center.z);
    center.y = WALK.bottom + h / 2;
    const groupStart = art.award && art.award !== prevAward ? art.award : undefined;
    prevAward = art.award;
    return { index: i, art, side, center, yaw, w, h, viewDist: artDist - back, groupStart };
  });

  const lookTmp = new THREE.Vector3();
  const pose = (t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    const last = stops.length - 1;
    const tt = THREE.MathUtils.clamp(t, -1, Math.max(last, 0));
    const i0 = Math.floor(tt);
    const f = tt - i0;
    const distOf = (i: number) => (i < 0 ? 0 : stops[i]?.viewDist ?? 0);
    const d = THREE.MathUtils.lerp(distOf(i0), distOf(Math.min(i0 + 1, last)), f);
    const { p, tan, left } = at(d);
    // 작품 앞에서는 길 바깥쪽으로 비켜선다 (걷는 동안 부드럽게)
    const outOf = (i: number) => (i < 0 || !stops[i] ? 0 : out);
    const lateral = THREE.MathUtils.lerp(outOf(i0), outOf(Math.min(i0 + 1, last)), f);
    outPos.set(p.x - left.x * lateral, WALK.eye, p.z - left.z * lateral);

    const lookOf = (i: number, target: THREE.Vector3) => {
      if (i < 0 || !stops[i]) {
        // 입구: 정문 너머 분수를 본다 (정문 박공까지 보이게 살짝 위로)
        return target.set(0, 3.4, 0);
      }
      const s = stops[i];
      return target.set(s.center.x, s.center.y - lookDrop, s.center.z);
    };
    const a = lookOf(i0, outLook);
    const b = lookOf(Math.min(i0 + 1, last), lookTmp);
    // 걷는 중간에는 길 앞쪽을 보고, 작품에 가까워지면 작품을 본다.
    const k = THREE.MathUtils.smoothstep(f, 0.2, 0.85);
    a.lerp(b, k);
    if (f > 0.05 && f < 0.95) {
      const ahead = new THREE.Vector3(p.x + tan.x * 10, WALK.eye, p.z + tan.z * 10);
      const mid = Math.sin(Math.PI * f) * 0.55;
      a.lerp(ahead, mid);
    }
  };

  return { curve, length, radius, entranceZ, stops, pose, at };
}

/** 관람 상태 (HTML 오버레이와 3D 씬이 함께 쓴다). */
interface GalleryState {
  arts: ArtworkSource[];
  info: ExhibitionInfo;
  background: ExhibitionBackground | null;
  loaded: boolean;
  setData: (arts: ArtworkSource[], info: ExhibitionInfo, bg: ExhibitionBackground | null) => void;
  /** 배경 모델·텍스처를 다 불러왔는지 */
  sceneryReady: boolean;

  /** 목표 위치 (카메라가 부드럽게 따라감) */
  target: number;
  setTarget: (t: number) => void;
  /** 현재 카메라 위치 (씬이 매 프레임 갱신, UI용으로 10Hz 반영) */
  current: number;
  setCurrent: (t: number) => void;

  started: boolean;
  start: () => void;

  /** 크게 보기 */
  detail: number | null;
  openDetail: (i: number | null) => void;

  listOpen: boolean;
  toggleList: (v?: boolean) => void;
}

export const useGallery = create<GalleryState>((set, get) => ({
  arts: [],
  info: {},
  background: null,
  loaded: false,
  setData: (arts, info, background) => set({ arts, info, background, loaded: true }),
  sceneryReady: false,

  target: -1,
  setTarget: (t) => {
    const n = get().arts.length;
    set({ target: THREE.MathUtils.clamp(t, -1, Math.max(n - 1, 0)) });
  },
  current: -1,
  setCurrent: (current) => set({ current }),

  started: false,
  start: () => set({ started: true, target: 0 }),

  detail: null,
  openDetail: (detail) => set({ detail }),

  listOpen: false,
  toggleList: (v) => set((s) => ({ listOpen: v ?? !s.listOpen })),
}));

/** 작품 i 로 이동 (관람 시작 전이면 시작 처리도 함께). */
export function goTo(i: number) {
  const s = useGallery.getState();
  if (!s.started) useGallery.setState({ started: true });
  s.setTarget(i);
}

/** 현재 가장 가까운 작품 번호 (-1 = 입구) */
export function nearestIndex(t: number) {
  return Math.round(t);
}
