"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useOperatorContext } from "./operator-shell";

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, PRO: 3, ADMIN: 4, SUPER_ADMIN: 5,
};

interface Stats {
  sopCount: number;
  docCount: number;
  memoCount: number;
  standardBookCount: number;
  brandBookCount: number;
}

export function QuickStats() {
  const { currentPropertyId, userRole } = useOperatorContext();
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);

  const canSeeBrandBook = (ROLE_LEVEL[userRole] ?? 0) >= ROLE_LEVEL.HOTEL_MANAGER;

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const fetches: Promise<Response>[] = [
        fetch(`/api/content?propertyId=${currentPropertyId}&type=SOP&status=PUBLISHED&pageSize=1`),
        fetch(`/api/content?propertyId=${currentPropertyId}&type=DOCUMENT&status=PUBLISHED&pageSize=1`),
        fetch(`/api/memo?propertyId=${currentPropertyId}&pageSize=1`),
        fetch(`/api/content?propertyId=${currentPropertyId}&type=STANDARD_BOOK&status=PUBLISHED&pageSize=1`),
      ];
      if (canSeeBrandBook) {
        fetches.push(fetch(`/api/content?propertyId=${currentPropertyId}&type=BRAND_BOOK&status=PUBLISHED&pageSize=1`));
      }

      const responses = await Promise.all(fetches);
      const jsons = await Promise.all(responses.map(r => r.ok ? r.json() : { meta: { total: 0 } }));

      setStats({
        sopCount: jsons[0].meta?.total ?? 0,
        docCount: jsons[1].meta?.total ?? 0,
        memoCount: jsons[2].meta?.total ?? 0,
        standardBookCount: jsons[3].meta?.total ?? 0,
        brandBookCount: canSeeBrandBook ? (jsons[4]?.meta?.total ?? 0) : 0,
      });
    } finally { setLoading(false); }
  }, [currentPropertyId, canSeeBrandBook]);

  useEffect(() => { fetchStats(); }, [fetchStats]);

  if (loading || !stats) {
    return (
      <div className="grid grid-cols-3 gap-5">
        {[1,2,3].map(i => <div key={i} className="h-24 skeleton" />)}
      </div>
    );
  }

  const boxes: { label: string; count: number; href: string }[] = [
    { label: "SOP del tuo reparto", count: stats.sopCount, href: "/sop" },
    { label: "Documenti", count: stats.docCount, href: "/documents" },
    { label: "Memo attivi", count: stats.memoCount, href: "/" },
    { label: "Standard Book", count: stats.standardBookCount, href: "/standard-book" },
  ];

  if (canSeeBrandBook) {
    boxes.push({ label: "Brand Book", count: stats.brandBookCount, href: "/brand-book" });
  }

  return (
    <div className="grid grid-cols-3 gap-5">
      {boxes.map((box) => (
        <Link key={box.label} href={box.href}
          className="bg-white border border-ivory-dark p-6 text-center hover:border-terracotta hover:shadow-md transition-all cursor-pointer">
          <p className="text-4xl font-heading font-medium text-terracotta">{box.count}</p>
          <p className="text-[11px] font-ui uppercase tracking-[0.15em] text-charcoal/50 mt-1.5">{box.label}</p>
        </Link>
      ))}
    </div>
  );
}
