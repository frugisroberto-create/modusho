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

          {/* ── SEZIONE 1: Stato attuale ── */}
          <div>
            <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">
              Stato attuale — {data.currentState.totalPublished} SOP pubblicate
            </h3>
            <table className="w-full text-sm font-ui">
              <thead>
                <tr className="border-b border-ivory-dark text-left text-xs text-charcoal/45 uppercase">
                  <th className="py-2">Reparto</th>
                  <th className="py-2 text-center">SOP pubblicate</th>
                </tr>
              </thead>
              <tbody>
                {data.currentState.byDepartment.filter(d => d.publishedCount > 0).map((dept) => (
                  <tr key={dept.id} className="border-b border-ivory-dark/50">
                    <td className="py-2 text-charcoal">{dept.name} <span className="text-charcoal/40">({dept.code})</span></td>
                    <td className="py-2 text-center font-medium text-sage">{dept.publishedCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>

          </div>

          {/* ── SEZIONE 2: Approvate nel periodo ── */}
          <div>
            <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">
              Approvate nel periodo — {data.approvedInPeriod.total} SOP
            </h3>

            {data.approvedInPeriod.total === 0 ? (
              <p className="text-charcoal/40 text-sm font-ui py-4 text-center italic">Nessuna SOP approvata nel periodo selezionato</p>
            ) : (
              <div className="space-y-4">
                {Object.entries(data.approvedInPeriod.byDepartment).map(([deptName, sops]) => (
                  <div key={deptName}>
                    <p className="text-xs font-ui font-semibold uppercase tracking-wider text-terracotta mb-1.5">{deptName}</p>
                    <table className="w-full text-sm font-ui">
                      <thead>
                        <tr className="border-b border-ivory-dark text-left text-xs text-charcoal/45 uppercase">
                          <th className="py-1.5">Procedura</th>
                          <th className="py-1.5 text-center">Approvata il</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sops.map((sop) => (
                            <tr key={sop.id} className="border-b border-ivory-dark/30">
                              <td className="py-2">
                                {sop.code && <span className="text-terracotta font-medium mr-1.5">{sop.code}</span>}
                                <span className="text-charcoal">{sop.title}</span>
                              </td>
                              <td className="py-2 text-center text-charcoal/70">
                                {new Date(sop.approvedAt).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" })}
                              </td>
                            </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
