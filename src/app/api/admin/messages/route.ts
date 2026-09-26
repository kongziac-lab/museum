import { NextResponse } from "next/server";
import { isAuthed } from "@/lib/adminAuth";
import { adminList, stats, updateMessage } from "@/lib/server/messages";

export const dynamic = "force-dynamic";

/** GET → all messages + stats (authed). */
export async function GET() {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json({ ok: true, messages: adminList(), stats: stats() });
}

/** POST { id, action } → approve | reject | hide | delete (authed). */
export async function POST(request: Request) {
  if (!(await isAuthed())) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  const { id, action } = (await request.json().catch(() => ({}))) as {
    id?: string;
    action?: "approve" | "reject" | "hide" | "delete";
  };
  if (!id || !action || !["approve", "reject", "hide", "delete"].includes(action)) {
    return NextResponse.json({ ok: false, error: "Bad request" }, { status: 400 });
  }
  const done = updateMessage(id, action);
  return NextResponse.json({ ok: done });
}
