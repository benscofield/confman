import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type TemplateMode = "none" | "existing" | "create-new";

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
    return { error: NextResponse.json({ error: "Conference not found for this church." }, { status: 404 }) };
  }

  return {
    supabase,
    conferenceId,
    churchId: appUserResult.data.church_id,
  };
}

async function resolveTemplateId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  churchId: string,
  mode?: TemplateMode,
  templateId?: string,
  newTemplateName?: string,
) {
  if (!mode || mode === "none") {
    return null;
  }

  if (mode === "existing") {
    if (!templateId) {
      throw new Error("templateId is required.");
    }

    const templateResult = await supabase
      .from("church_task_templates")
      .select("id")
      .eq("id", templateId)
      .eq("church_id", churchId)
      .eq("is_active", true)
      .maybeSingle();

    if (templateResult.error || !templateResult.data) {
      throw new Error("Template not found.");
    }

    return templateResult.data.id;
  }

  if (!newTemplateName || newTemplateName.trim().length === 0) {
    throw new Error("Template name is required.");
  }

  const createTemplateResult = await supabase
    .from("church_task_templates")
    .insert({
      church_id: churchId,
      title: newTemplateName.trim(),
      description: null,
      department: "operations",
      default_due_offset_days: null,
      is_active: true,
    })
    .select("id")
    .single();

  if (createTemplateResult.error || !createTemplateResult.data) {
    throw new Error(createTemplateResult.error?.message ?? "Unable to create template.");
  }

  return createTemplateResult.data.id;
}

async function resolveAssignedVolunteerId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conferenceId: string,
  assignedVolunteerId?: string | null,
) {
  if (!assignedVolunteerId || assignedVolunteerId.trim().length === 0) {
    return null;
  }

  const volunteerResult = await supabase
    .from("conference_volunteers")
    .select("id")
    .eq("id", assignedVolunteerId)
    .eq("conference_id", conferenceId)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    throw new Error("Assigned volunteer not found in this conference.");
  }

  return volunteerResult.data.id;
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { id } = await params;
  const body = (await request.json()) as {
    title?: string;
    description?: string | null;
    dueAt?: string | null;
    assignedVolunteerId?: string | null;
    templateMode?: TemplateMode;
    templateId?: string;
    newTemplateName?: string;
  };

  try {
    const assignedVolunteerId = await resolveAssignedVolunteerId(
      context.supabase,
      context.conferenceId,
      body.assignedVolunteerId,
    );

    const updates: Record<string, string | null> = {};
    if (typeof body.title !== "undefined") updates.title = body.title;
    if (typeof body.description !== "undefined") updates.description = body.description;
    if (typeof body.dueAt !== "undefined") updates.due_at = body.dueAt;
    if (typeof body.assignedVolunteerId !== "undefined") {
      updates.assigned_conference_volunteer_id = assignedVolunteerId;
    }
    updates.updated_at = new Date().toISOString();

    const { data, error } = await context.supabase
      .from("tasks")
      .update(updates)
      .eq("id", id)
      .eq("conference_id", context.conferenceId)
      .select("id, title, description, status, due_at, assigned_conference_volunteer_id")
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    if (typeof body.templateMode !== "undefined") {
      if (body.templateMode === "none") {
        const removeLinksResult = await context.supabase
          .from("task_template_tasks")
          .delete()
          .eq("task_id", id);

        if (removeLinksResult.error) {
          return NextResponse.json({ error: removeLinksResult.error.message }, { status: 400 });
        }
      } else {
        const resolvedTemplateId = await resolveTemplateId(
          context.supabase,
          context.churchId,
          body.templateMode,
          body.templateId,
          body.newTemplateName,
        );

        if (resolvedTemplateId) {
          const removeLinksResult = await context.supabase
            .from("task_template_tasks")
            .delete()
            .eq("task_id", id);

          if (removeLinksResult.error) {
            return NextResponse.json({ error: removeLinksResult.error.message }, { status: 400 });
          }

          const addLinkResult = await context.supabase
            .from("task_template_tasks")
            .insert({ task_id: id, template_id: resolvedTemplateId });

          if (addLinkResult.error) {
            return NextResponse.json({ error: addLinkResult.error.message }, { status: 400 });
          }
        }
      }
    }

    return NextResponse.json({ item: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to update task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const context = await resolveContext(request);
  if ("error" in context) {
    return context.error;
  }

  const { id } = await params;

  const { error } = await context.supabase
    .from("tasks")
    .delete()
    .eq("id", id)
    .eq("conference_id", context.conferenceId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}
