import { NextResponse } from "next/server";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ExhibitionLayout } from "@/lib/types";

export const dynamic = "force-dynamic";

/**
 * File-based layout persistence so the museum works with zero external
 * services. The visual editor POSTs the authored layout here; the runtime
 * GETs it on load. For production you can swap this for the Supabase /
 * Prisma implementation documented in the README.
 */

const DATA_DIR = join(process.cwd(), "data");
const LAYOUT_FILE = join(DATA_DIR, "layout.json");

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

export async function GET() {
  if (!existsSync(LAYOUT_FILE)) {
    return NextResponse.json({ layout: null });
  }
  try {
    const raw = readFileSync(LAYOUT_FILE, "utf8");
    const layout = JSON.parse(raw) as ExhibitionLayout;
    return NextResponse.json({ layout });
  } catch {
    return NextResponse.json({ layout: null });
  }
}

export async function POST(request: Request) {
  let body: ExhibitionLayout;
  try {
    body = (await request.json()) as ExhibitionLayout;
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  if (!body || !Array.isArray(body.artworks)) {
    return NextResponse.json({ ok: false, error: "Missing artworks[]" }, { status: 400 });
  }

  const layout: ExhibitionLayout = {
    version: (body.version ?? 0) + 1,
    updatedAt: new Date().toISOString(),
    artworks: body.artworks,
  };

  ensureDir();
  writeFileSync(LAYOUT_FILE, JSON.stringify(layout, null, 2), "utf8");

  return NextResponse.json({ ok: true, version: layout.version, updatedAt: layout.updatedAt });
}
