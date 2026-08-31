/**
 * Ponte al database per la ricerca utente al login. La regola sta in
 * login-lookup.ts; qui c'è solo la query.
 *
 * Confronto case-insensitive sull'email: `mode: "insensitive"` non richiede
 * che le righe in tabella siano già in minuscolo, quindi copre anche gli
 * account storici salvati con maiuscole senza bisogno di correggerli.
 * `findUnique` non supporta `mode: "insensitive"` — serve `findMany` (o
 * `findFirst`, ma qui serve l'elenco completo per poter distinguere "trovato"
 * da "ambiguo", non solo il primo risultato).
 */

import { prisma } from "./prisma";
import { classifyLoginMatches, type LoginLookupResult } from "./login-lookup";
import type { User } from "@prisma/client";

/** `normalizedEmail` va già passata attraverso normalizeEmail() dal chiamante. */
export async function findUserForLogin(normalizedEmail: string): Promise<LoginLookupResult<User>> {
  const matches = await prisma.user.findMany({
    where: { email: { equals: normalizedEmail, mode: "insensitive" } },
  });
  return classifyLoginMatches(matches);
}
