"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Property { id: string; name: string; code: string }

interface BookFormProps {
  mode: "create" | "edit";
  contentType: "BRAND_BOOK" | "STANDARD_BOOK";
  backPath: string;
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string };
}

export function BookForm({ mode, contentType, backPath, contentId, initialData }: BookFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title ?? "");
  const [body, setBody] = useState(initialData?.body ?? "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId ?? "");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (!propertyId && json.data.length > 0) setPropertyId(json.data[0].id);
      }
    }
    fetchProps();
  }, [propertyId]);

  const handleSubmit = async (publish: boolean) => {
    if (!title.trim() || !body.trim() || !propertyId) { setError("Titolo, contenuto e struttura obbligatori"); return; }
    setLoading(true); setError("");
    try {
      if (mode === "create") {
        // Create as DRAFT then optionally publish
        const res = await fetch("/api/content", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ type: contentType, title, body, propertyId, sendToReview: false }),
        });
        if (!res.ok) { const j = await res.json(); setError(j.error || "Errore"); return; }
        const json = await res.json();
        if (publish) {
          // Direct publish (ADMIN can bypass workflow for books)
          await fetch(`/api/content/${json.data.id}/review`, {
            method: "POST", headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "APPROVED" }),
          });
        }
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

  const typeLabel = contentType === "BRAND_BOOK" ? "Brand Book" : "Standard Book";

  return (
    <div className="max-w-3xl space-y-6">
      <section className="bg-ivory-medium border border-ivory-dark rounded-lg p-6 space-y-4">
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full" placeholder={`Titolo del ${typeLabel}`} />
        </div>
        {mode === "create" && (
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
            <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)} className="w-full">
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
        )}
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={20}
            className="w-full font-mono text-sm" placeholder="Contenuto (HTML o testo)" />
        </div>
      </section>

      {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

      <div className="flex gap-3">
        {mode === "create" && (
          <>
            <button onClick={() => handleSubmit(false)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-medium text-charcoal bg-ivory border border-ivory-dark hover:bg-ivory-dark rounded-lg disabled:opacity-50 transition-colors">
              {loading ? "..." : "Salva bozza"}
            </button>
            <button onClick={() => handleSubmit(true)} disabled={loading}
              className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light rounded-lg disabled:opacity-50 transition-colors">
              {loading ? "..." : "Pubblica"}
            </button>
          </>
        )}
        {mode === "edit" && (
          <button onClick={() => handleSubmit(false)} disabled={loading}
            className="px-5 py-2.5 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light rounded-lg disabled:opacity-50 transition-colors">
            {loading ? "..." : "Salva modifiche"}
          </button>
        )}
        <button onClick={() => router.back()} className="px-5 py-2.5 text-sm font-ui text-charcoal hover:bg-ivory-dark rounded-lg transition-colors">
          Annulla
        </button>
      </div>
    </div>
  );
}
