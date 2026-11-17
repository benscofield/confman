import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

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

export async function POST(request: NextRequest) {
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

    const { data: preacherData } = await supabase
      .from("church_preachers")
      .select("id")
      .eq("email", userResult.data.user.email)
      .maybeSingle();

    if (!preacherData) {
      return NextResponse.json({ error: "Preacher not found" }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file) {
      return NextResponse.json({ error: "No file provided" }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const validTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!validTypes.includes(file.type)) {
      return NextResponse.json({ error: "Invalid file type. Only JPG, PNG, and PDF allowed." }, { status: 400 });
    }

    const timestamp = Date.now();
    const filename = `preacher-flight-${preacherData.id}-${timestamp}${file.name.substring(file.name.lastIndexOf("."))}`;
    const buffer = await file.arrayBuffer();

    const { error: uploadError } = await supabase.storage
      .from("preacher-uploads")
      .upload(`flights/${filename}`, buffer, {
        contentType: file.type,
        upsert: false,
      });

    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const publicUrl = supabase.storage.from("preacher-uploads").getPublicUrl(`flights/${filename}`).data.publicUrl;

    // Store flight document reference
    const { error: insertError } = await supabase.from("preacher_flight_documents").insert({
      church_preacher_id: preacherData.id,
      document_url: publicUrl,
      filename: file.name,
      file_type: file.type,
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, url: publicUrl });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
