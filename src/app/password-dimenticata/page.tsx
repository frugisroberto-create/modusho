"use client";

import { useState } from "react";
import Link from "next/link";
import { AuthShell } from "@/components/auth/auth-shell";
import { HelpTip } from "@/components/auth/help-tip";

export default function PasswordDimenticataPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);

    // La risposta è sempre la stessa: non c'è nulla da distinguere lato client.
    await fetch("/api/auth/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});

    setLoading(false);
    setSent(true);
  }

  if (sent) {
    return (
      <AuthShell title="Controlla la tua email">
        <p className="text-sm font-ui leading-relaxed text-charcoal">
          Se l&apos;indirizzo è registrato in ModusHO riceverai un&apos;email entro pochi minuti.
          Controlla anche la posta indesiderata.
        </p>

        <HelpTip
          question="Non ricevo nessuna email"
          answer="Aspetta qualche minuto e guarda nella posta indesiderata. Se non arriva nulla, l'indirizzo che hai scritto potrebbe non essere quello registrato in ModusHO: chiedi al tuo responsabile qual è il tuo nome utente."
        />

        <Link
          href="/login"
          className="mt-6 inline-block text-[12px] font-ui text-terracotta hover:text-terracotta-light transition-colors"
        >
          Torna alla pagina di accesso
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Hai dimenticato la password?"
      subtitle="Scrivi la tua email: ti mandiamo un link per crearne una nuova."
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-ui font-medium text-charcoal mb-1.5">
            La tua email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full"
          />
        </div>

        <button type="submit" disabled={loading || !email} className="btn-primary w-full">
          {loading ? "Invio in corso..." : "Inviami il link"}
        </button>
      </form>

      <HelpTip
        question="Non ricevo nessuna email"
        answer="Aspetta qualche minuto e guarda nella posta indesiderata. Se non arriva nulla, l'indirizzo che hai scritto potrebbe non essere quello registrato in ModusHO: chiedi al tuo responsabile qual è il tuo nome utente."
      />

      <Link
        href="/login"
        className="mt-4 inline-block text-[12px] font-ui text-terracotta hover:text-terracotta-light transition-colors"
      >
        Torna alla pagina di accesso
      </Link>
    </AuthShell>
  );
}
