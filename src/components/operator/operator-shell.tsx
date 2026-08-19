"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperatorHeader } from "./operator-header";
import { PushPermissionBanner } from "@/components/shared/push-permission-banner";

interface Property {
  id: string;
  name: string;
  code: string;
  tagline: string | null;
}

interface OperatorContextValue {
  currentPropertyId: string;
  setCurrentPropertyId: (id: string) => void;
  properties: Property[];
  userRole: string;
}

const OperatorContext = createContext<OperatorContextValue | null>(null);

export function useOperatorContext() {
  const ctx = useContext(OperatorContext);
  if (!ctx) throw new Error("useOperatorContext must be used within OperatorShell");
  return ctx;
}

interface OperatorShellProps {
  userName: string;
  userRole: string;
  canEdit?: boolean;
  properties: Property[];
  defaultPropertyId: string;
  children: React.ReactNode;
}

export const PROPERTY_STORAGE_KEY = "modusho_currentPropertyId";

/**
 * Risolve il contesto struttura secondo la precedenza invariata:
 *   ?propertyId=  →  localStorage  →  defaultPropertyId
 *
 * Un id che non è (più) fra le property accessibili viene scartato e si
 * ricade sul default: così un valore rimasto in localStorage dopo la revoca
 * di un'assegnazione non può finire né nella tendina né nella query.
 *
 * Funzione PURA: non tocca `window`. Viene invocata solo dopo il mount,
 * dal chiamante, che le passa i valori già letti.
 */
export function resolvePropertyId({
  paramPropertyId,
  storedPropertyId,
  defaultPropertyId,
  propertyIds,
}: {
  paramPropertyId: string | null;
  storedPropertyId: string | null;
  defaultPropertyId: string;
  propertyIds: string[];
}): string {
  if (paramPropertyId && propertyIds.includes(paramPropertyId)) return paramPropertyId;
  if (storedPropertyId && propertyIds.includes(storedPropertyId)) return storedPropertyId;
  return defaultPropertyId;
}

/**
 * Scheletro mostrato finché il contesto struttura non è risolto.
 *
 * REQUISITO, non dettaglio: prima della risoluzione la shell non deve
 * esporre NESSUN valore derivato dalla struttura — né la tendina, né il nome
 * hotel, né le liste. Il server e il client rendono esattamente questo
 * markup, quindi non esiste un valore su cui possano divergere e non c'è
 * nulla da riparare in idratazione.
 *
 * Riusa la utility `.skeleton` già definita in globals.css:144.
 */
function OperatorShellSkeleton() {
  return (
    <div className="min-h-screen bg-ivory">
      {/* Header: solo la barra e il brand — nessuna tendina struttura */}
      <div className="bg-terracotta sticky top-0 z-50">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-10">
          <div className="flex items-center h-14">
            <span className="font-heading text-white text-[15px] sm:text-[17px] tracking-[0.3em] font-normal">
              ModusHO
            </span>
          </div>
        </div>
      </div>
      <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-mobile-nav md:pb-0">
        <div className="space-y-4 py-10" aria-hidden="true">
          <div className="h-14 skeleton" />
          <div className="h-20 skeleton" />
          <div className="h-20 skeleton" />
        </div>
      </main>
    </div>
  );
}

export function OperatorShell({
  userName,
  userRole,
  canEdit,
  properties,
  defaultPropertyId,
  children,
}: OperatorShellProps) {
  const searchParams = useSearchParams();

  // Inizializzatore DETERMINISTICO: nessun accesso a `window` in nessuna forma.
  // Server e client partono dallo stesso valore, quindi non c'è mismatch di
  // idratazione possibile. Il valore vero arriva dopo il mount (effect sotto).
  const [currentPropertyId, setCurrentPropertyIdState] = useState(defaultPropertyId);

  // Governa il primo render: finché è false si mostra lo scheletro e i figli
  // non sono montati — quindi nessun fetch parte con un contesto provvisorio.
  const [contextResolved, setContextResolved] = useState(false);
  const resolvedOnceRef = useRef(false);

  // Wrapper: salva in localStorage ogni volta che cambia
  const setCurrentPropertyId = useCallback((id: string) => {
    setCurrentPropertyIdState(id);
    try { localStorage.setItem(PROPERTY_STORAGE_KEY, id); } catch {}
  }, []);

  // Risoluzione del contesto reale, dopo il mount, UNA SOLA VOLTA.
  // Il ref guard rende l'effect idempotente: anche se le dipendenze cambiano
  // (searchParams cambia a ogni navigazione) il corpo non viene rieseguito,
  // così una selezione manuale non può essere sovrascritta dal valore persistito.
  useEffect(() => {
    if (resolvedOnceRef.current) return;
    resolvedOnceRef.current = true;

    let storedPropertyId: string | null = null;
    try { storedPropertyId = localStorage.getItem(PROPERTY_STORAGE_KEY); } catch {}

    // Non riscrive localStorage: la persistenza resta governata da
    // setCurrentPropertyId, cioè da una scelta esplicita dell'utente.
    setCurrentPropertyIdState(
      resolvePropertyId({
        paramPropertyId: searchParams.get("propertyId"),
        storedPropertyId,
        defaultPropertyId,
        propertyIds: properties.map((p) => p.id),
      })
    );
    setContextResolved(true);
  }, [searchParams, properties, defaultPropertyId]);

  // Sincronizza con searchParams (deep link con ?propertyId=).
  // Gated su contextResolved per non anticipare la risoluzione iniziale.
  useEffect(() => {
    if (!contextResolved) return;
    const paramPropertyId = searchParams.get("propertyId");
    if (paramPropertyId && properties.some(p => p.id === paramPropertyId)) {
      setCurrentPropertyId(paramPropertyId);
    }
  }, [contextResolved, searchParams, properties, setCurrentPropertyId]);

  if (!contextResolved) return <OperatorShellSkeleton />;

  return (
    <OperatorContext.Provider value={{ currentPropertyId, setCurrentPropertyId, properties, userRole }}>
      <div className="min-h-screen bg-ivory">
        <OperatorHeader
          userName={userName}
          userRole={userRole}
          canEdit={canEdit}
          properties={properties}
          currentPropertyId={currentPropertyId}
          onPropertyChange={setCurrentPropertyId}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6 pb-mobile-nav md:pb-0">
          {children}
        </main>
        <PushPermissionBanner />
      </div>
    </OperatorContext.Provider>
  );
}
