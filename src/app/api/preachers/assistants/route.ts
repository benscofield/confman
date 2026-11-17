import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type CreateAndAssignBody = {
  action: "create-and-assign";
  fullName?: string;
  email?: string;
  phone?: string;
  notes?: string;
};

type AssignExistingBody = {
  action: "assign-existing";
  churchPersonalAssistantId?: string;
  notes?: string;
};

type RemoveAssignmentBody = {
  action: "remove-assignment";
  assignmentId?: string;
};

type UpdateAssignmentBody = {
  action: "update-assignment";
  assignmentId?: string;
  notes?: string;
};

type AssistantMutationBody = CreateAndAssignBody | AssignExistingBody | RemoveAssignmentBody | UpdateAssignmentBody;

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

async function loadConferenceAssistants(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  churchId: string,
  conferenceId: string,
) {
  const assignedResult = await supabase
    .from("conference_personal_assistants")
    .select(
      "id, role_name, notes, display_order, created_at, church_personal_assistant_id, church_personal_assistants(id, full_name, email, phone)",
    )
    .eq("conference_id", conferenceId)
    .order("display_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (assignedResult.error) {
    throw new Error(assignedResult.error.message);
  }

  const rosterResult = await supabase
    .from("church_personal_assistants")
    .select("id, full_name, email, phone")
    .eq("church_id", churchId)
    .eq("is_active", true)
    .order("full_name", { ascending: true });

  if (rosterResult.error) {
    throw new Error(rosterResult.error.message);
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
    const payload = await loadConferenceAssistants(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load assistants.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveConferenceContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as AssistantMutationBody;

  try {
    if (body.action === "assign-existing") {
      if (!body.churchPersonalAssistantId) {
        return NextResponse.json({ error: "churchPersonalAssistantId is required." }, { status: 400 });
      }

      const assistantCheck = await context.supabase
        .from("church_personal_assistants")
        .select("id")
        .eq("id", body.churchPersonalAssistantId)
        .eq("church_id", context.churchId)
        .eq("is_active", true)
        .maybeSingle();

      if (assistantCheck.error || !assistantCheck.data) {
        return NextResponse.json({ error: "Personal assistant not found in this church roster." }, { status: 404 });
      }

      const existingAssignment = await context.supabase
        .from("conference_personal_assistants")
        .select("id")
        .eq("conference_id", context.conferenceId)
        .eq("church_personal_assistant_id", body.churchPersonalAssistantId)
        .maybeSingle();

      if (existingAssignment.error) {
        return NextResponse.json({ error: existingAssignment.error.message }, { status: 400 });
      }

      if (!existingAssignment.data) {
        const assignResult = await context.supabase
          .from("conference_personal_assistants")
          .insert({
            conference_id: context.conferenceId,
            church_personal_assistant_id: body.churchPersonalAssistantId,
            role_name: "Personal Assistant",
            notes: body.notes?.trim() || null,
          })
          .select("id")
          .maybeSingle();

        if (assignResult.error) {
          return NextResponse.json({ error: assignResult.error.message }, { status: 400 });
        }
      }
    }

    if (body.action === "create-and-assign") {
      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const createSavedResult = await context.supabase
        .from("church_personal_assistants")
        .insert({
          church_id: context.churchId,
          full_name: body.fullName.trim(),
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          notes: body.notes?.trim() || null,
          is_active: true,
        })
        .select("id")
        .single();

      if (createSavedResult.error || !createSavedResult.data) {
        return NextResponse.json(
          { error: createSavedResult.error?.message ?? "Unable to create personal assistant." },
          { status: 400 },
        );
      }

      const assignResult = await context.supabase
        .from("conference_personal_assistants")
        .insert({
          conference_id: context.conferenceId,
          church_personal_assistant_id: createSavedResult.data.id,
          role_name: "Personal Assistant",
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
        .from("conference_personal_assistants")
        .delete()
        .eq("id", body.assignmentId)
        .eq("conference_id", context.conferenceId);

      if (removeResult.error) {
        return NextResponse.json({ error: removeResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "update-assignment") {
      if (!body.assignmentId) {
        return NextResponse.json({ error: "assignmentId is required." }, { status: 400 });
      }

      const updateResult = await context.supabase
        .from("conference_personal_assistants")
        .update({
          notes: body.notes?.trim() || null,
        })
        .eq("id", body.assignmentId)
        .eq("conference_id", context.conferenceId);

      if (updateResult.error) {
        return NextResponse.json({ error: updateResult.error.message }, { status: 400 });
      }
    }

    const payload = await loadConferenceAssistants(context.supabase, context.churchId, context.conferenceId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save assistant.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
