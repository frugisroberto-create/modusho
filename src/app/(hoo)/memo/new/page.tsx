"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface Property { id: string; name: string; code: string }

export default function NewMemoPage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [propertyId, setPropertyId] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isPinned, setIsPinned] = useState(false);
  const [properties, setProperties] = useState<Property[]>([]);
  const [loading, setLoading] = useState(false);

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim() || !body.trim() || !propertyId) return;
    setLoading(true);
    try {
      const res = await fetch("/api/memo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title, body, propertyId,
          expiresAt: expiresAt || null,
          isPinned,
        }),
      });
      if (res.ok) { router.push("/memo"); router.refresh(); }
    } finally { setLoading(false); }
  };

  return (
    <div className="max-w-2xl">
      <h1 className="text-xl font-bold text-gray-900 mb-6">Nuovo memo</h1>
      <form onSubmit={handleSubmit} className="bg-white  border border-gray-200 p-5 space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Titolo</label>
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} required
            className="w-full px-3 py-2 border  text-sm" placeholder="Titolo del memo" />
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Struttura</label>
          <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
            className="w-full px-3 py-2 border  text-sm bg-white">
            {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Contenuto</label>
          <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} required
            className="w-full px-3 py-2 border  text-sm" placeholder="Testo del memo..." />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Scadenza (opzionale)</label>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)}
              className="w-full px-3 py-2 border  text-sm" />
          </div>
          <div className="flex items-end pb-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isPinned} onChange={(e) => setIsPinned(e.target.checked)} />
              Metti in evidenza (pin)
            </label>
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          <button type="submit" disabled={loading}
            className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700  disabled:opacity-50">
            {loading ? "Pubblicazione..." : "Pubblica memo"}
          </button>
          <button type="button" onClick={() => router.back()} className="px-5 py-2.5 text-sm text-gray-500">Annulla</button>
        </div>
      </form>
    </div>
  );
}
