import { NextResponse } from "next/server";
import { moderate } from "@/lib/moderation";
import {
  addMessage,
  hashIp,
  isDuplicate,
  isRateLimited,
  publicSelection,
} from "@/lib/server/messages";

export const dynamic = "force-dynamic";

function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "local";
}

/** GET → a curated random selection of approved messages (no PII). */
export async function GET() {
  return NextResponse.json({ messages: publicSelection(120) });
}

/** POST → submit a message (moderated + rate-limited, auto-approved if clean). */
export async function POST(request: Request) {
  let body: { message?: string; fingerprint?: string };
  try {
    body = (await request.json()) as { message?: string; fingerprint?: string };
  } catch {
    return NextResponse.json({ ok: false, reason: "Invalid request." }, { status: 400 });
  }

  const fingerprint = typeof body.fingerprint === "string" ? body.fingerprint.slice(0, 64) : "";
  const ipHash = hashIp(clientIp(request));

  // Server-side rate limit: one message per 24h per IP or fingerprint.
  if (isRateLimited(ipHash, fingerprint)) {
    return NextResponse.json(
      { ok: false, reason: "You've already left a message today. Thank you." },
      { status: 429 }
    );
  }

  const result = moderate(body.message);
  if (!result.ok || !result.clean) {
    return NextResponse.json({ ok: false, reason: result.reason ?? "Message not accepted." }, { status: 400 });
  }

  if (isDuplicate(result.clean)) {
    return NextResponse.json({ ok: false, reason: "Those words are already here." }, { status: 400 });
  }

  // Manual approval: new messages are held as "pending" (invisible on the wall)
  // until an admin approves them from the moderation dashboard.
  addMessage({ message: result.clean, ipHash, fingerprint, approved: false });

  return NextResponse.json({ ok: true });
}
