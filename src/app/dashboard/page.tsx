import { getTaskStatusSummaryForConference } from "@/lib/task-engine";
import { getSelectedConference } from "@/lib/selected-conference";
import Link from "next/link";
import { redirect } from "next/navigation";

import { Button } from "@/components/ui/button";

export const revalidate = 0;

export default async function DashboardPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  const summary = await getTaskStatusSummaryForConference(selectedConference.id);
  const totalTasks = summary.reduce((acc, item) => acc + item.count, 0);
  const openTasks = summary
    .filter((item) => item.status !== "completed")
    .reduce((acc, item) => acc + item.count, 0);

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <h1 className="text-3xl font-semibold text-brand-forest">Live Operational Dashboard</h1>
      <p className="mt-2 text-brand-forest/80">Realtime-ready status breakdown for conference tasks.</p>

      <section className="mt-7 rounded-2xl border border-brand-sage/55 bg-white/80 p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">Task Tracking</p>
            <p className="mt-2 text-2xl font-semibold text-brand-forest">{totalTasks} total tasks</p>
            <p className="mt-1 text-sm text-brand-forest/80">{openTasks} currently open across all statuses.</p>
          </div>
          <Button asChild>
            <Link href="/tasks">Open tasks</Link>
          </Button>
        </div>
      </section>

      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {summary.map((item) => (
          <article key={item.status} className="rounded-xl border border-brand-slate/25 bg-white p-5">
            <p className="text-xs uppercase tracking-wider text-brand-slate">{item.status}</p>
            <p className="mt-2 text-3xl font-semibold text-brand-forest">{item.count}</p>
          </article>
        ))}
      </div>
    </main>
  );
}
