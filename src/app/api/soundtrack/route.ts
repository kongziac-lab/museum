import { NextResponse } from "next/server";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

export const dynamic = "force-dynamic";

/**
 * Serves the exhibition soundtrack: the first audio file found in
 * /public/audio. No track ships with this repository, so the gallery runs
 * silent until you add one.
 */
const AUDIO_EXT = new Set([".mp3", ".ogg", ".m4a", ".wav", ".aac"]);

/** Optional external base URL; otherwise serve from /public/audio on this deployment. */
const CDN_BASE = process.env.NEXT_PUBLIC_SOUNDTRACK_BASE?.replace(/\/$/, "");

function trackFromFile(name: string): { src: string; title: string } {
  const title = name.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ").trim();
  const encoded = encodeURIComponent(name);
  const src = CDN_BASE ? `${CDN_BASE}/${encoded}` : `/audio/${encoded}`;
  return { src, title };
}

function scan(): { src: string; title: string }[] {
  const root = join(process.cwd(), "public", "audio");
  if (!existsSync(root)) return [];

  for (const entry of readdirSync(root)) {
    const full = join(root, entry);
    try {
      if (statSync(full).isFile() && AUDIO_EXT.has(extname(entry).toLowerCase())) {
        return [trackFromFile(entry)];
      }
    } catch {
      continue;
    }
  }

  return [];
}

export async function GET() {
  const tracks = scan();
  return NextResponse.json({ count: tracks.length, tracks });
}
