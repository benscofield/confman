import { redirect } from "next/navigation";

import { PersonalAssistantsManager } from "@/components/personal-assistants-manager";
import { getSelectedConference } from "@/lib/selected-conference";

export default async function PersonalAssistantsPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Personal Assistants</h1>
      <p className="mt-3 text-brand-forest/85">
        Keep a conference-specific list of personal assistants supporting preachers for logistics, scheduling, and communication.
      </p>

      <PersonalAssistantsManager />
    </main>
  );
}
