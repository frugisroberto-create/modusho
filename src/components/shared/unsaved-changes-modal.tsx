"use client";

import type { UnsavedChangesGuard } from "@/hooks/use-unsaved-changes-guard";

interface Props {
  guard: UnsavedChangesGuard;
}

/**
 * Il modal "hai modifiche non salvate", con due sole scelte: Salva, o
 * Continua senza salvare. Un terzo link discreto permette di restare sulla
 * pagina senza dover scegliere fra le due.
 */
export function UnsavedChangesModal({ guard }: Props) {
  if (!guard.pending) return null;

  return (
    <div className="fixed inset-0 bg-charcoal-dark/60 flex items-center justify-center z-50 p-4">
      <div className="bg-ivory w-full max-w-md p-6 border border-ivory-dark">
        <h3 className="text-lg font-heading font-semibold text-charcoal-dark mb-2">
          Hai modifiche non salvate
        </h3>
        <p className="text-sm font-ui text-charcoal mb-5">
          Se continui senza salvare, quello che hai scritto va perso.
        </p>

        {guard.saveError && (
          <p className="text-sm font-ui text-alert-red mb-4">{guard.saveError}</p>
        )}

        <div className="flex flex-col gap-2">
          <button
            onClick={guard.saveAndLeave}
            disabled={guard.saving}
            className="w-full px-4 py-3 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50"
          >
            {guard.saving ? "Salvataggio..." : "Salva"}
          </button>
          <button
            onClick={guard.discardAndLeave}
            disabled={guard.saving}
            className="w-full px-4 py-3 text-sm font-ui font-medium text-charcoal bg-ivory-dark hover:bg-ivory-medium border border-ivory-dark transition-colors disabled:opacity-50"
          >
            Continua (senza salvare)
          </button>
          <button
            onClick={guard.cancel}
            disabled={guard.saving}
            className="w-full px-4 py-2 text-sm font-ui text-charcoal/50 hover:text-charcoal transition-colors disabled:opacity-50"
          >
            Annulla
          </button>
        </div>
      </div>
    </div>
  );
}
