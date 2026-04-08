"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useSession } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import { useOperatorContext } from "@/components/operator/operator-shell";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import { AcknowledgeButton } from "@/components/operator/acknowledge-button";
import { ContentAckRegistry } from "@/components/shared/content-ack-registry";
import { LiveSearchBar } from "@/components/shared/live-search-bar";

interface MemoItem {
  id: string; contentId: string; title: string; body: string;
  publishedAt: string | null; author: string; isPinned: boolean; expiresAt: string | null;
  acknowledged: boolean; acknowledgedAt: string | null;
}

export default function MemoListPage() {
  const { data: session } = useSession();
  const userId = session?.user?.id || "";
  const { currentPropertyId, userRole } = useOperatorContext();
  const searchParams = useSearchParams();
  const openParam = searchParams.get("open");
  const canCreate = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);

  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchTerm, setSearchTerm] = useState("");
  const [expandedMemo, setExpandedMemo] = useState<string | null>(openParam);
  const expandAppliedRef = useRef(false);
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

  // Quando arrivano dalla home con ?open=<id>, scrolla al memo
  useEffect(() => {
    if (!openParam || expandAppliedRef.current || memos.length === 0) return;
    const target = memos.find(m => m.contentId === openParam || m.id === openParam);
    if (target) {
      expandAppliedRef.current = true;
      setExpandedMemo(target.id);
      setTimeout(() => {
        const el = document.getElementById(`memo-${target.id}`);
        if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
      }, 100);
    }
  }, [openParam, memos]);

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

      {/* Search — full-text con dropdown live */}
      <LiveSearchBar propertyId={currentPropertyId} contentType="MEMO" placeholder="Cerca un memo..." />

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
              <div key={memo.id} id={`memo-${memo.id}`}
                className={`flex items-center gap-4 px-5 py-4 scroll-mt-20 ${index < memos.length - 1 ? "border-b border-ivory-medium" : ""} ${isExpired ? "opacity-50" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 badge-memo">Memo</span>
                    {memo.isPinned && (
                      <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-terracotta/10 text-terracotta">In evidenza</span>
                    )}
                    {isExpired && (
                      <span className="text-[10px] font-ui uppercase tracking-wider px-2 py-0.5 bg-ivory-dark text-charcoal/50">Scaduto</span>
                    )}
                    {!memo.acknowledged && !isExpired && (
                      <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-terracotta/10 text-terracotta">Da leggere</span>
                    )}
                    {memo.acknowledged && (
                      <span className="text-[10px] font-ui uppercase tracking-wider px-2 py-0.5 bg-[#E8F5E9] text-[#2E7D32]">Letto</span>
                    )}
                  </div>
                  <button onClick={() => setExpandedMemo(expandedMemo === memo.id ? null : memo.id)}
                    className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors text-left">
                    {memo.title}
                  </button>
                  {expandedMemo === memo.id ? (
                    <>
                      <div className="text-sm text-charcoal prose prose-sm max-w-none mt-2 p-3 bg-ivory border border-ivory-dark"
                        dangerouslySetInnerHTML={{ __html: memo.body }} />
                      {(userRole === "OPERATOR" || userRole === "HOD") && (
                        <div className="mt-3">
                          <AcknowledgeButton contentId={memo.contentId} acknowledged={memo.acknowledged} acknowledgedAt={memo.acknowledgedAt?.toString() ?? null} />
                        </div>
                      )}
                      {userRole !== "OPERATOR" && (
                        <ContentAckRegistry contentId={memo.contentId} userRole={userRole} userId={userId} propertyId={currentPropertyId} />
                      )}
                    </>
                  ) : (
                    <p className="text-[11px] font-ui text-charcoal/45 mt-0.5 line-clamp-1">{stripHtml(memo.body)}</p>
                  )}
                  <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45 mt-1">
                    <span>{memo.author}</span>
                    {memo.publishedAt && <span>{new Date(memo.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
                    {memo.expiresAt && <span>Scade: {new Date(memo.expiresAt).toLocaleDateString("it-IT")}</span>}
                  </div>
                </div>
                <ExportPdfButton contentId={memo.contentId} />
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
