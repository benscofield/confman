import { randomBytes } from "node:crypto";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { sendAssignmentAckSms } from "@/lib/twilio";
import type { TaskStatus } from "@/types/domain";

const orderedStatuses: TaskStatus[] = [
  "pending",
  "assigned",
  "notified",
  "acknowledged",
  "completed",
  "flagged",
];

export async function getTaskStatusSummary(): Promise<Array<{ status: TaskStatus; count: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("tasks").select("status");

  if (error) {
    return orderedStatuses.map((status) => ({ status, count: 0 }));
  }

  const counts = new Map<TaskStatus, number>(orderedStatuses.map((s) => [s, 0]));
  for (const row of data) {
    const status = row.status as TaskStatus;
    if (counts.has(status)) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }

  return orderedStatuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

export async function getTaskStatusSummaryForConference(
  conferenceId: string,
): Promise<Array<{ status: TaskStatus; count: number }>> {
  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase.from("tasks").select("status").eq("conference_id", conferenceId);

  if (error) {
    return orderedStatuses.map((status) => ({ status, count: 0 }));
  }

  const counts = new Map<TaskStatus, number>(orderedStatuses.map((s) => [s, 0]));
  for (const row of data) {
    const status = row.status as TaskStatus;
    if (counts.has(status)) {
      counts.set(status, (counts.get(status) ?? 0) + 1);
    }
  }

  return orderedStatuses.map((status) => ({ status, count: counts.get(status) ?? 0 }));
}

export async function assignTaskAndNotify(params: {
  conferenceId: string;
  taskId: string;
  volunteerProfileId: string;
  volunteerPhone: string;
}): Promise<{ token: string }> {
  const supabase = createServerSupabaseClient();
  const token = randomBytes(24).toString("hex");

  const { data: taskRow, error: taskReadError } = await supabase
    .from("tasks")
    .select("id")
    .eq("id", params.taskId)
    .eq("conference_id", params.conferenceId)
    .maybeSingle();

  if (taskReadError || !taskRow) {
    throw new Error("Task not found for the selected conference.");
  }

  const { error: assignError } = await supabase.from("task_assignments").insert({
    task_id: params.taskId,
    profile_id: params.volunteerProfileId,
  });
  if (assignError) {
    throw new Error(assignError.message);
  }

  const { error: statusError } = await supabase
    .from("tasks")
    .update({ status: "assigned" })
    .eq("id", params.taskId)
    .eq("conference_id", params.conferenceId);
  if (statusError) {
    throw new Error(statusError.message);
  }

  const { error: tokenError } = await supabase.from("task_ack_tokens").insert({
    token,
    task_id: params.taskId,
    profile_id: params.volunteerProfileId,
  });
  if (tokenError) {
    throw new Error(tokenError.message);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const ackUrl = `${appUrl}/ack/${token}`;
  await sendAssignmentAckSms(params.volunteerPhone, ackUrl);

  const { error: notifiedError } = await supabase
    .from("tasks")
    .update({ status: "notified" })
    .eq("id", params.taskId)
    .eq("conference_id", params.conferenceId);

  if (notifiedError) {
    throw new Error(notifiedError.message);
  }

  return { token };
}

export async function acknowledgeTaskByToken(token: string): Promise<boolean> {
  const supabase = createServerSupabaseClient();
  const { data: ackRow, error: tokenError } = await supabase
    .from("task_ack_tokens")
    .select("id, task_id, used_at")
    .eq("token", token)
    .maybeSingle();

  if (tokenError || !ackRow || ackRow.used_at) {
    return false;
  }

  const now = new Date().toISOString();

  const { error: updateTaskError } = await supabase
    .from("tasks")
    .update({ status: "acknowledged", updated_at: now })
    .eq("id", ackRow.task_id);

  if (updateTaskError) {
    throw new Error(updateTaskError.message);
  }

  const { error: updateTokenError } = await supabase
    .from("task_ack_tokens")
    .update({ used_at: now })
    .eq("id", ackRow.id);

  if (updateTokenError) {
    throw new Error(updateTokenError.message);
  }

  return true;
}
