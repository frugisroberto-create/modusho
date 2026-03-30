/**
 * ModusHO — Attachments module barrel export
 */

export { buildStorageKey, sanitizeFileName, getBucketName, getPresignedUploadUrl, getPresignedDownloadUrl, deleteFromStorage, getExtension } from "./storage";
export { validateFile, getKindFromMime, getExtensionFromMime, ALLOWED_IMAGE_MIMES, ALLOWED_DOCUMENT_MIMES, ALL_ALLOWED_MIMES, MAX_IMAGE_SIZE, MAX_DOCUMENT_SIZE } from "./validation";
export type { FileValidation, ValidationResult, AttachmentKind, AllowedMime } from "./validation";
