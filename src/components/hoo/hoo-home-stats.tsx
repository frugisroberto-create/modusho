"use client";

import { useState, useEffect } from "react";
import Link from "next/link";

interface StatsData {
  sopActive: number;
  pendingApproval: number;
  documents: number;
  memoActive: number;
}

export function HooHomeStats() {
  const [stats, setStats] = useState<StatsData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      try {
        const [sopRes, reviewHmRes, reviewAdminRes, docRes, memoRes] = await Promise.all([
          fetch("/api/content?type=SOP&status=PUBLISHED&pageSize=1"),
          fetch("/api/content?type=SOP&status=REVIEW_HM&pageSize=1"),
          fetch("/api/content?type=SOP&status=REVIEW_ADMIN&pageSize=1"),
          fetch("/api/content?type=DOCUMENT&status=PUBLISHED&pageSize=1"),
          fetch("/api/content?type=MEMO&status=PUBLISHED&pageSize=1"),
        ]);
        const [sop, hmR, adminR, doc, memo] = await Promise.all([
          sopRes.ok ? sopRes.json() : { meta: { total: 0 } },
          reviewHmRes.ok ? reviewHmRes.json() : { meta: { total: 0 } },
          reviewAdminRes.ok ? reviewAdminRes.json() : { meta: { total: 0 } },
          docRes.ok ? docRes.json() : { meta: { total: 0 } },
          memoRes.ok ? memoRes.json() : { meta: { total: 0 } },
        ]);
        setStats({
          sopActive: sop.meta?.total ?? 0,
          pendingApproval: (hmR.meta?.total ?? 0) + (adminR.meta?.total ?? 0),
          documents: doc.meta?.total ?? 0,
          memoActive: memo.meta?.total ?? 0,
        });
      } catch {
        setStats({ sopActive: 0, pendingApproval: 0, documents: 0, memoActive: 0 });
      } finally { setLoading(false); }
    }
    fetchStats();
  }, []);

  if (loading || !stats) {
    return (
      <div className="flex gap-5">
        {[1,2,3,4].map(i => <div key={i} className="flex-1 h-24 skeleton" />)}
      </div>
    );
  }

  const boxes = [
    { label: "SOP Attive", count: stats.sopActive, href: "/hoo-sop", alert: false },
    { label: "In attesa di approvazione", count: stats.pendingApproval, href: "/approvals", alert: true },
    { label: "Documenti", count: stats.documents, href: "/library", alert: false },
    { label: "Memo attivi", count: stats.memoActive, href: "/memo", alert: false },
  ];

  return (
    <div className="flex gap-5">
      {boxes.map((box) => (
        <Link key={box.label} href={box.href}
          className="flex-1 bg-white border border-ivory-dark p-6 text-center hover:border-terracotta hover:shadow-md transition-all cursor-pointer">
          <p className={`text-4xl font-heading font-medium ${box.alert ? "text-[#E65100]" : "text-terracotta"}`}>{box.count}</p>
          <p className="text-[11px] font-ui uppercase tracking-[0.15em] text-charcoal/50 mt-1.5">{box.label}</p>
        </Link>
      ))}
    </div>
  );
}
