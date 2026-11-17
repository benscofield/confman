import { NextRequest, NextResponse } from "next/server";

import { getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { assignTaskAndNotify } from "@/lib/task-engine";

interface AssignBody {
  taskId?: string;
  volunteerProfileId?: string;
  volunteerPhone?: string;
}

export async function POST(request: NextRequest) {
  try {
    const conferenceId = getSelectedConferenceIdFromCookies(request.cookies.getAll());
    if (!conferenceId) {
      return NextResponse.json({ error: "Conference selection required." }, { status: 400 });
    }

    const body = (await request.json()) as AssignBody;

    if (!body.taskId || !body.volunteerProfileId || !body.volunteerPhone) {
      return NextResponse.json(
        { error: "taskId, volunteerProfileId, and volunteerPhone are required" },
        { status: 400 },
      );
    }

    const result = await assignTaskAndNotify({
      conferenceId,
      taskId: body.taskId,
      volunteerProfileId: body.volunteerProfileId,
      volunteerPhone: body.volunteerPhone,
    });

    return NextResponse.json({ ok: true, token: result.token });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
