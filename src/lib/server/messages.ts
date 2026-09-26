import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createHash, randomUUID } from "node:crypto";

/**
 * File-based store for the final room's messages. Keeps the project
 * dependency-free (no DB required). IP addresses are never stored — only a
 * salted hash — and public reads never expose hashes/fingerprints.
 *
 * For a large public deployment, swap this for Postgres/Supabase using the
 * same shape (see prisma/schema.prisma).
 */

export interface StoredMessage {
  id: string;
  message: string;
  createdAt: string;
  approved: boolean;
  hidden: boolean;
  ipHash: string;
  fingerprint: string;
}

export interface PublicMessage {
  id: string;
  message: string;
  createdAt: string;
}

const DATA_DIR = join(process.cwd(), "data");
const FILE = join(DATA_DIR, "messages.json");
const DAY_MS = 24 * 60 * 60 * 1000;

const SALT = process.env.MESSAGE_SALT || "masterpiece-static-salt-change-in-prod";

export function hashIp(ip: string): string {
  return createHash("sha256").update(`${SALT}:${ip}`).digest("hex").slice(0, 32);
}

function ensureDir() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
}

function readAll(): StoredMessage[] {
  if (!existsSync(FILE)) return [];
  try {
    const parsed = JSON.parse(readFileSync(FILE, "utf8"));
    return Array.isArray(parsed) ? (parsed as StoredMessage[]) : [];
  } catch {
    return [];
  }
}

function writeAll(list: StoredMessage[]) {
  ensureDir();
  writeFileSync(FILE, JSON.stringify(list, null, 2), "utf8");
}

/** True if this ip hash or fingerprint submitted within the last 24h. */
export function isRateLimited(ipHash: string, fingerprint: string): boolean {
  const now = Date.now();
  return readAll().some((m) => {
    const age = now - new Date(m.createdAt).getTime();
    if (age > DAY_MS) return false;
    return m.ipHash === ipHash || (fingerprint && m.fingerprint === fingerprint);
  });
}

/** True if an identical approved message already exists (duplicate spam). */
export function isDuplicate(message: string): boolean {
  const key = message.trim().toLowerCase();
  return readAll().some((m) => m.message.trim().toLowerCase() === key);
}

export function addMessage(input: {
  message: string;
  ipHash: string;
  fingerprint: string;
  approved: boolean;
}): StoredMessage {
  const list = readAll();
  const msg: StoredMessage = {
    id: randomUUID(),
    message: input.message,
    createdAt: new Date().toISOString(),
    approved: input.approved,
    hidden: false,
    ipHash: input.ipHash,
    fingerprint: input.fingerprint,
  };
  list.push(msg);
  writeAll(list);
  return msg;
}

/** Curated random selection of visible (approved, not hidden) messages. */
export function publicSelection(limit = 120): PublicMessage[] {
  const visible = readAll().filter((m) => m.approved && !m.hidden);
  // Fisher–Yates shuffle a copy, then take `limit`.
  const arr = [...visible];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, limit).map((m) => ({ id: m.id, message: m.message, createdAt: m.createdAt }));
}

export function adminList(): StoredMessage[] {
  return readAll().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
}

export function stats() {
  const all = readAll();
  const now = Date.now();
  return {
    total: all.length,
    approved: all.filter((m) => m.approved && !m.hidden).length,
    pending: all.filter((m) => !m.approved && !m.hidden).length,
    hidden: all.filter((m) => m.hidden).length,
    today: all.filter((m) => now - new Date(m.createdAt).getTime() < DAY_MS).length,
  };
}

export function updateMessage(id: string, action: "approve" | "reject" | "hide" | "delete"): boolean {
  let list = readAll();
  const idx = list.findIndex((m) => m.id === id);
  if (idx < 0) return false;
  if (action === "delete") {
    list = list.filter((m) => m.id !== id);
  } else if (action === "approve") {
    list[idx].approved = true;
    list[idx].hidden = false;
  } else if (action === "reject") {
    list[idx].approved = false;
    list[idx].hidden = true;
  } else if (action === "hide") {
    list[idx].hidden = !list[idx].hidden;
  }
  writeAll(list);
  return true;
}
