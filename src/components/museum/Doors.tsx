"use client";

import { useRef } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import { useMuseum } from "@/lib/store";

/**
 * A pair of tall doors at the entrance. They open slowly once the visitor
 * chooses to enter (phase leaves "title"), swinging inward on their hinges.
 */
export function Doors({ frontZ }: { frontZ: number }) {
  const leftRef = useRef<THREE.Group>(null);
  const rightRef = useRef<THREE.Group>(null);
  const openAmount = useRef(0);
  const phase = useMuseum((s) => s.phase);

  const doorWidth = 1.3;
  const doorHeight = 2.65;

  useFrame((_, delta) => {
    const target = phase === "title" ? 0 : 1;
    // Slow, eased opening.
    openAmount.current = THREE.MathUtils.damp(openAmount.current, target, 1.6, delta);
    const a = openAmount.current;
    const angle = a * (Math.PI * 0.62);
    if (leftRef.current) leftRef.current.rotation.y = -angle;
    if (rightRef.current) rightRef.current.rotation.y = angle;
  });

  const doorMat = (
    <meshStandardMaterial color="#6f6a60" roughness={0.6} metalness={0.1} />
  );

  // The doors are part of the opening cinematic only. Once the visitor is
  // walking they're hidden, so turning around reveals a clean lit vestibule
  // rather than a dark slab behind you.
  const visible = phase === "title" || phase === "entering";

  return (
    <group visible={visible} position={[0, doorHeight / 2 + 0.02, frontZ - 0.15]}>
      {/* Left door, hinged at its left edge. */}
      <group ref={leftRef} position={[-doorWidth, 0, 0]}>
        <mesh position={[doorWidth / 2, 0, 0]} castShadow>
          <boxGeometry args={[doorWidth, doorHeight, 0.08]} />
          {doorMat}
        </mesh>
        {/* Handle */}
        <mesh position={[doorWidth - 0.2, 0, 0.08]}>
          <boxGeometry args={[0.04, 0.5, 0.04]} />
          <meshStandardMaterial color="#b9a06a" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>

      {/* Right door, hinged at its right edge. */}
      <group ref={rightRef} position={[doorWidth, 0, 0]}>
        <mesh position={[-doorWidth / 2, 0, 0]} castShadow>
          <boxGeometry args={[doorWidth, doorHeight, 0.08]} />
          {doorMat}
        </mesh>
        <mesh position={[-doorWidth + 0.2, 0, 0.08]}>
          <boxGeometry args={[0.04, 0.5, 0.04]} />
          <meshStandardMaterial color="#b9a06a" roughness={0.3} metalness={0.8} />
        </mesh>
      </group>

      {/* Door frame lintel */}
      <mesh position={[0, doorHeight / 2 + 0.15, 0]}>
        <boxGeometry args={[doorWidth * 2 + 0.4, 0.3, 0.3]} />
        <meshStandardMaterial color="#2e2a26" roughness={0.9} />
      </mesh>
    </group>
  );
}
