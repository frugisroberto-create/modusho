import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h1", "h2", "h3", "h4", "p", "br", "hr",
  "strong", "em", "u", "s",
  "ul", "ol", "li",
  "blockquote",
  "a",
  "table", "thead", "tbody", "tr", "th", "td",
  "code", "pre",
  "span",
];

const ALLOWED_ATTR = [
  "href", "target", "rel",
  "colspan", "rowspan",
];

/**
 * Sanitizza HTML utente prima della persistenza. DEVE essere chiamata
 * server-side in ogni POST/PUT che scrive rich text sul DB — la sanitizzazione
 * lato client (editor Tiptap) è solo UX, NON sicurezza.
 */
export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Blocca esplicitamente schemi pericolosi su href
    ALLOWED_URI_REGEXP: /^(?:(?:https?|mailto|tel):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i,
    // Forza link esterni sicuri
    ADD_ATTR: ["target", "rel"],
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "style"],
  });
}
