"use client";

import { useState, useEffect, useCallback } from "react";
import { useSession } from "next-auth/react";
import Link from "next/link";

interface SopWorkflowItem {
  id: string;
  contentId: string;
  code: string | null;
  title: string;
  sopStatus: "IN_LAVORAZIONE" | "PUBBLICATA" | "ARCHIVIATA";
  myRole: "R" | "C" | "A" | null;
  submittedToC: boolean;
  submittedToA: boolean;
  needsReview: boolean;
  lastSavedAt: string | null;
  textVersionCount: number;
  property: { id: string; name: string; code: string };
  department: { id: string; name: string; code: string } | null;
  responsible: { id: string; name: string; role: string };
  consulted: { id: string; name: string; role: string } | null;
  accountable: { id: string; name: string; role: string };
}

const STATUS_LABELS: Record<string, string> = {
  IN_LAVORAZIONE: "In lavorazione",
  PUBBLICATA: "Pubblicata",
  ARCHIVIATA: "Archiviata",
};

const STATUS_COLORS: Record<string, string> = {
  IN_LAVORAZIONE: "bg-[#FFF3E0] text-[#E65100]",
  PUBBLICATA: "bg-[#E8F5E9] text-[#2E7D32]",
  ARCHIVIATA: "bg-ivory-dark text-charcoal/50",
};

const WF_BADGE = "text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-mauve/15 text-mauve";

export default function HooSopListPage() {
  const { data: session } = useSession();
  const userRole = session?.user?.role;
  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const [items, setItems] = useState<SopWorkflowItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const pageSize = 20;

  const fetchSops = useCallback(async () => {
    setLoading(true);
    const params = new URLSearchParams({ page: page.toString(), pageSize: pageSize.toString() });
    if (statusFilter) {
      params.set("sopStatus", statusFilter);
    } else if (isHoo) {
      // HOO: escludi IN_LAVORAZIONE dalla lista SOP (visibili in Approvazioni)
      params.set("excludeStatus", "IN_LAVORAZIONE");
    }
    try {
      const res = await fetch(`/api/sop-workflow?${params}`);
      if (res.ok) {
        const json = await res.json();
        setItems(json.data);
        setTotal(json.meta.total);
      }
    } finally { setLoading(false); }
  }, [page, statusFilter, isHoo]);

  useEffect(() => { fetchSops(); }, [fetchSops]);
  useEffect(() => { setPage(1); }, [statusFilter]);

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-heading font-medium text-charcoal-dark">SOP</h1>
        <Link href="/hoo-sop/new" className="btn-primary">Nuova SOP</Link>
      </div>

      {/* Filtro stato — solo i 3 stati del modello RACI */}
      <div>
        <label className="block text-[11px] font-ui uppercase tracking-wider text-charcoal/45 mb-1">Stato</label>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}
          className="text-sm border border-ivory-dark px-3 py-2 bg-white font-ui">
          <option value="">{isHoo ? "Pubblicate e archiviate" : "Tutti gli stati"}</option>
          {!isHoo && <option value="IN_LAVORAZIONE">In lavorazione</option>}
          <option value="PUBBLICATA">Pubblicata</option>
          <option value="ARCHIVIATA">Archiviata</option>
        </select>
      </div>

      {/* Lista */}
      {loading ? (
        <div className="space-y-2">{[1,2,3].map(i => <div key={i} className="h-16 skeleton" />)}</div>
      ) : items.length === 0 ? (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">
          {statusFilter ? "Nessuna SOP trovata con questo stato" : "Nessuna SOP in cui sei coinvolto"}
        </p>
      ) : (
        <div className="bg-white border border-ivory-dark">
          {items.map((item, index) => (
            <div key={item.id} className={`p-4 flex items-center justify-between gap-4 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="flex-1 min-w-0">
                {/* Riga 1: stato documento + stato workflow + meta */}
                <div className="flex items-center gap-2 mb-1 flex-wrap">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${STATUS_COLORS[item.sopStatus] || ""}`}>
                    {STATUS_LABELS[item.sopStatus]}
                  </span>
                  {item.sopStatus === "IN_LAVORAZIONE" && item.submittedToC && item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta a C e A</span>
                  )}
                  {item.sopStatus === "IN_LAVORAZIONE" && item.submittedToC && !item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta a C</span>
                  )}
                  {item.sopStatus === "IN_LAVORAZIONE" && !item.submittedToC && item.submittedToA && (
                    <span className={WF_BADGE}>Sottoposta ad A</span>
                  )}
                  {item.needsReview && (
                    <span className="text-[9px] font-ui font-bold uppercase tracking-wider px-1.5 py-0.5 bg-alert-yellow/15 text-alert-yellow">
                      Necessita revisione
                    </span>
                  )}
                  {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta">{item.code}</span>}
                  <span className="text-[11px] font-ui text-charcoal/45">{item.property.code}</span>
                  {item.department && <span className="text-[11px] font-ui text-charcoal/45">{item.department.name}</span>}
                </div>

                {/* Riga 2: titolo */}
                <Link href={`/sop-workflow/${item.id}`}
                  className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                  {item.title}
                </Link>

                {/* Riga 3: ruolo utente + RACI + versione */}
                <div className="flex items-center gap-3 mt-1 text-[11px] font-ui text-charcoal/35">
                  {item.myRole && (
                    <span className="text-terracotta font-semibold">
                      {item.myRole === "R" ? "Responsabile" : item.myRole === "C" ? "Consultato" : "Accountable"}
                    </span>
                  )}
                  <span>R: {item.responsible.name}</span>
                  {item.consulted && <span>C: {item.consulted.name}</span>}
                  <span>A: {item.accountable.name}</span>
                  {item.textVersionCount > 0 && <span>v{item.textVersionCount}</span>}
                </div>
              </div>

              {/* Azione */}
              <Link href={`/sop-workflow/${item.id}`}
                className="shrink-0 px-3 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors">
                Apri
              </Link>
            </div>
          ))}
        </div>
      )}

      {/* Paginazione */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between pt-2">
          <p className="text-sm text-charcoal/45 font-ui">Pagina {page} di {totalPages} ({total} SOP)</p>
          <div className="flex gap-2">
            <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}
              className="px-3 py-1.5 text-sm border hover:bg-ivory-dark disabled:opacity-50 font-ui">Precedente</button>
            <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}
              className="px-3 py-1.5 text-sm border hover:bg-ivory-dark disabled:opacity-50 font-ui">Successivo</button>
          </div>
        </div>
      )}
    </div>
  );
}
