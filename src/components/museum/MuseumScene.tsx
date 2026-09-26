"use client";

import { useRef, useState } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import type { MuseumBuild } from "@/lib/config";
import { useMuseum } from "@/lib/store";
import { MuseumEnvironment } from "./Environment";
import { CornerRoomLights } from "./CornerRoomLights";
import { Artwork } from "./Artwork";
import { FirstPersonController } from "./FirstPersonController";

const LOAD_RADIUS = 22; // metres — texture streaming window (rooms are enclosed)
const LOAD_RADIUS_SQ = LOAD_RADIUS * LOAD_RADIUS;

/**
 * Streams artwork textures based on distance to the camera. Because the plan
 * is broken into enclosed rooms, only a handful decode at once, which keeps
 * memory bounded and reveals each chapter as the visitor arrives.
 */
function StreamingArtworks() {
  const { camera } = useThree();
  const artworks = useMuseum((s) => s.artworks);
  const nearId = useMuseum((s) => s.nearId);
  const inspectId = useMuseum((s) => s.inspectId);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const tick = useRef(0);
  const prevKey = useRef("");

  useFrame((_, delta) => {
    tick.current += delta;
    if (tick.current < 0.2) return;
    tick.current = 0;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const next = new Set<string>();
    for (const a of artworks) {
      const dx = a.position[0] - cx;
      const dz = a.position[2] - cz;
      if (dx * dx + dz * dz <= LOAD_RADIUS_SQ) next.add(a.id);
    }
    const key = [...next].sort().join("|");
    if (key !== prevKey.current) {
      prevKey.current = key;
      setActiveIds(next);
    }
  });

  return (
    <group>
      {artworks.map((art) => (
        <Artwork
          key={art.id}
          art={art}
          load={activeIds.has(art.id)}
          highlight={nearId === art.id || inspectId === art.id}
        />
      ))}
    </group>
  );
}

/** The complete museum world rendered inside the R3F Canvas. */
export function MuseumScene({ build }: { build: MuseumBuild }) {
  return (
    <>
      {/* Soft fill so architecture reads in shadow; posters still rely on their spotlights. */}
      <ambientLight intensity={0.42} color="#c8c0b8" />
      <hemisphereLight intensity={0.15} color="#d8d0c8" groundColor="#2a2622" />

      <CornerRoomLights spaces={build.spaces} />

      <fog attach="fog" args={["#141210", 48, 120]} />
      <color attach="background" args={["#0c0c0a"]} />

      <MuseumEnvironment build={build} />
      <StreamingArtworks />
      <FirstPersonController build={build} />
    </>
  );
}
