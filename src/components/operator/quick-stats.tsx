"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

interface Stats {
  sopCount: number;
  docCount: number;
  memoCount: number;
}

export function QuickStats() {
  const { currentPropertyId } = useOperatorContext();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const [sopRes, docRes, memoRes] = await Promise.all([
        fetch(`/api/content?propertyId=${currentPropertyId}&type=SOP&status=PUBLISHED&pageSize=1`),
        fetch(`/api/content?propertyId=${currentPropertyId}&type=DOCUMENT&status=PUBLISHED&pageSize=1`),
        fetch(`/api/memo?propertyId=${currentPropertyId}&pageSize=1`),
      ]);
      const [sop, doc, memo] = await Promise.all([
        sopRes.ok ? sopRes.json() : { meta: { total: 0 } },
        docRes.ok ? docRes.json() : { meta: { total: 0 } },
        memoRes.ok ? memoRes.json() : { meta: { total: 0 } },
      ]);
      setStats({
        sopCount: sop.meta?.total ?? 0,
        docCount: doc.meta?.total ?? 0,
        memoCount: memo.meta?.total ?? 0,
      });
    } finally { setLoading(false); }
  }, [currentPropertyId]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading || !stats) {
    return (
      <div className="flex gap-5">
        {[1,2,3].map(i => <div key={i} className="flex-1 h-24 skeleton" />)}
      </div>
    );
  }

  const boxes = [
    { label: "SOP del tuo reparto", count: stats.sopCount, href: "/sop" },
    { label: "Documenti", count: stats.docCount, href: "/documents" },
    { label: "Memo attivi", count: stats.memoCount, href: "/" },
  ];

  return (
    <div className="flex gap-5">
      {boxes.map((box) => (
        <Link key={box.label} href={box.href}
          className="flex-1 bg-white border border-ivory-dark p-6 text-center hover:border-terracotta hover:shadow-md transition-all cursor-pointer">
          <p className="text-4xl font-heading font-medium text-terracotta">{box.count}</p>
          <p className="text-[11px] font-ui uppercase tracking-[0.15em] text-charcoal/50 mt-1.5">{box.label}</p>
        </Link>
      ))}
    </div>
  );
}
