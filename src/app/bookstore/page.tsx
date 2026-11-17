import { getSelectedConference } from "@/lib/selected-conference";
import { redirect } from "next/navigation";

export default async function BookstorePage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Bookstore & Inventory Module</h1>
      <p className="mt-3 text-brand-forest/85">
        Speaker book inventory, SKU tracking, and order processing are supported with real-time stock updates.
      </p>
    </main>
  );
}
