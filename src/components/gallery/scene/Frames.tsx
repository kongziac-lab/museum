"use client";

import { useMemo, type ReactElement } from "react";
import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { rng } from "./common";

/*
 * 작품 액자 — 사진·그림 액자처럼 네 변을 45° 로 맞댄 몰딩(단면이 계단진 틀)을 겹겹이 쌓는다.
 * 몰딩은 모서리를 살짝 깎아(베벨) 맞댄 자리에 가는 홈이 보이고, 나뭇결은 변마다 길이 방향으로 흐른다.
 * 매트(작품 둘레 여백)는 안쪽 가장자리를 비스듬히 잘라 흰 속심이 가늘게 보이게 한다.
 */

export type FrameStyle = "basic" | "walnut" | "brass" | "pyogu" | "lacquer";
export const FRAME_STYLES: FrameStyle[] = ["basic", "walnut", "brass", "pyogu", "lacquer"];

/* ───────────────────────── 절차 텍스처 (한 번만 만들어 함께 쓴다) ───────────────────────── */

function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, repeat: [number, number] = [1, 1], srgb = true) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  draw(c.getContext("2d")!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  return t;
}

/** 나뭇결 (가로로 흐른다) */
function woodTexture(base: string, dark: string, light: string, seed: number) {
  return canvasTex(1024, 256, (g) => {
    const r = rng(seed);
    g.fillStyle = base;
    g.fillRect(0, 0, 1024, 256);
    for (let i = 0; i < 90; i++) {
      const y0 = r() * 256;
      const amp = 2 + r() * 7;
      const freq = 0.002 + r() * 0.006;
      const ph = r() * 10;
      g.strokeStyle = r() < 0.55 ? dark : light;
      g.globalAlpha = 0.06 + r() * 0.16;
      g.lineWidth = 0.6 + r() * 2.6;
      g.beginPath();
      for (let x = 0; x <= 1024; x += 8) {
        const y = y0 + Math.sin(x * freq + ph) * amp + Math.sin(x * freq * 3.1 + ph) * amp * 0.3;
        if (x === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.stroke();
    }
    // 가는 물관 자국
    g.globalAlpha = 0.12;
    g.fillStyle = dark;
    for (let i = 0; i < 900; i++) g.fillRect(r() * 1024, r() * 256, 3 + r() * 10, 0.8);
    g.globalAlpha = 1;
  });
}

/** 비단 (가는 날실·씨실 + 은은한 구름무늬) */
function silkTexture(base: string, line: string, motif: string) {
  return canvasTex(
    512,
    512,
    (g) => {
      g.fillStyle = base;
      g.fillRect(0, 0, 512, 512);
      g.globalAlpha = 0.07;
      g.fillStyle = line;
      for (let i = 0; i < 512; i += 2) g.fillRect(0, i, 512, 1);
      g.globalAlpha = 0.04;
      for (let i = 0; i < 512; i += 3) g.fillRect(i, 0, 1, 512);
      // 구름무늬 (둥근 소용돌이 네 개)
      g.globalAlpha = 0.16;
      g.strokeStyle = motif;
      g.lineWidth = 3;
      const cloud = (cx: number, cy: number, s: number) => {
        g.beginPath();
        g.arc(cx, cy, s, Math.PI * 0.2, Math.PI * 1.9);
        g.arc(cx + s * 1.2, cy - s * 0.2, s * 0.7, Math.PI * 1.1, Math.PI * 2.4);
        g.arc(cx + s * 0.4, cy + s * 0.3, s * 0.35, 0, Math.PI * 2);
        g.stroke();
      };
      cloud(110, 130, 34);
      cloud(370, 170, 30);
      cloud(160, 380, 30);
      cloud(410, 420, 34);
      g.globalAlpha = 1;
    },
    [3, 3]
  );
}

/** 한지 (섬유가 비치는 종이) */
function hanjiTexture() {
  return canvasTex(
    512,
    512,
    (g) => {
      const r = rng(7);
      g.fillStyle = "#f1ead9";
      g.fillRect(0, 0, 512, 512);
      for (let i = 0; i < 700; i++) {
        const x = r() * 512;
        const y = r() * 512;
        const a = r() * Math.PI;
        const l = 6 + r() * 30;
        g.strokeStyle = r() < 0.5 ? "#d9cfb8" : "#fbf8f0";
        g.globalAlpha = 0.25 + r() * 0.35;
        g.lineWidth = 0.6 + r() * 0.8;
        g.beginPath();
        g.moveTo(x, y);
        g.quadraticCurveTo(x + Math.cos(a) * l * 0.5 + (r() - 0.5) * 8, y + Math.sin(a) * l * 0.5 + (r() - 0.5) * 8, x + Math.cos(a) * l, y + Math.sin(a) * l);
        g.stroke();
      }
      g.globalAlpha = 1;
    },
    [2, 2]
  );
}

/** 리넨 매트 (가는 짜임) */
function linenTexture(base: string) {
  return canvasTex(
    256,
    256,
    (g) => {
      const r = rng(3);
      g.fillStyle = base;
      g.fillRect(0, 0, 256, 256);
      for (let i = 0; i < 256; i += 2) {
        g.globalAlpha = 0.04 + r() * 0.05;
        g.fillStyle = r() < 0.5 ? "#000" : "#fff";
        g.fillRect(0, i, 256, 1);
        g.fillRect(i, 0, 1, 256);
      }
      g.globalAlpha = 1;
    },
    [6, 6]
  );
}

/** 브러시드 금속 결 (가로) */
function brushedTexture() {
  return canvasTex(
    512,
    64,
    (g) => {
      const r = rng(11);
      g.fillStyle = "#808080";
      g.fillRect(0, 0, 512, 64);
      for (let i = 0; i < 400; i++) {
        g.globalAlpha = 0.08 + r() * 0.2;
        g.fillStyle = r() < 0.5 ? "#5a5a5a" : "#a8a8a8";
        g.fillRect(r() * 512, r() * 64, 40 + r() * 200, 0.7);
      }
      g.globalAlpha = 1;
    },
    [1, 1],
    false
  );
}

type Mats = Record<string, THREE.Material>;
let mats: Mats | null = null;

/** 액자 재질 (처음 쓸 때 한 번 만든다) */
function frameMaterials(): Mats {
  if (mats) return mats;
  const walnut = woodTexture("#4a2f1f", "#24150c", "#6d4a33", 21);
  const paulownia = woodTexture("#b58d62", "#7e5b3a", "#d3b08a", 5);
  const brushed = brushedTexture();
  const linen = linenTexture("#efe9dc");
  mats = {
    // 기본 (지금 것)
    basicFrame: new THREE.MeshStandardMaterial({ color: "#26282b", metalness: 0.6, roughness: 0.38 }),
    basicMat: new THREE.MeshStandardMaterial({ color: "#f3f0e9", roughness: 0.92 }),
    // 월넛 + 금박
    walnut: new THREE.MeshPhysicalMaterial({ map: walnut, color: "#ffffff", roughness: 0.42, clearcoat: 0.55, clearcoatRoughness: 0.28 }),
    walnutDark: new THREE.MeshPhysicalMaterial({ map: walnut, color: "#8a7a70", roughness: 0.5, clearcoat: 0.4, clearcoatRoughness: 0.35 }),
    gold: new THREE.MeshStandardMaterial({ color: "#d4b06a", metalness: 1, roughness: 0.26 }),
    goldSoft: new THREE.MeshStandardMaterial({ color: "#c9a760", metalness: 1, roughness: 0.4 }),
    linen: new THREE.MeshStandardMaterial({ map: linen, roughness: 0.95 }),
    matCore: new THREE.MeshStandardMaterial({ color: "#fbf9f4", roughness: 0.9 }),
    // 황동 플로트
    brass: new THREE.MeshStandardMaterial({ color: "#c8a468", metalness: 1, roughness: 0.3, roughnessMap: brushed }),
    charcoal: new THREE.MeshStandardMaterial({ color: "#1d1e21", roughness: 0.85 }),
    granite: new THREE.MeshStandardMaterial({ color: "#232427", roughness: 0.35, metalness: 0.1 }),
    // 전통 표구 (오동나무 테 + 비단 장황 + 한지)
    paulownia: new THREE.MeshStandardMaterial({ map: paulownia, roughness: 0.62 }),
    silk: new THREE.MeshStandardMaterial({ map: silkTexture("#2f4a5c", "#ffffff", "#d9c38e"), roughness: 0.55, metalness: 0.05 }),
    hanji: new THREE.MeshStandardMaterial({ map: hanjiTexture(), roughness: 0.95 }),
    // 흑칠 + 금선
    lacquer: new THREE.MeshPhysicalMaterial({ color: "#0e0d0d", roughness: 0.18, clearcoat: 1, clearcoatRoughness: 0.06 }),
    ivory: new THREE.MeshStandardMaterial({ map: linen, color: "#f7f0de", roughness: 0.93 }),
  };
  return mats;
}

/* ───────────────────────── 몰딩 (45° 로 맞댄 네 변) ───────────────────────── */

const geoCache = new Map<string, THREE.BufferGeometry>();

/**
 * 바깥 크기 ow×oh, 폭 width, 두께 depth 인 틀. 네 변을 사다리꼴로 잘라 붙이고(맞댄 자리에 베벨 홈),
 * 세로 변은 텍스처 좌표를 돌려 결이 길이 방향으로 흐르게 한다. z 는 0(뒤) → depth(앞).
 */
function moulding(ow: number, oh: number, width: number, depth: number, bevel: number) {
  const key = [ow, oh, width, depth, bevel].map((v) => v.toFixed(4)).join("|");
  const hit = geoCache.get(key);
  if (hit) return hit;
  const x0 = ow / 2;
  const y0 = oh / 2;
  const x1 = x0 - width;
  const y1 = y0 - width;
  const b = Math.min(bevel, width * 0.3, depth * 0.45);
  const opts: THREE.ExtrudeGeometryOptions = { depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2, curveSegments: 1 };
  const side = (pts: [number, number][], vertical: boolean) => {
    // 베벨이 바깥으로 부푸는 만큼 안으로 줄여 둔다
    const cx = pts.reduce((s, p) => s + p[0], 0) / 4;
    const cy = pts.reduce((s, p) => s + p[1], 0) / 4;
    const shape = new THREE.Shape(
      pts.map(([x, y]) => {
        const dx = Math.sign(x - cx);
        const dy = Math.sign(y - cy);
        return new THREE.Vector2(x - dx * b, y - dy * b);
      })
    );
    const geo = new THREE.ExtrudeGeometry(shape, opts);
    geo.translate(0, 0, b);
    // 결 방향: 텍스처 좌표를 크기에 맞춰 (1 = 약 0.6 m)
    const uv = geo.getAttribute("uv") as THREE.BufferAttribute;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      const v = uv.getY(i);
      if (vertical) uv.setXY(i, v / 0.6, u / 0.6 + 0.37);
      else uv.setXY(i, u / 0.6, v / 0.6);
    }
    return geo;
  };
  const pieces = [
    side([[-x0, y0], [x0, y0], [x1, y1], [-x1, y1]], false), // 위
    side([[-x1, -y1], [x1, -y1], [x0, -y0], [-x0, -y0]], false), // 아래
    side([[-x0, -y0], [-x1, -y1], [-x1, y1], [-x0, y0]], true), // 왼쪽
    side([[x1, -y1], [x0, -y0], [x0, y0], [x1, y1]], true), // 오른쪽
  ];
  const merged = mergeGeometries(pieces.map((p) => p.toNonIndexed()));
  pieces.forEach((p) => p.dispose());
  merged.computeVertexNormals();
  geoCache.set(key, merged);
  return merged;
}

/** 두께가 있는 판 (가장자리를 살짝 깎은) */
function slab(w: number, h: number, depth: number, bevel: number) {
  const key = ["slab", w, h, depth, bevel].map((v) => (typeof v === "number" ? v.toFixed(4) : v)).join("|");
  const hit = geoCache.get(key);
  if (hit) return hit;
  const b = Math.min(bevel, depth * 0.45);
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2 + b, -h / 2 + b);
  shape.lineTo(w / 2 - b, -h / 2 + b);
  shape.lineTo(w / 2 - b, h / 2 - b);
  shape.lineTo(-w / 2 + b, h / 2 - b);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: depth - 2 * b, bevelEnabled: b > 0, bevelThickness: b, bevelSize: b, bevelSegments: 2 });
  geo.translate(0, 0, b);
  geoCache.set(key, geo);
  return geo;
}

/* ───────────────────────── 액자 모양 정의 ───────────────────────── */

interface Layer {
  /** 바깥에서 안으로 들어온 거리 (m) */
  inset: number;
  width: number;
  depth: number;
  /** 뒤판 기준 앞으로 나온 정도 (m) */
  z?: number;
  bevel: number;
  mat: string;
}

interface Spec {
  /** 몰딩 전체 폭 (바깥 ~ 매트) */
  rim: number;
  layers: Layer[];
  /** 작품 둘레 여백 */
  pad: number;
  padMat: string;
  /** 여백 안쪽 비스듬한 절단면(흰 속심) 폭 */
  core: number;
  /** 여백 두께 */
  padDepth: number;
  /** 작품이 떠 보이게 여백 위로 올린 높이 (플로트) */
  lift?: number;
  back: string;
  leg: "box" | "post" | "rod";
  legMat: string;
  foot: string;
}

export const SPECS: Record<FrameStyle, Spec> = {
  basic: {
    rim: 0.035,
    layers: [{ inset: 0, width: 0.035, depth: 0.05, bevel: 0.012, mat: "basicFrame" }],
    pad: 0.12,
    padMat: "basicMat",
    core: 0,
    padDepth: 0.002,
    back: "basicFrame",
    leg: "box",
    legMat: "basicFrame",
    foot: "basicFrame",
  },
  // 월넛 원목 몰딩 + 안쪽 금박 턱 + 리넨 매트 (미술관 고전 액자)
  walnut: {
    rim: 0.19,
    layers: [
      { inset: 0, width: 0.13, depth: 0.085, bevel: 0.018, mat: "walnut" },
      { inset: 0.028, width: 0.034, depth: 0.1, bevel: 0.012, mat: "goldSoft" }, // 바깥 금선
      { inset: 0.13, width: 0.04, depth: 0.066, bevel: 0.012, mat: "walnutDark" },
      { inset: 0.17, width: 0.02, depth: 0.056, bevel: 0.007, mat: "gold" }, // 안쪽 금박 턱
    ],
    pad: 0.18,
    padMat: "linen",
    core: 0.01,
    padDepth: 0.02,
    back: "walnutDark",
    leg: "post",
    legMat: "walnut",
    foot: "granite",
  },
  // 가는 황동 테 + 그림자 틈 + 짙은 판 위에 떠 있는 작품 (현대 미술관)
  brass: {
    rim: 0.045,
    layers: [
      { inset: 0, width: 0.018, depth: 0.08, bevel: 0.004, mat: "brass" },
      { inset: 0.018, width: 0.027, depth: 0.03, bevel: 0.002, mat: "charcoal" }, // 그림자 틈
    ],
    pad: 0.1,
    padMat: "charcoal",
    core: 0,
    padDepth: 0.04,
    lift: 0.018,
    back: "charcoal",
    leg: "rod",
    legMat: "brass",
    foot: "granite",
  },
  // 전통 표구: 오동나무 테 + 쪽빛 비단 장황(구름무늬) + 금선 + 한지
  pyogu: {
    rim: 0.075,
    layers: [
      { inset: 0, width: 0.06, depth: 0.06, bevel: 0.012, mat: "paulownia" },
      { inset: 0.06, width: 0.015, depth: 0.045, bevel: 0.005, mat: "goldSoft" },
    ],
    pad: 0.2,
    padMat: "silk",
    core: 0.03, // 비단 안쪽 한지 띠
    padDepth: 0.012,
    back: "paulownia",
    leg: "post",
    legMat: "paulownia",
    foot: "granite",
  },
  // 흑칠 몰딩 + 가는 금선 두 줄 + 상아색 매트 (옻칠 느낌)
  lacquer: {
    rim: 0.15,
    layers: [
      { inset: 0, width: 0.11, depth: 0.08, bevel: 0.024, mat: "lacquer" },
      { inset: 0.016, width: 0.01, depth: 0.09, bevel: 0.004, mat: "gold" },
      { inset: 0.11, width: 0.04, depth: 0.056, bevel: 0.01, mat: "lacquer" },
      { inset: 0.14, width: 0.01, depth: 0.062, bevel: 0.004, mat: "gold" },
    ],
    pad: 0.17,
    padMat: "ivory",
    core: 0.01,
    padDepth: 0.018,
    back: "lacquer",
    leg: "post",
    legMat: "lacquer",
    foot: "granite",
  },
};

/** 액자 바깥 크기 */
export function frameOuter(style: FrameStyle, w: number, h: number) {
  const s = SPECS[style];
  return { W: w + 2 * (s.pad + s.rim), H: h + 2 * (s.pad + s.rim) };
}

/**
 * 작품을 뺀 액자 (틀·여백·뒤판). 앞면 z=0 이 작품 자리이고, 틀은 그보다 앞으로 나온다.
 * 작품 평면은 부르는 쪽에서 z = artZ 에 놓는다.
 */
export function ArtFrame({ style, w, h, cy }: { style: FrameStyle; w: number; h: number; cy: number }) {
  const s = SPECS[style];
  const m = frameMaterials();
  const { W, H } = frameOuter(style, w, h);
  const back = -0.03; // 뒤판 앞면
  const nodes = useMemo(() => {
    const out: ReactElement[] = [];
    // 뒤판
    out.push(<mesh key="back" geometry={slab(W - 0.01, H - 0.01, 0.02, 0.004)} position={[0, cy, back - 0.02]} material={m[s.back]} castShadow receiveShadow />);
    // 몰딩 겹
    s.layers.forEach((L, i) => {
      out.push(
        <mesh
          key={`l${i}`}
          geometry={moulding(W - 2 * L.inset, H - 2 * L.inset, L.width, L.depth, L.bevel)}
          position={[0, cy, back + (L.z ?? 0)]}
          material={m[L.mat]}
          castShadow
          receiveShadow
        />
      );
    });
    // 여백(매트): 두께 있는 판 + 안쪽 비스듬한 흰 속심 (한지 띠)
    const iw = W - 2 * s.rim;
    const ih = H - 2 * s.rim;
    out.push(<mesh key="pad" geometry={slab(iw + 0.004, ih + 0.004, s.padDepth, 0.002)} position={[0, cy, back]} material={m[s.padMat]} receiveShadow />);
    if (s.core > 0) {
      const coreMat = style === "pyogu" ? m.hanji : m.matCore;
      out.push(
        <mesh
          key="core"
          geometry={moulding(w + 2 * s.core, h + 2 * s.core, s.core, s.padDepth + 0.002, s.core * 0.4)}
          position={[0, cy, back]}
          material={coreMat}
          receiveShadow
        />
      );
    }
    if (s.lift) {
      // 떠 있는 작품 뒤 받침 (그림자가 생기게)
      out.push(<mesh key="lift" geometry={slab(w - 0.04, h - 0.04, s.lift, 0.002)} position={[0, cy, back + s.padDepth]} material={m.charcoal} castShadow />);
    }
    return out;
  }, [style, W, H, w, h, cy, s, m]);
  return <>{nodes}</>;
}

/** 작품 평면을 놓을 z (여백 앞면 + 플로트) */
export function artZ(style: FrameStyle) {
  const s = SPECS[style];
  return -0.03 + s.padDepth + (s.lift ?? 0) + 0.001;
}

/** 액자 다리 + 받침 */
export function FrameLegs({ style, W, legH, cy }: { style: FrameStyle; W: number; legH: number; cy: number }) {
  const s = SPECS[style];
  const m = frameMaterials();
  if (s.leg === "box") {
    return (
      <>
        {[-1, 1].map((k) => (
          <group key={k} position={[(k * W) / 2.8, 0, -0.06]}>
            <mesh position={[0, legH / 2 + 0.01, 0]} material={m.basicFrame} castShadow>
              <boxGeometry args={[0.05, legH, 0.05]} />
            </mesh>
            <mesh position={[0, 0.012, 0]} material={m.basicFrame} castShadow receiveShadow>
              <boxGeometry args={[0.16, 0.024, 0.34]} />
            </mesh>
          </group>
        ))}
      </>
    );
  }
  const top = cy; // 다리는 액자 가운데 높이까지 (뒤에서 받친다)
  return (
    <>
      {[-1, 1].map((k) => (
        <group key={k} position={[(k * W) / 3.2, 0, -0.1]}>
          {s.leg === "rod" ? (
            <mesh position={[0, top / 2, 0]} material={m[s.legMat]} castShadow>
              <cylinderGeometry args={[0.016, 0.016, top, 16]} />
            </mesh>
          ) : (
            <mesh position={[0, top / 2, 0]} material={m[s.legMat]} castShadow>
              <boxGeometry args={[0.06, top, 0.045]} />
            </mesh>
          )}
          {/* 받침: 낮은 돌 받침 + 금속 띠 */}
          <mesh geometry={slab(0.26, 0.4, 0.06, 0.008)} rotation={[-Math.PI / 2, 0, 0]} material={m[s.foot]} castShadow receiveShadow />
          <mesh position={[0, 0.063, 0]} material={m[s.leg === "rod" ? "brass" : "goldSoft"]}>
            <cylinderGeometry args={[0.035, 0.035, 0.006, 24]} />
          </mesh>
        </group>
      ))}
    </>
  );
}

/** 미리보기: 주소 뒤 ?frame=walnut 처럼 골라 볼 수 있다 */
export function pickFrameStyle(fallback: FrameStyle): FrameStyle {
  if (typeof window === "undefined") return fallback;
  const q = new URLSearchParams(window.location.search).get("frame") as FrameStyle | null;
  return q && FRAME_STYLES.includes(q) ? q : fallback;
}
