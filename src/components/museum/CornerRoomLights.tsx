"use client";

import { useLayoutEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { ARCH } from "@/lib/config";
import type { Space } from "@/lib/types";

type CornerSpec = {
  pos: [number, number, number];
  aim: [number, number, number];
};

/** Inner ceiling corners with a soft aim point along the diagonal into the room. */
function cornersForSpace(space: Space): CornerSpec[] {
  const inset = ARCH.wallThickness + 0.65;
  const x0 = space.x0 + inset;
  const x1 = space.x1 - inset;
  const z0 = space.z0 + inset;
  const z1 = space.z1 - inset;
  const y = space.ceiling - 0.5;
  const reach = Math.min(4.2, (x1 - x0) * 0.24, (z1 - z0) * 0.24);

  return [
    { pos: [x0, y, z0], aim: [x0 + reach, 0.35, z0 + reach] },
    { pos: [x1, y, z0], aim: [x1 - reach, 0.35, z0 + reach] },
    { pos: [x0, y, z1], aim: [x0 + reach, 0.35, z1 - reach] },
    { pos: [x1, y, z1], aim: [x1 - reach, 0.35, z1 - reach] },
  ];
}

/** Wide, invisible corner wash — grazes walls/ceiling so the room reads without fixtures. */
function CornerWash({ pos, aim }: CornerSpec) {
  const lightRef = useRef<THREE.SpotLight>(null);

  useLayoutEffect(() => {
    const light = lightRef.current;
    if (!light) return;
    light.target.position.set(...aim);
    light.parent?.add(light.target);
  }, [aim]);

  return (
    <spotLight
      ref={lightRef}
      position={pos}
      intensity={16}
      angle={1.05}
      penumbra={1}
      distance={16}
      decay={2}
      color="#dcc8aa"
    />
  );
}

/**
 * Hidden corner lighting for each gallery space. No bulb meshes — only soft pools
 * of light and the shadows they carve on the walls and ceiling.
 */
export function CornerRoomLights({ spaces }: { spaces: Space[] }) {
  const corners = useMemo(
    () => spaces.flatMap((space) => cornersForSpace(space).map((c) => ({ spaceId: space.id, ...c }))),
    [spaces]
  );

  return (
    <>
      {corners.map((c) => (
        <group key={`${c.spaceId}-${c.pos.join(",")}`}>
          <CornerWash pos={c.pos} aim={c.aim} />
          <pointLight position={c.pos} intensity={9} distance={18} decay={2} color="#c8b49a" />
        </group>
      ))}
    </>
  );
}
