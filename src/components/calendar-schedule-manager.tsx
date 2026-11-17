"use client";

import { useEffect, useMemo, useState } from "react";
import { Pencil, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type CalendarEvent = {
  id: string;
  title: string;
  starts_at: string;
  ends_at: string;
  worship_lead: string | null;
  preacher_name: string | null;
};

type PreacherOption = {
  id: string;
  full_name: string;
};

type SchedulePayload = {
  items: CalendarEvent[];
  preachers: PreacherOption[];
  error?: string;
};

type ModalMode = "add" | "edit" | "delete";

function toUtcDate(dateOnly: string): Date {
  return new Date(`${dateOnly}T00:00:00.000Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function dayLabel(day: Date, conferenceStart: Date, conferenceEnd: Date): string {
  const dayMs = day.getTime();
  const startMs = conferenceStart.getTime();
  const endMs = conferenceEnd.getTime();
  const daySpanMs = 86_400_000;

  if (dayMs < startMs) {
    const offset = Math.round((startMs - dayMs) / daySpanMs);
    return `Pre-conference day -${offset}`;
  }

  if (dayMs > endMs) {
    const offset = Math.round((dayMs - endMs) / daySpanMs);
    return `Post-conference day +${offset}`;
  }

  const conferenceDay = Math.round((dayMs - startMs) / daySpanMs) + 1;
  return `Conference day ${conferenceDay}`;
}

function formatCardDate(date: Date): string {
  return new Intl.DateTimeFormat("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

function timeSlotOptions(): Array<{ value: string; label: string }> {
  const slots: Array<{ value: string; label: string }> = [];

  for (let hour = 0; hour < 24; hour += 1) {
    for (let minute = 0; minute < 60; minute += 30) {
      const value = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      const date = new Date(Date.UTC(2000, 0, 1, hour, minute, 0));
      const label = new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
        timeZone: "UTC",
      }).format(date);

      slots.push({ value, label });
    }
  }

  return slots;
}

function timeLabelFromIso(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function formatDateKeyFromIsoInLocalTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function formatSingleEventTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return "Time not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(date);
}

function formatEventTimeRange(startsAt: string, endsAt: string): string {
  const startLabel = formatSingleEventTime(startsAt);
  const endLabel = formatSingleEventTime(endsAt);

  if (startLabel === "Time not set" || endLabel === "Time not set") {
    return "Time not set";
  }

  return `${startLabel} - ${endLabel}`;
}

function buildLocalIsoFromDayAndTime(day: string, timeOfDay: string): string | null {
  const local = new Date(`${day}T${timeOfDay}:00`);
  if (Number.isNaN(local.getTime())) {
    return null;
  }

  return local.toISOString();
}

export function CalendarScheduleManager({
  conferenceStartDate,
  conferenceEndDate,
}: {
  conferenceStartDate: string;
  conferenceEndDate: string;
}) {
  const conferenceStart = useMemo(() => toUtcDate(conferenceStartDate), [conferenceStartDate]);
  const conferenceEnd = useMemo(() => toUtcDate(conferenceEndDate), [conferenceEndDate]);
  const rangeStart = useMemo(() => addDays(conferenceStart, -3), [conferenceStart]);
  const rangeEnd = useMemo(() => addDays(conferenceEnd, 3), [conferenceEnd]);

  const rangeStartIso = useMemo(() => `${toIsoDate(rangeStart)}T00:00:00.000Z`, [rangeStart]);
  const rangeEndIsoExclusive = useMemo(() => `${toIsoDate(addDays(rangeEnd, 1))}T00:00:00.000Z`, [rangeEnd]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [preachers, setPreachers] = useState<PreacherOption[]>([]);

  const [showModal, setShowModal] = useState(false);
  const [modalMode, setModalMode] = useState<ModalMode>("add");
  const [activeDayKey, setActiveDayKey] = useState("");
  const [selectedEventId, setSelectedEventId] = useState("");

  const [eventTitle, setEventTitle] = useState("");
  const [eventStartTime, setEventStartTime] = useState("09:00");
  const [eventEndTime, setEventEndTime] = useState("10:00");
  const [assignPreacher, setAssignPreacher] = useState(false);
  const [selectedPreacherName, setSelectedPreacherName] = useState("");
  const [assignMusicTeam, setAssignMusicTeam] = useState(false);
  const [selectedMusicTeam, setSelectedMusicTeam] = useState("");

  const timeSlots = useMemo(() => timeSlotOptions(), []);

  const days = useMemo(() => {
    const values: Date[] = [];
    for (let cursor = rangeStart; cursor <= rangeEnd; cursor = addDays(cursor, 1)) {
      values.push(new Date(cursor));
    }
    return values;
  }, [rangeStart, rangeEnd]);

  const eventsByDay = useMemo(() => {
    const map = new Map<string, CalendarEvent[]>();
    for (const event of events) {
      const key = formatDateKeyFromIsoInLocalTime(event.starts_at);
      if (!key) {
        continue;
      }
      const dayEvents = map.get(key) ?? [];
      dayEvents.push(event);
      map.set(key, dayEvents);
    }
    return map;
  }, [events]);

  const activeDayEvents = useMemo(() => eventsByDay.get(activeDayKey) ?? [], [eventsByDay, activeDayKey]);
  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) ?? null,
    [events, selectedEventId],
  );

  const fetchData = async () => {
    setLoading(true);
    setErrorMessage(null);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;

      const response = await fetch(
        `/api/schedules?start=${encodeURIComponent(rangeStartIso)}&end=${encodeURIComponent(rangeEndIsoExclusive)}`,
        {
          cache: "no-store",
          headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
        },
      );

      const payload = (await response.json()) as SchedulePayload;
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load schedule.");
      }

      setEvents(payload.items ?? []);
      setPreachers(payload.preachers ?? []);
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to load schedule.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void fetchData();
  }, [rangeStartIso, rangeEndIsoExclusive]);

  const resetModal = () => {
    setSelectedEventId("");
    setEventTitle("");
    setEventStartTime("09:00");
    setEventEndTime("10:00");
    setAssignPreacher(false);
    setSelectedPreacherName("");
    setAssignMusicTeam(false);
    setSelectedMusicTeam("");
  };

  const setFormFromEvent = (event: CalendarEvent) => {
    setSelectedEventId(event.id);
    setEventTitle(event.title);
    setEventStartTime(timeLabelFromIso(event.starts_at) || "09:00");
    setEventEndTime(timeLabelFromIso(event.ends_at) || "10:00");
    setAssignPreacher(Boolean(event.preacher_name));
    setSelectedPreacherName(event.preacher_name ?? "");
    setAssignMusicTeam(Boolean(event.worship_lead));
    setSelectedMusicTeam(event.worship_lead ?? "");
  };

  const openModal = (mode: ModalMode, dayKey: string, initialEventId?: string) => {
    setModalMode(mode);
    setActiveDayKey(dayKey);
    resetModal();

    if (initialEventId && mode !== "add") {
      const selectedEvent = events.find((event) => event.id === initialEventId);
      if (selectedEvent) {
        setFormFromEvent(selectedEvent);
      }
    }

    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setErrorMessage(null);
    resetModal();
  };

  const submitScheduleAction = async (body: Record<string, unknown>) => {
    const supabase = createBrowserSupabaseClient();
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch(
      `/api/schedules?start=${encodeURIComponent(rangeStartIso)}&end=${encodeURIComponent(rangeEndIsoExclusive)}`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        },
        body: JSON.stringify(body),
      },
    );

    const payload = (await response.json()) as SchedulePayload;
    if (!response.ok) {
      throw new Error(payload.error ?? "Unable to save schedule event.");
    }

    setEvents(payload.items ?? []);
    setPreachers(payload.preachers ?? []);
  };

  const handleAdd = async () => {
    if (!eventTitle.trim()) {
      setErrorMessage("Event name is required.");
      return;
    }

    if (assignPreacher && !selectedPreacherName) {
      setErrorMessage("Select a preacher or turn off preacher assignment.");
      return;
    }

    const startsAtIso = buildLocalIsoFromDayAndTime(activeDayKey, eventStartTime);
    const endsAtIso = buildLocalIsoFromDayAndTime(activeDayKey, eventEndTime);

    if (!startsAtIso || !endsAtIso) {
      setErrorMessage("Please select valid start and end times.");
      return;
    }

    if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      setErrorMessage("End time must be after start time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitScheduleAction({
        action: "create-event",
        startsAtIso,
        endsAtIso,
        title: eventTitle,
        assignPreacher,
        preacherName: assignPreacher ? selectedPreacherName : undefined,
        assignMusicTeam,
        musicTeamName: assignMusicTeam ? selectedMusicTeam || "Music team (coming soon)" : undefined,
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to add event.");
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = async () => {
    if (!selectedEventId) {
      setErrorMessage("Select an event to edit.");
      return;
    }

    if (!eventTitle.trim()) {
      setErrorMessage("Event name is required.");
      return;
    }

    if (assignPreacher && !selectedPreacherName) {
      setErrorMessage("Select a preacher or turn off preacher assignment.");
      return;
    }

    const startsAtIso = buildLocalIsoFromDayAndTime(activeDayKey, eventStartTime);
    const endsAtIso = buildLocalIsoFromDayAndTime(activeDayKey, eventEndTime);

    if (!startsAtIso || !endsAtIso) {
      setErrorMessage("Please select valid start and end times.");
      return;
    }

    if (new Date(endsAtIso).getTime() <= new Date(startsAtIso).getTime()) {
      setErrorMessage("End time must be after start time.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitScheduleAction({
        action: "update-event",
        eventId: selectedEventId,
        startsAtIso,
        endsAtIso,
        title: eventTitle,
        assignPreacher,
        preacherName: assignPreacher ? selectedPreacherName : undefined,
        assignMusicTeam,
        musicTeamName: assignMusicTeam ? selectedMusicTeam || "Music team (coming soon)" : undefined,
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to update event.");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedEventId) {
      setErrorMessage("Select an event to delete.");
      return;
    }

    setSaving(true);
    setErrorMessage(null);

    try {
      await submitScheduleAction({
        action: "delete-event",
        eventId: selectedEventId,
      });
      closeModal();
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Unable to delete event.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <section>
      <h1 className="text-3xl font-semibold text-brand-forest">Conference Calendar</h1>

      {errorMessage && !showModal ? (
        <p className="mt-6 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
      ) : null}

      {loading ? <p className="mt-6 text-sm text-brand-forest/80">Loading schedule...</p> : null}

      {!loading ? (
        <div className="mt-6 grid gap-4">
          {days.map((day) => {
            const dayKey = toIsoDate(day);
            const dayEvents = eventsByDay.get(dayKey) ?? [];

            return (
              <article key={dayKey} className="rounded-2xl border border-brand-sage/50 bg-white/85 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.2em] text-brand-slate">{dayLabel(day, conferenceStart, conferenceEnd)}</p>
                    <h2 className="mt-2 text-xl font-semibold text-brand-forest">{formatCardDate(day)}</h2>
                  </div>

                  <div className="flex items-center gap-2">
                    <Button size="sm" onClick={() => openModal("add", dayKey)}>
                      Add
                    </Button>
                  </div>
                </div>

                {dayEvents.length === 0 ? (
                  <p className="mt-3 text-sm text-brand-forest/75">No scheduled events.</p>
                ) : (
                  <div className="mt-3 space-y-3">
                    {dayEvents.map((event) => (
                      <div key={event.id} className="rounded-xl border border-brand-sage/45 bg-brand-mist/35 p-3">
                        <div className="flex items-start justify-between gap-3">
                          <div>
                            <p className="text-xs uppercase tracking-[0.18em] text-brand-slate">{formatEventTimeRange(event.starts_at, event.ends_at)}</p>
                            <p className="mt-1 font-semibold text-brand-forest">{event.title}</p>
                          </div>
                          <div className="flex items-center gap-1">
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-9 w-9 px-0"
                              title="Edit event"
                              aria-label="Edit event"
                              onClick={() => openModal("edit", dayKey, event.id)}
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              variant="ghost"
                              className="h-9 w-9 px-0 text-red-700 hover:bg-red-50"
                              title="Delete event"
                              aria-label="Delete event"
                              onClick={() => openModal("delete", dayKey, event.id)}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </div>
                        <div className="mt-1 grid gap-1 text-sm text-brand-forest/80 sm:grid-cols-2">
                          <p>Music team: {event.worship_lead ?? "Not assigned"}</p>
                          <p>Preacher: {event.preacher_name ?? "Not assigned"}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            );
          })}
        </div>
      ) : null}

      {showModal ? (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-brand-forest/35 p-4" onClick={closeModal}>
          <div
            className="mx-auto my-8 max-h-[calc(100vh-4rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-brand-sage/45 bg-white p-6 shadow-xl"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-xl font-semibold text-brand-forest">
                {modalMode === "add" ? "Add event" : modalMode === "edit" ? "Edit event" : "Delete event"}
              </h3>
              <Button variant="ghost" size="sm" onClick={closeModal}>
                Close
              </Button>
            </div>

            <p className="mt-2 text-sm text-brand-forest/75">{activeDayKey}</p>

            {errorMessage ? (
              <p className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{errorMessage}</p>
            ) : null}

            {modalMode !== "delete" ? (
              <div className="mt-4 grid gap-4">
                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Event name</span>
                  <input
                    value={eventTitle}
                    onChange={(event) => setEventTitle(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    placeholder="Session 1"
                  />
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">Start time</span>
                  <select
                    value={eventStartTime}
                    onChange={(event) => setEventStartTime(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    {timeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block space-y-2">
                  <span className="text-sm font-medium text-brand-forest">End time</span>
                  <select
                    value={eventEndTime}
                    onChange={(event) => setEventEndTime(event.target.value)}
                    className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    {timeSlots.map((slot) => (
                      <option key={slot.value} value={slot.value}>
                        {slot.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex items-center gap-2 text-sm text-brand-forest">
                  <input
                    type="checkbox"
                    checked={assignMusicTeam}
                    onChange={(event) => setAssignMusicTeam(event.target.checked)}
                    className="h-4 w-4 rounded border-brand-sage/70 text-brand-olive focus:ring-brand-olive"
                  />
                  Assign music team
                </label>

                {assignMusicTeam ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Music team</span>
                    <select
                      value={selectedMusicTeam}
                      onChange={(event) => setSelectedMusicTeam(event.target.value)}
                      disabled
                      className="w-full rounded-xl border border-brand-sage/70 bg-brand-mist/40 px-4 py-3 text-sm text-brand-forest/70 outline-none"
                    >
                      <option value="">Music team module coming soon</option>
                    </select>
                  </label>
                ) : null}

                <label className="flex items-center gap-2 text-sm text-brand-forest">
                  <input
                    type="checkbox"
                    checked={assignPreacher}
                    onChange={(event) => setAssignPreacher(event.target.checked)}
                    className="h-4 w-4 rounded border-brand-sage/70 text-brand-olive focus:ring-brand-olive"
                  />
                  Assign preacher
                </label>

                {assignPreacher ? (
                  <label className="block space-y-2">
                    <span className="text-sm font-medium text-brand-forest">Preacher</span>
                    <select
                      value={selectedPreacherName}
                      onChange={(event) => setSelectedPreacherName(event.target.value)}
                      className="w-full rounded-xl border border-brand-sage/70 bg-white px-4 py-3 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                    >
                      <option value="">Select preacher</option>
                      {preachers.map((preacher) => (
                        <option key={preacher.id} value={preacher.full_name}>
                          {preacher.full_name}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
              </div>
            ) : null}

            {modalMode === "delete" ? (
              <div className="mt-4 space-y-2 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                <p>Delete this event?</p>
                <p className="text-red-700">
                  {selectedEvent ? `${formatEventTimeRange(selectedEvent.starts_at, selectedEvent.ends_at)} - ${selectedEvent.title}` : "Selected event"}
                </p>
                <p className="text-red-700/90">This action cannot be undone.</p>
              </div>
            ) : null}

            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={closeModal} disabled={saving}>
                Cancel
              </Button>
              {modalMode === "add" ? (
                <Button onClick={() => void handleAdd()} disabled={saving}>
                  {saving ? "Saving..." : "Add event"}
                </Button>
              ) : null}
              {modalMode === "edit" ? (
                <Button onClick={() => void handleEdit()} disabled={saving}>
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              ) : null}
              {modalMode === "delete" ? (
                <Button onClick={() => void handleDelete()} disabled={saving}>
                  {saving ? "Deleting..." : "Delete event"}
                </Button>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </section>
  );
}
