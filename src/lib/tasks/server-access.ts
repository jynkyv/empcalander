import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";

type TaskAccessRow = {
  id: string;
  created_by: string;
  task_assignees?: { user_id: string }[] | null;
};

type ProfileRoleRow = {
  role: "admin" | "member";
};

export type TaskAccessResult =
  | {
      isAdmin: boolean;
      ok: true;
      task: TaskAccessRow;
      userId: string;
    }
  | {
      ok: false;
      response: NextResponse;
    };

export async function requireTaskAccess(
  admin: SupabaseClient,
  taskId: string,
): Promise<TaskAccessResult> {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  const userId = claims.data?.claims.sub;

  if (claims.error || !userId) {
    return {
      ok: false,
      response: NextResponse.json({ error: "認証が必要です。" }, { status: 401 }),
    };
  }

  const { data: task, error: taskError } = await admin
    .from("tasks")
    .select("id,created_by,task_assignees(user_id)")
    .eq("id", taskId)
    .maybeSingle<TaskAccessRow>();

  if (taskError) {
    return {
      ok: false,
      response: NextResponse.json({ error: taskError.message }, { status: 400 }),
    };
  }

  if (!task) {
    return {
      ok: false,
      response: NextResponse.json({ error: "タスクが見つかりません。" }, { status: 404 }),
    };
  }

  const { data: profile } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRoleRow>();

  const isAdmin = profile?.role === "admin";
  const isAssignee = (task.task_assignees || []).some(
    (assignee) => assignee.user_id === userId,
  );

  if (!isAdmin && task.created_by !== userId && !isAssignee) {
    return {
      ok: false,
      response: NextResponse.json({ error: "タスクへの権限がありません。" }, { status: 403 }),
    };
  }

  return { isAdmin, ok: true, task, userId };
}
