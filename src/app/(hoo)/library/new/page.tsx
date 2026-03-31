"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";

interface Property { id: string; name: string; code: string; departments: { id: string; name: string; code: string }[] }

export default function NewDocumentPage() {
  const router = useRouter();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "";
  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (json.data.length > 0) setPropertyId(json.data[0].id);
      }
    }
    fetchProps();
  }, []);

  const selectedProperty = properties.find(p => p.id === propertyId);
  const departments = selectedProperty?.departments || [];

  const handleCreate = async () => {
    if (!title.trim() || !body.trim() || !propertyId) {
      setError("Titolo, contenuto e struttura sono obbligatori");
      return;
    }
    setError("");
    setLoading(true);
    try {
      const res = await fetch("/api/content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          type: "DOCUMENT",
          title,
          body,
          propertyId,
          departmentId: departmentId || null,
          publishDirectly: isHoo,
        }),
      });
      if (res.ok) {
        router.push("/library");
        router.refresh();
      } else {
        const json = await res.json();
        setError(json.error || "Errore nella creazione");
      }
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-xl font-heading font-medium text-charcoal-dark">Nuovo documento</h1>

      {error && (
        <div className="px-3 py-2 text-sm font-ui bg-[#FECACA] border-l-4 border-alert-red text-alert-red">{error}</div>
      )}

      <div className="bg-white border border-ivory-dark p-5 space-y-4">
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)}
            className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui" placeholder="Titolo del documento" />
        </div>
        <div>
          <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Contenuto</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={10}
            className="w-full px-3 py-2 border border-ivory-dark text-sm font-body" placeholder="Contenuto del documento..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
            <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setDepartmentId(""); }}
              className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui bg-white">
              {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Reparto (opzionale)</label>
            <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}
              className="w-full px-3 py-2 border border-ivory-dark text-sm font-ui bg-white">
              <option value="">Trasversale</option>
              {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      <div className="flex gap-3">
        <button onClick={handleCreate} disabled={loading} className="btn-primary disabled:opacity-50">
          {loading ? "Creazione..." : isHoo ? "Pubblica documento" : "Crea documento"}
        </button>
        <button onClick={() => router.back()} className="btn-outline">Annulla</button>
      </div>
    </div>
  );
}
