"use client";

import dynamic from "next/dynamic";

interface SopEditorProps {
  content: string;
  onChange: (html: string) => void;
  placeholder?: string;
  editable?: boolean;
  minHeight?: string;
}

const SopEditorInner = dynamic(() => import("./sop-editor-inner").then((m) => m.SopEditorInner), {
  ssr: false,
  loading: () => <div className="border border-ivory-dark bg-white p-4 text-sm text-charcoal/30 font-ui">Caricamento editor...</div>,
});

export function SopEditor(props: SopEditorProps) {
  return <SopEditorInner {...props} />;
}
