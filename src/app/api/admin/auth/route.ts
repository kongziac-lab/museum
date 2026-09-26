import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { ADMIN_COOKIE, expectedToken, isAuthed } from "@/lib/adminAuth";
import { getAdminAuthMode } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

/** GET → session status and auth mode (supabase vs password). */
export async function GET() {
  return NextResponse.json({ authed: await isAuthed(), mode: getAdminAuthMode() });
}

/** POST { password } → password-cookie login (local dev only). */
export async function POST(request: Request) {
  if (getAdminAuthMode() === "supabase") {
    return NextResponse.json(
      { ok: false, error: "Use email and password sign-in (Supabase Auth)" },
      { status: 400 }
    );
  }

  const { password } = (await request.json().catch(() => ({}))) as { password?: string };
  const pw = process.env.ADMIN_PASSWORD || "change-me";
  const provided = createHash("sha256").update(`masterpiece:${password ?? ""}`).digest("hex");

  if (provided !== createHash("sha256").update(`masterpiece:${pw}`).digest("hex")) {
    return NextResponse.json({ ok: false, error: "Invalid password" }, { status: 401 });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.set(ADMIN_COOKIE, expectedToken(), {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return res;
}

/** DELETE → sign out (Supabase session + password cookie). */
export async function DELETE() {
  const res = NextResponse.json({ ok: true });

  if (getAdminAuthMode() === "supabase") {
    try {
      const supabase = await createSupabaseServerClient();
      await supabase.auth.signOut();
    } catch {
      /* ignore */
    }
  }

  res.cookies.set(ADMIN_COOKIE, "", { path: "/", maxAge: 0 });
  return res;
}
