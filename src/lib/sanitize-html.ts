import DOMPurify from "isomorphic-dompurify";

const ALLOWED_TAGS = [
  "h2", "h3", "p", "br", "hr",
  "strong", "em", "u", "s",
  "ul", "ol", "li",
  "blockquote",
];

export function sanitizeHtml(dirty: string): string {
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS,
    ALLOWED_ATTR: [],
  });
}
