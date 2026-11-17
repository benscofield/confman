"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone-format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SavedVolunteer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  default_role_name: string | null;
  notes: string | null;
};

type AssignedVolunteer = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  role_name: string | null;
  notes: string | null;
};

type VolunteerResponse = {
  roster: SavedVolunteer[];
  assigned: AssignedVolunteer[];
  error?: string;
};

type AccountPayload = {
  savedVolunteers: SavedVolunteer[];
  error?: string;
};

function getConferenceCookieValue(): string | null {
  if (typeof document === "undefined") {
    return null;
  }

  const match = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("confman_conference_id="));

  if (!match) {
    return null;
  }

  return decodeURIComponent(match.split("=").slice(1).join("="));
}

function normalizeVolunteerKey(person: Pick<SavedVolunteer, "full_name" | "email" | "phone">): string {
  const email = (person.email ?? "").trim().toLowerCase();
  const phone = (person.phone ?? "").replace(/\D/g, "");
  const fullName = person.full_name.trim().toLowerCase();

  return `${fullName}|${email}|${phone}`;
}

export function VolunteersManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [volunteers, setVolunteers] = useState<SavedVolunteer[]>([]);
  const [assignedVolunteerKeys, setAssignedVolunteerKeys] = useState<Set<string>>(new Set());
  const [taskOptions, setTaskOptions] = useState<Array<{ id: string; title: string }>>([]);

  const [selectedVolunteerId, setSelectedVolunteerId] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [role, setRole] = useState("");
  const [notes, setNotes] = useState("");

  const [editVolunteerId, setEditVolunteerId] = useState("");
  const [editName, setEditName] = useState("");
  const [editEmail, setEditEmail] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const didRunLegacyBackfillRef = useRef(false);

  const resetForm = () => {
    setSelectedVolunteerId("");
    setSelectedTaskId("");
    setName("");
    setEmail("");
    setPhone("");
    setRole("");
    setNotes("");
  };

  const closeModal = () => {
    setShowModal(false);
    setMode("existing");
    resetForm();
    setErrorMessage(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditVolunteerId("");
    setEditName("");
    setEditEmail("");
    setEditPhone("");
    setEditRole("");
    setEditNotes("");
    setErrorMessage(null);
  };

  const fetchTasks = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/tasks", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const payload = (await response.json()) as { items?: Array<{ id: string; title: string }> };
      if (!response.ok) {
        throw new Error(payload?.items ? "Unable to load tasks." : "Unable to load tasks.");
      }

      setTaskOptions(payload.items ?? []);
    } catch {
      setTaskOptions([]);
    }
  };

  const fetchVolunteers = async () => {
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
        throw new Error(payload.error ?? "Unable to load volunteers.");
      }

      const saved = payload.savedVolunteers ?? [];
      setVolunteers(saved);
      return saved;
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load volunteers.");
      return [] as SavedVolunteer[];
    } finally {
      setLoading(false);
    }
  };

  const fetchAssignedVolunteerKeys = async () => {
    const conferenceId = getConferenceCookieValue();
    if (!conferenceId) {
      setAssignedVolunteerKeys(new Set());
      return new Set<string>();
    }

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/volunteers", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      if (!response.ok) {
        setAssignedVolunteerKeys(new Set());
        return new Set<string>();
      }

      const payload = (await response.json()) as VolunteerResponse;
      const keys = new Set(
        (payload.assigned ?? [])
          .filter((person) => person.full_name)
          .map((person) =>
            normalizeVolunteerKey({
              full_name: person.full_name,
              email: person.email ?? null,
              phone: person.phone ?? null,
            }),
          ),
      );

      setAssignedVolunteerKeys(keys);
      return keys;
    } catch {
      setAssignedVolunteerKeys(new Set());
      return new Set<string>();
    }
  };

  const runLegacyBackfill = async () => {
    const conferenceId = getConferenceCookieValue();
    if (!conferenceId) {
      return;
    }

    const backfillKey = `confman_volunteer_backfill_${conferenceId}`;
    if (didRunLegacyBackfillRef.current || window.localStorage.getItem(backfillKey) === "done") {
      return;
    }

    didRunLegacyBackfillRef.current = true;

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/volunteers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({ action: "backfill-legacy" }),
      });

      if (response.ok) {
        window.localStorage.setItem(backfillKey, "done");
      }
    } catch {
      // Non-fatal: the page still works without backfill; filtering will improve once this succeeds.
    }
  };

  const availableVolunteers = useMemo(
    () => volunteers.filter((person) => !assignedVolunteerKeys.has(normalizeVolunteerKey(person))),
    [volunteers, assignedVolunteerKeys],
  );
  const alreadyAssignedVolunteers = useMemo(
    () => volunteers.filter((person) => assignedVolunteerKeys.has(normalizeVolunteerKey(person))),
    [volunteers, assignedVolunteerKeys],
  );

  useEffect(() => {
    void fetchTasks();
    void (async () => {
      const saved = await fetchVolunteers();
      const assignedKeys = await fetchAssignedVolunteerKeys();

      if (saved.length > 0 && assignedKeys.size === 0) {
        await runLegacyBackfill();
        await fetchAssignedVolunteerKeys();
      }
    })();
  }, []);

  const submitVolunteer = async (body: Record<string, unknown>) => {
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
      throw new Error(payload.error ?? "Unable to save volunteer.");
    }

    setVolunteers(payload.savedVolunteers ?? []);
    await fetchAssignedVolunteerKeys();
  };

  const submitConferenceAssignment = async (body: Record<string, unknown>) => {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch("/api/volunteers", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as VolunteerResponse;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save volunteer assignment.");
    }

    await fetchAssignedVolunteerKeys();
  };

  const handleAssignExistingVolunteer = async () => {
    if (!selectedVolunteerId) {
      setErrorMessage("Select a volunteer from the roster first.");
      return;
    }

    const selectedVolunteer = volunteers.find((item) => item.id === selectedVolunteerId);
    if (!selectedVolunteer) {
      setErrorMessage("The selected volunteer could not be found.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitConferenceAssignment({
        action: "assign-existing",
        churchVolunteerId: selectedVolunteer.id,
        roleName: selectedVolunteer.default_role_name ?? role ?? "Volunteer",
        notes: selectedVolunteer.notes ?? notes,
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save volunteer assignment.");
    } finally {
      setSaving(false);
    }
  };

  const handleAddVolunteer = async () => {
    if (name.trim().length === 0) {
      setErrorMessage("Volunteer name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitConferenceAssignment({
        action: "create-and-assign",
        fullName: name,
        email,
        phone,
        roleName: role,
        notes,
      });

      await fetchVolunteers();
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to save volunteer.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteVolunteer = async (volunteerId: string) => {
    setSaving(true);
    setErrorMessage(null);

    try {
      await submitVolunteer({
        action: "delete-volunteer",
        volunteerId,
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete volunteer.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditVolunteer = (volunteer: SavedVolunteer) => {
    setEditVolunteerId(volunteer.id);
    setEditName(volunteer.full_name);
    setEditEmail(volunteer.email ?? "");
    setEditPhone(volunteer.phone ?? "");
    setEditRole(volunteer.default_role_name ?? "");
    setEditNotes(volunteer.notes ?? "");
    setShowEditModal(true);
    setErrorMessage(null);
  };

  const handleUpdateVolunteer = async () => {
    if (!editVolunteerId) {
      return;
    }

    if (editName.trim().length === 0) {
      setErrorMessage("Volunteer name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitVolunteer({
        action: "update-volunteer",
        volunteerId: editVolunteerId,
        fullName: editName,
        email: editEmail,
        phone: editPhone,
        defaultRoleName: editRole,
        notes: editNotes,
      });

      closeEditModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update volunteer.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-7 rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">Conference volunteers</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-forest">Volunteers</h2>
        </div>
        <Button onClick={() => setShowModal(true)}>Add volunteer</Button>
      </div>

      {loading ? <p className="mt-5 text-sm text-brand-forest/80">Loading volunteers...</p> : null}

      {errorMessage && !showModal ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {!loading && volunteers.length === 0 ? (
        <p className="mt-5 rounded-xl border border-brand-sage/45 bg-brand-mist/60 px-4 py-3 text-sm text-brand-forest/85">
          No volunteers are assigned yet.
        </p>
      ) : null}

      {!loading && volunteers.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-brand-sage/55">
          <table className="min-w-full border-collapse bg-white text-sm text-brand-forest">
            <thead className="bg-brand-mist/70 text-left text-xs uppercase tracking-[0.18em] text-brand-slate">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Default role</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {volunteers.map((item) => (
                <tr key={item.id} className="border-t border-brand-sage/40">
                  <td className="px-4 py-3 font-medium">{item.full_name}</td>
                  <td className="px-4 py-3">{item.email ?? "-"}</td>
                  <td className="px-4 py-3">{item.phone ?? "-"}</td>
                  <td className="px-4 py-3">{item.default_role_name ?? "-"}</td>
                  <td className="px-4 py-3">{item.notes ?? "-"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 px-0"
                        title="Edit volunteer"
                        aria-label="Edit volunteer"
                        disabled={saving}
                        onClick={() => {
                          handleOpenEditVolunteer(item);
                        }}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                        title="Delete volunteer"
                        aria-label="Delete volunteer"
                        disabled={saving}
                        onClick={() => {
                          void handleDeleteVolunteer(item.id);
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
              <h3 className="text-xl font-semibold text-brand-forest">Add volunteer</h3>
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
                Choose from existing volunteers
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "new" ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
                }`}
                onClick={() => setMode("new")}
              >
                Create new volunteer
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            {mode === "existing" ? (
              <div className="mt-4 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Saved volunteers</span>
                  <select
                    value={selectedVolunteerId}
                    onChange={(event) => setSelectedVolunteerId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a volunteer</option>
                    {availableVolunteers.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}{person.default_role_name ? ` - ${person.default_role_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {alreadyAssignedVolunteers.length > 0 ? (
                  <div className="rounded-xl border border-brand-sage/45 bg-brand-mist/55 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-brand-slate">Already assigned</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {alreadyAssignedVolunteers.map((person) => (
                        <span
                          key={person.id}
                          className="rounded-full border border-brand-sage/60 bg-white px-3 py-1 text-xs font-medium text-brand-forest"
                        >
                          {person.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Assigned task</span>
                  <select
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a task</option>
                    {taskOptions.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>

                <Button onClick={() => void handleAssignExistingVolunteer()} disabled={saving || availableVolunteers.length === 0}>
                  {saving ? "Saving..." : "Assign volunteer"}
                </Button>
              </div>
            ) : null}

            {mode === "new" ? (
              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-brand-forest">Full name</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Jordan Lee"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Email</span>
                  <input
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="jordan@example.org"
                  />
                </label>

                <label className="space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Phone</span>
                  <input
                    value={phone}
                    onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                    inputMode="numeric"
                    maxLength={14}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="(555) 555-0100"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-brand-forest">Default role</span>
                  <input
                    value={role}
                    onChange={(event) => setRole(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Greeter"
                  />
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-brand-forest">Assigned task</span>
                  <select
                    value={selectedTaskId}
                    onChange={(event) => setSelectedTaskId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a task</option>
                    {taskOptions.map((task) => (
                      <option key={task.id} value={task.id}>
                        {task.title}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-2 md:col-span-2">
                  <span className="text-sm font-medium text-brand-forest">Notes</span>
                  <textarea
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                    className="min-h-24 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Can help with check-in desk"
                  />
                </label>

                <div className="md:col-span-2 flex justify-end">
                  <Button onClick={() => void handleAddVolunteer()} disabled={saving}>
                    {saving ? "Saving..." : "Add volunteer"}
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
            className="mx-auto my-8 max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Edit volunteer</h3>
              <Button variant="ghost" size="sm" onClick={closeEditModal}>
                Close
              </Button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-4 grid gap-4 md:grid-cols-2">
              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-brand-forest">Full name</span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="Jordan Lee"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-brand-forest">Email</span>
                <input
                  type="email"
                  value={editEmail}
                  onChange={(event) => setEditEmail(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="jordan@example.org"
                />
              </label>

              <label className="space-y-2">
                <span className="text-sm font-medium text-brand-forest">Phone</span>
                <input
                  value={editPhone}
                  onChange={(event) => setEditPhone(formatPhoneInput(event.target.value))}
                  inputMode="numeric"
                  maxLength={14}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="(555) 555-0100"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-brand-forest">Default role</span>
                <input
                  value={editRole}
                  onChange={(event) => setEditRole(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="Greeter"
                />
              </label>

              <label className="space-y-2 md:col-span-2">
                <span className="text-sm font-medium text-brand-forest">Notes</span>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  className="min-h-24 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="Can help with check-in desk"
                />
              </label>

              <div className="md:col-span-2 flex justify-end">
                <Button onClick={() => void handleUpdateVolunteer()} disabled={saving}>
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
