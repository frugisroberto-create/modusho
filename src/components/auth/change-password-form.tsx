"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { PasswordFields } from "@/components/auth/password-fields";
import { HelpTip } from "@/components/auth/help-tip";
import { checkPasswordForm } from "@/lib/password-policy";
import { displayAuthError } from "@/lib/auth-error-message";

interface ChangePasswordFormProps {
  /** Email dell'utente: serve a rinnovare la sessione dopo il cambio. */
  email: string;
  /** Etichetta del bottone di conferma. */
  submitLabel: string;
  /** Dove andare dopo il salvataggio. */
  redirectTo: string;
  /** Testo dell'aiuto contestuale. */
  help: { question: string; answer: string };
  /**
   * Se false, il campo "password attuale" non viene chiesto.
   * Vale solo per il primo cambio forzato: lì l'utente ha appena fatto login
   * e il server autorizza l'omissione in base al flag mustChangePassword.
   */
  requireCurrent?: boolean;
}

/**
 * Cambio password dell'utente autenticato.
 *
 * Dopo il salvataggio rinnova la sessione corrente con un signIn silenzioso:
 * il dispositivo da cui si è cambiata la password resta dentro, mentre le
 * sessioni aperte altrove decadono (passwordChangedAt).
 */
export function ChangePasswordForm({
  email,
  submitLabel,
  redirectTo,
  help,
  requireCurrent = true,
}: ChangePasswordFormProps) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [showCurrent, setShowCurrent] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const checks = checkPasswordForm(password, confirm);
  const canSubmit = checks.allValid && (!requireCurrent || currentPassword.length > 0) && !loading;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;

    setError("");
    setLoading(true);

    try {
      const response = await fetch("/api/me/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          requireCurrent ? { currentPassword, newPassword: password } : { newPassword: password }
        ),
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok) {
        setError(payload?.error ?? "Non siamo riusciti a salvare la password. Riprova.");
        setLoading(false);
        return;
      }

      // Rinnova la sessione di questo dispositivo con la password nuova.
      const result = await signIn("credentials", { email, password, redirect: false });
      if (result?.error) {
        // Password salvata ma sessione non rinnovata: il motivo va letto
        // qui, non scoperto dopo un redirect silenzioso a un login vuoto.
        setError(
          displayAuthError(
            result.error,
            "La password è stata salvata, ma non siamo riusciti a rinnovare la sessione. Riprova dalla pagina di accesso."
          )
        );
        setLoading(false);
        return;
      }

      window.location.href = redirectTo;
    } catch {
      setError("Qualcosa non ha funzionato. Riprova fra poco.");
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-5">
        {requireCurrent && (
          <div>
            <div className="flex items-baseline justify-between mb-1.5">
              <label htmlFor="currentPassword" className="block text-sm font-ui font-medium text-charcoal">
                La password che usi adesso
              </label>
              <button
                type="button"
                onClick={() => setShowCurrent(!showCurrent)}
                className="text-[11px] font-ui uppercase tracking-wider text-terracotta hover:text-terracotta-light transition-colors"
              >
                {showCurrent ? "Nascondi" : "Mostra"}
              </button>
            </div>
            <input
              id="currentPassword"
              type={showCurrent ? "text" : "password"}
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              disabled={loading}
              required
              autoComplete="current-password"
              className="w-full"
            />
          </div>
        )}

        <PasswordFields
          password={password}
          confirm={confirm}
          onPasswordChange={setPassword}
          onConfirmChange={setConfirm}
          label="La tua nuova password"
          disabled={loading}
        />

        {error && <p className="text-sm font-ui text-alert-red">{error}</p>}

        <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
          {loading ? "Salvataggio..." : submitLabel}
        </button>
      </form>

      <HelpTip question={help.question} answer={help.answer} />
    </>
  );
}
