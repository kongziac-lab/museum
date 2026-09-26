"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";

/**
 * Quiet heads-up layer for the walking experience: a soft crosshair, elegant
 * fade prompts (Inspect / Sit / Stand), a click-to-look hint, and the controls
 * legend. No game-style HUD.
 */
export function Hud({ isTouch }: { isTouch: boolean }) {
  const phase = useMuseum((s) => s.phase);
  const nearId = useMuseum((s) => s.nearId);
  const nearBenchId = useMuseum((s) => s.nearBenchId);
  const nearPedestal = useMuseum((s) => s.nearPedestal);
  const nearNoteId = useMuseum((s) => s.nearNoteId);
  const seated = useMuseum((s) => s.seated);
  const shareOpen = useMuseum((s) => s.shareOpen);
  const enlargedNoteId = useMuseum((s) => s.enlargedNoteId);
  const pointerLocked = useMuseum((s) => s.pointerLocked);

  if (phase !== "exploring" || shareOpen || enlargedNoteId) return null;

  const verb = (k: string, t: string) => (isTouch ? t : k);
  const showSit = nearBenchId && !seated && !nearId;
  const prompt = seated
    ? verb("E · 일어서기", "탭하여 일어서기")
    : showSit
      ? verb("E · 벤치에 앉기", "탭하여 앉기")
      : nearId
        ? verb("E · 작품 자세히 보기", "탭하여 작품 보기")
        : nearPedestal
          ? verb("E", "탭")
          : nearNoteId
            ? verb("E · 읽기", "탭하여 읽기")
            : null;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* Crosshair — hidden while seated for a calmer, cinematic view. */}
      {!isTouch && !seated && (
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2">
          <div className={`crosshair ${nearId || nearBenchId || nearPedestal || nearNoteId ? "crosshair--active" : ""}`} />
        </div>
      )}

      {/* Interaction prompt */}
      <AnimatePresence mode="wait">
        {prompt && (
          <motion.div
            key={prompt}
            className="absolute left-1/2 top-[60%] -translate-x-1/2"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="rounded-full border border-bone/25 bg-black/35 px-5 py-1.5 text-sm tracking-[0.12em] text-bone/90 backdrop-blur-sm">
              {prompt}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Seated hint */}
      <AnimatePresence>
        {seated && (
          <motion.div
            key="seatedhint"
            className="absolute bottom-10 left-1/2 -translate-x-1/2"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 1.2, delay: 0.6 }}
          >
            <span className="text-[11px] uppercase tracking-museum text-bone/40">
              천천히 둘러보세요
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Click-to-look hint (desktop, when not locked) */}
      <AnimatePresence>
        {!isTouch && !pointerLocked && !prompt && !seated && (
          <motion.div
            key="lookhint"
            className="absolute left-1/2 top-[63%] -translate-x-1/2 text-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.6 }}
          >
            <span className="text-sm tracking-[0.12em] text-bone/55 animate-breathe">
              화면을 클릭하면 둘러볼 수 있어요
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Controls legend */}
      {!isTouch && !seated && (
        <div className="absolute bottom-6 left-6 text-[11px] leading-relaxed tracking-[0.12em] text-bone/40">
          <div>WASD / 방향키 · 걷기</div>
          <div>마우스 · 둘러보기</div>
          <div>E · 작품 보기 &nbsp; Esc · 돌아가기</div>
        </div>
      )}
    </div>
  );
}
