"use client";

import { useEffect } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useMuseum } from "@/lib/store";

/**
 * A single, randomly-chosen farewell line that fades in briefly as the visitor
 * leaves the final room, then fades away on its own.
 */
export function Farewell() {
  const farewell = useMuseum((s) => s.farewell);
  const setFarewell = useMuseum((s) => s.setFarewell);

  useEffect(() => {
    if (!farewell) return;
    const t = setTimeout(() => setFarewell(null), 6000);
    return () => clearTimeout(t);
  }, [farewell, setFarewell]);

  return (
    <AnimatePresence>
      {farewell && (
        <motion.div
          key={farewell}
          className="pointer-events-none absolute inset-x-0 top-[42%] z-30 flex justify-center px-8"
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ duration: 2, ease: [0.16, 1, 0.3, 1] }}
        >
          <p className="max-w-xl text-center font-display text-xl font-light italic leading-relaxed text-bone/85 md:text-2xl">
            {farewell}
          </p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
