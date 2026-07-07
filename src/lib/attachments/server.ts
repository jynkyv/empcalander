import { getOssPublicFileUrl } from "@/lib/oss/upload";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireTaskAccess } from "@/lib/tasks/server-access";

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

export type AttachmentPreviewData = {
  createdAt: string;
  fileName: string;
  fileSize?: number;
  fileUrl: string;
  id: string;
  mimeType?: string;
  taskId: string;
  uploadStatus: "pending" | "uploaded";
};

const attachmentSelect =
  "id,task_id,comment_id,uploaded_by,file_name,file_url,file_size,mime_type,oss_object_key,upload_status,created_at";

export async function getAttachmentPreviewData(attachmentId: string): Promise<
  | {
      attachment: AttachmentPreviewData;
      ok: true;
    }
  | {
      error: string;
      ok: false;
      status: number;
    }
> {
  const admin = createAdminClient();

  if (!admin) {
    return {
      error: "Supabase 管理用の環境変数が不足しています。",
      ok: false,
      status: 500,
    };
  }

  const { data, error } = await admin
    .from("task_attachments")
    .select(attachmentSelect)
    .eq("id", attachmentId)
    .maybeSingle<AttachmentRow>();

  if (error) {
    return { error: error.message, ok: false, status: 400 };
  }

  if (!data) {
    return {
      error: "ファイルが見つかりません。",
      ok: false,
      status: 404,
    };
  }

  const access = await requireTaskAccess(admin, data.task_id);

  if (!access.ok) {
    return {
      error: "ファイルを表示する権限がありません。",
      ok: false,
      status: access.response.status,
    };
  }

  const fileUrl = getOssPublicFileUrl(data.oss_object_key);

  if (!fileUrl) {
    return {
      error: "プレビュー用のファイル URL がありません。",
      ok: false,
      status: 404,
    };
  }

  return {
    attachment: {
      createdAt: data.created_at,
      fileName: data.file_name,
      fileSize: data.file_size || undefined,
      fileUrl,
      id: data.id,
      mimeType: data.mime_type || undefined,
      taskId: data.task_id,
      uploadStatus: data.upload_status,
    },
    ok: true,
  };
}
