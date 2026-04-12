"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ExportPdfButton } from "@/components/shared/export-pdf-button";
import { ContentAckRegistry } from "@/components/shared/content-ack-registry";
import { useHooContext } from "@/components/hoo/hoo-shell";
import { useSession } from "next-auth/react";

interface MemoItem {
  id: string; contentId: string; title: string; body: string;
  publishedAt: string | null; author: string; isPinned: boolean; expiresAt: string | null;
}

interface Property { id: string; name: string; code: string }

export default function MemoManagementPage() {
  const { userRole } = useHooContext();
  const { data: session } = useSession();
  const userId = session?.user?.id || "";
  const [memos, setMemos] = useState<MemoItem[]>([]);
  const [expandedMemo, setExpandedMemo] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [properties, setProperties] = useState<Property[]>([]);
  const [propertyId, setPropertyId] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const pageSize = 20;

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

  const fetchMemos = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const params = new URLSearchParams({
      propertyId, page: page.toString(), pageSize: pageSize.toString(),
    });
    if (showExpired) params.set("includeExpired", "true");
    if (showArchived) params.set("status", "ARCHIVED");
    try {
      const res = await fetch(`/api/memo?${params}`);
      if (res.ok) { const json = await res.json(); setMemos(json.data); setTotal(json.meta.total); }
    } finally { setLoading(false); }
  }, [propertyId, page, showExpired, showArchived]);

  useEffect(() => { fetchMemos(); }, [fetchMemos]);
  useEffect(() => { setPage(1); }, [propertyId, showExpired, showArchived]);

  const handleArchive = async (memoId: string) => {
    const res = await fetch(`/api/memo/${memoId}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ archive: true }),
    });
    if (res.ok) fetchMemos();
  };

  const totalPages = Math.ceil(total / pageSize);
  const now = new Date();

  function stripHtml(html: string) { return html.replace(/<[^>]*>/g, ""); }

  return (
    <div className="max-w-4xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">Memo</h1>
        <Link href="/memo/new" className="btn-primary">
          Nuovo memo
        </Link>
      </div>

      <div className="flex gap-3 flex-wrap">
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
          className="text-sm border border-gray-300  px-3 py-2 bg-white">
          {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showExpired} onChange={(e) => setShowExpired(e.target.checked)} />
          Mostra scaduti
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-600">
          <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} />
          Archiviati
        </label>
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-20 bg-gray-200  animate-pulse" />)}</div>
      ) : memos.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">Nessun memo</p>
      ) : (
        <div className="space-y-2">
          {memos.map((m) => {
            const isExpired = m.expiresAt && new Date(m.expiresAt) < now;
            return (
              <div key={m.id} className={`bg-white border border-ivory-dark p-4 ${isExpired ? "opacity-60" : ""}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      {isExpired && <span className="text-xs font-medium px-2 py-0.5 bg-ivory-dark text-charcoal/50">Scaduto</span>}
                      <button onClick={() => setExpandedMemo(expandedMemo === m.id ? null : m.id)}
                        className="font-medium text-charcoal-dark text-sm truncate hover:text-terracotta transition-colors text-left">
                        {m.title}
                      </button>
                    </div>
                    {expandedMemo === m.id ? (
                      <>
                        <div className="text-sm text-charcoal prose prose-sm max-w-none mt-2 p-3 bg-ivory border border-ivory-dark whitespace-pre-line"
                          dangerouslySetInnerHTML={{ __html: m.body }} />
                        <ContentAckRegistry contentId={m.contentId} userRole={userRole} userId={userId} propertyId={propertyId} />
                      </>
                    ) : (
                      <p className="text-sm text-gray-500 line-clamp-2">{stripHtml(m.body)}</p>
                    )}
                    <div className="flex gap-3 mt-2 text-xs text-gray-400">
                      <span>{m.author}</span>
                      {m.publishedAt && <span>{new Date(m.publishedAt).toLocaleDateString("it-IT")}</span>}
                      {m.expiresAt && <span>Scade: {new Date(m.expiresAt).toLocaleDateString("it-IT")}</span>}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <ExportPdfButton contentId={m.contentId} />
                    <Link href={`/memo/${m.contentId}`} className="px-2 py-1 text-xs text-terracotta hover:bg-terracotta/10">Modifica</Link>
                    <button onClick={() => handleArchive(m.id)} className="px-2 py-1 text-xs text-alert-red hover:bg-alert-red/10">Archivia</button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-gray-500">Pagina {page} di {totalPages}</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border  hover:bg-gray-50 disabled:opacity-50">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border  hover:bg-gray-50 disabled:opacity-50">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
