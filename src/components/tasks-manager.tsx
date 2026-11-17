"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type TaskStatus = "pending" | "assigned" | "notified" | "acknowledged" | "completed" | "flagged";

type TaskItem = {
  id: string;
  title: string;
  description: string | null;
  status: TaskStatus;
  due_at: string | null;
  created_at: string;
  assigned_conference_volunteer_id: string | null;
};

type TaskTemplate = {
  id: string;
  title: string;
  description: string | null;
  default_due_offset_days: number | null;
};

type SavedTask = {
  id: string;
  title: string;
  description: string | null;
};

type ConferenceVolunteer = {
  id: string;
  full_name: string;
};

type TaskTemplateLink = {
  task_id: string;
  template_id: string;
};

type TasksPayload = {
  items: TaskItem[];
  templates: TaskTemplate[];
  savedTasks: SavedTask[];
  volunteers: ConferenceVolunteer[];
  taskTemplateLinks: TaskTemplateLink[];
  error?: string;
};

type ConferenceVolunteersPayload = {
  assigned?: Array<{ id: string; full_name: string }>;
  error?: string;
};

const CREATE_NEW_TEMPLATE_OPTION = "__create_new_template__";

function formatDate(value: string | null): string {
  if (!value) {
    return "No work date";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "No work date";
  }

  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

function toIsoDateTime(value: string): string | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return undefined;
  }

  return parsed.toISOString();
}

function toLocalInputDateTime(value: string | null): string {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offset = date.getTimezoneOffset();
  const local = new Date(date.getTime() - offset * 60_000);
  return local.toISOString().slice(0, 16);
}

export function TasksManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [tasks, setTasks] = useState<TaskItem[]>([]);
  const [templates, setTemplates] = useState<TaskTemplate[]>([]);
  const [savedTasks, setSavedTasks] = useState<SavedTask[]>([]);
  const [volunteers, setVolunteers] = useState<ConferenceVolunteer[]>([]);
  const [taskTemplateLinks, setTaskTemplateLinks] = useState<TaskTemplateLink[]>([]);
  const [selectedTaskIds, setSelectedTaskIds] = useState<Set<string>>(new Set());

  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [selectedSavedTaskId, setSelectedSavedTaskId] = useState("");
  const [existingDueAt, setExistingDueAt] = useState("");

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueAt, setDueAt] = useState("");
  const [newTaskTemplateSelection, setNewTaskTemplateSelection] = useState("");
  const [newTaskTemplateName, setNewTaskTemplateName] = useState("");
  const [newTaskAssignedVolunteerId, setNewTaskAssignedVolunteerId] = useState("");

  const [bulkTemplateSelection, setBulkTemplateSelection] = useState("");
  const [bulkTemplateName, setBulkTemplateName] = useState("");

  const [editTaskId, setEditTaskId] = useState("");
  const [editTitle, setEditTitle] = useState("");
  const [editDescription, setEditDescription] = useState("");
  const [editDueAt, setEditDueAt] = useState("");
  const [editTemplateSelection, setEditTemplateSelection] = useState("");
  const [editTemplateName, setEditTemplateName] = useState("");
  const [editAssignedVolunteerId, setEditAssignedVolunteerId] = useState("");

  const templateIdByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    for (const link of taskTemplateLinks) {
      if (!map.has(link.task_id)) {
        map.set(link.task_id, link.template_id);
      }
    }
    return map;
  }, [taskTemplateLinks]);

  const volunteerNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const volunteer of volunteers) {
      map.set(volunteer.id, volunteer.full_name);
    }
    return map;
  }, [volunteers]);

  const allTaskIds = useMemo(() => tasks.map((task) => task.id), [tasks]);
  const allChecked = allTaskIds.length > 0 && allTaskIds.every((id) => selectedTaskIds.has(id));

  const resetModal = () => {
    setMode("existing");
    setSelectedTemplateId("");
    setSelectedSavedTaskId("");
    setExistingDueAt("");
    setTitle("");
    setDescription("");
    setDueAt("");
    setNewTaskTemplateSelection("");
    setNewTaskTemplateName("");
    setNewTaskAssignedVolunteerId("");
  };

  const closeModal = () => {
    setShowModal(false);
    resetModal();
    setErrorMessage(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditTaskId("");
    setEditTitle("");
    setEditDescription("");
    setEditDueAt("");
    setEditTemplateSelection("");
    setEditTemplateName("");
    setEditAssignedVolunteerId("");
    setErrorMessage(null);
  };

  const fetchConferenceAssignedVolunteers = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/volunteers", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (!response.ok) {
        setVolunteers([]);
        return;
      }

      const payload = (await response.json()) as ConferenceVolunteersPayload;
      const assignedVolunteers = (payload.assigned ?? []).map((row) => ({
        id: row.id,
        full_name: row.full_name,
      }));
      setVolunteers(assignedVolunteers);
    } catch {
      setVolunteers([]);
    }
  };

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/tasks", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const payload = (await response.json()) as TasksPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load tasks.");
      }

      setTasks(payload.items ?? []);
      setTemplates(payload.templates ?? []);
      setSavedTasks(payload.savedTasks ?? []);
      setTaskTemplateLinks(payload.taskTemplateLinks ?? []);
      setSelectedTaskIds((previous) =>
        new Set(Array.from(previous).filter((id) => (payload.items ?? []).some((item) => item.id === id))),
      );

      await fetchConferenceAssignedVolunteers();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load tasks.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const postTaskAction = async (body: Record<string, unknown>) => {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch("/api/tasks", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as TasksPayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save task.");
    }

    setTasks(payload.items ?? []);
    setTemplates(payload.templates ?? []);
    setSavedTasks(payload.savedTasks ?? []);
    setTaskTemplateLinks(payload.taskTemplateLinks ?? []);
    await fetchConferenceAssignedVolunteers();
  };

  const handleToggleTask = (taskId: string) => {
    setSelectedTaskIds((previous) => {
      const next = new Set(previous);
      if (next.has(taskId)) {
        next.delete(taskId);
      } else {
        next.add(taskId);
      }
      return next;
    });
  };

  const handleCheckAll = () => {
    setSelectedTaskIds(new Set(allTaskIds));
  };

  const handleUncheckAll = () => {
    setSelectedTaskIds(new Set());
  };

  const handleBulkApplyTemplate = async () => {
    if (selectedTaskIds.size === 0) {
      setErrorMessage("Select at least one task first.");
      return;
    }

    if (!bulkTemplateSelection) {
      setErrorMessage("Select a template first.");
      return;
    }

    if (bulkTemplateSelection === CREATE_NEW_TEMPLATE_OPTION && bulkTemplateName.trim().length === 0) {
      setErrorMessage("Template name is required when creating a new template.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await postTaskAction({
        action: "bulk-apply-template",
        taskIds: Array.from(selectedTaskIds),
        templateMode: bulkTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? "create-new" : "existing",
        templateId: bulkTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? undefined : bulkTemplateSelection,
        newTemplateName: bulkTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? bulkTemplateName : undefined,
      });

      setBulkTemplateSelection("");
      setBulkTemplateName("");
      setSelectedTaskIds(new Set());
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to apply template.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddFromTemplate = async () => {
    if (!selectedTemplateId) {
      setErrorMessage("Select a saved template first.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await postTaskAction({
        action: "create-from-template",
        templateId: selectedTemplateId,
        dueAt: toIsoDateTime(existingDueAt),
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add tasks from template.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSavedTask = async () => {
    if (!selectedSavedTaskId) {
      setErrorMessage("Select a saved task first.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await postTaskAction({
        action: "create-from-saved-task",
        savedTaskId: selectedSavedTaskId,
        dueAt: toIsoDateTime(existingDueAt),
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add saved task.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddNewTask = async () => {
    if (title.trim().length === 0) {
      setErrorMessage("Task title is required.");
      return;
    }

    if (
      newTaskTemplateSelection === CREATE_NEW_TEMPLATE_OPTION &&
      newTaskTemplateName.trim().length === 0
    ) {
      setErrorMessage("Template name is required when creating a new template.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await postTaskAction({
        action: "create-task",
        title,
        description,
        dueAt: toIsoDateTime(dueAt),
        assignedVolunteerId: newTaskAssignedVolunteerId || undefined,
        templateMode: newTaskTemplateSelection
          ? newTaskTemplateSelection === CREATE_NEW_TEMPLATE_OPTION
            ? "create-new"
            : "existing"
          : undefined,
        templateId:
          newTaskTemplateSelection && newTaskTemplateSelection !== CREATE_NEW_TEMPLATE_OPTION
            ? newTaskTemplateSelection
            : undefined,
        newTemplateName:
          newTaskTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? newTaskTemplateName : undefined,
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add task.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditModal = (task: TaskItem) => {
    setEditTaskId(task.id);
    setEditTitle(task.title);
    setEditDescription(task.description ?? "");
    setEditDueAt(toLocalInputDateTime(task.due_at));
    setEditTemplateSelection(templateIdByTaskId.get(task.id) ?? "");
    setEditTemplateName("");
    setEditAssignedVolunteerId(task.assigned_conference_volunteer_id ?? "");
    setShowEditModal(true);
    setErrorMessage(null);
    void fetchConferenceAssignedVolunteers();
  };

  const handleSaveTaskEdit = async () => {
    if (!editTaskId) {
      return;
    }

    if (editTitle.trim().length === 0) {
      setErrorMessage("Task title is required.");
      return;
    }

    if (editTemplateSelection === CREATE_NEW_TEMPLATE_OPTION && editTemplateName.trim().length === 0) {
      setErrorMessage("Template name is required when creating a new template.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(`/api/tasks/${editTaskId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          dueAt: editDueAt ? toIsoDateTime(editDueAt) ?? null : null,
          assignedVolunteerId: editAssignedVolunteerId || null,
          templateMode: editTemplateSelection
            ? editTemplateSelection === CREATE_NEW_TEMPLATE_OPTION
              ? "create-new"
              : "existing"
            : "none",
          templateId:
            editTemplateSelection && editTemplateSelection !== CREATE_NEW_TEMPLATE_OPTION
              ? editTemplateSelection
              : undefined,
          newTemplateName:
            editTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? editTemplateName : undefined,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to update task.");
      }

      await fetchData();
      closeEditModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update task.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(`/api/tasks/${taskId}`, {
        method: "DELETE",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (!response.ok && response.status !== 204) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Unable to delete task.");
      }

      await fetchData();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete task.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-7 rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">Conference tasks</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-forest">Task Tracking</h2>
        </div>
        <Button
          onClick={() => {
            setShowModal(true);
            void fetchConferenceAssignedVolunteers();
          }}
        >
          Add task
        </Button>
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3 rounded-xl border border-brand-sage/45 bg-white p-4">
        <Button type="button" variant="outline" size="sm" onClick={handleCheckAll} disabled={tasks.length === 0 || allChecked}>
          Check all
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={handleUncheckAll} disabled={selectedTaskIds.size === 0}>
          Uncheck all
        </Button>

        <div className="min-w-[16rem] flex-1">
          <label className="block space-y-2">
            <span className="text-sm font-medium text-brand-forest">Add selected tasks to template</span>
            <select
              value={bulkTemplateSelection}
              onChange={(event) => setBulkTemplateSelection(event.target.value)}
              disabled={selectedTaskIds.size === 0}
              className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none disabled:cursor-not-allowed disabled:bg-brand-mist/40 focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
            >
              <option value="">Select a template</option>
              <option value={CREATE_NEW_TEMPLATE_OPTION}>Create new</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </label>
        </div>

        {bulkTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? (
          <label className="min-w-[16rem] flex-1 space-y-2">
            <span className="text-sm font-medium text-brand-forest">Template name</span>
            <input
              value={bulkTemplateName}
              onChange={(event) => setBulkTemplateName(event.target.value)}
              className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
              placeholder="Follow-up weekend"
            />
          </label>
        ) : null}

        <Button
          type="button"
          onClick={() => void handleBulkApplyTemplate()}
          disabled={saving || selectedTaskIds.size === 0 || !bulkTemplateSelection}
        >
          {saving ? "Saving..." : "Apply template"}
        </Button>
      </div>

      {loading ? <p className="mt-5 text-sm text-brand-forest/80">Loading tasks...</p> : null}

      {errorMessage ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {!loading && tasks.length === 0 ? (
        <p className="mt-5 rounded-xl border border-brand-sage/45 bg-brand-mist/60 px-4 py-3 text-sm text-brand-forest/85">
          No tasks found yet.
        </p>
      ) : null}

      {!loading && tasks.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-brand-sage/55">
          <table className="min-w-full border-collapse bg-white text-sm text-brand-forest">
            <thead className="bg-brand-mist/70 text-left text-xs uppercase tracking-[0.18em] text-brand-slate">
              <tr>
                <th className="w-14 px-4 py-3 text-center">Select</th>
                <th className="px-4 py-3">Title</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Work date</th>
                <th className="px-4 py-3">Volunteer</th>
                <th className="px-4 py-3">Description</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {tasks.map((task) => (
                <tr key={task.id} className="border-t border-brand-sage/40">
                  <td className="px-4 py-3 text-center align-top">
                    <input
                      type="checkbox"
                      checked={selectedTaskIds.has(task.id)}
                      onChange={() => handleToggleTask(task.id)}
                      className="h-4 w-4 rounded border-brand-sage/70 text-brand-olive focus:ring-brand-olive"
                    />
                  </td>
                  <td className="px-4 py-3 align-top font-medium">{task.title}</td>
                  <td className="px-4 py-3 align-top capitalize">{task.status}</td>
                  <td className="px-4 py-3 align-top">{formatDate(task.due_at)}</td>
                  <td className="px-4 py-3 align-top">
                    {task.assigned_conference_volunteer_id
                      ? volunteerNameById.get(task.assigned_conference_volunteer_id) ?? "Unknown"
                      : "None"}
                  </td>
                  <td className="px-4 py-3 align-top">{task.description ?? "-"}</td>
                  <td className="px-4 py-3 text-right align-top">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 px-0"
                        title="Edit task"
                        aria-label="Edit task"
                        disabled={saving}
                        onClick={() => {
                          handleOpenEditModal(task);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                        title="Delete task"
                        aria-label="Delete task"
                        disabled={saving}
                        onClick={() => {
                          void handleDeleteTask(task.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeModal}>
          <div
            className="mx-auto my-8 max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Add task</h3>
              <Button variant="ghost" size="sm" onClick={closeModal}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-2 rounded-xl border border-brand-sage/45 p-1">
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "existing" ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
                }`}
                onClick={() => setMode("existing")}
              >
                Select from saved tasks
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "new" ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
                }`}
                onClick={() => setMode("new")}
              >
                Add new task
              </button>
            </div>

            {mode === "existing" ? (
              <div className="mt-4 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Saved templates</span>
                  <select
                    value={selectedTemplateId}
                    onChange={(event) => setSelectedTemplateId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a template</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </label>

                <Button onClick={() => void handleAddFromTemplate()} disabled={saving || templates.length === 0 || !selectedTemplateId}>
                  {saving ? "Saving..." : "Add template tasks"}
                </Button>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Saved individual tasks</span>
                  <select
                    value={selectedSavedTaskId}
                    onChange={(event) => setSelectedSavedTaskId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a saved task</option>
                    {savedTasks.map((savedTask) => (
                      <option key={savedTask.id} value={savedTask.id}>
                        {savedTask.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Work date (optional)</span>
                  <input
                    type="datetime-local"
                    value={existingDueAt}
                    onChange={(event) => setExistingDueAt(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </label>

                <Button onClick={() => void handleAddSavedTask()} disabled={saving || savedTasks.length === 0 || !selectedSavedTaskId}>
                  {saving ? "Saving..." : "Add saved task"}
                </Button>
              </div>
            ) : null}

            {mode === "new" ? (
              <div className="mt-4 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Task title</span>
                  <input
                    value={title}
                    onChange={(event) => setTitle(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Stage setup"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Description</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    className="min-h-24 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Set up podium, chairs, and monitor"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Work date (optional)</span>
                  <input
                    type="datetime-local"
                    value={dueAt}
                    onChange={(event) => setDueAt(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Assigned volunteer (optional)</span>
                  <select
                    value={newTaskAssignedVolunteerId}
                    onChange={(event) => setNewTaskAssignedVolunteerId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">No volunteer assigned</option>
                    {volunteers.map((volunteer) => (
                      <option key={volunteer.id} value={volunteer.id}>
                        {volunteer.full_name}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Add new task to template (optional)</span>
                  <select
                    value={newTaskTemplateSelection}
                    onChange={(event) => setNewTaskTemplateSelection(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">No template</option>
                    <option value={CREATE_NEW_TEMPLATE_OPTION}>Create new</option>
                    {templates.map((template) => (
                      <option key={template.id} value={template.id}>
                        {template.title}
                      </option>
                    ))}
                  </select>
                </label>

                {newTaskTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Template name</span>
                    <input
                      value={newTaskTemplateName}
                      onChange={(event) => setNewTaskTemplateName(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="Weekend volunteer prep"
                    />
                  </label>
                ) : null}

                <div className="flex justify-end">
                  <Button onClick={() => void handleAddNewTask()} disabled={saving}>
                    {saving ? "Saving..." : "Add task"}
                  </Button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeEditModal}>
          <div
            className="mx-auto my-8 max-h-[calc(100vh-4rem)] w-full max-w-xl overflow-y-auto rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Edit task</h3>
              <Button variant="ghost" size="sm" onClick={closeEditModal}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Task title</span>
                <input
                  value={editTitle}
                  onChange={(event) => setEditTitle(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Description</span>
                <textarea
                  value={editDescription}
                  onChange={(event) => setEditDescription(event.target.value)}
                  className="min-h-24 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Work date</span>
                <input
                  type="datetime-local"
                  value={editDueAt}
                  onChange={(event) => setEditDueAt(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Template</span>
                <select
                  value={editTemplateSelection}
                  onChange={(event) => setEditTemplateSelection(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                >
                  <option value="">No template</option>
                  <option value={CREATE_NEW_TEMPLATE_OPTION}>Create new</option>
                  {templates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.title}
                    </option>
                  ))}
                </select>
              </label>

              {editTemplateSelection === CREATE_NEW_TEMPLATE_OPTION ? (
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Template name</span>
                  <input
                    value={editTemplateName}
                    onChange={(event) => setEditTemplateName(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Weekend volunteer prep"
                  />
                </label>
              ) : null}

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Assigned volunteer</span>
                <select
                  value={editAssignedVolunteerId}
                  onChange={(event) => setEditAssignedVolunteerId(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                >
                  <option value="">No volunteer assigned</option>
                  {volunteers.map((volunteer) => (
                    <option key={volunteer.id} value={volunteer.id}>
                      {volunteer.full_name}
                    </option>
                  ))}
                </select>
              </label>

              <div className="flex justify-end">
                <Button onClick={() => void handleSaveTaskEdit()} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
