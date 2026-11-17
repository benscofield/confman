"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone-format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type AssistantProfile = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
};

type AssignedAssistant = {
  id: string;
  role_name: string;
  notes: string | null;
  display_order: number;
  created_at: string;
  church_personal_assistant_id: string;
  church_personal_assistants: AssistantProfile | AssistantProfile[] | null;
};

type PreacherOption = {
  id: string;
  full_name: string;
  ministry_name: string | null;
};

type AssistantsResponse = {
  roster: AssistantProfile[];
  assigned: AssignedAssistant[];
  error?: string;
};

function normalizeAssignedAssistant(row: AssignedAssistant): AssistantProfile | null {
  if (!row.church_personal_assistants) {
    return null;
  }

  return Array.isArray(row.church_personal_assistants)
    ? (row.church_personal_assistants[0] ?? null)
    : row.church_personal_assistants;
}

function getPreacherAssignmentLabel(notes: string | null): string {
  if (!notes) {
    return "";
  }

  const match = notes.match(/Assigned to:\s*(.+?)(?:\s*\|\s*|$)/i);
  return match?.[1]?.trim() ?? "";
}

function stripPreacherAssignmentLabel(notes: string | null): string {
  if (!notes) {
    return "";
  }

  return notes.replace(/\s*\|?\s*Assigned to:\s*.+?(?:\s*\|\s*|$)/i, "").trim();
}

function createAssignmentNotes(notes: string, selectedPreacherId: string, preacherOptions: PreacherOption[]): string {
  const selectedPreacher = preacherOptions.find((person) => person.id === selectedPreacherId);
  const label = selectedPreacher ? `Assigned to: ${selectedPreacher.full_name}` : "";
  const cleanNotes = stripPreacherAssignmentLabel(notes).trim();
  const noteParts = [cleanNotes, label].filter(Boolean);
  return noteParts.join(" | ");
}

export function PersonalAssistantsManager() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roster, setRoster] = useState<AssistantProfile[]>([]);
  const [assigned, setAssigned] = useState<AssignedAssistant[]>([]);
  const [preacherOptions, setPreacherOptions] = useState<PreacherOption[]>([]);

  const [selectedRosterId, setSelectedRosterId] = useState("");
  const [selectedPreacherId, setSelectedPreacherId] = useState("");
  const [existingNotes, setExistingNotes] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [newNotes, setNewNotes] = useState("");
  const [editAssistantId, setEditAssistantId] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [editSelectedPreacherId, setEditSelectedPreacherId] = useState("");

  const assignedRosterIds = useMemo(
    () => new Set(assigned.map((row) => row.church_personal_assistant_id)),
    [assigned],
  );
  const availableRoster = useMemo(
    () => roster.filter((person) => !assignedRosterIds.has(person.id)),
    [roster, assignedRosterIds],
  );
  const alreadyAssignedRoster = useMemo(
    () => roster.filter((person) => assignedRosterIds.has(person.id)),
    [roster, assignedRosterIds],
  );

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers/assistants", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const payload = (await response.json()) as AssistantsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load personal assistants.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
      await fetchPreacherOptions();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load personal assistants.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, []);

  const closeModal = () => {
    setShowModal(false);
    setMode("existing");
    setSelectedRosterId("");
    setSelectedPreacherId("");
    setExistingNotes("");
    setFullName("");
    setEmail("");
    setPhone("");
    setNewNotes("");
    setErrorMessage(null);
  };

  const closeEditModal = () => {
    setShowEditModal(false);
    setEditAssistantId("");
    setEditNotes("");
    setEditSelectedPreacherId("");
    setErrorMessage(null);
  };

  const fetchPreacherOptions = async () => {
    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const payload = (await response.json()) as { roster?: PreacherOption[]; error?: string };
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load preachers.");
      }

      setPreacherOptions(payload.roster ?? []);
    } catch {
      setPreacherOptions([]);
    }
  };

  const handleAssignExisting = async () => {
    if (!selectedRosterId) {
      setErrorMessage("Select a personal assistant from the church roster first.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers/assistants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          action: "assign-existing",
          churchPersonalAssistantId: selectedRosterId,
          notes: createAssignmentNotes(existingNotes, selectedPreacherId, preacherOptions),
        }),
      });

      const payload = (await response.json()) as AssistantsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign personal assistant.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to assign personal assistant.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAndAssign = async () => {
    if (!fullName.trim()) {
      setErrorMessage("Full name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers/assistants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          action: "create-and-assign",
          fullName,
          email,
          phone,
          notes: createAssignmentNotes(newNotes, selectedPreacherId, preacherOptions),
        }),
      });

      const payload = (await response.json()) as AssistantsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to add personal assistant.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add personal assistant.");
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveAssignment = async (assignmentId: string) => {
    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers/assistants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          action: "remove-assignment",
          assignmentId,
        }),
      });

      const payload = (await response.json()) as AssistantsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove personal assistant.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove personal assistant.");
    } finally {
      setSaving(false);
    }
  };

  const handleOpenEditAssignment = (assignment: AssignedAssistant) => {
    setEditAssistantId(assignment.id);
    setEditNotes(stripPreacherAssignmentLabel(assignment.notes));
    setEditSelectedPreacherId(
      preacherOptions.find((person) => person.full_name === getPreacherAssignmentLabel(assignment.notes))?.id ?? "",
    );
    setShowEditModal(true);
  };

  const handleSaveAssignmentEdit = async () => {
    if (!editAssistantId) {
      setErrorMessage("Select an assignment to edit.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers/assistants", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          action: "update-assignment",
          assignmentId: editAssistantId,
          notes: createAssignmentNotes(editNotes, editSelectedPreacherId, preacherOptions),
        }),
      });

      const payload = (await response.json()) as AssistantsResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to update personal assistant assignment.");
      }

      setAssigned(payload.assigned ?? []);
      closeEditModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update personal assistant assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-7 rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">Personal Assistants</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-forest">Assigned to this conference</h2>
        </div>
        <Button onClick={() => setShowModal(true)}>Add personal assistant</Button>
      </div>

      {loading ? <p className="mt-5 text-sm text-brand-forest/80">Loading personal assistants...</p> : null}

      {errorMessage && !showModal ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {!loading && assigned.length === 0 ? (
        <p className="mt-5 rounded-xl border border-brand-sage/45 bg-brand-mist/60 px-4 py-3 text-sm text-brand-forest/85">
          No personal assistants are assigned yet.
        </p>
      ) : null}

      {!loading && assigned.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-brand-sage/55">
          <table className="min-w-full border-collapse bg-white text-sm text-brand-forest">
            <thead className="bg-brand-mist/70 text-left text-xs uppercase tracking-[0.18em] text-brand-slate">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Assigned to</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((row) => {
                const assistant = normalizeAssignedAssistant(row);
                const assignedTo = getPreacherAssignmentLabel(row.notes) || "NONE";

                return (
                  <tr key={row.id} className="border-t border-brand-sage/40">
                    <td className="px-4 py-3 font-medium">{assistant?.full_name ?? "Unknown assistant"}</td>
                    <td className="px-4 py-3">{assistant?.email ?? "-"}</td>
                    <td className="px-4 py-3">{assistant?.phone ?? "-"}</td>
                    <td className="px-4 py-3">{assignedTo}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 px-0 text-brand-forest hover:bg-brand-mist"
                          title="Edit personal assistant assignment"
                          aria-label="Edit personal assistant assignment"
                          disabled={saving}
                          onClick={() => {
                            handleOpenEditAssignment(row);
                          }}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                          title="Delete personal assistant assignment"
                          aria-label="Delete personal assistant assignment"
                          disabled={saving}
                          onClick={() => {
                            void handleRemoveAssignment(row.id);
                          }}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeModal}>
          <div
            className="mx-auto my-8 w-full max-w-xl rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Add Personal Assistant</h3>
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
                Choose existing
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "new" ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
                }`}
                onClick={() => setMode("new")}
              >
                Create new
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            {mode === "existing" ? (
              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Church roster</span>
                  <select
                    value={selectedRosterId}
                    onChange={(event) => setSelectedRosterId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a personal assistant</option>
                    {availableRoster.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}
                        {person.email ? ` - ${person.email}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {availableRoster.length === 0 ? (
                  <p className="rounded-xl border border-brand-sage/45 bg-brand-mist/60 px-4 py-3 text-sm text-brand-forest/85">
                    All saved personal assistants are already assigned to this conference.
                  </p>
                ) : null}

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Assign to preacher</span>
                  <select
                    value={selectedPreacherId}
                    onChange={(event) => setSelectedPreacherId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a preacher</option>
                    {preacherOptions.map((preacher) => (
                      <option key={preacher.id} value={preacher.id}>
                        {preacher.full_name}
                        {preacher.ministry_name ? ` - ${preacher.ministry_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Notes</span>
                  <textarea
                    value={existingNotes}
                    onChange={(event) => setExistingNotes(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Responsibilities, travel needs, etc."
                  />
                </label>
              </div>
            ) : (
              <div className="mt-5 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Assistant name"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Email</span>
                    <input
                      type="email"
                      value={email}
                      onChange={(event) => setEmail(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="assistant@ministry.org"
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Phone</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="(555) 555-5555"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Assign to preacher</span>
                  <select
                    value={selectedPreacherId}
                    onChange={(event) => setSelectedPreacherId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a preacher</option>
                    {preacherOptions.map((preacher) => (
                      <option key={preacher.id} value={preacher.id}>
                        {preacher.full_name}
                        {preacher.ministry_name ? ` - ${preacher.ministry_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Notes</span>
                  <textarea
                    value={newNotes}
                    onChange={(event) => setNewNotes(event.target.value)}
                    rows={4}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Responsibilities, travel needs, etc."
                  />
                </label>
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal}>
                Cancel
              </Button>
              <Button
                disabled={saving || (mode === "existing" && availableRoster.length === 0)}
                onClick={() => {
                  if (mode === "existing") {
                    void handleAssignExisting();
                    return;
                  }

                  void handleCreateAndAssign();
                }}
              >
                {saving ? "Saving..." : mode === "existing" ? "Assign assistant" : "Add assistant"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showEditModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeEditModal}>
          <div
            className="mx-auto my-8 w-full max-w-xl rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Edit personal assistant assignment</h3>
              <Button variant="ghost" size="sm" onClick={closeEditModal}>
                Close
              </Button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            <div className="mt-5 space-y-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Assign to preacher</span>
                <select
                  value={editSelectedPreacherId}
                  onChange={(event) => setEditSelectedPreacherId(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                >
                  <option value="">Select a preacher</option>
                  {preacherOptions.map((preacher) => (
                    <option key={preacher.id} value={preacher.id}>
                      {preacher.full_name}
                      {preacher.ministry_name ? ` - ${preacher.ministry_name}` : ""}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Notes</span>
                <textarea
                  value={editNotes}
                  onChange={(event) => setEditNotes(event.target.value)}
                  rows={4}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  placeholder="Responsibilities, travel needs, etc."
                />
              </label>

              <div className="flex justify-end gap-3">
                <Button variant="ghost" onClick={closeEditModal} disabled={saving}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSaveAssignmentEdit()} disabled={saving}>
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
