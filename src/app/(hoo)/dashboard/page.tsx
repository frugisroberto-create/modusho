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

const STATUS_LABELS: Record<string, string> = { DRAFT: "Bozza", REVIEW_HM: "In attesa di consultazione", REVIEW_ADMIN: "In approvazione HOO" };

export default function GovernanceDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [propertyFilter, setPropertyFilter] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("");
  const [departments, setDepartments] = useState<{ id: string; name: string }[]>([]);
  const [expandedProperty, setExpandedProperty] = useState<string | null>(null);
  // Set di chiavi composite "<category>:<id>" per evitare collisioni tra
  // categorie e per dismissare per identità (non per indice — l'indice
  // diventa instabile quando si applica il filtro reparto).
  const [dismissedAlerts, setDismissedAlerts] = useState<Set<string>>(new Set());

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
    if (departmentFilter) params.set("departmentId", departmentFilter);
    try {
      const res = await fetch(`/api/dashboard?${params}`);
      if (res.ok) { const json = await res.json(); setData(json.data); }
    } finally { setLoading(false); }
  }, [period, propertyFilter, departmentFilter, getPeriodDates]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  // Auto-select property when only one is available (e.g. HM)
  useEffect(() => {
    if (data && data.header.properties.length === 1 && !propertyFilter) {
      setPropertyFilter(data.header.properties[0].id);
    }
  }, [data, propertyFilter]);

  // Fetch departments when property changes
  useEffect(() => {
    if (!propertyFilter) { setDepartments([]); setDepartmentFilter(""); return; }
    setDepartmentFilter("");
    (async () => {
      const res = await fetch(`/api/properties/${propertyFilter}/departments`);
      if (res.ok) { const json = await res.json(); setDepartments(json.data); }
    })();
  }, [propertyFilter]);

  if (loading && !data) {
    return <div className="space-y-4">{[1,2,3].map(i => <div key={i} className="h-32 skeleton" />)}</div>;
  }
  if (!data) return <p className="text-sage-light font-ui">Errore nel caricamento della dashboard</p>;

  // Costruzione lista alert con chiave composita (categoria:id) stabile
  // anche dopo filtro reparto / cambio dataset
  const allAlertsRaw: ((typeof data.alerts.stalledReviewAdmin)[number] & { _key: string })[] = [
    ...data.alerts.stalledReviewAdmin.map(a => ({ ...a, _key: `stalledReviewAdmin:${a.id}` })),
    ...data.alerts.stalledReviewHm.map(a => ({ ...a, _key: `stalledReviewHm:${a.id}` })),
    ...data.alerts.stalledDraft.map(a => ({ ...a, _key: `stalledDraft:${a.id}` })),
    ...data.alerts.inactiveHotels.map(a => ({ ...a, _key: `inactiveHotels:${a.id}` })),
    ...data.alerts.emptyDepts.map(a => ({ ...a, _key: `emptyDepts:${a.id}` })),
    ...data.alerts.highReturnHotels.map(a => ({ ...a, _key: `highReturnHotels:${a.id}` })),
    ...data.alerts.lowAckContents.map(a => ({ ...a, _key: `lowAckContents:${a.id}` })),
  ].filter((alert) => {
    if (!departmentFilter) return true;
    // Quando un reparto è selezionato, mostra solo alert con department
    // che matcha il filtro. Alert senza department (hotel-level come
    // "inactive hotels" o "high return hotels") vengono nascosti perché
    // non sono specifici del reparto selezionato.
    const selectedDeptName = departments.find(d => d.id === departmentFilter)?.name;
    return alert.department != null && alert.department === selectedDeptName;
  });
  const allAlerts = allAlertsRaw.filter((alert) => !dismissedAlerts.has(alert._key));

  const periodLabels: Record<PeriodPreset, string> = { week: "Settimana", month: "Mese", quarter: "Trimestre" };

  const pendingCount = data.header.pendingApprovalCount;
  const alertCount = data.header.totalAlerts;
  const ackRate = data.kpi.ackRate;

  return (
    <div className="space-y-8">

      {/* ── Filtri ── */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex gap-1 bg-ivory border border-ivory-dark p-0.5">
          {(["week", "month", "quarter"] as PeriodPreset[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-1.5 text-sm font-ui transition-colors ${period === p ? "bg-charcoal-dark text-white" : "text-charcoal hover:bg-ivory-dark"}`}
            >{periodLabels[p]}</button>
          ))}
        </div>
        {data.header.properties.length > 1 && (
          <select value={propertyFilter} onChange={(e) => setPropertyFilter(e.target.value)}
            className="text-sm font-ui border border-ivory-dark px-3 py-1.5 bg-ivory">
            <option value="">Tutte le strutture</option>
            {data.header.properties.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        )}
        <select value={departmentFilter} onChange={(e) => setDepartmentFilter(e.target.value)}
          className="text-sm font-ui border border-ivory-dark px-3 py-1.5 bg-ivory"
          disabled={departments.length === 0}>
          <option value="">Tutti i reparti</option>
          {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LIVELLO 1 — Priorità immediate
          ══════════════════════════════════════════════════════════════════ */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* Card 1 — In approvazione HOO */}
        <Link href="/approvals"
          className={`block bg-white border border-ivory-dark p-8 transition-colors hover:bg-ivory/50 ${pendingCount > 0 ? "border-l-4 border-l-terracotta" : ""}`}>
          <p className="text-[12px] font-ui uppercase tracking-wider text-charcoal/50 mb-3">In approvazione HOO</p>
          <p className={`text-[42px] font-heading font-semibold leading-tight ${pendingCount > 0 ? "text-terracotta" : "text-sage"}`}>
            {pendingCount}
          </p>
        </Link>

        {/* Card 2 — Alert critici */}
        <a href="#critical-alerts"
          className={`block bg-white border border-ivory-dark p-8 transition-colors hover:bg-ivory/50 ${alertCount > 0 ? "border-l-4 border-l-alert-red" : ""}`}>
          <p className="text-[12px] font-ui uppercase tracking-wider text-charcoal/50 mb-3">Alert critici</p>
          <p className={`text-[42px] font-heading font-semibold leading-tight ${alertCount > 0 ? "text-alert-red" : "text-sage"}`}>
            {alertCount}
          </p>
        </a>

        {/* Card 3 — Tasso presa visione */}
        <div className={`bg-white border border-ivory-dark p-8 ${ackRate !== null && ackRate < 70 ? "border-l-4 border-l-terracotta" : ""}`}>
          <p className="text-[12px] font-ui uppercase tracking-wider text-charcoal/50 mb-3">Tasso presa visione</p>
          <p className={`text-[42px] font-heading font-semibold leading-tight ${ackRate !== null && ackRate < 70 ? "text-terracotta" : "text-sage"}`}>
            {ackRate !== null ? `${ackRate}%` : "n/d"}
          </p>
        </div>
      </div>

      {/* ══════════════════════════════════════════════════════════════════
          LIVELLO 2 — Alert critici (solo se presenti)
          ══════════════════════════════════════════════════════════════════ */}
      {allAlerts.length > 0 && (
        <section id="critical-alerts">
          <h2 className="text-lg font-heading font-semibold text-charcoal-dark mb-3">Alert critici</h2>
          <div className="space-y-2">
            {allAlerts.map((alert) => {
              const borderColor = alert.severity === "critical" ? "border-l-alert-red" : alert.severity === "warning" ? "border-l-alert-yellow" : "border-l-sage-light";
              return (
                <div key={alert._key}
                  className={`flex items-center justify-between px-5 py-3.5 bg-white border border-ivory-dark border-l-4 ${borderColor}`}>
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <svg className={`w-4 h-4 shrink-0 ${alert.severity === "critical" ? "text-alert-red" : alert.severity === "warning" ? "text-alert-yellow" : "text-sage-light"}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                    </svg>
                    <div>
                      <span className="text-sm font-ui font-medium text-charcoal-dark">{alert.title || alert.name}</span>
                      {alert.property && <span className="text-xs font-ui text-sage-light ml-2">{alert.property}</span>}
                    </div>
                  </div>
                  <span className="text-sm font-ui text-charcoal shrink-0 mr-3">{alert.message}</span>
                  <button onClick={() => setDismissedAlerts(prev => new Set([...prev, alert._key]))}
                    className="shrink-0 w-6 h-6 flex items-center justify-center text-charcoal/30 hover:text-charcoal/60 transition-colors"
                    title="Nascondi alert">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* ══════════════════════════════════════════════════════════════════
          LIVELLO 3 — Confronto hotel + drill-down reparti
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-heading font-semibold text-charcoal-dark mb-3">Confronto per hotel</h2>
        <div className="bg-white border border-ivory-dark overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm font-ui">
              <thead><tr className="bg-ivory-dark text-left text-xs text-sage-light uppercase tracking-wide">
                <th className="px-4 py-3">Property</th><th className="px-4 py-3">Totali</th>
                <th className="px-4 py-3">Pubblicate</th><th className="px-4 py-3">In review</th>
                <th className="px-4 py-3">Restituite</th><th className="px-4 py-3">Avanzamento</th>
                <th className="px-4 py-3">Ultimo avanz.</th>
              </tr></thead>
              <tbody>
                {data.propertyComparison.map((p) => {
                  const rowBg = p.advancementPct < 30 ? "bg-alert-red/5" : p.advancementPct < 50 ? "bg-alert-yellow/5" : "bg-ivory";
                  return (
                    <tr key={p.id} className={`border-b border-ivory-dark hover:bg-ivory-dark/40 ${rowBg}`}>
                      <td className="px-4 py-3 font-medium text-charcoal-dark">{p.name}</td>
                      <td className="px-4 py-3">{p.sopTotal}</td>
                      <td className="px-4 py-3 text-sage">{p.sopPublished}</td>
                      <td className="px-4 py-3">{p.sopInReview}</td>
                      <td className="px-4 py-3 text-alert-red">{p.sopReturned}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-20 h-2 bg-ivory-dark overflow-hidden">
                            <div className="h-full bg-sage" style={{ width: `${p.advancementPct}%` }} />
                          </div>
                          <span className={`font-medium text-xs ${p.advancementPct < 30 ? "text-alert-red" : p.advancementPct < 50 ? "text-alert-yellow" : "text-charcoal-dark"}`}>
                            {p.advancementPct}%
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sage-light">
                        {p.lastAdvancement ? new Date(p.lastAdvancement).toLocaleDateString("it-IT") : "—"}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {/* Drill-down reparti — chiuso di default, fisarmonica */}
        <div className="bg-white border border-ivory-dark border-t-0 overflow-hidden divide-y divide-ivory-dark">
          {data.departmentComparison.map((prop) => (
            <div key={prop.propertyId}>
              <button
                onClick={() => setExpandedProperty(expandedProperty === prop.propertyId ? null : prop.propertyId)}
                className="w-full px-5 py-3 flex items-center justify-between hover:bg-ivory/50 text-left transition-colors"
              >
                <span className="text-xs font-ui font-medium text-charcoal/60 uppercase tracking-wider">{prop.propertyName} — Reparti</span>
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

      {/* ══════════════════════════════════════════════════════════════════
          LIVELLO 4 — KPI di dettaglio (peso visivo inferiore)
          ══════════════════════════════════════════════════════════════════ */}
      <section>
        <h2 className="text-lg font-heading font-semibold text-charcoal/60 mb-3">KPI di dettaglio</h2>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[
            { label: "SOP totali", value: data.kpi.sopTotal },
            { label: "Pubblicate", value: data.kpi.sopPublished },
            { label: "In attesa di consultazione", value: data.kpi.sopReviewHm },
            { label: "In approvazione HOO", value: data.kpi.sopReviewAdmin },
            { label: "Restituite", value: data.kpi.sopReturned },
            { label: "Approvate nel periodo", value: data.kpi.sopApprovedInPeriod },
            { label: "Tempo medio workflow", value: data.kpi.avgWorkflowDays != null ? `${data.kpi.avgWorkflowDays}g` : "n/d" },
            { label: "Tasso presa visione", value: data.kpi.ackRate != null ? `${data.kpi.ackRate}%` : "n/d" },
          ].map((kpi) => (
            <div key={kpi.label} className="bg-ivory border border-ivory-dark p-4">
              <p className="text-[11px] font-ui uppercase tracking-wider text-charcoal/40 mb-1">{kpi.label}</p>
              <p className="text-[24px] font-heading font-medium leading-tight text-charcoal/70">
                {kpi.value}
              </p>
            </div>
          ))}
        </div>
        {Object.keys(data.kpi.avgTimePerStatus).length > 0 && (
          <div className="bg-ivory border border-ivory-dark p-4 mt-3">
            <p className="text-[11px] font-ui uppercase tracking-wider text-charcoal/40 mb-2">Tempo medio per stato (giorni)</p>
            <div className="flex gap-6">
              {Object.entries(data.kpi.avgTimePerStatus).map(([status, days]) => (
                <div key={status}>
                  <span className="text-sm font-ui text-charcoal/60">{STATUS_LABELS[status] || status}: </span>
                  <span className="text-sm font-ui font-semibold text-charcoal/70">{days != null ? `${days}g` : "n/d"}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
