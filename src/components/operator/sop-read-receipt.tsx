/**
 * La riga che resta dopo che una procedura è stata letta.
 *
 * Dice quello che è successo davvero — la procedura è stata aperta e letta —
 * e non quello che non è successo: nessuno ha firmato niente. Per questo
 * "Letta il", e non più "Presa visione confermata".
 *
 * Come il pannello, sta in un componente suo per poter essere montato in un
 * test: la parola esatta è il fatto in collaudo.
 */

interface Props {
  /** ISO string della lettura registrata. */
  readAt: string;
  /** Versione a cui si riferisce la lettura (non sempre quella corrente). */
  version: number | undefined;
}

/** Stesso formato di data di prima: giorno, mese, anno, ora e minuti. */
function formatReadAt(readAt: string): string {
  return new Date(readAt).toLocaleString("it-IT", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SopReadReceipt({ readAt, version }: Props) {
  return (
    <div className="bg-white border border-ivory-dark">
      <div className="px-5 py-3 bg-ivory border-b border-ivory-dark">
        <span className="text-xs font-ui font-semibold uppercase tracking-wider text-charcoal/50">
          Lettura
        </span>
      </div>
      <div className="px-5 py-5">
        <div className="flex items-center gap-3">
          <svg className="w-5 h-5 text-[#2E7D32] shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
          </svg>
          <p className="text-sm font-ui font-medium text-[#2E7D32]">
            Letta il {formatReadAt(readAt)} — versione {version}
          </p>
        </div>
      </div>
    </div>
  );
}
