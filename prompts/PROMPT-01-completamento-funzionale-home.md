# PROMPT 1 — Completamento funzionale Home Operatore

## Contesto

La home operatore (`src/app/(operator)/page.tsx`) ha già:
- `PropertyHero` (nome hotel + tagline)
- `SearchBar`
- `PendingReads` ("Da leggere" con ContentAcknowledgment)
- `MemoSection` ("Comunicazioni")
- `HighlightsSection` ("In evidenza" — attualmente mostra ultimi 6 pubblicati degli ultimi 7 giorni)

## Obiettivo

Completare la home operatore con le sezioni mancanti e trasformare "In evidenza" da automatico a curato. NON toccare la grafica (font, colori, border-radius, spaziature). Solo funzionalità e struttura.

---

## TASK 1 — Aggiungere `isFeatured` e `featuredAt` al modello Content

### Schema Prisma — `prisma/schema.prisma`

Aggiungere al modello `Content`:

```prisma
isFeatured   Boolean    @default(false)
featuredAt   DateTime?
featuredById String?
featuredBy   User?      @relation("featuredContents", fields: [featuredById], references: [id])
```

Aggiungere al modello `User` la relazione inversa:

```prisma
featuredContents Content[] @relation("featuredContents")
```

Poi eseguire:
```bash
npx prisma migrate dev --name add-featured-fields
```

---

## TASK 2 — API per gestire il flag "In evidenza"

### `src/app/api/content/[id]/feature/route.ts`

Creare endpoint POST e DELETE:

**POST** `/api/content/[id]/feature` — Mette in evidenza
- Solo HOTEL_MANAGER, ADMIN, SUPER_ADMIN possono usarlo
- Setta `isFeatured = true`, `featuredAt = new Date()`, `featuredById = session.user.id`
- Return 200 con il content aggiornato

**DELETE** `/api/content/[id]/feature` — Rimuove da evidenza
- Stessi ruoli
- Setta `isFeatured = false`, `featuredAt = null`, `featuredById = null`
- Return 200

---

## TASK 3 — API per listare contenuti in evidenza

### Modificare `src/app/api/content/route.ts`

Aggiungere supporto per il query parameter `featured=true`:

```typescript
if (searchParams.get("featured") === "true") {
  where.isFeatured = true;
  orderBy = { featuredAt: "desc" };
}
```

---

## TASK 4 — Riscrivere `HighlightsSection` → `FeaturedSection`

### `src/components/operator/featured-section.tsx`

Sostituire il componente `HighlightsSection` con `FeaturedSection`.

**Comportamento:**
- Fetch: `GET /api/content?propertyId={id}&featured=true&status=PUBLISHED`
- Se non ci sono contenuti con `isFeatured=true`, il componente return `null` (la sezione scompare)
- Layout: **identico a PendingReads** — lista verticale con righe orizzontali
- Ogni riga mostra:
  - Barra verticale terracotta a sinistra (4px, altezza piena della riga)
  - Badge tipo (SOP / Documento / Memo) con colori distinti
  - Titolo
  - Meta: codice SOP (se SOP), reparto, data pubblicazione
  - Bottone "Leggi" a destra (stile outline terracotta, come in PendingReads ma testo "Leggi")

**Header sezione:**
- Titolo: "In evidenza" (stesso stile di "Da leggere")
- NO counter badge (quello è solo per "Da prendere visione")

**IMPORTANTE**: la struttura HTML/CSS deve essere identica a `PendingReads` per consistenza visiva. L'unica differenza è:
- PendingReads ha pallino terracotta pieno a sinistra → FeaturedSection ha barra verticale terracotta
- PendingReads ha bottone "Confermo presa visione" → FeaturedSection ha bottone "Leggi"
- PendingReads ha counter badge nel titolo → FeaturedSection no

---

## TASK 5 — Aggiungere `QuickStats` component

### `src/components/operator/quick-stats.tsx`

Componente che mostra contatori linkati.

**Fetch dati:** usare una nuova API o aggregare da quelle esistenti.

**Per vista Operatore** — 3 box:
- SOP del tuo reparto → count dei Content type=SOP, status=PUBLISHED, property=current, filtrati per dipartimento dell'utente → link a `/sop`
- Documenti → count dei Content type=DOCUMENT, status=PUBLISHED, property=current → link a `/documents`
- Memo attivi → count dei Memo della property corrente non scaduti → link a `/memo` (nota: nel routing attuale i memo dell'operatore sono nella MemoSection, verificare se esiste una pagina dedicata)

**Ogni box:**
- Numero grande (font-heading)
- Label sotto (font-ui, uppercase, piccolo)
- Cliccabile: `<Link href="...">` che wrappa il box intero
- Hover: border-terracotta

**Layout:** flex row, gap-5, ogni box flex-1

---

## TASK 6 — Aggiungere `LatestByType` component

### `src/components/operator/latest-by-type.tsx`

Tre colonne affiancate che mostrano gli ultimi 3 contenuti caricati per tipo.

**Fetch:** 3 chiamate parallele:
- `GET /api/content?propertyId={id}&type=SOP&status=PUBLISHED&pageSize=3&sort=publishedAt:desc`
- `GET /api/content?propertyId={id}&type=DOCUMENT&status=PUBLISHED&pageSize=3&sort=publishedAt:desc`
- `GET /api/memo?propertyId={id}&pageSize=3`

**Layout:** grid 3 colonne (lg:grid-cols-3).

Ogni colonna è un pannello con:
- Header: titolo ("Ultime SOP" / "Ultimi Documenti" / "Ultimi Memo") + link "Vedi tutte/tutti"
- Body: lista di 3 item, ognuno con titolo + meta (codice/reparto/data)
- Se la colonna non ha contenuti, mostrare "Nessun contenuto" in grigio

**IMPORTANTE**: questa sezione è uguale per TUTTI i ruoli. Mostra solo contenuti PUBLISHED.

---

## TASK 7 — Aggiornare la Home Operatore

### `src/app/(operator)/page.tsx`

Nuovo ordine componenti:

```tsx
import { PropertyHero } from "@/components/operator/property-hero";
import { SearchBar } from "@/components/operator/search-bar";
import { PendingReads } from "@/components/operator/pending-reads";
import { FeaturedSection } from "@/components/operator/featured-section";
import { QuickStats } from "@/components/operator/quick-stats";
import { LatestByType } from "@/components/operator/latest-by-type";

export default function OperatorHome() {
  return (
    <div>
      <section className="flex flex-col items-center pt-16 sm:pt-20 pb-10">
        <PropertyHero />
        <div className="w-full mt-10">
          <SearchBar />
        </div>
      </section>

      <div className="space-y-10 pb-16">
        {/* 1. Da prendere visione — scompare se vuoto */}
        <PendingReads />

        {/* 2. In evidenza — scompare se vuoto */}
        <FeaturedSection />

        {/* 3. Stat box linkate */}
        <QuickStats />

        {/* 4. Ultime 3 per categoria */}
        <LatestByType />
      </div>
    </div>
  );
}
```

**Rimuovere** `MemoSection` e `HighlightsSection` dalla home. I memo sono ora dentro `LatestByType` (colonna "Ultimi Memo") e i contenuti in evidenza sono gestiti da `FeaturedSection`.

---

## TASK 8 — Aggiungere bottone "Metti in evidenza" lato HOO

### `src/components/hoo/content-actions.tsx`

Aggiungere al componente delle azioni sui contenuti (dove ci sono già edit, archive, delete) un bottone toggle:

- Se `content.isFeatured === false`: mostrare "Metti in evidenza" → POST `/api/content/[id]/feature`
- Se `content.isFeatured === true`: mostrare "Rimuovi da evidenza" → DELETE `/api/content/[id]/feature`
- Visibile solo per HOTEL_MANAGER, ADMIN, SUPER_ADMIN
- Solo su contenuti con status PUBLISHED

---

## TASK 9 — Seed aggiornamento

### `prisma/seed.ts`

Aggiungere `isFeatured: true` e `featuredAt: new Date()` a 2-3 contenuti esistenti nel seed, così la sezione "In evidenza" è visibile al primo avvio.

---

## Regole generali

1. **NON modificare il CLAUDE.md** — le modifiche saranno proposte separatamente
2. **NON modificare stili/grafica** — niente cambio font, colori, border-radius, spaziature
3. **TypeScript strict** — nessun `any`, tutti i tipi definiti
4. **Ogni componente condizionale**: se non ci sono dati, return `null` (la sezione scompare dal DOM)
5. **Mantenere le API esistenti compatibili** — aggiungere parametri, non rompere quelli esistenti

## Ordine di esecuzione suggerito

1. TASK 1 (schema + migration)
2. TASK 2 + TASK 3 (API)
3. TASK 9 (seed per testare)
4. TASK 4 (FeaturedSection)
5. TASK 5 (QuickStats)
6. TASK 6 (LatestByType)
7. TASK 7 (assemblare home)
8. TASK 8 (bottone lato HOO)

Dopo ogni task, verificare che `npm run build` passi senza errori.
