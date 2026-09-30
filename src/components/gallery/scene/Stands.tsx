"use client";

import { useMemo } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { WALK, colorOf, goTo, offStop, openViewer, stopIndex, useGallery, type GalleryLayout, type Stop } from "@/lib/gallery";
import { FONT, SCENERY, fitText, useCanvasTexture, useLazyTexture } from "./common";
import { useTexture } from "@react-three/drei";
import type { SitePlan } from "./sitePlan";
import { ArtFrame, FrameLegs, artZ, frameOuter, pickFrameStyle, SPECS } from "./Frames";

/* 공용 재질 */
const frameMat = new THREE.MeshStandardMaterial({ color: "#26282b", metalness: 0.6, roughness: 0.38 });
const steelMat = new THREE.MeshStandardMaterial({ color: "#8d9095", metalness: 0.85, roughness: 0.32 });

/** 액자 모양: 월넛 원목 + 금박 (다른 시안은 주소 뒤 ?frame=brass · pyogu · lacquer · basic) */
const FRAME = pickFrameStyle("walnut");

/* ───────────────────────── 작품 스탠드 ───────────────────────── */

export function ArtStand({ stop, active, near }: { stop: Stop; active: boolean; near: boolean }) {
  const { art, w, h } = stop;
  // 썸네일은 늘 걸어 두고(멀리서도 원 둘레 작품이 다 보이게), 가까이 오면 선명한 텍스처로 바꾼다
  const thumb = useLazyTexture(art.thumb ?? art.src, true, true);
  const full = useLazyTexture(art.tex ?? art.src, near);
  const tex = full ?? thumb;
  const color = colorOf(art);
  const { W: boardW, H: boardH } = frameOuter(FRAME, w, h);
  const pad = SPECS[FRAME].pad;
  const cy = stop.center.y;
  const legH = cy - boardH / 2;
  const z = artZ(FRAME);

  const label = useCanvasTexture(
    800,
    260,
    (g) => {
      g.fillStyle = "#f6f3ec";
      g.fillRect(0, 0, 800, 260);
      g.fillStyle = color;
      g.fillRect(0, 0, 14, 260);
      g.textBaseline = "alphabetic";
      // 시상 모드: 부문 · 이름 · 국적 / 전시 모드: 이름을 크게, 아래에 국적
      const award = Boolean(art.award);
      if (award) {
        g.fillStyle = color;
        g.font = `700 54px ${FONT}`;
        g.fillText(art.award!, 50, 80);
      }
      g.fillStyle = "#1d1b19";
      fitText(g, art.name || art.title, 700, award ? 84 : 88, 700);
      g.fillText(art.name || art.title, 50, award ? 172 : 112);
      if (award) {
        if (art.nationality) {
          g.fillStyle = "#6b645c";
          g.font = `500 44px ${FONT}`;
          g.fillText(art.nationality, 50, 234);
        }
      } else {
        // 전시 모드: 영문 이름(알파벳 순으로 걸린다) · 국적
        if (art.nameEn) {
          g.fillStyle = "#4f4943";
          fitText(g, art.nameEn, 600, 46, 700);
          g.fillText(art.nameEn, 50, 172);
        }
        if (art.nationality) {
          g.fillStyle = "#8a817a";
          g.font = `500 40px ${FONT}`;
          g.fillText(art.nationality, 50, 230);
        }
      }
    },
    [art.award, art.name, art.nameEn, art.title, art.nationality, color]
  );

  const onClick = (e: ThreeEvent<MouseEvent>) => {
    e.stopPropagation();
    if (e.delta > 8) return; // 드래그는 무시
    const st = useGallery.getState();
    // 이 작품 앞에 서 있으면 크게 보기, 아니면 그 앞으로 걸어간다
    if (stopIndex(st.current, st.arts.length) === stop.index && offStop(st.current, st.layout) < 0.15) openViewer(stop.index);
    else goTo(stop.index);
  };

  return (
    <group position={[stop.center.x, 0, stop.center.z]} rotation={[0, stop.yaw, 0]}>
      <group
        onClick={onClick}
        onPointerOver={() => (document.body.style.cursor = "pointer")}
        onPointerOut={() => (document.body.style.cursor = "")}
      >
        <ArtFrame style={FRAME} w={w} h={h} cy={cy} />
        {/* 작품 */}
        <mesh position={[0, cy, z]}>
          <planeGeometry args={[w, h]} />
          {tex ? (
            // 작품은 조명 영향 없이 원래 색 그대로
            <meshBasicMaterial key="tex" map={tex} toneMapped={false} />
          ) : (
            <meshStandardMaterial key="blank" color="#d8d2c8" roughness={0.9} />
          )}
        </mesh>
        {/* 지금 보고 있는 작품: 부문 색 띠 */}
        <mesh position={[0, cy - h / 2 - pad / 2, z]}>
          <planeGeometry args={[active ? w : w * 0.3, 0.018]} />
          <meshBasicMaterial color={active ? color : "#c9c3b8"} toneMapped={false} />
        </mesh>
      </group>
      {/* 다리 + 받침 */}
      <FrameLegs style={FRAME} W={boardW} legH={legH} cy={cy} />
      {/* 명패: 작품 오른쪽 앞 낮은 받침 */}
      <group position={[boardW / 2 + 0.6, 0, 0.35]} rotation={[0, -0.25, 0]}>
        <mesh position={[0, 0.48, 0]} material={frameMat} castShadow>
          <boxGeometry args={[0.05, 0.96, 0.05]} />
        </mesh>
        <group position={[0, 1.0, 0.02]} rotation={[-0.45, 0, 0]}>
          <mesh material={steelMat} position={[0, 0, -0.012]} castShadow>
            <boxGeometry args={[0.86, 0.3, 0.02]} />
          </mesh>
          <mesh>
            <planeGeometry args={[0.8, 0.26]} />
            <meshStandardMaterial map={label} roughness={0.7} />
          </mesh>
        </group>
      </group>
    </group>
  );
}

/* ───────────────────────── 부문 표지판 ───────────────────────── */

export function GroupSign({ stop, layout }: { stop: Stop; layout: GalleryLayout }) {
  const label = stop.groupStart ?? "";
  const color = colorOf(stop.art);
  const tex = useCanvasTexture(
    600,
    260,
    (g) => {
      g.fillStyle = "#f6f3ec";
      g.fillRect(0, 0, 600, 260);
      g.fillStyle = color;
      g.fillRect(0, 0, 600, 30);
      g.fillStyle = "#1d1b19";
      g.textAlign = "center";
      g.textBaseline = "middle";
      fitText(g, label, 800, 110, 540);
      g.fillText(label, 300, 150);
    },
    [label, color]
  );
  // 길 바깥쪽, 다가오는 관람객을 비스듬히 본다
  const { p, left, tan } = layout.at(stop.viewDist - 2.2);
  const side = -stop.side;
  const pos = p.clone().addScaledVector(left, side * (WALK.pathWidth / 2 + 0.7));
  const yaw = Math.atan2(-tan.x, -tan.z) - side * 0.45;
  return (
    <group position={[pos.x, 0, pos.z]} rotation={[0, yaw, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.52, 0.8, -0.04]} material={frameMat} castShadow>
          <boxGeometry args={[0.05, 1.6, 0.05]} />
        </mesh>
      ))}
      <mesh position={[0, 1.5, -0.02]} material={steelMat} castShadow>
        <boxGeometry args={[1.24, 0.56, 0.025]} />
      </mesh>
      <mesh position={[0, 1.5, 0.0]}>
        <planeGeometry args={[1.2, 0.52]} />
        <meshStandardMaterial map={tex} roughness={0.7} />
      </mesh>
    </group>
  );
}

/* ───────────────────────── 묶음 문 (원형 회랑) ───────────────────────── */

/**
 * 회랑에서는 길 양쪽에 작품이 서 있어 옆에 표지판 세울 자리가 없으므로, 묶음(나라·부문)이 시작되는 곳에
 * 길을 가로지르는 가는 문을 세운다. 들보 앞뒤에 묶음 이름과 작품 수 — 다가오는 관람객이 문 아래로 지나간다.
 */
export function ZoneArch({ stop, layout }: { stop: Stop; layout: GalleryLayout }) {
  const label = stop.groupStart ?? "";
  const count = stop.groupCount ?? 0;
  const color = colorOf(stop.art);
  const TW = 1400;
  const TH = 220;
  const tex = useCanvasTexture(
    TW,
    TH,
    (g) => {
      g.fillStyle = "#f6f3ec";
      g.fillRect(0, 0, TW, TH);
      g.fillStyle = color;
      g.fillRect(0, 0, TW, 22);
      g.fillRect(0, TH - 10, TW, 10);
      g.textBaseline = "middle";
      g.textAlign = "center";
      g.fillStyle = "#1d1b19";
      const tail = count > 0 ? `  ${count}점` : "";
      const size = fitText(g, label + tail, 800, 118, TW - 120);
      const wLabel = g.measureText(label).width;
      g.font = `700 ${Math.round(size * 0.62)}px ${FONT}`;
      const wTail = g.measureText(tail).width;
      g.font = `800 ${size}px ${FONT}`;
      const wAll = wLabel + wTail;
      const x0 = TW / 2 - wAll / 2;
      g.textAlign = "left";
      g.fillText(label, x0, TH / 2 + 8);
      if (tail) {
        g.fillStyle = color;
        g.font = `700 ${Math.round(size * 0.62)}px ${FONT}`;
        g.fillText(tail, x0 + wLabel, TH / 2 + 14);
      }
    },
    [label, count, color]
  );
  // 이 묶음 첫 작품을 보러 서는 자리 조금 앞, 길 가운데
  const { p, tan } = layout.at(stop.viewDist - 1.3);
  const yaw = Math.atan2(-tan.x, -tan.z); // 앞면(+Z)이 다가오는 쪽을 본다
  const half = WALK.pathWidth / 2 + 0.2;
  const W = half * 2 + 0.3;
  const H = W * (TH / TW);
  const y = 2.62;
  return (
    <group position={[p.x, 0, p.z]} rotation={[0, yaw, 0]}>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * half, (y + H / 2) / 2, 0]} material={frameMat} castShadow>
          <boxGeometry args={[0.07, y + H / 2, 0.07]} />
        </mesh>
      ))}
      <mesh position={[0, y, 0]} material={steelMat} castShadow>
        <boxGeometry args={[W + 0.06, H + 0.06, 0.06]} />
      </mesh>
      {[0, Math.PI].map((r) => (
        <mesh key={r} position={[0, y, r ? -0.032 : 0.032]} rotation={[0, r, 0]}>
          <planeGeometry args={[W, H]} />
          <meshStandardMaterial map={tex} roughness={0.7} />
        </mesh>
      ))}
    </group>
  );
}

/* ───────────────────────── 입구 표석 ───────────────────────── */

export function Monument({ site }: { site: SitePlan }) {
  const info = useGallery((s) => s.info);
  const [gMap, gNrm] = useTexture([SCENERY.tex("granite_diffuse"), SCENERY.tex("granite_nor_gl")]);
  const granite = useMemo(() => ({ map: gMap, normalMap: gNrm }), [gMap, gNrm]);
  const top = info.상단문구 ?? "";
  const title = info.제목 ?? "한글 이름 꾸미기 대회";
  const sub = info.부제 ?? "작품 전시관";
  // 글자만 있는 투명 캔버스 → 검은 화강암 위에 새긴 흰 글씨
  const text = useCanvasTexture(
    1800,
    560,
    (g) => {
      g.fillStyle = "rgba(246,242,232,0.96)";
      g.textAlign = "center";
      g.textBaseline = "middle";
      if (top) {
        g.font = `500 64px ${FONT}`;
        g.fillText(top, 900, 90);
      }
      fitText(g, title, 800, 190, 1680);
      g.fillText(title, 900, 280);
      g.fillStyle = "rgba(214,190,128,0.98)";
      fitText(g, sub, 600, 100, 1500);
      g.fillText(sub, 900, 450);
    },
    [top, title, sub]
  );
  const stone = useMemo(
    () => new THREE.MeshStandardMaterial({ ...granite, color: "#3a3b3e", roughness: 0.6, metalness: 0.05 }),
    [granite]
  );
  const plinth = useMemo(() => new THREE.MeshStandardMaterial({ ...granite, color: "#bdb9b2", roughness: 1 }), [granite]);
  const W = 3.4;
  const H = 1.06;
  // 광장에 들어서자마자 왼쪽 (걸어오는 관람객을 비스듬히 본다)
  const x = -16;
  const z = site.R + 33;
  return (
    <group position={[x, 0, z]} rotation={[0, 0.5, 0]}>
      <mesh position={[0, 0.12, 0]} material={plinth} castShadow receiveShadow>
        <boxGeometry args={[W + 0.4, 0.24, 0.9]} />
      </mesh>
      <RoundedBox args={[W, H, 0.42]} radius={0.02} smoothness={2} position={[0, 0.24 + H / 2, 0]} material={stone} castShadow receiveShadow />
      <mesh position={[0, 0.24 + H / 2, 0.212]}>
        <planeGeometry args={[W * 0.94, W * 0.94 * (560 / 1800)]} />
        <meshStandardMaterial map={text} transparent roughness={0.5} depthWrite={false} polygonOffset polygonOffsetFactor={-1} />
      </mesh>
    </group>
  );
}
