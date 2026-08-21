"use client";

import { SessionProvider } from "next-auth/react";
import { SessionGuard } from "@/components/session-guard";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {/* Punto unico in cui una sessione decaduta viene dichiarata all'utente. */}
      <SessionGuard>{children}</SessionGuard>
    </SessionProvider>
  );
}
