"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";
import Link from "next/link";

interface ContentItem {
  id: string; title: string; status: string; publishedAt: string | null;
  property: { name: string; code: string };
}

const STATUS_BADGE: Record<string, string> = {
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-mauve/15 text-mauve",
  REVIEW_ADMIN: "bg-terracotta/10 text-terracotta",
};

export default function HooBrandBookListPage() {
  const { userRole } = useHooContext();
  const canCreate = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const [items, setItems] = useState<ContentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [showArchived, setShowArchived] = useState(false);
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
      const params = new URLSearchParams({ type: "BRAND_BOOK", status, pageSize: "50" });
      if (searchTerm.trim().length >= 2) params.set("search", searchTerm.trim());
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) { const json = await res.json(); setItems(json.data); }
    } finally { setLoading(false); }
  }, [showArchived, searchTerm]);

  useEffect(() => { fetchItems(); }, [fetchItems]);

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">Brand Book</h1>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 px-3 py-2 border border-ivory-dark bg-white cursor-pointer">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)}
              className="w-3.5 h-3.5 rounded border-ivory-dark text-terracotta focus:ring-terracotta" />
            <span className="text-sm font-ui text-charcoal">Archiviati</span>
          </label>
          {canCreate && <Link href="/hoo-brand-book/new" className="btn-primary">Nuovo Brand Book</Link>}
        </div>
      </div>

      {/* Ricerca full-text */}
      <div className="flex border border-ivory-dark bg-white overflow-hidden">
        <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cerca nel brand book..."
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
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessun contenuto Brand Book</p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, idx) => (
            <div key={item.id} className={`flex items-center justify-between p-4 hover:bg-ivory transition-colors ${idx < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <Link href={`/brand-book/${item.id}`} className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_BADGE[item.status] || "bg-ivory-dark text-charcoal"}`}>{item.status}</span>
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                </div>
                <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
              </Link>
              {canCreate && (
                <Link href={`/hoo-brand-book/${item.id}/edit`}
                  className="shrink-0 ml-3 px-3 py-1.5 text-xs font-ui font-medium text-terracotta border border-terracotta/30 hover:bg-terracotta/5 transition-colors">
                  Modifica
                </Link>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
