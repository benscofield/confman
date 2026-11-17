import twilio from "twilio";

import { env } from "@/lib/env";

function getTwilioClient() {
  if (!env.twilioSid || !env.twilioToken) {
    return null;
  }

  return twilio(env.twilioSid, env.twilioToken);
}

export async function sendAssignmentAckSms(to: string, ackUrl: string): Promise<void> {
  const client = getTwilioClient();
  const from = env.twilioFrom;

  if (!client || !from) {
    console.warn("Twilio is not configured; skipping SMS send.");
    return;
  }

  await client.messages.create({
    to,
    from,
    body: `You have a conference assignment. Tap to acknowledge: ${ackUrl}`,
  });
}
