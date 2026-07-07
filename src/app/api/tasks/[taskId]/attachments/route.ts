import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";

type RouteContext = {
  params: Promise<{ taskId: string }>;
};

type AttachmentRow = {
  id: string;
  task_id: string;
  comment_id: string;
  uploaded_by: string | null;
  file_name: string;
  file_url: string | null;
  file_size: number | null;
  mime_type: string | null;
  oss_object_key: string | null;
  upload_status: "pending" | "uploaded";
  created_at: string;
};

const attachmentSelect =
  "id,task_id,comment_id,uploaded_by,file_name,file_url,file_size,mime_type,oss_object_key,upload_status,created_at";

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
