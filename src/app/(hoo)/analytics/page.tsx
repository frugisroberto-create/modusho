"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface DashboardData {
  header: {
    properties: { id: string; name: string; code: string }[];
    pendingApprovalCount: number;
    totalAlerts: number;
    periodFrom: string;
    periodTo: string;
  };
  approvalQueue: {
    id: string; title: string;
    property: { id: string; name: string; code: string };
    department: { id: string; name: string; code: string } | null;
    author: string; lastEditor: string;
    lastAdvancementDate: string; daysWaiting: number | null;
    previousReviewNote: string | null; previousReviewAction: string | null;
    previousReviewer: string | null;
  }[];
  alerts: Record<string, { id: string; title?: string; name?: string; property?: string; department?: string | null; message: string; severity: string; days?: number; ackRate?: number; count?: number }[]>;
  kpi: {
    sopTotal: number; sopPublished: number; sopReviewHm: number;
    sopReviewAdmin: number; sopReturned: number; sopApprovedInPeriod: number;
    avgWorkflowDays: number | null;
    avgTimePerStatus: Record<string, number | null>;
    ackRate: number | null;
  };
  propertyComparison: {
    id: string; name: string; code: string;
    sopTotal: number; sopPublished: number; sopInReview: number; sopReturned: number;
    advancementPct: number; lastAdvancement: string | null;
  }[];
  departmentComparison: {
    propertyId: string; propertyName: string; propertyCode: string;
    departments: {
      id: string; name: string; code: string;
      sopTotal: number; sopPublished: number; sopInReview: number; sopReturned: number;
      avgAgingDays: number | null;
    }[];
  }[];
}

type PeriodPreset = "week" | "month" | "quarter";

const STATUS_LABELS: Record<string, string> = { DRAFT: "Draft", REVIEW_HM: "Review HM", REVIEW_ADMIN: "Review Admin" };

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [returnModal, setReturnModal] = useState<string | null>(null);
  const [returnNote, setReturnNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);

  const getPeriodDates = useCallback((p: PeriodPreset) => {
    const to = new Date();
    const from = new Date();
    if (p === "week") from.setDate(from.getDate() - 7);
    else if (p === "month") from.setMonth(from.getMonth() - 1);
    else from.setMonth(from.getMonth() - 3);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    const params = new URLSearchParams({ from, to });
    if (propertyFilter) params.set("propertyId", propertyFilter);
    try {
      const res = await fetch(`/api/dashboard?${params}`);
      if (res.ok) { const json = await res.json(); setData(json.data); }
    } finally { setLoading(false); }
  }, [period, propertyFilter, getPeriodDates]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleApprove = async (contentId: string) => {
    setActionLoading(contentId);
    try {
      const res = await fetch(`/api/content/${contentId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "APPROVED" }),
      });
      if (res.ok) fetchDashboard();
    } finally { setActionLoading(null); }
  };

  const handleReturn = async (contentId: string) => {
    if (!returnNote.trim()) return;
    setActionLoading(contentId);
    try {
      const res = await fetch(`/api/content/${contentId}/review`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "RETURNED", note: returnNote }),
      });
      if (res.ok) { setReturnModal(null); setReturnNote(""); fetchDashboard(); }
    } finally { setActionLoading(null); }
  };

  if (loading && !data) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 skeleton" />)}</div>;
  }
  if (!data) return <p className="text-sage-light font-ui">Errore nel caricamento della dashboard</p>;

  const allAlerts = [
    ...data.alerts.stalledReviewAdmin, ...data.alerts.stalledReviewHm,
    ...data.alerts.stalledDraft, ...data.alerts.inactiveHotels,
    ...data.alerts.emptyDepts, ...data.alerts.highReturnHotels,
    ...data.alerts.lowAckContents,
  ];

  const periodLabels: Record<PeriodPreset, string> = { week: "Settimana", month: "Mese", quarter: "Trimestre" };

  return (
    <div className="space-y-6">
      {/* SEZIONE 1 — Header sintetico */}
      <div className="flex flex-wrap items-center gap-4 bg-ivory-medium border border-ivory-dark rounded-lg p-4">
        <div className="flex gap-1 bg-ivory border border-ivory-dark rounded-lg p-0.5">
          {(["week", "month", "quarter"] as PeriodPreset[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-ui rounded-md transition-colors ${period === p ? "bg-charcoal-dark text-white" : "text-charcoal hover:bg-ivory-dark"}`}
            >{periodLabels[p]}</button>
          ))}
        </div>
        {data.header.properties.length > 1 && (
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
            className="text-sm font-ui border-ivory-dark rounded-md px-3 py-1.5 bg-ivory">
            <option value="">Tutte le strutture</option>
            {data.header.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <div className="flex gap-3 ml-auto">
          <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-terracotta text-white rounded-full text-sm font-ui font-medium">
            {data.header.pendingApprovalCount} da approvare
          </span>
          {data.header.totalAlerts > 0 && (
            <span className="inline-flex items-center gap-2 px-3 py-1.5 bg-alert-red text-white rounded-full text-sm font-ui font-medium">
              {data.header.totalAlerts} alert
            </span>
          )}
        </div>
      </div>

      {/* SEZIONE 2 — Coda approvazioni */}
      <section>
        <h2 className="text-xl font-heading font-semibold text-charcoal-dark mb-4">Approvazioni in attesa</h2>
        <div className="bg-ivory-medium border border-ivory-dark rounded-lg overflow-hidden">
          {data.approvalQueue.length === 0 ? (
            <div className="px-5 py-10 text-center text-sage-light font-ui text-sm">
              Nessuna SOP in attesa di approvazione
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm font-ui">
                <thead><tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                  <th className="px-4 py-3">Titolo</th><th className="px-4 py-3">Hotel</th>
                  <th className="px-4 py-3">Reparto</th><th className="px-4 py-3">Autore</th>
                  <th className="px-4 py-3">Ultimo avanz.</th><th className="px-4 py-3">Giorni</th>
                  <th className="px-4 py-3">Nota prec.</th><th className="px-4 py-3">Azioni</th>
                </tr></thead>
                <tbody>
                  {data.approvalQueue.map((item, i) => (
                    <tr key={item.id} className={`border-b border-ivory-dark ${i % 2 === 0 ? "bg-ivory" : "bg-ivory-medium"} hover:bg-ivory-dark/40`}>
                      <td className="px-4 py-3 font-medium text-charcoal-dark max-w-[200px] truncate">{item.title}</td>
                      <td className="px-4 py-3 text-charcoal">{item.property.code}</td>
                      <td className="px-4 py-3 text-charcoal">{item.department?.name || "—"}</td>
                      <td className="px-4 py-3 text-charcoal">{item.author}</td>
                      <td className="px-4 py-3 text-sage-light">{new Date(item.lastAdvancementDate).toLocaleDateString("it-IT")}</td>
                      <td className="px-4 py-3">
                        <span className={`font-medium ${(item.daysWaiting ?? 0) > 5 ? "text-alert-red" : (item.daysWaiting ?? 0) > 3 ? "text-terracotta" : "text-charcoal-dark"}`}>
                          {item.daysWaiting ?? "n/d"}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sage-light max-w-[140px] truncate">{item.previousReviewNote || "—"}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-1">
                          <Link href={`/approvals/${item.id}`} className="px-2.5 py-1 text-xs font-medium text-terracotta hover:bg-terracotta/10 rounded transition-colors">Apri</Link>
                          <button onClick={() => handleApprove(item.id)} disabled={actionLoading === item.id}
                            className="px-2.5 py-1 text-xs font-medium text-sage hover:bg-sage/10 rounded disabled:opacity-50 transition-colors">Approva</button>
                          <button onClick={() => { setReturnModal(item.id); setReturnNote(""); }}
                            className="px-2.5 py-1 text-xs font-medium text-terracotta border border-terracotta/30 hover:bg-terracotta/10 rounded transition-colors">Restituisci</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* SEZIONE 3 — Alert critici */}
      {allAlerts.length > 0 && (
        <section>
          <h2 className="text-xl font-heading font-semibold text-charcoal-dark mb-4">Alert critici</h2>
          <div className="space-y-2">
            {allAlerts.map((alert, i) => {
              const borderColor = alert.severity === "critical" ? "border-l-alert-red" : alert.severity === "warning" ? "border-l-alert-yellow" : "border-l-sage-light";
              const href = alert.title ? `/approvals/${alert.id}` : `/properties/${alert.id}`;
              return (
                <Link key={`${alert.id}-${i}`} href={href}
                  className={`flex items-center justify-between px-5 py-3.5 bg-ivory-medium border border-ivory-dark border-l-4 ${borderColor} rounded-lg hover:bg-ivory-dark/40 transition-colors`}>
                  <div className="flex items-center gap-3">
                    <svg className={`w-4 h-4 shrink-0 ${alert.severity === "critical" ? "text-alert-red" : alert.severity === "warning" ? "text-alert-yellow" : "text-sage-light"}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <span className="text-sm font-ui font-medium text-charcoal-dark">{alert.title || alert.name}</span>
                      {alert.property && <span className="text-xs font-ui text-sage-light ml-2">{alert.property}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-ui text-charcoal shrink-0">{alert.message}</span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      {/* SEZIONE 4 — KPI principali */}
      <section>
        <h2 className="text-xl font-heading font-semibold text-charcoal-dark mb-4">KPI</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "SOP totali", value: data.kpi.sopTotal },
            { label: "Pubblicate", value: data.kpi.sopPublished },
            { label: "Review HM", value: data.kpi.sopReviewHm },
            { label: "Attesa approvazione", value: data.kpi.sopReviewAdmin },
            { label: "Restituite", value: data.kpi.sopReturned },
            { label: "Approvate nel periodo", value: data.kpi.sopApprovedInPeriod },
            { label: "Tempo medio workflow", value: data.kpi.avgWorkflowDays != null ? `${data.kpi.avgWorkflowDays}g` : "n/d", highlight: data.kpi.avgWorkflowDays != null && data.kpi.avgWorkflowDays > 14 },
            { label: "Tasso presa visione", value: data.kpi.ackRate != null ? `${data.kpi.ackRate}%` : "n/d" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-ivory-medium border border-ivory-dark rounded-lg p-5">
              <p className="text-[13px] font-ui text-sage-light mb-1">{kpi.label}</p>
              <p className={`text-[32px] font-heading font-semibold leading-tight ${kpi.highlight ? "text-terracotta" : "text-charcoal-dark"}`}>
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
        {Object.keys(data.kpi.avgTimePerStatus).length > 0 && (
          <div className="bg-ivory-medium border border-ivory-dark rounded-lg p-5 mt-3">
            <p className="text-[13px] font-ui text-sage-light mb-2">Tempo medio per stato (giorni)</p>
            <div className="flex gap-6">
              {Object.entries(data.kpi.avgTimePerStatus).map(([status, days]) => (
                <div key={status}>
                  <span className="text-sm font-ui text-charcoal">{STATUS_LABELS[status] || status}: </span>
                  <span className="text-sm font-ui font-semibold text-charcoal-dark">{days != null ? `${days}g` : "n/d"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* SEZIONE 5 — Confronto per hotel */}
      <section>
        <h2 className="text-xl font-heading font-semibold text-charcoal-dark mb-4">Confronto per hotel</h2>
        <div className="bg-ivory-medium border border-ivory-dark rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-ui">
              <thead><tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                <th className="px-4 py-3">Property</th><th className="px-4 py-3">Totali</th>
                <th className="px-4 py-3">Pubblicate</th><th className="px-4 py-3">In review</th>
                <th className="px-4 py-3">Restituite</th><th className="px-4 py-3">Avanzamento</th>
                <th className="px-4 py-3">Ultimo avanz.</th>
              </tr></thead>
              <tbody>
                {data.propertyComparison.map((p) => (
                  <tr key={p.id} className={`border-b border-ivory-dark hover:bg-ivory-dark/40 ${p.advancementPct < 30 ? "bg-alert-red/5" : "bg-ivory"}`}>
                    <td className="px-4 py-3 font-medium text-charcoal-dark">{p.name}</td>
                    <td className="px-4 py-3">{p.sopTotal}</td>
                    <td className="px-4 py-3 text-sage">{p.sopPublished}</td>
                    <td className="px-4 py-3">{p.sopInReview}</td>
                    <td className="px-4 py-3 text-alert-red">{p.sopReturned}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div className="w-20 h-2 bg-ivory-dark rounded-full overflow-hidden">
                          <div className="h-full rounded-full bg-sage" style={{ width: `${p.advancementPct}%` }} />
                        </div>
                        <span className={`font-medium text-xs ${p.advancementPct < 30 ? "text-alert-red" : "text-charcoal-dark"}`}>
                          {p.advancementPct}%
                        </span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sage-light">
                      {p.lastAdvancement ? new Date(p.lastAdvancement).toLocaleDateString("it-IT") : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* SEZIONE 6 — Confronto per reparto */}
      <section>
        <h2 className="text-xl font-heading font-semibold text-charcoal-dark mb-4">Confronto per reparto</h2>
        <div className="bg-ivory-medium border border-ivory-dark rounded-lg overflow-hidden divide-y divide-ivory-dark">
          {data.departmentComparison.map((prop) => (
            <div key={prop.propertyId}>
              <button
                onClick={() => setExpandedProperty(expandedProperty === prop.propertyId ? null : prop.propertyId)}
                className="w-full px-5 py-3.5 flex items-center justify-between hover:bg-ivory-dark/40 text-left transition-colors"
              >
                <span className="font-ui font-medium text-charcoal-dark">{prop.propertyName}</span>
                <svg className={`w-4 h-4 text-sage-light transition-transform ${expandedProperty === prop.propertyId ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>
              {expandedProperty === prop.propertyId && (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm font-ui">
                    <thead><tr className="text-left text-xs text-sage-light uppercase tracking-wide bg-ivory-dark">
                      <th className="px-4 py-2 pl-8">Reparto</th><th className="px-4 py-2">Totali</th>
                      <th className="px-4 py-2">Pubblicate</th><th className="px-4 py-2">In review</th>
                      <th className="px-4 py-2">Restituite</th><th className="px-4 py-2">Aging medio</th>
                    </tr></thead>
                    <tbody>
                      {prop.departments.map((d) => (
                        <tr key={d.id} className="border-t border-ivory-dark/50 hover:bg-ivory-dark/30 bg-ivory">
                          <td className="px-4 py-2.5 pl-8 text-charcoal">{d.name}</td>
                          <td className="px-4 py-2.5">{d.sopTotal}</td>
                          <td className="px-4 py-2.5 text-sage">{d.sopPublished}</td>
                          <td className="px-4 py-2.5">{d.sopInReview}</td>
                          <td className="px-4 py-2.5 text-alert-red">{d.sopReturned}</td>
                          <td className="px-4 py-2.5">
                            <span className={`${d.avgAgingDays != null && d.avgAgingDays > 10 ? "text-alert-red" : d.avgAgingDays != null && d.avgAgingDays > 5 ? "text-alert-yellow" : "text-sage"}`}>
                              {d.avgAgingDays != null ? `${d.avgAgingDays}g` : "—"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      {/* Modale restituzione */}
      {returnModal && (
        <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
          <div className="bg-ivory rounded-xl w-full max-w-md p-6 border border-ivory-dark">
            <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-4">Restituisci SOP</h3>
            <textarea
              value={returnNote}
              onChange={(e) => setReturnNote(e.target.value)}
              placeholder="Nota obbligatoria — motivo della restituzione..."
              rows={4}
              className="w-full mb-4"
            />
            <div className="flex justify-end gap-2">
              <button onClick={() => setReturnModal(null)} className="px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory-dark rounded-lg transition-colors">
                Annulla
              </button>
              <button onClick={() => handleReturn(returnModal)} disabled={!returnNote.trim() || actionLoading === returnModal}
                className="px-4 py-2 text-sm font-ui font-medium text-white bg-terracotta hover:bg-terracotta-light rounded-lg disabled:opacity-50 transition-colors">
                {actionLoading === returnModal ? "Invio..." : "Restituisci"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
