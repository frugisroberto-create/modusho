"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { PasswordFields } from "@/components/auth/password-fields";
import { HelpTip } from "@/components/auth/help-tip";
import { checkPasswordForm } from "@/lib/password-policy";

/**
 * Form di attivazione: imposta la password e fa entrare l'utente.
 * Il login è automatico — l'utente non deve ridigitare nulla.
 */
export function ActivationForm({ token, email }: { token: string; email: string }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checks = checkPasswordForm(password, confirm);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!checks.allValid) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/auth/activate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.error ?? "Non siamo riusciti ad attivare l'accesso. Riprova.");
        setLoading(false);
        return;
      }

      // Login automatico con le credenziali appena impostate.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // Password impostata ma sessione non creata: si entra dal login.
        window.location.href = "/login";
        return;
      }

      window.location.href = "/benvenuto";
    } catch {
      setError("Qualcosa non ha funzionato. Riprova fra poco.");
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        <PasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          disabled={loading}
        />

        {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

        <button type="submit" disabled={!checks.allValid || loading} className="btn-primary w-full">
          {loading ? "Attivazione in corso..." : "Attiva e entra"}
        </button>
      </form>

      <HelpTip
        question="Chi può vedere la mia password?"
        answer="Nessuno. La password la scegli tu e resta solo tua: non è visibile né al tuo responsabile né a chi gestisce ModusHO. Se la dimentichi non te la possiamo dire, ma puoi sempre crearne una nuova dalla pagina di accesso."
      />
    </>
  );
}
