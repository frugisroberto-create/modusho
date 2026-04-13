"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";

interface HooProperty {
  id: string;
  name: string;
  code: string;
}

interface HooHeaderProps {
  userName: string;
  userRole: string;
  properties: HooProperty[];
  currentPropertyId: string;
  onPropertyChange: (id: string) => void;
}

const HOO_NAV_ITEMS: { href: string; label: string; minRole?: string; adminOnly?: boolean }[] = [
  { href: "/dashboard", label: "Home", adminOnly: true },
  { href: "/hoo-sop", label: "SOP" },
  { href: "/library", label: "Documenti", minRole: "HOTEL_MANAGER" },
  { href: "/memo", label: "Memo", minRole: "HOTEL_MANAGER" },
  { href: "/hoo-brand-book", label: "Brand Book", minRole: "HOTEL_MANAGER" },
  { href: "/hoo-standard-book", label: "Standard Book" },
];

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, ADMIN: 3, SUPER_ADMIN: 4,
};

const ROLE_LABEL: Record<string, string> = {
  SUPER_ADMIN: "HOO",
  ADMIN: "HOO",
  HOTEL_MANAGER: "Hotel Manager",
  HOD: "HOD",
  OPERATOR: "Operatore",
};

export function HooHeader({ userName, userRole }: HooHeaderProps) {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const isHoo = userRole === "ADMIN" || userRole === "SUPER_ADMIN";
  const visibleNav = HOO_NAV_ITEMS.filter((item) => {
    if (item.adminOnly && !isHoo) return false;
    if (!item.minRole) return true;
    return (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0);
  });

  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <header className="bg-terracotta sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-3 md:gap-10">
            {/* Mobile hamburger */}
            <button onClick={() => setMobileNavOpen(!mobileNavOpen)}
              className="md:hidden text-white p-1 -ml-1"
              aria-label="Apri menu navigazione">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                {mobileNavOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                )}
              </svg>
            </button>
            <Link href={isHoo ? "/dashboard" : "/hoo-sop"} className="shrink-0">
              <span className="font-heading text-white text-base tracking-[0.25em] font-normal">
                ModusHO
              </span>
            </Link>
            <nav className="hidden md:flex gap-7">
              {visibleNav.map((item) => {
                const isActive = item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`text-sm font-ui py-4 relative transition-colors ${
                      isActive ? "text-white" : "text-white/75 hover:text-white"
                    }`}>
                    {item.label}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User menu */}
          <div className="relative">
            <button onClick={() => setMenuOpen(!menuOpen)}
              className="flex items-center gap-2 text-white/85 hover:text-white transition-colors py-1">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-ui font-bold text-white">
                {initials}
              </div>
              <span className="hidden sm:inline text-[13px] font-ui">{userName}</span>
              <svg className={`w-3 h-3 text-white/50 transition-transform ${menuOpen ? "rotate-180" : ""}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>

            {menuOpen && (
              <>
                <div className="fixed inset-0 z-40" onClick={() => setMenuOpen(false)} />
                <div className="absolute right-0 top-full mt-1 w-52 bg-white border border-ivory-dark z-50 py-1 shadow-lg">
                  <div className="px-4 py-3 border-b border-ivory-dark">
                    <p className="text-sm font-ui font-medium text-charcoal-dark">{userName}</p>
                    <p className="text-[11px] font-ui text-charcoal/50 mt-0.5">{ROLE_LABEL[userRole] || userRole}</p>
                  </div>
                  <Link href="/?view=hotel" onClick={() => setMenuOpen(false)}
                    className="block px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory transition-colors">
                    Vista Hotel
                  </Link>
                  <button onClick={() => signOut({ redirect: false }).then(() => { window.location.href = "/login"; })}
                    className="w-full text-left px-4 py-2 text-sm font-ui text-charcoal/60 hover:bg-ivory hover:text-charcoal transition-colors">
                    Esci
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Mobile nav drop-down */}
      {mobileNavOpen && (
        <>
          <div className="fixed inset-0 z-40 bg-charcoal-dark/30" onClick={() => setMobileNavOpen(false)} />
          <nav className="md:hidden absolute top-full left-0 right-0 bg-terracotta border-t border-white/15 z-50 shadow-lg">
            {visibleNav.map((item) => {
              const isActive = item.href === "/dashboard"
                ? pathname === "/dashboard"
                : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href} onClick={() => setMobileNavOpen(false)}
                  className={`block px-6 py-3 text-sm font-ui border-b border-white/10 transition-colors ${
                    isActive ? "text-white bg-white/10" : "text-white/85 hover:bg-white/5"
                  }`}>
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </>
      )}
    </header>
  );
}
