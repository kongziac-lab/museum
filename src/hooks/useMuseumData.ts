"use client";

import { useEffect, useState } from "react";
import { buildMuseum, mergeLayoutArtworks, type MuseumBuild } from "@/lib/config";
import { useMuseum } from "@/lib/store";
import type { ArtworkSource, ExhibitionInfo, ExhibitionLayout } from "@/lib/types";

interface MuseumData {
  build: MuseumBuild | null;
  loading: boolean;
  error: string | null;
}

/**
 * Loads the auto-detected artwork sources and any authored layout, then
 * hydrates the museum store. The architectural shell (walls/rooms/bounds)
 * is always derived from the source set so it fits the collection; the
 * placed artworks come from a saved layout when present, otherwise from
 * the default auto-layout.
 */
export function useMuseumData(): MuseumData {
  const [build, setBuild] = useState<MuseumBuild | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const setSources = useMuseum((s) => s.setSources);
  const setArtworks = useMuseum((s) => s.setArtworks);
  const setInfo = useMuseum((s) => s.setInfo);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        // 수상작 목록은 빌드 때 만들어진 정적 파일(public/exhibition.json)에서 읽는다.
        // 배치 파일(/api/layout)은 선택 사항이라 실패해도 자동 배치로 진행한다.
        const [srcRes, layoutJson] = await Promise.all([
          fetch("/exhibition.json", { cache: "no-store" }),
          fetch("/api/layout", { cache: "no-store" })
            .then((r) => (r.ok ? r.json() : { layout: null }))
            .catch(() => ({ layout: null })) as Promise<{ layout: ExhibitionLayout | null }>,
        ]);
        if (!srcRes.ok) throw new Error("exhibition.json을 찾을 수 없습니다. npm run exhibition 을 먼저 실행하세요.");

        const srcJson = (await srcRes.json()) as { artworks: ArtworkSource[]; info?: ExhibitionInfo };

        if (cancelled) return;
        setInfo(srcJson.info ?? {});

        const sources = srcJson.artworks ?? [];
        const built = buildMuseum(sources);

        setSources(sources);

        // Merge a saved layout with current sources (keeps only works whose
        // image still exists, and refreshes the src path from the source).
        if (layoutJson.layout && layoutJson.layout.artworks.length > 0) {
          setArtworks(mergeLayoutArtworks(layoutJson.layout.artworks, sources, built));
        } else {
          setArtworks(built.artworks);
        }

        setBuild(built);
        setLoading(false);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : "Failed to load museum data");
        setLoading(false);
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [setSources, setArtworks, setInfo]);

  return { build, loading, error };
}
