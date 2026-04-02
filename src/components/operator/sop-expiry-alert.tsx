"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { getValidityStatus } from "@/lib/sop-workflow";

interface SopItem {
  reviewDueDate: string | null;
  contentStatus: string;
}

/**
 * Alert compatto per SOP in scadenza/scadute.
 * Visibile solo a HOD/HM/HOO, non all'operatore.
 * Non compare su mobile.
 */
export function SopExpiryAlert() {
  const { userRole } = useOperatorContext();
  const isMobile = useIsMobile();
  const [expiring, setExpiring] = useState(0);
  const [expired, setExpired] = useState(0);
  const [loaded, setLoaded] = useState(false);

  const isGovernance = userRole !== "OPERATOR";

  const fetchCounts = useCallback(async () => {
    if (!isGovernance || isMobile) return;
    try {
      const res = await fetch("/api/sop-workflow?contentStatus=PUBLISHED&pageSize=200");
      if (res.ok) {
        const json = await res.json();
        const items: SopItem[] = json.data || [];
        let exp = 0, expg = 0;
        for (const item of items) {
          if (!item.reviewDueDate) continue;
          const status = getValidityStatus(item.reviewDueDate);
          if (status === "EXPIRED") exp++;
          else if (status === "EXPIRING") expg++;
        }
        setExpired(exp);
        setExpiring(expg);
      }
    } finally { setLoaded(true); }
  }, [isGovernance, isMobile]);

  useEffect(() => { fetchCounts(); }, [fetchCounts]);

  if (!isGovernance || isMobile || !loaded || (expiring === 0 && expired === 0)) return null;

  return (
    <section>
      <div className="bg-white border border-ivory-dark px-5 py-4 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-4 text-sm font-ui">
          {expired > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#991B1B]" />
              <span className="text-[#991B1B] font-medium">{expired} SOP scadut{expired === 1 ? "a" : "e"}</span>
            </span>
          )}
          {expiring > 0 && (
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-[#E65100]" />
              <span className="text-[#E65100] font-medium">{expiring} SOP in scadenza</span>
            </span>
          )}
        </div>
        <Link href="/hoo-sop" className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:opacity-70 transition-opacity">
          Vedi SOP
        </Link>
      </div>
    </section>
  );
}
