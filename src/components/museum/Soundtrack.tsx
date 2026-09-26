"use client";

import { useEffect } from "react";
import { useMuseum } from "@/lib/store";
import { soundtrack, type Track } from "@/lib/soundtrack";

/**
 * Non-visual controller: loads the soundtrack playlist, mirrors its state into
 * the store (for the music widget), and gently ducks the volume during
 * inspection and while seated — restoring it afterwards.
 */
export function Soundtrack() {
  const setMusic = useMuseum((s) => s.setMusic);
  const inspectId = useMuseum((s) => s.inspectId);
  const seated = useMuseum((s) => s.seated);

  useEffect(() => {
    soundtrack.onState((st) => setMusic(st));
    let alive = true;
    (async () => {
      try {
        const res = await fetch("/api/soundtrack", { cache: "no-store" });
        const json = (await res.json()) as { tracks: Track[] };
        if (alive) soundtrack.load(json.tracks ?? []);
      } catch {
        /* graceful: widget will show no soundtrack */
      }
    })();
    return () => {
      alive = false;
    };
  }, [setMusic]);

  // Volume ducking by context.
  useEffect(() => {
    const factor = inspectId ? 0.55 : seated ? 0.6 : 1;
    soundtrack.duck(factor);
  }, [inspectId, seated]);

  return null;
}
