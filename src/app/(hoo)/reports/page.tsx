"use client";

import { useState, useEffect, useCallback } from "react";
import { useHooContext } from "@/components/hoo/hoo-shell";

interface ReportData {
  period: { from: string; to: string };
  kpi: {
    sopTotal: number; sopPublished: number; sopDraft: number;
    sopReviewHm: number; sopReviewAdmin: number; sopReturned: number; sopArchived: number;
    sopApprovedInPeriod: number; sopReturnedInPeriod: number;
    avgWorkflowDays: number | null;
    ackRate: number | null; totalOperators: number; publishedContent: number; totalAcks: number;
  };
  hotelStats: {
    name: string; code: string; sopTotal: number; sopPublished: number; sopDraft: number;
    sopInReview: number; sopReturned: number; sopApproved: number; pct: number;
  }[];
  trend: { label: string; approved: number; returned: number }[];
  generatedAt: string;
}

type PeriodPreset = "month" | "quarter" | "semester";

export default function ReportsPage() {
  const { userRole } = useHooContext();
  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState<PeriodPreset>("month");

  const getPeriodDates = useCallback((p: PeriodPreset) => {
    const to = new Date();
    const from = new Date();
    if (p === "month") from.setMonth(from.getMonth() - 1);
    else if (p === "quarter") from.setMonth(from.getMonth() - 3);
    else from.setMonth(from.getMonth() - 6);
    return { from: from.toISOString(), to: to.toISOString() };
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    const { from, to } = getPeriodDates(period);
    try {
      const res = await fetch(`/api/reports?from=${from}&to=${to}`);
      if (res.ok) { const json = await res.json(); setData(json.data); }
    } finally { setLoading(false); }
  }, [period, getPeriodDates]);

  useEffect(() => { fetchReport(); }, [fetchReport]);

  if (loading && !data) return <div className="h-40 skeleton" />;
  if (!data) return <p className="text-charcoal/45 font-ui">Errore nel caricamento del report</p>;

  const periodLabels: Record<PeriodPreset, string> = { month: "Ultimo mese", quarter: "Ultimo trimestre", semester: "Ultimo semestre" };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header + controlli */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-6">{isHoo ? "Report per Managing Director" : "Report"}</h1>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-white border border-ivory-dark  p-0.5">
            {(["month", "quarter", "semester"] as PeriodPreset[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm font-ui transition-colors ${period === p ? "bg-charcoal-dark text-white" : "text-charcoal hover:bg-ivory"}`}>
                {periodLabels[p]}
              </button>
            ))}
          </div>
          <button onClick={() => window.print()}
            className="btn-primary">
            Stampa / PDF
          </button>
        </div>
      </div>

      {/* Intestazione stampabile */}
      <div className="bg-white  border border-ivory-dark p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-ivory-dark/50">
          <div>
            <h2 className="text-lg font-heading font-semibold text-charcoal-dark">HO Collection — Report Operativo</h2>
            <p className="text-sm font-ui text-charcoal/45">
              Periodo: {new Date(data.period.from).toLocaleDateString("it-IT")} — {new Date(data.period.to).toLocaleDateString("it-IT")}
            </p>
          </div>
          <div className="text-right text-xs text-sage-light">
            <p>Generato il {new Date(data.generatedAt).toLocaleString("it-IT")}</p>
          </div>
        </div>

        {/* KPI Riepilogo */}
        <div className="mb-6">
          <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">Riepilogo SOP</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Totali", value: data.kpi.sopTotal },
              { label: "Pubblicate", value: data.kpi.sopPublished, color: "text-sage" },
              { label: "In bozza", value: data.kpi.sopDraft },
              { label: "In attesa di consultazione", value: data.kpi.sopReviewHm, color: "text-[#D4A017]" },
              { label: "In approvazione Accountable", value: data.kpi.sopReviewAdmin, color: "text-terracotta" },
              { label: "Restituite", value: data.kpi.sopReturned, color: "text-alert-red" },
              { label: "Approvate nel periodo", value: data.kpi.sopApprovedInPeriod, color: "text-sage" },
              { label: "Restituite nel periodo", value: data.kpi.sopReturnedInPeriod, color: "text-alert-red" },
            ].map((k) => (
              <div key={k.label} className="text-center py-3 bg-ivory  print:bg-white print:border print:border-ivory-dark">
                <p className={`text-2xl font-heading font-semibold ${k.color || "text-charcoal-dark"}`}>{k.value}</p>
                <p className="text-xs font-ui text-charcoal/45 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Metriche operative */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="py-3 px-4 bg-ivory  print:bg-white print:border">
            <p className="text-xs font-ui text-charcoal/45">Tempo medio approvazione</p>
            <p className="text-xl font-heading font-semibold text-charcoal-dark">{data.kpi.avgWorkflowDays != null ? `${data.kpi.avgWorkflowDays} giorni` : "n/d"}</p>
          </div>
          <div className="py-3 px-4 bg-ivory  print:bg-white print:border">
            <p className="text-xs font-ui text-charcoal/45">Tasso presa visione</p>
            <p className="text-xl font-heading font-semibold text-charcoal-dark">{data.kpi.ackRate != null ? `${data.kpi.ackRate}%` : "n/d"}</p>
          </div>
          <div className="py-3 px-4 bg-ivory  print:bg-white print:border">
            <p className="text-xs font-ui text-charcoal/45">Operatori attivi</p>
            <p className="text-xl font-heading font-semibold text-charcoal-dark">{data.kpi.totalOperators}</p>
          </div>
        </div>

        {/* Avanzamento per hotel */}
        <div className="mb-6">
          <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">Avanzamento per struttura</h3>
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="border-b border-ivory-dark text-left text-xs text-charcoal/45 uppercase">
                <th className="py-2">Hotel</th><th className="py-2 text-center">Totali</th>
                <th className="py-2 text-center">Pubblicate</th><th className="py-2 text-center">In review</th>
                <th className="py-2 text-center">Bozza</th><th className="py-2 text-center">Restituite</th>
                <th className="py-2 text-center">Approvate</th><th className="py-2 text-center">% Avanz.</th>
              </tr>
            </thead>
            <tbody>
              {data.hotelStats.map((h) => (
                <tr key={h.code} className="border-b border-ivory-dark/50">
                  <td className="py-2 font-ui font-medium text-charcoal">{h.name}</td>
                  <td className="py-2 text-center">{h.sopTotal}</td>
                  <td className="py-2 text-center text-sage font-medium">{h.sopPublished}</td>
                  <td className="py-2 text-center">{h.sopInReview}</td>
                  <td className="py-2 text-center">{h.sopDraft}</td>
                  <td className="py-2 text-center text-alert-red">{h.sopReturned}</td>
                  <td className="py-2 text-center text-sage">{h.sopApproved}</td>
                  <td className="py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-2 bg-ivory-dark rounded-full overflow-hidden print:border print:border-ivory-dark">
                        <div className={`h-full rounded-full ${h.pct >= 70 ? "bg-sage" : h.pct >= 30 ? "bg-[#D4A017]" : "bg-alert-red"}`}
                          style={{ width: `${h.pct}%` }} />
                      </div>
                      <span className={`font-ui font-medium ${h.pct < 30 ? "text-alert-red" : ""}`}>{h.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trend settimanale */}
        <div>
          <h3 className="text-sm font-ui font-semibold text-charcoal mb-3 uppercase tracking-wide">Trend settimanale</h3>
          <table className="w-full text-sm font-ui">
            <thead>
              <tr className="border-b border-ivory-dark text-left text-xs text-charcoal/45 uppercase">
                <th className="py-2">Settimana</th>
                <th className="py-2 text-center">SOP approvate</th>
                <th className="py-2 text-center">SOP restituite</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((w, i) => (
                <tr key={i} className="border-b border-ivory-dark/50">
                  <td className="py-2 text-charcoal">{w.label}</td>
                  <td className="py-2 text-center text-sage font-medium">{w.approved}</td>
                  <td className="py-2 text-center text-alert-red">{w.returned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
