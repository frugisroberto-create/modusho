/**
 * Ponte al database per la ricerca utente al login E alla password
 * dimenticata (/api/auth/forgot) — una fonte sola, non due implementazioni
 * parallele. La regola di classificazione sta in login-lookup.ts; qui c'è la
 * query, più il filtro di idoneità che ciascuna azione applica SOPRA la
 * stessa ricerca di base.
 *
 * Confronto case-insensitive sull'email: `mode: "insensitive"` non richiede
 * che le righe in tabella siano già in minuscolo, quindi copre anche gli
 * account storici salvati con maiuscole senza bisogno di correggerli.
 * `findUnique` non supporta `mode: "insensitive"` — serve `findMany` (o
 * `findFirst`, ma qui serve l'elenco completo per poter distinguere "trovato"
 * da "ambiguo", non solo il primo risultato).
 *
 * L'ambiguità va calcolata SOLO su righe che l'azione considera valide: una
 * riga disattivata, o con l'invito non ancora completato, non è un secondo
 * candidato — è un guscio che non può mai autenticare né ricevere un reset.
 * Contarla come ambiguità bloccherebbe un account che invece funziona.
 */

import { prisma } from "./prisma";
import { classifyLoginMatches, type LoginLookupResult } from "./login-lookup";
import { hasUsablePassword } from "./login-guard";
import type { Prisma, User } from "@prisma/client";

async function findMatchingUsers(
  normalizedEmail: string,
  extraWhere: Prisma.UserWhereInput
): Promise<User[]> {
  return prisma.user.findMany({
    where: {
      email: { equals: normalizedEmail, mode: "insensitive" },
      ...extraWhere,
    },
  });
}

/**
 * Cerca l'utente per il login, solo tra le righe che possono davvero
 * autenticare: attive e con una password già impostata. "Attiva" e "hash
 * presente" sono filtrati nella query; il prefisso bcrypt ($2a$/$2b$/$2y$)
 * non si esprime in SQL — resta in memoria, con hasUsablePassword() come
 * unica fonte. Il filtro in memoria ripete anche isActive, non solo il
 * prefisso: è la stessa idoneità applicata due volte (query + memoria) per
 * lo stesso motivo per cui hasUsablePassword controlla di nuovo l'hash
 * vuoto — un secondo livello, non un'alternativa al primo.
 *
 * `normalizedEmail` va già passata attraverso normalizeEmail() dal chiamante.
 */
export async function findUserForLogin(normalizedEmail: string): Promise<LoginLookupResult<User>> {
  const rows = await findMatchingUsers(normalizedEmail, {
    isActive: true,
    passwordHash: { not: "" },
  });
  const authenticable = rows.filter((u) => u.isActive && hasUsablePassword(u.passwordHash));
  return classifyLoginMatches(authenticable);
}

/**
 * Cerca l'utente per la password dimenticata, solo tra le righe idonee a
 * ricevere un reset: attive e che hanno già completato almeno un'attivazione
 * in passato — chi non l'ha mai completata ha bisogno di un nuovo invito, non
 * di un reset. Stessa regola preesistente in /api/auth/forgot, solo spostata
 * qui perché l'ambiguità si calcoli sullo stesso criterio di idoneità.
 * Idoneità ripetuta in memoria per lo stesso motivo di findUserForLogin.
 *
 * `normalizedEmail` va già passata attraverso normalizeEmail() dal chiamante.
 */
export async function findUserForReset(normalizedEmail: string): Promise<LoginLookupResult<User>> {
  const rows = await findMatchingUsers(normalizedEmail, {
    isActive: true,
    activatedAt: { not: null },
  });
  const eligible = rows.filter((u) => u.isActive && u.activatedAt !== null);
  return classifyLoginMatches(eligible);
}
