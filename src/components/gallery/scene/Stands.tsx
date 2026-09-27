"use client";

import { useMemo } from "react";
import { type ThreeEvent } from "@react-three/fiber";
import { RoundedBox } from "@react-three/drei";
import * as THREE from "three";
import { awardColor } from "@/lib/config";
import { WALK, goTo, useGallery, type GalleryLayout, type Stop } from "@/lib/gallery";
import { FONT, SCENERY, fitText, useCanvasTexture, useLazyTexture } from "./common";
import { useTexture } from "@react-three/drei";
import type { SitePlan } from "./sitePlan";

/* 공용 재질 */
const frameMat = new THREE.MeshStandardMaterial({ color: "#26282b", metalness: 0.6, roughness: 0.38 });
const steelMat = new THREE.MeshStandardMaterial({ color: "#8d9095", metalness: 0.85, roughness: 0.32 });
const matBoardMat = new THREE.MeshStandardMaterial({ color: "#f3f0e9", roughness: 0.92 });
const backMat = new THREE.MeshStandardMaterial({ color: "#a4a7ab", metalness: 0.3, roughness: 0.6 });

/* ───────────────────────── 작품 스탠드 ───────────────────────── */

export function ArtStand({ stop, active, near }: { stop: Stop; active: boolean; near: boolean }) {
  const { art, w, h } = stop;
  const tex = useLazyTexture(art.src, near);
  const color = awardColor(art.award);
  const pad = 0.12;
  const boardW = w + pad * 2;
  const boardH = h + pad * 2;
  const cy = stop.center.y;
  const legH = cy - boardH / 2;

  const label = useCanvasTexture(
    800,
    260,
    (g) => {
      g.fillStyle = "#f6f3ec";
      g.fillRect(0, 0, 800, 260);
      g.fillStyle = color;
      g.fillRect(0, 0, 14, 260);
      g.textBaseline = "alphabetic";
      if (art.award) {
        g.fillStyle = color;
        g.font = `700 54px ${FONT}`;
        g.fillText(art.award, 50, 80);
      }
      g.fillStyle = "#1d1b19";
      fitText(g, art.name || art.title, 700, 84, 700);
      g.fillText(art.name || art.title, 50, 172);
      if (art.nationality) {
        g.fillStyle = "#6b645c";
        g.font = `500 44px ${FONT}`;
        g.fillText(art.nationality, 50, 234);
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
        {/* 금속 액자 틀 */}
        <RoundedBox args={[boardW + 0.07, boardH + 0.07, 0.05]} radius={0.012} smoothness={3} position={[0, cy, -0.03]} material={frameMat} castShadow receiveShadow />
        {/* 매트지 */}
        <mesh position={[0, cy, 0.0]} material={matBoardMat} receiveShadow>
          <planeGeometry args={[boardW, boardH]} />
        </mesh>
        {/* 뒷판 (뒤에서 봐도 검은 덩어리로 보이지 않게) */}
        <mesh position={[0, cy, -0.057]} rotation={[0, Math.PI, 0]} material={backMat} receiveShadow>
          <planeGeometry args={[boardW, boardH]} />
        </mesh>
        {/* 작품 */}
        <mesh position={[0, cy, 0.004]}>
          <planeGeometry args={[w, h]} />
          {tex ? (
            // 작품은 조명 영향 없이 원래 색 그대로
            <meshBasicMaterial key="tex" map={tex} toneMapped={false} />
          ) : (
            <meshStandardMaterial key="blank" color="#d8d2c8" roughness={0.9} />
          )}
        </mesh>
        {/* 지금 보고 있는 작품: 부문 색 띠 */}
        <mesh position={[0, cy - boardH / 2 + 0.03, 0.005]}>
          <planeGeometry args={[active ? w : w * 0.3, 0.018]} />
          <meshBasicMaterial color={active ? color : "#c9c3b8"} toneMapped={false} />
        </mesh>
      </group>
      {/* 다리 + 받침판 */}
      {[-1, 1].map((s) => (
        <group key={s} position={[(s * boardW) / 2.8, 0, -0.06]}>
          <mesh position={[0, legH / 2 + 0.01, 0]} material={frameMat} castShadow>
            <boxGeometry args={[0.05, legH, 0.05]} />
          </mesh>
          <mesh position={[0, 0.012, 0]} material={steelMat} castShadow receiveShadow>
            <boxGeometry args={[0.16, 0.024, 0.34]} />
          </mesh>
        </group>
      ))}
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
  const color = awardColor(label);
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

/* ───────────────────────── 입구 표석 ───────────────────────── */

export function Monument({ site }: { site: SitePlan }) {
  const info = useGallery((s) => s.info);
  const [gMap, gNrm] = useTexture([SCENERY.tex("granite_diffuse"), SCENERY.tex("granite_nor_gl")]);
  const granite = useMemo(() => ({ map: gMap, normalMap: gNrm }), [gMap, gNrm]);
  const top = info.상단문구 ?? "";
  const title = info.제목 ?? "한글 이름 꾸미기 대회";
  const sub = info.부제 ?? "수상작 전시";
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
