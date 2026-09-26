"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";
import { timeAgo } from "@/lib/messages";

/**
 * Enlarged view of a single memory note. The room gently blurs behind it.
 * E or Esc (handled in the controller / here) returns to normal.
 */
export function EnlargedNote() {
  const id = useMuseum((s) => s.enlargedNoteId);
  const notes = useMuseum((s) => s.notes);
  const close = useMuseum((s) => s.setEnlargedNote);
  const note = notes.find((n) => n.id === id) ?? null;

  return (
    <AnimatePresence>
      {note && (
        <motion.div
          className="absolute inset-0 z-30 flex items-center justify-center bg-black/40 backdrop-blur-lg"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.6 }}
          onClick={() => close(null)}
        >
          <motion.div
            className="relative w-[min(90vw,460px)] rounded-sm border border-bone/15 bg-[#f4f1e8] px-10 py-12 text-center shadow-2xl"
            initial={{ opacity: 0, scale: 0.9, rotate: -0.6 }}
            animate={{ opacity: 1, scale: 1, rotate: -0.6 }}
            exit={{ opacity: 0, scale: 0.9 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="font-display text-2xl font-light leading-relaxed text-ink md:text-3xl">
              &ldquo;{note.message}&rdquo;
            </p>
            <p className="mt-8 text-[11px] uppercase tracking-museum text-ink/40">{timeAgo(note.createdAt)}</p>
          </motion.div>

          <div className="pointer-events-none absolute bottom-10 left-1/2 -translate-x-1/2 text-[11px] uppercase tracking-museum text-bone/50">
            E / Esc · Return
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
