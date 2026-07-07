import { NextResponse } from "next/server";
import { createTaskNotifications } from "@/lib/notifications/server";
import { uploadFileToOss, type UploadedOssFile } from "@/lib/oss/upload";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";

export const runtime = "nodejs";

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

type CreateCommentAttachmentBody = {
  fileName?: string;
  fileSize?: number;
  fileUrl?: string;
  mimeType?: string;
  ossObjectKey?: string;
};

type CreateCommentBody = {
  attachments?: CreateCommentAttachmentBody[];
  body?: string;
};

type ParsedCommentPayload = {
  attachments: Array<
    CreateCommentAttachmentBody | (UploadedOssFile & { fileUrl: string })
  >;
  body: string;
};

function isUploadFile(value: FormDataEntryValue): value is File {
  return typeof value !== "string" && value.size > 0;
}

async function parseCommentPayload(request: Request, taskId: string) {
  const contentType = request.headers.get("content-type") || "";

  if (contentType.includes("multipart/form-data")) {
    const formData = await request.formData();
    const body = String(formData.get("body") || "").trim();
    const files = formData.getAll("attachments").filter(isUploadFile);
    const attachments = await Promise.all(
      files.map((file) => uploadFileToOss(taskId, file)),
    );

    return { attachments, body } satisfies ParsedCommentPayload;
  }

  const body = (await request.json()) as CreateCommentBody;
  const commentBody = body.body?.trim() || "";
  const attachments = (body.attachments || [])
    .map((attachment) => ({
      fileName: attachment.fileName?.trim(),
      fileSize: attachment.fileSize,
      fileUrl: attachment.fileUrl?.trim(),
      mimeType: attachment.mimeType?.trim(),
      ossObjectKey: attachment.ossObjectKey?.trim(),
    }))
    .filter((attachment) => attachment.fileName);

  return { attachments, body: commentBody } satisfies ParsedCommentPayload;
}

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

  let payload: ParsedCommentPayload;

  try {
    payload = await parseCommentPayload(request, taskId);
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "添付ファイルのアップロードに失敗しました。",
      },
      { status: 400 },
    );
  }

  if (!payload.body && payload.attachments.length === 0) {
    return NextResponse.json(
      { error: "コメントまたは添付ファイルを入力してください。" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("task_comments")
    .insert({
      author_id: access.userId,
      body: payload.body,
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

  if (payload.attachments.length > 0) {
    const { error: attachmentError } = await admin.from("task_attachments").insert(
      payload.attachments.map((attachment) => ({
        comment_id: data.id,
        file_name: attachment.fileName,
        file_size: attachment.fileSize,
        file_url: attachment.fileUrl || null,
        mime_type: attachment.mimeType || null,
        oss_object_key: attachment.ossObjectKey || null,
        task_id: taskId,
        uploaded_by: access.userId,
        upload_status: attachment.fileUrl ? "uploaded" : "pending",
      })),
    );

    if (attachmentError) {
      await admin.from("task_comments").delete().eq("id", data.id);

      return NextResponse.json({ error: attachmentError.message }, { status: 400 });
    }
  }

  const notificationResult = await createTaskNotifications({
    actorId: access.userId,
    admin,
    commentId: data.id,
    task: access.task,
    taskId,
    type: "comment",
  });

  if (notificationResult?.error) {
    console.error("Failed to create comment notifications", notificationResult.error);
  }

  return NextResponse.json({ comment: data });
}
