"use client";

import { useMemo } from "react";
import * as THREE from "three";
import type { MuseumBuild } from "@/lib/config";
import { ARCH } from "@/lib/config";
import type { Space, WallSegment } from "@/lib/types";

/**
 * Dark metropolitan gallery architecture — soft ambient fill in MuseumScene;
 * each poster still carries its own spotlight (see Artwork).
 */
export function MuseumEnvironment({ build }: { build: MuseumBuild }) {
  const { spaces, wallSegments, benches } = build;

  const wallMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#2e2a26", roughness: 0.9, metalness: 0 }),
    []
  );
  const lintelMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#262220", roughness: 0.92 }),
    []
  );
  const railMat = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#121110", roughness: 0.5, metalness: 0.55 }),
    []
  );

  const cx = (build.bounds.minX + build.bounds.maxX) / 2;
  const cz = (build.bounds.minZ + build.bounds.maxZ) / 2;
  const bw = build.bounds.maxX - build.bounds.minX + 16;
  const bd = build.bounds.maxZ - build.bounds.minZ + 16;

  return (
    <group>
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[cx, 0, cz]} frustumCulled={false}>
        <planeGeometry args={[bw, bd]} />
        <meshStandardMaterial color="#282624" roughness={0.58} metalness={0.1} />
      </mesh>

      {spaces.map((s) => (
        <SpaceShell key={s.id} space={s} railMat={railMat} />
      ))}

      {wallSegments.map((seg, i) => (
        <WallPiece key={i} seg={seg} material={seg.collide ? wallMat : lintelMat} />
      ))}

      {benches.map((b) => (
        <Bench key={b.id} x={b.x} z={b.z} yaw={b.yaw} />
      ))}
    </group>
  );
}

/** Ceiling coffers and benches — visual only, no light sources. */
function SpaceShell({ space, railMat }: { space: Space; railMat: THREE.Material }) {
  const w = space.x1 - space.x0;
  const d = space.z1 - space.z0;
  const cx = (space.x0 + space.x1) / 2;
  const cz = (space.z0 + space.z1) / 2;
  const h = space.ceiling;
  const isConnector = space.kind === "connector" || space.kind === "reflection";

  const coffers = useMemo(() => {
    const along: "x" | "z" = w >= d ? "x" : "z";
    const crossSpan = along === "x" ? d : w;
    const count = isConnector ? 1 : Math.max(3, Math.round(crossSpan / 3.4));
    const list: { ox: number; oz: number; len: number; along: "x" | "z" }[] = [];
    const len = (along === "x" ? w : d) * 0.66;
    for (let i = 0; i < count; i++) {
      const off = count === 1 ? 0 : -(crossSpan * 0.62) / 2 + (crossSpan * 0.62 * i) / (count - 1);
      list.push(along === "x" ? { ox: 0, oz: off, len, along } : { ox: off, oz: 0, len, along });
    }
    return list;
  }, [w, d, isConnector]);

  return (
    <group>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[cx, h, cz]}>
        <planeGeometry args={[w, d]} />
        <meshStandardMaterial color="#0e0e0c" roughness={1} />
      </mesh>

      {coffers.map((c, i) => {
        const stripW = c.along === "x" ? c.len : 0.42;
        const stripD = c.along === "x" ? 0.42 : c.len;
        return (
          <group key={i} position={[cx + c.ox, h - 0.001, cz + c.oz]}>
            <mesh rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[stripW + 0.3, stripD + 0.3]} />
              <meshStandardMaterial color="#181614" roughness={1} />
            </mesh>
            <mesh position={[0, 0.03, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[stripW, stripD]} />
              <meshStandardMaterial color="#2a2622" roughness={1} />
            </mesh>
            <mesh position={[c.along === "x" ? 0 : 0.55, -0.08, c.along === "x" ? 0.55 : 0]}>
              <boxGeometry args={[c.along === "x" ? stripW : 0.05, 0.05, c.along === "x" ? 0.05 : stripD]} />
              <primitive object={railMat} attach="material" />
            </mesh>
          </group>
        );
      })}

    </group>
  );
}

function WallPiece({ seg, material }: { seg: WallSegment; material: THREE.Material }) {
  const height = seg.top - seg.bottom;
  const midY = (seg.bottom + seg.top) / 2;
  const length = seg.max - seg.min;
  const mid = (seg.min + seg.max) / 2;
  const t = ARCH.wallThickness;
  const args: [number, number, number] = seg.orient === "x" ? [t, height, length] : [length, height, t];
  const pos: [number, number, number] = seg.orient === "x" ? [seg.pos, midY, mid] : [mid, midY, seg.pos];
  return (
    <mesh position={pos}>
      <boxGeometry args={args} />
      <primitive object={material} attach="material" />
    </mesh>
  );
}

function Bench({ x, z, yaw }: { x: number; z: number; yaw: number }) {
  return (
    <group position={[x, 0, z]} rotation={[0, yaw, 0]}>
      <mesh position={[0, 0.19, 0]}>
        <boxGeometry args={[1.7, 0.38, 0.42]} />
        <meshStandardMaterial color="#2a2624" roughness={0.78} />
      </mesh>
      <mesh position={[0, 0.44, 0]}>
        <boxGeometry args={[2.15, 0.1, 0.62]} />
        <meshStandardMaterial color="#3a3632" roughness={0.55} metalness={0.04} />
      </mesh>
    </group>
  );
}
