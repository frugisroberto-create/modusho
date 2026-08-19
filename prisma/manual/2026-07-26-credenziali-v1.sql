-- Allineamento database per feat/credenziali-v1 — SOLO ADDITIVO.
--
-- Perché a mano e non con `prisma db push`:
-- il diff generato da Prisma contiene anche DROP TABLE sulle tabelle
-- Onboarding*, che esistono nel database (lavoro del branch feat/onboarding,
-- non ancora unito) e contengono dati. Un push le cancellerebbe.
--
-- Questo script aggiunge soltanto ciò che manca al codice di questo branch:
--   - enum AuthTokenType, UserAuditAction
--   - colonne User: activatedAt, passwordChangedAt, mustChangePassword,
--     canCreateUsers, createdById
--   - tabelle AuthToken, UserAuditEvent con indici e foreign key
--
-- Cosa NON fa di proposito:
--   - non rimuove il valore 'ONBOARDING_ASSIGNED' da NotificationType
--     (Prisma non lo conosce su questo branch, ma un valore in più non dà
--     fastidio finché nessuna riga letta da qui lo usa)
--   - non tocca le tabelle Onboarding*
--
-- Idempotente: si può rilanciare senza effetti collaterali.

BEGIN;

-- ─── Enum ────────────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'AuthTokenType') THEN
    CREATE TYPE "AuthTokenType" AS ENUM ('ACTIVATION', 'RESET');
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'UserAuditAction') THEN
    CREATE TYPE "UserAuditAction" AS ENUM (
      'CREATED', 'ROLE_CHANGED', 'FLAG_CHANGED', 'EMAIL_CHANGED',
      'DEACTIVATED', 'REACTIVATED', 'INVITE_SENT', 'RESET_SENT'
    );
  END IF;
END $$;

-- ─── Colonne su User ─────────────────────────────────────────────────
ALTER TABLE "User"
  ADD COLUMN IF NOT EXISTS "activatedAt"        TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "passwordChangedAt"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "mustChangePassword" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "canCreateUsers"     BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "createdById"        TEXT;

-- Gli account già esistenti hanno una password funzionante: sono di fatto
-- attivati. Senza questo, `activatedAt` resta null e le viste di gestione
-- utenti li mostrerebbero come "invito mai completato".
UPDATE "User"
SET "activatedAt" = "createdAt"
WHERE "activatedAt" IS NULL
  AND "passwordHash" ~ '^\$2[aby]\$';

-- ─── Tabella AuthToken ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "AuthToken" (
  "id"          TEXT NOT NULL,
  "userId"      TEXT NOT NULL,
  "type"        "AuthTokenType" NOT NULL,
  "tokenHash"   TEXT NOT NULL,
  "expiresAt"   TIMESTAMP(3) NOT NULL,
  "usedAt"      TIMESTAMP(3),
  "createdById" TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AuthToken_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "AuthToken_tokenHash_key" ON "AuthToken"("tokenHash");
CREATE INDEX IF NOT EXISTS "AuthToken_userId_type_idx" ON "AuthToken"("userId", "type");

-- ─── Tabella UserAuditEvent ──────────────────────────────────────────
CREATE TABLE IF NOT EXISTS "UserAuditEvent" (
  "id"        TEXT NOT NULL,
  "userId"    TEXT NOT NULL,
  "actorId"   TEXT,
  "action"    "UserAuditAction" NOT NULL,
  "note"      TEXT,
  "meta"      JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UserAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "UserAuditEvent_userId_idx"  ON "UserAuditEvent"("userId");
CREATE INDEX IF NOT EXISTS "UserAuditEvent_actorId_idx" ON "UserAuditEvent"("actorId");

-- ─── Foreign key ─────────────────────────────────────────────────────
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'User_createdById_fkey') THEN
    ALTER TABLE "User" ADD CONSTRAINT "User_createdById_fkey"
      FOREIGN KEY ("createdById") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'AuthToken_userId_fkey') THEN
    ALTER TABLE "AuthToken" ADD CONSTRAINT "AuthToken_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAuditEvent_userId_fkey') THEN
    ALTER TABLE "UserAuditEvent" ADD CONSTRAINT "UserAuditEvent_userId_fkey"
      FOREIGN KEY ("userId") REFERENCES "User"("id")
      ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'UserAuditEvent_actorId_fkey') THEN
    ALTER TABLE "UserAuditEvent" ADD CONSTRAINT "UserAuditEvent_actorId_fkey"
      FOREIGN KEY ("actorId") REFERENCES "User"("id")
      ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

COMMIT;
