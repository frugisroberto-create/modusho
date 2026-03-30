# ModusHO — Stato reale del progetto

> Ultimo aggiornamento: 30 marzo 2026
> Verificato confrontando ogni prompt con il codice sorgente.

---

## Fonti di verità

| Documento | Ruolo |
|-----------|-------|
| `CLAUDE.md` | Architettura, regole stabili, modello dati |
| `docs/CURRENT_STATE.md` | Stato reale verificato del progetto (questo file) |
| `docs/roadmap.md` | Ordine dei prossimi lavori |
| Cartella prompt (`*.md` nella root e in `DomusGO/`) | Istruzioni operative per Claude Code |

---

## Censimento prompt

### Posizione dei file

I prompt sono attualmente in due posizioni:
- **Root HOO APP**: PROMPT-01 → PROMPT-07, PROMPT-05B
- **DomusGO/**: PROMPT-08, PROMPT-09

### Incoerenze di naming e posizione

| Problema | Dettaglio |
|----------|-----------|
| Posizione mista | 8 prompt in root, 2 dentro DomusGO/ |
| PROMPT-05 vs PROMPT-05B | Due versioni dello stesso tema. 05 è stato eseguito, 05B è il successore con fix aggiuntivi |
| Nessuna cartella `/prompts` dedicata | I prompt convivono con file di progetto (preview HTML, sintesi, ecc.) |

**Nota**: i file NON vengono spostati né rinominati per non rompere riferimenti esistenti.

---

## Stato di esecuzione per prompt

### ✅ Eseguiti e verificati nel codice

| # | Prompt | Contenuto | Evidenza |
|---|--------|-----------|----------|
| 01 | Completamento funzionale home | isFeatured flag, API feature, FeaturedSection | Schema Prisma (isFeatured, featuredAt, featuredById), API `/content/[id]/feature`, componenti FeaturedSection e HooFeaturedSection |
| 02 | Restyling grafico | Border-radius 0, palette colori, tipografia | globals.css con btn-primary/btn-outline br:0, palette in tailwind.config — **parziale**: alcune pagine admin conservano `rounded-lg` (library, properties, deleted) |
| 03 | Flusso creazione per ruolo | Routing invio per ruolo, getSubmitTargetStatus | `content-workflow.ts` con routing HOD→HM, HM→ADMIN, ADMIN→HM+PUBLISH |
| 04 | Revisione diretta tracciata | ContentRevision, diff paragrafo | Schema ContentRevision, API `/content/[id]/revisions`, `text-diff.ts`, `revision-history.tsx` |
| 05 | Riallineamento home alle preview | Hero, stat box, featured section | `property-hero.tsx`, `quick-stats.tsx`, `featured-section.tsx` allineati alle preview |
| 06 | Hard test funzionale | Test manuale completo | Eseguito — i finding hanno generato PROMPT-07 |
| 07 | Hardening correttivo | Status-based visibility, RBAC rinforzato | GET `/api/content/[id]` blocca OPERATOR su non-PUBLISHED, HOD limitato ai propri. GET lista con filtro per ruolo |
| 08 | ContentNote + Cronologia | ContentNote model, API notes, timeline | Schema ContentNote, API `/content/[id]/notes`, API `/content/[id]/timeline`, `content-timeline.tsx` |
| 09 | Multi-department targeting | DepartmentTargetSelector, format-targets | `department-target-selector.tsx`, `format-targets.ts`, sop-form con targetDepartmentIds array |

### ⚠️ Parzialmente eseguito

| # | Prompt | Fix applicati | Fix mancanti |
|---|--------|---------------|--------------|
| 05B | Fix rendering + layout HOO | FIX 1 ✅ CSS @layer base | Vedi sezione "Fix residui" |
| | | FIX 2 ✅ Regole CSS in layer components | |
| | | FIX 3 ✅ Header + sub-nav (sidebar rimossa dal layout) | |
| | | FIX 6 ✅ HooFeaturedSection compliant | |
| | | FIX 8 ✅ Operator header mostra "MODUSHO" | |
| | | FIX 4 ⚠️ Dashboard hero mancante | |
| | | FIX 5 ⚠️ Stats — memo fetch con filtro status=PUBLISHED (possibile restrizione eccessiva) | |
| | | FIX 7 ⚠️ Link "Vedi tutti" Documenti punta a `/hoo-sop` anziché `/library` | |

### ❌ Non ancora eseguiti (non esistono come prompt)

| Tema | Descrizione | Origine |
|------|-------------|---------|
| FIX 9 | Styling bottone "Nuova SOP" (da blue-600 a btn-primary) + Modifica visibile su PUBLISHED per HM+ | Test manuale sessione 30/03 |
| FIX 10 | Nascondere presa visione per ruoli ≥ HM | Test manuale sessione 30/03 |
| FIX 11 | Azioni post-pubblicazione in SOP detail (Modifica, Archivia, Elimina, In evidenza) per HM+ | Test manuale sessione 30/03 |

---

## Fix residui aperti (elenco consolidato)

Tutti i fix non ancora nel codice, da qualsiasi origine:

| # | Tipo | Descrizione | File coinvolti | Priorità |
|---|------|-------------|----------------|----------|
| R1 | Bug PROMPT-05B FIX 4 | Dashboard HOO manca hero section (PropertyHero + SearchBar) | `src/app/(hoo)/dashboard/page.tsx` | Alta |
| R2 | Bug PROMPT-05B FIX 7 | Link "Vedi tutti" Documenti punta a `/hoo-sop` anziché `/library` | `src/components/hoo/hoo-latest-by-type.tsx` riga 60 | Alta |
| R3 | Bug PROMPT-05B FIX 5 | Stats memo fetch usa `status=PUBLISHED` — verificare se corretto per contesto HOO | `src/components/hoo/hoo-home-stats.tsx` | Media |
| R4 | UI | Styling bottone "Nuova SOP" — da `bg-blue-600 rounded-lg` a `btn-primary` | `src/app/(hoo)/hoo-sop/page.tsx` riga 49 | Media |
| R5 | Logica | Bottone "Modifica" nascosto per SOP PUBLISHED — va mostrato per HM/ADMIN/SUPER_ADMIN | `src/app/(hoo)/hoo-sop/page.tsx` riga 80 | Alta |
| R6 | Logica | Presa visione mostrata a Super Admin — deve essere solo per OPERATOR | Detail page SOP | Alta |
| R7 | UI | Azioni post-pubblicazione (Modifica, Archivia, Elimina, In evidenza) mancanti nella detail SOP per HM+ | Detail page SOP | Alta |
| R8 | Cosmetico | PROMPT-02 incompleto: `rounded-lg` residui in pagine admin (library, properties, deleted) | Vari file in `src/app/(hoo)/` | Bassa |

---

## Prossimo prompt da eseguire

**PROMPT-10** (`DomusGO/PROMPT-10-fix-residui-consolidati.md`) — 6 fix che chiudono tutti i residui:

| Fix | Descrizione | Corrispondenza |
|-----|-------------|----------------|
| FIX 1 | Hero section dashboard HOO (HooPropertyHero + HooSearchBar) | R1 |
| FIX 2 | Link "Vedi tutti" Documenti → `/library` | R2 |
| FIX 3 | Detail page SOP lato HOO con ContentActions + ContentTimeline | R7 |
| FIX 4 | Presa visione solo per OPERATOR (non HOD) | R6 |
| FIX 5 | Sweep border-radius residui (131 occorrenze in 25 file) | R8 |
| FIX 6 | Styling coerente lista SOP (da gray-* a design system) | R4 |

**Nota**: R3 (stats memo fetch PUBLISHED-only) è stato valutato come comportamento corretto per il contesto HOO — le stats mostrano i contenuti pubblicati. R5 (Modifica su PUBLISHED) risulta già risolto nel codice attuale (riga 84 di hoo-sop/page.tsx include `canEditPublished`).

---

## Note tecniche

- **Sidebar**: il file `hoo-sidebar.tsx` esiste ancora ma NON è importato/usato nel layout. È codice morto.
- **Memo nella header**: presente e funzionante (riga 16 di `hoo-header.tsx`). Sessione precedente aveva segnalato come mancante — verificato che è corretto.
- **CLAUDE.md**: i campi `note: String?` su ContentReview e ContentStatusHistory sono stati ri-aggiunti correttamente in sessione 30/03.
