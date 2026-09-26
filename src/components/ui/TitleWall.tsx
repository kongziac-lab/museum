"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EXHIBITION } from "@/lib/config";
import { useMuseum } from "@/lib/store";
import { museumAudio } from "@/lib/audio";
import { IntroAtmosphere } from "./IntroAtmosphere";

/**
 * The opening experience. Fades from black into a deep exhibition wall with
 * bokeh and sparks, the title typography rises gently, and only after a few
 * seconds does a quiet "Click anywhere to enter" appear.
 */
export function TitleWall() {
  const phase = useMuseum((s) => s.phase);
  const setPhase = useMuseum((s) => s.setPhase);
  const loaded = useMuseum((s) => s.loaded);
  const reduced = useMuseum((s) => s.settings.reducedMotion);
  const info = useMuseum((s) => s.info);
  const intro = info.상단문구 ?? EXHIBITION.intro;
  const title = info.제목 ?? EXHIBITION.title;
  const subtitle = info.부제 ?? EXHIBITION.subtitle;
  const dedication = info.소개문구 ?? EXHIBITION.dedication;

  const [showHint, setShowHint] = useState(false);
  const [leaving, setLeaving] = useState(false);

  useEffect(() => {
    if (phase !== "title") return;
    const t = setTimeout(() => setShowHint(true), reduced ? 800 : EXHIBITION.enterHintDelay);
    return () => clearTimeout(t);
  }, [phase, reduced]);

  const enter = () => {
    if (leaving || !loaded) return;
    setLeaving(true);
    museumAudio.start();
    setTimeout(() => {
      setPhase("entering");
    }, reduced ? 200 : 1100);
  };

  if (phase !== "title") return null;

  return (
    <AnimatePresence>
      <motion.div
        key="titlewall"
        className="absolute inset-0 z-40 flex cursor-pointer items-center justify-center"
        onClick={enter}
        initial={{ opacity: 0 }}
        animate={{
          opacity: 1,
          backgroundColor: leaving ? "#000000" : "#060608",
        }}
        transition={{ duration: reduced ? 0.3 : 2.4, ease: [0.16, 1, 0.3, 1] }}
        style={{ backgroundColor: "#060608" }}
      >
        <IntroAtmosphere reduced={reduced} />

        <motion.div
          className="relative z-10 select-none px-8 text-center"
          animate={{ opacity: leaving ? 0 : 1, y: leaving ? -10 : 0 }}
          transition={{ duration: 1 }}
        >
          {intro ? (
            <motion.p
              className="mb-7 text-sm tracking-[0.3em] text-bone/55"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: reduced ? 0.2 : 1.2, duration: 1.6 }}
            >
              {intro}
            </motion.p>
          ) : null}

          <motion.h1
            className="mx-auto max-w-4xl font-display text-4xl font-bold leading-tight tracking-[0.04em] text-bone md:text-6xl"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0.2 : 1.6, duration: 2.2, ease: [0.16, 1, 0.3, 1] }}
          >
            {title}
            {subtitle ? (
              <span className="mt-4 block font-display text-2xl font-normal tracking-[0.12em] text-bone/75 md:text-4xl">
                {subtitle}
              </span>
            ) : null}
          </motion.h1>

          <motion.p
            className="mt-9 text-base font-light tracking-[0.2em] text-bone/70"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0.3 : 2.6, duration: 1.8 }}
          >
            {dedication}
          </motion.p>
        </motion.div>

        <AnimatePresence>
          {showHint && !leaving && (
            <motion.div
              key="hint"
              className="absolute bottom-24 left-1/2 -translate-x-1/2"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 2 }}
            >
              <span className="text-sm tracking-[0.25em] text-bone/70 animate-breathe">
                {loaded ? "화면을 눌러 입장하기" : "전시를 준비하고 있습니다…"}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </AnimatePresence>
  );
}
