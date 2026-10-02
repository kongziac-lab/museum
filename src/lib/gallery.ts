/**
 * 분수 광장 둘레 산책로 전시 — 배치 계산과 상태.
 *
 * 분수가 원점에 있고, 산책로는 그 둘레를 원으로 돈다. 입구 진입로는 남쪽(+z)에서 곧게 들어온다.
 * 작품은 길 안쪽(분수 쪽) 잔디에 서서, 어느 작품을 보든 뒤로 분수가 보인다.
 * 관람객(카메라)은 분수를 왼쪽에 두고 길을 따라 걸으며 작품 앞에 한 점씩 멈춘다.
 * 작품이 많으면(RING.singleMax 점 넘게) 길 양쪽에 번갈아 세운 '원형 회랑'이 된다: 안쪽 작품은 분수를,
 * 바깥쪽 작품은 광장 느티나무와 캠퍼스 건물을 등지고, 관람객은 두 줄 사이 길을 걸으며 좌우로 번갈아 본다.
 * 원이 광장(RING.maxRadius)을 넘지 않게 작품 사이 간격을 줄여 50점 안팎도 광장 안에 든다.
 * 위치는 연속값 t 하나로 표현한다: t = -1 입구, -1 < t < 0 진입로, t = i 는 i번째 작품 앞.
 * 원은 끝없이 이어진다: 마지막 작품(n-1) 다음은 고리 구간(n-1 < t < n)을 지나 첫 작품(t = n)이고,
 * t ≥ 0 에서 t 와 t + n 은 같은 자리다 (바퀴 번호만 다르다). 카메라(CameraRig)는 원 위에서
 * 목표와 함께 바퀴 번호를 옮겨 세어 n ≤ t < 2n 근처에 둔다 → 앞으로도 뒤로도 한 바퀴 이어 돌 수 있다.
 */

import * as THREE from "three";
import { create } from "zustand";
import { GROUP_COLORS, awardColor } from "./config";
import type { ArtworkSource, ExhibitionBackground, ExhibitionInfo } from "./types";

export const WALK = {
  /** 작품 사이 간격 (m, 길을 따라) — 한쪽에만 세울 때 */
  spacing: 8,
  /** 양쪽에 번갈아 세울 때 한 작품씩의 간격 (한쪽 줄에서는 이 두 배). 원이 광장을 넘으면 minPitch 까지 줄인다 */
  pitch: 3.4,
  minPitch: 2.6,
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

/** 자동 관람 (손대지 않아도 한 작품씩 걸어가 머문다) */
export const AUTO = {
  /** 작품 앞에 머무는 시간 (ms) — 설명이 길면 글자 수만큼 조금 더. 이 안에서 가까이 다가갔다 물러난다 */
  dwell: 9500,
  dwellPerChar: 40,
  dwellMax: 13000,
  /** 도착해서 가까이 다가가기 시작할 때까지, 물러나기 시작해서 떠날 때까지 (ms) */
  closeUpAfter: 1400,
  closeUpBefore: 2000,
  /** 걷는 최고 속도 (m/s) — 수동(한 걸음에 휙)보다 천천히, 영상처럼 */
  speed: 5,
  /** 따라가는 빠르기 (수동은 2.4) */
  ease: 1.1,
  /** 한 바퀴 끝나 기념 화면이 걷힌 뒤 정문 화면을 보여 주는 시간 (ms) — 그다음 다시 자동 관람 */
  introHold: 5000,
  /** 마지막 작품 뒤 마무리: 하늘로 올라가 작품 원을 내려다보며 전시 제목 (영상의 끝과 같게) */
  finaleMs: 8500,
  /** ?auto 로 연 전시(행사장 화면)에서 아무도 만지지 않으면 이만큼 뒤에 다시 자동 관람 (ms) */
  kioskIdle: 45000,
} as const;

export function dwellFor(art: ArtworkSource | undefined) {
  const extra = (art?.description?.length ?? 0) * AUTO.dwellPerChar;
  return Math.min(AUTO.dwell + extra, AUTO.dwellMax);
}

export const RING = {
  /** 작품이 도는 원의 최소 반지름 (분수 잔디 화단 반폭 9 m, 모서리 12.7 m + 작품 여유) */
  minRadius: 17,
  /** 원형 회랑의 가장 큰 반지름 — 바깥 줄 작품이 광장 가장자리 느티나무(분수에서 33 m) 안쪽에 들게 */
  maxRadius: 28,
  /** 이 점수까지는 길 안쪽(분수 쪽)에만 한 줄로 세운다 */
  singleMax: 14,
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
  /** 묶음(부문·나라)이 바뀌는 첫 작품이면 그 묶음 이름과 작품 수 (표지판) */
  groupStart?: string;
  groupCount?: number;
}

export interface GalleryLayout {
  curve: THREE.CatmullRomCurve3;
  length: number;
  /** 산책로 원 반지름 (길 가운데 선) */
  radius: number;
  /** 길 양쪽에 번갈아 세운 원형 회랑인가 */
  double: boolean;
  /** 작품 사이 간격 (m, 길을 따라) */
  pitch: number;
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

/** 목표 위치 t 의 끝 (카메라가 바퀴 번호를 옮겨 세므로 실제로는 2n 근처를 넘지 않는다) */
export function maxTarget(n: number) {
  return canLoop(n) ? 4 * n : Math.max(n - 1, 0);
}

/** 위치 t → 가장 가까운 작품 번호 (-1 = 입구). 몇 바퀴째든 0 … n-1 로 센다. */
export function stopIndex(t: number, n: number) {
  const i = Math.round(t);
  return n > 0 && i >= n ? i % n : i;
}

/** [lo, hi] 사이에 마지막 → 첫 작품 고리 구간(k·n + n-1 … (k+1)·n)이 끼어 있는가 */
export function crossesLoop(lo: number, hi: number, n: number) {
  if (!canLoop(n) || hi <= n - 1) return false;
  for (let k = Math.max(0, Math.floor(lo / n) - 1); k <= Math.floor(hi / n) + 1; k++) {
    if (hi > k * n + n - 1 && lo < (k + 1) * n) return true;
  }
  return false;
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
  return (Math.min(u - (n - 1), n - u) * layout.loopMetres) / layout.pitch;
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


/** 산책로 곡선과 작품 위치를 만든다. */
export function buildLayout(arts: ArtworkSource[], opts: { portrait?: boolean } = {}): GalleryLayout {
  // 세로 화면(휴대폰)은 화면 폭이 좁아서 길 바깥쪽으로 더 비켜서서 본다.
  const out = WALK.viewOut * (opts.portrait ? 1.3 : 1);
  // 캡션 카드가 화면 아래쪽을 가리므로 작품이 화면 위쪽에 오도록 시선을 낮춘다.
  const lookDrop = opts.portrait ? 0.75 : 0.32;
  const n = Math.max(arts.length, 1);
  // 원 둘레 = 작품이 차지하는 길이 + 마지막 작품과 입구 사이 여유
  const gap = WALK.spacing * 1.8 + 0.42 * RING.minRadius;
  const double = n > RING.singleMax;
  // 양쪽에 세울 때: 원이 광장을 넘지 않게 간격을 줄인다 (그래도 넘치면 원이 커진다)
  const pitch = double
    ? THREE.MathUtils.clamp((Math.PI * 2 * RING.maxRadius - WALK.lead - gap) / (n - 0.5), WALK.minPitch, WALK.pitch)
    : WALK.spacing;
  /** 작품 i 까지의 원 위 거리 (진입로가 원에 닿은 곳부터, m) */
  const ringDist = (i: number) => WALK.lead + (i + 0.5) * pitch;
  const ringNeeded = ringDist(n - 1) + gap;
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

  let prevGroup: string | undefined;
  const groupOf = (a: ArtworkSource) => a.group ?? a.award;
  const stops: Stop[] = arts.map((art, i) => {
    const hero = Boolean(art.hero);
    const size = hero ? WALK.heroSize : WALK.size;
    const aspect = aspectOf(art);
    const w = aspect >= 1 ? size : size * aspect;
    const h = aspect >= 1 ? size / aspect : size;
    // 한 줄이면 모두 길 안쪽(분수 쪽)에 — 작품 뒤로 분수가 보인다.
    // 회랑이면 안쪽(분수를 등진다)과 바깥쪽(느티나무·캠퍼스 건물을 등진다)에 번갈아
    const side: 1 | -1 = double && i % 2 === 1 ? -1 : 1;
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
    const g = groupOf(art);
    const groupStart = g && g !== prevGroup ? g : undefined;
    prevGroup = g;
    const groupCount = groupStart ? arts.slice(i).findIndex((a) => groupOf(a) !== g) : undefined;
    return {
      index: i,
      art,
      side,
      center,
      yaw,
      w,
      h,
      viewDist: artDist - back,
      groupStart,
      groupCount: groupCount === undefined ? undefined : groupCount < 0 ? arts.length - i : groupCount,
    };
  });

  const lookTmp = new THREE.Vector3();
  const last = stops.length - 1;
  const loops = canLoop(stops.length);

  /** 작품 i 앞에 선 카메라 자리 (작품 반대쪽으로 비켜선 곳) */
  const standAt = (i: number, target: THREE.Vector3) => {
    const { p, left } = at(stops[i].viewDist);
    const o = out * stops[i].side;
    return target.set(p.x - left.x * o, WALK.eye, p.z - left.z * o);
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
  // t = -1, 0, 1, … , n-1, n(한 바퀴 돈 첫 작품) 에서 입구부터 걸은 거리 — 사이는 직선으로 잇고,
  // 그 뒤는 한 바퀴(lapM)씩 되풀이된다
  const walked: number[] = [0, ...stops.map((s) => s.viewDist)];
  const lapM = loops && loopMetres !== null ? stops[last].viewDist + loopMetres - stops[0].viewDist : 0;
  if (lapM > 0) walked.push(stops[0].viewDist + lapM);
  const top = walked.length - 2; // 표가 덮는 t 의 끝
  const fromTable = (t: number) => {
    const x = THREE.MathUtils.clamp(t + 1, 0, walked.length - 1);
    const k = Math.min(Math.floor(x), walked.length - 2);
    return k < 0 ? walked[0] : THREE.MathUtils.lerp(walked[k], walked[k + 1], x - k);
  };
  const toTable = (m: number) => {
    if (walked.length < 2 || m <= walked[0]) return -1;
    for (let k = 0; k < walked.length - 1; k++) {
      if (m <= walked[k + 1]) return k - 1 + (m - walked[k]) / Math.max(walked[k + 1] - walked[k], 1e-6);
    }
    return top;
  };
  const metresAt = (t: number) => {
    if (!Number.isFinite(t)) return walked[0];
    if (lapM <= 0 || t <= stops.length) return fromTable(t);
    const laps = Math.floor(t / stops.length);
    return fromTable(t - laps * stops.length) + laps * lapM;
  };
  const tAtMetres = (m: number) => {
    if (!Number.isFinite(m)) return -1;
    if (lapM <= 0 || m <= walked[walked.length - 1]) return toTable(m);
    const laps = Math.floor((m - walked[1]) / lapM);
    return toTable(m - laps * lapM) + laps * stops.length;
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
    // 몇 바퀴째든 같은 자리 (t 와 t + n)
    if (loops && tt >= stops.length) tt %= stops.length;
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
    // 작품 앞에서는 작품 반대쪽으로 비켜선다 (걷는 동안 부드럽게)
    const outOf = (i: number) => (i < 0 || !stops[i] ? 0 : out * stops[i].side);
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

  return { curve, length, radius, double, pitch, entranceZ, stops, pose, at, loopMetres, metresAt, tAtMetres };
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

  /** 하늘에서 보기 (광장 위로 올라가 작품 원 전체를 내려다본다) */
  overview: boolean;
  /** 작품 가까이 보기 (자동 관람이 작품마다 다가가 화면을 채운다) */
  closeUp: boolean;
  /** 자동 관람 마무리 중 (하늘에서 내려다보며 전시 제목) */
  finale: boolean;

  /** 카메라를 걷지 않고 목표 자리로 바로 옮긴 횟수 (CameraRig 가 바뀌면 순간 이동) */
  cut: number;
  /** 기념(로딩) 화면을 띄운 횟수 — 0 은 처음 불러올 때, 자동 관람이 한 바퀴 끝날 때마다 하나씩 늘어 다시 띄운다 */
  splashRun: number;
  /** 기념 화면이 떠 있는지 (걷히는 움직임이 다 끝나면 false) */
  splashUp: boolean;
  /** 한글날 도입 영상(src/remotion)을 트는 중 */
  film: boolean;
  /** '시작'을 누른 횟수 — 늘면 영상 → 정문 → 자동 관람을 처음부터 이어 튼다 (useAutoTour 가 본다) */
  showRequest: number;
  /** 영상 음악 등 (public/audio, 빌드 스크립트가 알려 준다) */
  music: { film?: string; tour?: string[] } | null;

  /** 자동 관람 중인지 */
  autoplay: boolean;
  /** 자동 관람이 한 바퀴 끝나 기념 화면 → 정문 화면을 거쳐 다시 시작하려고 기다리는 중 */
  autoReplay: boolean;
  /** 지금 작품 앞에 머물기 시작한 때(performance.now)와 머무는 시간 — 진행 막대용. 걷는 중이면 null */
  autoDwell: { at: number; ms: number } | null;
}

export const useGallery = create<GalleryState>((set, get) => ({
  arts: [],
  info: {},
  background: null,
  loaded: false,
  setData: (arts, info, background) => {
    // 묶음(나라) 색은 전시에 나오는 순서대로 정해 둔다 — 3D 표지·명패·작품 띠·목록이 같은 색을 쓴다
    groupColor.clear();
    for (const a of arts) if (a.group && !a.award && !groupColor.has(a.group)) groupColor.set(a.group, GROUP_COLORS[groupColor.size % GROUP_COLORS.length]);
    set({ arts, info, background, loaded: true });
  },
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
  // 첫 작품으로 (원 위에 있던 카메라라면 걸어서 가까운 쪽으로)
  start: () => {
    set({ started: true });
    goTo(0);
  },

  detail: null,
  openDetail: (detail) => set({ detail }),

  listOpen: false,
  toggleList: (v) => set((s) => ({ listOpen: v ?? !s.listOpen })),

  overview: false,
  closeUp: false,
  finale: false,

  cut: 0,
  splashRun: 0,
  splashUp: true,
  film: false,
  showRequest: 0,
  music: null,

  autoplay: false,
  autoReplay: false,
  autoDwell: null,
}));

const groupColor = new Map<string, string>();

/** 작품 색: 수상 부문이 있으면 부문 색, 전시 모드면 묶음(나라) 색 */
export function colorOf(art: Pick<ArtworkSource, "award" | "group"> | undefined): string {
  if (!art) return awardColor();
  if (art.award) return awardColor(art.award);
  return (art.group && groupColor.get(art.group)) || awardColor();
}

/** 하늘에서 보기 켜기·끄기 (끄면 서 있던 작품 앞으로 내려온다) */
export function setOverview(on: boolean) {
  const s = useGallery.getState();
  if (on) {
    pauseAuto();
    if (!s.started) useGallery.setState({ started: true });
    if (s.target < 0) goTo(0);
  }
  useGallery.setState({ overview: on });
}

/** 자동 관람 시작. 걷는 중이었으면 가까운 작품에 서서 거기부터 머문다. */
export function playAuto() {
  const s = useGallery.getState();
  if (!s.arts.length) return;
  if (!s.started || s.target < 0) {
    s.start();
  } else {
    s.setTarget(Math.round(s.target));
  }
  useGallery.setState({ autoplay: true, autoReplay: false, autoDwell: null, overview: false });
}

/** 카메라를 걷지 않고 t 자리로 바로 옮긴다 (화면이 가려져 있을 때만 쓴다) */
export function jumpTo(t: number) {
  useGallery.setState((s) => ({ target: t, current: t, cut: s.cut + 1 }));
}

/** 처음부터 끝없이: 한글날 영상 → 정문 화면 → 자동 관람 → … (기념 화면의 '시작') */
export function requestShow() {
  useGallery.setState((s) => ({ showRequest: s.showRequest + 1 }));
}

/** 자동 관람 멈춤 (보는 사람이 직접 움직이면 부른다) */
export function pauseAuto() {
  const s = useGallery.getState();
  if (s.autoplay || s.closeUp) useGallery.setState({ autoplay: false, autoDwell: null, closeUp: false });
}

/** 자동 관람이 다음 작품으로 (원 위라면 마지막 다음은 분수를 돌아 첫 작품, 이어 돌지 못하면 처음으로 되돌아간다) */
export function autoAdvance() {
  const s = useGallery.getState();
  const n = s.arts.length;
  const next = Math.round(s.target) + 1;
  if (!canLoop(n) && next > n - 1) s.setTarget(0);
  else s.setTarget(next);
}

/**
 * 작품 i 로 곧장 이동 (작품 목록·아래 작품 줄·작품 누르기·Home/End·'처음으로'). i = -1 은 입구.
 * 원 위의 같은 작품은 바퀴마다 자리(i + k·n)가 있으니, 지금 카메라에서 걸어서 가장 가까운 자리로 간다
 * — 마지막 작품에서 첫 작품을 고르면 되감지 않고 분수를 돌아 앞으로 이어 걷는다.
 */
export function goTo(i: number) {
  pauseAuto();
  useGallery.setState({ overview: false });
  const s = useGallery.getState();
  if (!s.started) useGallery.setState({ started: true });
  const n = s.arts.length;
  const L = s.layout;
  if (i < 0 || !canLoop(n) || !L) {
    s.setTarget(i);
    return;
  }
  const k = ((i % n) + n) % n;
  const here = s.current;
  const lap = here >= 0 ? Math.floor(here / n) : 0;
  let best = k;
  let bestM = Infinity;
  for (let j = lap - 1; j <= lap + 1; j++) {
    const c = k + j * n;
    if (c < 0 || c > maxTarget(n)) continue;
    const dm = Math.abs(L.metresAt(c) - L.metresAt(here));
    if (dm < bestM - 1e-6) {
      best = c;
      bestM = dm;
    }
  }
  s.setTarget(best);
}

/**
 * 한 작품 앞(+1)·뒤(-1)로 (‹ › 버튼·방향키·크게 보기의 이전/다음). 지금 목표에서 한 칸이라 빠르게 눌러도 어긋나지 않는다.
 * 원 위에서는 끝이 없다: 마지막 다음은 첫 작품, 첫 작품 이전은 마지막 작품 (분수를 돌아 이어 걷는다).
 * 진입로를 걸어 들어오는 중(카메라가 아직 원에 닿기 전)에 뒤로 가면 입구 쪽이다.
 */
export function step(d: 1 | -1) {
  pauseAuto();
  useGallery.setState({ overview: false });
  const s = useGallery.getState();
  if (!s.started) useGallery.setState({ started: true });
  s.setTarget(Math.round(s.target) + d);
}

/**
 * 크게 보기에서 이전·다음 작품. 카메라 목표도 한 칸 옮겨 닫으면 그 작품 앞에 서 있게 한다
 * (원을 따라 끝없이: 마지막 다음은 첫 작품, 첫 작품 이전은 마지막 작품).
 */
export function moveDetail(d: 1 | -1) {
  const s = useGallery.getState();
  if (s.detail === null) return;
  const n = s.arts.length;
  if (!canLoop(n)) {
    const next = s.detail + d;
    if (next < 0 || next >= n) return;
    s.openDetail(next);
    goTo(next);
    return;
  }
  // 보고 있는 작품의, 지금 목표에서 가장 가까운 바퀴 자리에서 한 칸 (빠르게 눌러도 목표 기준이라 어긋나지 않는다)
  const base = Math.round(s.target);
  let here = s.detail + Math.round((base - s.detail) / n) * n;
  if (here < 0) here = s.detail;
  let next = here + d;
  if (next < 0) next = n - 1; // 진입로에서 첫 작품 이전 → 마지막 작품
  s.setTarget(next);
  s.openDetail(stopIndex(next, n));
}

/*
 * 크게 보기와 브라우저 '뒤로': 열 때 기록을 하나 쌓아 두면 휴대폰의 뒤로 버튼·밀기(카카오톡 ‹ 포함)가
 * 사이트를 떠나지 않고 크게 보기만 닫는다. ✕·Esc·아래로 밀기도 그 기록을 되돌려 닫아 기록이 쌓이지 않게 한다.
 * (Next.js 는 직접 쌓은 기록에도 자기 표시(__NA)를 복사해 두므로 뒤로 가도 새로고침하지 않는다.)
 */
let viewerPushed = false;
let closeToken = 0;

/** 크게 보기 열기 (누른 그 순간에 불러야 브라우저가 기록을 받아 준다) */
export function openViewer(i: number) {
  pauseAuto();
  const s = useGallery.getState();
  if (s.detail === null && typeof window !== "undefined") {
    try {
      window.history.pushState({ museumViewer: 1 }, "");
      viewerPushed = true;
    } catch {
      viewerPushed = false;
    }
  }
  s.openDetail(i);
}

/** 크게 보기 닫기 */
export function closeViewer() {
  const s = useGallery.getState();
  if (s.detail === null) return;
  if (viewerPushed && typeof window !== "undefined" && window.history.state?.museumViewer) {
    viewerPushed = false;
    const token = ++closeToken;
    window.history.back();
    // 뒤로가 오지 않으면(드물게) 그냥 닫는다
    setTimeout(() => {
      if (token === closeToken && useGallery.getState().detail !== null) useGallery.getState().openDetail(null);
    }, 350);
    return;
  }
  viewerPushed = false;
  s.openDetail(null);
}

/** 브라우저 뒤로(popstate) — 크게 보기가 열려 있으면 닫는다 */
export function viewerPopped() {
  viewerPushed = false;
  closeToken++;
  if (useGallery.getState().detail !== null) useGallery.getState().openDetail(null);
}
