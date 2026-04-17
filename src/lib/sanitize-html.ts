/**
 * Sanitizza HTML prodotto dall'editor TipTap per prevenire XSS.
 *
 * - Client-side: usa DOMPurify (DOM nativo del browser)
 * - Server-side: ritorna il contenuto così com'è (viene dal DB,
 *   inserito da utenti autenticati via TipTap editor)
 */

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "h5", "h6",
  "p", "br", "hr", "blockquote", "pre", "div",
  "strong", "em", "u", "s", "code", "span", "sub", "sup", "mark",
  "ul", "ol", "li",
  "a",
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
  "img",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "colspan", "rowspan",
  "src", "alt", "width", "height",
  "data-type", "data-checked", "data-placeholder",
  "style", "class",
];

export function sanitizeHtml(dirty: string): string {
  if (typeof window === "undefined") {
    return dirty;
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const DOMPurify = require("dompurify") as typeof import("dompurify").default;
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur", "onsubmit", "onchange"],
  });
}
