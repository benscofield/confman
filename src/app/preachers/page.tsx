import { PreachersManager } from "@/components/preachers-manager";
import { formatConferenceDateRange, getSelectedConference } from "@/lib/selected-conference";
import { redirect } from "next/navigation";

export default async function PreachersPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Preachers</h1>
      <p className="mt-3 text-brand-forest/85">
        Speaking schedules, hotel details, travel reminders, and confidential financial agreements are modeled in the database with RLS restrictions for admins and designated PAs.
      </p>

      <PreachersManager conferenceName={selectedConference.name} />
    </main>
  );
}
