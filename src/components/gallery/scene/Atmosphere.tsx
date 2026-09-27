"use client";

import { useEffect, useLayoutEffect, useMemo, useRef } from "react";
import { useFrame, useThree } from "@react-three/fiber";
import { Environment, useTexture } from "@react-three/drei";
import * as THREE from "three";
import type { ExhibitionBackground } from "@/lib/types";
import { ENV_ROTATION, HAZE, SCENERY, sunDirection, type Quality } from "./common";

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
  const bg = useTexture(panorama?.src ?? SCENERY.bg[quality]);
  const bgRotation = panorama ? 0 : ENV_ROTATION;

  return (
    <>
      <SkyDome map={bg} rotation={bgRotation} />
      {/* 먼 숲 언덕이 하늘빛으로 흐려지게 (가까운 광장에는 거의 안 걸린다) */}
      <fog attach="fog" args={[HAZE, 160, 1500]} />
      <Environment files={SCENERY.hdr} environmentRotation={[0, ENV_ROTATION, 0]} environmentIntensity={0.9} />
      <Sun quality={quality} radius={radius} />
    </>
  );
}

/**
 * 하늘 사진(360° 파노라마)을 직접 그린다.
 * scene.background 에 넣으면 three.js가 세로 크기(2048·3072)의 큐브맵 + 깊이 버퍼 6장으로 바꿔
 * GPU 메모리를 수백 MB 쓰므로, 원본 한 장을 방향으로 바로 읽는다 (밉맵도 만들지 않는다).
 */
function SkyDome({ map, rotation }: { map: THREE.Texture; rotation: number }) {
  const material = useMemo(() => {
    map.colorSpace = THREE.SRGBColorSpace;
    map.generateMipmaps = false;
    map.minFilter = THREE.LinearFilter;
    map.wrapS = THREE.RepeatWrapping;
    map.needsUpdate = true;
    return new THREE.ShaderMaterial({
      uniforms: { map: { value: map }, rot: { value: new THREE.Matrix3() } },
      vertexShader: `
        varying vec3 vDir;
        void main() {
          vDir = position;
          vec4 p = projectionMatrix * vec4(mat3(viewMatrix) * position, 1.0);
          gl_Position = p.xyww; // 가장 먼 깊이에
        }`,
      fragmentShader: `
        #include <common>
        uniform sampler2D map;
        uniform mat3 rot;
        varying vec3 vDir;
        void main() {
          vec3 d = normalize(rot * vDir);
          gl_FragColor = texture2D(map, equirectUv(d));
          #include <colorspace_fragment>
        }`,
      side: THREE.BackSide,
      depthTest: false,
      depthWrite: false,
      toneMapped: false,
      fog: false,
    });
  }, [map]);
  useLayoutEffect(() => {
    // scene.backgroundRotation 과 같은 방향 (three.js 배경은 회전의 역을 곱해 읽는다)
    material.uniforms.rot.value.setFromMatrix4(new THREE.Matrix4().makeRotationY(-rotation));
  }, [material, rotation]);
  useEffect(() => () => material.dispose(), [material]);
  return (
    <mesh material={material} renderOrder={-1000} frustumCulled={false}>
      <sphereGeometry args={[10, 48, 24]} />
    </mesh>
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
