"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";

interface Property {
  id: string;
  name: string;
  code: string;
  tagline: string | null;
}

interface OperatorHeaderProps {
  userName: string;
  userRole: string;
  properties: Property[];
  currentPropertyId: string;
  pendingCount: number;
  onPropertyChange: (propertyId: string) => void;
}

const NAV_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/", label: "Home" },
  { href: "/sop", label: "SOP" },
  { href: "/documents", label: "Documenti" },
  { href: "/comunicazioni", label: "Memo" },
  { href: "/brand-book", label: "Brand Book", minRole: "HOTEL_MANAGER" },
  { href: "/standard-book", label: "Standard Book" },
];

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4,
};

export function OperatorHeader({
  userName,
  userRole,
  properties,
  currentPropertyId,
  pendingCount,
  onPropertyChange,
}: OperatorHeaderProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const canAccessDashboard = ["HOD", "HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(userRole);
  const currentProperty = properties.find((p) => p.id === currentPropertyId);
  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <header className="bg-terracotta sticky top-0 z-50">
      <div className="max-w-[1400px] mx-auto px-6 lg:px-10">
        <div className="flex items-center h-14">

          {/* BLOCK 1 — Brand */}
          <Link href="/" className="shrink-0 mr-10">
            <span className="font-heading text-white text-[17px] tracking-[0.3em] font-normal">
              MODUSHO
            </span>
          </Link>

          {/* BLOCK 2 — Primary Navigation */}
          <nav className="hidden md:flex items-center gap-4 lg:gap-6 flex-1">
            {NAV_ITEMS.filter(item => !item.minRole || (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0)).map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`text-[13px] font-heading py-4 relative transition-colors whitespace-nowrap ${
                    isActive ? "text-white" : "text-white/70 hover:text-white"
                  }`}>
                  {item.label}
                  {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                </Link>
              );
            })}
          </nav>

          {/* BLOCK 3 — Utility Area */}
          <div className="flex items-center gap-3 ml-auto">

            {/* 3A — Approvals entry (only for management roles) */}
            {canAccessDashboard && (
              <Link href="/dashboard" className="flex items-center gap-1.5 text-white/80 hover:text-white transition-colors">
                <span className="text-[11px] font-ui font-semibold uppercase tracking-wider hidden sm:inline">Governance</span>
                {pendingCount > 0 && (
                  <span className="flex items-center justify-center min-w-[20px] h-5 rounded-full bg-white/25 text-white text-[10px] font-ui font-bold px-1.5">
                    {pendingCount > 99 ? "99+" : pendingCount}
                  </span>
                )}
              </Link>
            )}

            {/* 3B — Property Switcher (compact) */}
            {properties.length > 1 ? (
              <select value={currentPropertyId}
                onChange={(e) => onPropertyChange(e.target.value)}
                className="text-[11px] font-ui border border-white/20 px-2 py-1 bg-white/10 text-white/90 focus:outline-none max-w-[130px] truncate"
                style={{ borderRadius: 0 }}>
                {properties.map((p) => (
                  <option key={p.id} value={p.id} className="text-charcoal">{p.code} — {p.name}</option>
                ))}
              </select>
            ) : currentProperty ? (
              <span className="text-[11px] font-ui text-white/60 tracking-wider uppercase hidden sm:inline">
                {currentProperty.code}
              </span>
            ) : null}

            {/* 3C — User Dropdown */}
            <div className="relative">
              <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                className="flex items-center gap-2 text-white/85 hover:text-white transition-colors py-1">
                <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-ui font-bold text-white">
                  {initials}
                </div>
                <svg className={`w-3 h-3 text-white/50 transition-transform ${userMenuOpen ? "rotate-180" : ""}`}
                  fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </button>

              {userMenuOpen && (
                <>
                  <div className="fixed inset-0 z-40" onClick={() => setUserMenuOpen(false)} />
                  <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-ivory-dark z-50 py-1 shadow-lg">
                    <div className="px-4 py-3 border-b border-ivory-dark">
                      <p className="text-sm font-ui font-medium text-charcoal-dark">{userName}</p>
                      <p className="text-[11px] font-ui text-charcoal/50 mt-0.5">{userRole === "ADMIN" || userRole === "SUPER_ADMIN" ? "HOO" : userRole.replace("_", " ")}</p>
                    </div>
                    {canAccessDashboard && (
                      <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}
                        className="block px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory transition-colors">
                        Dashboard
                      </Link>
                    )}
                    <button onClick={() => signOut({ callbackUrl: "/login" })}
                      className="w-full text-left px-4 py-2 text-sm font-ui text-charcoal/60 hover:bg-ivory hover:text-charcoal transition-colors">
                      Esci
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
