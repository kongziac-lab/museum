"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { awardColor } from "@/lib/config";

/**
 * 작품 감상 모드 UI. 카메라가 작품 앞으로 다가가고(컨트롤러 담당),
 * 여기서는 수상 부문 · 이름 · 국적 · 작품 설명 캡션과 돌아가기 버튼을 보여준다.
 */
export function InspectOverlay() {
  const inspectId = useMuseum((s) => s.inspectId);
  const artworks = useMuseum((s) => s.artworks);
  const inspect = useMuseum((s) => s.inspect);

  const art = artworks.find((a) => a.id === inspectId) ?? null;
  const color = awardColor(art?.award);

  return (
    <AnimatePresence>
      {art && (
        <motion.div
          key="inspect"
          className="pointer-events-none absolute inset-0 z-30"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.8 }}
        >
          <div className="vignette absolute inset-0" />

          {/* 캡션 — 왼쪽 아래, 미술관 벽면 설명 스타일 */}
          <motion.div
            className="pointer-events-auto absolute bottom-6 left-4 right-4 max-w-md rounded-sm bg-black/45 py-4 pl-5 pr-6 backdrop-blur-sm sm:bottom-10 sm:left-10 sm:right-auto"
            style={{ borderLeft: `3px solid ${color}` }}
            initial={{ opacity: 0, x: -16 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -16 }}
            transition={{ delay: 0.4, duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
          >
            {art.placeholder ? (
              <h2 className="font-display text-2xl text-bone">작품 준비 중</h2>
            ) : (
              <>
                {art.award && (
                  <p className="mb-2 text-sm font-bold tracking-[0.2em]" style={{ color }}>
                    {art.award}
                  </p>
                )}
                <h2 className="font-display text-3xl font-bold leading-tight text-bone">{art.artist || art.title}</h2>
                {art.nationality && <p className="mt-1.5 text-base text-bone/70">{art.nationality}</p>}
                {art.description && (
                  <p className="mt-4 text-[15px] leading-relaxed text-bone/80">{art.description}</p>
                )}
              </>
            )}
          </motion.div>

          <motion.button
            className="pointer-events-auto absolute right-4 top-4 rounded-full border border-bone/25 bg-black/30 px-5 py-2 text-sm text-bone/85 backdrop-blur-sm transition hover:border-bone/60 hover:text-bone sm:right-10 sm:top-10"
            onClick={() => inspect(null)}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ delay: 0.5 }}
          >
            돌아가기 · Esc
          </motion.button>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
