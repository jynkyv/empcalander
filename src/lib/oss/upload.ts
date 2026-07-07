import { createHmac, randomUUID } from "node:crypto";

type OssConfig = {
  accessKeyId: string;
  accessKeySecret: string;
  bucket: string;
  endpoint: string;
  publicBaseUrl: string;
  uploadBaseUrl: string;
};

export type UploadedOssFile = {
  fileName: string;
  fileSize: number;
  fileUrl: string;
  mimeType: string;
  ossObjectKey: string;
};

const defaultEndpoint = "oss-ap-northeast-1.aliyuncs.com";
const maxUploadSize = 20 * 1024 * 1024;

function normalizeEndpoint(value?: string) {
  if (!value) return defaultEndpoint;

  const trimmed = value
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/\/$/, "");

  if (trimmed.endsWith(".aliyuncs.com")) return trimmed;
  if (trimmed.startsWith("oss-")) return `${trimmed}.aliyuncs.com`;

  return `oss-${trimmed}.aliyuncs.com`;
}

function parseHostLikeBucket(value: string) {
  const host = value.replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const labels = host.split(".");

  if (labels.length < 2) {
    return null;
  }

  const [bucket, ...domainParts] = labels;
  const domain = domainParts.join(".");

  if (!bucket || !domain) {
    return null;
  }

  if (domain.startsWith("oss-") && domain.endsWith(".aliyuncs.com")) {
    return {
      bucket,
      endpoint: domain,
      publicBaseUrl: `https://${host}`,
    };
  }

  return {
    bucket,
    endpoint: normalizeEndpoint(process.env.OSS_ENDPOINT || process.env.OSS_REGION),
    publicBaseUrl: `https://${host}`,
  };
}

function parseBucketValue(bucketValue: string) {
  const trimmed = bucketValue.trim();

  if (!/^https?:\/\//.test(trimmed)) {
    const hostLikeBucket = parseHostLikeBucket(trimmed);

    if (hostLikeBucket) {
      return hostLikeBucket;
    }

    return {
      bucket: trimmed,
      endpoint: normalizeEndpoint(process.env.OSS_ENDPOINT || process.env.OSS_REGION),
      publicBaseUrl: "",
    };
  }

  const bucketUrl = new URL(trimmed);
  const parsedHost = parseHostLikeBucket(bucketUrl.hostname);

  if (parsedHost) return parsedHost;

  return {
    bucket: bucketUrl.hostname,
    endpoint: normalizeEndpoint(process.env.OSS_ENDPOINT || process.env.OSS_REGION),
    publicBaseUrl: `${bucketUrl.protocol}//${bucketUrl.hostname}`,
  };
}

function normalizeBaseUrl(value?: string) {
  if (!value) return "";

  const trimmed = value.trim().replace(/\/$/, "");

  if (!trimmed) return "";
  if (/^https?:\/\//.test(trimmed)) return trimmed;

  return `https://${trimmed}`;
}

export function getOssConfig(): OssConfig | null {
  const accessKeyId = process.env.OSS_ACCESS_KEY_ID;
  const accessKeySecret = process.env.OSS_ACCESS_KEY_SECRET;
  const bucketValue = process.env.OSS_BUCKET;

  if (!accessKeyId || !accessKeySecret || !bucketValue) {
    return null;
  }

  const parsedBucket = parseBucketValue(bucketValue);
  const endpoint = normalizeEndpoint(
    process.env.OSS_ENDPOINT || process.env.OSS_REGION || parsedBucket.endpoint,
  );
  const configuredPublicBaseUrl =
    normalizeBaseUrl(process.env.OSS_PUBLIC_BASE_URL) ||
    normalizeBaseUrl(process.env.OSS_CNAME_DOMAIN);
  const publicBaseUrl =
    configuredPublicBaseUrl ||
    parsedBucket.publicBaseUrl ||
    `https://${parsedBucket.bucket}.${endpoint}`;

  return {
    accessKeyId,
    accessKeySecret,
    bucket: parsedBucket.bucket,
    endpoint,
    publicBaseUrl,
    uploadBaseUrl: `https://${parsedBucket.bucket}.${endpoint}`,
  };
}

function sanitizeFileName(fileName: string) {
  return fileName
    .normalize("NFKC")
    .replace(/[^\w.\-\u3040-\u30ff\u3400-\u9fff]/g, "_")
    .replace(/_+/g, "_")
    .slice(0, 120);
}

function encodeObjectKey(objectKey: string) {
  return objectKey.split("/").map(encodeURIComponent).join("/");
}

function createObjectKey(taskId: string, fileName: string) {
  const now = new Date();
  const datePath = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0"),
  ].join("/");

  return `task-comments/${taskId}/${datePath}/${randomUUID()}-${sanitizeFileName(fileName)}`;
}

function signOssPutRequest({
  accessKeySecret,
  bucket,
  contentType,
  date,
  objectKey,
}: {
  accessKeySecret: string;
  bucket: string;
  contentType: string;
  date: string;
  objectKey: string;
}) {
  const canonicalizedResource = `/${bucket}/${objectKey}`;
  const stringToSign = `PUT\n\n${contentType}\n${date}\n${canonicalizedResource}`;

  return createHmac("sha1", accessKeySecret).update(stringToSign).digest("base64");
}

export async function uploadFileToOss(taskId: string, file: File) {
  const config = getOssConfig();

  if (!config) {
    throw new Error(
      "OSS_ACCESS_KEY_ID、OSS_ACCESS_KEY_SECRET、OSS_BUCKET を設定してください。",
    );
  }

  if (file.size > maxUploadSize) {
    throw new Error("20MB 以下のファイルをアップロードしてください。");
  }

  const contentType = file.type || "application/octet-stream";
  const objectKey = createObjectKey(taskId, file.name);
  const encodedObjectKey = encodeObjectKey(objectKey);
  const date = new Date().toUTCString();
  const signature = signOssPutRequest({
    accessKeySecret: config.accessKeySecret,
    bucket: config.bucket,
    contentType,
    date,
    objectKey,
  });
  const fileBuffer = Buffer.from(await file.arrayBuffer());
  const uploadUrl = `${config.uploadBaseUrl}/${encodedObjectKey}`;
  const fileUrl = `${config.publicBaseUrl}/${encodedObjectKey}`;
  let response: Response;

  try {
    response = await fetch(uploadUrl, {
      body: fileBuffer,
      headers: {
        Authorization: `OSS ${config.accessKeyId}:${signature}`,
        "Content-Type": contentType,
        Date: date,
      },
      method: "PUT",
    });
  } catch (error) {
    throw new Error(
      `OSS への接続に失敗しました。bucket=${config.bucket}, endpoint=${config.endpoint}, url=${uploadUrl}, reason=${
        error instanceof Error ? error.message : "unknown"
      }`,
    );
  }

  if (!response.ok) {
    const responseText = await response.text();
    throw new Error(responseText || "OSS へのアップロードに失敗しました。");
  }

  return {
    fileName: file.name,
    fileSize: file.size,
    fileUrl,
    mimeType: contentType,
    ossObjectKey: objectKey,
  } satisfies UploadedOssFile;
}
