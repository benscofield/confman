import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const body = (await request.json()) as {
    trigger?: "time" | "event";
    targetGroup?: string;
    payload?: Record<string, unknown>;
  };

  if (!body.trigger || !body.targetGroup) {
    return NextResponse.json({ error: "trigger and targetGroup are required" }, { status: 400 });
  }

  // TODO: Dispatch via Twilio + Web Push using scheduled workers/cron and a subscription table.
  return NextResponse.json({ ok: true, queued: true });
}
