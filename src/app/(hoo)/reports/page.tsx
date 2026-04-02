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

  if (loading && !data) return <div className="h-40 bg-gray-200  animate-pulse" />;
  if (!data) return <p className="text-gray-500">Errore nel caricamento del report</p>;

  const periodLabels: Record<PeriodPreset, string> = { month: "Ultimo mese", quarter: "Ultimo trimestre", semester: "Ultimo semestre" };

  return (
    <div className="max-w-4xl space-y-6">
      {/* Header + controlli */}
      <div className="flex items-center justify-between print:hidden">
        <h1 className="text-xl font-bold text-gray-900">{isHoo ? "Report per Managing Director" : "Report"}</h1>
        <div className="flex gap-2">
          <div className="flex gap-1 bg-white border border-gray-200  p-0.5">
            {(["month", "quarter", "semester"] as PeriodPreset[]).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-sm  transition-colors ${period === p ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}>
                {periodLabels[p]}
              </button>
            ))}
          </div>
          <button onClick={() => window.print()}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 ">
            Stampa / PDF
          </button>
        </div>
      </div>

      {/* Intestazione stampabile */}
      <div className="bg-white  border border-gray-200 p-6 print:border-0 print:p-0">
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-gray-100">
          <div>
            <h2 className="text-lg font-bold text-gray-900">HO Collection — Report Operativo</h2>
            <p className="text-sm text-gray-500">
              Periodo: {new Date(data.period.from).toLocaleDateString("it-IT")} — {new Date(data.period.to).toLocaleDateString("it-IT")}
            </p>
          </div>
          <div className="text-right text-xs text-sage-light">
            <p>Generato il {new Date(data.generatedAt).toLocaleString("it-IT")}</p>
          </div>
        </div>

        {/* KPI Riepilogo */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Riepilogo SOP</h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: "Totali", value: data.kpi.sopTotal },
              { label: "Pubblicate", value: data.kpi.sopPublished, color: "text-green-600" },
              { label: "In bozza", value: data.kpi.sopDraft },
              { label: "In review HM", value: data.kpi.sopReviewHm, color: "text-yellow-600" },
              { label: "In attesa approvazione", value: data.kpi.sopReviewAdmin, color: "text-orange-600" },
              { label: "Restituite", value: data.kpi.sopReturned, color: "text-red-600" },
              { label: "Approvate nel periodo", value: data.kpi.sopApprovedInPeriod, color: "text-green-600" },
              { label: "Restituite nel periodo", value: data.kpi.sopReturnedInPeriod, color: "text-red-600" },
            ].map((k) => (
              <div key={k.label} className="text-center py-3 bg-gray-50  print:bg-white print:border print:border-gray-200">
                <p className={`text-2xl font-bold ${k.color || "text-gray-900"}`}>{k.value}</p>
                <p className="text-xs text-gray-500 mt-0.5">{k.label}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Metriche operative */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="py-3 px-4 bg-gray-50  print:bg-white print:border">
            <p className="text-xs text-gray-500">Tempo medio approvazione</p>
            <p className="text-xl font-bold text-gray-900">{data.kpi.avgWorkflowDays != null ? `${data.kpi.avgWorkflowDays} giorni` : "n/d"}</p>
          </div>
          <div className="py-3 px-4 bg-gray-50  print:bg-white print:border">
            <p className="text-xs text-gray-500">Tasso presa visione</p>
            <p className="text-xl font-bold text-gray-900">{data.kpi.ackRate != null ? `${data.kpi.ackRate}%` : "n/d"}</p>
          </div>
          <div className="py-3 px-4 bg-gray-50  print:bg-white print:border">
            <p className="text-xs text-gray-500">Operatori attivi</p>
            <p className="text-xl font-bold text-gray-900">{data.kpi.totalOperators}</p>
          </div>
        </div>

        {/* Avanzamento per hotel */}
        <div className="mb-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Avanzamento per struttura</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                <th className="py-2">Hotel</th><th className="py-2 text-center">Totali</th>
                <th className="py-2 text-center">Pubblicate</th><th className="py-2 text-center">In review</th>
                <th className="py-2 text-center">Bozza</th><th className="py-2 text-center">Restituite</th>
                <th className="py-2 text-center">Approvate</th><th className="py-2 text-center">% Avanz.</th>
              </tr>
            </thead>
            <tbody>
              {data.hotelStats.map((h) => (
                <tr key={h.code} className="border-b border-gray-100">
                  <td className="py-2 font-medium">{h.name}</td>
                  <td className="py-2 text-center">{h.sopTotal}</td>
                  <td className="py-2 text-center text-green-600 font-medium">{h.sopPublished}</td>
                  <td className="py-2 text-center">{h.sopInReview}</td>
                  <td className="py-2 text-center">{h.sopDraft}</td>
                  <td className="py-2 text-center text-red-600">{h.sopReturned}</td>
                  <td className="py-2 text-center text-green-600">{h.sopApproved}</td>
                  <td className="py-2 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <div className="w-16 h-2 bg-gray-200 rounded-full overflow-hidden print:border print:border-gray-300">
                        <div className={`h-full rounded-full ${h.pct >= 70 ? "bg-green-500" : h.pct >= 30 ? "bg-yellow-500" : "bg-red-500"}`}
                          style={{ width: `${h.pct}%` }} />
                      </div>
                      <span className={`font-medium ${h.pct < 30 ? "text-red-600" : ""}`}>{h.pct}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Trend settimanale */}
        <div>
          <h3 className="text-sm font-semibold text-gray-900 mb-3 uppercase tracking-wide">Trend settimanale</h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 text-left text-xs text-gray-500 uppercase">
                <th className="py-2">Settimana</th>
                <th className="py-2 text-center">SOP approvate</th>
                <th className="py-2 text-center">SOP restituite</th>
              </tr>
            </thead>
            <tbody>
              {data.trend.map((w, i) => (
                <tr key={i} className="border-b border-gray-100">
                  <td className="py-2">{w.label}</td>
                  <td className="py-2 text-center text-green-600 font-medium">{w.approved}</td>
                  <td className="py-2 text-center text-red-600">{w.returned}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
