"use client";

import { createContext, useContext, useState } from "react";
import { HooHeader } from "./hoo-header";
import { HooSubNav } from "./hoo-sub-nav";

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
        <HooSubNav userRole={userRole} />
        <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
          {children}
        </main>
      </div>
    </HooContext.Provider>
  );
}
