import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AttachmentRow = {
  id: string;
  task_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string;
  file_size: number | null;
  mime_type: string | null;
  oss_object_key: string | null;
  created_at: string;
};

type CreateAttachmentBody = {
  fileName?: string;
  fileUrl?: string;
  fileSize?: number;
  mimeType?: string;
  ossObjectKey?: string;
};

const attachmentSelect =
  "id,task_id,uploaded_by,file_name,file_url,file_size,mime_type,oss_object_key,created_at";

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
    .from("task_attachments")
    .select(attachmentSelect)
    .eq("task_id", taskId)
    .order("created_at", { ascending: true })
    .returns<AttachmentRow[]>();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ attachments: data || [] });
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

  const body = (await request.json()) as CreateAttachmentBody;
  const fileName = body.fileName?.trim();
  const fileUrl = body.fileUrl?.trim();

  if (!fileName || !fileUrl) {
    return NextResponse.json(
      { error: "ファイル名と URL は必須です。" },
      { status: 400 },
    );
  }

  try {
    new URL(fileUrl);
  } catch {
    return NextResponse.json(
      { error: "URL の形式が正しくありません。" },
      { status: 400 },
    );
  }

  const { data, error } = await admin
    .from("task_attachments")
    .insert({
      file_name: fileName,
      file_size: body.fileSize,
      file_url: fileUrl,
      mime_type: body.mimeType?.trim() || null,
      oss_object_key: body.ossObjectKey?.trim() || null,
      task_id: taskId,
      uploaded_by: access.userId,
    })
    .select(attachmentSelect)
    .single<AttachmentRow>();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message || "添付ファイルの登録に失敗しました。" },
      { status: 400 },
    );
  }

  return NextResponse.json({ attachment: data });
}
