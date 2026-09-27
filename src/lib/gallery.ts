/**
 * 분수 광장 둘레 산책로 전시 — 배치 계산과 상태.
 *
 * 분수가 원점에 있고, 산책로는 그 둘레를 원으로 돈다. 입구 진입로는 남쪽(+z)에서 곧게 들어온다.
 * 작품은 길 안쪽(분수 쪽) 잔디에 서서, 어느 작품을 보든 뒤로 분수가 보인다.
 * 관람객(카메라)은 분수를 왼쪽에 두고 길을 따라 걸으며 작품 앞에 한 점씩 멈춘다.
 * 위치는 연속값 t 하나로 표현한다: t = -1 입구, t = i 는 i번째 작품 앞.
 * 마지막 작품(n-1) 다음은 원을 따라 계속 걸어 첫 작품으로 이어진다: n-1 < t < n 이 그 고리 구간이고,
 * t = n 은 한 바퀴 돌아 다시 선 첫 작품이다 (t ≥ n 은 t - n 과 같은 자리, 카메라가 도착하면 되돌려 센다).
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
  /** 마지막 → 첫 작품 고리 구간을 걷는 가장 빠른 속도 (m/s) — 작품 사이 한 걸음의 처음 속도와 비슷하게 */
  loopSpeed: 18,
  /** 길 폭 (m) */
  pathWidth: 2.8,
} as const;

export const RING = {
  /** 작품이 도는 원의 최소 반지름 (분수 잔디 화단 반폭 9 m, 모서리 12.7 m + 작품 여유) */
  minRadius: 17,
  /** 입구(정문 앞)에서 원까지 (m) — 정문 → 대로 → 광장을 지나 들어온다 (계명대 성서캠퍼스 축) */
  approach: 106,
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
  /** 마지막 → 첫 작품 고리 구간 길이 (m). 작품이 2점보다 적으면 null (이어 돌지 않는다) */
  loopMetres: number | null;
  /** t ↔ 입구부터 걸은 거리 (m). 고리 구간을 지나는 이동을 걸음 속도로 맞출 때 쓴다 */
  metresAt: (t: number) => number;
  tAtMetres: (m: number) => number;
}

/** 한 바퀴 돌아 처음으로 이어지는가 (작품 2점 이상) */
export function canLoop(n: number) {
  return n >= 2;
}

/** 목표 위치 t 의 끝: 이어 돌 수 있으면 한 바퀴 더(첫 작품 = n … 마지막 = 2n-1)까지 */
export function maxTarget(n: number) {
  return canLoop(n) ? 2 * n - 1 : Math.max(n - 1, 0);
}

/** 위치 t → 가장 가까운 작품 번호 (-1 = 입구). 고리 구간 끝·한 바퀴 넘은 자리는 처음부터 다시 센다. */
export function stopIndex(t: number, n: number) {
  const i = Math.round(t);
  return n > 0 && i >= n ? i % n : i;
}

/**
 * 위치 t 가 가장 가까운 작품 자리에서 얼마나 떨어졌는지 (작품 사이 한 걸음 = 1).
 * 고리 구간(마지막 → 첫 작품)은 한 단위가 수십 m라서 걸은 거리로 잰다 — 설명 카드·표시등이 한 걸음 거리에서 꺼지게.
 */
export function offStop(t: number, layout: GalleryLayout | null) {
  const d = Math.abs(t - Math.round(t));
  if (!layout?.loopMetres || t < 0) return d;
  const n = layout.stops.length;
  const u = t % n;
  if (u <= n - 1) return d;
  return (Math.min(u - (n - 1), n - u) * layout.loopMetres) / WALK.spacing;
}

/** 위치 t 에서 작품 i 까지 몇 작품 거리인지 (원을 따라 이어지는 쪽도 센다) */
export function stopDistance(t: number, i: number, n: number) {
  if (!canLoop(n) || t < 0) return Math.abs(t - i);
  const m = (((t - i) % n) + n) % n;
  return Math.min(m, n - m);
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
  const ringNeeded = ringDist(n - 1) + WALK.spacing * 1.8 + 0.42 * RING.minRadius;
  const radius = Math.max(RING.minRadius, ringNeeded / (Math.PI * 2));
  const entranceZ = radius + RING.approach;

  // 진입로: 정문 앞에서 대로 가운데 보행로를 따라 북쪽으로 →
  // 광장 가운데 둥근 향나무 화단(원 바깥 12 m)을 오른쪽으로 비켜 → 원(φ=0 남쪽에서 시작, 분수를 왼쪽에 두고 돈다)
  const pts: THREE.Vector3[] = [];
  for (let z = entranceZ + 2; z > radius + 24; z -= 4) pts.push(new THREE.Vector3(0, 0, z));
  pts.push(new THREE.Vector3(2.2, 0, radius + 20), new THREE.Vector3(5.2, 0, radius + 15), new THREE.Vector3(5.6, 0, radius + 9), new THREE.Vector3(5.2, 0, radius + 4));
  // 원은 φ0(진입로가 닿는 곳)부터 돈다
  const phi0 = 0.42;
  const phiEnd = phi0 + (ringDist(n - 1) + WALK.spacing * 0.9) / radius;
  const steps = Math.ceil((phiEnd - phi0) / 0.08);
  for (let k = 0; k <= steps; k++) {
    const phi = phi0 + (k / steps) * (phiEnd - phi0);
    pts.push(new THREE.Vector3(Math.sin(phi) * radius, 0, Math.cos(phi) * radius));
  }
  const curve = new THREE.CatmullRomCurve3(pts, false, "centripetal");
  const length = curve.getLength();
  // 곡선은 입구보다 2m 뒤에서 시작한다. d = 0 이 입구.
  const origin = 2;
  // 진입로가 원에 닿는 곳까지의 곡선 거리 (향나무 화단을 비켜 도는 만큼 조금 길다)
  const joinDist = RING.approach + 2;

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
  const last = stops.length - 1;
  const loops = canLoop(stops.length);

  /** 작품 i 앞에 선 카메라 자리 (길 바깥쪽으로 비켜선 곳) */
  const standAt = (i: number, target: THREE.Vector3) => {
    const { p, left } = at(stops[i].viewDist);
    return target.set(p.x - left.x * out, WALK.eye, p.z - left.z * out);
  };
  // 고리 구간: 마지막 작품 자리 → 원을 따라 앞으로(분수를 왼쪽에 두고) → 첫 작품 자리
  const loopFrom = new THREE.Vector3();
  const loopTo = new THREE.Vector3();
  let loopPhi0 = 0;
  let loopPhi1 = 0;
  let loopR0 = 0;
  let loopR1 = 0;
  let loopMetres: number | null = null;
  if (loops) {
    standAt(last, loopFrom);
    standAt(0, loopTo);
    loopPhi0 = Math.atan2(loopFrom.x, loopFrom.z);
    loopPhi1 = Math.atan2(loopTo.x, loopTo.z);
    while (loopPhi1 <= loopPhi0) loopPhi1 += Math.PI * 2;
    loopR0 = Math.hypot(loopFrom.x, loopFrom.z);
    loopR1 = Math.hypot(loopTo.x, loopTo.z);
    loopMetres = (loopPhi1 - loopPhi0) * (loopR0 + loopR1) / 2;
  }
  // t = -1, 0, 1, … , n-1, n(한 바퀴 돈 첫 작품), … , 2n-1 에서 걸은 거리 — 사이는 직선으로 잇는다
  const walked: number[] = [0, ...stops.map((s) => s.viewDist)];
  if (loops && loopMetres !== null) {
    const lap = stops[last].viewDist + loopMetres - stops[0].viewDist;
    for (let i = 0; i <= last; i++) walked.push(stops[i].viewDist + lap);
  }
  const metresAt = (t: number) => {
    const x = THREE.MathUtils.clamp(t + 1, 0, walked.length - 1);
    const k = Math.min(Math.floor(x), walked.length - 2);
    return k < 0 ? walked[0] : THREE.MathUtils.lerp(walked[k], walked[k + 1], x - k);
  };
  const tAtMetres = (m: number) => {
    if (walked.length < 2 || m <= walked[0]) return -1;
    for (let k = 0; k < walked.length - 1; k++) {
      if (m <= walked[k + 1]) return k - 1 + (m - walked[k]) / Math.max(walked[k + 1] - walked[k], 1e-6);
    }
    return walked.length - 2;
  };

  const lookOf = (i: number, target: THREE.Vector3) => {
    if (i < 0 || !stops[i]) {
      // 입구: 정문 너머 대로 끝의 분수와 도서관을 본다 (정문 박공까지 보이게 살짝 위로)
      return target.set(0, 5.5, 0);
    }
    const s = stops[i];
    return target.set(s.center.x, s.center.y - lookDrop, s.center.z);
  };

  const pose = (t: number, outPos: THREE.Vector3, outLook: THREE.Vector3) => {
    let tt = THREE.MathUtils.clamp(t, -1, maxTarget(stops.length));
    // 한 바퀴 돈 뒤(t ≥ n)는 처음 바퀴와 같은 자리
    if (loops && tt >= stops.length) tt -= stops.length;
    if (loops && tt > last) {
      const f = tt - last;
      const phi = THREE.MathUtils.lerp(loopPhi0, loopPhi1, f);
      const r = THREE.MathUtils.lerp(loopR0, loopR1, f);
      outPos.set(Math.sin(phi) * r, WALK.eye, Math.cos(phi) * r);
      // 시선은 걸은 거리로 정한다 (고리 구간은 수십 m라 비율로 하면 한참 뒤를 돌아본다):
      // 떠나며 처음 6 m 동안 마지막 작품 → 걷는 방향(φ 가 커지는 쪽) 앞, 도착하기 8 m 전부터 첫 작품
      const walkedM = f * (loopMetres ?? 0);
      const leftM = (loopMetres ?? 0) - walkedM;
      const ahead = lookTmp.set(outPos.x + Math.cos(phi) * 10, WALK.eye, outPos.z - Math.sin(phi) * 10);
      lookOf(last, outLook).lerp(ahead, THREE.MathUtils.smoothstep(walkedM, 0, 6));
      const b = lookOf(0, ahead);
      outLook.lerp(b, 1 - THREE.MathUtils.smoothstep(leftM, 0, 8));
      return;
    }
    tt = Math.min(tt, Math.max(last, 0));
    const i0 = Math.floor(tt);
    const f = tt - i0;
    const distOf = (i: number) => (i < 0 ? 0 : stops[i]?.viewDist ?? 0);
    const d = THREE.MathUtils.lerp(distOf(i0), distOf(Math.min(i0 + 1, last)), f);
    const { p, tan, left } = at(d);
    // 작품 앞에서는 길 바깥쪽으로 비켜선다 (걷는 동안 부드럽게)
    const outOf = (i: number) => (i < 0 || !stops[i] ? 0 : out);
    const lateral = THREE.MathUtils.lerp(outOf(i0), outOf(Math.min(i0 + 1, last)), f);
    outPos.set(p.x - left.x * lateral, WALK.eye, p.z - left.z * lateral);

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

  return { curve, length, radius, entranceZ, stops, pose, at, loopMetres, metresAt, tAtMetres };
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
  /** 지금 산책로 배치 (어느 쪽으로 도는 게 가까운지 걸은 거리로 잴 때 쓴다) */
  layout: GalleryLayout | null;

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
  layout: null,

  target: -1,
  setTarget: (t) => {
    const n = get().arts.length;
    set({ target: THREE.MathUtils.clamp(t, -1, maxTarget(n)) });
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

/**
 * 작품 i 로 이동 (관람 시작 전이면 시작 처리도 함께). i = -1 은 입구.
 * 작품 i 는 이번 바퀴(i)와 원을 따라 이어 간 다음 바퀴(i + n) 두 자리가 있다:
 *  - dir = 1: 지금 카메라보다 앞쪽 자리 (마지막 작품에서 '처음으로'·크게 보기 '다음'은 되감지 않고 분수를 돌아 이어 걷는다)
 *  - dir = -1: 뒤쪽 자리
 *  - dir = 0: 카메라에서 걸어서 더 가까운 자리 (작품 목록·아래 작품 줄·작품 누르기·Home/End)
 */
export function goTo(i: number, dir: -1 | 0 | 1 = 0) {
  const s = useGallery.getState();
  if (!s.started) useGallery.setState({ started: true });
  const n = s.arts.length;
  if (i < 0 || !canLoop(n)) {
    s.setTarget(i);
    return;
  }
  const k = i % n;
  const here = s.current;
  let pick: number;
  if (dir > 0) pick = k >= here - 1e-3 ? k : k + n;
  else if (dir < 0) pick = k + n <= here + 1e-3 ? k + n : k;
  else {
    const L = s.layout;
    const far = (c: number) => (L ? Math.abs(L.metresAt(c) - L.metresAt(here)) : Math.abs(c - here));
    pick = far(k) <= far(k + n) ? k : k + n;
  }
  s.setTarget(pick);
}

/** 한 바퀴 돌아 첫 작품 앞에 막 도착한 참인가 (카메라가 마지막 몇 cm를 다가가는 동안 목표 번호는 아직 n) */
export function arrivedAtFirstAgain(s = useGallery.getState()) {
  const n = s.arts.length;
  return canLoop(n) && Math.round(s.target) === n && stopIndex(s.current, n) === 0 && offStop(s.current, s.layout) < 0.22;
}

/** 한 작품 앞(+1)·뒤(-1)로 (‹ › 버튼·방향키). 마지막 다음은 원을 따라 첫 작품으로 이어진다. */
export function step(d: 1 | -1) {
  const s = useGallery.getState();
  if (!s.started) useGallery.setState({ started: true });
  const n = s.arts.length;
  let next = Math.round(s.target) + d;
  // 첫 작품에서 뒤로는 입구 쪽 — 한 바퀴 돌아 막 도착했을 때도 같게
  if (d < 0 && arrivedAtFirstAgain(s)) next = -1;
  if (next > maxTarget(n)) next -= n;
  s.setTarget(next);
}
