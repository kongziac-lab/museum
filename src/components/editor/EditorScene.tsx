"use client";

import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import { Grid, OrbitControls, useTexture } from "@react-three/drei";
import { useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import * as THREE from "three";
import type { MuseumBuild } from "@/lib/config";
import { wallNormal, wallTangent } from "@/lib/config";
import { useEditor } from "@/lib/editorStore";
import { printSize } from "@/components/museum/Artwork";
import { MuseumEnvironment } from "@/components/museum/Environment";
import type { PlacedArtwork, WallSpec } from "@/lib/types";
import { useMuseum } from "@/lib/store";

const LOAD_RADIUS_SQ = 42 * 42;

/** A selectable, draggable print in the editor. */
function EditorArtwork({
  art,
  selected,
  load,
  onPointerDownArt,
}: {
  art: PlacedArtwork;
  selected: boolean;
  load: boolean;
  onPointerDownArt: (e: ThreeEvent<PointerEvent>, id: string) => void;
}) {
  const setAspect = useMuseum((s) => s.setAspect);
  const aspect = useMuseum((s) => s.aspects[art.id]) ?? 1;
  const [w, h] = printSize(aspect, art.scale);

  return (
    <group position={art.position} rotation={art.rotation}>
      {/* Selection halo */}
      {selected && (
        <mesh position={[0, 0, -0.03]}>
          <planeGeometry args={[w + 0.22, h + 0.22]} />
          <meshBasicMaterial color="#7dd3fc" transparent opacity={0.4} />
        </mesh>
      )}
      <mesh position={[0, 0, -0.02]}>
        <planeGeometry args={[w + 0.06, h + 0.06]} />
        <meshStandardMaterial color="#0c0f16" roughness={0.7} />
      </mesh>
      <mesh
        onPointerDown={(e) => onPointerDownArt(e, art.id)}
        onPointerOver={() => (document.body.style.cursor = "grab")}
        onPointerOut={() => (document.body.style.cursor = "auto")}
      >
        <planeGeometry args={[w, h]} />
        {load && art.src && !art.placeholder ? (
          <Suspense fallback={<meshStandardMaterial color="#20263a" />}>
            <ArtTexture src={art.src} onAspect={(a) => setAspect(art.id, a)} />
          </Suspense>
        ) : (
          <meshStandardMaterial color="#20263a" emissive="#20263a" emissiveIntensity={0.4} />
        )}
      </mesh>
    </group>
  );
}

function ArtTexture({ src, onAspect }: { src: string; onAspect: (a: number) => void }) {
  const texture = useTexture(src);
  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    const img = texture.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) onAspect(img.width / img.height);
  }, [texture, onAspect]);
  return <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.35} roughness={0.85} />;
}

/** Streams textures + hosts drag interaction. */
export function EditorScene({ build }: { build: MuseumBuild }) {
  const { camera, gl } = useThree();
  const artworks = useEditor((s) => s.artworks);
  const walls = useEditor((s) => s.walls);
  const selectedId = useEditor((s) => s.selectedId);
  const grid = useEditor((s) => s.grid);
  const snap = useEditor((s) => s.snap);
  const select = useEditor((s) => s.select);
  const setPositionLive = useEditor((s) => s.setPositionLive);
  const commitLive = useEditor((s) => s.commitLive);

  const orbitRef = useRef<any>(null);
  const drag = useRef<{ id: string; plane: THREE.Plane; wall: WallSpec } | null>(null);
  const [activeIds, setActiveIds] = useState<Set<string>>(new Set());
  const tick = useRef(0);

  const raycaster = useMemo(() => new THREE.Raycaster(), []);
  const ndc = useMemo(() => new THREE.Vector2(), []);
  const hit = useMemo(() => new THREE.Vector3(), []);

  const centerZ = (build.bounds.minZ + build.bounds.maxZ) / 2;

  // Texture streaming based on camera distance.
  useFrame((_, delta) => {
    tick.current += delta;
    if (tick.current < 0.25) return;
    tick.current = 0;
    const cx = camera.position.x;
    const cz = camera.position.z;
    const next = new Set<string>();
    for (const a of artworks) {
      const dx = a.position[0] - cx;
      const dz = a.position[2] - cz;
      if (dx * dx + dz * dz <= LOAD_RADIUS_SQ) next.add(a.id);
    }
    setActiveIds((prev) => {
      if (prev.size === next.size && [...next].every((id) => prev.has(id))) return prev;
      return next;
    });
  });

  const beginDrag = (e: ThreeEvent<PointerEvent>, id: string) => {
    e.stopPropagation();
    select(id);
    const art = artworks.find((a) => a.id === id);
    if (!art) return;
    const wall = walls.find((w) => w.id === art.wallId) ?? nearestWall(art, walls);
    if (!wall) return;
    const n = wallNormal(wall.rotation[1]);
    const normal = new THREE.Vector3(n[0], 0, n[2]);
    const point = new THREE.Vector3(...art.position);
    const plane = new THREE.Plane().setFromNormalAndCoplanarPoint(normal, point);
    drag.current = { id, plane, wall };
    if (orbitRef.current) orbitRef.current.enabled = false;
    gl.domElement.setPointerCapture?.(e.pointerId);
  };

  useEffect(() => {
    const el = gl.domElement;
    const onMove = (ev: PointerEvent) => {
      if (!drag.current) return;
      const rect = el.getBoundingClientRect();
      ndc.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      ndc.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const ok = raycaster.ray.intersectPlane(drag.current.plane, hit);
      if (!ok) return;

      const wall = drag.current.wall;
      const t = wallTangent(wall.rotation[1]);
      let localX = (hit.x - wall.position[0]) * t[0] + (hit.z - wall.position[2]) * t[2];
      let localY = hit.y - wall.position[1];
      const halfW = wall.size[0] / 2 - 0.4;
      const halfH = wall.size[1] / 2 - 0.4;
      localX = THREE.MathUtils.clamp(localX, -halfW, halfW);
      localY = THREE.MathUtils.clamp(localY, -halfH, halfH);
      if (snap) {
        localX = Math.round(localX / 0.25) * 0.25;
        localY = Math.round(localY / 0.25) * 0.25;
      }
      const n = wallNormal(wall.rotation[1]);
      const proud = 0.07;
      setPositionLive(drag.current.id, [
        wall.position[0] + t[0] * localX + n[0] * proud,
        wall.position[1] + localY,
        wall.position[2] + t[2] * localX + n[2] * proud,
      ]);
    };
    const onUp = () => {
      if (!drag.current) return;
      drag.current = null;
      commitLive();
      if (orbitRef.current) orbitRef.current.enabled = true;
    };
    el.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    return () => {
      el.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };
  }, [gl, camera, raycaster, ndc, hit, snap, setPositionLive, commitLive]);

  return (
    <>
      <color attach="background" args={["#0a0d14"]} />
      <MuseumEnvironment build={build} />

      {grid && (
        <Grid
          position={[0, 0.02, centerZ]}
          args={[build.bounds.maxX - build.bounds.minX, build.bounds.maxZ - build.bounds.minZ]}
          cellSize={0.5}
          cellThickness={0.5}
          cellColor="#3a3f4b"
          sectionSize={2}
          sectionThickness={1}
          sectionColor="#5b6270"
          fadeDistance={60}
          infiniteGrid={false}
        />
      )}

      {artworks.map((art) => (
        <EditorArtwork
          key={art.id}
          art={art}
          selected={art.id === selectedId}
          load={activeIds.has(art.id)}
          onPointerDownArt={beginDrag}
        />
      ))}

      <OrbitControls
        ref={orbitRef}
        makeDefault
        target={[0, 1.6, centerZ]}
        maxPolarAngle={Math.PI * 0.85}
        enableDamping
        dampingFactor={0.12}
      />

      <ambientLight intensity={0.7} />
      <directionalLight position={[5, 12, centerZ + 8]} intensity={0.5} />
    </>
  );
}

function nearestWall(art: PlacedArtwork, walls: WallSpec[]): WallSpec | undefined {
  let best: WallSpec | undefined;
  let bestD = Infinity;
  for (const wall of walls) {
    const dx = art.position[0] - wall.position[0];
    const dz = art.position[2] - wall.position[2];
    const d = dx * dx + dz * dz;
    if (d < bestD) {
      bestD = d;
      best = wall;
    }
  }
  return best;
}
