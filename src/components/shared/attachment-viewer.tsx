"use client";

/**
 * Il riquadro che mostra un allegato DENTRO la pagina.
 *
 * Un documento su ModusHO è quasi sempre un file, e finché l'unico comando era
 * «Scarica» leggerlo voleva dire portarselo sul disco. Qui si legge dove si
 * legge una SOP: nella pagina.
 *
 * Due strade, decise dal tipo di file (`viewable.ts`):
 *  - PDF e immagini: il browser li mostra da sé, in un telaio che punta
 *    all'indirizzo firmato;
 *  - Word ed Excel: il server li converte in HTML e qui si mostra il testo.
 *    È una resa in sola lettura: impaginazione e formule non sopravvivono, e
 *    il file originale resta l'unica versione buona. La pagina lo dice.
 */

import { useCallback, useEffect, useState } from "react";
import { sanitizeHtml } from "@/lib/sanitize";
import { getViewMode } from "@/lib/attachments/viewable";

interface AttachmentViewerProps {
  attachmentId: string;
  fileName: string;
  mimeType: string;
}

type Loaded =
  | { kind: "file"; url: string }
  | { kind: "html"; html: string }
  | { kind: "notice"; notice: string };

export function AttachmentViewer({ attachmentId, fileName, mimeType }: AttachmentViewerProps) {
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [error, setError] = useState("");
  const mode = getViewMode(mimeType);

  const load = useCallback(async () => {
    setError("");
    setLoaded(null);
    try {
      if (mode === "file") {
        const res = await fetch(`/api/attachments/${attachmentId}/access`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) return setError(json.error ?? "File non disponibile");
        return setLoaded({ kind: "file", url: json.data.url });
      }

      const res = await fetch(`/api/attachments/${attachmentId}/view`);
      const json = await res.json().catch(() => ({}));
      if (!res.ok) return setError(json.error ?? "Non è stato possibile mostrare il file");
      if (json.data.html) return setLoaded({ kind: "html", html: json.data.html });
      return setLoaded({ kind: "notice", notice: json.data.notice ?? "Niente da mostrare" });
    } catch {
      setError("Non è stato possibile mostrare il file");
    }
  }, [attachmentId, mode]);

  useEffect(() => { load(); }, [load]);

  if (error) {
    return (
      <div className="px-4 py-6 bg-ivory border-t border-ivory-dark">
        <p className="text-sm font-ui text-alert-red">{error}</p>
        <button onClick={load} className="mt-2 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta">
          Riprova
        </button>
      </div>
    );
  }

  if (!loaded) {
    return (
      <div className="px-4 py-4 bg-ivory border-t border-ivory-dark">
        <div className="h-64 skeleton" />
      </div>
    );
  }

  if (loaded.kind === "notice") {
    return (
      <div className="px-4 py-6 bg-ivory border-t border-ivory-dark">
        <p className="text-sm font-ui text-charcoal/60">{loaded.notice}</p>
      </div>
    );
  }

  if (loaded.kind === "file") {
    if (mimeType.startsWith("image/")) {
      return (
        <div className="px-4 py-4 bg-ivory border-t border-ivory-dark">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={loaded.url} alt={fileName} className="max-w-full mx-auto" />
        </div>
      );
    }
    return (
      <div className="bg-ivory border-t border-ivory-dark">
        <iframe
          src={loaded.url}
          title={fileName}
          className="w-full h-[70vh] border-0 bg-white"
        />
      </div>
    );
  }

  return (
    <div className="px-4 py-5 bg-ivory border-t border-ivory-dark">
      <p className="text-[11px] font-ui text-charcoal/45 mb-3">
        Resa a schermo del file, in sola lettura. L&apos;impaginazione originale non è conservata:
        per la versione buona scarica il file.
      </p>
      <article
        className="prose prose-gray max-w-none font-body bg-white border border-ivory-dark p-4 sm:p-6 overflow-x-auto"
        dangerouslySetInnerHTML={{ __html: sanitizeHtml(loaded.html) }}
      />
    </div>
  );
}
