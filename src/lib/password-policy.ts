/**
 * Regole della password — UNICA fonte di verità per client e server.
 *
 * Regola (ratificata): almeno 8 caratteri, almeno una lettera, almeno un numero.
 *
 * Le pagine di attivazione/reset/cambio password usano `checkPasswordForm` per
 * le spunte vive; le API usano `passwordSchema` (Zod) o `getPasswordError`.
 * Non duplicare la regola altrove: si cambia qui e vale ovunque.
 */

import { z } from "zod/v4";

export const PASSWORD_MIN_LENGTH = 8;

export interface PasswordChecks {
  /** Almeno 8 caratteri */
  minLength: boolean;
  /** Contiene almeno una lettera */
  hasLetter: boolean;
  /** Contiene almeno un numero */
  hasNumber: boolean;
}

export interface PasswordFormChecks extends PasswordChecks {
  /** Lettera E numero: è la spunta unica mostrata nella UI */
  hasLetterAndNumber: boolean;
  /** Le due password coincidono (e non sono vuote) */
  matches: boolean;
  /** Tutte le condizioni per abilitare il bottone */
  allValid: boolean;
}

/** Etichette delle spunte mostrate nelle pagine password (ordine vincolante). */
export const PASSWORD_RULE_LABELS = {
  minLength: "Almeno 8 caratteri",
  hasLetterAndNumber: "Almeno una lettera e un numero",
  matches: "Le due password coincidono",
} as const;

/** Verifica le singole condizioni su una password. */
export function checkPassword(password: string): PasswordChecks {
  const value = password ?? "";
  return {
    minLength: value.length >= PASSWORD_MIN_LENGTH,
    hasLetter: /\p{L}/u.test(value),
    hasNumber: /\d/.test(value),
  };
}

/** True se la password rispetta la policy. */
export function isPasswordValid(password: string): boolean {
  const c = checkPassword(password);
  return c.minLength && c.hasLetter && c.hasNumber;
}

/**
 * Messaggio d'errore in italiano semplice, o null se la password va bene.
 * Un solo messaggio per volta: si segnala il primo problema, non un elenco.
 */
export function getPasswordError(password: string): string | null {
  const c = checkPassword(password);
  if (!c.minLength) return "La password deve avere almeno 8 caratteri.";
  if (!c.hasLetter) return "La password deve contenere almeno una lettera.";
  if (!c.hasNumber) return "La password deve contenere almeno un numero.";
  return null;
}

/**
 * Stato completo per i form a due campi (nuova password + conferma).
 * Alimenta le 3 spunte vive e l'abilitazione del bottone.
 */
export function checkPasswordForm(password: string, confirm: string): PasswordFormChecks {
  const c = checkPassword(password);
  const hasLetterAndNumber = c.hasLetter && c.hasNumber;
  const matches = (password ?? "").length > 0 && password === confirm;
  return {
    ...c,
    hasLetterAndNumber,
    matches,
    allValid: c.minLength && hasLetterAndNumber && matches,
  };
}

/** Schema Zod riutilizzabile lato server: stessa regola, stessi messaggi. */
export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, "La password deve avere almeno 8 caratteri.")
  .refine((v) => /\p{L}/u.test(v), "La password deve contenere almeno una lettera.")
  .refine((v) => /\d/.test(v), "La password deve contenere almeno un numero.");
