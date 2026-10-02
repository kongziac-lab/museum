import { useMemo, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { ThreeCanvas } from "@remotion/three";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import * as THREE from "three";
import { GalleryScene } from "../components/gallery/GalleryScene";
import { buildLayout, useGallery, type GalleryLayout } from "../lib/gallery";
import { SettleFrame, type GateWalkProps } from "./GateWalk";
import { MONO, SANS, SERIF, ensureFonts } from "./fonts";

/*
 * 정문에서 작품 50점 끝까지 (전체 한 편 영상의 3D 부분) — 사이트의 자동 관람과 같은 흐름을 한 프레임씩 그린다.
 *  정문 앞 2초 → 대로를 따라 첫 작품 앞까지 20초
 *  작품마다 9.5초: 서서 캡션 1.4초 → 다가가 화면 가득 1.6초 → 머묾 4.5초 → 물러남 1.5초 → 0.5초
 *  다음 작품까지 2.5초 걸어간다 (원형 회랑에서는 좌우로 번갈아)
 *  마지막 작품 뒤에 하늘로 올라가(2.5초) 분수를 둘러싼 작품 원을 내려다보며 천천히 돌고(6초) 전시 제목, 어두워진다
 */

const FPS = 30;
const S = (sec: number) => Math.round(sec * FPS);
const T = {
  hold: S(2),
  walk: S(20),
  stand: S(1.4),
  into: S(1.6),
  close: S(4.5),
  out: S(1.5),
  rest: S(0.5),
  step: S(2.5),
  rise: S(2.5),
  orbit: S(6),
};
const DWELL = T.stand + T.into + T.close + T.out + T.rest;

/** 작품 n 점일 때 3D 부분의 길이 (프레임) */
export function tourFrames(n: number) {
  const k = Math.max(1, n);
  return T.hold + T.walk + k * DWELL + (k - 1) * T.step + T.rise + T.orbit;
}

const NAVY = "#06122b";
const CLAMP = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;
const EASE = Easing.bezier(0.42, 0, 0.3, 1);
const SMOOTH = Easing.bezier(0.45, 0, 0.25, 1);
const ramp = (f: number, start: number, dur: number, e = SMOOTH) => interpolate(f, [start, start + dur], [0, 1], { ...CLAMP, easing: e });

type Shot = {
  /** 걷는 길 위치 (-1 정문 앞, i 는 i번째 작품 앞) */
  t: number;
  /** 작품 정면으로 다가간 정도 0 … 1 (1 = 화면 가득) */
  close: number;
  /** 하늘로 올라간 정도 0 … 1, 그리고 올라간 뒤 지난 프레임 (천천히 돈다) */
  sky: number;
  skyF: number;
  /** 캡션: 몇 번째 작품, 얼마나 보이나 */
  cap: number;
  capIdx: number;
  /** 걷는 중인가 (살짝 흔들림) */
  walking: number;
};

/** 프레임 → 이 순간의 장면 */
function shotAt(L: GalleryLayout, n: number, f0: number): Shot {
  const base: Shot = { t: -1, close: 0, sky: 0, skyF: 0, cap: 0, capIdx: 0, walking: 0 };
  let f = f0;
  if (f < T.hold) return base;
  f -= T.hold;
  if (f < T.walk) {
    const p = ramp(f, 0, T.walk, EASE);
    return { ...base, t: p >= 1 ? 0 : L.tAtMetres(L.metresAt(0) * p), walking: Math.sin(Math.PI * p) };
  }
  f -= T.walk;
  for (let i = 0; i < n; i++) {
    if (f < DWELL) {
      const a = T.stand;
      const b = a + T.into;
      const c = b + T.close;
      const d = c + T.out;
      const close = f < a ? 0 : f < b ? ramp(f, a, T.into) : f < c ? 1 : f < d ? 1 - ramp(f, c, T.out) : 0;
      // 캡션: 서 있는 동안 (다가가기 시작하면 걷힌다), 물러난 뒤 다시
      const cap = Math.min(ramp(f, 0, 10), 1 - ramp(f, a, 10)) + (f > d - 4 ? ramp(f, d - 4, 8) : 0);
      return { ...base, t: i, close, cap: Math.min(1, cap), capIdx: i };
    }
    f -= DWELL;
    if (i < n - 1) {
      if (f < T.step) {
        const p = ramp(f, 0, T.step, EASE);
        return { ...base, t: L.tAtMetres(L.metresAt(i) + (L.metresAt(i + 1) - L.metresAt(i)) * p), walking: Math.sin(Math.PI * p), cap: 1 - ramp(f, 0, 8), capIdx: i };
      }
      f -= T.step;
    }
  }
  return { ...base, t: n - 1, sky: ramp(f, 0, T.rise), skyF: f };
}

/** 카메라: 걷는 길 → 작품 정면 → 하늘 (전시관 CameraRig 과 같은 계산) */
function TourCamera({ layout, shot, frame }: { layout: GalleryLayout; shot: Shot; frame: number }) {
  const { camera } = useThree();
  const v = useMemo(() => ({ pos: new THREE.Vector3(), look: new THREE.Vector3(), close: new THREE.Vector3(), nrm: new THREE.Vector3(), air: new THREE.Vector3() }), []);
  useFrame(() => {
    const cam = camera as THREE.PerspectiveCamera;
    layout.pose(shot.t, v.pos, v.look);
    v.pos.y += shot.walking * Math.sin((frame / FPS) * 6.5) * 0.02;
    const i = Math.round(shot.t);
    const stop = i >= 0 ? layout.stops[i] : undefined;
    if (shot.close > 0 && stop) {
      const tanV = Math.tan(THREE.MathUtils.degToRad(cam.fov / 2));
      const d = Math.max(stop.h / 2 / tanV, stop.w / 2 / (tanV * cam.aspect)) * 1.07;
      v.nrm.set(Math.sin(stop.yaw), 0, Math.cos(stop.yaw));
      v.close.copy(stop.center).addScaledVector(v.nrm, d);
      v.pos.lerp(v.close, shot.close);
      v.look.lerp(stop.center, shot.close);
    }
    if (shot.sky > 0) {
      const far = (layout.radius + 6) * (cam.aspect < 1 ? 2.6 : 1.55) + 10;
      const a = (shot.skyF / FPS) * 0.06;
      v.air.set(Math.sin(a) * far * 0.72, far * 0.78, Math.cos(a) * far * 0.72);
      const e = shot.sky;
      const y = THREE.MathUtils.lerp(v.pos.y, v.air.y, e) + Math.sin(Math.PI * e) * far * 0.12;
      v.pos.lerp(v.air, e);
      v.pos.y = y;
      v.look.lerp(new THREE.Vector3(0, 0, 0), e);
    }
    camera.position.copy(v.pos);
    camera.lookAt(v.look);
  }, -1);
  return null;
}

export function Tour(p: GateWalkProps) {
  ensureFonts();
  const f = useCurrentFrame();
  const { width: W, height: H, durationInFrames } = useVideoConfig();
  const portrait = H > W;
  const u = Math.min(W, H) / 1080;
  useState(() => {
    useGallery.getState().setData(p.arts, p.info, p.background);
    useGallery.setState({ started: true, loaded: true });
    return true;
  });
  const layout = useMemo(() => buildLayout(p.arts, { portrait }), [p.arts, portrait]);
  useState(() => useGallery.setState({ layout }));
  const n = p.arts.length;
  const shot = shotAt(layout, n, f);
  const art = p.arts[shot.capIdx];

  const gateIn = ramp(f, 12, 24) * (1 - ramp(f, T.hold + 90, 20));
  const plazaAt = T.hold + Math.round(T.walk * 0.66);
  const plazaIn = ramp(f, plazaAt, 24) * (1 - ramp(f, plazaAt + 120, 20));
  const endAt = durationInFrames - T.orbit;
  const titleIn = ramp(f, endAt + 10, 30) * (1 - ramp(f, durationInFrames - 30, 20));
  const fade = Math.max(1 - ramp(f, 0, 18), ramp(f, durationInFrames - 22, 22));

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
        <GalleryScene layout={layout} quality="high" filmT={shot.t} />
        <TourCamera layout={layout} shot={shot} frame={f} />
        <SettleFrame frame={f} />
      </ThreeCanvas>

      {lower("계명대학교 성서캠퍼스 정문", "Keimyung University · Seongseo Campus", gateIn)}
      {lower("분수 광장", `작품 ${n}점이 분수를 둘러싸고 있습니다`, plazaIn)}

      {/* 작품 캡션 (전시관의 캡션 카드와 같은 모양) */}
      {art && shot.cap > 0.001 && (
        <AbsoluteFill style={{ justifyContent: "flex-end", alignItems: "flex-start", padding: portrait ? `0 ${40 * u}px ${170 * u}px` : `0 ${70 * u}px ${70 * u}px`, opacity: shot.cap }}>
          <div style={{ background: "rgba(255,255,255,0.92)", borderRadius: 22 * u, padding: `${26 * u}px ${34 * u}px`, minWidth: 420 * u, maxWidth: (portrait ? 1000 : 900) * u, boxShadow: "0 12px 40px rgba(0,0,0,0.25)", transform: `translateY(${(1 - shot.cap) * 14 * u}px)` }}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 30 * u }}>
              <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: 52 * u, color: "#1c1917", lineHeight: 1.15 }}>{art.name || art.title}</div>
              <div style={{ fontFamily: SANS, fontSize: 22 * u, color: "#a8a29e", paddingTop: 10 * u, whiteSpace: "nowrap" }}>
                {shot.capIdx + 1} / {n}
              </div>
            </div>
            <div style={{ fontFamily: SANS, fontSize: 26 * u, color: "#78716c", marginTop: 4 * u }}>{[art.nameEn, art.nationality, art.classroom].filter(Boolean).join(" · ")}</div>
            {art.description && <div style={{ fontFamily: SANS, fontSize: 24 * u, color: "#57534e", marginTop: 10 * u, lineHeight: 1.5 }}>{art.description}</div>}
          </div>
        </AbsoluteFill>
      )}

      {/* 마무리: 하늘에서 내려다보며 전시 제목 */}
      <AbsoluteFill style={{ alignItems: "center", justifyContent: "center", opacity: titleIn }}>
        <div style={{ textAlign: "center", color: "#fff", textShadow: "0 3px 24px rgba(0,0,0,0.6)", transform: `translateY(${(1 - titleIn) * 18 * u}px)` }}>
          <div style={{ fontFamily: SANS, fontSize: 30 * u, opacity: 0.9 }}>{p.info.상단문구}</div>
          <div style={{ fontFamily: SERIF, fontWeight: 900, fontSize: (portrait ? 92 : 104) * u, lineHeight: 1.15, marginTop: 10 * u }}>{p.info.제목 ?? "한글 이름 꾸미기 대회"}</div>
          <div style={{ fontFamily: SERIF, fontWeight: 700, fontSize: 52 * u, marginTop: 8 * u }}>{p.info.부제 ?? "작품 전시관"}</div>
          <div style={{ fontFamily: MONO, fontSize: 24 * u, letterSpacing: "0.3em", marginTop: 26 * u, opacity: 0.85 }}>HANGUL DAY · {p.info.기념일 ?? ""}</div>
        </div>
      </AbsoluteFill>

      <AbsoluteFill style={{ background: NAVY, opacity: fade, pointerEvents: "none" }} />
    </AbsoluteFill>
  );
}
