"use client";

import { useMemo } from "react";
import { useTexture } from "@react-three/drei";
import * as THREE from "three";
import { SCENERY, preparePbr } from "./common";
import { groundHeight, type SitePlan } from "./sitePlan";

const GRASS_TILE = 2.4;
const CANOPY_TILE = 60;

/**
 * 땅 전체: 광장 둘레는 평평한 잔디, 멀어질수록 숲 언덕(성서캠퍼스를 둘러싼 산)이 솟는다.
 * 높이가 오를수록 잔디 → 숲 지붕 무늬로 바뀐다. 먼 곳은 안개(장면 fog)로 푸르게 흐려진다.
 */
export function Terrain({ plan }: { plan: SitePlan }) {
  const grassSet = useTexture([SCENERY.tex("sparse_grass_diffuse"), SCENERY.tex("sparse_grass_nor_gl"), SCENERY.tex("sparse_grass_arm")]);
  const canopySet = useTexture([SCENERY.tex("canopy_diffuse"), SCENERY.tex("canopy_nor_gl")]);

  const geometry = useMemo(() => {
    const RINGS = 90;
    const SEG = 180;
    const MAX = 1400;
    const pos: number[] = [];
    const uv: number[] = [];
    const idx: number[] = [];
    pos.push(0, 0, 0);
    uv.push(0, 0);
    for (let i = 1; i <= RINGS; i++) {
      const r = MAX * (i / RINGS) ** 2.2;
      for (let j = 0; j < SEG; j++) {
        const a = (j / SEG) * Math.PI * 2;
        const x = Math.cos(a) * r;
        const z = Math.sin(a) * r;
        pos.push(x, groundHeight(plan, x, z), z);
        uv.push(x, -z);
      }
    }
    for (let j = 0; j < SEG; j++) idx.push(0, 1 + ((j + 1) % SEG), 1 + j);
    for (let i = 1; i < RINGS; i++) {
      const a0 = 1 + (i - 1) * SEG;
      const b0 = 1 + i * SEG;
      for (let j = 0; j < SEG; j++) {
        const j1 = (j + 1) % SEG;
        idx.push(a0 + j, a0 + j1, b0 + j, a0 + j1, b0 + j1, b0 + j);
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    g.setIndex(idx);
    g.computeVertexNormals();
    return g;
  }, [plan]);

  const material = useMemo(() => {
    const grass = preparePbr(grassSet, 1 / GRASS_TILE);
    const [cMap, cNrm] = canopySet;
    for (const t of canopySet) {
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.anisotropy = 8;
    }
    cMap.colorSpace = THREE.SRGBColorSpace;
    const m = new THREE.MeshStandardMaterial({ ...grass, roughness: 1, normalScale: new THREE.Vector2(0.9, 0.9) });
    m.onBeforeCompile = (shader) => {
      shader.uniforms.uCanopy = { value: cMap };
      shader.uniforms.uCanopyN = { value: cNrm };
      shader.vertexShader = shader.vertexShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;")
        .replace("#include <worldpos_vertex>", "#include <worldpos_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;");
      shader.fragmentShader = shader.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWorldPos;\nuniform sampler2D uCanopy;\nuniform sampler2D uCanopyN;")
        .replace(
          "#include <map_fragment>",
          `
          vec2 uvA = vMapUv;
          vec2 uvB = mat2(0.8, -0.6, 0.6, 0.8) * vMapUv * 0.37 + 0.23;
          vec4 grassC = mix(texture2D(map, uvA), texture2D(map, uvB), 0.45);
          grassC.rgb *= mix(0.8, 1.12, smoothstep(0.18, 0.42, texture2D(map, vMapUv * 0.041 + 0.5).g));
          vec2 cuv = vWorldPos.xz / ${CANOPY_TILE.toFixed(1)};
          vec4 canC = texture2D(uCanopy, cuv) * 0.6 + texture2D(uCanopy, cuv * 0.31 + 0.17) * 0.4;
          // 숲: 언덕 높이 또는 먼 거리
          float forest = max(smoothstep(1.5, 7.0, vWorldPos.y), smoothstep(210.0, 260.0, length(vWorldPos.xz)));
          vec4 sampledDiffuseColor = mix(grassC, canC, forest);
          diffuseColor *= sampledDiffuseColor;
          `
        );
    };
    return m;
  }, [grassSet, canopySet]);

  return <mesh geometry={geometry} material={material} receiveShadow />;
}
