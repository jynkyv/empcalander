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
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const { data: requesterProfile, error: profileError } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", requesterId)
    .single();

  if (profileError || requesterProfile?.role !== "admin") {
    return NextResponse.json({ error: "管理者権限が必要です。" }, { status: 403 });
  }

  return requesterId;
}

export async function POST(request: Request) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const body = (await request.json()) as CreateUserBody;
  const account = body.account?.trim().toLowerCase();
  const password = body.password;
  const role = body.role || "member";

  if (!account || !password) {
    return NextResponse.json(
      { error: "アカウントとパスワードは必須です。" },
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
      { error: error?.message || "アカウントの作成に失敗しました。" },
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
    await admin.auth.admin.deleteUser(data.user.id);

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
      { error: "Supabase 管理用の環境変数が不足しています。" },
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
    return NextResponse.json({ error: "userId は必須です。" }, { status: 400 });
  }

  if (userId === requesterId) {
    return NextResponse.json(
      { error: "自分のアカウントは削除できません。" },
      { status: 400 },
    );
  }

  const { error } = await admin.auth.admin.deleteUser(userId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}
