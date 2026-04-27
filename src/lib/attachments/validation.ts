/**
 * ModusHO — Attachment Validation
 *
 * Server-side validation for file type (MIME) and size.
 * Never trust the client or the file extension alone.
 */

// ---------------------------------------------------------------------------
// Allowed MIME types
// ---------------------------------------------------------------------------

export const ALLOWED_IMAGE_MIMES = [
  "image/jpeg",
  "image/png",
  "image/webp",
] as const;

export const ALLOWED_DOCUMENT_MIMES = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document", // .docx
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",       // .xlsx
] as const;

export const ALL_ALLOWED_MIMES = [
  ...ALLOWED_IMAGE_MIMES,
  ...ALLOWED_DOCUMENT_MIMES,
] as const;

export type AllowedMime = (typeof ALL_ALLOWED_MIMES)[number];

// ---------------------------------------------------------------------------
// Size limits (bytes)
// ---------------------------------------------------------------------------

/** Max image size: 10 MB */
export const MAX_IMAGE_SIZE = 10 * 1024 * 1024;

/** Max document size: 20 MB */
export const MAX_DOCUMENT_SIZE = 20 * 1024 * 1024;

// ---------------------------------------------------------------------------
// MIME → AttachmentKind mapping
// ---------------------------------------------------------------------------

export type AttachmentKind = "IMAGE" | "DOCUMENT";

const MIME_TO_KIND: Record<string, AttachmentKind> = {
  "image/jpeg": "IMAGE",
  "image/png": "IMAGE",
  "image/webp": "IMAGE",
  "application/pdf": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCUMENT",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "DOCUMENT",
};

/**
 * Returns the AttachmentKind for a given MIME type, or null if not allowed.
 */
export function getKindFromMime(mimeType: string): AttachmentKind | null {
  return MIME_TO_KIND[mimeType] ?? null;
}

// ---------------------------------------------------------------------------
// MIME → friendly extension
// ---------------------------------------------------------------------------

const MIME_TO_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
};

export function getExtensionFromMime(mimeType: string): string | null {
  return MIME_TO_EXT[mimeType] ?? null;
}

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

export interface FileValidation {
  fileName: string;
  mimeType: string;
  fileSize: number;
}

export interface ValidationResult {
  valid: boolean;
  kind: AttachmentKind | null;
  error?: string;
}

/**
 * Validates a file for upload.
 * Returns { valid: true, kind } or { valid: false, error }.
 */
export function validateFile(file: FileValidation): ValidationResult {
  // 1. Check MIME type
  const kind = getKindFromMime(file.mimeType);
  if (!kind) {
    return {
      valid: false,
      kind: null,
      error: `Tipo di file non supportato: ${file.mimeType}. Formati consentiti: JPEG, PNG, WebP, PDF, DOCX, XLSX.`,
    };
  }

  // 2. Check size
  const maxSize = kind === "IMAGE" ? MAX_IMAGE_SIZE : MAX_DOCUMENT_SIZE;
  if (file.fileSize > maxSize) {
    const maxMB = Math.round(maxSize / (1024 * 1024));
    const fileMB = (file.fileSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      kind,
      error: `File troppo grande (${fileMB} MB). Limite per ${kind === "IMAGE" ? "immagini" : "documenti"}: ${maxMB} MB.`,
    };
  }

  // 3. Check size > 0
  if (file.fileSize <= 0) {
    return {
      valid: false,
      kind,
      error: "Il file è vuoto.",
    };
  }

  return { valid: true, kind };
}
