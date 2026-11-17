import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AssignExistingBody = {
  action: "assign-existing";
  churchVolunteerId?: string;
  roleName?: string;
  notes?: string;
};

type CreateAndAssignBody = {
  action: "create-and-assign";
  fullName?: string;
  email?: string;
  phone?: string;
  roleName?: string;
  notes?: string;
};

type RemoveAssignmentBody = {
  action: "remove-assignment";
  assignmentId?: string;
};

type BackfillLegacyBody = {
  action: "backfill-legacy";
};

type VolunteerMutationBody = AssignExistingBody | CreateAndAssignBody | RemoveAssignmentBody | BackfillLegacyBody;

function normalizeVolunteerKey(person: { full_name?: string | null; email?: string | null; phone?: string | null }): string {
  const fullName = (person.full_name ?? "").trim().toLowerCase();
  const email = (person.email ?? "").trim().toLowerCase();
  const phone = (person.phone ?? "").replace(/\D/g, "");

  return `${fullName}|${email}|${phone}`;
}

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

async function resolveConferenceContext(request: NextRequest) {
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
    return { error: NextResponse.json({ error: "Conference not found for this church." }, { status: 404 }) };
  }

  return {
    supabase,
    churchId: appUserResult.data.church_id,
    conferenceId,
  };
}

async function loadConferenceVolunteers(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  churchId: string,
  conferenceId: string,
) {
  const [rosterResult, assignedResult] = await Promise.all([
    supabase
      .from("church_volunteers")
      .select("id, full_name, email, phone, default_role_name, notes")
      .eq("church_id", churchId)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("conference_volunteers")
      .select("id, full_name, email, phone, role_name, notes")
      .eq("conference_id", conferenceId)
      .order("full_name", { ascending: true }),
  ]);

  if (rosterResult.error) {
    throw new Error(rosterResult.error.message);
  }

  if (assignedResult.error) {
    throw new Error(assignedResult.error.message);
  }

  return {
    roster: rosterResult.data ?? [],
    assigned: assignedResult.data ?? [],
  };
}

export async function GET(request: NextRequest) {
  const context = await resolveConferenceContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const payload = await loadConferenceVolunteers(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load volunteers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveConferenceContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as VolunteerMutationBody;

  try {
    if (body.action === "backfill-legacy") {
      const [savedVolunteersResult, assignedResult] = await Promise.all([
        context.supabase
          .from("church_volunteers")
          .select("id, full_name, email, phone, default_role_name, notes")
          .eq("church_id", context.churchId)
          .eq("is_active", true),
        context.supabase
          .from("conference_volunteers")
          .select("id, full_name, email, phone")
          .eq("conference_id", context.conferenceId),
      ]);

      if (savedVolunteersResult.error) {
        return NextResponse.json({ error: savedVolunteersResult.error.message }, { status: 400 });
      }

      if (assignedResult.error) {
        return NextResponse.json({ error: assignedResult.error.message }, { status: 400 });
      }

      const assignedKeys = new Set((assignedResult.data ?? []).map((row) => normalizeVolunteerKey(row)));
      const rowsToInsert = (savedVolunteersResult.data ?? [])
        .filter((row) => row.full_name && row.full_name.trim().length > 0)
        .filter((row) => !assignedKeys.has(normalizeVolunteerKey(row)))
        .map((row) => ({
          conference_id: context.conferenceId,
          full_name: row.full_name,
          email: row.email ?? null,
          phone: row.phone ?? null,
          role_name: row.default_role_name ?? "Volunteer",
          notes: row.notes ?? null,
        }));

      if (rowsToInsert.length > 0) {
        const insertResult = await context.supabase.from("conference_volunteers").insert(rowsToInsert);
        if (insertResult.error) {
          return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
        }
      }
    }

    if (body.action === "assign-existing") {
      if (!body.churchVolunteerId) {
        return NextResponse.json({ error: "churchVolunteerId is required." }, { status: 400 });
      }

      const savedVolunteerResult = await context.supabase
        .from("church_volunteers")
        .select("id, full_name, email, phone, default_role_name")
        .eq("id", body.churchVolunteerId)
        .eq("church_id", context.churchId)
        .eq("is_active", true)
        .maybeSingle();

      if (savedVolunteerResult.error || !savedVolunteerResult.data) {
        return NextResponse.json({ error: "Volunteer not found in this church roster." }, { status: 404 });
      }

      const existingAssignmentResult = await context.supabase
        .from("conference_volunteers")
        .select("id, full_name, email, phone")
        .eq("conference_id", context.conferenceId);

      if (existingAssignmentResult.error) {
        return NextResponse.json({ error: existingAssignmentResult.error.message }, { status: 400 });
      }

      const existingKeys = new Set((existingAssignmentResult.data ?? []).map((row) => normalizeVolunteerKey(row)));
      const selectedKey = normalizeVolunteerKey(savedVolunteerResult.data);
      if (existingKeys.has(selectedKey)) {
        const payload = await loadConferenceVolunteers(context.supabase, context.churchId, context.conferenceId);
        return NextResponse.json(payload, { status: 200 });
      }

      const insertResult = await context.supabase
        .from("conference_volunteers")
        .insert({
          conference_id: context.conferenceId,
          full_name: savedVolunteerResult.data.full_name,
          email: savedVolunteerResult.data.email ?? null,
          phone: savedVolunteerResult.data.phone ?? null,
          role_name: body.roleName?.trim() || savedVolunteerResult.data.default_role_name || "Volunteer",
          notes: body.notes?.trim() || null,
        })
        .select("id")
        .maybeSingle();

      if (insertResult.error) {
        return NextResponse.json({ error: insertResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "create-and-assign") {
      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const createSavedResult = await context.supabase
        .from("church_volunteers")
        .insert({
          church_id: context.churchId,
          full_name: body.fullName.trim(),
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          default_role_name: body.roleName?.trim() || null,
          notes: body.notes?.trim() || null,
          is_active: true,
        })
        .select("id, full_name, email, phone, default_role_name")
        .single();

      if (createSavedResult.error || !createSavedResult.data) {
        return NextResponse.json({ error: createSavedResult.error?.message ?? "Unable to create volunteer." }, { status: 400 });
      }

      const assignResult = await context.supabase
        .from("conference_volunteers")
        .insert({
          conference_id: context.conferenceId,
          full_name: createSavedResult.data.full_name,
          email: createSavedResult.data.email ?? null,
          phone: createSavedResult.data.phone ?? null,
          role_name: body.roleName?.trim() || createSavedResult.data.default_role_name || "Volunteer",
          notes: body.notes?.trim() || null,
        })
        .select("id")
        .maybeSingle();

      if (assignResult.error) {
        return NextResponse.json({ error: assignResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "remove-assignment") {
      if (!body.assignmentId) {
        return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
      }

      const removeResult = await context.supabase
        .from("conference_volunteers")
        .delete()
        .eq("id", body.assignmentId)
        .eq("conference_id", context.conferenceId);

      if (removeResult.error) {
        return NextResponse.json({ error: removeResult.error.message }, { status: 400 });
      }
    }

    const payload = await loadConferenceVolunteers(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save volunteer.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
