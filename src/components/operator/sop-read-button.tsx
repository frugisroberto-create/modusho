"use client";

/**
 * Il pulsante con cui si apre una procedura.
 *
 * Non scrive niente per conto proprio: chiama /api/sop/[id]/acknowledge, la
 * stessa rotta che chiamava il pulsante condiviso, quindi la lettura finisce
 * negli stessi due registri di sempre. Qui cambiano solo le parole e il
 * colore — e il fatto che un click andato male adesso lo dice.
 *
 * Resta separato da AcknowledgeButton perché quello serve anche a memo e
 * documenti, che questa modifica non tocca.
 */

import { useState } from "react";
import { useRouter } from "next/navigation";
import { incrementAckCount } from "@/components/shared/push-permission-banner";
import {
  classifySopReadClick,
  SOP_READ_NETWORK_OUTCOME,
  type SopReadClickOutcome,
} from "@/lib/sop-read";

interface Props {
  contentId: string;
}

export function SopReadButton({ contentId }: Props) {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [errore, setErrore] = useState<string | null>(null);

  const leggi = async () => {
    setLoading(true);
    setErrore(null);

    let esito: SopReadClickOutcome;
    try {
      const res = await fetch(`/api/sop/${contentId}/acknowledge`, { method: "POST" });
      esito = classifySopReadClick(res.status);
    } catch {
      esito = SOP_READ_NETWORK_OUTCOME;
    }

    if (esito.kind === "ok") {
      incrementAckCount();
      // La pagina si ridisegna e il pannello sparisce: il pulsante resta in
      // attesa fino ad allora, invece di tornare cliccabile per un istante.
      router.refresh();
      return;
    }

    setLoading(false);
    // Sessione decaduta: se ne occupa il guard, qui non si dice nulla.
    if (esito.kind === "error") setErrore(esito.message);
  };

  return (
    <div className="space-y-3">
      <button
        onClick={leggi}
        disabled={loading}
        className="px-6 py-3 text-sm font-ui font-semibold text-white bg-green-read hover:bg-green-read/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {loading ? "Apertura in corso..." : "Clicca qui per leggere la procedura"}
      </button>
      {errore && (
        <p role="alert" className="text-sm font-ui text-alert-red">
          {errore}
        </p>
      )}
    </div>
  );
}
