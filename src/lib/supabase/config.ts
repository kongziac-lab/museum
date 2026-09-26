/** Whether Supabase Auth is configured (URL + anon key in env). */
export function isSupabaseConfigured(): boolean {
  return Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

/** Optional allowlist of admin emails (comma-separated). Empty = any signed-in user. */
export function getAdminAllowlist(): string[] {
  const raw = process.env.ADMIN_EMAILS?.trim();
  if (!raw) return [];
  return raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export type AdminAuthMode = "supabase" | "password";

export function getAdminAuthMode(): AdminAuthMode {
  return isSupabaseConfigured() ? "supabase" : "password";
}
