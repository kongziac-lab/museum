"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { useMuseumData } from "@/hooks/useMuseumData";
import { useMuseum } from "@/lib/store";
import { PLAYER, ENTRANCE } from "@/lib/config";
import { MuseumScene } from "./MuseumScene";
import { TitleWall } from "@/components/ui/TitleWall";
import { FloatingDedication } from "@/components/ui/FloatingDedication";
import { InspectOverlay } from "@/components/ui/InspectOverlay";
import { Hud } from "@/components/ui/Hud";
import { SettingsPanel } from "@/components/ui/SettingsPanel";
import { MobileControls } from "@/components/ui/MobileControls";
import { SoundtrackWidget } from "@/components/ui/SoundtrackWidget";
import { museumAudio } from "@/lib/audio";

/** Detect a touch-first device once on mount. */
function useIsTouch() {
  const [isTouch, setIsTouch] = useState(false);
  useEffect(() => {
    const coarse = window.matchMedia?.("(pointer: coarse)").matches;
    setIsTouch(Boolean(coarse) || "ontouchstart" in window);
  }, []);
  return isTouch;
}

/**
 * Top-level museum experience: the WebGL canvas plus every HUD overlay.
 * Rendered client-only (no SSR) since it owns a WebGL context.
 */
export function MuseumExperience() {
  const { build, loading, error } = useMuseumData();
  const setLoaded = useMuseum((s) => s.setLoaded);
  const phase = useMuseum((s) => s.phase);
  const pointerLocked = useMuseum((s) => s.pointerLocked);
  const inspectId = useMuseum((s) => s.inspectId);
  const seated = useMuseum((s) => s.seated);
  const isTouch = useIsTouch();
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (build && !loading) setLoaded(true);
  }, [build, loading, setLoaded]);

  useEffect(() => {
    const factor = inspectId ? 0.4 : seated ? 0.5 : 1;
    museumAudio.setDuck(factor);
  }, [inspectId, seated]);

  // Request pointer lock only when the canvas itself is clicked (never when
  // interacting with HUD buttons/sliders), and only while walking.
  const handleClick = (e: React.MouseEvent) => {
    if (isTouch || phase !== "exploring" || pointerLocked) return;
    if ((e.target as HTMLElement)?.tagName !== "CANVAS") return;
    const canvas = containerRef.current?.querySelector("canvas");
    canvas?.requestPointerLock?.();
  };

  return (
    <div id="museum-root" ref={containerRef} onClick={handleClick}>
      <Canvas
        shadows={false}
        dpr={[1, 1.75]}
        gl={{
          antialias: true,
          powerPreference: "high-performance",
          toneMapping: THREE.ACESFilmicToneMapping,
          toneMappingExposure: 0.98,
        }}
        camera={{ fov: PLAYER.defaultFov, near: 0.05, far: 400, position: [0, PLAYER.eyeHeight, ENTRANCE.startZ] }}
      >
        <Suspense fallback={null}>{build && <MuseumScene build={build} />}</Suspense>
      </Canvas>

      {/* HUD + cinematic layers */}
      <TitleWall />
      <FloatingDedication isTouch={isTouch} />
      <Hud isTouch={isTouch} />
      <InspectOverlay />
      {isTouch && <MobileControls />}
      <SoundtrackWidget />
      <SettingsPanel />

      {error && (
        <div className="absolute bottom-4 left-1/2 z-50 -translate-x-1/2 rounded bg-red-950/80 px-4 py-2 text-xs text-red-200">
          전시를 불러오지 못했습니다: {error}
        </div>
      )}
    </div>
  );
}
