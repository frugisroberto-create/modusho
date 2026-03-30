"use client";

import { useState, useEffect } from "react";

interface DeletedContent {
  id: string; code: string | null; title: string; type: string; status: string;
  deletedAt: string | null;
  deletedBy: { name: string } | null;
  property: { name: string; code: string };
  department: { name: string } | null;
}

export default function DeletedContentPage() {
  const [items, setItems] = useState<DeletedContent[]>([]);
  const [loading, setLoading] = useState(true);
  const [restoring, setRestoring] = useState<string | null>(null);

  async function fetchDeleted() {
    setLoading(true);
    try {
      const res = await fetch("/api/content/deleted");
      if (res.ok) { const json = await res.json(); setItems(json.data); }
    } finally { setLoading(false); }
  }

  useEffect(() => { fetchDeleted(); }, []);

  const handleRestore = async (id: string) => {
    setRestoring(id);
    try {
      const res = await fetch(`/api/content/${id}/restore`, { method: "PUT" });
      if (res.ok) fetchDeleted();
    } finally { setRestoring(null); }
  };

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Cestino</h1>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-14 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-sage-light font-ui text-sm text-center py-10">Nessun contenuto eliminato</p>
      ) : (
        <div className="bg-ivory-medium border border-ivory-dark  overflow-hidden">
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                <th className="px-4 py-3">Codice</th>
                <th className="px-4 py-3">Titolo</th>
                <th className="px-4 py-3">Tipo</th>
                <th className="px-4 py-3">Struttura</th>
                <th className="px-4 py-3">Eliminato da</th>
                <th className="px-4 py-3">Data</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr key={item.id} className="border-b border-ivory-dark/50 bg-ivory hover:bg-ivory-dark/30">
                  <td className="px-4 py-3 text-sage-light font-mono text-xs">{item.code || "—"}</td>
                  <td className="px-4 py-3 text-charcoal-dark font-medium">{item.title}</td>
                  <td className="px-4 py-3 text-sage-light">{item.type}</td>
                  <td className="px-4 py-3 text-sage-light">{item.property.code}</td>
                  <td className="px-4 py-3 text-sage-light">{item.deletedBy?.name || "—"}</td>
                  <td className="px-4 py-3 text-sage-light">{item.deletedAt ? new Date(item.deletedAt).toLocaleDateString("it-IT") : "—"}</td>
                  <td className="px-4 py-3">
                    <button onClick={() => handleRestore(item.id)} disabled={restoring === item.id}
                      className="px-3 py-1 text-xs font-ui font-medium text-sage hover:bg-sage/10  border border-sage/30 disabled:opacity-50">
                      {restoring === item.id ? "..." : "Ripristina"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
