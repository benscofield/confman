"use client";

import { useEffect, useMemo, useState } from "react";

import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone-format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AccountData = {
  id: string;
  fullName: string;
  email: string;
  phone: string | null;
  role: string;
};

type ChurchData = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  city: string | null;
  state_region: string | null;
  country: string | null;
} | null;

type SavedVolunteer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  default_role_name: string | null;
  notes: string | null;
};

type SavedTaskTemplate = {
  id: string;
  title: string;
  description: string | null;
  department: string;
  default_due_offset_days: number | null;
};

type SavedPreacher = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ministry_name: string | null;
};

type AccountPayload = {
  account: AccountData;
  church: ChurchData;
  savedVolunteers: SavedVolunteer[];
  savedTaskTemplates: SavedTaskTemplate[];
  savedPreachers: SavedPreacher[];
  error?: string;
};

type TabKey = "account" | "volunteers" | "tasks" | "preachers";

const tabs: Array<{ key: TabKey; label: string }> = [
  { key: "account", label: "Account Details" },
  { key: "volunteers", label: "Saved Volunteers" },
  { key: "tasks", label: "Saved Tasks" },
  { key: "preachers", label: "Saved Preachers" },
];

const departmentOptions = [
  "operations",
  "preacher_logistics",
  "worship",
  "volunteer",
  "bookstore",
  "ticketing",
] as const;

export function AccountManager() {
  const [tab, setTab] = useState<TabKey>("account");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [account, setAccount] = useState<AccountData | null>(null);
  const [church, setChurch] = useState<ChurchData>(null);
  const [savedVolunteers, setSavedVolunteers] = useState<SavedVolunteer[]>([]);
  const [savedTaskTemplates, setSavedTaskTemplates] = useState<SavedTaskTemplate[]>([]);
  const [savedPreachers, setSavedPreachers] = useState<SavedPreacher[]>([]);

  const [volunteerName, setVolunteerName] = useState("");
  const [volunteerEmail, setVolunteerEmail] = useState("");
  const [volunteerPhone, setVolunteerPhone] = useState("");
  const [volunteerRole, setVolunteerRole] = useState("");
  const [volunteerNotes, setVolunteerNotes] = useState("");

  const [taskTitle, setTaskTitle] = useState("");
  const [taskDescription, setTaskDescription] = useState("");
  const [taskDepartment, setTaskDepartment] = useState<(typeof departmentOptions)[number]>("operations");
  const [taskDueOffsetDays, setTaskDueOffsetDays] = useState("");

  const [preacherName, setPreacherName] = useState("");
  const [preacherEmail, setPreacherEmail] = useState("");
  const [preacherPhone, setPreacherPhone] = useState("");
  const [preacherMinistry, setPreacherMinistry] = useState("");

  const churchLocation = useMemo(() => {
    if (!church) {
      return null;
    }

    const bits = [church.city, church.state_region, church.country].filter(Boolean);
    return bits.length > 0 ? bits.join(", ") : null;
  }, [church]);

  const load = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/account", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const payload = (await response.json()) as AccountPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load account details.");
      }

      setAccount(payload.account);
      setChurch(payload.church);
      setSavedVolunteers(payload.savedVolunteers ?? []);
      setSavedTaskTemplates(payload.savedTaskTemplates ?? []);
      setSavedPreachers(payload.savedPreachers ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load account details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const refreshFromResponse = (payload: AccountPayload) => {
    setAccount(payload.account);
    setChurch(payload.church);
    setSavedVolunteers(payload.savedVolunteers ?? []);
    setSavedTaskTemplates(payload.savedTaskTemplates ?? []);
    setSavedPreachers(payload.savedPreachers ?? []);
  };

  const submitAction = async (body: Record<string, unknown>) => {
    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      });

      const payload = (await response.json()) as AccountPayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to save.");
      }

      refreshFromResponse(payload);
      return true;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save.");
      return false;
    } finally {
      setSaving(false);
    }
  };

  const handleAddVolunteer = async () => {
    if (volunteerName.trim().length === 0) {
      setErrorMessage("Volunteer name is required.");
      return;
    }

    const ok = await submitAction({
      action: "add-volunteer",
      fullName: volunteerName,
      email: volunteerEmail,
      phone: volunteerPhone,
      defaultRoleName: volunteerRole,
      notes: volunteerNotes,
    });

    if (ok) {
      setVolunteerName("");
      setVolunteerEmail("");
      setVolunteerPhone("");
      setVolunteerRole("");
      setVolunteerNotes("");
    }
  };

  const handleAddTaskTemplate = async () => {
    if (taskTitle.trim().length === 0) {
      setErrorMessage("Task title is required.");
      return;
    }

    const numericOffset = taskDueOffsetDays.trim().length > 0 ? Number(taskDueOffsetDays) : null;
    const ok = await submitAction({
      action: "add-task-template",
      title: taskTitle,
      description: taskDescription,
      department: taskDepartment,
      defaultDueOffsetDays: Number.isFinite(numericOffset) ? numericOffset : null,
    });

    if (ok) {
      setTaskTitle("");
      setTaskDescription("");
      setTaskDepartment("operations");
      setTaskDueOffsetDays("");
    }
  };

  const handleAddPreacher = async () => {
    if (preacherName.trim().length === 0) {
      setErrorMessage("Preacher name is required.");
      return;
    }

    const ok = await submitAction({
      action: "add-preacher",
      fullName: preacherName,
      email: preacherEmail,
      phone: preacherPhone,
      ministryName: preacherMinistry,
    });

    if (ok) {
      setPreacherName("");
      setPreacherEmail("");
      setPreacherPhone("");
      setPreacherMinistry("");
    }
  };

  if (loading) {
    return <p className="mt-6 text-sm text-brand-forest/80">Loading organization account...</p>;
  }

  return (
    <section className="mt-7 rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
      <div className="grid gap-2 rounded-xl border border-brand-sage/45 p-1 sm:grid-cols-2 lg:grid-cols-4">
        {tabs.map((item) => (
          <button
            key={item.key}
            type="button"
            className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
              tab === item.key ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
            }`}
            onClick={() => setTab(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>

      {errorMessage ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {tab === "account" ? (
        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <article className="rounded-xl border border-brand-sage/45 bg-brand-mist/50 p-4">
            <p className="text-xs uppercase tracking-[0.18em] text-brand-slate">Account</p>
            <p className="mt-2 text-lg font-semibold text-brand-forest">{account?.fullName ?? "Unknown user"}</p>
            <p className="mt-1 text-sm text-brand-forest/80">{account?.email ?? ""}</p>
            {account?.phone ? <p className="mt-1 text-sm text-brand-forest/80">{account.phone}</p> : null}
            <p className="mt-2 text-sm capitalize text-brand-forest/75">Role: {account?.role ?? ""}</p>
          </article>

          <article className="rounded-xl border border-brand-sage/45 bg-brand-mist/50 p-4">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div className="min-w-0 flex-1">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-slate">Ministry:</p>
                <p className="mt-1 text-lg font-semibold text-brand-forest">{church?.name ?? "Unknown ministry"}</p>
              </div>
              <div className="min-w-0 flex-1 text-left sm:text-right">
                <p className="text-xs uppercase tracking-[0.18em] text-brand-slate">Email:</p>
                <p className="mt-1 text-sm text-brand-forest/80">{church?.email ?? "Not set"}</p>
              </div>
            </div>
            {church?.phone ? <p className="mt-3 text-sm text-brand-forest/80">{church.phone}</p> : null}
            {churchLocation ? <p className="mt-2 text-sm text-brand-forest/75">{churchLocation}</p> : null}
          </article>
        </div>
      ) : null}

      {tab === "volunteers" ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 rounded-xl border border-brand-sage/45 bg-brand-mist/40 p-4 md:grid-cols-2">
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Full name</span>
              <input value={volunteerName} onChange={(event) => setVolunteerName(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Default role</span>
              <input value={volunteerRole} onChange={(event) => setVolunteerRole(event.target.value)} placeholder="Greeter" className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Email</span>
              <input type="email" value={volunteerEmail} onChange={(event) => setVolunteerEmail(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Phone</span>
              <input value={volunteerPhone} onChange={(event) => setVolunteerPhone(formatPhoneInput(event.target.value))} inputMode="numeric" maxLength={14} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-brand-forest">Notes</span>
              <textarea value={volunteerNotes} onChange={(event) => setVolunteerNotes(event.target.value)} className="min-h-20 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <div className="md:col-span-2">
              <Button onClick={() => void handleAddVolunteer()} disabled={saving}>{saving ? "Saving..." : "Add saved volunteer"}</Button>
            </div>
          </div>

          <div className="grid gap-3">
            {savedVolunteers.length === 0 ? <p className="text-sm text-brand-forest/75">No saved volunteers yet.</p> : null}
            {savedVolunteers.map((item) => (
              <article key={item.id} className="rounded-xl border border-brand-sage/60 bg-white p-4 shadow-[0_1px_3px_rgba(26,38,31,0.08)]">
                <p className="text-lg font-semibold text-brand-forest">{item.full_name}</p>
                <p className="mt-1 text-sm text-brand-forest/80">{item.default_role_name ?? "No default role"}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "tasks" ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 rounded-xl border border-brand-sage/45 bg-brand-mist/40 p-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-brand-forest">Title</span>
              <input value={taskTitle} onChange={(event) => setTaskTitle(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Department</span>
              <select value={taskDepartment} onChange={(event) => setTaskDepartment(event.target.value as (typeof departmentOptions)[number])} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20">
                {departmentOptions.map((option) => (
                  <option key={option} value={option}>{option.replaceAll("_", " ")}</option>
                ))}
              </select>
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Default due offset (days)</span>
              <input type="number" value={taskDueOffsetDays} onChange={(event) => setTaskDueOffsetDays(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-brand-forest">Description</span>
              <textarea value={taskDescription} onChange={(event) => setTaskDescription(event.target.value)} className="min-h-20 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <div className="md:col-span-2">
              <Button onClick={() => void handleAddTaskTemplate()} disabled={saving}>{saving ? "Saving..." : "Add saved task"}</Button>
            </div>
          </div>

          <div className="grid gap-3">
            {savedTaskTemplates.length === 0 ? <p className="text-sm text-brand-forest/75">No saved tasks yet.</p> : null}
            {savedTaskTemplates.map((item) => (
              <article key={item.id} className="rounded-xl border border-brand-sage/60 bg-white p-4 shadow-[0_1px_3px_rgba(26,38,31,0.08)]">
                <p className="text-lg font-semibold text-brand-forest">{item.title}</p>
                <p className="mt-1 text-sm capitalize text-brand-forest/80">{item.department.replaceAll("_", " ")}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}

      {tab === "preachers" ? (
        <div className="mt-5 space-y-5">
          <div className="grid gap-4 rounded-xl border border-brand-sage/45 bg-brand-mist/40 p-4 md:grid-cols-2">
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-brand-forest">Full name</span>
              <input value={preacherName} onChange={(event) => setPreacherName(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Email</span>
              <input type="email" value={preacherEmail} onChange={(event) => setPreacherEmail(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-brand-forest">Phone</span>
              <input value={preacherPhone} onChange={(event) => setPreacherPhone(formatPhoneInput(event.target.value))} inputMode="numeric" maxLength={14} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <label className="space-y-2 md:col-span-2">
              <span className="text-sm font-medium text-brand-forest">Ministry</span>
              <input value={preacherMinistry} onChange={(event) => setPreacherMinistry(event.target.value)} className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20" />
            </label>
            <div className="md:col-span-2">
              <Button onClick={() => void handleAddPreacher()} disabled={saving}>{saving ? "Saving..." : "Add saved preacher"}</Button>
            </div>
          </div>

          <div className="grid gap-3">
            {savedPreachers.length === 0 ? <p className="text-sm text-brand-forest/75">No saved preachers yet.</p> : null}
            {savedPreachers.map((item) => (
              <article key={item.id} className="rounded-xl border border-brand-sage/60 bg-white p-4 shadow-[0_1px_3px_rgba(26,38,31,0.08)]">
                <p className="text-lg font-semibold text-brand-forest">{item.full_name}</p>
                <p className="mt-1 text-sm text-brand-forest/80">{item.ministry_name ?? "No ministry listed"}</p>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
