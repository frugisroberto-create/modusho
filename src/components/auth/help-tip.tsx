"use client";

import { useState } from "react";

/**
 * Il "?" cliccabile presente in ogni schermata delle credenziali.
 * Apre una spiegazione breve, in italiano semplice, senza uscire dalla pagina.
 */
export function HelpTip({ question, answer }: { question: string; answer: string }) {
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-5">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-expanded={open}
        className="flex items-center gap-2 text-[12px] font-ui text-charcoal/55 hover:text-terracotta transition-colors"
      >
        <span className="w-4 h-4 shrink-0 rounded-full border border-current flex items-center justify-center text-[10px] font-semibold">
          ?
        </span>
        {question}
      </button>

      {open && (
        <p className="mt-2 text-[12px] font-ui leading-relaxed text-charcoal/70 bg-white border border-ivory-dark p-3">
          {answer}
        </p>
      )}
    </div>
  );
}
