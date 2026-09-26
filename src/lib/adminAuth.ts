import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { getAdminAllowlist, isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

/** Legacy cookie gate — used only when Supabase is not configured. */
const COOKIE = "masterpiece_admin";

export function expectedToken(): string {
  const pw = process.env.ADMIN_PASSWORD || "change-me";
  return createHash("sha256").update(`masterpiece:${pw}`).digest("hex");
}

async function isPasswordAuthed(): Promise<boolean> {
  const store = await cookies();
  return store.get(COOKIE)?.value === expectedToken();
}

/** True when the request has a valid Supabase session (and optional email allowlist). */
export async function isSupabaseAuthed(): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return false;

  const allowlist = getAdminAllowlist();
  if (allowlist.length === 0) return true;

  const email = data.user.email?.toLowerCase();
  return email ? allowlist.includes(email) : false;
}

/** Admin API routes accept Supabase Auth when configured, else the password cookie. */
export async function isAuthed(): Promise<boolean> {
  if (isSupabaseConfigured()) return await isSupabaseAuthed();
  return await isPasswordAuthed();
}

export const ADMIN_COOKIE = COOKIE;
