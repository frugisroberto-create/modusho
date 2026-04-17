"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";

export default function EditMemoPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [contentId, setContentId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    async function fetchMemo() {
      const res = await fetch(`/api/content/${id}`);
      if (res.ok) {
        const json = await res.json();
        setTitle(json.data.title);
        setBody(json.data.body);
        setContentId(json.data.id);
      }
      setLoading(false);
    }
    fetchMemo();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/memo/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body, expiresAt: expiresAt || null, isPinned }),
      });
      if (res.ok) { router.push("/memo"); router.refresh(); }
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.push("/memo");
        router.refresh();
      }
    } finally {
      setDeleting(false);
      setShowDeleteModal(false);
    }
  };

  if (loading) return <div className="h-40 skeleton" />;

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-heading font-medium text-charcoal-dark">Modifica memo</h1>
      <div className="bg-white border border-ivory-dark p-5 space-y-4">
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className="w-full" />
        </div>
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Scadenza</label>
          <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full max-w-xs" />
        </div>
      </div>

      {contentId && <AttachmentUploader contentId={contentId} canEdit={true} />}

      <div className="flex gap-3 flex-wrap">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "Salvataggio..." : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">Annulla</button>
        {contentId && <ExportPdfButton contentId={contentId} />}
        <button onClick={() => setShowDeleteModal(true)}
          className="btn-outline !border-alert-red !text-alert-red hover:!bg-alert-red hover:!text-white ml-auto">
          Elimina memo
        </button>
      </div>

      {showDeleteModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-alert-red mb-2">Elimina memo</h3>
            <p className="text-sm font-ui text-charcoal mb-4">
              Il memo sparirà dalle viste operative. L&apos;azione è reversibile solo dal Super Admin. Sei sicuro?
            </p>
            <div className="flex justify-end gap-2">
              <button onClick={() => setShowDeleteModal(false)} disabled={deleting} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark">Annulla</button>
              <button onClick={handleDelete} disabled={deleting}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-alert-red hover:bg-alert-red/80 disabled:opacity-50">
                {deleting ? "..." : "Elimina"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
