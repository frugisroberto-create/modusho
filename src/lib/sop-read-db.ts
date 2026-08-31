/**
 * Ponte al database per la lettura di una SOP: lo scrittore unico.
 *
 * La forma delle due scritture sta in sop-read.ts e non si ripete qui. Chi
 * deve registrare una lettura — la rotta /api/sop/[id]/acknowledge chiamata
 * dal pulsante, e la registrazione automatica di HM/ADMIN/SUPER_ADMIN
 * all'apertura — chiama questa funzione e nient'altro.
 */

import { prisma } from "./prisma";
import { buildSopReadWrites, type SopReadWriteArgs } from "./sop-read";

/**
 * Registra la lettura nei due registri e restituisce il SopViewRecord
 * risultante (è quello che porta la versione, quindi è quello che serve a chi
 * risponde al client).
 */
export async function recordSopRead(args: SopReadWriteArgs) {
  const writes = buildSopReadWrites(args);
  const [record] = await Promise.all([
    prisma.sopViewRecord.upsert(writes.viewRecord),
    prisma.contentAcknowledgment.upsert(writes.acknowledgment),
  ]);
  return record;
}
