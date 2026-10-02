/**
 * 한글날 도입 영상 (src/remotion) — 스튜디오: npm run video:studio · 파일로 뽑기: npm run video:render
 * 전시관 안에서는 @remotion/player 로 파일 없이 바로 재생한다.
 * 정문 → 전시장 장면(GateWalk)은 전시관의 3D 장면을 그대로 그리므로 사이트의 @/ 경로와 GPU(WebGL)가 필요하다.
 */
import path from "node:path";
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/remotion/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
Config.overrideWebpackConfig((c) => ({
  ...c,
  resolve: { ...c.resolve, alias: { ...(c.resolve?.alias ?? {}), "@": path.join(process.cwd(), "src") } },
}));
