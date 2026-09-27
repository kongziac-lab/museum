"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Sky } from "@react-three/drei";
import * as THREE from "three";
import { awardColor } from "@/lib/config";
import { WALK, goTo, useGallery, type GalleryLayout, type Stop } from "@/lib/gallery";
import type { ExhibitionBackground } from "@/lib/types";

const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';
const SKY_HORIZON = "#dfeaf2";

/* ───────────────────────── 텍스처 ───────────────────────── */

const texCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** 필요할 때만 이미지를 불러온다 (가까운 작품만). */
function useLazyTexture(src: string, enabled: boolean) {
  const [tex, setTex] = useState<THREE.Texture | null>(() => texCache.get(src) ?? null);
  useEffect(() => {
    if (!enabled || tex) return;
    const cached = texCache.get(src);
    if (cached) {
      setTex(cached);
      return;
    }
    let alive = true;
    loader.load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        texCache.set(src, t);
        if (alive) setTex(t);
      },
      undefined,
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [src, enabled, tex]);
  return tex;
}

/** 캔버스에 글자를 그려 텍스처로 만든다. */
function useCanvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, [w, h]);
  useEffect(() => {
    const run = () => {
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      draw(g);
      texture.needsUpdate = true;
    };
    run();
    document.fonts?.ready.then(run).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

function fitText(g: CanvasRenderingContext2D, text: string, weight: number, max: number, maxWidth: number) {
  let size = max;
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > maxWidth && size > 20) {
    size -= 3;
    g.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

/* ───────────────────────── 하늘·땅 ───────────────────────── */

function Backdrop({ bg, layout }: { bg: ExhibitionBackground | null; layout: GalleryLayout }) {
  const tex = useLazyTexture(bg?.src ?? "", Boolean(bg));
  if (bg && tex && bg.panorama) {
    return (
      <mesh scale={[-1, 1, 1]}>
        <sphereGeometry args={[400, 64, 32]} />
        <meshBasicMaterial map={tex} side={THREE.BackSide} fog={false} toneMapped={false} />
      </mesh>
    );
  }
  return (
    <>
      <Sky distance={4000} sunPosition={[80, 40, -60]} turbidity={4} rayleigh={0.8} mieCoefficient={0.004} mieDirectionalG={0.8} />
      {bg && tex && <BackdropPhoto tex={tex} bg={bg} layout={layout} />}
    </>
  );
}

/** 배경막 가장자리(양옆·위)를 투명하게 흐려 하늘과 이어지게 하는 알파 맵. */
function useFeatherMask() {
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    const side = g.createLinearGradient(0, 0, 256, 0);
    side.addColorStop(0, "#000");
    side.addColorStop(0.08, "#555");
    side.addColorStop(0.22, "#fff");
    side.addColorStop(0.78, "#fff");
    side.addColorStop(0.92, "#555");
    side.addColorStop(1, "#000");
    g.fillStyle = side;
    g.fillRect(0, 0, 256, 256);
    // 위쪽 하늘 부분은 장면의 하늘로 녹아들게
    g.globalCompositeOperation = "multiply";
    const top = g.createLinearGradient(0, 0, 0, 256);
    top.addColorStop(0, "#000");
    top.addColorStop(0.3, "#fff");
    top.addColorStop(1, "#fff");
    g.fillStyle = top;
    g.fillRect(0, 0, 256, 256);
    return new THREE.CanvasTexture(c);
  }, []);
  useEffect(() => () => tex.dispose(), [tex]);
  return tex;
}

/**
 * 일반 사진: 산책로 끝 너머에 선 휜 배경막.
 * 마지막 관람 위치를 중심으로 휘어서 끝에 다가갈수록 사진이 바르게 보인다.
 * 세로·정사각 사진이 하늘 높이 치솟지 않도록 높이를 제한하고, 폭은 사진 비율을 따른다.
 */
function BackdropPhoto({ tex, bg, layout }: { tex: THREE.Texture; bg: ExhibitionBackground; layout: GalleryLayout }) {
  const mask = useFeatherMask();
  const aspect = bg.width && bg.height ? bg.width / bg.height : 1.6;
  const last = layout.stops[layout.stops.length - 1];
  const end = layout.at(last ? last.viewDist : 40).p;
  const radius = 80;
  const maxArc = Math.PI * 0.9;
  const height = Math.min(44, (radius * maxArc) / aspect);
  const arc = (height * aspect) / radius;
  return (
    // 사진 아래 끝(잔디)이 땅에 살짝 묻히게
    <mesh position={[end.x, height / 2 - 0.5, end.z]}>
      <cylinderGeometry args={[radius, radius, height, 64, 1, true, Math.PI - arc / 2, arc]} />
      <meshBasicMaterial
        map={tex}
        alphaMap={mask}
        transparent
        depthWrite={false}
        side={THREE.BackSide}
        fog={false}
        toneMapped={false}
      />
    </mesh>
  );
}

function Ground({ layout }: { layout: GalleryLayout }) {
  // 길이 길어져도 산책로 끝의 배경막 아래까지 땅이 이어지게
  const size = Math.max(800, layout.length * 2 + 400);
  const tex = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = c.height = 256;
    const g = c.getContext("2d")!;
    g.fillStyle = "#8dbb6c";
    g.fillRect(0, 0, 256, 256);
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let i = 0; i < 2600; i++) {
      const v = rnd();
      g.fillStyle = v < 0.5 ? "rgba(70,120,50,0.35)" : "rgba(170,210,120,0.3)";
      g.fillRect(rnd() * 256, rnd() * 256, 2, 2 + rnd() * 3);
    }
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(size * 0.15, size * 0.15);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  }, [size]);
  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, -layout.length / 2]}>
      <planeGeometry args={[size, size]} />
      <meshStandardMaterial map={tex} roughness={1} />
    </mesh>
  );
}

/** 산책로: 곡선을 따라 만든 띠 모양 길 + 양쪽 경계석. */
function PathRibbon({ layout }: { layout: GalleryLayout }) {
  const geos = useMemo(() => {
    const make = (inner: number, outer: number, y: number) => {
      const steps = Math.ceil(layout.length / 0.8);
      const pos: number[] = [];
      const idx: number[] = [];
      for (let s = 0; s <= steps; s++) {
        const d = (s / steps) * layout.length - 8;
        const { p, left } = layout.at(d);
        const a = p.clone().addScaledVector(left, inner);
        const b = p.clone().addScaledVector(left, outer);
        pos.push(a.x, y, a.z, b.x, y, b.z);
        if (s > 0) {
          const k = s * 2;
          idx.push(k - 2, k - 1, k, k - 1, k + 1, k);
        }
      }
      const g = new THREE.BufferGeometry();
      g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
      g.setIndex(idx);
      g.computeVertexNormals();
      return g;
    };
    const hw = WALK.pathWidth / 2;
    return {
      path: make(-hw, hw, 0.02),
      edgeL: make(hw, hw + 0.18, 0.05),
      edgeR: make(-hw - 0.18, -hw, 0.05),
    };
  }, [layout]);
  return (
    <group>
      <mesh geometry={geos.path}>
        <meshStandardMaterial color="#e9dfcb" roughness={0.95} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.edgeL}>
        <meshStandardMaterial color="#c9bba0" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
      <mesh geometry={geos.edgeR}>
        <meshStandardMaterial color="#c9bba0" roughness={0.9} side={THREE.DoubleSide} />
      </mesh>
    </group>
  );
}

/** 길 양옆 나무 (인스턴싱 — 수백 그루도 가볍게). */
function Trees({ layout }: { layout: GalleryLayout }) {
  const trunkRef = useRef<THREE.InstancedMesh>(null);
  const leafRef = useRef<THREE.InstancedMesh>(null);
  const trees = useMemo(() => {
    let seed = 42;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    const out: { x: number; z: number; s: number; hue: number }[] = [];
    const count = Math.min(420, Math.round(layout.length * 1.6));
    let guard = 0;
    while (out.length < count && guard++ < count * 6) {
      const d = rnd() * (layout.length + 20) - 12;
      const side = rnd() < 0.5 ? -1 : 1;
      const off = 6 + rnd() * 26;
      const { p, left } = layout.at(d);
      const x = p.x + left.x * side * off;
      const z = p.z + left.z * side * off;
      // 작품 바로 뒤는 비워 둔다
      if (layout.stops.some((s) => Math.hypot(s.center.x - x, s.center.z - z) < 4.2)) continue;
      out.push({ x, z, s: 0.8 + rnd() * 0.9, hue: rnd() });
    }
    return out;
  }, [layout]);

  useEffect(() => {
    const m = new THREE.Matrix4();
    const q = new THREE.Quaternion();
    const c = new THREE.Color();
    trees.forEach((t, i) => {
      m.compose(new THREE.Vector3(t.x, 1.1 * t.s, t.z), q, new THREE.Vector3(t.s, t.s, t.s));
      trunkRef.current?.setMatrixAt(i, m);
      m.compose(new THREE.Vector3(t.x, 3.2 * t.s, t.z), q, new THREE.Vector3(t.s * 1.05, t.s * 1.25, t.s * 1.05));
      leafRef.current?.setMatrixAt(i, m);
      c.setHSL(0.26 + t.hue * 0.08, 0.42, 0.3 + t.hue * 0.12);
      leafRef.current?.setColorAt(i, c);
    });
    // 화면 밖 판정 범위를 나무 전체 위치로 다시 계산 (안 하면 입구가 시야를 벗어날 때 나무가 모두 사라진다)
    if (trunkRef.current) {
      trunkRef.current.instanceMatrix.needsUpdate = true;
      trunkRef.current.computeBoundingSphere();
    }
    if (leafRef.current) {
      leafRef.current.instanceMatrix.needsUpdate = true;
      if (leafRef.current.instanceColor) leafRef.current.instanceColor.needsUpdate = true;
      leafRef.current.computeBoundingSphere();
    }
  }, [trees]);

  return (
    <group>
      <instancedMesh ref={trunkRef} args={[undefined, undefined, trees.length]}>
        <cylinderGeometry args={[0.14, 0.2, 2.2, 6]} />
        <meshStandardMaterial color="#6b4f36" roughness={1} />
      </instancedMesh>
      <instancedMesh ref={leafRef} args={[undefined, undefined, trees.length]}>
        <icosahedronGeometry args={[1.5, 0]} />
        <meshStandardMaterial roughness={0.9} flatShading />
      </instancedMesh>
    </group>
  );
}

/* ───────────────────────── 입구·표지판 ───────────────────────── */

function EntranceGate({ layout }: { layout: GalleryLayout }) {
  const info = useGallery((s) => s.info);
  const title = info.제목 ?? "한글 이름 꾸미기 대회";
  const sub = info.부제 ?? "수상작 전시";
  const tex = useCanvasTexture(
    1400,
    300,
    (g) => {
      g.fillStyle = "#274b6d";
      g.fillRect(0, 0, 1400, 300);
      g.strokeStyle = "#e9d8a6";
      g.lineWidth = 8;
      g.strokeRect(14, 14, 1372, 272);
      g.fillStyle = "#fffaf0";
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, title, 700, 120, 1250);
      g.fillText(title, 700, 125);
      g.fillStyle = "#e9d8a6";
      fitText(g, sub, 500, 64, 1200);
      g.fillText(sub, 700, 225);
    },
    [title, sub]
  );
  const { p, tan } = layout.at(6);
  const yaw = Math.atan2(-tan.x, -tan.z);
  const span = WALK.pathWidth + 1.6;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, yaw, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * span) / 2, 1.9, 0]}>
          <boxGeometry args={[0.28, 3.8, 0.28]} />
          <meshStandardMaterial color="#274b6d" roughness={0.6} />
        </mesh>
      ))}
      <mesh position={[0, 4.05, 0]}>
        <boxGeometry args={[span + 0.9, 0.95, 0.16]} />
        <meshStandardMaterial color="#274b6d" roughness={0.6} />
      </mesh>
      <mesh position={[0, 4.05, 0.085]}>
        <planeGeometry args={[span + 0.8, (span + 0.8) * (300 / 1400)]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/** 부문이 바뀌는 곳에 세우는 작은 표지판 */
function GroupSign({ stop, layout }: { stop: Stop; layout: GalleryLayout }) {
  const label = stop.groupStart ?? "";
  const color = awardColor(label);
  const tex = useCanvasTexture(
    600,
    260,
    (g) => {
      g.fillStyle = "#fffaf0";
      g.fillRect(0, 0, 600, 260);
      g.fillStyle = color;
      g.fillRect(0, 0, 600, 34);
      g.fillStyle = "#1d1b19";
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, label, 800, 110, 540);
      g.fillText(label, 300, 150);
    },
    [label, color]
  );
  const { p, left, tan } = layout.at(stop.viewDist - 2.2);
  const side = -stop.side;
  const pos = p.clone().addScaledVector(left, side * (WALK.pathWidth / 2 + 0.8));
  const yaw = Math.atan2(-tan.x, -tan.z) - side * 0.45;
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.7, -0.03]}>
        <boxGeometry args={[0.08, 1.4, 0.08]} />
        <meshStandardMaterial color="#5a4632" />
      </mesh>
      <mesh position={[0, 1.55, 0]}>
        <planeGeometry args={[1.2, 0.52]} />
        <meshBasicMaterial map={tex} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── 작품 스탠드 ───────────────────────── */

function ArtStand({ stop, active, near }: { stop: Stop; active: boolean; near: boolean }) {
  const { art, w, h } = stop;
  const tex = useLazyTexture(art.src, near);
  const color = awardColor(art.award);
  const pad = 0.12;
  const boardW = w + pad * 2;
  const boardH = h + pad * 2;

  const label = useCanvasTexture(
    800,
    240,
    (g) => {
      g.fillStyle = "#fffaf0";
      g.fillRect(0, 0, 800, 240);
      g.fillStyle = color;
      g.fillRect(0, 0, 16, 240);
      g.textBaseline = "alphabetic";
      if (art.award) {
        g.fillStyle = color;
        g.font = `700 54px ${FONT}`;
        g.fillText(art.award, 52, 78);
      }
      g.fillStyle = "#1d1b19";
      fitText(g, art.name || art.title, 700, 82, 700);
      g.fillText(art.name || art.title, 52, 166);
      if (art.nationality) {
        g.fillStyle = "#6b645c";
        g.font = `500 44px ${FONT}`;
        g.fillText(art.nationality, 52, 222);
      }
    },
    [art.award, art.name, art.title, art.nationality, color]
  );

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return; // 드래그는 무시
    const st = useGallery.getState();
    if (Math.abs(st.current - stop.index) < 0.15) st.openDetail(stop.index);
    else goTo(stop.index);
  };

  return (
    <group position={[stop.center.x, 0, stop.center.z]} rotation={[0, stop.yaw, 0]}>
      <group
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        {/* 받침 판 */}
        <mesh position={[0, stop.center.y, -0.05]}>
          <boxGeometry args={[boardW, boardH, 0.08]} />
          <meshStandardMaterial color="#fbf8f2" roughness={0.9} emissive="#fbf8f2" emissiveIntensity={0.55} />
        </mesh>
        {/* 부문 색 테두리 */}
        <mesh position={[0, stop.center.y, -0.1]}>
          <boxGeometry args={[boardW + 0.08, boardH + 0.08, 0.04]} />
          <meshStandardMaterial color={active ? color : "#3d3a36"} roughness={0.7} />
        </mesh>
        {/* 작품 */}
        <mesh position={[0, stop.center.y, 0.001]}>
          <planeGeometry args={[w, h]} />
          {tex ? (
            // 작품은 조명 영향 없이 원래 색 그대로 보이게
            <meshBasicMaterial key="tex" map={tex} toneMapped={false} />
          ) : (
            <meshStandardMaterial key="blank" color="#d8d2c8" />
          )}
        </mesh>
      </group>
      {/* 다리 */}
      {[-1, 1].map((s) => (
        <mesh key={s} position={[(s * boardW) / 2.6, (stop.center.y - boardH / 2) / 2, -0.1]}>
          <boxGeometry args={[0.07, stop.center.y - boardH / 2, 0.07]} />
          <meshStandardMaterial color="#3d3a36" />
        </mesh>
      ))}
      {/* 명패: 작품 오른쪽 아래 낮은 받침 */}
      <group position={[boardW / 2 + 0.55, 0, 0.1]}>
        <mesh position={[0, 0.5, 0]}>
          <boxGeometry args={[0.06, 1.0, 0.06]} />
          <meshStandardMaterial color="#3d3a36" />
        </mesh>
        <mesh position={[0, 1.02, 0.02]} rotation={[-0.35, 0, 0]}>
          <planeGeometry args={[0.8, 0.24]} />
          <meshBasicMaterial map={label} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

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

/* ───────────────────────── 씬 ───────────────────────── */

export function GalleryScene({ layout }: { layout: GalleryLayout }) {
  const background = useGallery((s) => s.background);
  const current = useGallery((s) => s.current);
  const nearest = Math.round(current);
  const settled = Math.abs(current - nearest) < 0.2;

  return (
    <>
      <color attach="background" args={[SKY_HORIZON]} />
      <fog attach="fog" args={[SKY_HORIZON, 45, 170]} />
      <hemisphereLight args={["#eaf4ff", "#6d8a52", 1.1]} />
      <directionalLight position={[40, 60, 20]} intensity={1.6} color="#fff4e0" />
      <ambientLight intensity={0.25} />

      <Backdrop bg={background} layout={layout} />
      <Ground layout={layout} />
      <PathRibbon layout={layout} />
      <Trees layout={layout} />
      <EntranceGate layout={layout} />

      {layout.stops.map((s) => (
        <group key={s.art.id}>
          {s.groupStart && <GroupSign stop={s} layout={layout} />}
          <ArtStand stop={s} active={settled && nearest === s.index} near={Math.abs(current - s.index) < 7} />
        </group>
      ))}

      <CameraRig layout={layout} />
    </>
  );
}
