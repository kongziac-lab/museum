import { NextResponse } from "next/server";
import { existsSync, mkdirSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join, extname, basename } from "node:path";
import { isAuthed } from "@/lib/adminAuth";

export const dynamic = "force-dynamic";

const VALID_EXT = new Set([".jpg", ".jpeg", ".png", ".webp"]);

/** Sanitize a collection name / file name to a safe path segment. */
function safeSegment(input: string, fallback: string): string {
  const cleaned = input.replace(/[^a-zA-Z0-9._-]/g, "").replace(/\.+/g, ".");
  return cleaned.length > 0 ? cleaned : fallback;
}

/**
 * POST multipart form-data: `collection` (optional) + one or more `files`.
 * Writes images into /public/artworks/<collection>. The runtime auto-detects
 * them on the next load — no code changes required.
 */
export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  const form = await request.formData();
  const collection = safeSegment(String(form.get("collection") ?? "main"), "main");
  const files = form.getAll("files").filter((f): f is File => f instanceof File);

  if (files.length === 0) {
    return NextResponse.json({ ok: false, error: "No files provided" }, { status: 400 });
  }

  const destDir = join(process.cwd(), "public", "artworks", collection);
  if (!existsSync(destDir)) mkdirSync(destDir, { recursive: true });

  const saved: string[] = [];
  for (const file of files) {
    const ext = extname(file.name).toLowerCase();
    if (!VALID_EXT.has(ext)) continue;
    const name = safeSegment(basename(file.name), `image-${Date.now()}${ext}`);
    const buffer = Buffer.from(await file.arrayBuffer());
    await writeFile(join(destDir, name), buffer);
    saved.push(`${collection}/${name}`);
  }

  return NextResponse.json({ ok: true, saved, count: saved.length });
}
