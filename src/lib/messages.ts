"use client";

/** Client helpers for the final room's message feature. */

export interface PublicMessage {
  id: string;
  message: string;
  createdAt: string;
}

const FP_KEY = "masterpiece_fp";
const LAST_SHARE_KEY = "masterpiece_last_share";
const DAY_MS = 24 * 60 * 60 * 1000;

/** A stable, privacy-respecting browser fingerprint (persisted locally). */
export function getFingerprint(): string {
  if (typeof window === "undefined") return "";
  let fp = localStorage.getItem(FP_KEY);
  if (!fp) {
    const seed = [
      navigator.userAgent,
      navigator.language,
      screen.width,
      screen.height,
      new Date().getTimezoneOffset(),
      Math.random().toString(36).slice(2),
    ].join("|");
    // Small non-cryptographic hash → hex string.
    let h = 2166136261;
    for (let i = 0; i < seed.length; i++) {
      h ^= seed.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    fp = (h >>> 0).toString(16) + Date.now().toString(36);
    localStorage.setItem(FP_KEY, fp);
  }
  return fp;
}

/** Client-side 24h guard (server enforces the real limit too). */
export function canShareNow(): boolean {
  if (typeof window === "undefined") return true;
  const last = Number(localStorage.getItem(LAST_SHARE_KEY) || 0);
  return Date.now() - last > DAY_MS;
}

export function markShared() {
  if (typeof window !== "undefined") localStorage.setItem(LAST_SHARE_KEY, String(Date.now()));
}

export async function fetchMessages(): Promise<PublicMessage[]> {
  try {
    const res = await fetch("/api/messages", { cache: "no-store" });
    const json = (await res.json()) as { messages: PublicMessage[] };
    return json.messages ?? [];
  } catch {
    return [];
  }
}

export interface SubmitResult {
  ok: boolean;
  reason?: string;
}

export async function submitMessage(message: string): Promise<SubmitResult> {
  try {
    const res = await fetch("/api/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message, fingerprint: getFingerprint() }),
    });
    const json = (await res.json()) as SubmitResult;
    return json;
  } catch {
    return { ok: false, reason: "Something went wrong. Please try again." };
  }
}

/** Friendly relative time, e.g. "2 days ago". */
export function timeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min${mins === 1 ? "" : "s"} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? "" : "s"} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months} month${months === 1 ? "" : "s"} ago`;
  return `${Math.floor(months / 12)} year${months >= 24 ? "s" : ""} ago`;
}

export const FAREWELLS = [
  "Thank you for leaving a piece of yourself here.",
  "Some moments are worth holding onto.",
  "Take care of your heart.",
  "Someone may one day find comfort in your words.",
  "Your words matter more than you know.",
];

export function randomFarewell(): string {
  return FAREWELLS[Math.floor(Math.random() * FAREWELLS.length)];
}
