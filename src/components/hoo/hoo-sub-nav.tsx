"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface HooProperty {
  id: string;
  name: string;
  code: string;
}

interface HooSubNavProps {
  userRole: string;
  properties: HooProperty[];
  currentPropertyId: string;
  onPropertyChange: (id: string) => void;
}

const SUB_NAV_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/dashboard", label: "Overview", minRole: "HOTEL_MANAGER" },
  { href: "/approvals", label: "Approvazioni", minRole: "HOD" },
  { href: "/compliance", label: "Presa visione", minRole: "HOD" },
  { href: "/users", label: "Gestione utenti", minRole: "ADMIN" },
  { href: "/properties", label: "Strutture", minRole: "ADMIN" },
  { href: "/reports", label: "Report", minRole: "HOTEL_MANAGER" },
];

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, PRO: 3, ADMIN: 4, SUPER_ADMIN: 5,
};

export function HooSubNav({ userRole, properties, currentPropertyId, onPropertyChange }: HooSubNavProps) {
  const pathname = usePathname();

  const visibleItems = SUB_NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0);
  });

  return (
    <div className="bg-ivory border-b border-ivory-dark">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10 flex items-center justify-between">
        <nav className="flex gap-8">
          {visibleItems.map((item) => {
            const isActive = item.href === "/dashboard"
              ? pathname === "/dashboard"
              : pathname.startsWith(item.href);
            return (
              <Link key={item.href} href={item.href}
                className={`text-[13px] font-ui font-medium py-3 relative transition-colors ${
                  isActive ? "text-terracotta" : "text-charcoal/50 hover:text-charcoal"
                }`}>
                {item.label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-terracotta" />}
              </Link>
            );
          })}
        </nav>
        {properties.length > 1 && pathname === "/" && (
          <select
            value={currentPropertyId}
            onChange={(e) => onPropertyChange(e.target.value)}
            className="text-[11px] font-ui font-medium border border-ivory-dark px-2.5 py-1.5 bg-white text-charcoal focus:outline-none focus:border-terracotta max-w-[180px] truncate"
            style={{ borderRadius: 0 }}
          >
            <option value="">Tutte le strutture</option>
            {properties.map((p) => (
              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
            ))}
          </select>
        )}
      </div>
    </div>
  );
}
