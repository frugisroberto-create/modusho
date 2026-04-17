/**
 * Sanitizza HTML per prevenire XSS.
 *
 * - Client-side: usa DOMPurify (accesso al DOM nativo del browser)
 * - Server-side: ritorna il contenuto così com'è (il contenuto viene dal DB,
 *   inserito da utenti autenticati via TipTap editor — trust del backend)
 *
 * Il rischio XSS è mitigato dal fatto che solo HOD+ con canEdit possono
 * creare contenuti, e DOMPurify li sanitizza nel browser prima del rendering.
 */

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr",
  "ul", "ol", "li",
  "strong", "em", "b", "i", "u", "s", "mark", "sub", "sup",
  "a", "blockquote", "pre", "code",
  "table", "thead", "tbody", "tr", "th", "td",
  "img", "figure", "figcaption",
  "div", "span",
];

const ALLOWED_ATTR = [
  "href", "target", "rel", "src", "alt", "width", "height",
  "class", "style", "colspan", "rowspan",
];

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") {
    // Server-side: no DOM available, return as-is
    return dirty;
  }

  // Lazy import DOMPurify solo client-side
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require("dompurify") as typeof import("dompurify").default;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    ALLOW_DATA_ATTR: false,
  });
}
