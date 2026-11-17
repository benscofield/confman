import { cookies } from "next/headers";

import { conferenceCookieName } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type SelectedConference = {
  id: string;
  name: string;
  status: string;
  startDate: string;
  endDate: string;
  city: string | null;
  locationName: string | null;
};

export function formatConferenceDateRange(startDate: string, endDate: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

  return `${formatter.format(new Date(startDate))} - ${formatter.format(new Date(endDate))}`;
}

export function formatConferencePlace(city: string | null, locationName: string | null): string {
  return city ?? locationName ?? "City not set";
}

export async function getSelectedConference(): Promise<SelectedConference | null> {
  const cookieStore = await cookies();
  const selectedConferenceId = cookieStore.get(conferenceCookieName)?.value;

  if (!selectedConferenceId || selectedConferenceId.trim().length === 0) {
    return null;
  }

  const supabase = createServerSupabaseClient();
  const { data, error } = await supabase
    .from("conferences")
    .select("id, name, status, start_date, end_date, city, location_name")
    .eq("id", selectedConferenceId)
    .maybeSingle();

  if (error || !data) {
    return null;
  }

  return {
    id: data.id,
    name: data.name,
    status: data.status,
    startDate: data.start_date,
    endDate: data.end_date,
    city: data.city,
    locationName: data.location_name,
  };
}