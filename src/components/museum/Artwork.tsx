"use client";

import { Component, Suspense, useEffect, useMemo, useRef, type ReactNode } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { PlacedArtwork } from "@/lib/types";
import { useMuseum } from "@/lib/store";
import { awardColor } from "@/lib/config";

const LABEL_FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';

/**
 * 작품 명패: 수상 부문 · 이름 · 국적을 벽에 붙은 작은 카드로 그린다.
 * 폰트 파일 없이 브라우저의 한글 글꼴로 캔버스에 그려 텍스처로 쓴다.
 */
function WallLabel({ art, position, width }: { art: PlacedArtwork; position: [number, number, number]; width: number }) {
  const W = 800;
  const H = 300;
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = W;
    c.height = H;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, []);

  useEffect(() => {
    const draw = () => {
      const g = canvas.getContext("2d");
      if (!g) return;
      const color = awardColor(art.award);
      g.fillStyle = "#f4f1ea";
      g.fillRect(0, 0, W, H);
      g.fillStyle = color;
      g.fillRect(0, 0, 18, H);
      const x = 60;
      g.textBaseline = "alphabetic";
      if (art.award) {
        g.fillStyle = color;
        g.font = `700 58px ${LABEL_FONT}`;
        g.fillText(art.award, x, 88);
      }
      g.fillStyle = "#1d1b19";
      let size = 84;
      g.font = `700 ${size}px ${LABEL_FONT}`;
      const name = art.artist || art.title || "";
      while (g.measureText(name).width > W - x - 40 && size > 40) {
        size -= 4;
        g.font = `700 ${size}px ${LABEL_FONT}`;
      }
      g.fillText(name, x, art.award ? 190 : 150);
      if (art.nationality) {
        g.fillStyle = "#6b645c";
        g.font = `500 50px ${LABEL_FONT}`;
        g.fillText(art.nationality, x, 266);
      }
      texture.needsUpdate = true;
    };
    draw();
    // 웹폰트가 늦게 로드되면 한 번 더 그린다.
    document.fonts?.ready.then(draw).catch(() => {});
  }, [art.award, art.artist, art.title, art.nationality, canvas, texture]);

  useEffect(() => () => texture.dispose(), [texture]);

  return (
    <mesh position={position}>
      <planeGeometry args={[width, (width * H) / W]} />
      <meshStandardMaterial map={texture} emissive="#ffffff" emissiveMap={texture} emissiveIntensity={0.35} roughness={0.9} />
    </mesh>
  );
}

/**
 * Catches texture load/decode failures (missing or broken image files) so a
 * single bad artwork degrades to a neutral placeholder instead of throwing
 * through Suspense and taking down the whole WebGL canvas.
 */
class TextureBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  componentDidCatch() {
    /* swallow — the fallback is shown */
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

/** Resolve print dimensions (metres) from aspect ratio + longest-edge scale. */
export function printSize(aspect: number, scale: number): [number, number] {
  if (!aspect || !isFinite(aspect)) return [scale, scale];
  return aspect >= 1 ? [scale, scale / aspect] : [scale * aspect, scale];
}

/** The actual textured plane. Suspends while the image decodes. */
function TexturedPrint({ art }: { art: PlacedArtwork }) {
  const texture = useTexture(art.src);
  const setAspect = useMuseum((s) => s.setAspect);
  const storedAspect = useMuseum((s) => s.aspects[art.id]);

  useEffect(() => {
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 8;
    texture.generateMipmaps = true;
    texture.minFilter = THREE.LinearMipmapLinearFilter;
    const img = texture.image as { width?: number; height?: number } | undefined;
    if (img?.width && img?.height) {
      setAspect(art.id, img.width / img.height);
    }
  }, [texture, art.id, setAspect]);

  const [w, h] = printSize(storedAspect ?? 1, art.scale);

  return (
    <mesh castShadow={false}>
      <planeGeometry args={[w, h]} />
      {/* A touch of emissive keeps prints legible without the whole wall
          looking self-lit; the warm spotlights do most of the lighting. */}
      <meshStandardMaterial
        map={texture}
        emissive={"#ffffff"}
        emissiveMap={texture}
        emissiveIntensity={0.18}
        roughness={0.9}
        metalness={0}
        toneMapped={true}
      />
    </mesh>
  );
}

/** Soft neutral placeholder shown before an artwork streams in. */
function Placeholder({ w, h }: { w: number; h: number }) {
  return (
    <mesh>
      <planeGeometry args={[w, h]} />
      <meshStandardMaterial color="#6a6560" roughness={0.95} />
    </mesh>
  );
}

/** One spotlight per poster — the only gallery lighting. */
function PosterSpotlight({ art, centerY }: { art: PlacedArtwork; centerY: number }) {
  const target = useMemo(() => new THREE.Object3D(), []);
  const spot = art.spotlight;
  if (!spot.enabled) return null;

  const localLightY = art.position[1] + spot.height - centerY;

  return (
    <group>
      <primitive object={target} />
      <spotLight
        target={target}
        position={[0, localLightY, spot.distance]}
        intensity={spot.intensity}
        angle={spot.angle}
        penumbra={spot.penumbra}
        distance={spot.distance * 3.5}
        decay={1.5}
        color={spot.color}
      />
    </group>
  );
}

interface ArtworkProps {
  art: PlacedArtwork;
  load: boolean;
  highlight: boolean;
}

/**
 * A frameless mounted museum print. A very thin light mat sits just behind the
 * print to give a clean paper edge — no black frame, no floating card.
 */
export function Artwork({ art, load, highlight }: ArtworkProps) {
  const storedAspect = useMuseum((s) => s.aspects[art.id]);
  const groupRef = useRef<THREE.Group>(null);
  const isPlaceholder = art.placeholder || !art.src;

  const [w, h] = printSize(storedAspect ?? (isPlaceholder ? 4 / 5 : 1), art.scale);

  const matMaterial = useMemo(
    () => new THREE.MeshStandardMaterial({ color: "#e8e4dc", roughness: 0.95 }),
    []
  );

  // Consistent eye-line hang, nudged up only if a tall piece would meet the floor.
  const centerY = Math.max(art.position[1], h / 2 + 0.14);
  const position: [number, number, number] = [art.position[0], centerY, art.position[2]];

  return (
    <group ref={groupRef} position={position} rotation={art.rotation}>
      {!isPlaceholder && <PosterSpotlight art={art} centerY={centerY} />}

      {/* Thin light mat BEHIND the print */}
      <mesh position={[0, 0, -0.03]}>
        <boxGeometry args={[w + 0.04, h + 0.04, 0.03]} />
        <primitive object={matMaterial} attach="material" />
      </mesh>

      {/* Print, sitting just proud of the mat. */}
      <group position={[0, 0, 0.002]}>
        {load && !isPlaceholder ? (
          <TextureBoundary fallback={<Placeholder w={w} h={h} />}>
            <Suspense fallback={<Placeholder w={w} h={h} />}>
              <TexturedPrint art={art} />
            </Suspense>
          </TextureBoundary>
        ) : (
          <Placeholder w={w} h={h} />
        )}
      </group>

      {/* 명패 — 대상은 작품 오른쪽, 나머지는 작품 아래 */}
      {!isPlaceholder && (art.award || art.artist) &&
        (art.hero ? (
          <WallLabel art={art} width={0.9} position={[w / 2 + 0.75, 1.45 - centerY, 0.01]} />
        ) : (
          <WallLabel art={art} width={0.6} position={[0, -h / 2 - 0.2, 0.01]} />
        ))}

      {highlight && (
        <mesh position={[0, 0, 0.012]}>
          <planeGeometry args={[w + 0.14, h + 0.14]} />
          <meshBasicMaterial color="#ffdca3" transparent opacity={0.16} />
        </mesh>
      )}
    </group>
  );
}
