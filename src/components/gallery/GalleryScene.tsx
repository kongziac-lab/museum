"use client";

import { Suspense, useEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import * as THREE from "three";
import { useGallery, type GalleryLayout } from "@/lib/gallery";
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

  useFrame((state, delta) => {
    const dt = Math.min(delta, 0.1);
    const st = useGallery.getState();
    t.current = THREE.MathUtils.damp(t.current, st.target, 2.4, dt);
    if (Math.abs(t.current - st.target) < 0.0005) t.current = st.target;
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
      if (Math.abs(st.current - t.current) > 0.002) st.setCurrent(t.current);
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
  const nearest = Math.round(current);
  const settled = Math.abs(current - nearest) < 0.2;

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
            <ArtStand stop={s} active={settled && nearest === s.index} near={Math.abs(current - s.index) < 7} />
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
