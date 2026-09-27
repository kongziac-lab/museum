"use client";

import { useEffect, useMemo, useState } from "react";
import * as THREE from "three";

export const FONT = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", "Noto Sans CJK KR", sans-serif';

/** 배경 에셋 (scripts/scenery/ 로 만든 것) */
export const SCENERY = {
  hdr: "/scenery/env/sky_1k.hdr",
  bg: { high: "/scenery/env/sky_bg_6k.jpg", low: "/scenery/env/sky_bg_4k.jpg" },
  fountain: "/scenery/fountain.glb",
  trees: "/scenery/trees.glb",
  campus: "/scenery/campus.glb",
  draco: "/draco/",
  tex: (name: string) => `/scenery/tex/${name}.jpg`,
};

/**
 * 하늘(HDRI aristea_wreck_puresky, 땅 없는 하늘만)의 해: u = 0.625, 고도 47°.
 * ENV_ROTATION만큼 돌려서 해는 남동쪽(광장 사진처럼 오른쪽 뒤)에서 비추고,
 * 파란 하늘 쪽이 북쪽 도서관 위에 오게 한다 (조각구름 띠는 머리 위로).
 */
export const ENV_ROTATION = -0.142;
const SUN_U = 0.625;
const SUN_ELEV = THREE.MathUtils.degToRad(47.1);
/** 먼 산이 흐려지는 안개 색 (하늘 지평선 색) */
export const HAZE = "#7b8799";

/** 월드 기준 해 방향 (단위 벡터, 땅에서 해 쪽) */
export function sunDirection() {
  // three.js 등장방형 좌표: u = atan2(z, x) / 2π + 0.5
  const az = (SUN_U - 0.5) * Math.PI * 2;
  const d = new THREE.Vector3(Math.cos(az) * Math.cos(SUN_ELEV), Math.sin(SUN_ELEV), Math.sin(az) * Math.cos(SUN_ELEV));
  // three.js는 배경을 방향 d 대신 R_y(-회전)·d 에서 읽는다 → 하늘 속 해는 월드에서 R_y(+회전) 방향
  return d.applyAxisAngle(new THREE.Vector3(0, 1, 0), ENV_ROTATION).normalize();
}

export type Quality = "high" | "low";

/** 휴대폰·저사양은 그림자·후처리·나무 수를 줄인다. */
export function detectQuality(): Quality {
  if (typeof window === "undefined") return "high";
  const coarse = window.matchMedia?.("(pointer: coarse)").matches;
  const small = Math.min(window.innerWidth, window.innerHeight) < 700;
  const cores = navigator.hardwareConcurrency ?? 8;
  return coarse || small || cores <= 4 ? "low" : "high";
}

/** 시드가 있는 난수 (배치가 매번 같게) */
export function rng(seed: number) {
  let s = seed % 2147483647;
  if (s <= 0) s += 2147483646;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

/* ───────────────────────── 텍스처 ───────────────────────── */

const texCache = new Map<string, THREE.Texture>();
const loader = new THREE.TextureLoader();

/** 필요할 때만 이미지를 불러온다 (가까운 작품만). */
export function useLazyTexture(src: string, enabled: boolean) {
  const [tex, setTex] = useState<THREE.Texture | null>(() => texCache.get(src) ?? null);
  useEffect(() => {
    if (!enabled || tex) return;
    const cached = texCache.get(src);
    if (cached) {
      setTex(cached);
      return;
    }
    let alive = true;
    loader.load(
      src,
      (t) => {
        t.colorSpace = THREE.SRGBColorSpace;
        t.anisotropy = 8;
        texCache.set(src, t);
        if (alive) setTex(t);
      },
      undefined,
      () => {}
    );
    return () => {
      alive = false;
    };
  }, [src, enabled, tex]);
  return tex;
}

/** 캔버스에 글자를 그려 텍스처로 만든다. */
export function useCanvasTexture(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, deps: unknown[]) {
  const { canvas, texture } = useMemo(() => {
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return { canvas: c, texture: t };
  }, [w, h]);
  useEffect(() => {
    const run = () => {
      const g = canvas.getContext("2d");
      if (!g) return;
      g.clearRect(0, 0, w, h);
      draw(g);
      texture.needsUpdate = true;
    };
    run();
    document.fonts?.ready.then(run).catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

export function fitText(g: CanvasRenderingContext2D, text: string, weight: number, max: number, maxWidth: number) {
  let size = max;
  g.font = `${weight} ${size}px ${FONT}`;
  while (g.measureText(text).width > maxWidth && size > 20) {
    size -= 3;
    g.font = `${weight} ${size}px ${FONT}`;
  }
  return size;
}

/** 반복 PBR 재질 텍스처 묶음 (색·노멀·ARM). repeat 은 호출하는 쪽이 정한다. */
export function preparePbr(set: THREE.Texture[], repeat: number) {
  const [color, normal, arm] = set;
  color.colorSpace = THREE.SRGBColorSpace;
  for (const t of set) {
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 8;
    t.needsUpdate = true;
  }
  return { map: color, normalMap: normal, roughnessMap: arm, aoMap: arm };
}
