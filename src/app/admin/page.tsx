"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import type { AdminAuthMode } from "@/lib/supabase/config";
import type { ArtworkSource } from "@/lib/types";

interface AdminMessage {
  id: string;
  message: string;
  createdAt: string;
  approved: boolean;
  hidden: boolean;
}
interface MessageStats {
  total: number;
  approved: number;
  pending: number;
  hidden: number;
  today: number;
}

export default function AdminPage() {
  const [authed, setAuthed] = useState<boolean | null>(null);
  const [authMode, setAuthMode] = useState<AdminAuthMode>("password");
  const [password, setPassword] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sources, setSources] = useState<ArtworkSource[]>([]);
  const [collection, setCollection] = useState("main");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const [messages, setMessages] = useState<AdminMessage[]>([]);
  const [mstats, setMstats] = useState<MessageStats | null>(null);
  const [mQuery, setMQuery] = useState("");

  const loadSources = useCallback(async () => {
    const res = await fetch("/api/artworks", { cache: "no-store" });
    const json = (await res.json()) as { artworks: ArtworkSource[] };
    setSources(json.artworks ?? []);
  }, []);

  const loadMessages = useCallback(async () => {
    const res = await fetch("/api/admin/messages", { cache: "no-store" });
    if (!res.ok) return;
    const json = (await res.json()) as { messages: AdminMessage[]; stats: MessageStats };
    setMessages(json.messages ?? []);
    setMstats(json.stats ?? null);
  }, []);

  const moderate = async (id: string, action: "approve" | "reject" | "hide" | "delete") => {
    if (action === "delete" && !confirm("Delete this message permanently?")) return;
    await fetch("/api/admin/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action }),
    });
    void loadMessages();
  };

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/admin/auth", { cache: "no-store" });
      const json = (await res.json()) as { authed: boolean; mode?: AdminAuthMode };
      setAuthed(json.authed);
      setAuthMode(json.mode ?? "password");
      if (json.authed) {
        void loadSources();
        void loadMessages();
      }
    })();
  }, [loadSources, loadMessages]);

  const login = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (authMode === "supabase") {
      try {
        const supabase = createSupabaseBrowserClient();
        const { error: signInError } = await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });
        if (signInError) {
          setError(signInError.message);
          return;
        }
        setAuthed(true);
        void loadSources();
        void loadMessages();
      } catch {
        setError("Supabase sign-in failed");
      }
      return;
    }

    const res = await fetch("/api/admin/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      setAuthed(true);
      void loadSources();
      void loadMessages();
    } else {
      setError("Invalid password");
    }
  };

  const logout = async () => {
    await fetch("/api/admin/auth", { method: "DELETE" });
    setAuthed(false);
  };

  const upload = async () => {
    const files = fileRef.current?.files;
    if (!files || files.length === 0) return;
    setBusy(true);
    setStatus("Uploading…");
    const form = new FormData();
    form.append("collection", collection || "main");
    Array.from(files).forEach((f) => form.append("files", f));
    const res = await fetch("/api/admin/upload", { method: "POST", body: form });
    const json = await res.json();
    setBusy(false);
    if (json.ok) {
      setStatus(`Uploaded ${json.count} image(s).`);
      if (fileRef.current) fileRef.current.value = "";
      void loadSources();
    } else {
      setStatus(`Error: ${json.error}`);
    }
  };

  const remove = async (id: string) => {
    if (!confirm(`Delete ${id}? This removes the file from disk.`)) return;
    const res = await fetch("/api/admin/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    });
    const json = await res.json();
    if (json.ok) void loadSources();
    else setStatus(`Error: ${json.error}`);
  };

  // ── Login gate ──────────────────────────────────────────────────
  if (authed === null) {
    return <div className="flex h-screen items-center justify-center bg-ink text-bone/50">Loading…</div>;
  }

  if (!authed) {
    return (
      <div className="flex h-screen items-center justify-center bg-ink">
        <form onSubmit={login} className="w-80 rounded-xl border border-bone/12 bg-navy-deep/60 p-8">
          <h1 className="mb-1 font-display text-2xl tracking-[0.2em] text-bone">MUSEUM</h1>
          <p className="mb-6 text-xs uppercase tracking-museum text-bone/40">Admin</p>
          {authMode === "supabase" ? (
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Email"
              required
              className="mb-3 w-full rounded border border-bone/15 bg-black/40 px-3 py-2 text-sm text-bone outline-none focus:border-spot/60"
            />
          ) : null}
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder={authMode === "supabase" ? "Password" : "Admin password"}
            required
            className="mb-3 w-full rounded border border-bone/15 bg-black/40 px-3 py-2 text-sm text-bone outline-none focus:border-spot/60"
          />
          {error && <p className="mb-3 text-xs text-red-400">{error}</p>}
          <button className="w-full rounded bg-spot/90 py-2 text-sm font-medium text-ink transition hover:bg-spot">
            Sign in
          </button>
          <p className="mt-4 text-[10px] leading-relaxed text-bone/30">
            {authMode === "supabase"
              ? "Signed in via Supabase Auth. Create users in your Supabase project dashboard."
              : "Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY in .env to use Supabase Auth, or set ADMIN_PASSWORD for local use."}
          </p>
        </form>
      </div>
    );
  }

  // ── Dashboard ───────────────────────────────────────────────────
  const byCollection = sources.reduce<Record<string, ArtworkSource[]>>((acc, s) => {
    (acc[s.collection] ??= []).push(s);
    return acc;
  }, {});

  return (
    <div className="min-h-screen bg-ink text-bone">
      <header className="flex items-center gap-4 border-b border-bone/10 bg-navy-deep/50 px-6 py-4">
        <h1 className="font-display text-lg tracking-[0.25em]">MUSEUM · ADMIN</h1>
        <span className="text-xs text-bone/40">{sources.length} artworks</span>
        <div className="ml-auto flex gap-2">
          <Link href="/editor" className="rounded border border-bone/20 px-3 py-1.5 text-xs uppercase tracking-wider text-bone/80 hover:border-bone/50">
            Layout editor
          </Link>
          <Link href="/" target="_blank" className="rounded border border-bone/20 px-3 py-1.5 text-xs uppercase tracking-wider text-bone/80 hover:border-bone/50">
            Preview
          </Link>
          <button onClick={logout} className="rounded border border-bone/20 px-3 py-1.5 text-xs uppercase tracking-wider text-bone/60 hover:border-bone/50">
            Log out
          </button>
        </div>
      </header>

      <div className="mx-auto max-w-6xl p-6">
        {/* Upload */}
        <section className="mb-8 rounded-lg border border-bone/12 bg-navy-deep/40 p-5">
          <h2 className="mb-3 text-xs uppercase tracking-museum text-bone/50">Upload images</h2>
          <div className="flex flex-wrap items-center gap-3">
            <input
              value={collection}
              onChange={(e) => setCollection(e.target.value)}
              placeholder="collection"
              className="rounded border border-bone/15 bg-black/40 px-3 py-2 text-sm outline-none focus:border-spot/60"
            />
            <input ref={fileRef} type="file" multiple accept="image/*" className="text-xs text-bone/70" />
            <button
              onClick={upload}
              disabled={busy}
              className="rounded bg-spot/90 px-4 py-2 text-sm font-medium text-ink transition hover:bg-spot disabled:opacity-40"
            >
              Upload
            </button>
            {status && <span className="text-xs text-bone/50">{status}</span>}
          </div>
          <p className="mt-3 text-[11px] text-bone/35">
            Files are saved to <code className="text-bone/50">public/artworks/&lt;collection&gt;</code> and detected
            automatically. New artworks appear in the museum and editor on next load.
          </p>
        </section>

        {/* Collections */}
        {Object.entries(byCollection).map(([col, items]) => (
          <section key={col} className="mb-8">
            <h2 className="mb-3 text-xs uppercase tracking-museum text-bone/50">
              {col} · {items.length}
            </h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 md:grid-cols-6">
              {items.map((s) => (
                <div key={s.id} className="group relative overflow-hidden rounded border border-bone/10 bg-black/30">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.src} alt={s.title} loading="lazy" className="aspect-square w-full object-cover opacity-90" />
                  <button
                    onClick={() => remove(s.id)}
                    className="absolute right-1 top-1 rounded bg-black/70 px-2 py-0.5 text-[10px] text-red-300 opacity-0 transition group-hover:opacity-100"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </section>
        ))}

        {/* Memory wall moderation */}
        <section className="mb-10">
          <div className="mb-3 flex flex-wrap items-center gap-3">
            <h2 className="text-xs uppercase tracking-museum text-bone/50">Memory wall messages</h2>
            {mstats && (
              <span className="text-[11px] text-bone/40">
                {mstats.total} total · {mstats.approved} shown · {mstats.pending} pending · {mstats.hidden} hidden ·{" "}
                {mstats.today} today
              </span>
            )}
            <input
              value={mQuery}
              onChange={(e) => setMQuery(e.target.value)}
              placeholder="Search / filter…"
              className="ml-auto rounded border border-bone/15 bg-black/40 px-3 py-1.5 text-xs outline-none focus:border-spot/60"
            />
            <button onClick={() => void loadMessages()} className="rounded border border-bone/20 px-3 py-1.5 text-[11px] uppercase tracking-wider text-bone/70 hover:border-bone/50">
              Refresh
            </button>
          </div>

          <div className="space-y-2">
            {messages
              .filter((m) => !mQuery || m.message.toLowerCase().includes(mQuery.toLowerCase()))
              .map((m) => (
                <div
                  key={m.id}
                  className="flex items-center gap-3 rounded-lg border border-bone/10 bg-navy-deep/40 px-4 py-2.5"
                >
                  <span className="flex-1 text-sm text-bone/85">{m.message}</span>
                  <span className="text-[10px] uppercase tracking-wider text-bone/35">
                    {m.hidden ? "hidden" : m.approved ? "shown" : "pending"}
                  </span>
                  <span className="text-[10px] text-bone/30">{new Date(m.createdAt).toLocaleDateString()}</span>
                  <div className="flex gap-1">
                    {!m.approved && (
                      <button onClick={() => moderate(m.id, "approve")} className="rounded px-2 py-1 text-[10px] uppercase text-emerald-300/80 hover:bg-white/5">
                        Approve
                      </button>
                    )}
                    <button onClick={() => moderate(m.id, "hide")} className="rounded px-2 py-1 text-[10px] uppercase text-bone/60 hover:bg-white/5">
                      {m.hidden ? "Unhide" : "Hide"}
                    </button>
                    <button onClick={() => moderate(m.id, "delete")} className="rounded px-2 py-1 text-[10px] uppercase text-red-300/80 hover:bg-white/5">
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            {messages.length === 0 && <p className="text-xs text-bone/35">No messages yet.</p>}
          </div>
        </section>
      </div>
    </div>
  );
}
