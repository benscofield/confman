import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type UpdateConferenceBody = {
  action: "update-conference";
  conferenceId?: string;
  name?: string;
  status?: string;
  startDate?: string;
  endDate?: string;
  locationName?: string | null;
  city?: string | null;
};

type DeleteConferenceBody = {
  action: "delete-conference";
  conferenceId?: string;
};

type ConferencesBody = UpdateConferenceBody | DeleteConferenceBody;

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
  if (!accessToken) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const supabase = createServerSupabaseClient();
  const userResult = await supabase.auth.getUser(accessToken);
  if (userResult.error || !userResult.data.user) {
    return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
  }

  const appUserResult = await supabase
    .from("users")
    .select("id, church_id")
    .eq("auth_user_id", userResult.data.user.id)
    .maybeSingle();

  if (appUserResult.error || !appUserResult.data) {
    return { error: NextResponse.json({ error: "Unable to resolve app user." }, { status: 404 }) };
  }

  return { supabase, churchId: appUserResult.data.church_id };
}

async function loadConferences(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  churchId: string,
  selectedConferenceId: string | null,
) {
  const conferencesResult = await supabase
    .from("conferences")
    .select("id, name, status, start_date, end_date, location_name, city")
    .eq("church_id", churchId)
    .order("start_date", { ascending: false });

  if (conferencesResult.error) {
    throw new Error(conferencesResult.error.message);
  }

  const selectedStillExists =
    selectedConferenceId && (conferencesResult.data ?? []).some((item) => item.id === selectedConferenceId)
      ? selectedConferenceId
      : null;

  return {
    items: conferencesResult.data,
    selectedConferenceId: selectedStillExists,
  };
}

export async function GET(request: NextRequest) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const selectedConferenceId = getSelectedConferenceIdFromCookies(request.cookies.getAll());
    const payload = await loadConferences(context.supabase, context.churchId, selectedConferenceId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load conferences.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as ConferencesBody;

  try {
    if (body.action === "update-conference") {
      if (
        !body.conferenceId ||
        !body.name ||
        !body.status ||
        !body.startDate ||
        !body.endDate ||
        body.name.trim().length === 0
      ) {
        return NextResponse.json(
          { error: "conferenceId, name, status, startDate, and endDate are required." },
          { status: 400 },
        );
      }

      const matchResult = await context.supabase
        .from("conferences")
        .select("id")
        .eq("id", body.conferenceId)
        .eq("church_id", context.churchId)
        .maybeSingle();

      if (matchResult.error || !matchResult.data) {
        return NextResponse.json({ error: "Conference not found." }, { status: 404 });
      }

      const updateResult = await context.supabase
        .from("conferences")
        .update({
          name: body.name.trim(),
          status: body.status,
          start_date: body.startDate,
          end_date: body.endDate,
          location_name: body.locationName?.trim() || null,
          city: body.city?.trim() || null,
        })
        .eq("id", body.conferenceId)
        .eq("church_id", context.churchId);

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "delete-conference") {
      if (!body.conferenceId) {
        return NextResponse.json({ error: "conferenceId is required." }, { status: 400 });
      }

      const deleteResult = await context.supabase
        .from("conferences")
        .delete()
        .eq("id", body.conferenceId)
        .eq("church_id", context.churchId);

      if (deleteResult.error) {
        return NextResponse.json({ error: deleteResult.error.message }, { status: 400 });
      }
    }

    const selectedConferenceId = getSelectedConferenceIdFromCookies(request.cookies.getAll());
    const payload = await loadConferences(context.supabase, context.churchId, selectedConferenceId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save conference.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}