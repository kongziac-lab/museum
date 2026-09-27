"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { WALK, offStop, stopDistance, stopIndex, useGallery, type GalleryLayout } from "@/lib/gallery";
import type { Quality } from "./scene/common";
import { Atmosphere } from "./scene/Atmosphere";
import { Site, useSiteMaterials } from "./scene/Grounds";
import { Terrain } from "./scene/Terrain";
import { Planters } from "./scene/Planters";
import { sitePlan, type SitePlan } from "./scene/sitePlan";
import { Fountain } from "./scene/Fountain";
import { Forest } from "./scene/Forest";
import { Campus } from "./scene/Campus";
import { ArtStand, GroupSign, Monument } from "./scene/Stands";
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

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = useGallery.getState();
    const n = layout.stops.length;
    const prev = t.current;
    const L = layout;
    let goal = st.target;
    // 고리 구간에서 입구로 돌아갈 때(제목 버튼 등): 작품을 모두 되짚기보다 앞으로 첫 작품까지 가서 나가는 쪽이 짧으면 그쪽으로
    if (L.loopMetres && goal < 0 && prev > n - 1) {
      const ahead = L.metresAt(n) - L.metresAt(prev) + L.metresAt(0) - L.metresAt(goal);
      if (ahead < L.metresAt(prev) - L.metresAt(goal)) goal = n;
    }
    if (goal !== move.current.goal) {
      // 새 이동: 마지막 → 첫 작품 고리 구간(수십 m)을 지나면 도착할 때까지 걸음 속도를 넘지 않는다
      // (그대로 두면 한 걸음 시간에 수십 m를 휙 돌고, 도중에 풀면 갑자기 빨라진다)
      const lo = Math.min(prev, goal);
      const hi = Math.max(prev, goal);
      const span = Math.abs(L.metresAt(goal) - L.metresAt(prev));
      move.current = { goal, cap: L.loopMetres && lo < n && hi > n - 1 ? Math.max(WALK.loopSpeed, span / 4) : Infinity };
    }
    // 번호(t)가 아니라 걸은 거리(m)로 따라간다 — 진입로·고리처럼 길이가 다른 구간을 지나도 속도가 튀지 않게
    const m0 = L.metresAt(prev);
    const m1 = L.metresAt(goal);
    let m = THREE.MathUtils.damp(m0, m1, 2.4, dt);
    const cap = move.current.cap * dt;
    m = m0 + THREE.MathUtils.clamp(m - m0, -cap, cap);
    t.current = Math.abs(m - m1) < 0.004 ? goal : L.tAtMetres(m);
    // 한 바퀴 돌아 첫 작품(t = n)에 닿으면 처음 바퀴 번호로 되돌려 센다 (같은 자리라 화면은 그대로)
    if (L.loopMetres && t.current >= n && goal >= n) {
      t.current -= n;
      move.current.goal -= n;
      useGallery.setState(st.target >= n ? { target: st.target - n, current: t.current } : { current: t.current });
    }
    layout.pose(t.current, pos, look);

    // 걷는 동안 아주 살짝 흔들림
    const moving = Math.abs(t.current - st.target);
    const bob = Math.min(moving, 1) * Math.sin(state.clock.elapsedTime * 7) * 0.025;
    camera.position.set(pos.x, pos.y + bob, pos.z);

    if (!smoothLook.current) smoothLook.current = look.clone();
    smoothLook.current.lerp(look, 1 - Math.exp(-6 * dt));
    camera.lookAt(smoothLook.current);

    lastReport.current += dt;
    if (lastReport.current > 0.08) {
      lastReport.current = 0;
      const cur = useGallery.getState().current;
      if (Math.abs(cur - t.current) > 0.002) st.setCurrent(t.current);
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
            {s.groupStart && <GroupSign stop={s} layout={layout} />}
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
