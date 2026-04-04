"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";
import Link from "next/link";

interface ContentItem {
  id: string; title: string; status: string; publishedAt: string | null;
  property: { name: string; code: string };
  department: { name: string; code: string } | null;
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_ADMIN: "bg-[#FFF3E0] text-[#E65100]",
};

export default function HooStandardBookListPage() {
  const { userRole } = useHooContext();
  const canCreate = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const canEdit = canCreate;
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(val), 400);
  };

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      const status = showArchived ? "ARCHIVED" : "PUBLISHED";
      const params = new URLSearchParams({ type: "STANDARD_BOOK", status, pageSize: "50" });
      if (searchTerm.trim().length >= 2) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) { const json = await res.json(); setItems(json.data); }
    } finally { setLoading(false); }
  }, [showArchived, searchTerm]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  const handleDelete = async (id: string) => {
    setDeleting(id);
    try {
      const res = await fetch(`/api/content/${id}`, { method: "DELETE" });
      if (res.ok) {
        setItems(prev => prev.filter(i => i.id !== id));
      }
    } finally {
      setDeleting(null);
      setConfirmDeleteId(null);
    }
  };

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">Standard Book</h1>
          <p className="text-[13px] font-ui text-charcoal/50 mt-1">Sezioni operative per reparto</p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 border border-ivory-dark bg-white cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            <span className="text-sm font-ui text-charcoal">Archiviati</span>
          </label>
          {canCreate && <Link href="/hoo-standard-book/new" className="btn-primary">Nuova sezione</Link>}
        </div>
      </div>

      {/* Ricerca full-text */}
      <div className="flex border border-ivory-dark bg-white overflow-hidden">
        <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cerca nello standard book..."
          className="flex-1 px-5 py-3 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }} />
        {searchTerm && (
          <button onClick={() => { setSearchQuery(""); setSearchTerm(""); }}
            className="px-4 py-3 text-xs font-ui text-charcoal/50 hover:text-charcoal transition-colors">
            Annulla
          </button>
        )}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessuna sezione Standard Book</p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, idx) => (
            <div key={item.id}
              className={`flex items-center justify-between p-4 hover:bg-ivory transition-colors ${idx < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <Link href={canEdit ? `/hoo-standard-book/${item.id}/edit` : `/standard-book/${item.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[item.status] || "bg-ivory-dark text-charcoal"}`}>{item.status}</span>
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                  {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                  {!item.department && <span className="text-[11px] font-ui text-charcoal/35 italic">Trasversale</span>}
                </div>
                <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
              </Link>
              {canEdit && (
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <Link href={`/hoo-standard-book/${item.id}/edit`}
                    className="px-3 py-1.5 text-[11px] font-ui font-semibold text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
                    Modifica
                  </Link>
                  {confirmDeleteId === item.id ? (
                    <div className="flex items-center gap-1.5">
                      <button onClick={() => handleDelete(item.id)} disabled={deleting === item.id}
                        className="px-3 py-1.5 text-[11px] font-ui font-semibold text-white bg-alert-red hover:bg-alert-red/90 transition-colors disabled:opacity-50">
                        {deleting === item.id ? "..." : "Conferma"}
                      </button>
                      <button onClick={() => setConfirmDeleteId(null)}
                        className="px-2 py-1.5 text-[11px] font-ui text-charcoal/50 hover:text-charcoal transition-colors">
                        No
                      </button>
                    </div>
                  ) : (
                    <button onClick={() => setConfirmDeleteId(item.id)}
                      className="px-3 py-1.5 text-[11px] font-ui font-medium text-alert-red border border-alert-red/30 hover:bg-alert-red hover:text-white transition-colors">
                      Elimina
                    </button>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
