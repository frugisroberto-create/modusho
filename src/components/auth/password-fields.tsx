"use client";

import { useState } from "react";
import { checkPasswordForm, PASSWORD_RULE_LABELS } from "@/lib/password-policy";

interface PasswordFieldsProps {
  password: string;
  confirm: string;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  /** Etichetta del primo campo (cambia fra attivazione e reimpostazione) */
  label?: string;
  disabled?: boolean;
}

/**
 * I due campi password con MOSTRA/NASCONDI e le tre spunte vive.
 * Usato da tutte le schermate credenziali: la regola sta in password-policy.ts,
 * qui c'è solo la resa a schermo.
 */
export function PasswordFields({
  password,
  confirm,
  onPasswordChange,
  onConfirmChange,
  label = "Scegli la tua password",
  disabled = false,
}: PasswordFieldsProps) {
  const [show, setShow] = useState(false);
  const checks = checkPasswordForm(password, confirm);

  return (
    <div className="space-y-4">
      <div>
        <div className="flex items-baseline justify-between mb-1.5">
          <label htmlFor="password" className="block text-sm font-ui font-medium text-charcoal">
            {label}
          </label>
          <button
            type="button"
            onClick={() => setShow(!show)}
            className="text-[11px] font-ui uppercase tracking-wider text-terracotta hover:text-terracotta-light transition-colors"
          >
            {show ? "Nascondi" : "Mostra"}
          </button>
        </div>
        <input
          id="password"
          type={show ? "text" : "password"}
          value={password}
          onChange={(e) => onPasswordChange(e.target.value)}
          disabled={disabled}
          required
          autoComplete="new-password"
          className="w-full"
        />
      </div>

      <div>
        <label htmlFor="confirm" className="block text-sm font-ui font-medium text-charcoal mb-1.5">
          Scrivila di nuovo
        </label>
        <input
          id="confirm"
          type={show ? "text" : "password"}
          value={confirm}
          onChange={(e) => onConfirmChange(e.target.value)}
          disabled={disabled}
          required
          autoComplete="new-password"
          className="w-full"
        />
      </div>

      {/* Spunte vive: diventano verdi man mano che la password va bene */}
      <ul className="space-y-1.5 pt-1">
        <RuleRow ok={checks.minLength} label={PASSWORD_RULE_LABELS.minLength} />
        <RuleRow ok={checks.hasLetterAndNumber} label={PASSWORD_RULE_LABELS.hasLetterAndNumber} />
        <RuleRow ok={checks.matches} label={PASSWORD_RULE_LABELS.matches} />
      </ul>
    </div>
  );
}

function RuleRow({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2 text-[12px] font-ui">
      <span
        aria-hidden
        className={`w-4 h-4 shrink-0 flex items-center justify-center border transition-colors ${
          ok ? "bg-sage border-sage text-white" : "border-ivory-dark text-transparent"
        }`}
      >
        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
        </svg>
      </span>
      <span className={ok ? "text-charcoal" : "text-charcoal/50"}>{label}</span>
    </li>
  );
}
