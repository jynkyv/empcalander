import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type CommentRow = {
  id: string;
  task_id: string;
  author_id: string;
  body: string;
  created_at: string;
};

type CreateCommentBody = {
  body?: string;
};

export async function GET(_request: Request, context: RouteContext) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const { taskId } = await context.params;
  const access = await requireTaskAccess(admin, taskId);

  if (!access.ok) {
    return access.response;
  }

  const { data, error } = await admin
    .from("task_comments")
    .select("id,task_id,author_id,body,created_at")
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .returns<CommentRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ comments: data || [] });
}

export async function POST(request: Request, context: RouteContext) {
  const admin = createAdminClient();

  if (!admin) {
    return NextResponse.json(
      { error: "Supabase 管理用の環境変数が不足しています。" },
      { status: 500 },
    );
  }

  const { taskId } = await context.params;
  const access = await requireTaskAccess(admin, taskId);

  if (!access.ok) {
    return access.response;
  }

  const body = (await request.json()) as CreateCommentBody;
  const commentBody = body.body?.trim();

  if (!commentBody) {
    return NextResponse.json(
      { error: "コメントを入力してください。" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("task_comments")
    .insert({
      author_id: access.userId,
      body: commentBody,
      task_id: taskId,
    })
    .select("id,task_id,author_id,body,created_at")
    .single<CommentRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "コメントの追加に失敗しました。" },
      { status: 400 },
    );
  }

  return NextResponse.json({ comment: data });
}
