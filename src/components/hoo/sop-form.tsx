"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Property {
  id: string; name: string; code: string;
  departments: { id: string; name: string; code: string }[];
}

interface SopFormProps {
  mode: "create" | "edit";
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId: string | null };
}

export function SopForm({ mode, contentId, initialData }: SopFormProps) {
  const router = useRouter();
  const [title, setTitle] = useState(initialData?.title || "");
  const [body, setBody] = useState(initialData?.body || "");
  const [propertyId, setPropertyId] = useState(initialData?.propertyId || "");
  const [departmentId, setDepartmentId] = useState(initialData?.departmentId || "");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchProperties() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (!propertyId && json.data.length > 0) setPropertyId(json.data[0].id);
      }
    }
    fetchProperties();
  }, [propertyId]);

  const selectedProperty = properties.find(p => p.id === propertyId);

  const handleSubmit = async (sendToReview: boolean) => {
    if (!title.trim() || !body.trim() || !propertyId) return;
    setLoading(true);
    try {
      const payload = {
        title, body, propertyId,
        departmentId: departmentId || null,
        ...(mode === "create" ? { type: "SOP" } : {}),
        sendToReview,
      };
      const url = mode === "create" ? "/api/content" : `/api/content/${contentId}`;
      const method = mode === "create" ? "POST" : "PUT";
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        router.push("/hoo-sop");
        router.refresh();
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Titolo</label>
        <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
          placeholder="Titolo della SOP" />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Struttura</label>
          <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setDepartmentId(""); }}
            disabled={mode === "edit"}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:bg-gray-100">
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Reparto (opzionale)</label>
          <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500">
            <option value="">Trasversale (tutti i reparti)</option>
            {selectedProperty?.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </div>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Contenuto</label>
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={15}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono text-sm"
          placeholder="Contenuto della SOP (HTML o testo)" />
      </div>

      <div className="flex gap-3 pt-2">
        <button onClick={() => handleSubmit(false)} disabled={loading || !title.trim() || !body.trim()}
          className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50">
          {loading ? "Salvataggio..." : "Salva come bozza"}
        </button>
        <button onClick={() => handleSubmit(true)} disabled={loading || !title.trim() || !body.trim()}
          className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
          {loading ? "Invio..." : "Salva e invia a HM"}
        </button>
        <button onClick={() => router.back()} className="px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700">
          Annulla
        </button>
      </div>
    </div>
  );
}
