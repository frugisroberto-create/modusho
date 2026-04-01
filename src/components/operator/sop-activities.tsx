"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";
import { useIsMobile } from "@/hooks/use-is-mobile";

interface SopActivity {
  id: string;
  title: string;
  code: string | null;
  sopStatus: string;
  myRole: "R" | "C" | "A" | null;
  submittedToC: boolean;
  submittedToA: boolean;
  department: { name: string } | null;
}

interface ApiItem {
  id: string;
  code: string | null;
  title: string;
  sopStatus: string;
  myRole: "R" | "C" | "A" | null;
  submittedToC: boolean;
  submittedToA: boolean;
  department: { name: string; code: string } | null;
  isImported?: boolean;
}

function getActivityInfo(item: SopActivity): { label: string; cls: string; cta: string } | null {
  // R: bozze da completare o SOP restituite
  if (item.myRole === "R") {
    if (!item.submittedToC && !item.submittedToA) {
      return { label: "Da completare", cls: "bg-[#FFF3E0] text-[#E65100]", cta: "Continua" };
    }
    return null; // già sottoposta, non serve azione di R
  }

  // C: consultazione richiesta
  if (item.myRole === "C" && item.submittedToC) {
    return { label: "Richiesto il tuo contributo", cls: "bg-[#E3F2FD] text-[#1565C0]", cta: "Rivedi" };
  }

  // A: in attesa di approvazione
  if (item.myRole === "A" && item.submittedToA) {
    return { label: "In attesa della tua approvazione", cls: "bg-mauve/15 text-mauve", cta: "Valuta" };
  }

  // A: bozze in lavorazione da monitorare (ADMIN/SUPER_ADMIN)
  if (item.myRole === "A" && !item.submittedToA) {
    return null; // non azionabile ancora
  }

  return null;
}

export function SopActivities() {
  const { currentPropertyId, userRole } = useOperatorContext();
  const [items, setItems] = useState<SopActivity[]>([]);
  const [loading, setLoading] = useState(true);

  const isMobile = useIsMobile();
  // L'operatore e il mobile non devono vedere questa sezione
  const isOperator = userRole === "OPERATOR";

  const fetchActivities = useCallback(async () => {
    if (isOperator || isMobile) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/sop-workflow?sopStatus=IN_LAVORAZIONE&pageSize=10`);
      if (res.ok) {
        const json = await res.json();
        const mapped: SopActivity[] = (json.data || []).map((w: ApiItem) => ({
          id: w.id,
          title: w.title,
          code: w.code,
          sopStatus: w.sopStatus,
          myRole: w.myRole,
          submittedToC: w.submittedToC,
          submittedToA: w.submittedToA,
          department: w.department,
        }));
        // Filtra solo attività davvero azionabili
        setItems(mapped.filter(i => getActivityInfo(i) !== null).slice(0, 5));
      }
    } finally { setLoading(false); }
  }, [isOperator]);

  useEffect(() => { fetchActivities(); }, [fetchActivities]);

  if (isOperator || isMobile) return null;
  if (loading) return null; // non mostrare skeleton per sezione opzionale
  if (items.length === 0) return null;

  return (
    <section>
      <h2 className="text-xl font-heading font-medium text-charcoal-dark mb-4">Attività SOP</h2>
      <div className="bg-white border border-ivory-dark">
        {items.map((item, index) => {
          const info = getActivityInfo(item)!;
          return (
            <div key={item.id} className={`flex items-center gap-4 px-5 py-3.5 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.1em] px-2 py-0.5 ${info.cls}`}>
                    {info.label}
                  </span>
                  {item.myRole && (
                    <span className="text-[10px] font-ui font-bold text-charcoal/30">{item.myRole}</span>
                  )}
                </div>
                <p className="text-[13px] font-ui font-medium text-charcoal-dark leading-snug truncate">{item.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-[11px] font-ui text-charcoal/40">
                  {item.code && <span className="text-terracotta font-semibold">{item.code}</span>}
                  {item.department && <span>{item.department.name}</span>}
                </div>
              </div>
              <Link href={`/sop-workflow/${item.id}`}
                className="shrink-0 px-3.5 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
                {info.cta}
              </Link>
            </div>
          );
        })}
      </div>
    </section>
  );
}
