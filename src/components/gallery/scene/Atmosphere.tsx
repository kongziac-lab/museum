"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ExhibitionBackground } from "@/lib/types";
import { ENV_ROTATION, SCENERY, sunDirection, type Quality } from "./common";

/**
 * 하늘과 빛: 실사 360° 공원 사진(HDRI)을 배경과 주변광으로 쓰고,
 * 사진 속 해 방향에 맞춘 햇빛으로 그림자를 만든다.
 * 수상작/배경.jpg 가 360° 파노라마면 배경만 그 사진으로 바꾼다 (빛은 공원 HDRI 그대로).
 */
export function Atmosphere({
  quality,
  radius,
  panorama,
}: {
  quality: Quality;
  radius: number;
  panorama: ExhibitionBackground | null;
}) {
  const scene = useThree((s) => s.scene);
  const bg = useTexture(panorama?.src ?? SCENERY.bg[quality]);

  const bgRotation = panorama ? 0 : ENV_ROTATION;
  useLayoutEffect(() => {
    bg.mapping = THREE.EquirectangularReflectionMapping;
    bg.colorSpace = THREE.SRGBColorSpace;
    bg.needsUpdate = true;
    scene.background = bg;
    scene.backgroundRotation.set(0, bgRotation, 0);
    return () => {
      scene.background = null;
    };
  }, [bg, scene, bgRotation]);

  return (
    <>
      {/* Environment는 불러온 뒤 배경 회전값도 덮어쓰므로 같은 값을 넘긴다 */}
      <Environment
        files={SCENERY.hdr}
        environmentRotation={[0, ENV_ROTATION, 0]}
        backgroundRotation={[0, bgRotation, 0]}
        environmentIntensity={0.85}
      />
      <Sun quality={quality} radius={radius} />
    </>
  );
}

function Sun({ quality, radius }: { quality: Quality; radius: number }) {
  const light = useRef<THREE.DirectionalLight>(null);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  const gl = useThree((s) => s.gl);
  const dir = useMemo(sunDirection, []);
  // 원이 작으면 원 전체를, 크면 카메라 주변만 그림자 범위로 (넓으면 흐려지므로)
  const whole = radius + 14 <= 40;
  const extent = whole ? radius + 14 : 34;
  const size = quality === "high" ? 4096 : 2048;
  const center = useMemo(() => new THREE.Vector3(), []);

  useEffect(() => {
    const l = light.current;
    if (!l) return;
    scene.add(l.target);
    // 해와 배경은 움직이지 않으니 그림자는 필요할 때만 다시 그린다 (매 프레임 그리면 나무 그림자가 무겁다)
    gl.shadowMap.autoUpdate = false;
    gl.shadowMap.needsUpdate = true;
    return () => {
      scene.remove(l.target);
      gl.shadowMap.autoUpdate = true;
    };
  }, [scene, gl]);
  // 나무·작품이 늦게 올라와도 그림자에 들어가게 처음 몇 초는 가끔 다시 그린다
  const settle = useRef(0);

  useFrame((_, dt) => {
    const l = light.current;
    if (!l) return;
    const prevX = center.x;
    const prevZ = center.z;
    if (whole) center.set(0, 0, 0);
    else {
      // 카메라를 따라가되 몇 m 단위로만 옮긴다 (옮길 때만 그림자를 다시 그림)
      const step = 4;
      center.set(Math.round(camera.position.x / step) * step, 0, Math.round(camera.position.z / step) * step);
    }
    l.target.position.copy(center);
    l.position.copy(center).addScaledVector(dir, 80);
    settle.current += dt;
    const early = settle.current < 6 && Math.floor(settle.current * 2) !== Math.floor((settle.current - dt) * 2);
    if (center.x !== prevX || center.z !== prevZ || early) gl.shadowMap.needsUpdate = true;
  });

  return (
    <directionalLight
      ref={light}
      intensity={2.4}
      color="#fff4e4"
      castShadow
      shadow-mapSize={[size, size]}
      shadow-camera-left={-extent}
      shadow-camera-right={extent}
      shadow-camera-top={extent}
      shadow-camera-bottom={-extent}
      shadow-camera-near={10}
      shadow-camera-far={160}
      shadow-bias={-0.0003}
      shadow-normalBias={0.04}
    />
  );
}
