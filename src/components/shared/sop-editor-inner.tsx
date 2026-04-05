"use client";

import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableHeader } from "@tiptap/extension-table-header";
import { TableCell } from "@tiptap/extension-table-cell";
import { useEffect, useRef } from "react";
import { sanitizeHtml } from "@/lib/sanitize-html";

interface SopEditorInnerProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  minHeight?: string;
}

export function SopEditorInner({
  content,
  onChange,
  placeholder = "Scrivi il contenuto della procedura...",
  editable = true,
  minHeight = "300px",
}: SopEditorInnerProps) {
  const isExternalUpdate = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
      }),
      Underline,
      Placeholder.configure({ placeholder }),
      Table.configure({ resizable: false }),
      TableRow,
      TableHeader,
      TableCell,
    ],
    content,
    editable,
    onUpdate: ({ editor: e }) => {
      if (isExternalUpdate.current) return;
      const html = sanitizeHtml(e.getHTML());
      onChange(html);
    },
  });

  // Sync external content changes
  useEffect(() => {
    if (!editor) return;
    const currentHtml = editor.getHTML();
    if (content !== currentHtml) {
      isExternalUpdate.current = true;
      editor.commands.setContent(content, { emitUpdate: false });
      isExternalUpdate.current = false;
    }
  }, [content, editor]);

  // Sync editable
  useEffect(() => {
    if (editor) editor.setEditable(editable);
  }, [editable, editor]);

  if (!editor) return null;

  return (
    <div className={`border border-ivory-dark sop-editor-wrapper ${editor.isFocused ? "border-terracotta" : ""}`}>
      {editable && <Toolbar editor={editor} />}
      <EditorContent
        editor={editor}
        className="sop-editor-content"
        style={{ minHeight }}
      />
      <style jsx global>{`
        .sop-editor-content .tiptap {
          padding: 0.75rem 1rem;
          font-family: var(--font-body, "Cardo", Georgia, serif);
          color: #333;
          line-height: 1.75;
          outline: none;
          min-height: ${minHeight};
        }
        .sop-editor-content .tiptap p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          float: left;
          color: rgba(51, 51, 51, 0.3);
          pointer-events: none;
          height: 0;
        }
        .sop-editor-content .tiptap h2 {
          font-size: 1.125rem;
          font-weight: 600;
          margin-top: 1.5rem;
          margin-bottom: 0.5rem;
          line-height: 1.4;
        }
        .sop-editor-content .tiptap h3 {
          font-size: 1rem;
          font-weight: 600;
          margin-top: 1rem;
          margin-bottom: 0.25rem;
          line-height: 1.4;
        }
        .sop-editor-content .tiptap p {
          margin-top: 0.5rem;
          margin-bottom: 0.5rem;
        }
        .sop-editor-content .tiptap ul {
          list-style: disc;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .sop-editor-content .tiptap ol {
          list-style: decimal;
          padding-left: 1.5rem;
          margin: 0.5rem 0;
        }
        .sop-editor-content .tiptap li {
          margin: 0.25rem 0;
        }
        .sop-editor-content .tiptap blockquote {
          border-left: 4px solid #964733;
          padding-left: 1rem;
          font-style: italic;
          color: rgba(51, 51, 51, 0.75);
          margin: 0.75rem 0;
        }
        .sop-editor-content .tiptap hr {
          border: none;
          border-top: 1px solid #E8E5DC;
          margin: 1.5rem 0;
        }
        .sop-editor-content .tiptap u {
          text-decoration: underline;
        }
        .sop-editor-content .tiptap s {
          text-decoration: line-through;
        }
      `}</style>
    </div>
  );
}

// ─── Toolbar ────────────────────────────────────────────────────────

function Toolbar({ editor }: { editor: ReturnType<typeof useEditor> }) {
  if (!editor) return null;

  const btn = (active: boolean) =>
    `p-1.5 transition-colors ${active ? "bg-ivory-dark text-charcoal-dark" : "text-charcoal/60 hover:bg-ivory-dark hover:text-charcoal-dark"}`;

  return (
    <div className="flex items-center gap-0.5 flex-wrap px-2 py-1.5 bg-ivory border-b border-ivory-dark">
      {/* Testo */}
      <button type="button" onClick={() => editor.chain().focus().toggleBold().run()}
        className={btn(editor.isActive("bold"))} title="Grassetto (Cmd+B)">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 4h8a4 4 0 014 4 4 4 0 01-4 4H6z" /><path d="M6 12h9a4 4 0 014 4 4 4 0 01-4 4H6z" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()}
        className={btn(editor.isActive("italic"))} title="Corsivo (Cmd+I)">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="19" y1="4" x2="10" y2="4" /><line x1="14" y1="20" x2="5" y2="20" /><line x1="15" y1="4" x2="9" y2="20" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleUnderline().run()}
        className={btn(editor.isActive("underline"))} title="Sottolineato (Cmd+U)">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <path d="M6 3v7a6 6 0 0012 0V3" /><line x1="4" y1="21" x2="20" y2="21" />
        </svg>
      </button>

      <span className="w-px h-5 bg-ivory-dark mx-1" />

      {/* Titoli */}
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        className={btn(editor.isActive("heading", { level: 2 }))} title="Titolo H2">
        <span className="text-xs font-ui font-bold w-4 h-4 flex items-center justify-center">H2</span>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        className={btn(editor.isActive("heading", { level: 3 }))} title="Titolo H3">
        <span className="text-xs font-ui font-bold w-4 h-4 flex items-center justify-center">H3</span>
      </button>

      <span className="w-px h-5 bg-ivory-dark mx-1" />

      {/* Liste */}
      <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()}
        className={btn(editor.isActive("bulletList"))} title="Elenco puntato">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="9" y1="6" x2="20" y2="6" /><line x1="9" y1="12" x2="20" y2="12" /><line x1="9" y1="18" x2="20" y2="18" />
          <circle cx="5" cy="6" r="1" fill="currentColor" /><circle cx="5" cy="12" r="1" fill="currentColor" /><circle cx="5" cy="18" r="1" fill="currentColor" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()}
        className={btn(editor.isActive("orderedList"))} title="Elenco numerato">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <line x1="10" y1="6" x2="20" y2="6" /><line x1="10" y1="12" x2="20" y2="12" /><line x1="10" y1="18" x2="20" y2="18" />
          <text x="3" y="8" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
          <text x="3" y="14" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
          <text x="3" y="20" fontSize="7" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
        </svg>
      </button>

      <span className="w-px h-5 bg-ivory-dark mx-1" />

      {/* Blocchi */}
      <button type="button" onClick={() => editor.chain().focus().toggleBlockquote().run()}
        className={btn(editor.isActive("blockquote"))} title="Citazione">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor">
          <path d="M4.583 17.321C3.553 16.227 3 15 3 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C9.591 11.69 11 13.166 11 15c0 1.933-1.567 3.5-3.5 3.5-1.182 0-2.283-.568-2.917-1.179zM14.583 17.321C13.553 16.227 13 15 13 13.011c0-3.5 2.457-6.637 6.03-8.188l.893 1.378c-3.335 1.804-3.987 4.145-4.247 5.621.537-.278 1.24-.375 1.929-.311C19.591 11.69 21 13.166 21 15c0 1.933-1.567 3.5-3.5 3.5-1.182 0-2.283-.568-2.917-1.179z" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().setHorizontalRule().run()}
        className={btn(false)} title="Linea orizzontale">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round">
          <line x1="3" y1="12" x2="21" y2="12" />
        </svg>
      </button>

      <span className="w-px h-5 bg-ivory-dark mx-1" />

      {/* Storico */}
      <button type="button" onClick={() => editor.chain().focus().undo().run()}
        disabled={!editor.can().undo()} className={`${btn(false)} disabled:opacity-30`} title="Annulla (Cmd+Z)">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 105.64-11.36L1 10" />
        </svg>
      </button>
      <button type="button" onClick={() => editor.chain().focus().redo().run()}
        disabled={!editor.can().redo()} className={`${btn(false)} disabled:opacity-30`} title="Ripeti (Cmd+Shift+Z)">
        <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
          <polyline points="23 4 23 10 17 10" /><path d="M20.49 15a9 9 0 11-5.64-11.36L23 10" />
        </svg>
      </button>
    </div>
  );
}
