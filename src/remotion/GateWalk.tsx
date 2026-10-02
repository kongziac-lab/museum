import { useEffect, useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, continueRender, delayRender, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { GalleryScene } from "../components/gallery/GalleryScene";
import { texturesIdle } from "../components/gallery/scene/common";
import { buildLayout, useGallery, type GalleryLayout } from "../lib/gallery";
import type { ArtworkSource, ExhibitionBackground, ExhibitionInfo } from "../lib/types";
import { MONO, SANS, SERIF, ensureFonts } from "./fonts";

/*
 * 정문에서 전시장까지 (한글날 영상 뒤에 잇는 3D 장면) — 전시관의 3D 장면을 Remotion 이 한 프레임씩 그린다.
 *  0–2초    정문 앞에 서서 (대로 끝 분수·도서관)
 *  2–22초   대로를 따라 걸어 정문을 지나 광장으로, 분수를 둘러싼 원형 회랑의 첫 작품 앞까지 (천천히 출발해 천천히 선다)
 *  22–28초  첫 작품 쪽으로 살짝 다가가며 캡션, 마지막에 어두워진다
 * 카메라 길은 전시관의 걷는 길(layout.pose)과 같다.
 */

export const WALK_FPS = 30;
const HOLD = 2 * WALK_FPS;
const WALK = 20 * WALK_FPS;
const ARRIVE = 6 * WALK_FPS;
export const WALK_DURATION = HOLD + WALK + ARRIVE;

export type GateWalkProps = {
  arts: ArtworkSource[];
  info: ExhibitionInfo;
  background: ExhibitionBackground | null;
};

export const walkDefaults: GateWalkProps = { arts: [], info: {}, background: null };

const NAVY = "#06122b";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const rise = (f: number, start: number, dur: number) => interpolate(f, [start, start + dur], [0, 1], { ...CLAMP, easing: Easing.bezier(0.22, 1, 0.36, 1) });

/** 프레임 → 걷는 길 위치 t (-1 = 정문 앞, 0 = 첫 작품 앞) */
function walkT(layout: GalleryLayout, f: number) {
  if (f <= HOLD) return -1;
  const p = interpolate(f, [HOLD, HOLD + WALK], [0, 1], { ...CLAMP, easing: Easing.bezier(0.42, 0, 0.3, 1) });
  return p >= 1 ? 0 : layout.tAtMetres(layout.metresAt(0) * p);
}

/** 카메라: 걷는 길의 자리·시선 + 걷는 동안 아주 살짝 흔들림, 도착한 뒤에는 작품 정면 쪽으로 반쯤 다가간다 */
function FilmCamera({ layout, t, near, frame }: { layout: GalleryLayout; t: number; near: number; frame: number }) {
  const { camera } = useThree();
  const v = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), close: new THREE.Vector3(), nrm: new THREE.Vector3() }), []);
  useFrame(() => {
    layout.pose(t, v.pos, v.look);
    const walking = t > -1 && t < 0 ? Math.sin(Math.PI * Math.min(1, (t + 1) * 1.2)) : 0;
    v.pos.y += walking * Math.sin((frame / WALK_FPS) * 6.5) * 0.02;
    const stop = layout.stops[0];
    if (near > 0 && stop) {
      const cam = camera as THREE.PerspectiveCamera;
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max(stop.h / 2 / tanV, stop.w / 2 / (tanV * cam.aspect)) * 1.07;
      v.nrm.set(Math.sin(stop.yaw), 0, Math.cos(stop.yaw));
      v.close.copy(stop.center).addScaledVector(v.nrm, d);
      v.pos.lerp(v.close, near);
      v.look.lerp(stop.center, near);
    }
    camera.position.copy(v.pos);
    camera.lookAt(v.look);
  }, -1);
  return null;
}

/** 배경(모형·하늘·나무)을 다 불러올 때까지 — 장면 안의 Suspense 는 Remotion 이 모르므로 SceneryReady 가 올린 표시를 본다 */
function sceneryLoaded(): Promise<void> {
  if (useGallery.getState().sceneryReady) return Promise.resolve();
  return new Promise((resolve) => {
    const unsub = useGallery.subscribe((s) => {
      if (s.sceneryReady) {
        unsub();
        resolve();
      }
    });
  });
}
const nextFrame = () => new Promise<void>((r) => requestAnimationFrame(() => r()));
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
/** 이 탭에서 처음 그리는 프레임인가 (배경이 막 떠서 작품들이 아직 텍스처를 부르기 전일 수 있다) */
let firstInTab = true;

/** 프레임마다: 배경과, 가까워진 작품의 선명한 텍스처가 다 올 때까지 기다렸다가 한 번 더 그린다 */
export function SettleFrame({ frame }: { frame: number }) {
  const advance = useThree((s) => s.advance);
  useEffect(() => {
    const h = delayRender(`작품 텍스처 (프레임 ${frame})`);
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      continueRender(h);
    };
    (async () => {
      await sceneryLoaded();
      // 배경이 뜬 뒤에 작품들이 텍스처를 부른다 (React 가 Suspense 를 걷어 내는 데 조금 걸린다)
      if (firstInTab) {
        firstInTab = false;
        await sleep(700);
      }
      // 썸네일 → 가까운 작품의 선명한 텍스처로 이어 부르므로, 조용해질 때까지 몇 번 확인한다
      for (let i = 0; i < 3; i++) {
        await nextFrame();
        await texturesIdle();
      }
      advance(performance.now());
      await nextFrame();
      finish();
    })();
    return finish;
  }, [frame, advance]);
  return null;
}

export function GateWalk(p: GateWalkProps) {
  ensureFonts();
  const f = useCurrentFrame();
  const { width: W, height: H } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080;
  // 전시관 상태를 영상 속 장면에 맞춰 한 번 채운다 (작품·전시 정보·묶음 색)
  useState(() => {
    useGallery.getState().setData(p.arts, p.info, p.background);
    useGallery.setState({ started: true, loaded: true });
    return true;
  });
  const layout = useMemo(() => buildLayout(p.arts, { portrait }), [p.arts, portrait]);
  useState(() => useGallery.setState({ layout }));
  const t = walkT(layout, f);
  const near = interpolate(f, [HOLD + WALK + 24, HOLD + WALK + 110], [0, 0.45], { ...CLAMP, easing: Easing.bezier(0.45, 0, 0.25, 1) });
  const first = p.arts[0];
  const n = p.arts.length;

  // 글자: 정문 → 광장 → 첫 작품 캡션
  const gateIn = rise(f, 12, 24) * (1 - rise(f, HOLD + 90, 20));
  const plazaAt = HOLD + Math.round(WALK * 0.66);
  const plazaIn = rise(f, plazaAt, 24) * (1 - rise(f, plazaAt + 120, 20));
  const capIn = rise(f, HOLD + WALK + 14, 24);
  const fadeIn = 1 - rise(f, 0, 18);
  const fadeOut = rise(f, WALK_DURATION - 22, 22);

  const lower = (text: string, sub: string, o: number) => (
    <AbsoluteFill style={{ justifyContent: "flex-end", padding: portrait ? `0 ${60 * u}px ${300 * u}px` : `0 ${90 * u}px ${80 * u}px`, opacity: o }}>
      <div style={{ transform: `translateY(${(1 - o) * 16 * u}px)` }}>
        <div style={{ fontFamily: MONO, fontSize: 20 * u, letterSpacing: "0.3em", color: "rgba(255,255,255,0.8)", textShadow: "0 1px 8px rgba(0,0,0,0.6)" }}>{sub}</div>
        <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 54 * u, color: "#fff", textShadow: "0 2px 16px rgba(0,0,0,0.55)", marginTop: 6 * u }}>{text}</div>
      </div>
    </AbsoluteFill>
  );

  return (
    <AbsoluteFill style={{ background: NAVY }}>
      <ThreeCanvas
        width={W}
        height={H}
        shadows={{ type: THREE.PCFSoftShadowMap }}
        camera={{ fov: portrait ? 64 : 55, near: 0.1, far: 1500, position: [0, 1.62, 40] }}
        gl={{ antialias: false, powerPreference: "high-performance", preserveDrawingBuffer: true }}
        onCreated={({ gl }) => {
          gl.toneMapping = THREE.NoToneMapping;
          gl.toneMappingExposure = 1.0;
        }}
      >
        <GalleryScene layout={layout} quality="high" filmT={near > 0 ? 0 : t} />
        <FilmCamera layout={layout} t={t} near={near} frame={f} />
        <SettleFrame frame={f} />
      </ThreeCanvas>

      {lower("계명대학교 성서캠퍼스 정문", "Keimyung University · Seongseo Campus", gateIn)}
      {lower("분수 광장", `작품 ${n}점이 분수를 둘러싸고 있습니다`, plazaIn)}

      {first && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: portrait ? `0 ${40 * u}px ${170 * u}px` : `0 ${70 * u}px ${70 * u}px`, opacity: capIn }}>
          <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 22 * u, padding: `${26 * u}px ${34 * u}px`, minWidth: 420 * u, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", transform: `translateY(${(1 - capIn) * 20 * u}px)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 30 * u }}>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52 * u, color: "#1c1917" }}>{first.name || first.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 22 * u, color: "#a8a29e", paddingTop: 10 * u }}>1 / {n}</div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 26 * u, color: "#78716c", marginTop: 4 * u }}>{[first.nameEn, first.nationality, first.classroom].filter(Boolean).join(" · ")}</div>
          </div>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ background: NAVY, opacity: Math.max(fadeIn, fadeOut), pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
