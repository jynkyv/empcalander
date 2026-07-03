import { NextResponse } from "next/server";
import { createClient as createSupabaseAdminClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { getSupabaseAdminConfig } from "@/lib/supabase/env";

type ProfileRow = {
  id: string;
  email: string;
  full_name: string;
  role: "admin" | "member";
  color: string | null;
};

export async function GET() {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();

  if (claims.error || !claims.data?.claims.sub) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const adminConfig = getSupabaseAdminConfig();

  if (!adminConfig) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const admin = createSupabaseAdminClient(
    adminConfig.supabaseUrl,
    adminConfig.supabaseSecretKey,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );

  const { data, error } = await admin
    .from("profiles")
    .select("id,email,full_name,role,color")
    .order("created_at", { ascending: true })
    .returns<ProfileRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ users: data || [] });
}
