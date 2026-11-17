import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AssignExistingBody = {
  action: "assign-existing";
  churchPreacherId?: string;
  roleName?: string;
  notes?: string;
};

type CreateAndAssignBody = {
  action: "create-and-assign";
  fullName?: string;
  email?: string;
  phone?: string;
  ministryName?: string;
  biography?: string;
  roleName?: string;
  notes?: string;
};

type RemoveAssignmentBody = {
  action: "remove-assignment";
  assignmentId?: string;
};

type CreateBody = AssignExistingBody | CreateAndAssignBody | RemoveAssignmentBody;

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

async function resolveChurchAndConference(request: NextRequest) {
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

async function loadPreachers(supabase: ReturnType<typeof createServerSupabaseClient>, churchId: string, conferenceId: string) {
  const rosterResult = await supabase
    .from("church_preachers")
    .select("id, full_name, email, phone, ministry_name")
    .eq("church_id", churchId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (rosterResult.error) {
    throw new Error(rosterResult.error.message);
  }

  const assignedResult = await supabase
    .from("conference_preachers")
    .select("id, church_preacher_id, role_name, notes, display_order, church_preachers(id, full_name, email, phone, ministry_name)")
    .eq("conference_id", conferenceId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignedResult.error) {
    throw new Error(assignedResult.error.message);
  }

  return {
    roster: rosterResult.data,
    assigned: assignedResult.data,
  };
}

export async function GET(request: NextRequest) {
  const context = await resolveChurchAndConference(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const payload = await loadPreachers(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load preachers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveChurchAndConference(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as CreateBody;

  try {
    if (body.action === "assign-existing") {
      if (!body.churchPreacherId) {
        return NextResponse.json({ error: "churchPreacherId is required." }, { status: 400 });
      }

      const preacherCheck = await context.supabase
        .from("church_preachers")
        .select("id")
        .eq("id", body.churchPreacherId)
        .eq("church_id", context.churchId)
        .maybeSingle();

      if (preacherCheck.error || !preacherCheck.data) {
        return NextResponse.json({ error: "Preacher not found in this church roster." }, { status: 404 });
      }

      const assignResult = await context.supabase
        .from("conference_preachers")
        .insert({
          conference_id: context.conferenceId,
          church_preacher_id: body.churchPreacherId,
          role_name: body.roleName?.trim() || "guest_preacher",
          notes: body.notes?.trim() || null,
        })
        .select("id")
        .maybeSingle();

      if (assignResult.error) {
        return NextResponse.json({ error: assignResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "create-and-assign") {
      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const createResult = await context.supabase
        .from("church_preachers")
        .insert({
          church_id: context.churchId,
          full_name: body.fullName.trim(),
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          ministry_name: body.ministryName?.trim() || null,
          biography: body.biography?.trim() || null,
          is_active: true,
        })
        .select("id")
        .single();

      if (createResult.error || !createResult.data) {
        return NextResponse.json({ error: createResult.error?.message ?? "Unable to create preacher." }, { status: 400 });
      }

      const assignResult = await context.supabase
        .from("conference_preachers")
        .insert({
          conference_id: context.conferenceId,
          church_preacher_id: createResult.data.id,
          role_name: body.roleName?.trim() || "guest_preacher",
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
        .from("conference_preachers")
        .delete()
        .eq("id", body.assignmentId)
        .eq("conference_id", context.conferenceId);

      if (removeResult.error) {
        return NextResponse.json({ error: removeResult.error.message }, { status: 400 });
      }
    }

    const payload = await loadPreachers(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save preacher.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
