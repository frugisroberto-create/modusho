"use client";

import { useEffect, useState } from "react";

/**
 * Il link di attivazione, in chiaro e copiabile.
 *
 * Esiste perché l'email può non arrivare — o non partire affatto — e in quel
 * caso l'invito deve poter essere consegnato lo stesso, a voce o su un altro
 * canale. Compare solo dopo l'operazione che genera il link: non c'è modo di
 * tornare a chiederlo, e non deve essercene (rigenerarlo invalida il
 * precedente, ed è una proprietà voluta).
 */

interface Props {
  url: string;
  expiresAt: string;
}

/** "19 settembre 2026" — data lunga, come la scriverebbe una persona. */
function formatExpiry(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("it-IT", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

export function ActivationLinkBox({ url, expiresAt }: Props) {
  const [copied, setCopied] = useState(false);

  // La conferma di copia si spegne da sola: è un segnale, non uno stato.
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 2500);
    return () => clearTimeout(timer);
  }, [copied]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      // Contesti senza permesso sugli appunti (o senza HTTPS): il link resta
      // comunque selezionabile a mano, che è il motivo per cui è in chiaro.
      setCopied(false);
    }
  };

  const expiry = formatExpiry(expiresAt);

  return (
    <div className="border border-ivory-dark bg-ivory p-4 space-y-3">
      <div className="flex items-baseline justify-between gap-3 flex-wrap">
        <p className="text-[11px] font-ui font-semibold uppercase tracking-wider text-charcoal/60">
          Link personale di attivazione
        </p>
        {expiry && (
          <p className="text-xs font-ui text-charcoal/60">Valido fino al {expiry}</p>
        )}
      </div>

      <p className="font-mono text-xs text-charcoal break-all select-all bg-white border border-ivory-dark p-2.5">
        {url}
      </p>

      <div className="flex items-center gap-3 flex-wrap">
        <button
          type="button"
          onClick={handleCopy}
          className="px-4 py-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta/30 hover:bg-terracotta hover:text-white transition-colors"
        >
          Copia link
        </button>
        {copied && (
          <span aria-live="polite" className="text-xs font-ui text-sage">
            Link copiato.
          </span>
        )}
      </div>
    </div>
  );
}
