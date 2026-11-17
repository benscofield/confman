import { redirect } from "next/navigation";

import { CalendarScheduleManager } from "@/components/calendar-schedule-manager";
import { getSelectedConference } from "@/lib/selected-conference";

export default async function CalendarPage() {
  const selectedConference = await getSelectedConference();

  if (!selectedConference) {
    redirect("/conferences");
  }

  return (
    <main className="mx-auto max-w-5xl px-6 py-10">
      <CalendarScheduleManager
        conferenceStartDate={selectedConference.startDate}
        conferenceEndDate={selectedConference.endDate}
      />
    </main>
  );
}
