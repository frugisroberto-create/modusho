"use client";

import { useState, useEffect, useCallback } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";

interface DeptStat {
  id: string; name: string; code: string; publishedCount: number;
}

interface ApprovedSop {
  id: string; code: string | null; title: string;
  department: { name: string; code: string } | null;
  author: string;
  approvedAt: string;
}

interface ReportData {
  property: { id: string; name: string; code: string };
  period: { from: string; to: string };
  currentState: {
    totalPublished: number;
    byDepartment: DeptStat[];
    deptsWithoutSop: DeptStat[];
  };
  approvedInPeriod: {
    total: number;
    byDepartment: Record<string, ApprovedSop[]>;
    list: ApprovedSop[];
  };
  generatedAt: string;
}

type PeriodPreset = "month" | "quarter" | "semester";

// Macro-categorie reparti
const DEPT_CATEGORIES: Record<string, string> = {
  FB: "Food & Beverage", SAL: "Food & Beverage", CUC: "Food & Beverage", BAR: "Food & Beverage",
  HOU: "Room Division", FO: "Room Division", VAL: "Room Division", ROO: "Room Division",
  HM: "Management", HOO: "Management",
};
const CATEGORY_ORDER = ["Food & Beverage", "Room Division", "Management", "Altro"];

function getCategoryForDept(code: string): string {
  return DEPT_CATEGORIES[code] || "Altro";
}

function groupByCategory<T extends { department?: { code: string } | null }>(items: T[]): Record<string, T[]> {
  const groups: Record<string, T[]> = {};
  for (const item of items) {
    const cat = item.department ? getCategoryForDept(item.department.code) : "Altro";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }
  return groups;
}

function groupDeptStatsByCategory(depts: DeptStat[]): Record<string, DeptStat[]> {
  const groups: Record<string, DeptStat[]> = {};
  for (const dept of depts) {
    const cat = getCategoryForDept(dept.code);
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(dept);
  }
  return groups;
}

function sortedCategories(categories: string[]): string[] {
  return categories.sort((a, b) => {
    const ia = CATEGORY_ORDER.indexOf(a);
    const ib = CATEGORY_ORDER.indexOf(b);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
}

interface Property { id: string; name: string; code: string }

export default function ReportsPage() {
  const { userRole } = useHooContext();
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(false);
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [propertyId, setPropertyId] = useState("");
  const [properties, setProperties] = useState<Property[]>([]);

  useEffect(() => {
    async function fetchProps() {
      const res = await fetch("/api/properties");
      if (res.ok) {
        const json = await res.json();
        setProperties(json.data);
        if (json.data.length === 1) setPropertyId(json.data[0].id);
      }
    }
    fetchProps();
  }, []);

  const getPeriodDates = useCallback((p: PeriodPreset) => {
    const to = new Date();
    const from = new Date();
    if (p === "month") from.setMonth(from.getMonth() - 1);
    else if (p === "quarter") from.setMonth(from.getMonth() - 3);
    else from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const fetchReport = useCallback(async () => {
    if (!propertyId) return;
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    try {
      const res = await fetch(`/api/reports?propertyId=${propertyId}&from=${from}&to=${to}`);
      if (res.ok) { const json = await res.json(); setData(json.data); }
    } finally { setLoading(false); }
  }, [period, propertyId, getPeriodDates]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  const periodLabels: Record<PeriodPreset, string> = { month: "Ultimo mese", quarter: "Ultimo trimestre", semester: "Ultimo semestre" };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark">Report</h1>
        <button onClick={() => window.print()} className="btn-primary">
          Stampa / PDF
        </button>
      </div>

      {/* Filtri */}
      <div className="flex items-end gap-4 flex-wrap print:hidden">
        <select value={propertyId} onChange={(e) => setPropertyId(e.target.value)}
          className="text-sm font-ui border border-ivory-dark px-3 py-[9px] bg-white">
          <option value="">Seleziona struttura</option>
          {properties.map(p => <option key={p.id} value={p.id}>{p.code} — {p.name}</option>)}
        </select>
        <div className="flex gap-1 bg-white border border-ivory-dark p-0.5">
          {(["month", "quarter", "semester"] as PeriodPreset[]).map((p) => (
            <button key={p} onClick={() => setPeriod(p)}
              className={`px-3 py-[9px] text-sm font-ui transition-colors ${period === p ? "bg-charcoal-dark text-white" : "text-charcoal hover:bg-ivory"}`}>
              {periodLabels[p]}
            </button>
          ))}
        </div>
      </div>

      {!propertyId && (
        <p className="text-charcoal/40 text-sm font-ui py-8 text-center">Seleziona una struttura per generare il report</p>
      )}

      {loading && <div className="h-40 skeleton" />}

      {data && !loading && (
        <div className="bg-white border border-ivory-dark p-6 print:border-0 print:p-0 space-y-8">
          {/* Intestazione */}
          <div className="flex items-center justify-between pb-4 border-b border-ivory-dark/50">
            <div>
              <h2 className="text-lg font-heading font-semibold text-charcoal-dark">{data.property.name}</h2>
              <p className="text-sm font-ui text-charcoal/45">
                Periodo: {new Date(data.period.from).toLocaleDateString("it-IT")} — {new Date(data.period.to).toLocaleDateString("it-IT")}
              </p>
            </div>
            <div className="text-right text-xs text-sage-light">
              <p>Generato il {new Date(data.generatedAt).toLocaleString("it-IT")}</p>
            </div>
          </div>

          {/* ── SEZIONE 1: Pubblicate nel periodo ── */}
          <div className="text-center py-4 bg-ivory border border-ivory-dark">
            <p className="text-[42px] font-heading font-semibold text-terracotta">{data.approvedInPeriod.total}</p>
            <p className="text-sm font-ui text-charcoal/60">
              {data.approvedInPeriod.total === 1 ? "nuova procedura pubblicata" : "nuove procedure pubblicate"} nel periodo
            </p>
          </div>

          {/* ── SEZIONE 2: Dettaglio approvate per macro-categoria ── */}
          <div>
            <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">
              Dettaglio procedure pubblicate nel periodo
            </h3>

            {data.approvedInPeriod.total === 0 ? (
              <p className="text-charcoal/40 text-sm font-ui py-4 text-center italic">Nessuna SOP approvata nel periodo selezionato</p>
            ) : (
              <div className="space-y-6">
                {(() => {
                  const byCat = groupByCategory(data.approvedInPeriod.list);
                  return sortedCategories(Object.keys(byCat)).map((catName) => {
                    const sops = byCat[catName];
                    // Raggruppa per sotto-reparto dentro la macro-categoria
                    const byDept: Record<string, ApprovedSop[]> = {};
                    for (const sop of sops) {
                      const deptName = sop.department?.name || "Trasversale";
                      if (!byDept[deptName]) byDept[deptName] = [];
                      byDept[deptName].push(sop);
                    }
                    return (
                      <div key={catName}>
                        <p className="text-sm font-heading font-semibold text-terracotta mb-2 border-b border-terracotta/30 pb-1">{catName}</p>
                        <div className="space-y-3 pl-3">
                          {Object.entries(byDept).map(([deptName, deptSops]) => (
                            <div key={deptName}>
                              <p className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/60 mb-1">{deptName}</p>
                              <table className="w-full text-sm font-ui">
                                <tbody>
                                  {deptSops.map((sop) => (
                                    <tr key={sop.id} className="border-b border-ivory-dark/30">
                                      <td className="py-1.5">
                                        {sop.code && <span className="text-terracotta font-medium mr-1.5">{sop.code}</span>}
                                        <span className="text-charcoal">{sop.title}</span>
                                      </td>
                                      <td className="py-1.5 text-right text-charcoal/50 text-xs w-20">
                                        {new Date(sop.approvedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  });
                })()}
              </div>
            )}
          </div>

          {/* ── SEZIONE 3: Stato attuale per macro-categoria ── */}
          <div>
            <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">
              Stato attuale — {data.currentState.totalPublished} SOP pubblicate
            </h3>
            {(() => {
              const byCat = groupDeptStatsByCategory(data.currentState.byDepartment.filter(d => d.publishedCount > 0));
              return (
                <div className="space-y-4">
                  {sortedCategories(Object.keys(byCat)).map((catName) => {
                    const depts = byCat[catName];
                    const catTotal = depts.reduce((sum, d) => sum + d.publishedCount, 0);
                    return (
                      <div key={catName}>
                        <div className="flex items-center justify-between mb-1">
                          <p className="text-sm font-heading font-semibold text-terracotta">{catName}</p>
                          <p className="text-sm font-ui font-semibold text-sage">{catTotal}</p>
                        </div>
                        <table className="w-full text-sm font-ui">
                          <tbody>
                            {depts.map((dept) => (
                              <tr key={dept.id} className="border-b border-ivory-dark/30">
                                <td className="py-1.5 pl-3 text-charcoal">{dept.name}</td>
                                <td className="py-1.5 text-right text-charcoal/60 w-16">{dept.publishedCount}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        </div>
      )}
    </div>
  );
}
