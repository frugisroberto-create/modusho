"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";

interface OnboardingStats {
  active: number;
  completed: number;
  overdue: number;
}

interface OnboardingAssignment {
  id: string;
  user: { id: string; name: string; role: string };
  property: { id: string; name: string; code: string };
  percentage: number;
  dueDate: string | null;
  createdAt: string;
  isOverdue: boolean;
}

interface Props {
  propertyId?: string;
}

export function OnboardingDashboardWidget({ propertyId }: Props) {
  const [stats, setStats] = useState<OnboardingStats | null>(null);
  const [assignments, setAssignments] = useState<OnboardingAssignment[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const url = propertyId
        ? `/api/onboarding/dashboard?propertyId=${propertyId}`
        : "/api/onboarding/dashboard";
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        setStats(json.data.stats);
        setAssignments(json.data.assignments);
      }
    } finally {
      setLoading(false);
    }
  }, [propertyId]);

  useEffect(() => { fetchData(); }, [fetchData]);

  if (loading) {
    return <div className="h-32 bg-ivory-dark animate-pulse" />;
  }

  if (!stats || (stats.active === 0 && stats.completed === 0)) {
    return null;
  }

  return (
    <section className="bg-white border border-ivory-dark">
      <div className="px-6 py-4 border-b border-ivory-medium flex items-center justify-between">
        <h3 className="text-sm font-heading font-semibold text-charcoal-dark">
          Onboarding
        </h3>
        <Link
          href="/onboarding"
          className="text-[10px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:underline"
        >
          Gestisci template
        </Link>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-3 border-b border-ivory-medium">
        <StatBox label="Attivi" value={stats.active} />
        <StatBox label="Completati" value={stats.completed} className="border-x border-ivory-medium" />
        <StatBox
          label="In ritardo"
          value={stats.overdue}
          valueColor={stats.overdue > 0 ? "text-alert-red" : undefined}
        />
      </div>

      {/* Active assignments */}
      {assignments.length > 0 && (
        <div className="divide-y divide-ivory-medium">
          {assignments.map((a) => (
            <div key={a.id} className="flex items-center gap-4 px-6 py-3">
              <div className="flex-1 min-w-0">
                <p className="font-ui font-medium text-charcoal-dark text-sm truncate">
                  {a.user.name}
                </p>
                <p className="text-[11px] font-ui text-charcoal/40">
                  {a.property.code}
                  {a.dueDate && (
                    <span className={a.isOverdue ? " text-alert-red font-medium" : ""}>
                      {" "}— scadenza {new Date(a.dueDate).toLocaleDateString("it-IT")}
                    </span>
                  )}
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-16 h-1.5 bg-ivory-dark overflow-hidden">
                  <div className="h-full bg-terracotta" style={{ width: `${a.percentage}%` }} />
                </div>
                <span className="text-[10px] font-ui text-charcoal/40 w-8 text-right">
                  {a.percentage}%
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function StatBox({
  label,
  value,
  valueColor,
  className = "",
}: {
  label: string;
  value: number;
  valueColor?: string;
  className?: string;
}) {
  return (
    <div className={`px-4 py-3 text-center ${className}`}>
      <p className={`text-xl font-heading font-semibold ${valueColor ?? "text-terracotta"}`}>
        {value}
      </p>
      <p className="text-[10px] font-ui uppercase tracking-wider text-charcoal/40">{label}</p>
    </div>
  );
}
