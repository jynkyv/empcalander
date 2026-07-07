import Image from "next/image";
import Link from "next/link";
import { WorkspaceShell } from "@/components/workspace-shell";
import { getAttachmentPreviewData } from "@/lib/attachments/server";

export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ attachmentId: string }>;
};

type PreviewMode = "audio" | "image" | "inline" | "office" | "unsupported" | "video";

const officeExtensions = new Set([
  "doc",
  "docx",
  "ppt",
  "pptx",
  "xls",
  "xlsx",
]);

const inlineTextExtensions = new Set(["csv", "json", "log", "md", "txt"]);

function extensionOf(fileName: string) {
  const parts = fileName.toLowerCase().split(".");

  return parts.length > 1 ? parts.at(-1) || "" : "";
}

function previewModeFor(fileName: string, mimeType?: string): PreviewMode {
  const mime = (mimeType || "").toLowerCase();
  const extension = extensionOf(fileName);

  if (mime.startsWith("image/")) return "image";
  if (mime.startsWith("video/")) return "video";
  if (mime.startsWith("audio/")) return "audio";
  if (mime === "application/pdf" || extension === "pdf") return "inline";
  if (mime.startsWith("text/") || inlineTextExtensions.has(extension)) return "inline";
  if (
    officeExtensions.has(extension) ||
    mime.includes("wordprocessingml") ||
    mime.includes("spreadsheetml") ||
    mime.includes("presentationml") ||
    mime === "application/msword" ||
    mime === "application/vnd.ms-excel" ||
    mime === "application/vnd.ms-powerpoint"
  ) {
    return "office";
  }

  return "unsupported";
}

function formatFileSize(size?: number) {
  if (!size) return "サイズ不明";

  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round(size / 102.4) / 10} KB`;

  return `${Math.round(size / 1024 / 102.4) / 10} MB`;
}

function PreviewError({
  message,
}: {
  message: string;
}) {
  return (
    <WorkspaceShell eyebrow="ファイルプレビュー" title="ファイルを表示できません">
      <main className="attachment-preview-page">
        <section className="attachment-preview-empty">
          <h1>ファイルを表示できません</h1>
          <p>{message}</p>
          <Link className="preview-action-button" href="/">
            カレンダーへ戻る
          </Link>
        </section>
      </main>
    </WorkspaceShell>
  );
}

export default async function AttachmentPreviewPage({ params }: PageProps) {
  const { attachmentId } = await params;
  const result = await getAttachmentPreviewData(attachmentId);

  if (!result.ok) {
    return <PreviewError message={result.error} />;
  }

  const { attachment } = result;
  const inlineUrl = `/api/attachments/${attachment.id}/inline`;
  const mode = previewModeFor(attachment.fileName, attachment.mimeType);
  const officeUrl = `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
    attachment.fileUrl,
  )}`;

  return (
    <WorkspaceShell
      actions={
        <a
          className="preview-action-button"
          href={attachment.fileUrl}
          rel="noreferrer"
          target="_blank"
        >
          原ファイルを開く
        </a>
      }
      eyebrow="ファイルプレビュー"
      title="プレビュー"
    >
      <main className="attachment-preview-page">
        <section className="attachment-preview-header">
          <div>
            <p className="attachment-preview-label">ファイル</p>
            <h1>{attachment.fileName}</h1>
          </div>
          <dl>
            <div>
              <dt>形式</dt>
              <dd>{attachment.mimeType || extensionOf(attachment.fileName) || "不明"}</dd>
            </div>
            <div>
              <dt>サイズ</dt>
              <dd>{formatFileSize(attachment.fileSize)}</dd>
            </div>
          </dl>
        </section>

        <section className="attachment-preview-stage">
          {mode === "image" ? (
            <div className="attachment-preview-image-wrap">
              <Image
                alt={attachment.fileName}
                className="attachment-preview-image"
                fill
                sizes="100vw"
                src={inlineUrl}
                unoptimized
              />
            </div>
          ) : null}
          {mode === "video" ? (
            <video className="attachment-preview-media" controls src={inlineUrl} />
          ) : null}
          {mode === "audio" ? (
            <div className="attachment-preview-audio">
              <audio controls src={inlineUrl} />
            </div>
          ) : null}
          {mode === "inline" ? (
            <iframe
              className="attachment-preview-frame"
              src={inlineUrl}
              title={attachment.fileName}
            />
          ) : null}
          {mode === "office" ? (
            <iframe
              className="attachment-preview-frame"
              src={officeUrl}
              title={attachment.fileName}
            />
          ) : null}
          {mode === "unsupported" ? (
            <div className="attachment-preview-empty">
              <h2>この形式はブラウザ内プレビューに対応していません</h2>
              <p>上部の「原ファイルを開く」から確認してください。</p>
            </div>
          ) : null}
        </section>
      </main>
    </WorkspaceShell>
  );
}
