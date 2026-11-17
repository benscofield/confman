import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateEventBody = {
  action: "create-event";
  startsAtIso?: string;
  endsAtIso?: string;
  title?: string;
  assignPreacher?: boolean;
  preacherName?: string;
  assignMusicTeam?: boolean;
  musicTeamName?: string;
};

type UpdateEventBody = {
  action: "update-event";
  eventId?: string;
  startsAtIso?: string;
  endsAtIso?: string;
  title?: string;
  assignPreacher?: boolean;
  preacherName?: string;
  assignMusicTeam?: boolean;
  musicTeamName?: string;
};

type DeleteEventBody = {
  action: "delete-event";
  eventId?: string;
};

type SchedulesBody = CreateEventBody | UpdateEventBody | DeleteEventBody;

function getAccessTokenFromRequest(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization");
  if (authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authorizationHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }

  return getAccessTokenFromCookies(request.cookies.getAll());
}

async function resolveContext(request: NextRequest) {
  const accessToken = getAccessTokenFromRequest(request);
  const conferenceId = getSelectedConferenceIdFromCookies(request.cookies.getAll());

  if (!accessToken || !conferenceId) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createServerSupabaseClient();
  const userResult = await supabase.auth.getUser(accessToken);

  if (userResult.error || !userResult.data.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const appUserResult = await supabase
    .from("users")
    .select("church_id")
    .eq("auth_user_id", userResult.data.user.id)
    .maybeSingle();

  if (appUserResult.error || !appUserResult.data) {
    return { error: NextResponse.json({ error: "App user not found." }, { status: 404 }) };
  }

  const conferenceResult = await supabase
    .from("conferences")
    .select("id")
    .eq("id", conferenceId)
    .eq("church_id", appUserResult.data.church_id)
    .maybeSingle();

  if (conferenceResult.error || !conferenceResult.data) {
    return { error: NextResponse.json({ error: "Conference not found for this ministry." }, { status: 404 }) };
  }

  return {
    supabase,
    conferenceId,
  };
}

function parseEventDateTime(startsAtIso: string, endsAtIso: string): { startsAt: string; endsAt: string } {
  const startsAt = new Date(startsAtIso);
  const endsAt = new Date(endsAtIso);

  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime())) {
    throw new Error("Invalid event timestamps.");
  }

  if (endsAt.getTime() <= startsAt.getTime()) {
    throw new Error("End time must be after start time.");
  }

  return {
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
  };
}

async function loadScheduleData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conferenceId: string,
  rangeStartIso: string,
  rangeEndIsoExclusive: string,
) {
  const eventsResult = await supabase
    .from("master_calendar_events")
    .select("id, title, starts_at, ends_at, worship_lead, preacher_name")
    .eq("conference_id", conferenceId)
    .gte("starts_at", rangeStartIso)
    .lt("starts_at", rangeEndIsoExclusive)
    .order("starts_at", { ascending: true });

  if (eventsResult.error) {
    throw new Error(eventsResult.error.message);
  }

  const preachersResult = await supabase
    .from("conference_preachers")
    .select("id, church_preachers(full_name)")
    .eq("conference_id", conferenceId)
    .order("created_at", { ascending: true });

  if (preachersResult.error) {
    throw new Error(preachersResult.error.message);
  }

  const preachers = (preachersResult.data ?? [])
    .map((row) => {
      const relation = Array.isArray(row.church_preachers) ? row.church_preachers[0] : row.church_preachers;
      return relation?.full_name ? { id: row.id as string, full_name: relation.full_name } : null;
    })
    .filter(Boolean);

  return {
    items: eventsResult.data ?? [],
    preachers,
  };
}

export async function GET(request: NextRequest) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { searchParams } = new URL(request.url);
  const rangeStartIso = searchParams.get("start");
  const rangeEndIsoExclusive = searchParams.get("end");

  if (!rangeStartIso || !rangeEndIsoExclusive) {
    return NextResponse.json({ error: "start and end are required." }, { status: 400 });
  }

  try {
    const payload = await loadScheduleData(
      context.supabase,
      context.conferenceId,
      rangeStartIso,
      rangeEndIsoExclusive,
    );
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load schedules.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as SchedulesBody;

  try {
    if (body.action === "create-event") {
      if (!body.startsAtIso || !body.endsAtIso || !body.title || body.title.trim().length === 0) {
        return NextResponse.json({ error: "startsAtIso, endsAtIso, and title are required." }, { status: 400 });
      }

      const { startsAt, endsAt } = parseEventDateTime(body.startsAtIso, body.endsAtIso);

      const insertResult = await context.supabase.from("master_calendar_events").insert({
        conference_id: context.conferenceId,
        title: body.title.trim(),
        starts_at: startsAt,
        ends_at: endsAt,
        worship_lead: body.assignMusicTeam ? body.musicTeamName ?? "Music team (coming soon)" : null,
        preacher_name: body.assignPreacher ? body.preacherName ?? null : null,
      });

      if (insertResult.error) {
        return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "update-event") {
      if (!body.eventId || !body.startsAtIso || !body.endsAtIso || !body.title || body.title.trim().length === 0) {
        return NextResponse.json({ error: "eventId, startsAtIso, endsAtIso, and title are required." }, { status: 400 });
      }

      const { startsAt, endsAt } = parseEventDateTime(body.startsAtIso, body.endsAtIso);

      const updateResult = await context.supabase
        .from("master_calendar_events")
        .update({
          title: body.title.trim(),
          starts_at: startsAt,
          ends_at: endsAt,
          worship_lead: body.assignMusicTeam ? body.musicTeamName ?? "Music team (coming soon)" : null,
          preacher_name: body.assignPreacher ? body.preacherName ?? null : null,
        })
        .eq("id", body.eventId)
        .eq("conference_id", context.conferenceId);

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "delete-event") {
      if (!body.eventId) {
        return NextResponse.json({ error: "eventId is required." }, { status: 400 });
      }

      const deleteResult = await context.supabase
        .from("master_calendar_events")
        .delete()
        .eq("id", body.eventId)
        .eq("conference_id", context.conferenceId);

      if (deleteResult.error) {
        return NextResponse.json({ error: deleteResult.error.message }, { status: 400 });
      }
    }

    const { searchParams } = new URL(request.url);
    const rangeStartIso = searchParams.get("start");
    const rangeEndIsoExclusive = searchParams.get("end");

    if (!rangeStartIso || !rangeEndIsoExclusive) {
      return NextResponse.json({ error: "start and end are required." }, { status: 400 });
    }

    const payload = await loadScheduleData(
      context.supabase,
      context.conferenceId,
      rangeStartIso,
      rangeEndIsoExclusive,
    );

    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
