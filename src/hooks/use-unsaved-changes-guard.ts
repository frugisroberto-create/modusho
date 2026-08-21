"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";

export interface UnsavedChangesGuard {
  /** C'è una richiesta di navigazione in sospeso: il chiamante mostra il modal. */
  pending: boolean;
  saving: boolean;
  saveError: string | null;
  /** L'utente ha scelto "Salva": esegue il salvataggio, e solo se riesce completa la navigazione. */
  saveAndLeave: () => void;
  /** L'utente ha scelto "Continua (senza salvare)": completa la navigazione, scarta le modifiche. */
  discardAndLeave: () => void;
  /** L'utente ha chiuso il modal senza scegliere: resta sulla pagina. */
  cancel: () => void;
  /** Da usare sui bottoni che navigano in modo imperativo (es. "Annulla" → router.back()). */
  requestNavigation: (proceed: () => void) => void;
}

/**
 * Blocca l'uscita dalla pagina finché `dirty` è vero, offrendo "Salva" o
 * "Continua (senza salvare)" invece del confirm() generico del browser.
 *
 * Copre tre modi di lasciare la pagina:
 *   1. Click su un link interno (<a>/<Link>) — intercettato in fase di
 *      cattura sul document, PRIMA che il router di Next.js veda il click:
 *      è il punto in cui l'intento di navigare è certo, e non dipende da
 *      come il router implementa internamente la navigazione (a differenza
 *      di un monkey-patch su `history.pushState`, fragile fra una versione
 *      di Next e l'altra).
 *   2. Indietro/avanti del browser (popstate).
 *   3. Chiusura o ricarica della scheda (beforeunload).
 *
 * Sul punto 3 un modal personalizzato NON è possibile: è un vincolo del
 * browser, non una scelta — nessun browser moderno permette di sostituire
 * quel dialog con contenuto arbitrario, per motivi di sicurezza (altrimenti
 * un sito potrebbe imitare un avviso di sistema). Lì resta il prompt nativo
 * generico del browser.
 *
 * Una navigazione IMPERATIVA innescata dal componente stesso (un <button>
 * che chiama `router.back()`, non un <a>) non viene intercettata da sola:
 * va fatta passare esplicitamente da `requestNavigation`.
 */
export function useUnsavedChangesGuard(
  dirty: boolean,
  onSave: () => Promise<boolean>
): UnsavedChangesGuard {
  const router = useRouter();
  const dirtyRef = useRef(dirty);
  useEffect(() => {
    dirtyRef.current = dirty;
  }, [dirty]);

  const [proceedFn, setProceedFn] = useState<(() => void) | null>(null);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const requestNavigation = useCallback((proceed: () => void) => {
    if (!dirtyRef.current) {
      proceed();
      return;
    }
    setSaveError(null);
    setProceedFn(() => proceed);
  }, []);

  useEffect(() => {
    const initialUrl = window.location.href;

    // 1. Chiusura o ricarica della scheda — vedi nota sopra: nessun modal possibile qui.
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };

    // 2. Click su un link interno.
    const handleClick = (e: MouseEvent) => {
      if (!dirtyRef.current) return;
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return; // nuova scheda, ecc.

      const anchor = (e.target as HTMLElement | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      if (anchor.target && anchor.target !== "_self") return;
      if (anchor.hasAttribute("download")) return;

      let url: URL;
      try {
        url = new URL(anchor.href, window.location.href);
      } catch {
        return;
      }
      if (url.origin !== window.location.origin) return; // link esterno: non ci riguarda

      e.preventDefault();
      e.stopImmediatePropagation();
      requestNavigation(() => router.push(url.pathname + url.search + url.hash));
    };

    // 3. Indietro/avanti del browser: il browser ha già cambiato URL quando
    // l'evento arriva. Si annulla visivamente (si torna all'URL di partenza),
    // e se l'utente sceglie di procedere si va con una navigazione piena
    // all'URL di destinazione — più robusta di un secondo tentativo di
    // history.back(), il cui esito dipende dallo stato interno del router.
    const handlePopState = () => {
      if (!dirtyRef.current) return;
      const targetUrl = window.location.href;
      history.pushState(null, "", initialUrl);
      requestNavigation(() => {
        window.location.href = targetUrl;
      });
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("click", handleClick, true); // cattura: prima del router
    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("click", handleClick, true);
      window.removeEventListener("popstate", handlePopState);
    };
  }, [requestNavigation, router]);

  const saveAndLeave = useCallback(async () => {
    if (!proceedFn) return;
    setSaving(true);
    setSaveError(null);
    try {
      const ok = await onSave();
      if (ok) {
        dirtyRef.current = false;
        const proceed = proceedFn;
        setProceedFn(null);
        proceed();
      } else {
        setSaveError("Non siamo riusciti a salvare. Riprova.");
      }
    } catch {
      setSaveError("Non siamo riusciti a salvare. Riprova.");
    } finally {
      setSaving(false);
    }
  }, [proceedFn, onSave]);

  const discardAndLeave = useCallback(() => {
    if (!proceedFn) return;
    dirtyRef.current = false;
    const proceed = proceedFn;
    setProceedFn(null);
    proceed();
  }, [proceedFn]);

  const cancel = useCallback(() => {
    setProceedFn(null);
    setSaveError(null);
  }, []);

  return {
    pending: proceedFn !== null,
    saving,
    saveError,
    saveAndLeave,
    discardAndLeave,
    cancel,
    requestNavigation,
  };
}
