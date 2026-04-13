"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
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
  properties: Property[];
  defaultPropertyId: string;
  children: React.ReactNode;
}

const PROPERTY_STORAGE_KEY = "modusho_currentPropertyId";

export function OperatorShell({
  userName,
  userRole,
  properties,
  defaultPropertyId,
  children,
}: OperatorShellProps) {
  const searchParams = useSearchParams();

  // Inizializza da: 1) searchParams, 2) localStorage, 3) defaultPropertyId
  const [currentPropertyId, setCurrentPropertyIdState] = useState(() => {
    if (typeof window === "undefined") return defaultPropertyId;
    const paramProp = new URLSearchParams(window.location.search).get("propertyId");
    if (paramProp && properties.some(p => p.id === paramProp)) return paramProp;
    const stored = localStorage.getItem(PROPERTY_STORAGE_KEY);
    if (stored && properties.some(p => p.id === stored)) return stored;
    return defaultPropertyId;
  });

  // Wrapper: salva in localStorage ogni volta che cambia
  const setCurrentPropertyId = useCallback((id: string) => {
    setCurrentPropertyIdState(id);
    try { localStorage.setItem(PROPERTY_STORAGE_KEY, id); } catch {}
  }, []);

  // Sincronizza con searchParams (deep link con ?propertyId=)
  useEffect(() => {
    const paramPropertyId = searchParams.get("propertyId");
    if (paramPropertyId && properties.some(p => p.id === paramPropertyId)) {
      setCurrentPropertyId(paramPropertyId);
    }
  }, [searchParams, properties, setCurrentPropertyId]);

  return (
    <OperatorContext.Provider value={{ currentPropertyId, setCurrentPropertyId, properties, userRole }}>
      <div className="min-h-screen bg-ivory">
        <OperatorHeader
          userName={userName}
          userRole={userRole}
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
