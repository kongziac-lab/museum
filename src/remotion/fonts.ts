import { getRemotionEnvironment } from "remotion";
import { loadFont as loadSerif } from "@remotion/google-fonts/NotoSerifKR";
import { loadFont as loadSans } from "@remotion/google-fonts/NotoSansKR";
import { loadFont as loadMono } from "@remotion/google-fonts/IBMPlexMono";

export const SERIF = '"Noto Serif KR", "AppleMyungjo", "Batang", serif';
export const SANS = '"Noto Sans KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';
export const MONO = '"IBM Plex Mono", ui-monospace, Menlo, monospace';

let loaded = false;

/**
 * Remotion 스튜디오·렌더에서만 글꼴을 불러온다 (렌더는 글꼴이 다 올 때까지 기다린다).
 * 전시관 안의 Player 에서는 페이지(layout.tsx)가 이미 같은 글꼴을 불러 두었으므로 다시 받지 않는다.
 */
export function ensureFonts() {
  if (loaded) return;
  loaded = true;
  const env = getRemotionEnvironment();
  if (!env.isRendering && !env.isStudio) return;
  // 한글 글꼴은 글자 범위마다 파일이 나뉘어 요청이 많다 — 쓰는 굵기만
  const opts = { ignoreTooManyRequestsWarning: true } as const;
  loadSerif("normal", { weights: ["400", "700", "900"], ...opts });
  loadSans("normal", { weights: ["400"], ...opts });
  loadMono("normal", { weights: ["400"], subsets: ["latin"], ...opts });
}
