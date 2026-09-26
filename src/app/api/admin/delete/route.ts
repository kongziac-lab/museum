import { NextResponse } from "next/server";
import { existsSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { join, normalize, sep } from "node:path";
import { isAuthed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

/**
 * POST { id } where id is "collection/filename". Deletes the image from
 * /public/artworks. Path is normalized and constrained to the artworks root
 * to prevent traversal.
 */
export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const { id } = (await request.json().catch(() => ({}))) as { id?: string };
  if (!id) return NextResponse.json({ ok: false, error: "Missing id" }, { status: 400 });

  const root = join(process.cwd(), "public", "artworks");
  const target = normalize(join(root, id));

  // Guard against path traversal.
  if (!target.startsWith(root + sep)) {
    return NextResponse.json({ ok: false, error: "Invalid path" }, { status: 400 });
  }
  if (!existsSync(target)) {
    return NextResponse.json({ ok: false, error: "Not found" }, { status: 404 });
  }

  await unlink(target);
  return NextResponse.json({ ok: true });
}
