"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { sanitizeListQuery } from "@/lib/list-url-state";

interface ListBackLinkProps {
  /** Percorso della lista, costante e mai preso dall'indirizzo. */
  href: string;
  label: string;
}

/**
 * Voce "SOP" / "Documenti" del percorso in alto nel dettaglio.
 *
 * Riporta con sé lo stato della lista, che la lista stessa le ha consegnato in
 * `?back=` al momento del click: reparto, stato, testo cercato, pagina e la
 * voce su cui riposizionarsi. Sistemare solo il tasto indietro del browser
 * lascerebbe rotto proprio questo pulsante, che è quello che si usa dentro la
 * pagina.
 *
 * Il query string arriva dall'indirizzo, quindi è testo di provenienza esterna:
 * `sanitizeListQuery` tiene solo le chiavi note. Il percorso di destinazione è
 * `href`, costante: non c'è modo di far puntare altrove questo link.
 */
export function ListBackLink({ href, label }: ListBackLinkProps) {
  const back = sanitizeListQuery(useSearchParams().get("back"));
  return (
    <Link href={back ? `${href}?${back}` : href} className="hover:text-terracotta transition-colors">
      {label}
    </Link>
  );
}
