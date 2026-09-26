"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { museumAudio } from "@/lib/audio";

/** Accessibility + audio settings, opened from a quiet corner button. */
export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const phase = useMuseum((s) => s.phase);
  const settings = useMuseum((s) => s.settings);
  const update = useMuseum((s) => s.updateSettings);

  if (phase === "title" || phase === "reading") return null;

  return (
    <div className="absolute bottom-6 right-6 z-20">
      <button
        aria-label="설정"
        onClick={() => setOpen((o) => !o)}
        className="pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border border-bone/20 bg-black/40 text-bone/70 backdrop-blur-md transition hover:border-bone/50 hover:text-bone"
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" />
          <path
            d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1Z"
          />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            className="pointer-events-auto absolute bottom-12 right-0 w-64 rounded-lg border border-bone/15 bg-black/60 p-4 backdrop-blur-xl"
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
          >
            <p className="mb-3 text-[10px] uppercase tracking-museum text-bone/50">설정</p>

            <label className="mb-3 block text-xs text-bone/80">
              <span className="mb-1 flex justify-between">
                <span>걷는 속도</span>
                <span className="text-bone/50">{settings.speedScale.toFixed(1)}×</span>
              </span>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.1}
                value={settings.speedScale}
                onChange={(e) => update({ speedScale: parseFloat(e.target.value) })}
                className="w-full accent-spot"
              />
            </label>

            <label className="mb-3 block text-xs text-bone/80">
              <span className="mb-1 flex justify-between">
                <span>소리 크기</span>
                <span className="text-bone/50">{Math.round(settings.musicVolume * 100)}%</span>
              </span>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                value={settings.musicVolume}
                onChange={(e) => {
                  const v = parseFloat(e.target.value);
                  update({ musicVolume: v });
                  museumAudio.setMusicVolume(v);
                }}
                className="w-full accent-spot"
              />
            </label>

            <label className="mb-3 block text-xs text-bone/80">
              <span className="mb-1 flex justify-between">
                <span>마우스 감도</span>
                <span className="text-bone/50">{settings.mouseSensitivity.toFixed(1)}×</span>
              </span>
              <input
                type="range"
                min={0.3}
                max={2}
                step={0.1}
                value={settings.mouseSensitivity}
                onChange={(e) => update({ mouseSensitivity: parseFloat(e.target.value) })}
                className="w-full accent-spot"
              />
            </label>

            <label className="flex items-center justify-between text-xs text-bone/80">
              <span>부드러운 화면 이동</span>
              <input
                type="checkbox"
                checked={settings.motionSmoothing}
                onChange={(e) => update({ motionSmoothing: e.target.checked })}
                className="accent-spot"
              />
            </label>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
