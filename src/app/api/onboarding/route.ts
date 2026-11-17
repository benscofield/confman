import { NextResponse } from "next/server";

import { createServerSupabaseClient } from "@/lib/supabase/server";

function parseName(fullName: string) {
  const parts = fullName.trim().split(/\s+/);
  return {
    firstName: parts[0] ?? fullName.trim(),
    lastName: parts.length > 1 ? parts.slice(1).join(" ") : null,
  };
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    churchName?: string;
    churchAddress?: string;
    churchPhone?: string;
    churchEmail?: string;
    adminName?: string;
    adminEmail?: string;
    adminPhone?: string;
    adminPassword?: string;
  };

  const requiredFields = [
    body.churchName,
    body.churchAddress,
    body.churchPhone,
    body.churchEmail,
    body.adminName,
    body.adminEmail,
    body.adminPhone,
    body.adminPassword,
  ];

  if (requiredFields.some((value) => !value || String(value).trim().length === 0)) {
    return NextResponse.json({ error: "All onboarding fields are required." }, { status: 400 });
  }

  const churchName = body.churchName as string;
  const churchAddress = body.churchAddress as string;
  const churchPhone = body.churchPhone as string;
  const churchEmail = body.churchEmail as string;
  const adminName = body.adminName as string;
  const adminEmail = body.adminEmail as string;
  const adminPhone = body.adminPhone as string;
  const adminPassword = body.adminPassword as string;

  const supabase = createServerSupabaseClient();
  const churchResult = await supabase
    .from("churches")
    .insert({
      name: churchName,
      address_line1: churchAddress,
      phone: churchPhone,
      email: churchEmail,
      is_active: true,
    })
    .select("id, name")
    .single();

  if (churchResult.error || !churchResult.data) {
    return NextResponse.json({ error: churchResult.error?.message ?? "Unable to create church." }, { status: 500 });
  }

  const church = churchResult.data;

  const authUserResult = await supabase.auth.admin.createUser({
    email: adminEmail,
    password: adminPassword,
    email_confirm: true,
    user_metadata: {
      full_name: adminName,
      phone: adminPhone,
      church_id: church.id,
    },
  });

  if (authUserResult.error || !authUserResult.data.user) {
    await supabase.from("churches").delete().eq("id", church.id);
    return NextResponse.json({ error: authUserResult.error?.message ?? "Unable to create admin user." }, { status: 500 });
  }

  const authUser = authUserResult.data.user;
  const { firstName, lastName } = parseName(adminName);

  const profileResult = await supabase.from("profiles").insert({
    id: authUser.id,
    full_name: adminName,
    phone: adminPhone,
    role: "admin",
  });

  if (profileResult.error) {
    await supabase.auth.admin.deleteUser(authUser.id);
    await supabase.from("churches").delete().eq("id", church.id);
    return NextResponse.json({ error: profileResult.error.message }, { status: 500 });
  }

  const appUserResult = await supabase
    .from("users")
    .insert({
      auth_user_id: authUser.id,
      church_id: church.id,
      email: adminEmail,
      full_name: adminName,
      first_name: firstName,
      last_name: lastName,
      phone: adminPhone,
      role: "admin",
      is_active: true,
    })
    .select("id")
    .single();

  if (appUserResult.error || !appUserResult.data) {
    await supabase.from("profiles").delete().eq("id", authUser.id);
    await supabase.auth.admin.deleteUser(authUser.id);
    await supabase.from("churches").delete().eq("id", church.id);
    return NextResponse.json({ error: appUserResult.error?.message ?? "Unable to create admin record." }, { status: 500 });
  }

  return NextResponse.json(
    {
      church: churchResult.data,
      admin: {
        id: authUser.id,
        email: adminEmail,
        full_name: adminName,
      },
      app_user_id: appUserResult.data.id,
    },
    { status: 201 },
  );
}