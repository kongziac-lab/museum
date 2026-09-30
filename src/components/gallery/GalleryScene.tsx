"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { AUTO, WALK, crossesLoop, offStop, stopDistance, stopIndex, useGallery, type GalleryLayout } from "@/lib/gallery";
import type { Quality } from "./scene/common";
import { Atmosphere } from "./scene/Atmosphere";
import { Site, useSiteMaterials } from "./scene/Grounds";
import { Terrain } from "./scene/Terrain";
import { Planters } from "./scene/Planters";
import { sitePlan, type SitePlan } from "./scene/sitePlan";
import { Fountain } from "./scene/Fountain";
import { Forest } from "./scene/Forest";
import { Campus } from "./scene/Campus";
import { ArtStand, GroupSign, Monument, ZoneArch } from "./scene/Stands";
import { Effects } from "./scene/Effects";

/* ───────────────────────── 카메라 ───────────────────────── */

function CameraRig({ layout }: { layout: GalleryLayout }) {
  const { camera } = useThree();
  const t = useRef(-1);
  const pos = useMemo(() => new THREE.Vector3(), []);
  const look = useMemo(() => new THREE.Vector3(), []);
  const smoothLook = useRef<THREE.Vector3 | null>(null);
  const lastReport = useRef(0);
  /** 지금 향해 걷는 곳과, 그 이동의 최고 속도 (m/s) */
  const move = useRef({ goal: Number.NaN, cap: Infinity });
  /** 하늘에서 보기: 0 = 걷는 눈높이, 1 = 광장 위. 올라가 있는 동안 원을 천천히 돈다 */
  const sky = useRef({ k: 0, orbit: 0 });
  const aerial = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), tmp: new THREE.Vector3() }), []);

  const lastCut = useRef(useGallery.getState().cut);

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const L = layout;
    // 순간 이동 (자동 관람이 한 바퀴 끝나 기념 화면이 가린 사이 정문으로)
    const cut = useGallery.getState().cut;
    if (cut !== lastCut.current) {
      lastCut.current = cut;
      t.current = useGallery.getState().target;
      move.current = { goal: Number.NaN, cap: Infinity };
      smoothLook.current = null;
      sky.current.k = 0;
    }
    const n = L.stops.length;
    const loops = L.loopMetres !== null;
    let target = useGallery.getState().target;
    let tc = t.current;
    const shift = (by: number, withTarget: boolean) => {
      tc += by;
      if (Number.isFinite(move.current.goal)) move.current.goal += by;
      if (withTarget) target += by;
      useGallery.setState(withTarget ? { target, current: tc } : { current: tc });
    };
    // 바퀴 번호 옮겨 세기 (t 와 t ± n 은 같은 자리라 화면은 그대로):
    //  - 입구로 갈 때는 카메라를 첫 바퀴 번호로
    //  - 원 위에서는 카메라와 목표를 함께 n ≤ … < 2n 근처로 → 앞으로도 뒤로도 한 바퀴 이어 돌 수 있다
    if (loops) {
      if (target < 0) {
        while (tc >= n) shift(-n, false);
      } else if (tc >= 0) {
        if (Math.max(tc, target) < n) shift(n, true);
        else if (Math.min(tc, target) >= 2 * n) shift(-n, true);
      }
    }
    let goal = target;
    // 고리 구간에서 입구로(제목 버튼 등): 작품을 모두 되짚기보다 앞으로 첫 작품까지 가서 나가는 쪽이 짧으면 그쪽으로
    if (loops && goal < 0 && tc > n - 1) {
      const ahead = L.metresAt(n) - L.metresAt(tc) + L.metresAt(0) - L.metresAt(goal);
      if (ahead < L.metresAt(tc) - L.metresAt(goal)) goal = n;
    }
    if (goal !== move.current.goal) {
      // 새 이동: 마지막 → 첫 작품 고리 구간(수십 m)을 지나면 도착할 때까지 걸음 속도를 넘지 않는다
      // (그대로 두면 한 걸음 시간에 수십 m를 휙 돌고, 도중에 풀면 갑자기 빨라진다)
      const span = Math.abs(L.metresAt(goal) - L.metresAt(tc));
      const slow = crossesLoop(Math.min(tc, goal), Math.max(tc, goal), n);
      move.current = { goal, cap: slow ? Math.max(WALK.loopSpeed, span / 4) : Infinity };
    }
    // 번호(t)가 아니라 걸은 거리(m)로 따라간다 — 진입로·고리처럼 길이가 다른 구간을 지나도 속도가 튀지 않게
    // 자동 관람은 영상처럼 천천히 걷는다
    if (dt > 0) {
      const auto = useGallery.getState().autoplay;
      const m0 = L.metresAt(tc);
      const m1 = L.metresAt(goal);
      let m = THREE.MathUtils.damp(m0, m1, auto ? AUTO.ease : 2.4, dt);
      const top = auto ? Math.min(move.current.cap, AUTO.speed) : move.current.cap;
      if (Number.isFinite(top)) {
        const cap = top * dt;
        m = m0 + THREE.MathUtils.clamp(m - m0, -cap, cap);
      }
      tc = Math.abs(m - m1) < 0.004 ? goal : L.tAtMetres(m);
    }
    t.current = tc;
    layout.pose(t.current, pos, look);

    // 걷는 동안 아주 살짝 흔들림
    const moving = Math.min(Math.abs(t.current - goal), 1);
    const bob = Math.min(moving, 1) * Math.sin(state.clock.elapsedTime * 7) * 0.025;
    camera.position.set(pos.x, pos.y + bob, pos.z);

    if (!smoothLook.current) smoothLook.current = look.clone();
    smoothLook.current.lerp(look, 1 - Math.exp(-6 * dt));

    // 하늘에서 보기: 남쪽 위(원 지름의 약 1.5배 거리, 약 45° 내려다봄)로 올라가 작품 원 전체를 담고 천천히 돈다.
    // 세로 화면은 옆이 좁아서 더 멀리서 본다. 오르내리는 길은 가운데서 조금 더 솟게.
    const sk = sky.current;
    sk.k = THREE.MathUtils.damp(sk.k, useGallery.getState().overview ? 1 : 0, 1.7, dt);
    if (sk.k > 0.5) sk.orbit += dt * 0.035;
    else if (sk.k < 0.02) sk.orbit = 0;
    if (sk.k > 0.001) {
      const e = sk.k * sk.k * (3 - 2 * sk.k);
      const aspect = (camera as THREE.PerspectiveCamera).aspect || 1;
      const far = (L.radius + 6) * (aspect < 1 ? 2.6 : 1.55) + 10;
      aerial.pos.set(Math.sin(sk.orbit) * far * 0.72, far * 0.78, Math.cos(sk.orbit) * far * 0.72);
      aerial.look.set(0, 0, 0);
      aerial.tmp.copy(camera.position).lerp(aerial.pos, e);
      aerial.tmp.y += Math.sin(Math.PI * e) * far * 0.12;
      camera.position.copy(aerial.tmp);
      camera.lookAt(aerial.look.lerp(smoothLook.current, 1 - e));
    } else {
      camera.lookAt(smoothLook.current);
    }

    lastReport.current += dt;
    if (lastReport.current > 0.08) {
      lastReport.current = 0;
      const cur = useGallery.getState().current;
      if (Math.abs(cur - t.current) > 0.002) useGallery.setState({ current: t.current });
    }
  });
  return null;
}

/** 땅 · 광장 · 화단 (재질을 한 번 불러 함께 쓴다) */
function Grounds({ site }: { site: SitePlan }) {
  const mats = useSiteMaterials();
  return (
    <>
      <Terrain plan={site} />
      <Site plan={site} mats={mats} />
      <Planters plan={site} mats={mats} />
    </>
  );
}

/** Suspense 안의 배경이 모두 준비되면 알린다. */
function SceneryReady() {
  useEffect(() => {
    useGallery.setState({ sceneryReady: true });
  }, []);
  return null;
}

/* ───────────────────────── 씬 ───────────────────────── */

export function GalleryScene({ layout, quality }: { layout: GalleryLayout; quality: Quality }) {
  const background = useGallery((s) => s.background);
  const site = useMemo(() => sitePlan(layout), [layout]);
  const current = useGallery((s) => s.current);
  const n = layout.stops.length;
  const nearest = stopIndex(current, n);
  const settled = offStop(current, layout) < 0.2;

  return (
    <>
      <Suspense fallback={null}>
        <Atmosphere quality={quality} radius={layout.radius} panorama={background?.panorama ? background : null} />
        <Grounds site={site} />
        <Fountain quality={quality} />
        <Forest site={site} quality={quality} />
        <Campus site={site} />
        <Monument site={site} />
        {layout.stops.map((s) => (
          <group key={s.art.id}>
            {s.groupStart && (layout.double ? <ZoneArch stop={s} layout={layout} /> : <GroupSign stop={s} layout={layout} />)}
            <ArtStand stop={s} active={settled && nearest === s.index} near={stopDistance(current, s.index, n) < 7} />
          </group>
        ))}
        <SceneryReady />
      </Suspense>

      <CameraRig layout={layout} />
      {quality === "high" && (
        <Suspense fallback={null}>
          <Effects />
        </Suspense>
      )}
    </>
  );
}
