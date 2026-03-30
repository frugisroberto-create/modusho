# Prompt 05B — Fix rendering hotel + riallineamento layout HOO alla preview

Lavora sul progetto già esistente di **ModusHO** (cartella `DomusGO/`).

Questa task corregge divergenze visive tra l'app e le preview approvate. NON modifica API, modelli Prisma, workflow SOP o logica backend.

**Preview di riferimento (fonte di verità assoluta):**
- `modusho-home-operatore.html` — home operatore
- `modusho-home-preview.html` — home HM / Admin / Super Admin

---

## REGOLE DI ESECUZIONE

- I file HTML di preview sono la fonte di verità. In caso di dubbio, copiare i valori CSS dalla preview.
- NON toccare: API routes, modelli Prisma, `content-workflow.ts`, logica backend.
- NON cambiare il workflow SOP.
- Mantenere il progetto compilabile in ogni momento.
- Border-radius: 0 ovunque eccetto avatar (cerchio) e counter badge (cerchio).
- Verificare con `npm run build` alla fine.

---

## FIX 1 — BUG CRITICO CSS: il colore `text-terracotta` non funziona sugli `h1`

### Problema

In `src/app/globals.css` (riga 46-49):
```css
h1, h2, h3 {
  font-family: var(--font-heading);
  color: #141413;
}
```

Questo blocco è **fuori da qualsiasi CSS layer**. In Tailwind v4, `@import "tailwindcss"` (riga 1) genera le utilities DENTRO il layer `utilities`. Le regole CSS fuori dai layer hanno **sempre priorità** sulle regole dentro i layer. Risultato: `color: #141413` vince sempre su `text-terracotta`, indipendentemente dalla specificità delle classi. Il nome hotel appare grigio scuro (`#141413`) invece che terracotta.

### Fix

Spostare le regole base di stile dentro `@layer base`:

```css
@import "tailwindcss";

/* === Design System HO Collection === */

@theme {
  /* ... invariato ... */
}

/* === Base styles === */

@layer base {
  body {
    background-color: #F0EFE9;
    color: #333333;
    font-family: var(--font-ui);
  }

  h1, h2, h3 {
    font-family: var(--font-heading);
    color: #141413;
  }
}
```

Questo garantisce che le Tailwind utilities (`text-terracotta`, `text-white`, ecc.) prevalgano sempre sulle regole base quando applicate come classi.

### Verifica

Dopo il fix, il `PropertyHero` (`<h1 className="text-terracotta">`) deve mostrare il nome hotel in `#964733` (terracotta), non `#141413` (grigio scuro).

**ATTENZIONE**: verificare che anche `text-white` sugli heading nell'header funzioni correttamente. Prima del fix, tutti gli h1/h2/h3 erano forzati a `#141413` anche se avevano classi colore diverse.

### Potenziale impatto collaterale

Con questo fix, gli `h1/h2/h3` SENZA classe colore esplicita continueranno a usare `#141413` dal layer base. Ma quelli CON una classe colore (`text-terracotta`, `text-white`, `text-charcoal-dark`) ora funzioneranno correttamente. Verificare visivamente le pagine principali dopo il fix.

---

## FIX 2 — Spostare TUTTE le regole globali in `@layer base`

### Problema

Non solo `h1/h2/h3`, ma TUTTE le regole con selettori elemento in `globals.css` (form inputs, scrollbar) soffrono dello stesso problema: le regole fuori layer vincono sulle utility classes di Tailwind.

### Cosa fare

In `src/app/globals.css`, spostare dentro `@layer base` TUTTE le regole con selettori elemento:
- `body { ... }`
- `h1, h2, h3 { ... }`
- `input[type="text"], textarea, select { ... }`
- `input:focus, textarea:focus, select:focus { ... }`
- `::placeholder { ... }`
- `::-webkit-scrollbar { ... }` e derivati

Le regole con selettori classe (`.btn-primary`, `.btn-outline`, `.badge-sop`, ecc.) vanno in `@layer components`:

```css
@layer components {
  .btn-primary { ... }
  .btn-outline { ... }
  .badge-sop { ... }
  .badge-document { ... }
  .badge-memo { ... }
  .badge-brand-book { ... }
  .badge-standard-book { ... }
  .skeleton { ... }
}
```

Il blocco `@keyframes skeleton-pulse` resta fuori dai layer (le keyframes non sono influenzate dai layer).

Il blocco `@media print` va in `@layer base`.

### Struttura finale di globals.css

```
@import "tailwindcss";

@theme { ... }           ← invariato

@layer base {
  body { ... }
  h1, h2, h3 { ... }
  input, textarea, select { ... }
  :focus { ... }
  ::placeholder { ... }
  ::-webkit-scrollbar { ... }
  @media print { ... }
}

@layer components {
  .btn-primary { ... }
  .btn-outline { ... }
  .badge-sop { ... }
  .badge-document { ... }
  .badge-memo { ... }
  .badge-brand-book { ... }
  .badge-standard-book { ... }
  .skeleton { ... }
}

@keyframes skeleton-pulse { ... }  ← fuori dai layer
```

---

## FIX 3 — Layout HOO: sostituire sidebar con header + sub-nav

### Problema PRINCIPALE

Il lato HOO usa un layout a sidebar verde salvia (`HooSidebar`, larghezza 260px, fissa a sinistra). La preview approvata (`modusho-home-preview.html`) usa un layout completamente diverso:
- **Header terracotta** (identico all'operatore: `#964733`, h-14, logo "HO COLLECTION" + nav sulla stessa riga)
- **Sub-nav** sotto l'header (sfondo `#FAF9F5`, border-bottom `#E8E5DC`, tab: Overview, Approvazioni, Gestione utenti, Report)
- **Nessuna sidebar**

### Cosa fare

#### Step 1: Creare il componente `HooHeader`

Creare `src/components/hoo/hoo-header.tsx`.

L'header HOO è strutturalmente identico all'`OperatorHeader` con queste differenze:
- Tab nav: Home, SOP, Documenti, Brand Book, Standard Book, Analytics
- Link "Analytics" visibile solo a ADMIN/SUPER_ADMIN
- Il link "Dashboard" a destra diventa "Vista Hotel" (punta a `/`)

```tsx
const HOO_NAV_ITEMS = [
  { href: "/dashboard", label: "Home" },
  { href: "/hoo-sop", label: "SOP" },
  { href: "/library", label: "Documenti" },
  { href: "/hoo-brand-book", label: "Brand Book" },
  { href: "/hoo-standard-book", label: "Standard Book" },
];

// Aggiungere condizionalmente per ADMIN/SUPER_ADMIN:
// { href: "/analytics", label: "Analytics" }
```

Struttura header:
- Sfondo `#964733`, altezza 56px (`h-14`)
- Sinistra: "HO COLLECTION" (Playfair Display 16px, letter-spacing 4px, bianco) + nav links
- Destra: "Vista Hotel" (link a `/`), property selector (se multi-property), nome utente + avatar, "Esci"
- Nav links: Playfair Display 14px, `rgba(255,255,255,0.75)`, attivo = bianco + underline 2px

#### Step 2: Creare il componente `HooSubNav`

Creare `src/components/hoo/hoo-sub-nav.tsx`.

```tsx
const SUB_NAV_ITEMS = [
  { href: "/dashboard", label: "Overview" },
  { href: "/approvals", label: "Approvazioni" },
  { href: "/users", label: "Gestione utenti" },    // visibile solo a ADMIN+
  { href: "/properties", label: "Strutture" },       // visibile solo a ADMIN+
  { href: "/reports", label: "Report" },
];
```

Stile dalla preview:
- Sfondo `#FAF9F5`, border-bottom 1px `#E8E5DC`
- Padding: `0 40px`, gap: `32px`
- Font: Inter 13px, weight 500
- Colore inattivo: `rgba(51,51,51,0.5)`, hover: `#333`
- Colore attivo: `#964733` con underline 2px `#964733` sotto

Le voci "Gestione utenti" e "Strutture" devono essere visibili **solo** a ADMIN e SUPER_ADMIN (il middleware già protegge le route, ma la UI deve essere coerente).

#### Step 3: Aggiornare il layout HOO

Modificare `src/app/(hoo)/layout.tsx`:

```tsx
export default async function HooLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id }, select: { id: true } });
  if (!dbUser) redirect("/api/auth/signout");

  if (user.role !== "HOTEL_MANAGER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
    redirect("/");
  }

  // Recupera property assegnate per il property selector
  const propertyAssignments = await prisma.propertyAssignment.findMany({
    where: { userId: user.id },
    select: { property: { select: { id: true, name: true, code: true, tagline: true } } },
    distinct: ['propertyId'],
  });
  const properties = propertyAssignments.map(pa => pa.property);

  // SUPER_ADMIN senza assignment: carica tutte
  const allProperties = user.role === "SUPER_ADMIN" && properties.length === 0
    ? await prisma.property.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true, tagline: true } })
    : properties;

  return (
    <div className="min-h-screen bg-ivory-medium">
      <HooHeader
        userName={user.name}
        userRole={user.role}
        properties={allProperties}
      />
      <HooSubNav userRole={user.role} />
      <main className="max-w-[1200px] mx-auto px-6 lg:px-10 py-8">
        {children}
      </main>
    </div>
  );
}
```

**Rimuovere completamente** l'import e l'uso di `HooSidebar`. Il file `hoo-sidebar.tsx` può restare nel codebase ma non viene più usato.

**Background pagina**: `bg-ivory-medium` (`#F0EFE9`), come nella preview.

**Main content**: `max-width: 1200px`, centrato, padding laterale `px-6 lg:px-10`.

---

## FIX 4 — Dashboard HOO: aggiungere hero con nome hotel

### Problema

La pagina `/dashboard` attuale NON ha il hero con tagline + nome hotel. La preview lo mostra identico alla home operatore.

### Cosa fare

Modificare `src/app/(hoo)/dashboard/page.tsx`:

```tsx
import { PropertyHero } from "@/components/operator/property-hero";
import { SearchBar } from "@/components/operator/search-bar";
import { HooHomeStats } from "@/components/hoo/hoo-home-stats";
import { HooFeaturedSection } from "@/components/hoo/hoo-featured-section";
import { HooLatestByType } from "@/components/hoo/hoo-latest-by-type";

export default function HooDashboardPage() {
  return (
    <div>
      {/* Hero */}
      <section className="bg-ivory flex flex-col items-center pt-16 pb-10 -mx-6 lg:-mx-10 px-6 lg:px-10">
        <PropertyHero />
        <div className="w-full mt-10">
          <SearchBar />
        </div>
      </section>

      <div className="space-y-10 pb-16 pt-10">
        <HooHomeStats />
        <HooFeaturedSection />
        <HooLatestByType />
      </div>
    </div>
  );
}
```

**NOTA**: `PropertyHero` usa `useOperatorContext()` per ottenere la property corrente. Se il layout HOO non fornisce questo context, bisogna:
- O wrappare il contenuto in un `OperatorShell` provider (può funzionare se accetta le props corrette)
- O creare un `HooPropertyHero` dedicato che riceve i dati dal layout HOO via context o props

Valutare la soluzione più pulita. Se `OperatorShell` è troppo legato all'operatore, creare un `HooShell` simile come context provider nel layout HOO, e `HooPropertyHero` che lo consuma.

---

## FIX 5 — HooHomeStats: fix memo count sempre 0

### File: `src/components/hoo/hoo-home-stats.tsx`

### Problemi (riga 29 e 35)

1. Riga 29: `fetch("/api/memo?propertyId=&pageSize=1").catch(() => null)` — `propertyId=` è vuoto, la fetch probabilmente fallisce o restituisce 0
2. Riga 35: `memoActive: 0` è hardcoded, il risultato della fetch memo viene ignorato
3. Il `.catch(() => null)` restituisce `null` (non un `Response`), rendendo impossibile parsare il risultato

### Fix

Sostituire la logica fetch memo:

```typescript
const [sopRes, pendingCount, docRes, memoRes] = await Promise.all([
  fetch("/api/content?type=SOP&status=PUBLISHED&pageSize=1"),
  // pendingCount: somma REVIEW_HM + REVIEW_ADMIN
  (async () => {
    const [hmRes, adminRes] = await Promise.all([
      fetch("/api/content?type=SOP&status=REVIEW_HM&pageSize=1"),
      fetch("/api/content?type=SOP&status=REVIEW_ADMIN&pageSize=1"),
    ]);
    const hmCount = hmRes.ok ? (await hmRes.json()).meta?.total ?? 0 : 0;
    const adminCount = adminRes.ok ? (await adminRes.json()).meta?.total ?? 0 : 0;
    return hmCount + adminCount;
  })(),
  fetch("/api/content?type=DOCUMENT&status=PUBLISHED&pageSize=1"),
  fetch("/api/memo?pageSize=1"),  // senza propertyId vuoto
]);

setStats({
  sopActive: sopRes.ok ? (await sopRes.json()).meta?.total ?? 0 : 0,
  pendingApproval: pendingCount as number,
  documents: docRes.ok ? (await docRes.json()).meta?.total ?? 0 : 0,
  memoActive: (memoRes as Response).ok ? (await (memoRes as Response).json()).meta?.total ?? 0 : 0,
});
```

### Fix aggiuntivo

Riga 55: il box "Documenti" punta a `/hoo-sop` — dovrebbe puntare a `/library` (o la route documenti corretta nel layout HOO):

```typescript
{ label: "Documenti", count: stats.documents, href: "/library", alert: false },
```

---

## FIX 6 — HooFeaturedSection: verificare allineamento con preview

### File: `src/components/hoo/hoo-featured-section.tsx`

Leggere il componente attuale e verificare che:

1. Header sezione abbia: titolo Playfair Display 22px + link "GESTISCI" (non "Gestisci evidenze") terracotta uppercase
2. Lista usi sfondo `white` con bordo `#E8E5DC`
3. Ogni riga abbia: **barra verticale** 4px terracotta (non pallino) + badge tipo + titolo + meta + "Da X giorni" in corsivo grigio a destra
4. Badge tipo usino le classi globali: `badge-sop`, `badge-document`, `badge-memo`

Se il componente NON corrisponde, correggerlo per allinearlo alla preview `modusho-home-preview.html`.

---

## FIX 7 — HooLatestByType: badge stato nelle righe

### File: `src/components/hoo/hoo-latest-by-type.tsx`

Verificare che le 3 colonne (Ultime SOP / Documenti / Memo):

1. Mostrino contenuti in **tutti gli stati** (non solo PUBLISHED — l'HOO vede il backstage)
2. Ogni item abbia un **badge stato** visibile:
   - DRAFT: sfondo `#F0EFE9`, testo `#666`
   - REVIEW_HM: sfondo `#FFF3E0`, testo `#E65100`
   - REVIEW_ADMIN: sfondo `#FFF3E0`, testo `#E65100`
   - PUBLISHED: sfondo `#E8F5E9`, testo `#2E7D32`
   - RETURNED: sfondo `#FFEBEE`, testo `#C0392B`
3. Header pannello: sfondo `#FAF9F5`, titolo Playfair Display 16px + "VEDI TUTTE" terracotta uppercase
4. Sfondo pannello: `white`, bordo `#E8E5DC`
5. Codice SOP in terracotta a destra del titolo

---

## FIX 8 — OperatorHeader: link Dashboard per HM e ADMIN

### File: `src/components/operator/operator-header.tsx`

Verificare che:
1. Il link "Dashboard" (riga ~73) punti a `/dashboard` (home HOO, non `/analytics`)
2. Sia visibile a HOTEL_MANAGER, ADMIN e SUPER_ADMIN (attualmente solo `isAdmin`, manca `isHM`)

Fix riga 72:
```tsx
{(isAdmin || isHM) && (
  <Link href="/dashboard"
    className="text-sm font-ui font-medium text-white/80 hover:text-white bg-white/10 px-3 py-1.5 transition-colors">
    Dashboard
  </Link>
)}
```

**NOTA**: il link attuale punta già a `/analytics` (vedi codice riga 73). Cambiare in `/dashboard` dato che ora la home HOO è lì e analytics è una sotto-sezione.

---

## VERIFICA OBBLIGATORIA

Dopo tutti i fix:

```bash
npx tsc --noEmit
npm run build
```

### Verifica visiva

1. **Home operatore**: nome hotel in terracotta `#964733` (NON grigio)
2. **Home operatore**: tutti gli h2 delle sezioni rispettano i colori delle classi Tailwind
3. **Home HOO**: header terracotta con nav, NON sidebar verde
4. **Home HOO**: sub-nav sotto l'header con Overview/Approvazioni/ecc.
5. **Home HOO**: hero con tagline + nome hotel terracotta + search bar
6. **Home HOO**: 4 stat box con contatore memo > 0
7. **Home HOO**: "In evidenza" con barra verticale terracotta
8. **Home HOO**: 3 colonne con badge stato per ogni contenuto
9. **Tutte le pagine**: nessun heading con colore sbagliato (verifica che il layer base funzioni)

---

## ORDINE DI ESECUZIONE

1. **Fix 1 + Fix 2** — CSS layers in globals.css (risolve il colore hotel + tutti gli override)
2. **Fix 8** — OperatorHeader link Dashboard
3. **Fix 5** — HooHomeStats memo count
4. **Fix 3** — Layout HOO (il più impattante: creare HooHeader, HooSubNav, aggiornare layout)
5. **Fix 4** — Dashboard HOO hero
6. **Fix 6** — HooFeaturedSection verifica
7. **Fix 7** — HooLatestByType badge stato
8. Build + verifica visiva

---

## REGOLA FINALE

Le preview HTML approvate sono il contratto visivo. Se qualcosa nel codice non corrisponde a ciò che si vede aprendo quei file nel browser, è un bug da correggere.
