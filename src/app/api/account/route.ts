import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AddVolunteerBody = {
  action: "add-volunteer";
  fullName?: string;
  email?: string;
  phone?: string;
  defaultRoleName?: string;
  notes?: string;
};

type AddTaskTemplateBody = {
  action: "add-task-template";
  title?: string;
  description?: string;
  department?: "operations" | "preacher_logistics" | "worship" | "volunteer" | "bookstore" | "ticketing";
  defaultDueOffsetDays?: number | null;
};

type DeleteVolunteerBody = {
  action: "delete-volunteer";
  volunteerId?: string;
};

type UpdateVolunteerBody = {
  action: "update-volunteer";
  volunteerId?: string;
  fullName?: string;
  email?: string;
  phone?: string;
  defaultRoleName?: string;
  notes?: string;
};

type AddPreacherBody = {
  action: "add-preacher";
  fullName?: string;
  email?: string;
  phone?: string;
  ministryName?: string;
  biography?: string;
};

type AccountMutationBody = AddVolunteerBody | AddTaskTemplateBody | DeleteVolunteerBody | UpdateVolunteerBody | AddPreacherBody;

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

async function resolveAccountContext(request: NextRequest) {
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
    .select("id, full_name, email, phone, role, church_id, churches(id, name, email, phone, city, state_region, country)")
    .eq("auth_user_id", userResult.data.user.id)
    .maybeSingle();

  if (appUserResult.error || !appUserResult.data) {
    return { error: NextResponse.json({ error: "App user not found." }, { status: 404 }) };
  }

  return {
    supabase,
    appUser: appUserResult.data,
    churchId: appUserResult.data.church_id,
  };
}

async function loadOrganizationData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  appUser: {
    id: string;
    full_name: string;
    email: string;
    phone: string | null;
    role: string;
    church_id: string;
    churches:
      | {
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          city: string | null;
          state_region: string | null;
          country: string | null;
        }
      | Array<{
          id: string;
          name: string;
          email: string | null;
          phone: string | null;
          city: string | null;
          state_region: string | null;
          country: string | null;
        }>
      | null;
  },
) {
  const church = Array.isArray(appUser.churches) ? (appUser.churches[0] ?? null) : appUser.churches;

  const [volunteersResult, taskTemplatesResult, preachersResult] = await Promise.all([
    supabase
      .from("church_volunteers")
      .select("id, full_name, email, phone, default_role_name, notes, is_active")
      .eq("church_id", appUser.church_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
    supabase
      .from("church_task_templates")
      .select("id, title, description, department, default_due_offset_days, is_active")
      .eq("church_id", appUser.church_id)
      .eq("is_active", true)
      .order("title", { ascending: true }),
    supabase
      .from("church_preachers")
      .select("id, full_name, email, phone, ministry_name, is_active")
      .eq("church_id", appUser.church_id)
      .eq("is_active", true)
      .order("full_name", { ascending: true }),
  ]);

  if (volunteersResult.error) {
    throw new Error(volunteersResult.error.message);
  }

  if (taskTemplatesResult.error) {
    throw new Error(taskTemplatesResult.error.message);
  }

  if (preachersResult.error) {
    throw new Error(preachersResult.error.message);
  }

    return {
      account: {
        id: appUser.id,
        fullName: appUser.full_name,
        email: appUser.email,
        phone: appUser.phone,
        role: appUser.role,
      },
      church,
      savedVolunteers: volunteersResult.data,
      savedTaskTemplates: taskTemplatesResult.data,
      savedPreachers: preachersResult.data,
    };
  }
export async function GET(request: NextRequest) {
  const context = await resolveAccountContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const payload = await loadOrganizationData(context.supabase, context.appUser);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load account data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveAccountContext(request);
  if ("error" in context) {
    return context.error;
  }

  const body = (await request.json()) as AccountMutationBody;

  try {
    if (body.action === "add-volunteer") {
      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const result = await context.supabase.from("church_volunteers").insert({
        church_id: context.churchId,
        full_name: body.fullName.trim(),
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        default_role_name: body.defaultRoleName?.trim() || null,
        notes: body.notes?.trim() || null,
        is_active: true,
      });

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
      }
    }

    if (body.action === "delete-volunteer") {
      if (!body.volunteerId || body.volunteerId.trim().length === 0) {
        return NextResponse.json({ error: "volunteerId is required." }, { status: 400 });
      }

      const result = await context.supabase
        .from("church_volunteers")
        .update({ is_active: false })
        .eq("id", body.volunteerId)
        .eq("church_id", context.churchId);

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
      }
    }

    if (body.action === "update-volunteer") {
      if (!body.volunteerId || body.volunteerId.trim().length === 0) {
        return NextResponse.json({ error: "volunteerId is required." }, { status: 400 });
      }

      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const result = await context.supabase
        .from("church_volunteers")
        .update({
          full_name: body.fullName.trim(),
          email: body.email?.trim() || null,
          phone: body.phone?.trim() || null,
          default_role_name: body.defaultRoleName?.trim() || null,
          notes: body.notes?.trim() || null,
          updated_at: new Date().toISOString(),
        })
        .eq("id", body.volunteerId)
        .eq("church_id", context.churchId)
        .eq("is_active", true);

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
      }
    }

    if (body.action === "add-task-template") {
      if (!body.title || body.title.trim().length === 0 || !body.department) {
        return NextResponse.json({ error: "title and department are required." }, { status: 400 });
      }

      const result = await context.supabase.from("church_task_templates").insert({
        church_id: context.churchId,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        department: body.department,
        default_due_offset_days:
          typeof body.defaultDueOffsetDays === "number" && Number.isFinite(body.defaultDueOffsetDays)
            ? Math.round(body.defaultDueOffsetDays)
            : null,
        is_active: true,
      });

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
      }
    }

    if (body.action === "add-preacher") {
      if (!body.fullName || body.fullName.trim().length === 0) {
        return NextResponse.json({ error: "fullName is required." }, { status: 400 });
      }

      const result = await context.supabase.from("church_preachers").insert({
        church_id: context.churchId,
        full_name: body.fullName.trim(),
        email: body.email?.trim() || null,
        phone: body.phone?.trim() || null,
        ministry_name: body.ministryName?.trim() || null,
        biography: body.biography?.trim() || null,
        is_active: true,
      });

      if (result.error) {
        return NextResponse.json({ error: result.error.message }, { status: 400 });
      }
    }

    const payload = await loadOrganizationData(context.supabase, context.appUser);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save account data.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
