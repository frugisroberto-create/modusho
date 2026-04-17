"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { NotificationBell } from "@/components/shared/notification-bell";

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
  onPropertyChange: (propertyId: string) => void;
}

const NAV_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/", label: "Home" },
  { href: "/sop", label: "SOP" },
  { href: "/documents", label: "Documenti" },
  { href: "/comunicazioni", label: "Memo" },
  { href: "/brand-book", label: "Brand Book", minRole: "HOTEL_MANAGER" },
  // Standard Book è visibile a tutti i ruoli: la lista lato server filtra
  // per targetAudience, quindi OPERATOR/HOD vedono solo le sezioni del
  // proprio perimetro (reparto/ruolo/utente).
  { href: "/standard-book", label: "Standard Book" },
];

const ROLE_LEVEL: Record<string, number> = {
  OPERATOR: 0, HOD: 1, HOTEL_MANAGER: 2, PRO: 3, ADMIN: 4, SUPER_ADMIN: 5,
};

// Bottom nav mobile — solo sezioni contenuto principali
const MOBILE_NAV: { href: string; label: string; icon: string }[] = [
  { href: "/", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-4 0h4" },
  { href: "/sop", label: "SOP", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/documents", label: "Documenti", icon: "M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" },
  { href: "/comunicazioni", label: "Memo", icon: "M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z" },
];

export function OperatorHeader({
  userName,
  userRole,
  properties,
  currentPropertyId,
  onPropertyChange,
}: OperatorHeaderProps) {
  const pathname = usePathname();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const canAccessDashboard = ["HOD", "HOTEL_MANAGER", "PRO", "ADMIN", "SUPER_ADMIN"].includes(userRole);
  const currentProperty = properties.find((p) => p.id === currentPropertyId);
  const initials = userName.split(" ").map(n => n[0]).join("").slice(0, 2);

  return (
    <>
      {/* ── Desktop/Tablet Header ── */}
      <header className="bg-terracotta sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center h-14">

            {/* Brand */}
            <Link href="/" className="shrink-0 mr-6 md:mr-10">
              <span className="font-heading text-white text-[15px] sm:text-[17px] tracking-[0.3em] font-normal">
                ModusHO
              </span>
            </Link>

            {/* Desktop Navigation */}
            <nav className="hidden md:flex items-center gap-4 lg:gap-6 flex-1">
              {NAV_ITEMS.filter(item => !item.minRole || (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[item.minRole] ?? 0)).map((item) => {
                const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`text-[13px] font-ui py-4 relative transition-colors whitespace-nowrap ${
                      isActive ? "text-white" : "text-white/70 hover:text-white"
                    }`}>
                    {item.label}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                  </Link>
                );
              })}
            </nav>

            {/* Utility Area */}
            <div className="flex items-center gap-3 ml-auto">

              <NotificationBell />

              {/* Property Switcher */}
              {properties.length > 1 ? (
                <select value={currentPropertyId}
                  onChange={(e) => onPropertyChange(e.target.value)}
                  className="hidden sm:block text-[11px] font-ui border border-white/20 px-2 py-1 bg-white/10 text-white/90 focus:outline-none max-w-[130px] truncate"
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

              {/* User Dropdown */}
              <div className="relative">
                <button onClick={() => setUserMenuOpen(!userMenuOpen)}
                  className="flex items-center gap-1.5 text-white/85 hover:text-white transition-colors py-1">
                  <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-[10px] font-ui font-bold text-white">
                    {initials}
                  </div>
                  <svg className={`w-3 h-3 text-white/50 transition-transform hidden sm:block ${userMenuOpen ? "rotate-180" : ""}`}
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
                      {/* Property switcher in dropdown per mobile */}
                      {properties.length > 1 && (
                        <div className="px-4 py-2 border-b border-ivory-dark sm:hidden">
                          <select value={currentPropertyId}
                            onChange={(e) => { onPropertyChange(e.target.value); setUserMenuOpen(false); }}
                            className="w-full text-[11px] font-ui border border-ivory-dark px-2 py-1.5 bg-white text-charcoal"
                            style={{ borderRadius: 0 }}>
                            {properties.map((p) => (
                              <option key={p.id} value={p.id}>{p.code} — {p.name}</option>
                            ))}
                          </select>
                        </div>
                      )}
                      {canAccessDashboard && (
                        <Link href="/dashboard" onClick={() => setUserMenuOpen(false)}
                          className="block px-4 py-2 text-sm font-ui text-charcoal hover:bg-ivory transition-colors">
                          Dashboard
                        </Link>
                      )}
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
        </div>
      </header>

      {/* ── Mobile Bottom Navigation ── */}
      <MobileBottomNav pathname={pathname} userRole={userRole} />
    </>
  );
}

// ─── Mobile Bottom Nav ───────────────────────────────────────────────

const MORE_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/brand-book", label: "Brand Book", minRole: "HOTEL_MANAGER" },
  // Standard Book visibile a tutti — lista filtrata server-side per targetAudience
  { href: "/standard-book", label: "Standard Book" },
];

function MobileBottomNav({ pathname, userRole }: { pathname: string; userRole: string }) {
  const [moreOpen, setMoreOpen] = useState(false);

  const visibleMoreItems = MORE_ITEMS.filter(i => !i.minRole || (ROLE_LEVEL[userRole] ?? 0) >= (ROLE_LEVEL[i.minRole] ?? 0));
  const isMoreActive = visibleMoreItems.some(i => pathname.startsWith(i.href));
  // Se nessuna voce è visibile al ruolo, nascondi del tutto il bottone "Altro"
  // per evitare un pannello vuoto (regressione storica).
  const showMoreButton = visibleMoreItems.length > 0;

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-ivory-dark safe-bottom">
      {/* Pannello "Altro" */}
      {moreOpen && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setMoreOpen(false)} />
          <div className="absolute bottom-full left-0 right-0 bg-white border-t border-ivory-dark z-50 py-1 shadow-lg">
            {visibleMoreItems.map((item) => (
              <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
                className={`block px-5 py-3 text-sm font-ui transition-colors ${
                  pathname.startsWith(item.href) ? "text-terracotta font-medium" : "text-charcoal hover:bg-ivory"
                }`}>
                {item.label}
              </Link>
            ))}
          </div>
        </>
      )}

      <div className="flex items-center justify-around h-14">
        {MOBILE_NAV.map((item) => {
          const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={() => setMoreOpen(false)}
              className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
                isActive ? "text-terracotta" : "text-charcoal/40"
              }`}>
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              <span className="text-[10px] font-ui font-medium">{item.label}</span>
            </Link>
          );
        })}
        {/* Voce "Altro" — nascosta se non ci sono voci visibili al ruolo corrente */}
        {showMoreButton && (
          <button onClick={() => setMoreOpen(!moreOpen)}
            className={`flex flex-col items-center justify-center gap-0.5 flex-1 h-full transition-colors ${
              isMoreActive || moreOpen ? "text-terracotta" : "text-charcoal/40"
            }`}>
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M5 12h.01M12 12h.01M19 12h.01M6 12a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0zm7 0a1 1 0 11-2 0 1 1 0 012 0z" />
            </svg>
            <span className="text-[10px] font-ui font-medium">Altro</span>
          </button>
        )}
      </div>
    </nav>
  );
}
