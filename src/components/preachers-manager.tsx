"use client";

import { useEffect, useMemo, useState } from "react";
import { Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { formatPhoneInput } from "@/lib/phone-format";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type RosterPreacher = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ministry_name: string | null;
};

type AssignedPreacher = {
  id: string;
  church_preacher_id: string;
  role_name: string;
  notes: string | null;
  display_order: number;
  assigned_pa_name?: string | null;
  church_preachers: RosterPreacher | RosterPreacher[] | null;
};

type PreacherResponse = {
  roster: RosterPreacher[];
  assigned: AssignedPreacher[];
  error?: string;
};

type PersonalAssistantAssignment = {
  id: string;
  notes: string | null;
  church_personal_assistants?: {
    full_name?: string | null;
  } | {
    full_name?: string | null;
  }[] | null;
};

function getAssignedPreacherLabel(notes: string | null): string | null {
  if (!notes) {
    return null;
  }

  const match = notes.match(/Assigned to:\s*(.+?)(?:\s*\|\s*|$)/i);
  return match?.[1]?.trim() || null;
}

function getAssignedAssistantName(row: PersonalAssistantAssignment): string | null {
  const assistants = row.church_personal_assistants;
  if (!assistants) {
    return null;
  }

  const assistant = Array.isArray(assistants) ? assistants[0] ?? null : assistants;
  return assistant?.full_name?.trim() || null;
}

function normalizeAssignedPreacher(row: AssignedPreacher): RosterPreacher | null {
  if (!row.church_preachers) {
    return null;
  }

  return Array.isArray(row.church_preachers) ? row.church_preachers[0] ?? null : row.church_preachers;
}

export function PreachersManager({ conferenceName }: { conferenceName: string }) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showModal, setShowModal] = useState(false);
  const [mode, setMode] = useState<"existing" | "new">("existing");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [roster, setRoster] = useState<RosterPreacher[]>([]);
  const [assigned, setAssigned] = useState<AssignedPreacher[]>([]);

  const [selectedRosterId, setSelectedRosterId] = useState("");
  const [existingRoleName, setExistingRoleName] = useState("Guest Speaker");
  const [existingNotes, setExistingNotes] = useState("");

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [ministryName, setMinistryName] = useState("");
  const [biography, setBiography] = useState("");
  const [newRoleName, setNewRoleName] = useState("Guest Speaker");
  const [newNotes, setNewNotes] = useState("");

  const assignedRosterIds = useMemo(() => new Set(assigned.map((row) => row.church_preacher_id)), [assigned]);
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

      const preacherResponse = await fetch("/api/preachers", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const preacherPayload = (await preacherResponse.json()) as PreacherResponse;
      if (!preacherResponse.ok) {
        throw new Error(preacherPayload.error ?? "Unable to load preachers.");
      }

      const assistantResponse = await fetch("/api/preachers/assistants", {
        cache: "no-store",
        headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
      });

      const assistantPayload = (await assistantResponse.json()) as {
        assigned?: PersonalAssistantAssignment[];
        error?: string;
      };
      if (!assistantResponse.ok) {
        throw new Error(assistantPayload.error ?? "Unable to load personal assistants.");
      }

      const paByPreacherName = new Map<string, string>();
      for (const assignment of assistantPayload.assigned ?? []) {
        const assignedPreacherName = getAssignedPreacherLabel(assignment.notes);
        const assistantName = getAssignedAssistantName(assignment);
        if (!assignedPreacherName || !assistantName) {
          continue;
        }

        paByPreacherName.set(assignedPreacherName.trim().toLowerCase(), assistantName.trim());
      }

      const nextAssigned = (preacherPayload.assigned ?? []).map((row) => {
        const preacher = normalizeAssignedPreacher(row);
        const preacherName = preacher?.full_name?.trim();
        const assignedPaName = preacherName ? paByPreacherName.get(preacherName.trim().toLowerCase()) ?? null : null;

        return {
          ...row,
          assigned_pa_name: assignedPaName,
        };
      });

      setRoster(preacherPayload.roster ?? []);
      setAssigned(nextAssigned);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load preachers.");
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
    setExistingRoleName("Guest Speaker");
    setExistingNotes("");
    setFullName("");
    setEmail("");
    setPhone("");
    setMinistryName("");
    setBiography("");
    setNewRoleName("Guest Speaker");
    setNewNotes("");
    setErrorMessage(null);
  };

  const handleAssignExisting = async () => {
    if (!selectedRosterId) {
      setErrorMessage("Select a preacher from the ministry roster first.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify({
          action: "assign-existing",
          churchPreacherId: selectedRosterId,
          roleName: existingRoleName,
          notes: existingNotes,
        }),
      });

      const payload = (await response.json()) as PreacherResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign preacher.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to assign preacher.");
    } finally {
      setSaving(false);
    }
  };

  const handleCreateAndAssign = async () => {
    if (fullName.trim().length === 0) {
      setErrorMessage("Full name is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/preachers", {
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
          ministryName,
          biography,
          roleName: newRoleName,
          notes: newNotes,
        }),
      });

      const payload = (await response.json()) as PreacherResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create preacher.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to create preacher.");
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

      const response = await fetch("/api/preachers", {
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

      const payload = (await response.json()) as PreacherResponse;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to remove preacher assignment.");
      }

      setRoster(payload.roster ?? []);
      setAssigned(payload.assigned ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to remove preacher assignment.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="mt-7 rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">Conference Preachers</p>
          <h2 className="mt-1 text-2xl font-semibold text-brand-forest">Assigned to this conference</h2>
        </div>
        <Button onClick={() => setShowModal(true)}>Add preacher</Button>
      </div>

      {loading ? <p className="mt-5 text-sm text-brand-forest/80">Loading assigned preachers...</p> : null}

      {errorMessage && !showModal ? (
        <p className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {!loading && assigned.length === 0 ? (
        <p className="mt-5 rounded-xl border border-brand-sage/45 bg-brand-mist/60 px-4 py-3 text-sm text-brand-forest/85">
          No preachers are assigned yet.
        </p>
      ) : null}

      {!loading && assigned.length > 0 ? (
        <div className="mt-5 overflow-hidden rounded-xl border border-brand-sage/55">
          <table className="min-w-full border-collapse bg-white text-sm text-brand-forest">
            <thead className="bg-brand-mist/70 text-left text-xs uppercase tracking-[0.18em] text-brand-slate">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Ministry</th>
                <th className="px-4 py-3">Assigned PA</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Notes</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {assigned.map((row) => {
                const preacher = normalizeAssignedPreacher(row);
                const assignedPaName = row.assigned_pa_name?.trim() || "NONE";

                return (
                  <tr key={row.id} className="border-t border-brand-sage/40">
                    <td className="px-4 py-3 font-medium">{preacher?.full_name ?? "Unknown preacher"}</td>
                    <td className="px-4 py-3">{preacher?.ministry_name ?? "-"}</td>
                    <td className="px-4 py-3">{assignedPaName}</td>
                    <td className="px-4 py-3 capitalize">{row.role_name.replaceAll("_", " ")}</td>
                    <td className="px-4 py-3">{row.notes ?? "-"}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                        title="Delete preacher assignment"
                        aria-label="Delete preacher assignment"
                        disabled={saving}
                        onClick={() => {
                          void handleRemoveAssignment(row.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
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
            className="mx-auto my-8 max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Add Preacher to {conferenceName}</h3>
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
                Choose from previous guesits
              </button>
              <button
                type="button"
                className={`rounded-lg px-3 py-2 text-sm font-medium transition ${
                  mode === "new" ? "bg-brand-sage/45 text-brand-forest" : "text-brand-forest/80"
                }`}
                onClick={() => setMode("new")}
              >
                Create new preacher
              </button>
            </div>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            {mode === "existing" ? (
              <div className="mt-4 space-y-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Ministry roster</span>
                  <select
                    value={selectedRosterId}
                    onChange={(event) => setSelectedRosterId(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="">Select a preacher</option>
                    {availableRoster.map((person) => (
                      <option key={person.id} value={person.id}>
                        {person.full_name}{person.ministry_name ? ` - ${person.ministry_name}` : ""}
                      </option>
                    ))}
                  </select>
                </label>

                {alreadyAssignedRoster.length > 0 ? (
                  <div className="rounded-xl border border-brand-sage/45 bg-brand-mist/55 px-4 py-3">
                    <p className="text-xs uppercase tracking-[0.16em] text-brand-slate">Already assigned</p>
                    <div className="mt-2 flex flex-wrap gap-2">
                      {alreadyAssignedRoster.map((person) => (
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

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Conference role</span>
                    <input
                      value={existingRoleName}
                      onChange={(event) => setExistingRoleName(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="Guest Speaker"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Assignment notes</span>
                    <input
                      value={existingNotes}
                      onChange={(event) => setExistingNotes(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="Sunday AM keynote"
                    />
                  </label>
                </div>

                <Button onClick={() => void handleAssignExisting()} disabled={saving || availableRoster.length === 0}>
                  {saving ? "Saving..." : "Assign preacher"}
                </Button>
              </div>
            ) : null}

            {mode === "new" ? (
              <div className="mt-4 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Full name</span>
                  <input
                    value={fullName}
                    onChange={(event) => setFullName(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Pastor Jane Doe"
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
                      placeholder="jane@example.org"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Phone</span>
                    <input
                      value={phone}
                      onChange={(event) => setPhone(formatPhoneInput(event.target.value))}
                      inputMode="numeric"
                      maxLength={14}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="(555) 555-0188"
                    />
                  </label>
                </div>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Ministry</span>
                  <input
                    value={ministryName}
                    onChange={(event) => setMinistryName(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Grace Fellowship"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Biography</span>
                  <textarea
                    value={biography}
                    onChange={(event) => setBiography(event.target.value)}
                    className="min-h-24 w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Short bio"
                  />
                </label>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Conference role</span>
                    <input
                      value={newRoleName}
                      onChange={(event) => setNewRoleName(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="Guest Speaker"
                    />
                  </label>
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Assignment notes</span>
                    <input
                      value={newNotes}
                      onChange={(event) => setNewNotes(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                      placeholder="Closing service"
                    />
                  </label>
                </div>

                <Button onClick={() => void handleCreateAndAssign()} disabled={saving}>
                  {saving ? "Saving..." : "Create and assign"}
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </section>
  );
}
