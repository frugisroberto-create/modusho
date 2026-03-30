"use client";

import { useState, useEffect, useCallback, useRef } from "react";

interface AttachmentItem {
  id: string;
  kind: string;
  originalFileName: string;
  mimeType: string;
  fileSize: number;
  sortOrder: number;
  isInline: boolean;
  caption: string | null;
  createdAt: string;
  uploadedBy: { name: string };
}

interface UploadingFile {
  id: string;
  name: string;
  status: "uploading" | "done" | "error";
  error?: string;
}

interface AttachmentUploaderProps {
  contentId: string;
  canEdit: boolean;
}

const MIME_LABELS: Record<string, string> = {
  "image/jpeg": "JPEG", "image/png": "PNG", "image/webp": "WebP",
  "application/pdf": "PDF",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "DOCX",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "XLSX",
};

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Fetches a presigned GET URL for an attachment (on demand). */
async function getAccessUrl(attachmentId: string): Promise<string | null> {
  try {
    const res = await fetch(`/api/attachments/${attachmentId}/access`);
    if (res.ok) {
      const json = await res.json();
      return json.data.url;
    }
  } catch {}
  return null;
}

export function AttachmentUploader({ contentId, canEdit }: AttachmentUploaderProps) {
  const [attachments, setAttachments] = useState<AttachmentItem[]>([]);
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [loading, setLoading] = useState(true);
  // Cache presigned URLs per attachment (expire client-side after 90s)
  const [imageUrls, setImageUrls] = useState<Record<string, string>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchAttachments = useCallback(async () => {
    try {
      const res = await fetch(`/api/content/${contentId}/attachments?pageSize=50`);
      if (res.ok) {
        const json = await res.json();
        setAttachments(json.data);
        // Pre-fetch presigned URLs for images (for thumbnails)
        const imgs = (json.data as AttachmentItem[]).filter(a => a.kind === "IMAGE");
        const urls: Record<string, string> = {};
        await Promise.all(imgs.map(async (img) => {
          const url = await getAccessUrl(img.id);
          if (url) urls[img.id] = url;
        }));
        setImageUrls(urls);
      }
    } finally { setLoading(false); }
  }, [contentId]);

  useEffect(() => { fetchAttachments(); }, [fetchAttachments]);

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    for (const file of Array.from(files)) {
      const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
      setUploading(prev => [...prev, { id: tempId, name: file.name, status: "uploading" }]);

      try {
        const prepRes = await fetch("/api/attachments/prepare-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentId, fileName: file.name, mimeType: file.type, fileSize: file.size,
            isInline: file.type.startsWith("image/"),
            sortOrder: attachments.length + uploading.length,
          }),
        });

        if (!prepRes.ok) {
          const err = await prepRes.json();
          setUploading(prev => prev.map(u => u.id === tempId ? { ...u, status: "error", error: err.error || "Errore preparazione" } : u));
          continue;
        }

        const { data: prepData } = await prepRes.json();

        const uploadRes = await fetch(prepData.uploadUrl, {
          method: "PUT",
          headers: { "Content-Type": file.type, "Content-Length": file.size.toString() },
          body: file,
        });

        if (!uploadRes.ok) {
          setUploading(prev => prev.map(u => u.id === tempId ? { ...u, status: "error", error: "Errore caricamento file" } : u));
          continue;
        }

        await fetch("/api/attachments/confirm-upload", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ attachmentId: prepData.attachmentId }),
        });

        setUploading(prev => prev.map(u => u.id === tempId ? { ...u, status: "done" } : u));
        fetchAttachments();
      } catch {
        setUploading(prev => prev.map(u => u.id === tempId ? { ...u, status: "error", error: "Errore di rete" } : u));
      }
    }

    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDelete = async (attachmentId: string) => {
    const res = await fetch(`/api/content/${contentId}/attachments`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ attachmentId }),
    });
    if (res.ok) {
      setAttachments(prev => prev.filter(a => a.id !== attachmentId));
      setImageUrls(prev => { const n = { ...prev }; delete n[attachmentId]; return n; });
    }
  };

  const handleOpenFile = async (attachmentId: string) => {
    const url = await getAccessUrl(attachmentId);
    if (url) window.open(url, "_blank");
  };

  const images = attachments.filter(a => a.kind === "IMAGE");
  const documents = attachments.filter(a => a.kind === "DOCUMENT");
  const activeUploads = uploading.filter(u => u.status !== "done");

  if (loading) return <div className="h-20 skeleton" />;

  const hasContent = attachments.length > 0 || activeUploads.length > 0;
  if (!hasContent && !canEdit) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-heading font-medium text-charcoal-dark">
          Allegati {attachments.length > 0 && <span className="text-charcoal/45 font-ui text-sm">({attachments.length})</span>}
        </h3>
        {canEdit && (
          <label className="btn-outline text-xs px-4 py-2 cursor-pointer">
            Aggiungi file
            <input ref={fileInputRef} type="file" multiple accept="image/jpeg,image/png,image/webp,application/pdf,.docx,.xlsx"
              onChange={handleFileSelect} className="hidden" />
          </label>
        )}
      </div>

      {/* Active uploads */}
      {activeUploads.length > 0 && (
        <div className="space-y-1">
          {activeUploads.map(u => (
            <div key={u.id} className={`flex items-center gap-3 px-4 py-2 border ${u.status === "error" ? "border-alert-red/30 bg-[#FECACA]/20" : "border-ivory-dark bg-ivory"}`}>
              {u.status === "uploading" && <div className="w-4 h-4 border-2 border-ivory-dark border-t-terracotta rounded-full animate-spin shrink-0" />}
              {u.status === "error" && <span className="text-alert-red text-xs font-ui font-bold">!</span>}
              <span className="text-sm font-ui text-charcoal truncate">{u.name}</span>
              {u.status === "uploading" && <span className="text-[11px] font-ui text-charcoal/45 shrink-0">Caricamento...</span>}
              {u.error && <span className="text-[11px] font-ui text-alert-red shrink-0">{u.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Images — real preview via presigned URL */}
      {images.length > 0 && (
        <div>
          <p className="text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-2">Immagini</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
            {images.map((img) => {
              const previewUrl = imageUrls[img.id];
              return (
                <div key={img.id} className="border border-ivory-dark bg-white p-2 group relative">
                  <button onClick={() => handleOpenFile(img.id)} className="block w-full aspect-video bg-ivory-medium overflow-hidden cursor-pointer">
                    {previewUrl ? (
                      /* eslint-disable-next-line @next/next/no-img-element */
                      <img src={previewUrl} alt={img.originalFileName} className="w-full h-full object-cover" />
                    ) : (
                      <span className="flex items-center justify-center h-full text-charcoal/30 text-xs font-ui">Caricamento...</span>
                    )}
                  </button>
                  <p className="text-[11px] font-ui text-charcoal/60 mt-1 truncate">{img.originalFileName}</p>
                  <p className="text-[10px] font-ui text-charcoal/35">{formatSize(img.fileSize)}</p>
                  {canEdit && (
                    <button onClick={() => handleDelete(img.id)}
                      className="absolute top-1 right-1 w-6 h-6 bg-white/90 border border-ivory-dark flex items-center justify-center text-alert-red text-xs opacity-0 group-hover:opacity-100 transition-opacity">
                      ×
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Documents — secure open/download */}
      {documents.length > 0 && (
        <div>
          <p className="text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-2">Documenti</p>
          <div className="border border-ivory-dark bg-white divide-y divide-ivory-medium">
            {documents.map((doc) => (
              <div key={doc.id} className="flex items-center gap-3 px-4 py-3">
                <svg className="w-5 h-5 text-charcoal/40 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-ui text-charcoal-dark truncate">{doc.originalFileName}</p>
                  <p className="text-[10px] font-ui text-charcoal/35">{MIME_LABELS[doc.mimeType] || doc.mimeType} · {formatSize(doc.fileSize)}</p>
                </div>
                <button onClick={() => handleOpenFile(doc.id)}
                  className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:text-terracotta-light transition-colors shrink-0">
                  Apri
                </button>
                {canEdit && (
                  <button onClick={() => handleDelete(doc.id)}
                    className="text-[11px] font-ui text-alert-red/60 hover:text-alert-red transition-colors shrink-0 ml-2">
                    Rimuovi
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty state */}
      {!hasContent && canEdit && (
        <div className="border border-dashed border-ivory-dark py-8 text-center">
          <p className="text-sm font-ui text-charcoal/40">Nessun allegato</p>
          <p className="text-[11px] font-ui text-charcoal/30 mt-1">Formati: JPEG, PNG, WebP, PDF, DOCX, XLSX</p>
        </div>
      )}
    </div>
  );
}
