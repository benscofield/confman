import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

function getAccessTokenFromRequest(request: NextRequest): string | null {
  const authorizationHeader = request.headers.get("authorization");
  if (authorizationHeader?.toLowerCase().startsWith("bearer ")) {
    const token = authorizationHeader.slice(7).trim();
    if (token.length > 0) {
      return token;
    }
  }
  return null;
}

export async function GET(request: NextRequest) {
  try {
    const accessToken = getAccessTokenFromRequest(request);
    if (!accessToken) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const supabase = createServerSupabaseClient();
    const userResult = await supabase.auth.getUser(accessToken);

    if (userResult.error || !userResult.data.user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { data: preacherData, error: preacherError } = await supabase
      .from("church_preachers")
      .select("id, full_name, email, phone, ministry_name, biography")
      .eq("email", userResult.data.user.email)
      .maybeSingle();

    if (preacherError || !preacherData) {
      return NextResponse.json({ error: "Preacher not found" }, { status: 404 });
    }

    // Fetch speaking slots
    const { data: speakingSlots = [], error: slotsError } = await supabase
      .from("preacher_speaking_slots")
      .select("id, service_name, starts_at, ends_at, altar_call, stage_assignment")
      .eq("church_preacher_id", preacherData.id)
      .order("starts_at", { ascending: true });

    if (slotsError) {
      console.error("Error fetching speaking slots:", slotsError);
    }

    // Fetch logistics
    const { data: logistics, error: logisticsError } = await supabase
      .from("preacher_logistics")
      .select(
        "hotel_name, room_number, check_in_at, check_out_at, dietary_notes, hospitality_notes, flight_number, flight_arrival_at, flight_departure_at, pickup_notes"
      )
      .eq("church_preacher_id", preacherData.id)
      .maybeSingle();

    if (logisticsError && logisticsError.code !== "PGRST116") {
      console.error("Error fetching logistics:", logisticsError);
    }

    // Fetch personal assistant assignment
    let personalAssistant: PersonalAssistant | null = null;
    const { data: paAssignments, error: paError } = await supabase
      .from("preacher_pa_assignments")
      .select("church_personal_assistants(id, full_name, email, phone, notes)")
      .eq("church_preacher_id", preacherData.id)
      .maybeSingle();

    if (!paError && paAssignments?.church_personal_assistants) {
      const pa = paAssignments.church_personal_assistants;
      if (Array.isArray(pa)) {
        personalAssistant = pa[0] as PersonalAssistant;
      } else {
        personalAssistant = pa as PersonalAssistant;
      }
    }

    const response: PreacherData = {
      id: preacherData.id,
      full_name: preacherData.full_name,
      email: preacherData.email,
      phone: preacherData.phone,
      ministry_name: preacherData.ministry_name,
      biography: preacherData.biography,
      speakingSlots: (speakingSlots as SpeakingSlot[]) || [],
      logistics: logistics || null,
      personalAssistant: personalAssistant,
    };

    return NextResponse.json(response);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
