"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import { useIsMobile } from "@/hooks/use-is-mobile";
import { HooHeader } from "./hoo-header";
import { HooSubNav } from "./hoo-sub-nav";

/**
 * Mobile gating: solo le rotte di pura gestione/governance richiedono desktop.
 * Le altre (lettura, approvazioni, dettagli) sono utilizzabili da mobile.
 *
 * - Tutte le rotte di create/edit di contenuti sono desktop-only perché passano
 *   per il TargetAudienceSelector che ha senso solo su schermi grandi.
 * - Le rotte di lettura, approvazione, lista sono mobile-friendly.
 */
function isDesktopOnlyRoute(pathname: string): boolean {
  // Governance e gestione (sempre desktop)
  if (pathname.startsWith("/dashboard")) return true;
  if (pathname.startsWith("/analytics")) return true;
  if (pathname.startsWith("/users")) return true;
  if (pathname.startsWith("/properties")) return true;
  if (pathname.startsWith("/reports")) return true;
  if (pathname.startsWith("/sop-import")) return true;
  if (pathname.startsWith("/content/deleted")) return true;

  // Creazione/modifica contenuti (desktop per il TargetAudienceSelector)
  if (pathname === "/hoo-sop/new" || pathname.match(/^\/hoo-sop\/[^/]+\/edit$/)) return true;
  if (pathname === "/library/new") return true;
  if (pathname === "/memo/new") return true;
  if (pathname === "/hoo-standard-book/new" || pathname.match(/^\/hoo-standard-book\/[^/]+\/edit$/)) return true;
  if (pathname === "/hoo-brand-book/new" || pathname.match(/^\/hoo-brand-book\/[^/]+\/edit$/)) return true;

  // Lettura/operatività: mobile OK
  return false;
}

interface HooProperty {
  id: string;
  name: string;
  code: string;
}

interface HooContextValue {
  currentPropertyId: string;
  setCurrentPropertyId: (id: string) => void;
  properties: HooProperty[];
  userRole: string;
}

const HooContext = createContext<HooContextValue | null>(null);

export function useHooContext() {
  const ctx = useContext(HooContext);
  if (!ctx) throw new Error("useHooContext must be used within HooShell");
  return ctx;
}

interface HooShellProps {
  userName: string;
  userRole: string;
  properties: HooProperty[];
  children: React.ReactNode;
}

export function HooShell({ userName, userRole, properties, children }: HooShellProps) {
  const [currentPropertyId, setCurrentPropertyId] = useState("");
  const isMobile = useIsMobile();
  const pathname = usePathname();

  // Mobile gating granulare: blocca solo le rotte di gestione/governance
  // e di creazione/modifica contenuti. Lettura e approvazioni sono OK.
  if (isMobile && isDesktopOnlyRoute(pathname)) {
    return (
      <div className="min-h-screen bg-ivory-medium flex flex-col items-center justify-center px-6 py-16 text-center">
        <div className="w-12 h-12 rounded-full bg-terracotta/10 flex items-center justify-center mb-4">
          <svg className="w-6 h-6 text-terracotta" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
          </svg>
        </div>
        <h2 className="text-lg font-heading font-medium text-charcoal-dark mb-2">
          Disponibile solo su desktop
        </h2>
        <p className="text-sm font-ui text-charcoal/50 max-w-xs mb-6">
          Questa funzione richiede uno schermo desktop per essere usata correttamente.
          Puoi consultare le altre sezioni (SOP, memo, documenti, approvazioni) anche da mobile.
        </p>
        <a href="/" className="text-sm font-ui font-semibold text-terracotta hover:opacity-70 transition-opacity">
          Torna alla home
        </a>
      </div>
    );
  }

  return (
    <HooContext.Provider value={{ currentPropertyId, setCurrentPropertyId, properties, userRole }}>
      <div className="min-h-screen bg-ivory-medium">
        <HooHeader
          userName={userName}
          userRole={userRole}
          properties={properties}
          currentPropertyId={currentPropertyId}
          onPropertyChange={setCurrentPropertyId}
        />
        <HooSubNav
          userRole={userRole}
          properties={properties}
          currentPropertyId={currentPropertyId}
          onPropertyChange={setCurrentPropertyId}
        />
        <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
          {children}
        </main>
      </div>
    </HooContext.Provider>
  );
}
