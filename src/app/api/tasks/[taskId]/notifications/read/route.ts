import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

export async function PATCH(_request: Request, context: RouteContext) {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  const userId = claims.data?.claims.sub;

  if (claims.error || !userId) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const { taskId } = await context.params;
  const readAt = new Date().toISOString();
  const { error } = await admin
    .from("task_notifications")
    .update({ read_at: readAt })
    .eq("recipient_id", userId)
    .eq("task_id", taskId)
    .is("read_at", null);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, readAt });
}
