import { NextRequest, NextResponse } from "next/server";

import { getAccessTokenFromCookies, getSelectedConferenceIdFromCookies } from "@/lib/auth-cookies";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type Department = "operations" | "preacher_logistics" | "worship" | "volunteer" | "bookstore" | "ticketing";
type TemplateMode = "existing" | "create-new";

type CreateTaskBody = {
  action: "create-task";
  title?: string;
  description?: string;
  dueAt?: string;
  assignedVolunteerId?: string;
  templateMode?: TemplateMode;
  templateId?: string;
  newTemplateName?: string;
};

type CreateFromTemplateBody = {
  action: "create-from-template";
  templateId?: string;
  dueAt?: string;
};

type CreateFromSavedTaskBody = {
  action: "create-from-saved-task";
  savedTaskId?: string;
  dueAt?: string;
  assignedVolunteerId?: string;
};

type BulkApplyTemplateBody = {
  action: "bulk-apply-template";
  taskIds?: string[];
  templateMode?: TemplateMode;
  templateId?: string;
  newTemplateName?: string;
};

type CreateTemplateBody = {
  action: "create-template";
  title?: string;
};

type TaskMutationBody =
  | CreateTaskBody
  | CreateFromTemplateBody
  | CreateFromSavedTaskBody
  | BulkApplyTemplateBody
  | CreateTemplateBody;

type TaskTemplateLink = {
  task_id: string;
  template_id: string;
};

const defaultDepartment: Department = "operations";

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

async function resolveTaskContext(request: NextRequest) {
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
    userId: userResult.data.user.id,
  };
}

async function loadTasksData(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conferenceId: string,
  churchId: string,
) {
  const [tasksResult, templatesResult, savedTasksResult] = await Promise.all([
    supabase
      .from("tasks")
      .select("id, title, description, department, status, due_at, created_at, assigned_conference_volunteer_id")
      .eq("conference_id", conferenceId)
      .order("created_at", { ascending: false }),
    supabase
      .from("church_task_templates")
      .select("id, title, description, department, default_due_offset_days")
      .eq("church_id", churchId)
      .eq("is_active", true)
      .order("title", { ascending: true }),
    supabase
      .from("church_saved_tasks")
      .select("id, title, description, department")
      .eq("church_id", churchId)
      .eq("is_active", true)
      .order("title", { ascending: true }),
  ]);

  if (tasksResult.error) {
    throw new Error(tasksResult.error.message);
  }

  if (templatesResult.error) {
    throw new Error(templatesResult.error.message);
  }

  if (savedTasksResult.error) {
    throw new Error(savedTasksResult.error.message);
  }

  const taskIds = (tasksResult.data ?? []).map((task) => task.id);
  let taskTemplateLinks: TaskTemplateLink[] = [];

  if (taskIds.length > 0) {
    const linksResult = await supabase
      .from("task_template_tasks")
      .select("task_id, template_id")
      .in("task_id", taskIds);

    if (linksResult.error) {
      throw new Error(linksResult.error.message);
    }

    taskTemplateLinks = linksResult.data ?? [];
  }

  return {
    items: tasksResult.data ?? [],
    templates: templatesResult.data ?? [],
    savedTasks: savedTasksResult.data ?? [],
    taskTemplateLinks,
  };
}

async function resolveAssignedVolunteerId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conferenceId: string,
  assignedVolunteerId?: string,
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

async function resolveTemplateId(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  churchId: string,
  mode?: TemplateMode,
  templateId?: string,
  newTemplateName?: string,
) {
  if (!mode) {
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
      department: defaultDepartment,
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

async function createConferenceTask(
  supabase: ReturnType<typeof createServerSupabaseClient>,
  conferenceId: string,
  userId: string,
  taskData: {
    title: string;
    description?: string | null;
    department?: Department;
    dueAt?: string | null;
    assignedVolunteerId?: string | null;
  },
) {
  const insertTaskResult = await supabase
    .from("tasks")
    .insert({
      conference_id: conferenceId,
      title: taskData.title,
      description: taskData.description ?? null,
      department: taskData.department ?? defaultDepartment,
      due_at: taskData.dueAt ?? null,
      assigned_conference_volunteer_id: taskData.assignedVolunteerId ?? null,
      created_by: userId,
    })
    .select("id")
    .single();

  if (insertTaskResult.error || !insertTaskResult.data) {
    throw new Error(insertTaskResult.error?.message ?? "Unable to create task.");
  }

  return insertTaskResult.data.id;
}

export async function GET(request: NextRequest) {
  const context = await resolveTaskContext(request);
  if ("error" in context) {
    return context.error;
  }

  try {
    const payload = await loadTasksData(context.supabase, context.conferenceId, context.churchId);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to load tasks.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const context = await resolveTaskContext(request);
  if ("error" in context) {
    return context.error;
  }

  const supabase = context.supabase;
  const body = (await request.json()) as TaskMutationBody;

  try {
    if (body.action === "create-from-template") {
      if (!body.templateId) {
        return NextResponse.json({ error: "templateId is required." }, { status: 400 });
      }

      const templateResult = await supabase
        .from("church_task_templates")
        .select("id, default_due_offset_days")
        .eq("id", body.templateId)
        .eq("church_id", context.churchId)
        .eq("is_active", true)
        .maybeSingle();

      if (templateResult.error || !templateResult.data) {
        return NextResponse.json({ error: "Template not found." }, { status: 404 });
      }

      const membersResult = await supabase
        .from("church_task_template_saved_tasks")
        .select("saved_task_id, church_saved_tasks(id, title, description, department)")
        .eq("template_id", templateResult.data.id)
        .order("created_at", { ascending: true });

      if (membersResult.error) {
        return NextResponse.json({ error: membersResult.error.message }, { status: 400 });
      }

      const members = (membersResult.data ?? []).map((row) => {
        const savedTask = Array.isArray(row.church_saved_tasks) ? row.church_saved_tasks[0] : row.church_saved_tasks;
        return savedTask ?? null;
      }).filter(Boolean) as Array<{ id: string; title: string; description: string | null; department: Department }>;

      if (members.length === 0) {
        return NextResponse.json({ error: "This template has no saved tasks." }, { status: 400 });
      }

      const explicitDueAt = body.dueAt?.trim() || null;
      let computedDueAt: string | null = explicitDueAt;
      if (!computedDueAt && typeof templateResult.data.default_due_offset_days === "number") {
        const nextDate = new Date();
        nextDate.setDate(nextDate.getDate() + templateResult.data.default_due_offset_days);
        computedDueAt = nextDate.toISOString();
      }

      for (const savedTask of members) {
        const createdTaskId = await createConferenceTask(supabase, context.conferenceId, context.userId, {
          title: savedTask.title,
          description: savedTask.description,
          department: savedTask.department,
          dueAt: computedDueAt,
        });

        const taskTemplateLinkResult = await supabase
          .from("task_template_tasks")
          .upsert(
            [{ task_id: createdTaskId, template_id: templateResult.data.id }],
            { onConflict: "task_id,template_id", ignoreDuplicates: true },
          );

        if (taskTemplateLinkResult.error) {
          return NextResponse.json({ error: taskTemplateLinkResult.error.message }, { status: 400 });
        }
      }
    }

    if (body.action === "create-from-saved-task") {
      if (!body.savedTaskId) {
        return NextResponse.json({ error: "savedTaskId is required." }, { status: 400 });
      }

      const savedTaskResult = await supabase
        .from("church_saved_tasks")
        .select("id, title, description, department")
        .eq("id", body.savedTaskId)
        .eq("church_id", context.churchId)
        .eq("is_active", true)
        .maybeSingle();

      if (savedTaskResult.error || !savedTaskResult.data) {
        return NextResponse.json({ error: "Saved task not found." }, { status: 404 });
      }

      const assignedVolunteerId = await resolveAssignedVolunteerId(
        supabase,
        context.conferenceId,
        body.assignedVolunteerId,
      );

      await createConferenceTask(supabase, context.conferenceId, context.userId, {
        title: savedTaskResult.data.title,
        description: savedTaskResult.data.description,
        department: savedTaskResult.data.department,
        dueAt: body.dueAt?.trim() || null,
        assignedVolunteerId,
      });
    }

    if (body.action === "create-task") {
      if (!body.title || body.title.trim().length === 0) {
        return NextResponse.json({ error: "Task title is required." }, { status: 400 });
      }

      const linkedTemplateId = await resolveTemplateId(
        supabase,
        context.churchId,
        body.templateMode,
        body.templateId,
        body.newTemplateName,
      );

      const assignedVolunteerId = await resolveAssignedVolunteerId(
        supabase,
        context.conferenceId,
        body.assignedVolunteerId,
      );

      const savedTaskInsertResult = await supabase
        .from("church_saved_tasks")
        .insert({
          church_id: context.churchId,
          title: body.title.trim(),
          description: body.description?.trim() || null,
          department: defaultDepartment,
          is_active: true,
        })
        .select("id")
        .single();

      if (savedTaskInsertResult.error || !savedTaskInsertResult.data) {
        return NextResponse.json({ error: savedTaskInsertResult.error?.message ?? "Unable to save task." }, { status: 400 });
      }

      const savedTaskId = savedTaskInsertResult.data.id;

      const createdTaskId = await createConferenceTask(supabase, context.conferenceId, context.userId, {
        title: body.title.trim(),
        description: body.description?.trim() || null,
        department: defaultDepartment,
        dueAt: body.dueAt?.trim() || null,
        assignedVolunteerId,
      });

      if (linkedTemplateId) {
        const taskTemplateLinkResult = await supabase
          .from("task_template_tasks")
          .upsert(
            [{ task_id: createdTaskId, template_id: linkedTemplateId }],
            { onConflict: "task_id,template_id", ignoreDuplicates: true },
          );

        if (taskTemplateLinkResult.error) {
          return NextResponse.json({ error: taskTemplateLinkResult.error.message }, { status: 400 });
        }

        const linkResult = await supabase
          .from("church_task_template_saved_tasks")
          .upsert(
            [{ template_id: linkedTemplateId, saved_task_id: savedTaskId }],
            { onConflict: "template_id,saved_task_id", ignoreDuplicates: true },
          );

        if (linkResult.error) {
          return NextResponse.json({ error: linkResult.error.message }, { status: 400 });
        }
      }
    }

    if (body.action === "bulk-apply-template") {
      if (!body.taskIds || body.taskIds.length === 0) {
        return NextResponse.json({ error: "At least one task must be selected." }, { status: 400 });
      }

      const linkedTemplateId = await resolveTemplateId(
        supabase,
        context.churchId,
        body.templateMode,
        body.templateId,
        body.newTemplateName,
      );

      if (!linkedTemplateId) {
        return NextResponse.json({ error: "Select or create a template first." }, { status: 400 });
      }

      const tasksResult = await supabase
        .from("tasks")
        .select("id, title, description, department")
        .eq("conference_id", context.conferenceId)
        .in("id", body.taskIds);

      if (tasksResult.error) {
        return NextResponse.json({ error: tasksResult.error.message }, { status: 400 });
      }

      const taskRows = tasksResult.data ?? [];
      if (taskRows.length === 0) {
        return NextResponse.json({ error: "No matching tasks found." }, { status: 404 });
      }

      const savedTasksResult = await supabase
        .from("church_saved_tasks")
        .select("id, title, description")
        .eq("church_id", context.churchId)
        .eq("is_active", true);

      if (savedTasksResult.error) {
        return NextResponse.json({ error: savedTasksResult.error.message }, { status: 400 });
      }

      const existingByKey = new Map<string, string>();
      for (const row of savedTasksResult.data ?? []) {
        const key = `${row.title.trim().toLowerCase()}|${(row.description ?? "").trim().toLowerCase()}`;
        existingByKey.set(key, row.id);
      }

      const savedTaskIdsToLink: string[] = [];

      for (const task of taskRows) {
        const key = `${task.title.trim().toLowerCase()}|${(task.description ?? "").trim().toLowerCase()}`;
        const existingId = existingByKey.get(key);

        if (existingId) {
          savedTaskIdsToLink.push(existingId);
          continue;
        }

        const createSavedResult = await supabase
          .from("church_saved_tasks")
          .insert({
            church_id: context.churchId,
            title: task.title,
            description: task.description,
            department: task.department,
            is_active: true,
          })
          .select("id")
          .single();

        if (createSavedResult.error || !createSavedResult.data) {
          return NextResponse.json({ error: createSavedResult.error?.message ?? "Unable to save task." }, { status: 400 });
        }

        existingByKey.set(key, createSavedResult.data.id);
        savedTaskIdsToLink.push(createSavedResult.data.id);
      }

      const links = savedTaskIdsToLink.map((savedTaskId) => ({ template_id: linkedTemplateId, saved_task_id: savedTaskId }));
      const linkResult = await supabase
        .from("church_task_template_saved_tasks")
        .upsert(links, { onConflict: "template_id,saved_task_id", ignoreDuplicates: true });

      if (linkResult.error) {
        return NextResponse.json({ error: linkResult.error.message }, { status: 400 });
      }

      const taskTemplateRows = taskRows.map((task) => ({ task_id: task.id, template_id: linkedTemplateId }));
      const taskTemplateLinkResult = await supabase
        .from("task_template_tasks")
        .upsert(taskTemplateRows, { onConflict: "task_id,template_id", ignoreDuplicates: true });

      if (taskTemplateLinkResult.error) {
        return NextResponse.json({ error: taskTemplateLinkResult.error.message }, { status: 400 });
      }
    }

    if (body.action === "create-template") {
      if (!body.title || body.title.trim().length === 0) {
        return NextResponse.json({ error: "Template title is required." }, { status: 400 });
      }

      const createTemplateResult = await supabase.from("church_task_templates").insert({
        church_id: context.churchId,
        title: body.title.trim(),
        description: null,
        department: defaultDepartment,
        default_due_offset_days: null,
        is_active: true,
      });

      if (createTemplateResult.error) {
        return NextResponse.json({ error: createTemplateResult.error.message }, { status: 400 });
      }
    }

    const payload = await loadTasksData(supabase, context.conferenceId, context.churchId);
    return NextResponse.json(payload, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save task.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
