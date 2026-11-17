import { getSelectedConference } from "@/lib/selected-conference";
import { redirect } from "next/navigation";

export default async function MusiciansPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Worship and Musicians</h1>
      <p className="mt-3 text-brand-forest/85">
        Worship calendar, song assets, set assignments, and role-based read-only access are available through Supabase tables and policies.
      </p>
    </main>
  );
}
