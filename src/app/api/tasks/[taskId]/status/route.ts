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

const taskStatuses: TaskStatus[] = ["todo", "done"];

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

  if (status === access.task.status) {
    return NextResponse.json({ task: { id: taskId, status } });
  }

  if (
    status === "todo" &&
    access.task.status === "done" &&
    !access.isAdmin &&
    access.task.created_by !== access.userId
  ) {
    return NextResponse.json(
      { error: "完了したタスクを差し戻せるのは依頼者のみです。" },
      { status: 403 },
    );
  }

  const shouldNotifyCompletion = status === "done";
  const updateQuery = admin
    .from("tasks")
    .update({ status })
    .eq("id", taskId)
    .select("id,status");
  const { data, error } = shouldNotifyCompletion
    ? await updateQuery
        .neq("status", "done")
        .maybeSingle<{ id: string; status: TaskStatus }>()
    : await updateQuery.single<{ id: string; status: TaskStatus }>();

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 },
    );
  }

  if (!data) {
    return NextResponse.json({ task: { id: taskId, status } });
  }

  if (shouldNotifyCompletion) {
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
