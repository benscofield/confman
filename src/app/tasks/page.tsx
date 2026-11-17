import { redirect } from "next/navigation";

import { TasksManager } from "@/components/tasks-manager";
import { getSelectedConference } from "@/lib/selected-conference";

export const revalidate = 0;

export default async function TasksPage() {
  const selectedConference = await getSelectedConference();
  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <TasksManager />
    </main>
  );
}
