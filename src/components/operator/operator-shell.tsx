"use client";

import { createContext, useCallback, useContext, useState } from "react";
import { useSearchParams } from "next/navigation";
import { OperatorHeader } from "./operator-header";

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
  pendingCount: number;
  children: React.ReactNode;
}

export function OperatorShell({
  userName,
  userRole,
  properties,
  defaultPropertyId,
  pendingCount,
  children,
}: OperatorShellProps) {
  const searchParams = useSearchParams();
  const paramPropertyId = searchParams.get("propertyId");
  const initialPropertyId = paramPropertyId && properties.some(p => p.id === paramPropertyId)
    ? paramPropertyId
    : defaultPropertyId;
  const [currentPropertyId, setCurrentPropertyId] = useState(initialPropertyId);

  const handlePropertyChange = useCallback((id: string) => {
    setCurrentPropertyId(id);
  }, []);

  return (
    <OperatorContext.Provider value={{ currentPropertyId, setCurrentPropertyId, properties, userRole }}>
      <div className="min-h-screen bg-ivory-medium">
        <OperatorHeader
          userName={userName}
          userRole={userRole}
          properties={properties}
          currentPropertyId={currentPropertyId}
          pendingCount={pendingCount}
          onPropertyChange={handlePropertyChange}
        />
        <main className="max-w-7xl mx-auto px-4 sm:px-6">
          {children}
        </main>
      </div>
    </OperatorContext.Provider>
  );
}
