"use client";

import { useIsMobile } from "@/hooks/use-is-mobile";

/**
 * Non renderizza i children su viewport mobile (< 768px).
 * A differenza di `hidden md:block` CSS, questo previene completamente il rendering
 * e il fetch di dati dei componenti figli su mobile.
 */
export function MobileHide({ children }: { children: React.ReactNode }) {
  const isMobile = useIsMobile();
  if (isMobile) return null;
  return <>{children}</>;
}
