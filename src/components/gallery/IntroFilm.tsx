"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Player, type PlayerRef } from "@remotion/player";
import { motion } from "framer-motion";
import { useGallery } from "@/lib/gallery";
import { DURATION, FPS, HangulDay, propsFromExhibition } from "@/remotion/HangulDay";

/**
 * 한글날 도입 영상 (src/remotion/HangulDay.tsx) 을 화면 가득 튼다 — 영상 파일 없이 브라우저가 그린다.
 * 위에서 내려와 덮고, 끝나거나 '건너뛰기'·Esc 를 누르면 걷힌다. 가로·세로 화면에 맞는 판을 고른다.
 * 참가자 이름과 전시 정보는 지금 전시 작품 목록에서 읽는다.
 */
export default function IntroFilm() {
  const arts = useGallery((s) => s.arts);
  const info = useGallery((s) => s.info);
  const ref = useRef<PlayerRef>(null);
  const [portrait] = useState(() => typeof window !== "undefined" && window.innerHeight > window.innerWidth);
  const props = useMemo(() => propsFromExhibition({ artworks: arts, info }), [arts, info]);
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
        clickToPlay={false}
        doubleClickToFullscreen={false}
        spaceKeyToPlayOrPause={false}
        acknowledgeRemotionLicense
      />
      <button
        onClick={close}
        className="absolute right-4 top-4 rounded-full bg-white/15 px-4 py-2 text-sm font-bold text-white ring-1 ring-white/30 backdrop-blur-sm transition hover:bg-white/25 md:right-6 md:top-6"
      >
        건너뛰기 ›
      </button>
    </motion.div>
  );
}
