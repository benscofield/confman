import { NextRequest, NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

    const body = (await request.json()) as {
      title?: string;
      description?: string;
      category?: string;
      priority?: string;
    };

    if (!body.title || !body.description || !body.category || !body.priority) {
      return NextResponse.json(
        { error: "title, description, category, and priority are required" },
        { status: 400 }
      );
    }

    const { error: insertError } = await supabase.from("preacher_accommodation_requests").insert({
      church_preacher_id: preacherData.id,
      title: body.title,
      description: body.description,
      category: body.category,
      priority: body.priority,
      status: "pending",
    });

    if (insertError) {
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
