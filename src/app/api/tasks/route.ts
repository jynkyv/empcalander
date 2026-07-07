import { NextResponse } from "next/server";
import { createTaskNotifications } from "@/lib/notifications/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { TaskPriority } from "@/lib/types";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type ProfileRoleRow = {
  role: "admin" | "member";
};

type TaskRow = {
  id: string;
  title: string;
  description: string | null;
  starts_at: string;
  ends_at: string | null;
  status: "todo" | "doing" | "done";
  priority: TaskPriority;
  created_by: string;
  task_assignees?: { user_id: string }[] | null;
};

type TaskAssigneeRow = {
  task_id: string;
};

type ProfileIdRow = {
  id: string;
};

type CreateTaskBody = {
  assigneeIds?: string[];
  description?: string;
  endsAt?: string;
  priority?: TaskPriority;
  startsAt?: string;
  title?: string;
};

const taskSelect =
  "id,title,description,starts_at,ends_at,status,priority,created_by,task_assignees(user_id)";
const taskPriorities: TaskPriority[] = ["low", "normal", "high"];
const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0",
};

async function getCurrentUserId() {
  const supabase = await createClient();
  const claims = await supabase.auth.getClaims();
  const userId = claims.data?.claims.sub;

  if (claims.error || !userId) {
    return null;
  }

  return userId;
}

function taskSort(a: TaskRow, b: TaskRow) {
  return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
}

function uniqueIds(ids: string[]) {
  return Array.from(new Set(ids.map((id) => id.trim()).filter(Boolean)));
}

export async function GET() {
  const userId = await getCurrentUserId();

  if (!userId) {
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

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("role")
    .eq("id", userId)
    .maybeSingle<ProfileRoleRow>();

  if (profileError) {
    return NextResponse.json(
      { error: profileError.message },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  if (!profile) {
    return NextResponse.json(
      { error: "現在のアカウントが見つかりません。" },
      { headers: noStoreHeaders, status: 404 },
    );
  }

  if (profile.role === "admin") {
    const { data, error } = await admin
      .from("tasks")
      .select(taskSelect)
      .order("starts_at", { ascending: true })
      .returns<TaskRow[]>();

    if (error) {
      return NextResponse.json(
        { error: error.message },
        { headers: noStoreHeaders, status: 400 },
      );
    }

    return NextResponse.json({ tasks: data || [] }, { headers: noStoreHeaders });
  }

  const [{ data: createdTasks, error: createdError }, { data: assigneeRows, error: assigneeError }] =
    await Promise.all([
      admin
        .from("tasks")
        .select(taskSelect)
        .eq("created_by", userId)
        .returns<TaskRow[]>(),
      admin
        .from("task_assignees")
        .select("task_id")
        .eq("user_id", userId)
        .returns<TaskAssigneeRow[]>(),
    ]);

  if (createdError || assigneeError) {
    return NextResponse.json(
      { error: createdError?.message || assigneeError?.message },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  const assignedTaskIds = uniqueIds((assigneeRows || []).map((row) => row.task_id));
  const assignedTasks =
    assignedTaskIds.length > 0
      ? await admin
          .from("tasks")
          .select(taskSelect)
          .in("id", assignedTaskIds)
          .returns<TaskRow[]>()
      : { data: [] as TaskRow[], error: null };

  if (assignedTasks.error) {
    return NextResponse.json(
      { error: assignedTasks.error.message },
      { headers: noStoreHeaders, status: 400 },
    );
  }

  const taskById = new Map<string, TaskRow>();

  [...(createdTasks || []), ...(assignedTasks.data || [])].forEach((task) => {
    taskById.set(task.id, task);
  });

  return NextResponse.json(
    { tasks: Array.from(taskById.values()).sort(taskSort) },
    { headers: noStoreHeaders },
  );
}

export async function POST(request: Request) {
  const userId = await getCurrentUserId();

  if (!userId) {
    return NextResponse.json({ error: "認証が必要です。" }, { status: 401 });
  }

  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  let body: CreateTaskBody;

  try {
    body = (await request.json()) as CreateTaskBody;
  } catch {
    return NextResponse.json(
      { error: "リクエストの形式が正しくありません。" },
      { status: 400 },
    );
  }

  const title = body.title?.trim();
  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  const priority = body.priority || "normal";
  const assigneeIds = uniqueIds(body.assigneeIds || []);

  if (!title) {
    return NextResponse.json(
      { error: "タスク名を入力してください。" },
      { status: 400 },
    );
  }

  if (!startsAt || Number.isNaN(startsAt.getTime())) {
    return NextResponse.json(
      { error: "開始日時が正しくありません。" },
      { status: 400 },
    );
  }

  if (!endsAt || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json(
      { error: "終了日時が正しくありません。" },
      { status: 400 },
    );
  }

  if (!taskPriorities.includes(priority)) {
    return NextResponse.json(
      { error: "優先度の値が正しくありません。" },
      { status: 400 },
    );
  }

  if (assigneeIds.length === 0) {
    return NextResponse.json(
      { error: "担当者を選択してください。" },
      { status: 400 },
    );
  }

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .in("id", assigneeIds)
    .returns<ProfileIdRow[]>();

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 400 });
  }

  if ((profiles || []).length !== assigneeIds.length) {
    return NextResponse.json(
      { error: "選択された担当者が見つかりません。" },
      { status: 400 },
    );
  }

  const { data: task, error: taskError } = await admin
    .from("tasks")
    .insert({
      created_by: userId,
      description: body.description?.trim() || "補足説明はありません。",
      ends_at: endsAt.toISOString(),
      priority,
      starts_at: startsAt.toISOString(),
      status: "todo",
      title,
    })
    .select(taskSelect)
    .single<TaskRow>();

  if (taskError || !task) {
    return NextResponse.json(
      { error: taskError?.message || "タスクの作成に失敗しました。" },
      { status: 400 },
    );
  }

  const assigneeRows = assigneeIds.map((assigneeId) => ({
    assigned_by: userId,
    task_id: task.id,
    user_id: assigneeId,
  }));
  const { error: assigneeError } = await admin
    .from("task_assignees")
    .insert(assigneeRows);

  if (assigneeError) {
    await admin.from("tasks").delete().eq("id", task.id);

    return NextResponse.json({ error: assigneeError.message }, { status: 400 });
  }

  const taskWithAssignees = {
    ...task,
    task_assignees: assigneeRows.map((assignee) => ({
      user_id: assignee.user_id,
    })),
  };
  const notificationResult = await createTaskNotifications({
    actorId: userId,
    admin,
    task: taskWithAssignees,
    taskId: task.id,
    type: "assigned",
  });

  if (notificationResult?.error) {
    console.error("Failed to create assignment notifications", notificationResult.error);
  }

  return NextResponse.json(
    { task: taskWithAssignees },
    { headers: noStoreHeaders, status: 201 },
  );
}
