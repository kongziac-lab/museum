"use client";

import { Bloom, EffectComposer, N8AO, SMAA, ToneMapping } from "@react-three/postprocessing";
import { ToneMappingMode } from "postprocessing";

/**
 * PC용 후처리: 접촉면 그늘(AO) · 물보라 빛번짐 · 색을 그대로 지키는 톤 매핑(Khronos Neutral) · 계단 현상 제거.
 * 휴대폰에서는 쓰지 않는다 (렌더러의 Neutral 톤 매핑만).
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <N8AO halfRes aoRadius={1.6} distanceFalloff={0.8} intensity={2.4} quality="performance" />
      <Bloom mipmapBlur intensity={0.22} luminanceThreshold={0.92} luminanceSmoothing={0.2} />
      <ToneMapping mode={ToneMappingMode.NEUTRAL} />
      <SMAA />
    </EffectComposer>
  );
}
