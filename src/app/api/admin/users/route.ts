import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminConfig } from "@/lib/supabase/env";

type CreateUserBody = {
  email?: string;
  fullName?: string;
  password?: string;
  role?: "admin" | "member";
};

export async function POST(request: Request) {
  const adminConfig = getSupabaseAdminConfig();

  if (!adminConfig) {
    return NextResponse.json(
      { error: "Missing Supabase admin environment variables." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as CreateUserBody;
  const email = body.email?.trim().toLowerCase();
  const fullName = body.fullName?.trim();
  const password = body.password;
  const role = body.role || "member";

  if (!email || !fullName || !password) {
    return NextResponse.json(
      { error: "email, fullName and password are required." },
      { status: 400 },
    );
  }

  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  const requesterId = claims.data?.claims.sub;

  if (claims.error || !requesterId) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const { data: requesterProfile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .single();

  if (profileError || requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "Admin role required." }, { status: 403 });
  }

  const admin = createSupabaseAdminClient(adminConfig.supabaseUrl, adminConfig.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: fullName,
      role,
    },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message || "Failed to create user." },
      { status: 400 },
    );
  }

  const { error: upsertError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: fullName,
    role,
    created_by: requesterId,
  });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({
    user: {
      id: data.user.id,
      email,
      fullName,
      role,
    },
  });
}
