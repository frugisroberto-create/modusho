# ModusHO — Stato reale del progetto

> Ultimo aggiornamento: 30 marzo 2026 (PROMPT-14)
> Verificato confrontando ogni prompt con il codice sorgente.

---

## Fonti di verità

| Documento | Ruolo |
|-----------|-------|
| `CLAUDE.md` | Architettura, regole stabili, modello dati |
| `docs/CURRENT_STATE.md` | Stato reale verificato del progetto (questo file) |
| `docs/roadmap.md` | Ordine dei prossimi lavori |
| `prompts/` | Cartella canonica con tutti i prompt operativi |

---

## Censimento prompt

Tutti i prompt risiedono in `DomusGO/prompts/`. Nessuna copia legacy fuori cartella.

| # | File | Stato |
|---|------|-------|
| 01 | `PROMPT-01-completamento-funzionale-home.md` | ✅ Eseguito |
| 02 | `PROMPT-02-restyling-grafico.md` | ✅ Eseguito |
| 03 | `PROMPT-03-flusso-creazione-per-ruolo.md` | ✅ Eseguito |
| 04 | `PROMPT-04-revisione-diretta-tracciata.md` | ✅ Eseguito |
| 05 | `PROMPT-05-riallineamento-home-alle-preview.md` | ✅ Eseguito |
| 05B | `PROMPT-05B-fix-rendering-e-layout-hoo.md` | ✅ Eseguito |
| 06 | `PROMPT-06-hard-test-funzionale.md` | ✅ Eseguito |
| 07 | `PROMPT-07-hardening-correttivo.md` | ✅ Eseguito |
| 08 | `PROMPT-08-content-notes-e-cronologia.md` | ✅ Eseguito |
| 09 | `PROMPT-09-targeting-multi-reparto.md` | ✅ Eseguito |
| 10 | `PROMPT-10-fix-residui-consolidati.md` | ✅ Eseguito |
| 11 | `PROMPT-11-the-vault-core.md` | ✅ Eseguito |
| 12 | `PROMPT-12-upload-engine.md` | ✅ Eseguito |
| 13 | `PROMPT-13-secure-delivery.md` | ✅ Eseguito |
| 14 | `PROMPT-14-modularization-document-governance.md` | ✅ Eseguito |

---

## Evidenze nel codice

| # | Evidenza |
|---|---------|
| 01 | isFeatured/featuredAt su Content, FeaturedSection, QuickStats, LatestByType |
| 02 | globals.css @layer base/components, border-radius:0, design system terracotta/sage/avorio |
| 03 | content-workflow.ts, getSubmitTargetStatus, API submit-actions |
| 04 | ContentRevision model, API revisions, text-diff.ts, revision-history.tsx |
| 05 | PropertyHero 50px, SearchBar con bottone, PendingReads lista verticale |
| 05B | HooHeader + HooSubNav, CSS @layer, dashboard hero |
| 07 | Status check per ruolo, middleware granulare, isDeleted sweep |
| 08 | ContentNote model, API notes/timeline, ContentTimeline component |
| 09 | DepartmentTargetSelector, ContentTarget multi-reparto, format-targets.ts |
| 10 | HooPropertyHero, HooSearchBar, SOP detail HOO, ack solo OPERATOR, rounded sweep |
| 11 | Attachment model, storage.ts/validation.ts, prepare/confirm upload API |
| 12 | AttachmentUploader component, integrazione SOP form + Memo edit |
| 13 | API /attachments/[id]/access, presigned GET 120s, inline vs attachment |

---

## Limiti residui aperti

| # | Limite | Impatto |
|---|--------|---------|
| L1 | Upload solo in edit mode (serve contentId) | Basso |
| L2 | No thumbnail pipeline (immagini full-size) | Medio |
| L3 | No retry automatico presigned URL scaduto | Basso |
| L4 | sortOrder allegati non riordinabile | Basso |
| L5 | hoo-sidebar.tsx è codice morto | Nessuno |

---

## Note tecniche

- Env vars S3 richieste per upload (S3_ENDPOINT, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY, S3_BUCKET)
- CORS R2 obbligatorio per upload client-side
- Seed via direct connection Neon (non pooler)
