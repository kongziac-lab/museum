"use client";

import { useEffect, useMemo } from "react";
import { useFrame } from "@react-three/fiber";
import { useGLTF, useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SCENERY, rng, type Quality } from "./common";

/**
 * 계명대학교 창립 120주년 기념 분수를 본뜬 3단 화강암 분수 (모델: scripts/scenery/build_scenery.py, Blender).
 * 물 표면은 잔물결 반사 재질로, 물줄기는 입자 줄기로 그린다.
 */
export function Fountain({ quality }: { quality: Quality }) {
  const gltf = useGLTF(SCENERY.fountain, SCENERY.draco);
  const water = useWaterMaterial();
  // 실제 분수는 밝은 회색 화강암 (사진) → 광장 경계석과 같은 밝은 화강암 무늬로 바꿔 입힌다
  const lightGranite = useTexture(SCENERY.tex("granite_diffuse"));

  const { root, jets } = useMemo(() => {
    const root = gltf.scene.clone(true);
    root.updateMatrixWorld(true);
    const jets: Record<string, THREE.Vector3[]> = { center: [], ring: [], t1: [], t0: [] };
    root.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.isMesh) {
        if (o.name.startsWith("water_")) {
          m.material = water;
          m.receiveShadow = true;
        } else {
          m.castShadow = true;
          m.receiveShadow = true;
          const mats = (Array.isArray(m.material) ? m.material : [m.material]) as THREE.MeshStandardMaterial[];
          m.material = mats.map((mat) => {
            if (!mat.name.startsWith("granite")) return mat;
            const c = mat.clone();
            const t = lightGranite.clone();
            t.wrapS = t.wrapT = THREE.RepeatWrapping;
            t.repeat.set(2, 2);
            t.colorSpace = THREE.SRGBColorSpace;
            t.needsUpdate = true;
            c.map = t;
            c.color.setScalar(mat.name === "granite_coping" ? 1.05 : 0.92);
            c.roughness = mat.name === "granite_coping" ? 0.5 : 0.7;
            c.roughnessMap = null;
            c.metalnessMap = null; // ARM 텍스처는 금속도 0이라 쓸모없다 (GPU 메모리만 차지)
            return c;
          });
          if (mats.length === 1) m.material = (m.material as THREE.Material[])[0];
        }
      }
      const k = o.name.match(/^jet_(center|ring|t1|t0)/)?.[1];
      if (k) jets[k].push(o.getWorldPosition(new THREE.Vector3()));
    });
    return { root, jets };
  }, [gltf, water, lightGranite]);

  return (
    <group>
      <primitive object={root} />
      <WaterJets jets={jets} quality={quality} />
    </group>
  );
}

useGLTF.preload(SCENERY.fountain, SCENERY.draco);

/* ───────────────────────── 물 표면 ───────────────────────── */

/** 이음새 없이 반복되는 잔물결 노멀맵 (여러 사인파의 합). */
function rippleNormalTexture(size = 256) {
  const r = rng(11);
  const waves = Array.from({ length: 14 }, () => ({
    kx: Math.round((r() - 0.5) * 16),
    ky: Math.round((r() - 0.5) * 16),
    ph: r() * Math.PI * 2,
    a: 0.4 + r() * 0.6,
  })).filter((w) => w.kx || w.ky);
  const h = new Float32Array(size * size);
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      let v = 0;
      for (const w of waves) v += (w.a * Math.sin(((w.kx * x + w.ky * y) / size) * Math.PI * 2 + w.ph)) / Math.hypot(w.kx, w.ky);
      h[y * size + x] = v;
    }
  const data = new Uint8Array(size * size * 4);
  const at = (x: number, y: number) => h[((y + size) % size) * size + ((x + size) % size)];
  for (let y = 0; y < size; y++)
    for (let x = 0; x < size; x++) {
      const dx = (at(x + 1, y) - at(x - 1, y)) * 2.2;
      const dy = (at(x, y + 1) - at(x, y - 1)) * 2.2;
      const l = Math.hypot(dx, dy, 1);
      const i = (y * size + x) * 4;
      data[i] = ((-dx / l) * 0.5 + 0.5) * 255;
      data[i + 1] = ((-dy / l) * 0.5 + 0.5) * 255;
      data[i + 2] = ((1 / l) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  const t = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2.2, 2.2);
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.needsUpdate = true;
  return t;
}

function useWaterMaterial() {
  const mat = useMemo(() => {
    const normal = rippleNormalTexture();
    return new THREE.MeshStandardMaterial({
      color: "#3d5a60",
      roughness: 0.04,
      metalness: 0.15,
      normalMap: normal,
      normalScale: new THREE.Vector2(0.28, 0.28),
      transparent: true,
      opacity: 0.88,
      envMapIntensity: 1.25,
    });
  }, []);
  useFrame((_, dt) => {
    const n = mat.normalMap!;
    n.offset.x += dt * 0.021;
    n.offset.y += dt * 0.013;
  });
  useEffect(() => () => mat.dispose(), [mat]);
  return mat;
}

/* ───────────────────────── 물줄기 ───────────────────────── */

/** 노즐 종류별: 물줄기 높이(m), 퍼짐(rad), 입자 수(고/저), 굵기 */
const JET_KIND = {
  center: { height: 7.2, spread: 0.018, count: [1400, 700], size: 0.05, alpha: 0.55 },
  ring: { height: 3.7, spread: 0.022, count: [300, 160], size: 0.042, alpha: 0.55 },
  t1: { height: 0.5, spread: 0.07, count: [90, 50], size: 0.032, alpha: 0.3 },
  t0: { height: 0.38, spread: 0.07, count: [80, 44], size: 0.03, alpha: 0.3 },
} as const;

const G = 9.81;

const jetVertex = /* glsl */ `
  attribute vec3 aOrigin;
  attribute vec3 aVel;
  attribute float aPhase;
  attribute float aLife;
  attribute float aSize;
  attribute float aAlpha;
  uniform float uTime;
  uniform vec3 uWind;
  varying vec2 vCorner;
  varying float vFade;
  varying float vRise;
  varying float vAlpha;
  void main() {
    vAlpha = aAlpha;
    float t = mod(uTime + aPhase, aLife);
    vec3 acc = vec3(0.0, -${G.toFixed(2)}, 0.0) + uWind;
    vec3 p = aOrigin + aVel * t + 0.5 * acc * t * t;
    vec3 v = aVel + acc * t;
    float speed = length(v);
    vec3 axis = speed > 0.001 ? v / speed : vec3(0.0, 1.0, 0.0);
    vec3 toCam = normalize(cameraPosition - p);
    vec3 side = cross(axis, toCam);
    float sl = length(side);
    side = sl > 0.001 ? side / sl : vec3(1.0, 0.0, 0.0);
    // 빠를수록 길게 늘어난 물방울 → 이어진 물기둥처럼 보인다
    float len = clamp(speed * 0.03, 0.02, 0.36) + aSize;
    vec3 wp = p + side * position.x * aSize + axis * position.y * len;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
    vCorner = position.xy;
    float life = t / aLife;
    vFade = smoothstep(0.0, 0.04, life) * (1.0 - smoothstep(0.88, 1.0, life));
    vRise = clamp(v.y / 6.0, 0.0, 1.0);
  }
`;

const jetFragment = /* glsl */ `
  uniform vec3 uColor;
  varying vec2 vCorner;
  varying float vFade;
  varying float vRise;
  varying float vAlpha;
  void main() {
    float r = length(vec2(vCorner.x, vCorner.y * 0.85));
    float a = (1.0 - smoothstep(0.25, 1.0, r)) * vFade * vAlpha * mix(0.75, 1.0, vRise);
    if (a < 0.01) discard;
    gl_FragColor = vec4(uColor, a);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`;

function WaterJets({ jets, quality }: { jets: Record<string, THREE.Vector3[]>; quality: Quality }) {
  const { geometry, material } = useMemo(() => {
    const r = rng(2024);
    const origin: number[] = [];
    const vel: number[] = [];
    const phase: number[] = [];
    const life: number[] = [];
    const size: number[] = [];
    const alpha: number[] = [];
    const up = new THREE.Vector3(0, 1, 0);
    const d = new THREE.Vector3();
    for (const [kind, list] of Object.entries(jets)) {
      const k = JET_KIND[kind as keyof typeof JET_KIND];
      if (!k) continue;
      const n = k.count[quality === "high" ? 0 : 1];
      for (const o of list) {
        for (let i = 0; i < n; i++) {
          const v0 = Math.sqrt(2 * G * k.height) * (0.9 + r() * 0.1);
          // 원뿔 안의 무작위 방향
          const a = Math.acos(1 - r() * (1 - Math.cos(k.spread)));
          const b = r() * Math.PI * 2;
          d.set(Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)).normalize();
          const L = (2 * v0 * d.dot(up)) / G;
          origin.push(o.x, o.y, o.z);
          vel.push(d.x * v0, d.y * v0, d.z * v0);
          life.push(L);
          phase.push((i / n) * L + r() * 0.02);
          size.push(k.size * (0.7 + r() * 0.6));
          alpha.push(k.alpha);
        }
      }
    }
    const g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute([-1, -1, 0, 1, -1, 0, 1, 1, 0, -1, 1, 0], 3));
    g.setIndex([0, 1, 2, 0, 2, 3]);
    g.setAttribute("aOrigin", new THREE.InstancedBufferAttribute(new Float32Array(origin), 3));
    g.setAttribute("aVel", new THREE.InstancedBufferAttribute(new Float32Array(vel), 3));
    g.setAttribute("aPhase", new THREE.InstancedBufferAttribute(new Float32Array(phase), 1));
    g.setAttribute("aLife", new THREE.InstancedBufferAttribute(new Float32Array(life), 1));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(new Float32Array(size), 1));
    g.setAttribute("aAlpha", new THREE.InstancedBufferAttribute(new Float32Array(alpha), 1));
    g.instanceCount = life.length;
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 4, 0), 12);
    const m = new THREE.ShaderMaterial({
      vertexShader: jetVertex,
      fragmentShader: jetFragment,
      uniforms: {
        uTime: { value: 0 },
        uWind: { value: new THREE.Vector3(0.22, 0, 0.12) },
        uColor: { value: new THREE.Color(1.05, 1.08, 1.12) },
      },
      transparent: true,
      depthWrite: false,
    });
    return { geometry: g, material: m };
  }, [jets, quality]);

  useFrame((_, dt) => {
    material.uniforms.uTime.value += Math.min(dt, 0.1);
  });
  useEffect(
    () => () => {
      geometry.dispose();
      material.dispose();
    },
    [geometry, material]
  );
  return <mesh geometry={geometry} material={material} frustumCulled={false} renderOrder={2} />;
}
