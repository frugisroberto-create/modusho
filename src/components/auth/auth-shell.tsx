import type { ReactNode } from "react";

/**
 * Cornice comune delle schermate credenziali (attivazione, reset, cambio).
 * Mobile-first: la maggior parte delle persone le aprirà dal telefono.
 */
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4 py-10">
      <div className="mb-8 text-center">
        <h1 className="font-heading text-[30px] sm:text-[34px] font-medium tracking-[0.15em] text-terracotta">
          ModusHO
        </h1>
        <p className="mt-2 font-ui text-[10px] sm:text-xs uppercase tracking-[0.3em] text-charcoal/45">
          HO Collection · Governance operativa
        </p>
      </div>

      <div className="w-full max-w-[420px] bg-ivory-medium border border-ivory-dark p-6 sm:p-9">
        <h2 className="font-heading text-[22px] sm:text-[25px] font-medium leading-snug text-charcoal-dark">
          {title}
        </h2>
        {subtitle && <div className="mt-2 text-sm font-ui text-charcoal/65 leading-relaxed">{subtitle}</div>}
        <div className="mt-6">{children}</div>
      </div>
    </div>
  );
}
