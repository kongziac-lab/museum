"use client";

import { Suspense, useEffect, useState } from "react";
import { Canvas } from "@react-three/fiber";
import * as THREE from "three";
import { buildMuseum, mergeLayoutArtworks, type MuseumBuild } from "@/lib/config";
import { useEditor } from "@/lib/editorStore";
import type { ArtworkSource, ExhibitionLayout } from "@/lib/types";
import { EditorScene } from "@/components/editor/EditorScene";
import { Inspector, Toolbar } from "@/components/editor/EditorUI";

export default function EditorPage() {
  const [build, setBuild] = useState<MuseumBuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sourceCount, setSourceCount] = useState(0);
  const init = useEditor((s) => s.init);
  const undo = useEditor((s) => s.undo);
  const redo = useEditor((s) => s.redo);
  const save = useEditor((s) => s.save);
  const duplicate = useEditor((s) => s.duplicateSelected);
  const remove = useEditor((s) => s.removeSelected);

  // Load sources + any saved layout, then seed the editor working set.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [srcRes, layoutRes] = await Promise.all([
          fetch("/api/artworks", { cache: "no-store" }),
          fetch("/api/layout", { cache: "no-store" }),
        ]);

        if (!srcRes.ok || !layoutRes.ok) {
          throw new Error("Could not reach the artworks or layout API");
        }

        const { artworks: sources = [] } = (await srcRes.json()) as { artworks?: ArtworkSource[] };
        const { layout } = (await layoutRes.json()) as { layout: ExhibitionLayout | null };
        if (cancelled) return;

        setSourceCount(sources.length);
        const built = buildMuseum(sources);
        let working = built.artworks;
        if (layout && layout.artworks.length > 0) {
          working = mergeLayoutArtworks(layout.artworks, sources, built);
        }
        init(working, built.mountWalls);
        setBuild(built);
        setLoadError(null);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setLoadError(e instanceof Error ? e.message : "Failed to load editor data");
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [init]);

  // Keyboard shortcuts.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA";
      if (typing) return;

      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (mod && (e.key.toLowerCase() === "y" || (e.key.toLowerCase() === "z" && e.shiftKey))) {
        e.preventDefault();
        redo();
      } else if (mod && e.key.toLowerCase() === "s") {
        e.preventDefault();
        void save();
      } else if (mod && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicate();
      } else if (e.key === "Delete" || e.key === "Backspace") {
        remove();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo, save, duplicate, remove]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#0a0d14]">
      <Canvas
        shadows
        dpr={[1, 2]}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping }}
        camera={{ fov: 55, near: 0.05, far: 500, position: [10, 6, 10] }}
      >
        <Suspense fallback={null}>{build && <EditorScene build={build} />}</Suspense>
      </Canvas>

      <Toolbar />
      <Inspector />

      {loadError && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 text-sm text-red-200">
          {loadError}
        </div>
      )}

      {!loading && !loadError && sourceCount === 0 && (
        <div className="pointer-events-none absolute bottom-6 left-6 max-w-md rounded-lg border border-bone/15 bg-black/70 px-4 py-3 text-xs leading-relaxed text-bone/70">
          No artwork images found. Add JPG, PNG, or WebP files to{" "}
          <code className="text-bone/90">public/artworks/</code>, then refresh. Empty placeholder frames
          are shown until images are added.
        </div>
      )}

      {loading && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs uppercase tracking-museum text-bone/50">
          Loading exhibition…
        </div>
      )}
    </div>
  );
}
