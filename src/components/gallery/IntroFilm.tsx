"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { motion } from "framer-motion";
import { bgm, bgmWanted, setBgmWanted } from "@/lib/bgm";
import { useGallery } from "@/lib/gallery";
import { DURATION, FPS, HangulDay, propsFromExhibition } from "@/remotion/HangulDay";

/**
 * 한글날 도입 영상 (src/remotion/HangulDay.tsx) 을 화면 가득 튼다 — 영상 파일 없이 브라우저가 그린다.
 * 위에서 내려와 덮고, 끝나거나 '건너뛰기'·Esc 를 누르면 걷힌다. 가로·세로 화면에 맞는 판을 고른다.
 * 참가자 이름과 전시 정보는 지금 전시 작품 목록에서 읽는다. 음악(public/audio/film.mp3)이 있으면 함께 튼다.
 */
export default function IntroFilm() {
  const arts = useGallery((s) => s.arts);
  const info = useGallery((s) => s.info);
  const music = useGallery((s) => s.music);
  const ref = useRef<PlayerRef>(null);
  const [portrait] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth);
  const props = useMemo(() => propsFromExhibition({ artworks: arts, info, music }), [arts, info, music]);
  // 아무도 누르기 전(행사장 화면 첫 영상)에는 브라우저가 소리를 막으므로 소리 없이, 배경음을 꺼 두었어도 소리 없이
  const [startMuted] = useState(
    () => typeof navigator === "undefined" || !(navigator as Navigator & { userActivation?: { hasBeenActive: boolean } }).userActivation?.hasBeenActive || !bgmWanted()
  );
  const [muted, setMuted] = useState(startMuted);
  // 소리 켜기·끄기 — 전시관 오른쪽 위 🔊 와 같은 설정 (켜면 영상이 끝난 뒤 배경음도 이어진다)
  const toggleSound = () => {
    const p = ref.current;
    if (!p) return;
    if (muted) {
      p.unmute();
      setBgmWanted(true);
      bgm.start();
    } else {
      p.mute();
      setBgmWanted(false);
      bgm.stop();
    }
    setMuted(!muted);
  };
  const close = () => useGallery.setState({ film: false });

  useEffect(() => {
    const p = ref.current;
    if (!p) return;
    p.addEventListener("ended", close);
    p.addEventListener("error", close);
    p.play();
    return () => {
      p.removeEventListener("ended", close);
      p.removeEventListener("error", close);
    };
  }, []);

  return (
    <motion.div
      key="film"
      className="absolute inset-0 z-[55] bg-[#06122b]"
      initial={{ y: "-101%" }}
      animate={{ y: 0, transition: { duration: 0.9, ease: [0.7, 0, 0.3, 1] } }}
      exit={{ opacity: 0, transition: { duration: 0.8 } }}
      role="dialog"
      aria-label="한글날 영상"
    >
      <Player
        ref={ref}
        component={HangulDay}
        inputProps={props}
        durationInFrames={DURATION}
        fps={FPS}
        compositionWidth={portrait ? 1080 : 1920}
        compositionHeight={portrait ? 1920 : 1080}
        style={{ width: "100%", height: "100%" }}
        autoPlay
        initiallyMuted={startMuted}
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
      />
      <div className="absolute right-4 top-4 flex gap-2 md:right-6 md:top-6">
        {music?.film && (
          <button
            onClick={toggleSound}
            aria-pressed={!muted}
            aria-label={muted ? "영상 소리 켜기" : "영상 소리 끄기"}
            className="grid h-9 w-9 place-items-center rounded-full bg-white/15 text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25"
          >
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M11 5 6 9H3v6h3l5 4V5z" fill="currentColor" stroke="none" />
              {muted ? <path d="m16 9 6 6m0-6-6 6" /> : <path d="M15.5 8.5a5 5 0 0 1 0 7M18.5 5.5a9 9 0 0 1 0 13" />}
            </svg>
          </button>
        )}
        <button
          onClick={close}
          className="rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25"
        >
          건너뛰기 ›
        </button>
      </div>
    </motion.div>
  );
}
