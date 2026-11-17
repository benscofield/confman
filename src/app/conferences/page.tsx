"use client";

import { useEffect, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@/components/ui/button";
import { conferenceCookieName } from "@/lib/auth-cookies";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type Conference = {
  id: string;
  name: string;
  status: string;
  start_date: string;
  end_date: string;
  location_name: string | null;
  city: string | null;
};

const conferenceStatusOptions = ["draft", "published", "active", "completed", "archived"] as const;

function formatDateRange(start: string, end: string): string {
  const formatter = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });
  return `${formatter.format(new Date(start))} - ${formatter.format(new Date(end))}`;
}

export default function ConferencesPage() {
  const router = useRouter();
  const [items, setItems] = useState<Conference[]>([]);
  const [selectedConferenceId, setSelectedConferenceId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [showEditModal, setShowEditModal] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [activeConferenceId, setActiveConferenceId] = useState("");
  const [editName, setEditName] = useState("");
  const [editStatus, setEditStatus] = useState<(typeof conferenceStatusOptions)[number]>("draft");
  const [editStartDate, setEditStartDate] = useState("");
  const [editEndDate, setEditEndDate] = useState("");
  const [editLocationName, setEditLocationName] = useState("");
  const [editCity, setEditCity] = useState("");

  const loadConferences = async () => {
    setErrorMessage(null);
    setLoading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch("/api/conferences", {
        cache: "no-store",
        headers: accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : undefined,
      });
      const payload = (await response.json()) as {
        error?: string;
        selectedConferenceId?: string | null;
        items?: Conference[];
      };

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load conferences.");
      }

      setItems(payload.items ?? []);
      setSelectedConferenceId(payload.selectedConferenceId ?? null);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load conferences.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const load = async () => {
      await loadConferences();
    };

    void load();
  }, []);

  const closeModals = () => {
    setShowEditModal(false);
    setShowDeleteModal(false);
    setActiveConferenceId("");
    setEditName("");
    setEditStatus("draft");
    setEditStartDate("");
    setEditEndDate("");
    setEditLocationName("");
    setEditCity("");
  };

  const openEditModal = (conference: Conference) => {
    setActiveConferenceId(conference.id);
    setEditName(conference.name);
    setEditStatus(
      conferenceStatusOptions.includes(conference.status as (typeof conferenceStatusOptions)[number])
        ? (conference.status as (typeof conferenceStatusOptions)[number])
        : "draft",
    );
    setEditStartDate(conference.start_date);
    setEditEndDate(conference.end_date);
    setEditLocationName(conference.location_name ?? "");
    setEditCity(conference.city ?? "");
    setShowEditModal(true);
  };

  const openDeleteModal = (conferenceId: string) => {
    setActiveConferenceId(conferenceId);
    setShowDeleteModal(true);
  };

  const submitConferenceAction = async (body: Record<string, unknown>) => {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch("/api/conferences", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(accessToken
          ? {
              Authorization: `Bearer ${accessToken}`,
            }
          : {}),
      },
      body: JSON.stringify(body),
    });

    const payload = (await response.json()) as {
      error?: string;
      selectedConferenceId?: string | null;
      items?: Conference[];
    };

    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save conference.");
    }

    setItems(payload.items ?? []);
    setSelectedConferenceId(payload.selectedConferenceId ?? null);
  };

  const handleSaveConference = async () => {
    if (!activeConferenceId) {
      setErrorMessage("Conference selection is required.");
      return;
    }

    if (!editName.trim()) {
      setErrorMessage("Conference name is required.");
      return;
    }

    if (!editStartDate || !editEndDate) {
      setErrorMessage("Start and end dates are required.");
      return;
    }

    if (new Date(editEndDate).getTime() < new Date(editStartDate).getTime()) {
      setErrorMessage("End date must be on or after start date.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitConferenceAction({
        action: "update-conference",
        conferenceId: activeConferenceId,
        name: editName,
        status: editStatus,
        startDate: editStartDate,
        endDate: editEndDate,
        locationName: editLocationName,
        city: editCity,
      });
      closeModals();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update conference.");
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteConference = async () => {
    if (!activeConferenceId) {
      setErrorMessage("Conference selection is required.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitConferenceAction({
        action: "delete-conference",
        conferenceId: activeConferenceId,
      });

      if (selectedConferenceId === activeConferenceId) {
        document.cookie = `${conferenceCookieName}=; Path=/; Max-Age=0; SameSite=Lax`;
        setSelectedConferenceId(null);
      }

      closeModals();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete conference.");
    } finally {
      setSaving(false);
    }
  };

  const selectConference = (conferenceId: string) => {
    document.cookie = `${conferenceCookieName}=${encodeURIComponent(conferenceId)}; Path=/; Max-Age=2592000; SameSite=Lax`;
    router.push("/dashboard");
    router.refresh();
  };

  return (
    <main className="mx-auto max-w-5xl px-6 py-10 lg:py-12">
      <section className="rounded-[2rem] border border-brand-slate/25 bg-white/90 p-7 shadow-[0_24px_80px_rgba(64,78,59,0.12)] lg:p-9">
        <div className="space-y-3">
          <p className="text-sm uppercase tracking-[0.28em] text-brand-slate">Conferences</p>
          <h1 className="text-3xl font-semibold text-brand-forest lg:text-4xl">Choose a conference to continue</h1>
          <p className="max-w-2xl text-brand-forest/80">
            Dashboard and operational modules are scoped by conference. Select one before proceeding.
          </p>
        </div>

        {loading ? <p className="mt-7 text-sm text-brand-forest/80">Loading conferences...</p> : null}

        {errorMessage ? (
          <p className="mt-7 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
        ) : null}

        {!loading && !errorMessage && items.length === 0 ? (
          <div className="mt-7 rounded-xl border border-brand-sage/50 bg-brand-mist/50 px-4 py-4 text-sm text-brand-forest/85">
            No conferences were found for this ministry yet. Complete setup first to create a conference.
          </div>
        ) : null}

        {!loading && !errorMessage && items.length > 0 ? (
          <div className="mt-7 grid gap-4">
            {items.map((conference) => {
              const isSelected = selectedConferenceId === conference.id;

              return (
                <article
                  key={conference.id}
                  className={`rounded-2xl border p-5 ${
                    isSelected ? "border-brand-olive bg-brand-sage/25" : "border-brand-sage/55 bg-white"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs uppercase tracking-[0.22em] text-brand-slate">{conference.status}</p>
                      <h2 className="mt-1 text-xl font-semibold text-brand-forest">{conference.name}</h2>
                      <p className="mt-2 text-sm text-brand-forest/75">{formatDateRange(conference.start_date, conference.end_date)}</p>
                      {conference.city ? <p className="mt-1 text-sm text-brand-forest/75">{conference.city}</p> : null}
                      {conference.location_name ? (
                        <p className="mt-1 text-sm text-brand-forest/75">{conference.location_name}</p>
                      ) : null}
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Button onClick={() => selectConference(conference.id)}>Select conference</Button>
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 px-0"
                          title="Edit conference"
                          aria-label="Edit conference"
                          onClick={() => openEditModal(conference)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="ghost"
                          className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                          title="Delete conference"
                          aria-label="Delete conference"
                          onClick={() => openDeleteModal(conference.id)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      {showEditModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeModals}>
          <div
            className="mx-auto my-8 w-full max-w-2xl rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Edit conference</h3>
              <Button variant="ghost" size="sm" onClick={closeModals}>
                Close
              </Button>
            </div>

            <div className="mt-4 grid gap-4">
              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Conference name</span>
                <input
                  value={editName}
                  onChange={(event) => setEditName(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Status</span>
                <select
                  value={editStatus}
                  onChange={(event) => setEditStatus(event.target.value as (typeof conferenceStatusOptions)[number])}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                >
                  {conferenceStatusOptions.map((status) => (
                    <option key={status} value={status}>
                      {status}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Start date</span>
                  <input
                    type="date"
                    value={editStartDate}
                    onChange={(event) => setEditStartDate(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">End date</span>
                  <input
                    type="date"
                    value={editEndDate}
                    onChange={(event) => setEditEndDate(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  />
                </label>
              </div>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">City</span>
                <input
                  value={editCity}
                  onChange={(event) => setEditCity(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>

              <label className="block space-y-2">
                <span className="text-sm font-medium text-brand-forest">Location</span>
                <input
                  value={editLocationName}
                  onChange={(event) => setEditLocationName(event.target.value)}
                  className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </label>
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModals} disabled={saving}>
                Cancel
              </Button>
              <Button onClick={() => void handleSaveConference()} disabled={saving}>
                {saving ? "Saving..." : "Save changes"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {showDeleteModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeModals}>
          <div
            className="mx-auto my-8 w-full max-w-xl rounded-2xl border border-red-200 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">Delete conference</h3>
              <Button variant="ghost" size="sm" onClick={closeModals}>
                Close
              </Button>
            </div>
            <p className="mt-4 text-sm text-brand-forest/85">Are you sure you want to delete this conference? This action cannot be undone.</p>

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModals} disabled={saving}>
                Cancel
              </Button>
              <Button className="bg-red-700 text-white hover:bg-red-800" onClick={() => void handleDeleteConference()} disabled={saving}>
                {saving ? "Deleting..." : "Delete conference"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}
