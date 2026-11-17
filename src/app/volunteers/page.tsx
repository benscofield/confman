import { VolunteersManager } from "@/components/volunteers-manager";
import { formatConferenceDateRange, getSelectedConference } from "@/lib/selected-conference";
import { redirect } from "next/navigation";

export default async function VolunteersPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Volunteers</h1>

      <VolunteersManager />
    </main>
  );
}
