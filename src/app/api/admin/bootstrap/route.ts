import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { getSupabaseAdminConfig } from "@/lib/supabase/env";

const defaultAdminEmail = "admin@ag.local";
const defaultAdminPassword = "admin123";

export async function POST() {
  const adminConfig = getSupabaseAdminConfig();

  if (!adminConfig) {
    return NextResponse.json(
      { error: "Missing Supabase admin environment variables." },
      { status: 500 },
    );
  }

  const admin = createSupabaseAdminClient(adminConfig.supabaseUrl, adminConfig.supabaseSecretKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });

  const { count, error: countError } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "admin");

  if (countError) {
    return NextResponse.json({ error: countError.message }, { status: 400 });
  }

  if ((count || 0) > 0) {
    return NextResponse.json(
      { error: "Admin account already exists." },
      { status: 409 },
    );
  }

  const { data, error } = await admin.auth.admin.createUser({
    email: process.env.BOOTSTRAP_ADMIN_EMAIL || defaultAdminEmail,
    password: process.env.BOOTSTRAP_ADMIN_PASSWORD || defaultAdminPassword,
    email_confirm: true,
    user_metadata: {
      full_name: "admin",
      role: "admin",
    },
  });

  if (error || !data.user) {
    return NextResponse.json(
      { error: error?.message || "Failed to create admin." },
      { status: 400 },
    );
  }

  const email = data.user.email || defaultAdminEmail;
  const { error: profileError } = await admin.from("profiles").upsert({
    id: data.user.id,
    email,
    full_name: "admin",
    role: "admin",
    color: "#2f6fed",
  });

  if (profileError) {
    return NextResponse.json({ error: profileError.message }, { status: 400 });
  }

  return NextResponse.json({
    user: {
      email,
      login: email === defaultAdminEmail ? "admin" : email,
      password:
        email === defaultAdminEmail
          ? defaultAdminPassword
          : "Use BOOTSTRAP_ADMIN_PASSWORD.",
    },
  });
}
