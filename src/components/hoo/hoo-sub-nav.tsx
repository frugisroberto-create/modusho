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
  canEdit?: boolean;
  properties: HooProperty[];
  currentPropertyId: string;
  onPropertyChange: (id: string) => void;
}

const SUB_NAV_ITEMS: { href: string; label: string; minRole?: string; excludeRoles?: string[]; requiresCanEdit?: boolean }[] = [
  { href: "/dashboard", label: "Overview", minRole: "HOTEL_MANAGER", excludeRoles: ["CORPORATE"] },
  { href: "/approvals", label: "Approvazioni", minRole: "HOD", requiresCanEdit: true },
  { href: "/compliance", label: "Presa visione", minRole: "HOD" },
  // Gestione utenti: da HOD in su. L'HOD senza canCreateUsers vede comunque la
  // lista del proprio reparto in sola lettura (serve a sollecitare chi non si è
  // ancora attivato); le azioni le governa il flag, non la voce di menu.
  { href: "/users", label: "Gestione utenti", minRole: "HOD", excludeRoles: ["CORPORATE"] },
  { href: "/properties", label: "Strutture", minRole: "ADMIN" },
  { href: "/reports", label: "Report", minRole: "HOTEL_MANAGER", excludeRoles: ["CORPORATE"] },
];

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, CORPORATE: 2, ADMIN: 3, SUPER_ADMIN: 4,
};

export function HooSubNav({ userRole, canEdit = false, properties, currentPropertyId, onPropertyChange }: HooSubNavProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  // CORPORATE senza canEdit: solo consultazione, nessuna funzione di gestione
  if (userRole === "CORPORATE" && !canEdit) return null;

  const visibleItems = SUB_NAV_ITEMS.filter((item) => {
    if (item.excludeRoles?.includes(userRole)) return false;
    if (item.requiresCanEdit && !isAdmin && !canEdit) return false;
    if (!item.minRole) return true;
    return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0);
  });

  if (visibleItems.length === 0) return null;

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
