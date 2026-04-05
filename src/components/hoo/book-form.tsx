"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { SopEditor } from "@/components/shared/sop-editor";

interface Property { id: string; name: string; code: string; departments: { id: string; name: string; code: string }[] }

interface BookFormProps {
  mode: "create" | "edit";
  contentType: "BRAND_BOOK" | "STANDARD_BOOK";
  backPath: string;
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId?: string | null };
  canDelete?: boolean;
}

export function BookForm({ mode, contentType, backPath, contentId, initialData, canDelete }: BookFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId ?? "");
  const [departmentId, setDepartmentId] = useState(initialData?.departmentId ?? "");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (!initialData?.propertyId && json.data.length > 0) {
          setPropertyId(json.data[0].id);
        }
      }
    }
    fetchProps();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (publish: boolean) => {
    if (!title.trim() || !body.trim() || !propertyId) { setError("Titolo, contenuto e struttura obbligatori"); return; }
    setLoading(true); setError("");
    try {
      if (mode === "create") {
        const res = await fetch("/api/content", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type: contentType, title, body, propertyId,
            ...(contentType === "STANDARD_BOOK" && departmentId ? { departmentId } : {}),
            ...(publish ? { publishDirectly: true } : { sendToReview: false }),
          }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
        router.push(backPath);
      } else {
        const res = await fetch(`/api/content/${contentId}`, {
          method: "PUT", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title, body }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
        router.push(backPath);
      }
      router.refresh();
    } finally { setLoading(false); }
  };

  const handleDelete = async () => {
    if (!contentId) return;
    setLoading(true); setError("");
    try {
      const res = await fetch(`/api/content/${contentId}`, { method: "DELETE" });
      if (!res.ok) { const j = await res.json(); setError(j.error || "Errore durante l'eliminazione"); return; }
      router.push(backPath);
      router.refresh();
    } finally { setLoading(false); setConfirmDelete(false); }
  };

  const typeLabel = contentType === "BRAND_BOOK" ? "Brand Book" : "Standard Book";

  return (
    <div className="max-w-3xl space-y-6">
      <section className="bg-ivory-medium border border-ivory-dark  p-6 space-y-4">
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full" placeholder={`Titolo del ${typeLabel}`} />
        </div>
        {mode === "create" && (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
              <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setDepartmentId(""); }} className="w-full">
                {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            </div>
            {contentType === "STANDARD_BOOK" && (
              <div>
                <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto</label>
                <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full">
                  <option value="">Trasversale (tutti i reparti)</option>
                  {(properties.find(p => p.id === propertyId)?.departments || []).map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
          <SopEditor content={body} onChange={setBody} placeholder="Scrivi il contenuto..." editable={true} />
        </div>
      </section>

      {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

      <div className="flex gap-3">
        {mode === "create" && (
          <>
            <button onClick={() => handleSubmit(false)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-medium text-charcoal bg-ivory border border-ivory-dark hover:bg-ivory-dark  disabled:opacity-50 transition-colors">
              {loading ? "..." : "Salva bozza"}
            </button>
            <button onClick={() => handleSubmit(true)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
              {loading ? "..." : "Pubblica"}
            </button>
          </>
        )}
        {mode === "edit" && (
          <button onClick={() => handleSubmit(false)} disabled={loading}
            className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light  disabled:opacity-50 transition-colors">
            {loading ? "..." : "Salva modifiche"}
          </button>
        )}
        <button onClick={() => router.back()} className="px-5 py-2.5 text-sm font-ui text-charcoal hover:bg-ivory-dark  transition-colors">
          Annulla
        </button>
        {mode === "edit" && canDelete && (
          <div className="ml-auto">
            {!confirmDelete ? (
              <button onClick={() => setConfirmDelete(true)} disabled={loading}
                className="px-5 py-2.5 text-sm font-ui font-medium text-alert-red hover:bg-alert-red/10 transition-colors disabled:opacity-50">
                Elimina
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs font-ui text-alert-red">Confermi?</span>
                <button onClick={handleDelete} disabled={loading}
                  className="px-4 py-2 text-sm font-ui font-semibold text-white bg-alert-red hover:bg-alert-red/90 transition-colors disabled:opacity-50">
                  {loading ? "..." : "Sì, elimina"}
                </button>
                <button onClick={() => setConfirmDelete(false)}
                  className="px-3 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark transition-colors">
                  No
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
