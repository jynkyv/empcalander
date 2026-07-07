import { NextResponse } from "next/server";
import { getAttachmentPreviewData } from "@/lib/attachments/server";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ attachmentId: string }>;
};

function contentDispositionInline(fileName: string) {
  const fallback = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 120);

  return `inline; filename="${fallback || "preview"}"; filename*=UTF-8''${encodeURIComponent(fileName)}`;
}

function contentTypeFor(fileName: string, preferred?: string | null) {
  if (preferred && !preferred.toLowerCase().startsWith("application/octet-stream")) {
    return preferred;
  }

  const extension = fileName.toLowerCase().split(".").at(-1);

  switch (extension) {
    case "csv":
      return "text/csv; charset=utf-8";
    case "gif":
      return "image/gif";
    case "jpg":
    case "jpeg":
      return "image/jpeg";
    case "json":
      return "application/json; charset=utf-8";
    case "md":
    case "txt":
      return "text/plain; charset=utf-8";
    case "pdf":
      return "application/pdf";
    case "png":
      return "image/png";
    case "svg":
      return "image/svg+xml";
    case "webp":
      return "image/webp";
    default:
      return preferred || "application/octet-stream";
  }
}

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
  const contentType = contentTypeFor(
    attachment.fileName,
    attachment.mimeType || upstream.headers.get("content-type"),
  );
  const contentLength = upstream.headers.get("content-length");

  headers.set("Cache-Control", "private, max-age=60");
  headers.set("Content-Disposition", contentDispositionInline(attachment.fileName));
  headers.set("Content-Type", contentType);

  if (contentLength) {
    headers.set("Content-Length", contentLength);
  }

  return new Response(upstream.body, {
    headers,
    status: 200,
  });
}
