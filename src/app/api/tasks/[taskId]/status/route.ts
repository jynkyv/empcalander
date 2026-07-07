import { NextResponse } from "next/server";
import { createTaskNotifications } from "@/lib/notifications/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";
import type { TaskStatus } from "@/lib/types";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type UpdateStatusBody = {
  status?: TaskStatus;
};

const taskStatuses: TaskStatus[] = ["todo", "doing", "done"];

export async function PATCH(request: Request, context: RouteContext) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const { taskId } = await context.params;
  const body = (await request.json()) as UpdateStatusBody;
  const status = body.status;

  if (!status || !taskStatuses.includes(status)) {
    return NextResponse.json(
      { error: "ステータスの値が正しくありません。" },
      { status: 400 },
    );
  }

  const access = await requireTaskAccess(admin, taskId);

  if (!access.ok) {
    return access.response;
  }

  const { data, error } = await admin
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select("id,status")
    .single<{ id: string; status: TaskStatus }>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "ステータスの更新に失敗しました。" },
      { status: 400 },
    );
  }

  if (status === "done" && access.task.status !== "done") {
    const notificationResult = await createTaskNotifications({
      actorId: access.userId,
      admin,
      task: access.task,
      taskId,
      type: "done",
    });

    if (notificationResult?.error) {
      console.error("Failed to create completion notifications", notificationResult.error);
    }
  }

  return NextResponse.json({ task: data });
}
