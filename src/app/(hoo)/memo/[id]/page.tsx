"use client";

import { useState, useEffect } from "react";
import { useParams, useRouter } from "next/navigation";
import { AttachmentUploader } from "@/components/shared/attachment-uploader";

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
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Scadenza</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} className="w-full" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm font-ui text-charcoal">
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} className="accent-terracotta" />
              In evidenza (pin)
            </label>
          </div>
        </div>
      </div>

      {contentId && <AttachmentUploader contentId={contentId} canEdit={true} />}

      <div className="flex gap-3">
        <button onClick={handleSave} disabled={saving} className="btn-primary disabled:opacity-50">
          {saving ? "Salvataggio..." : "Salva modifiche"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">Annulla</button>
      </div>
    </div>
  );
}
