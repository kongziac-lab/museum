"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { canShareNow, markShared, submitMessage } from "@/lib/messages";
import { MESSAGE_MAX } from "@/lib/moderation";
import { museumAudio } from "@/lib/audio";

/**
 * The share station interface — a quiet, minimalist form to leave an
 * anonymous message. Matches the museum aesthetic: no bright colours, no
 * flashy UI. On success it thanks the visitor, then fades away.
 */
export function ShareForm() {
  const open = useMuseum((s) => s.shareOpen);
  const setOpen = useMuseum((s) => s.setShareOpen);

  const [text, setText] = useState("");
  const [anonymous, setAnonymous] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Release pointer lock so the visitor can type; reset state on open/close.
  useEffect(() => {
    if (open) {
      if (typeof document !== "undefined" && document.pointerLockElement) document.exitPointerLock();
      setText("");
      setError(null);
      setDone(false);
      setBusy(false);
    }
  }, [open]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open && !busy) close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, busy]);

  const close = () => setOpen(false);

  const share = async () => {
    const trimmed = text.trim();
    if (trimmed.length < 2 || trimmed.length > MESSAGE_MAX || busy) return;
    if (!canShareNow()) {
      setError("You've already left a message today. Thank you.");
      return;
    }
    setBusy(true);
    setError(null);
    const res = await submitMessage(trimmed);
    if (res.ok) {
      museumAudio.paper();
      markShared();
      setDone(true);
      window.dispatchEvent(new CustomEvent("masterpiece:refresh-messages"));
      setTimeout(() => setOpen(false), 3200);
    } else {
      setBusy(false);
      setError(res.reason ?? "Message not accepted.");
    }
  };

  const remaining = MESSAGE_MAX - text.length;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="absolute inset-0 z-40 flex items-center justify-center bg-black/55 backdrop-blur-md"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.5 }}
        >
          <motion.div
            className="w-[min(92vw,540px)] rounded-2xl border border-bone/15 bg-navy-deep/80 p-8 shadow-2xl"
            initial={{ opacity: 0, y: 16, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.98 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <AnimatePresence mode="wait">
              {done ? (
                <motion.div
                  key="thanks"
                  className="py-10 text-center"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                >
                  <p className="font-display text-2xl font-light tracking-wide text-bone">Thank you.</p>
                  <p className="mt-4 text-sm leading-relaxed tracking-wide text-bone/60">
                    Someone, someday,
                    <br />
                    may need these words.
                  </p>
                </motion.div>
              ) : (
                <motion.div key="form" initial={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <p className="mb-1 text-[11px] uppercase tracking-museum text-bone/45">Share something</p>
                  <h2 className="mb-5 font-display text-2xl font-light italic tracking-wide text-bone">
                    Things you wanted to say…
                  </h2>

                  <textarea
                    autoFocus
                    value={text}
                    maxLength={MESSAGE_MAX}
                    onChange={(e) => setText(e.target.value)}
                    placeholder="Say it here. No names. No judgment. Just honesty."
                    rows={4}
                    className="w-full resize-none rounded-lg border border-bone/15 bg-black/30 px-4 py-3 text-[15px] leading-relaxed text-bone/90 outline-none transition focus:border-spot/50"
                  />

                  <div className="mt-2 flex items-center justify-between text-[11px] tracking-wide">
                    <label className="flex items-center gap-2 text-bone/55">
                      <input
                        type="checkbox"
                        checked={anonymous}
                        onChange={(e) => setAnonymous(e.target.checked)}
                        className="accent-spot"
                      />
                      Stay anonymous
                    </label>
                    <span className={remaining < 15 ? "text-spot/80" : "text-bone/40"}>{remaining}</span>
                  </div>

                  {error && <p className="mt-3 text-xs text-red-300/80">{error}</p>}

                  <div className="mt-6 flex items-center justify-end gap-3">
                    <button
                      onClick={close}
                      disabled={busy}
                      className="rounded-full px-5 py-2 text-xs uppercase tracking-museum text-bone/55 transition hover:text-bone/90 disabled:opacity-40"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={share}
                      disabled={busy || text.trim().length < 2}
                      className="flex items-center gap-2 rounded-full border border-bone/25 bg-bone/5 px-6 py-2 text-xs uppercase tracking-museum text-bone transition hover:border-bone/50 hover:bg-bone/10 disabled:opacity-40"
                    >
                      {busy && (
                        <span className="h-3 w-3 animate-spin rounded-full border border-bone/40 border-t-transparent" />
                      )}
                      {busy ? "Sharing" : "Share"}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
