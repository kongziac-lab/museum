"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { DEDICATION } from "@/lib/config";
import { useMuseum } from "@/lib/store";

/**
 * In-gallery dedication: text rises to eye level like a luminous floating
 * message. Space (or tap on touch) dismisses it so the visitor can explore.
 */
export function FloatingDedication({ isTouch }: { isTouch: boolean }) {
  const phase = useMuseum((s) => s.phase);
  const setPhase = useMuseum((s) => s.setPhase);
  const reduced = useMuseum((s) => s.settings.reducedMotion);
  const info = useMuseum((s) => s.info);

  useEffect(() => {
    if (phase !== "reading") return;

    const dismiss = () => setPhase("exploring");

    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      e.preventDefault();
      dismiss();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [phase, setPhase]);

  if (phase !== "reading") return null;

  const floatDuration = reduced ? 0.5 : 2.4;

  return (
    <AnimatePresence>
      <motion.div
        key="dedication"
        className="absolute inset-0 z-[35] flex items-center justify-center px-6"
        style={{ pointerEvents: "auto" }}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: reduced ? 0.35 : 1.2 }}
        onClick={() => {
          if (isTouch) setPhase("exploring");
        }}
      >
        {/* Soft night veil — gallery stays visible at the edges */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse 85% 70% at 50% 42%, rgba(8,6,4,0.72) 0%, rgba(4,3,2,0.88) 55%, rgba(0,0,0,0.94) 100%)",
          }}
        />

        {/* Golden sparks — same night-magic language as the title wall */}
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          {[
            { left: "12%", top: "22%", delay: "0s", dur: "3.2s" },
            { left: "78%", top: "18%", delay: "1.1s", dur: "2.8s" },
            { left: "88%", top: "48%", delay: "0.4s", dur: "3.6s" },
            { left: "8%", top: "62%", delay: "1.8s", dur: "2.4s" },
            { left: "42%", top: "12%", delay: "0.6s", dur: "3.1s" },
            { left: "55%", top: "78%", delay: "2.2s", dur: "2.9s" },
          ].map((s, i) => (
            <div
              key={i}
              className={`intro-spark ${reduced ? "" : "intro-spark--animate"}`}
              style={{
                left: s.left,
                top: s.top,
                width: 2,
                height: 2,
                ["--s-dur" as string]: s.dur,
                ["--s-delay" as string]: s.delay,
              }}
            />
          ))}
        </div>

        <motion.div
          className="relative z-10 max-w-2xl select-none text-center"
          initial={{ opacity: 0, y: reduced ? 0 : 56, filter: "blur(6px)" }}
          animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          exit={{ opacity: 0, y: -12, filter: "blur(4px)" }}
          transition={{ duration: floatDuration, ease: [0.16, 1, 0.3, 1] }}
        >
          <motion.h2
            className="font-display text-3xl font-bold tracking-[0.06em] text-bone md:text-4xl"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0.1 : 0.8, duration: 1.4 }}
          >
            {info.안내제목 ?? DEDICATION.headline}
          </motion.h2>

          <motion.p
            className="mt-6 text-base font-light leading-relaxed text-bone/85 md:text-lg md:leading-relaxed"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: reduced ? 0.2 : 1.4, duration: 1.8 }}
          >
            {info.안내문 ?? DEDICATION.body}
          </motion.p>

          <motion.p
            className="mt-10 text-sm tracking-[0.2em] text-bone/55 animate-breathe"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: reduced ? 0.4 : 2.6, duration: 1.6 }}
          >
            {isTouch ? "화면을 눌러 계속하기" : "스페이스 키를 눌러 계속하기"}
          </motion.p>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
