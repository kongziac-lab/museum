"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { museumAudio, type MusicState } from "@/lib/audio";

/**
 * Minimalist soundtrack control (bottom-right). The exhibition plays one song
 * on enter; this widget offers play/pause and volume only.
 */
export function SoundtrackWidget() {
  const phase = useMuseum((s) => s.phase);
  const musicVolume = useMuseum((s) => s.settings.musicVolume);
  const muted = useMuseum((s) => s.settings.muted);
  const update = useMuseum((s) => s.updateSettings);
  const [open, setOpen] = useState(false);
  const [state, setState] = useState<MusicState>({ ready: false, playing: false, title: "", index: 0, count: 0 });

  useEffect(() => {
    const sync = () => setState(museumAudio.musicState());
    sync();
    const unsub = museumAudio.subscribe(sync);
    const iv = setInterval(sync, 1200); // catch track auto-advance
    return () => {
      unsub();
      clearInterval(iv);
    };
  }, []);

  if (phase === "title" || phase === "reading") return null;

  return (
    <div className="fixed bottom-6 right-[4.75rem] z-40">
      <div
        className={`absolute bottom-full right-0 mb-3 w-[300px] max-w-[80vw] transition-all duration-500 ${
          open ? "pointer-events-auto translate-y-0 opacity-100" : "pointer-events-none translate-y-2 opacity-0"
        }`}
      >
        <div className="rounded-2xl border border-bone/15 bg-navy-deep/90 p-4 shadow-2xl backdrop-blur-xl">
          <p className="mb-3 text-[10px] uppercase tracking-museum text-bone/50">배경 음악</p>

          {state.ready ? (
            <>
              <p className="mb-4 truncate font-display text-sm italic text-bone/90" title={state.title}>
                {state.title || "전시 음악"}
              </p>

              <div className="mb-4 flex items-center justify-center">
                <button
                  aria-label={state.playing ? "Pause" : "Play"}
                  onClick={() => museumAudio.toggleMusic()}
                  className="flex h-11 w-11 items-center justify-center rounded-full border border-bone/25 bg-bone/5 transition hover:border-bone/50 hover:bg-bone/10"
                >
                  {state.playing ? (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
                    </svg>
                  ) : (
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M8 5v14l11-7z" />
                    </svg>
                  )}
                </button>
              </div>

              <div className="flex items-center gap-2 px-1">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" className="text-bone/40">
                  <path d="M5 9v6h4l5 5V4L9 9z" />
                </svg>
                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.05}
                  value={musicVolume}
                  disabled={muted}
                  onChange={(e) => {
                    const v = parseFloat(e.target.value);
                    update({ musicVolume: v });
                    museumAudio.setMusicVolume(v);
                  }}
                  className="w-full accent-spot disabled:opacity-40"
                />
              </div>
            </>
          ) : (
            <p className="text-[11px] leading-relaxed text-bone/45">
              Drop an audio file into{" "}
              <code className="text-bone/60">public/audio/</code> and reload.
            </p>
          )}
        </div>
      </div>

      <button
        aria-label="배경 음악"
        onClick={() => setOpen((o) => !o)}
        className={`pointer-events-auto flex h-10 w-10 items-center justify-center rounded-full border backdrop-blur-md transition ${
          open ? "border-spot/60 bg-black/60 text-spot" : "border-bone/20 bg-black/40 text-bone/70 hover:border-bone/50 hover:text-bone"
        }`}
      >
        <span className="text-base leading-none">{open ? "×" : "♫"}</span>
      </button>

      <AnimatePresence>
        {!open && state.playing && (
          <motion.span
            key="playing"
            className="pointer-events-none absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-spot/70"
            initial={{ scale: 0.6, opacity: 0.4 }}
            animate={{ scale: [0.6, 1.15, 0.6], opacity: [0.4, 0.9, 0.4] }}
            transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
