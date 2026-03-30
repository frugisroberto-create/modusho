"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useOperatorContext } from "@/components/operator/operator-shell";

interface MemoItem {
  id: string; contentId: string; title: string; body: string;
  publishedAt: string | null; author: string; isPinned: boolean; expiresAt: string | null;
}

export default function MemoListPage() {
  const { currentPropertyId } = useOperatorContext();
  const { data: session } = useSession();
  const userRole = session?.user?.role || "OPERATOR";
  const canCreate = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const debounceRef = useRef<NodeJS.Timeout | null>(null);
  const pageSize = 20;

  const fetchMemos = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        propertyId: currentPropertyId,
        page: page.toString(),
        pageSize: pageSize.toString(),
      });
      const res = await fetch(`/api/memo?${params}`);
      if (res.ok) {
        const json = await res.json();
        let items: MemoItem[] = json.data;
        // Client-side title filter
        if (searchTerm.trim().length >= 2) {
          const q = searchTerm.toLowerCase();
          items = items.filter((m) => m.title.toLowerCase().includes(q) || m.body.toLowerCase().includes(q));
        }
        setMemos(items);
        setTotal(json.meta.total);
      }
    } finally { setLoading(false); }
  }, [currentPropertyId, page, searchTerm]);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);
  useEffect(() => { setPage(1); }, [currentPropertyId, searchTerm]);

  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => setSearchTerm(val), 400);
  };

  const totalPages = Math.ceil(total / pageSize);
  const now = new Date();

  function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ""); }

  return (
    <div className="space-y-5 py-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-heading font-medium text-charcoal-dark">Memo</h1>
          <p className="text-[13px] font-ui text-charcoal/50 mt-1">Consulta le comunicazioni operative attive e il loro stato</p>
        </div>
        {canCreate && (
          <a href="/memo/new" className="btn-primary">Nuovo memo</a>
        )}
      </div>

      {/* Search */}
      <div className="flex border border-ivory-dark bg-white overflow-hidden">
        <input type="text" value={searchQuery} onChange={(e) => handleSearchChange(e.target.value)}
          placeholder="Cerca un memo..."
          className="flex-1 px-5 py-3 text-sm font-ui text-charcoal bg-transparent"
          style={{ border: "none", boxShadow: "none" }} />
        <button type="button" onClick={() => setSearchTerm(searchQuery)}
          className="shrink-0 bg-terracotta text-white px-6 py-3 text-[12.6px] font-ui font-semibold uppercase tracking-wider hover:bg-terracotta-dark transition-colors">
          Cerca
        </button>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map((i) => <div key={i} className="h-20 skeleton" />)}</div>
      ) : memos.length === 0 ? (
        <div className="text-center py-16 text-charcoal/40 font-ui">Nessun memo trovato</div>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {memos.map((memo, index) => {
            const isExpired = memo.expiresAt && new Date(memo.expiresAt) < now;
            return (
              <div key={memo.id}
                className={`flex items-center gap-4 px-5 py-4 ${index < memos.length - 1 ? "border-b border-ivory-medium" : ""} ${isExpired ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 badge-memo">Memo</span>
                    {memo.isPinned && (
                      <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-terracotta/10 text-terracotta">In evidenza</span>
                    )}
                    {isExpired && (
                      <span className="text-[10px] font-ui uppercase tracking-wider px-2 py-0.5 bg-ivory-dark text-charcoal/50">Scaduto</span>
                    )}
                  </div>
                  <h3 className="font-ui font-medium text-charcoal-dark text-sm">{memo.title}</h3>
                  <p className="text-[11px] font-ui text-charcoal/45 mt-0.5 line-clamp-1">{stripHtml(memo.body)}</p>
                  <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45 mt-1">
                    <span>{memo.author}</span>
                    {memo.publishedAt && <span>{new Date(memo.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    {memo.expiresAt && <span>Scade: {new Date(memo.expiresAt).toLocaleDateString("it-IT")}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm font-ui text-charcoal/45">{total} memo — Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">Precedente</button>
            <button onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm font-ui border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 transition-colors">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
