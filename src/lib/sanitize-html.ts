import DOMPurify from "isomorphic-dompurify";

/**
 * Tag ammessi: tutto ciò che Tiptap produce con le extension installate
 * (StarterKit, Table, Underline, Placeholder) + heading completi + link.
 */
const ALLOWED_TAGS = [
  // Heading
  "h1", "h2", "h3", "h4", "h5", "h6",
  // Block
  "p", "br", "hr", "blockquote", "pre", "div",
  // Inline
  "strong", "em", "u", "s", "code", "span", "sub", "sup", "mark",
  // List
  "ul", "ol", "li",
  // Link
  "a",
  // Table
  "table", "thead", "tbody", "tfoot", "tr", "th", "td", "colgroup", "col",
  // Media (immagini inline se usate nell'editor)
  "img",
];

/**
 * Attributi ammessi: quelli che Tiptap produce e che servono per
 * preservare formattazione e struttura. Blocchiamo event handler
 * (onerror, onclick, ecc.) esplicitamente via FORBID_ATTR.
 */
const ALLOWED_ATTR = [
  // Link
  "href", "target", "rel",
  // Tabella
  "colspan", "rowspan",
  // Immagine
  "src", "alt", "width", "height",
  // Tiptap data attributes (task list, placeholder, ecc.)
  "data-type", "data-checked", "data-placeholder",
  // Stile inline (alignment, background da tabella LQA import, ecc.)
  "style",
  // Classe (Tiptap usa classi per alignment, is-editor-empty, ecc.)
  "class",
];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR,
    // Blocca esplicitamente i tag pericolosi anche se qualcuno li iniettasse
    FORBID_TAGS: ["script", "style", "iframe", "object", "embed", "form", "input", "button", "textarea", "select"],
    // Blocca event handler inline — il vettore XSS principale su attributi
    FORBID_ATTR: ["onerror", "onload", "onclick", "onmouseover", "onmouseout", "onfocus", "onblur", "onsubmit", "onchange"],
  });
}
