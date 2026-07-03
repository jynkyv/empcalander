import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import {
  accountToAuthEmail,
  getAccountValidationError,
} from "@/lib/auth-config";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminConfig } from "@/lib/supabase/env";

type CreateUserBody = {
  account?: string;
  password?: string;
  role?: "admin" | "member";
};

type DeleteUserBody = {
  userId?: string;
};

function createAdminClient() {
  const adminConfig = getSupabaseAdminConfig();

  if (!adminConfig) {
    return null;
  }

  return createSupabaseAdminClient(
    adminConfig.supabaseUrl,
    adminConfig.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
}

async function requireAdminRequester() {
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

  return requesterId;
}

export async function POST(request: Request) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Missing Supabase admin environment variables." },
      { status: 500 },
    );
  }

  const body = (await request.json()) as CreateUserBody;
  const account = body.account?.trim().toLowerCase();
  const password = body.password;
  const role = body.role || "member";

  if (!account || !password) {
    return NextResponse.json(
      { error: "account and password are required." },
      { status: 400 },
    );
  }

  const accountValidationError = getAccountValidationError(account);

  if (accountValidationError) {
    return NextResponse.json(
      { error: accountValidationError },
      { status: 400 },
    );
  }

  const requesterId = await requireAdminRequester();

  if (typeof requesterId !== "string") {
    return requesterId;
  }

  const email = accountToAuthEmail(account);
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      full_name: account,
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
    full_name: account,
    role,
    created_by: requesterId,
  });

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  return NextResponse.json({
    user: {
      account,
      id: data.user.id,
      role,
    },
  });
}

export async function DELETE(request: Request) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Missing Supabase admin environment variables." },
      { status: 500 },
    );
  }

  const requesterId = await requireAdminRequester();

  if (typeof requesterId !== "string") {
    return requesterId;
  }

  const body = (await request.json()) as DeleteUserBody;
  const userId = body.userId?.trim();

  if (!userId) {
    return NextResponse.json({ error: "userId is required." }, { status: 400 });
  }

  if (userId === requesterId) {
    return NextResponse.json(
      { error: "Cannot delete your own account." },
      { status: 400 },
    );
  }

  const { error: tasksError } = await admin
    .from("tasks")
    .delete()
    .eq("created_by", userId);

  if (tasksError) {
    return NextResponse.json({ error: tasksError.message }, { status: 400 });
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
