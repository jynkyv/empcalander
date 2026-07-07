import { NextResponse } from "next/server";
import {
  contentDispositionHeader,
  contentTypeForAttachment,
} from "@/lib/attachments/response";
import { getAttachmentPreviewData } from "@/lib/attachments/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const { attachmentId } = await context.params;
  const result = await getAttachmentPreviewData(attachmentId);

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error },
      { status: result.status },
    );
  }

  const { attachment } = result;
  const upstream = await fetch(attachment.fileUrl, { cache: "no-store" });

  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(
      { error: "ファイルの読み込みに失敗しました。" },
      { status: 502 },
    );
  }

  const headers = new Headers();
  const contentLength = upstream.headers.get("content-length");

  headers.set("Cache-Control", "private, max-age=60");
  headers.set(
    "Content-Disposition",
    contentDispositionHeader("attachment", attachment.fileName),
  );
  headers.set(
    "Content-Type",
    contentTypeForAttachment(
      attachment.fileName,
      attachment.mimeType || upstream.headers.get("content-type"),
    ),
  );

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(upstream.body, {
    headers,
    status: 200,
  });
}
