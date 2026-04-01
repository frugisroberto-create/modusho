"use client";

import { useState, useEffect } from "react";

/**
 * Hook per distinguere viewport mobile (< 768px) da desktop/tablet.
 * Usa matchMedia per evitare hydration mismatch: il valore iniziale e' false (desktop),
 * poi si aggiorna lato client dopo il mount.
 */
export function useIsMobile(breakpoint = 768) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mql.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener("change", handler);
    return () => mql.removeEventListener("change", handler);
  }, [breakpoint]);

  return isMobile;
}
