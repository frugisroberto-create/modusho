"use client";

import { useMemo } from "react";
import { sanitizeHtml } from "@/lib/sanitize";

interface SafeHtmlProps {
  html: string;
  className?: string;
}

/**
 * Renderizza HTML sanitizzato con DOMPurify.
 * Sostituisce dangerouslySetInnerHTML ovunque nel progetto.
 */
export function SafeHtml({ html, className }: SafeHtmlProps) {
  const clean = useMemo(() => sanitizeHtml(html), [html]);
  return <div className={className} dangerouslySetInnerHTML={{ __html: clean }} />;
}
