"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Tab = "pending" | "returned";

interface ContentItem {
  id: string; type: string; title: string; status: string;
  publishedAt: string | null; createdAt: string;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  acknowledged: boolean; acknowledgedAt: string | null;
}

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("pending");
  const [items, setItems] = useState<ContentItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    const status = tab === "pending" ? "REVIEW_ADMIN" : "RETURNED";
    const params = new URLSearchParams({
      type: "SOP", status, page: page.toString(), pageSize: pageSize.toString(),
    });
    try {
      const res = await fetch(`/api/content?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
        setTotal(json.meta.total);
      }
    } finally { setLoading(false); }
  }, [tab, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [tab]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Approvazioni</h1>
      <div className="flex gap-1 bg-gray-100 rounded-lg p-0.5 w-fit">
        {([["pending", "Da approvare"], ["returned", "Restituite"]] as [Tab, string][]).map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm rounded-md transition-colors ${tab === key ? "bg-white shadow-sm font-medium" : "text-gray-600 hover:text-gray-900"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 bg-gray-200 rounded-lg animate-pulse" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-gray-500 text-sm py-8 text-center">
          {tab === "pending" ? "Nessuna SOP in attesa di approvazione" : "Nessuna SOP restituita"}
        </p>
      ) : (
        <div className="space-y-2">
          {items.map((item) => (
            <Link key={item.id} href={`/approvals/${item.id}`}
              className="block bg-white rounded-lg border border-gray-200 p-4 hover:border-blue-300 hover:shadow-sm transition-all">
              <div className="flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`text-xs font-medium px-2 py-0.5 rounded ${tab === "pending" ? "bg-orange-100 text-orange-700" : "bg-red-100 text-red-700"}`}>
                      {tab === "pending" ? "REVIEW_ADMIN" : "RETURNED"}
                    </span>
                    <span className="text-xs text-gray-500">{item.property.code}</span>
                    {item.department && <span className="text-xs text-gray-500">{item.department.name}</span>}
                  </div>
                  <h3 className="font-medium text-gray-900 text-sm">{item.title}</h3>
                  <p className="text-xs text-gray-400 mt-1">Creato il {new Date(item.createdAt).toLocaleDateString("it-IT")}</p>
                </div>
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-gray-500">Pagina {page} di {totalPages} ({total} risultati)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border rounded-md hover:bg-gray-50 disabled:opacity-50">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
