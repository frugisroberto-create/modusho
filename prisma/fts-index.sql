-- Indice GIN per full-text search su Content (title + body)
-- Eseguire manualmente dopo prisma db push
CREATE INDEX IF NOT EXISTS content_fts_idx
  ON "Content"
  USING GIN (to_tsvector('italian', title || ' ' || body));

-- Indice per velocizzare le query sulla dashboard (ContentStatusHistory)
CREATE INDEX IF NOT EXISTS csh_content_status_idx
  ON "ContentStatusHistory" ("contentId", "toStatus", "changedAt" DESC);

-- Indice per la ricerca memo (propertyId + expiresAt)
CREATE INDEX IF NOT EXISTS memo_property_expires_idx
  ON "Memo" ("propertyId", "expiresAt");
