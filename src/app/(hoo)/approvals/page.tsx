"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

type Tab = "in_lavorazione" | "pending" | "returned";

interface ContentItem {
  id: string; type: string; title: string; status: string;
  publishedAt: string | null; createdAt: string;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  acknowledged: boolean; acknowledgedAt: string | null;
}

interface WorkflowItem {
  id: string;
  code: string | null;
  title: string;
  sopStatus: string;
  myRole: "R" | "C" | "A" | null;
  submittedToC: boolean;
  submittedToA: boolean;
  lastSavedAt: string | null;
  textVersionCount: number;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  responsible: { id: string; name: string; role: string };
  consulted: { id: string; name: string; role: string } | null;
  accountable: { id: string; name: string; role: string };
  isImported?: boolean;
}

const WF_BADGE = "text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-mauve/15 text-mauve";

export default function ApprovalsPage() {
  const [tab, setTab] = useState<Tab>("in_lavorazione");
  const [contentItems, setContentItems] = useState<ContentItem[]>([]);
  const [workflowItems, setWorkflowItems] = useState<WorkflowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const pageSize = 20;

  const fetchItems = useCallback(async () => {
    setLoading(true);
    try {
      if (tab === "in_lavorazione") {
        const params = new URLSearchParams({
          sopStatus: "IN_LAVORAZIONE", page: page.toString(), pageSize: pageSize.toString(),
        });
        const res = await fetch(`/api/sop-workflow?${params}`);
        if (res.ok) {
          const json = await res.json();
          setWorkflowItems(json.data);
          setContentItems([]);
          setTotal(json.meta.total);
        }
      } else {
        const status = tab === "pending" ? "REVIEW_ADMIN" : "RETURNED";
        const params = new URLSearchParams({
          type: "SOP", status, page: page.toString(), pageSize: pageSize.toString(),
        });
        const res = await fetch(`/api/content?${params}`);
        if (res.ok) {
          const json = await res.json();
          setContentItems(json.data);
          setWorkflowItems([]);
          setTotal(json.meta.total);
        }
      }
    } finally { setLoading(false); }
  }, [tab, page]);

  useEffect(() => { fetchItems(); }, [fetchItems]);
  useEffect(() => { setPage(1); }, [tab]);

  const totalPages = Math.ceil(total / pageSize);

  const tabs: [Tab, string][] = [
    ["in_lavorazione", "In lavorazione"],
    ["pending", "Da approvare"],
    ["returned", "Restituite"],
  ];

  return (
    <div className="max-w-5xl space-y-4">
      <h1 className="text-xl font-heading font-medium text-charcoal-dark">Approvazioni</h1>

      <div className="flex gap-1 bg-ivory p-0.5 w-fit border border-ivory-dark">
        {tabs.map(([key, label]) => (
          <button key={key} onClick={() => setTab(key)}
            className={`px-4 py-1.5 text-sm font-ui transition-colors ${tab === key ? "bg-white shadow-sm font-medium text-charcoal-dark" : "text-charcoal/50 hover:text-charcoal/70"}`}>
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : tab === "in_lavorazione" ? (
        /* ── Tab: In lavorazione (SopWorkflow) ── */
        workflowItems.length === 0 ? (
          <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Nessuna SOP in lavorazione</p>
        ) : (
          <div className="bg-white border border-ivory-dark">
            {workflowItems.map((item, index) => (
              <div key={item.id} className={`p-4 flex items-center justify-between gap-4 ${index < workflowItems.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <span className="text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 bg-[#FFF3E0] text-[#E65100]">
                      In lavorazione
                    </span>
                    {item.submittedToC && item.submittedToA && <span className={WF_BADGE}>Sottoposta a C e A</span>}
                    {item.submittedToC && !item.submittedToA && <span className={WF_BADGE}>Sottoposta a C</span>}
                    {!item.submittedToC && item.submittedToA && <span className={WF_BADGE}>Sottoposta ad A</span>}
                    {item.isImported && (
                      <span className="text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-[#E3F2FD] text-[#1565C0]">
                        Importata
                      </span>
                    )}
                    {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta">{item.code}</span>}
                    <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                    {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                  </div>
                  <Link href={`/sop-workflow/${item.id}`}
                    className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                    {item.title}
                  </Link>
                  <div className="flex items-center gap-3 mt-1 text-[11px] font-ui text-charcoal/35">
                    <span>R: {item.responsible.name}</span>
                    {item.consulted && <span>C: {item.consulted.name}</span>}
                    <span>A: {item.accountable.name}</span>
                    {item.textVersionCount > 0 && <span>v{item.textVersionCount}</span>}
                  </div>
                </div>
                <Link href={`/sop-workflow/${item.id}`}
                  className="shrink-0 px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                  Apri
                </Link>
              </div>
            ))}
          </div>
        )
      ) : (
        /* ── Tab: Da approvare / Restituite (Content) ── */
        contentItems.length === 0 ? (
          <p className="text-charcoal/40 text-sm font-ui py-8 text-center">
            {tab === "pending" ? "Nessuna SOP in attesa di approvazione" : "Nessuna SOP restituita"}
          </p>
        ) : (
          <div className="bg-white border border-ivory-dark">
            {contentItems.map((item, index) => (
              <Link key={item.id} href={`/approvals/${item.id}`}
                className={`block p-4 hover:bg-ivory/50 transition-colors ${index < contentItems.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${tab === "pending" ? "bg-[#FFF3E0] text-[#E65100]" : "bg-[#FECACA] text-[#991B1B]"}`}>
                        {tab === "pending" ? "Da approvare" : "Restituita"}
                      </span>
                      <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                      {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                    </div>
                    <h3 className="font-ui font-medium text-charcoal-dark text-sm">{item.title}</h3>
                    <p className="text-[11px] font-ui text-charcoal/35 mt-1">Creato il {new Date(item.createdAt).toLocaleDateString("it-IT")}</p>
                  </div>
                  <svg className="w-4 h-4 text-charcoal/30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </Link>
            ))}
          </div>
        )
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-charcoal/45 font-ui">Pagina {page} di {totalPages} ({total} risultati)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 font-ui">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border border-ivory-dark hover:bg-ivory-dark disabled:opacity-50 font-ui">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
