/**
 * ModusHO — Storage Service (S3/R2 compatible)
 *
 * Centralizes all object storage operations.
 * Primary target: Cloudflare R2 (S3-compatible API).
 * Also works with AWS S3, MinIO, DigitalOcean Spaces, etc.
 *
 * ARCHITECTURE:
 * - Bucket is PRIVATE (no public URLs)
 * - Files are accessed via presigned URLs with short TTL
 * - Upload flow: client → presigned URL → bucket (server never handles bytes)
 * - Metadata lives in Postgres (Attachment model)
 */

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  type PutObjectCommandInput,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

interface StorageConfig {
  endpoint: string;
  region: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
  forcePathStyle: boolean;
}

function getStorageConfig(): StorageConfig {
  const endpoint = process.env.S3_ENDPOINT;
  const region = process.env.S3_REGION || "auto";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const bucket = process.env.S3_BUCKET;
  const forcePathStyle = process.env.S3_FORCE_PATH_STYLE === "true";

  if (!endpoint) throw new Error("S3_ENDPOINT is not set");
  if (!accessKeyId) throw new Error("S3_ACCESS_KEY_ID is not set");
  if (!secretAccessKey) throw new Error("S3_SECRET_ACCESS_KEY is not set");
  if (!bucket) throw new Error("S3_BUCKET is not set");

  return { endpoint, region, accessKeyId, secretAccessKey, bucket, forcePathStyle };
}

// ---------------------------------------------------------------------------
// S3 Client (singleton)
// ---------------------------------------------------------------------------

let _client: S3Client | null = null;

function getS3Client(): S3Client {
  if (_client) return _client;
  const config = getStorageConfig();
  _client = new S3Client({
    endpoint: config.endpoint,
    region: config.region,
    credentials: {
      accessKeyId: config.accessKeyId,
      secretAccessKey: config.secretAccessKey,
    },
    forcePathStyle: config.forcePathStyle,
  });
  return _client;
}

export function getBucketName(): string {
  return getStorageConfig().bucket;
}

// ---------------------------------------------------------------------------
// Storage Key Generation
// ---------------------------------------------------------------------------

/**
 * Sanitizes a filename for storage: lowercase, no spaces, no special chars.
 * Preserves extension.
 */
export function sanitizeFileName(name: string): string {
  const lastDot = name.lastIndexOf(".");
  const ext = lastDot > 0 ? name.slice(lastDot).toLowerCase() : "";
  const base = (lastDot > 0 ? name.slice(0, lastDot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80); // keep reasonable length
  return `${base || "file"}${ext}`;
}

/**
 * Builds the deterministic storage key for an attachment.
 *
 * Format:
 *   properties/{propertyCode}/{contentType}/{contentId}/{kind}/{attachmentId}-{sanitizedName}
 *
 * Examples:
 *   properties/NCL/sop/clxyz123/images/clxyz456-foto-cucina.jpg
 *   properties/PPL/memo/clxyz789/documents/clxyz012-manuale-haccp.pdf
 */
export function buildStorageKey(params: {
  propertyCode: string;
  contentType: string; // SOP, MEMO, DOCUMENT, etc.
  contentId: string;
  kind: "IMAGE" | "DOCUMENT";
  attachmentId: string;
  originalFileName: string;
}): string {
  const kindFolder = params.kind === "IMAGE" ? "images" : "documents";
  const sanitized = sanitizeFileName(params.originalFileName);
  const typeLower = params.contentType.toLowerCase();
  const propCode = params.propertyCode.toUpperCase();

  return `properties/${propCode}/${typeLower}/${params.contentId}/${kindFolder}/${params.attachmentId}-${sanitized}`;
}

// ---------------------------------------------------------------------------
// Presigned URLs
// ---------------------------------------------------------------------------

/**
 * Generates a presigned PUT URL for client-side direct upload.
 * The client sends the file directly to the bucket — server never handles bytes.
 *
 * @param storageKey - Full key in the bucket
 * @param mimeType - Content-Type of the file
 * @param fileSize - Expected file size in bytes (for Content-Length condition)
 * @param expiresIn - URL validity in seconds (default 10 minutes)
 */
export async function getPresignedUploadUrl(
  storageKey: string,
  mimeType: string,
  fileSize: number,
  expiresIn: number = 600
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucketName();

  const input: PutObjectCommandInput = {
    Bucket: bucket,
    Key: storageKey,
    ContentType: mimeType,
    ContentLength: fileSize,
  };

  const command = new PutObjectCommand(input);
  return getSignedUrl(client, command, { expiresIn });
}

/**
 * Generates a presigned GET URL for secure file download/view.
 * Short TTL — files are never publicly accessible.
 *
 * @param storageKey - Full key in the bucket
 * @param expiresIn - URL validity in seconds (default 15 minutes)
 * @param disposition - "inline" for images/PDF preview, "attachment" for forced download
 * @param fileName - Optional filename for Content-Disposition header
 */
export async function getPresignedDownloadUrl(
  storageKey: string,
  expiresIn: number = 900,
  disposition: "inline" | "attachment" = "inline",
  fileName?: string
): Promise<string> {
  const client = getS3Client();
  const bucket = getBucketName();

  let contentDisposition: string | undefined;
  if (disposition === "attachment" && fileName) {
    contentDisposition = `attachment; filename="${fileName}"`;
  } else if (disposition === "inline") {
    contentDisposition = fileName ? `inline; filename="${fileName}"` : "inline";
  }

  const command = new GetObjectCommand({
    Bucket: bucket,
    Key: storageKey,
    ...(contentDisposition ? { ResponseContentDisposition: contentDisposition } : {}),
  });

  return getSignedUrl(client, command, { expiresIn });
}

// ---------------------------------------------------------------------------
// Delete
// ---------------------------------------------------------------------------

/**
 * Deletes a file from the bucket.
 * Used when a content or attachment is permanently removed.
 */
export async function deleteFromStorage(storageKey: string): Promise<void> {
  const client = getS3Client();
  const bucket = getBucketName();

  const command = new DeleteObjectCommand({
    Bucket: bucket,
    Key: storageKey,
  });

  await client.send(command);
}

// ---------------------------------------------------------------------------
// Utility
// ---------------------------------------------------------------------------

/**
 * Extracts the file extension from a filename.
 */
export function getExtension(filename: string): string {
  const lastDot = filename.lastIndexOf(".");
  return lastDot > 0 ? filename.slice(lastDot + 1).toLowerCase() : "";
}
