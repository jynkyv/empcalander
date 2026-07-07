import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TaskNotificationType } from "@/lib/notifications/server";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type NotificationRow = {
  id: string;
  task_id: string;
  actor_id: string | null;
  type: TaskNotificationType;
  comment_id: string | null;
  created_at: string;
  read_at: string | null;
};

type TaskTitleRow = {
  id: string;
  title: string;
};

type ProfileRow = {
  color: string | null;
  email: string;
  full_name: string;
  id: string;
};

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

export async function GET() {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  const userId = claims.data?.claims.sub;

  if (claims.error || !userId) {
    return NextResponse.json(
      { error: "認証が必要です。" },
      { headers: noStoreHeaders, status: 401 },
    );
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { headers: noStoreHeaders, status: 500 },
    );
  }

  const { data, error } = await admin
    .from("task_notifications")
    .select("id,task_id,actor_id,type,comment_id,created_at,read_at")
    .eq("recipient_id", userId)
    .order("created_at", { ascending: false })
    .limit(100)
    .returns<NotificationRow[]>();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  const rows = data || [];
  const taskIds = Array.from(new Set(rows.map((row) => row.task_id)));
  const actorIds = Array.from(
    new Set(rows.map((row) => row.actor_id).filter(Boolean) as string[]),
  );
  const [{ data: tasks }, { data: profiles }] = await Promise.all([
    taskIds.length > 0
      ? admin.from("tasks").select("id,title").in("id", taskIds).returns<TaskTitleRow[]>()
      : Promise.resolve({ data: [] as TaskTitleRow[] }),
    actorIds.length > 0
      ? admin
          .from("profiles")
          .select("id,email,full_name,color")
          .in("id", actorIds)
          .returns<ProfileRow[]>()
      : Promise.resolve({ data: [] as ProfileRow[] }),
  ]);
  const taskById = new Map((tasks || []).map((task) => [task.id, task]));
  const profileById = new Map((profiles || []).map((profile) => [profile.id, profile]));

  return NextResponse.json(
    {
      notifications: rows.map((row) => {
        const actor = row.actor_id ? profileById.get(row.actor_id) : null;

        return {
          actorColor: actor?.color || "#8a94a6",
          actorId: row.actor_id,
          actorName: actor?.full_name || actor?.email || "不明",
          commentId: row.comment_id,
          createdAt: row.created_at,
          id: row.id,
          readAt: row.read_at,
          taskId: row.task_id,
          taskTitle: taskById.get(row.task_id)?.title || "タスク",
          type: row.type,
        };
      }),
    },
    { headers: noStoreHeaders },
  );
}
