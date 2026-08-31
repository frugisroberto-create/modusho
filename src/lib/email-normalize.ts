/**
 * Normalizzazione dell'indirizzo email — un posto solo, chiamato da tutti i
 * punti che CERCANO o SALVANO un indirizzo: login, creazione utente,
 * modifica, password dimenticata, rate limiting, import.
 *
 * Senza trim + minuscolo, per il database "Mario@x.it" e "mario@x.it" sono
 * due identità diverse: è la causa del blocco dell'intero albergo la mattina
 * del 31 agosto 2026 (cinque persone che scrivono il proprio indirizzo con
 * l'iniziale maiuscola non trovano corrispondenza, i fallimenti vengono letti
 * come intrusione, l'IP viene bloccato).
 *
 * Funzione pura: nessun Prisma, nessun I/O. La ricerca dell'utente al login
 * resta comunque case-insensitive a livello di query (vedi login-lookup-db.ts):
 * questa funzione normalizza l'INPUT, non riscrive le righe storiche già
 * salvate con maiuscole.
 */
export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
