"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

interface HooSubNavProps {
  userRole: string;
}

const SUB_NAV_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/dashboard", label: "Overview" },
  { href: "/approvals", label: "Approvazioni" },
  { href: "/users", label: "Gestione utenti", minRole: "ADMIN" },
  { href: "/properties", label: "Strutture", minRole: "ADMIN" },
  { href: "/reports", label: "Report" },
  { href: "/memo", label: "Memo" },
];

export function HooSubNav({ userRole }: HooSubNavProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const visibleItems = SUB_NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    if (item.minRole === "ADMIN") return isAdmin;
    return false;
  });

  return (
    <div className="bg-ivory border-b border-ivory-dark">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
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
      </div>
    </div>
  );
}
