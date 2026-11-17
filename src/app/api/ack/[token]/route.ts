import { NextResponse } from "next/server";

import { acknowledgeTaskByToken } from "@/lib/task-engine";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const ok = await acknowledgeTaskByToken(token);

  if (!ok) {
    return NextResponse.json({ ok: false, message: "Invalid or expired token" }, { status: 400 });
  }

  return NextResponse.json({ ok: true, message: "Task acknowledged" });
}
