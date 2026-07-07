export function contentDispositionHeader(
  disposition: "attachment" | "inline",
  fileName: string,
) {
  const fallback = fileName
    .normalize("NFKD")
    .replace(/[^\x20-\x7e]/g, "_")
    .replace(/["\\]/g, "_")
    .slice(0, 120);
  const encodedFileName = encodeURIComponent(fileName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );

  return `${disposition}; filename="${fallback || "file"}"; filename*=UTF-8''${encodedFileName}`;
}

export function contentTypeForAttachment(fileName: string, preferred?: string | null) {
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
