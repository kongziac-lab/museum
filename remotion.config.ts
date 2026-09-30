/**
 * 한글날 도입 영상 (src/remotion) — 스튜디오: npm run video:studio · 파일로 뽑기: npm run video:render
 * 전시관 안에서는 @remotion/player 로 파일 없이 바로 재생한다.
 */
import { Config } from "@remotion/cli/config";

Config.setEntryPoint("src/remotion/index.ts");
Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
