/**
 * Classificazione dei risultati di una ricerca utente per il login.
 *
 * La ricerca è case-insensitive (vedi login-lookup-db.ts): "Mario@x.it" e
 * "mario@x.it" devono trovare la stessa persona, comprese le righe storiche
 * salvate prima della normalizzazione in scrittura. Ma il vincolo di unicità
 * sulla colonna `email` nel database è case-sensitive: due righe che
 * differiscono solo per maiuscole/minuscole POSSONO coesistere (è già
 * successo — vedi il rapporto della PR). Se la ricerca insensibile trova più
 * di una riga, questo modulo non sceglie: dichiara l'ambiguità. Meglio un
 * accesso negato e tracciato che un accesso all'account sbagliato.
 *
 * Funzione pura: nessun Prisma, nessun I/O. Il ponte al database è in
 * login-lookup-db.ts, sullo stesso schema di user-scope / user-scope-db.
 */

export type LoginLookupResult<T> =
  | { kind: "not_found" }
  | { kind: "ambiguous"; count: number }
  | { kind: "found"; user: T };

export function classifyLoginMatches<T>(matches: T[]): LoginLookupResult<T> {
  if (matches.length === 0) return { kind: "not_found" };
  if (matches.length > 1) return { kind: "ambiguous", count: matches.length };
  return { kind: "found", user: matches[0]! };
}
