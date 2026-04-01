"use client";

import { useEffect } from "react";

interface Props {
  contentId: string;
}

/**
 * Fire-and-forget: registra la visualizzazione SOP appena la pagina si monta.
 * Non blocca il rendering e non mostra nulla.
 */
export function SopViewTracker({ contentId }: Props) {
  useEffect(() => {
    fetch(`/api/sop/${contentId}/view`, { method: "POST" }).catch(() => {});
  }, [contentId]);

  return null;
}
