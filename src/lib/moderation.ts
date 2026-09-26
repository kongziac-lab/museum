/**
 * Message moderation for the final room's "leave a message" feature.
 * Pure + framework-agnostic so it can run on the server (submission) and,
 * lightly, on the client (pre-check). Returns a cleaned message or a reason.
 */

export const MESSAGE_MAX = 150;
export const MESSAGE_MIN = 2;

export interface ModerationResult {
  ok: boolean;
  clean?: string;
  reason?: string;
}

// A deliberately small, conservative profanity list (substring, word-ish).
const PROFANITY = [
  "fuck",
  "shit",
  "bitch",
  "asshole",
  "cunt",
  "nigger",
  "faggot",
  "retard",
  "whore",
  "slut",
];

/** Strip zero-width / invisible unicode abuse and normalise whitespace. */
function stripInvisible(input: string): string {
  return input
    // zero-width space, joiner, non-joiner, BOM, word-joiner, etc.
    .replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    // collapse all whitespace (incl. newlines) to single spaces at the edges,
    // but keep internal single newlines as spaces for a clean one-liner feel.
    .replace(/\s+/g, " ")
    .trim();
}

export function moderate(raw: unknown): ModerationResult {
  if (typeof raw !== "string") return { ok: false, reason: "Invalid input." };

  const clean = stripInvisible(raw);

  if (clean.length < MESSAGE_MIN) return { ok: false, reason: "Please write a little more." };
  if (clean.length > MESSAGE_MAX) return { ok: false, reason: `Please keep it under ${MESSAGE_MAX} characters.` };

  const lower = clean.toLowerCase();

  // HTML / script tags.
  if (/<[^>]*>/.test(clean)) return { ok: false, reason: "Please remove any code or tags." };

  // URLs / domains.
  if (/(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|io|co|ph|xyz|info|link)\b)/i.test(lower))
    return { ok: false, reason: "Links aren't allowed here." };

  // Email addresses.
  if (/[^\s@]+@[^\s@]+\.[^\s@]+/.test(clean)) return { ok: false, reason: "Please don't include email addresses." };

  // Phone numbers (7+ digits, allowing spaces/dashes/parentheses).
  if (/(?:\+?\d[\s()-]?){7,}/.test(clean)) return { ok: false, reason: "Please don't include phone numbers." };

  // SQL-injection-ish patterns.
  if (/(\bunion\b\s+\bselect\b|\bdrop\b\s+\btable\b|--\s|;\s*--|'\s*or\s*'?1'?\s*=\s*'?1)/i.test(lower))
    return { ok: false, reason: "That doesn't look like a message." };

  // Excessive repeated characters (e.g. "aaaaaaa").
  if (/(.)\1{6,}/.test(clean)) return { ok: false, reason: "Too many repeated characters." };

  // Very long unbroken words (likely spam / gibberish).
  if (clean.split(" ").some((w) => w.length > 30)) return { ok: false, reason: "That word is too long." };

  // Profanity.
  if (PROFANITY.some((w) => lower.includes(w))) return { ok: false, reason: "Please keep it kind." };

  return { ok: true, clean };
}
