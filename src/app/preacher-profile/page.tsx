"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Upload, Phone, Mail, MapPin, Clock, AlertCircle, CheckCircle } from "lucide-react";

import { Button } from "@/components/ui/button";
import { createBrowserSupabaseClient } from "@/lib/supabase/client";

type SpeakingSlot = {
  id: string;
  service_name: string;
  starts_at: string;
  ends_at: string;
  altar_call: boolean;
  stage_assignment: string | null;
};

type PreacherLogistics = {
  hotel_name: string | null;
  room_number: string | null;
  check_in_at: string | null;
  check_out_at: string | null;
  dietary_notes: string | null;
  hospitality_notes: string | null;
  flight_number: string | null;
  flight_arrival_at: string | null;
  flight_departure_at: string | null;
  pickup_notes: string | null;
};

type PersonalAssistant = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  notes: string | null;
};

type PreacherData = {
  id: string;
  full_name: string;
  email: string | null;
  phone: string | null;
  ministry_name: string | null;
  biography: string | null;
  speakingSlots: SpeakingSlot[];
  logistics: PreacherLogistics | null;
  personalAssistant: PersonalAssistant | null;
};

type AccommodationRequest = {
  id?: string;
  title: string;
  description: string;
  category: "dietary" | "mobility" | "family" | "other";
  priority: "low" | "medium" | "high";
  status?: "pending" | "approved" | "declined";
};

function formatDateTime(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(date);
}

function formatDate(isoString: string | null): string {
  if (!isoString) return "";
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(date);
}

export default function PreacherProfilePage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [preacherData, setPreacherData] = useState<PreacherData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"schedule" | "accommodations" | "logistics" | "profile">("schedule");

  // Accommodation form state
  const [accommodationTitle, setAccommodationTitle] = useState("");
  const [accommodationDescription, setAccommodationDescription] = useState("");
  const [accommodationCategory, setAccommodationCategory] = useState<"dietary" | "mobility" | "family" | "other">("dietary");
  const [accommodationPriority, setAccommodationPriority] = useState<"low" | "medium" | "high">("medium");
  const [submittingAccommodation, setSubmittingAccommodation] = useState(false);
  const [accommodationSuccess, setAccommodationSuccess] = useState(false);

  // Bio upload state
  const [bioFile, setBioFile] = useState<File | null>(null);
  const [bioUploading, setBioUploading] = useState(false);

  // Flight info upload state
  const [flightFile, setFlightFile] = useState<File | null>(null);
  const [flightUploading, setFlightUploading] = useState(false);

  useEffect(() => {
    const fetchPreacherData = async () => {
      setLoading(true);
      setError(null);

      try {
        const supabase = createBrowserSupabaseClient();
        const { data: sessionData } = await supabase.auth.getSession();

        if (!sessionData.session) {
          router.push("/login");
          return;
        }

        const response = await fetch("/api/preacher-profile", {
          cache: "no-store",
          headers: {
            Authorization: `Bearer ${sessionData.session.access_token}`,
          },
        });

        if (!response.ok) {
          throw new Error("Failed to load preacher profile");
        }

        const data = (await response.json()) as PreacherData;
        setPreacherData(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "An error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchPreacherData();
  }, [router]);

  const handleSubmitAccommodation = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingAccommodation(true);
    setAccommodationSuccess(false);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();

      const response = await fetch("/api/preacher-profile/accommodations", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: JSON.stringify({
          title: accommodationTitle,
          description: accommodationDescription,
          category: accommodationCategory,
          priority: accommodationPriority,
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to submit accommodation request");
      }

      setAccommodationTitle("");
      setAccommodationDescription("");
      setAccommodationSuccess(true);
      setTimeout(() => setAccommodationSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit accommodation");
    } finally {
      setSubmittingAccommodation(false);
    }
  };

  const handleBioUpload = async () => {
    if (!bioFile) return;
    setBioUploading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append("file", bioFile);

      const response = await fetch("/api/preacher-profile/bio-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload bio");
      }

      setBioFile(null);
      setAccommodationSuccess(true);
      setTimeout(() => setAccommodationSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload bio");
    } finally {
      setBioUploading(false);
    }
  };

  const handleFlightUpload = async () => {
    if (!flightFile) return;
    setFlightUploading(true);

    try {
      const supabase = createBrowserSupabaseClient();
      const { data: sessionData } = await supabase.auth.getSession();

      const formData = new FormData();
      formData.append("file", flightFile);

      const response = await fetch("/api/preacher-profile/flight-upload", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${sessionData.session?.access_token || ""}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload flight info");
      }

      setFlightFile(null);
      setAccommodationSuccess(true);
      setTimeout(() => setAccommodationSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload flight info");
    } finally {
      setFlightUploading(false);
    }
  };

  if (loading) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="text-center">
          <p className="text-brand-forest/60">Loading your profile...</p>
        </div>
      </main>
    );
  }

  if (!preacherData) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-8">
        <div className="rounded-xl border border-red-200 bg-red-50 p-4">
          <p className="text-red-700">{error || "Unable to load preacher profile"}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-6 pb-20">
      {/* Header */}
      <section className="mb-8">
        <h1 className="text-3xl font-bold text-brand-forest">{preacherData.full_name}</h1>
        {preacherData.ministry_name && (
          <p className="mt-1 text-brand-forest/70">{preacherData.ministry_name}</p>
        )}
        <div className="mt-4 flex flex-col gap-2 text-sm text-brand-forest/75">
          {preacherData.email && (
            <a href={`mailto:${preacherData.email}`} className="flex items-center gap-2 hover:text-brand-forest">
              <Mail size={16} />
              {preacherData.email}
            </a>
          )}
          {preacherData.phone && (
            <a href={`tel:${preacherData.phone}`} className="flex items-center gap-2 hover:text-brand-forest">
              <Phone size={16} />
              {preacherData.phone}
            </a>
          )}
        </div>
      </section>

      {/* Success Message */}
      {accommodationSuccess && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-green-200 bg-green-50 p-4">
          <CheckCircle size={20} className="flex-shrink-0 text-green-600" />
          <p className="text-sm text-green-700">Submission successful!</p>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div className="mb-6 flex items-center gap-3 rounded-xl border border-red-200 bg-red-50 p-4">
          <AlertCircle size={20} className="flex-shrink-0 text-red-600" />
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {/* Tabs */}
      <div className="mb-6 flex gap-2 border-b border-brand-sage/30">
        {(["schedule", "accommodations", "logistics", "profile"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === tab
                ? "border-b-2 border-brand-forest text-brand-forest"
                : "text-brand-forest/60 hover:text-brand-forest"
            }`}
          >
            {tab.charAt(0).toUpperCase() + tab.slice(1)}
          </button>
        ))}
      </div>

      {/* Schedule Tab */}
      {activeTab === "schedule" && (
        <section className="space-y-4">
          <h2 className="text-xl font-semibold text-brand-forest">Conference Speaking Schedule</h2>
          {preacherData.speakingSlots.length === 0 ? (
            <p className="text-brand-forest/60">No speaking slots assigned yet.</p>
          ) : (
            preacherData.speakingSlots.map((slot) => (
              <div key={slot.id} className="rounded-xl border-2 border-brand-olive bg-brand-olive/5 p-4">
                <div className="mb-2 flex items-start justify-between">
                  <h3 className="font-semibold text-brand-forest">{slot.service_name}</h3>
                  {slot.altar_call && (
                    <span className="rounded-full bg-brand-olive/20 px-3 py-1 text-xs font-medium text-brand-olive">
                      Altar Call
                    </span>
                  )}
                </div>
                <div className="space-y-1 text-sm text-brand-forest/75">
                  <div className="flex items-center gap-2">
                    <Clock size={16} />
                    <span>{formatDateTime(slot.starts_at)}</span>
                  </div>
                  {slot.stage_assignment && (
                    <div className="flex items-center gap-2">
                      <MapPin size={16} />
                      <span>{slot.stage_assignment}</span>
                    </div>
                  )}
                </div>
              </div>
            ))
          )}
        </section>
      )}

      {/* Accommodations Tab */}
      {activeTab === "accommodations" && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-4 text-xl font-semibold text-brand-forest">Request Special Accommodations</h2>
            <form onSubmit={handleSubmitAccommodation} className="space-y-4 rounded-xl border border-brand-sage/30 bg-white/50 p-5">
              <div>
                <label className="block text-sm font-medium text-brand-forest">Title</label>
                <input
                  type="text"
                  required
                  value={accommodationTitle}
                  onChange={(e) => setAccommodationTitle(e.target.value)}
                  placeholder="e.g., Wheelchair accessibility needed"
                  className="mt-2 w-full rounded-lg border border-brand-sage/70 bg-white px-4 py-2 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-brand-forest">Description</label>
                <textarea
                  required
                  value={accommodationDescription}
                  onChange={(e) => setAccommodationDescription(e.target.value)}
                  placeholder="Please provide details..."
                  rows={4}
                  className="mt-2 w-full rounded-lg border border-brand-sage/70 bg-white px-4 py-2 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-brand-forest">Category</label>
                  <select
                    value={accommodationCategory}
                    onChange={(e) => setAccommodationCategory(e.target.value as any)}
                    className="mt-2 w-full rounded-lg border border-brand-sage/70 bg-white px-4 py-2 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="dietary">Dietary</option>
                    <option value="mobility">Mobility</option>
                    <option value="family">Family/Guest</option>
                    <option value="other">Other</option>
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-brand-forest">Priority</label>
                  <select
                    value={accommodationPriority}
                    onChange={(e) => setAccommodationPriority(e.target.value as any)}
                    className="mt-2 w-full rounded-lg border border-brand-sage/70 bg-white px-4 py-2 text-sm text-brand-forest outline-none focus:border-brand-olive focus:ring-2 focus:ring-brand-olive/20"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>
              </div>

              <Button type="submit" className="w-full" disabled={submittingAccommodation}>
                {submittingAccommodation ? "Submitting..." : "Submit Request"}
              </Button>
            </form>
          </div>
        </section>
      )}

      {/* Logistics Tab */}
      {activeTab === "logistics" && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-4 text-xl font-semibold text-brand-forest">Hotel & Travel</h2>
            {preacherData.logistics ? (
              <div className="space-y-4 rounded-xl border border-brand-sage/30 bg-white/50 p-5">
                {preacherData.logistics.hotel_name && (
                  <div>
                    <p className="text-sm font-medium text-brand-forest/70">Hotel</p>
                    <p className="mt-1 text-brand-forest">{preacherData.logistics.hotel_name}</p>
                    {preacherData.logistics.room_number && (
                      <p className="text-sm text-brand-forest/70">Room {preacherData.logistics.room_number}</p>
                    )}
                  </div>
                )}

                {preacherData.logistics.check_in_at && (
                  <div>
                    <p className="text-sm font-medium text-brand-forest/70">Check-in</p>
                    <p className="mt-1 text-brand-forest">{formatDate(preacherData.logistics.check_in_at)}</p>
                  </div>
                )}

                {preacherData.logistics.flight_number && (
                  <div>
                    <p className="text-sm font-medium text-brand-forest/70">Flight</p>
                    <p className="mt-1 text-brand-forest">{preacherData.logistics.flight_number}</p>
                    {preacherData.logistics.flight_arrival_at && (
                      <p className="text-sm text-brand-forest/70">Arrives {formatDateTime(preacherData.logistics.flight_arrival_at)}</p>
                    )}
                  </div>
                )}

                {preacherData.logistics.dietary_notes && (
                  <div>
                    <p className="text-sm font-medium text-brand-forest/70">Dietary Notes</p>
                    <p className="mt-1 text-sm text-brand-forest">{preacherData.logistics.dietary_notes}</p>
                  </div>
                )}

                {preacherData.logistics.pickup_notes && (
                  <div>
                    <p className="text-sm font-medium text-brand-forest/70">Pickup Instructions</p>
                    <p className="mt-1 text-sm text-brand-forest">{preacherData.logistics.pickup_notes}</p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-brand-forest/60">No logistics information yet.</p>
            )}
          </div>

          <div>
            <h2 className="mb-4 text-xl font-semibold text-brand-forest">Upload Flight Information</h2>
            <div className="rounded-xl border border-brand-sage/30 bg-white/50 p-5">
              <label className="block">
                <span className="mb-3 block text-sm font-medium text-brand-forest">Flight Documents (PDF, JPG, PNG)</span>
                <input
                  type="file"
                  accept=".pdf,.jpg,.jpeg,.png"
                  onChange={(e) => setFlightFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-brand-forest"
                />
              </label>
              {flightFile && (
                <p className="mt-2 text-sm text-brand-forest/70">Selected: {flightFile.name}</p>
              )}
              <Button
                onClick={handleFlightUpload}
                disabled={!flightFile || flightUploading}
                className="mt-4 w-full"
                variant={flightFile ? "default" : "secondary"}
              >
                <Upload size={16} className="mr-2" />
                {flightUploading ? "Uploading..." : "Upload Flight Info"}
              </Button>
            </div>
          </div>

          {preacherData.personalAssistant && (
            <div>
              <h2 className="mb-4 text-xl font-semibold text-brand-forest">Your Personal Assistant</h2>
              <div className="rounded-xl border border-brand-sage/30 bg-white/50 p-5">
                <p className="font-semibold text-brand-forest">{preacherData.personalAssistant.full_name}</p>
                <div className="mt-3 space-y-2 text-sm text-brand-forest/75">
                  {preacherData.personalAssistant.email && (
                    <a href={`mailto:${preacherData.personalAssistant.email}`} className="flex items-center gap-2 hover:text-brand-forest">
                      <Mail size={16} />
                      {preacherData.personalAssistant.email}
                    </a>
                  )}
                  {preacherData.personalAssistant.phone && (
                    <a href={`tel:${preacherData.personalAssistant.phone}`} className="flex items-center gap-2 hover:text-brand-forest">
                      <Phone size={16} />
                      {preacherData.personalAssistant.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}
        </section>
      )}

      {/* Profile Tab */}
      {activeTab === "profile" && (
        <section className="space-y-6">
          <div>
            <h2 className="mb-4 text-xl font-semibold text-brand-forest">Your Profile</h2>
            {preacherData.biography && (
              <div className="rounded-xl border border-brand-sage/30 bg-white/50 p-5">
                <p className="text-sm font-medium text-brand-forest/70">Biography</p>
                <p className="mt-2 whitespace-pre-wrap text-brand-forest">{preacherData.biography}</p>
              </div>
            )}
          </div>

          <div>
            <h2 className="mb-4 text-xl font-semibold text-brand-forest">Upload Biography & Headshot</h2>
            <div className="rounded-xl border border-brand-sage/30 bg-white/50 p-5">
              <label className="block">
                <span className="mb-3 block text-sm font-medium text-brand-forest">Bio Image (JPG, PNG)</span>
                <input
                  type="file"
                  accept=".jpg,.jpeg,.png"
                  onChange={(e) => setBioFile(e.target.files?.[0] || null)}
                  className="w-full text-sm text-brand-forest"
                />
              </label>
              {bioFile && (
                <p className="mt-2 text-sm text-brand-forest/70">Selected: {bioFile.name}</p>
              )}
              <Button
                onClick={handleBioUpload}
                disabled={!bioFile || bioUploading}
                className="mt-4 w-full"
                variant={bioFile ? "default" : "secondary"}
              >
                <Upload size={16} className="mr-2" />
                {bioUploading ? "Uploading..." : "Upload Bio Image"}
              </Button>
            </div>
          </div>
        </section>
      )}
    </main>
  );
}
