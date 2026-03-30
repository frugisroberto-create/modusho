# PROMPT-10 — Fix residui consolidati

Lavora sul progetto già esistente di **ModusHO** (cartella `DomusGO/`).

Questa task chiude tutti i fix residui emersi dalla verifica codice del 30 marzo 2026. NON introduce nuove feature. NON modifica CLAUDE.md.

**Riferimenti:**
- `docs/CURRENT_STATE.md` — lista fix R1–R8
- `modusho-home-preview.html` — preview approvata home HOO
- `CLAUDE.md` — regole e architettura (solo lettura)

---

## REGOLE DI ESECUZIONE

- NON toccare: modelli Prisma, `content-workflow.ts`, workflow SOP.
- NON aggiungere nuove entità o concetti di prodotto.
- Mantenere il progetto compilabile in ogni momento.
- Border-radius: 0 ovunque eccetto avatar (cerchio) e counter badge (cerchio).
- Verificare con `npm run build` alla fine.

---

## FIX 1 — Dashboard HOO: aggiungere hero section con nome hotel e barra ricerca

### Problema
La pagina dashboard HOO (`src/app/(hoo)/dashboard/page.tsx`) mostra solo Stats + Featured + LatestByType. Manca la hero section con tagline, nome hotel e barra ricerca come previsto dalla preview `modusho-home-preview.html`.

### Stato attuale
```tsx
// src/app/(hoo)/dashboard/page.tsx (13 righe)
export default function HooDashboardPage() {
  return (
    <div className="space-y-10 pb-16">
      <HooHomeStats />
      <HooFeaturedSection />
      <HooLatestByType />
    </div>
  );
}
```

### Soluzione

Il componente `PropertyHero` esistente (`src/components/operator/property-hero.tsx`) usa `useOperatorContext()` che non è disponibile nel layout HOO. Serve un componente dedicato.

**1. Creare `src/components/hoo/hoo-property-hero.tsx`** (NUOVO FILE):

```tsx
"use client";

import { useState, useEffect } from "react";

interface Property {
  id: string;
  name: string;
  tagline: string | null;
}

export function HooPropertyHero() {
  const [property, setProperty] = useState<Property | null>(null);

  useEffect(() => {
    async function fetchProperty() {
      try {
        const res = await fetch("/api/properties");
        if (res.ok) {
          const json = await res.json();
          // Prendi la prima property assegnata all'utente
          if (json.data && json.data.length > 0) {
            setProperty(json.data[0]);
          }
        }
      } catch {}
    }
    fetchProperty();
  }, []);

  if (!property) return null;

  return (
    <div className="flex flex-col items-center">
      {property.tagline && (
        <p className="text-xs font-ui uppercase tracking-[0.08em] text-charcoal/50 mb-3">
          {property.tagline}
        </p>
      )}
      <h1 className="text-[50px] font-heading font-medium text-terracotta text-center leading-[1.1]">
        {property.name}
      </h1>
    </div>
  );
}
```

**2. Creare `src/components/hoo/hoo-search-bar.tsx`** (NUOVO FILE):

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function HooSearchBar() {
  const [query, setQuery] = useState("");
  const router = useRouter();

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim()) {
      router.push(`/hoo-sop?q=${encodeURIComponent(query.trim())}`);
    }
  };

  return (
    <form onSubmit={handleSearch} className="flex max-w-[520px] mx-auto">
      <input
        type="text"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Cerca procedure, documenti, memo..."
        className="flex-1 border border-ivory-dark bg-white px-4 py-3 text-sm font-ui placeholder:text-charcoal/35 focus:outline-none focus:border-terracotta"
      />
      <button type="submit" className="btn-primary px-6 py-3 text-xs">
        CERCA
      </button>
    </form>
  );
}
```

**3. Aggiornare `src/app/(hoo)/dashboard/page.tsx`:**

```tsx
import { HooPropertyHero } from "@/components/hoo/hoo-property-hero";
import { HooSearchBar } from "@/components/hoo/hoo-search-bar";
import { HooHomeStats } from "@/components/hoo/hoo-home-stats";
import { HooFeaturedSection } from "@/components/hoo/hoo-featured-section";
import { HooLatestByType } from "@/components/hoo/hoo-latest-by-type";

export default function HooDashboardPage() {
  return (
    <div className="space-y-10 pb-16">
      <section className="bg-ivory flex flex-col items-center pt-16 pb-10 -mx-6 lg:-mx-10 px-6 lg:px-10">
        <HooPropertyHero />
        <div className="w-full mt-10">
          <HooSearchBar />
        </div>
      </section>
      <HooHomeStats />
      <HooFeaturedSection />
      <HooLatestByType />
    </div>
  );
}
```

---

## FIX 2 — Link "Vedi tutti" Documenti punta a URL sbagliato

### Problema
In `src/components/hoo/hoo-latest-by-type.tsx` riga 60, il link "Vedi tutti" della colonna "Ultimi Documenti" punta a `/hoo-sop` anziché `/library`.

### Soluzione

Cambiare riga 60 da:
```tsx
title: "Ultimi Documenti", linkAll: "/hoo-sop", linkAllLabel: "Vedi tutti",
```
a:
```tsx
title: "Ultimi Documenti", linkAll: "/library", linkAllLabel: "Vedi tutti",
```

---

## FIX 3 — Detail page SOP lato HOO con azioni post-pubblicazione

### Problema
Non esiste una pagina di dettaglio SOP nel lato HOO. Dalla lista SOP, l'utente può solo andare in edit (`/hoo-sop/[id]/edit`) o in review (`/approvals/[id]`). Manca una pagina di visualizzazione che mostri il contenuto + le azioni di gestione (Modifica, Archivia, In evidenza, Elimina) + la cronologia.

Il componente `ContentActions` (`src/components/hoo/content-actions.tsx`) esiste già e implementa tutte le azioni. Basta usarlo.

### Soluzione

**Creare `src/app/(hoo)/hoo-sop/[id]/page.tsx`** (NUOVO FILE):

```tsx
import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";
import { ContentActions } from "@/components/hoo/content-actions";
import { ContentTimeline } from "@/components/shared/content-timeline";
import Link from "next/link";

interface Props {
  params: Promise<{ id: string }>;
}

export default async function HooSopDetailPage({ params }: Props) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  if (!["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"].includes(user.role)) redirect("/");

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    include: {
      property: { select: { id: true, name: true, code: true } },
      department: { select: { id: true, name: true, code: true } },
      createdBy: { select: { name: true } },
      updatedBy: { select: { name: true } },
    },
  });

  if (!content) notFound();

  const hasAccess = await checkAccess(user.id, "HOTEL_MANAGER", content.propertyId);
  if (!hasAccess) notFound();

  return (
    <div className="max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-sm font-ui text-charcoal/45">
        <Link href="/hoo-sop" className="hover:text-terracotta transition-colors">SOP</Link>
        <span>/</span>
        <span className="text-charcoal-dark">{content.title}</span>
      </nav>

      {/* Header con azioni */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className={`text-[10px] font-ui font-bold uppercase tracking-wider px-2 py-0.5 ${
              content.status === "PUBLISHED" ? "bg-sage text-white" :
              content.status === "DRAFT" ? "bg-ivory-dark text-charcoal" :
              content.status === "REVIEW_HM" ? "badge-memo" :
              content.status === "REVIEW_ADMIN" ? "badge-sop" :
              content.status === "RETURNED" ? "bg-alert-red text-white" :
              content.status === "ARCHIVED" ? "bg-ivory-dark text-charcoal/60" :
              "bg-ivory-dark text-charcoal"
            }`}>
              {content.status}
            </span>
            {content.code && (
              <span className="text-xs font-ui font-semibold text-terracotta tracking-wide">{content.code}</span>
            )}
            <span className="text-xs font-ui text-charcoal/45">{content.property.code}</span>
            {content.department && (
              <span className="text-xs font-ui text-charcoal/45">{content.department.name}</span>
            )}
            <span className="text-xs font-ui text-charcoal/45">v{content.version}</span>
          </div>
          <h1 className="text-2xl font-heading font-semibold text-charcoal-dark">{content.title}</h1>
          <div className="flex gap-3 mt-2 text-sm font-ui text-charcoal/45">
            <span>Autore: {content.createdBy.name}</span>
            {content.publishedAt && (
              <span>Pubblicato il {new Date(content.publishedAt).toLocaleDateString("it-IT")}</span>
            )}
          </div>
        </div>

        {/* Menu azioni (Modifica, In evidenza, Archivia, Elimina) */}
        <ContentActions
          contentId={content.id}
          contentStatus={content.status}
          userRole={user.role}
          isFeatured={content.isFeatured}
        />
      </div>

      {/* Corpo contenuto */}
      <article
        className="prose prose-gray max-w-none bg-ivory border border-ivory-dark p-6 font-body"
        dangerouslySetInnerHTML={{ __html: content.body }}
      />

      {/* Cronologia */}
      <ContentTimeline contentId={content.id} />
    </div>
  );
}
```

**Aggiornare la lista SOP** (`src/app/(hoo)/hoo-sop/page.tsx`) per linkare alla detail page:

Aggiungere un link al titolo della SOP. Nella riga 80, il titolo `<h3>` va wrappato in un `<Link>`:

```tsx
// PRIMA (riga 80):
<h3 className="font-medium text-gray-900 text-sm">{item.title}</h3>

// DOPO:
<Link href={`/hoo-sop/${item.id}`} className="font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
  {item.title}
</Link>
```

---

## FIX 4 — Presa visione: nascondere per HOD (solo OPERATOR)

### Problema
In `src/app/(operator)/sop/[id]/page.tsx` riga 65, il bottone di presa visione (AcknowledgeButton) viene mostrato sia per OPERATOR che per HOD:
```tsx
{(user.role === "OPERATOR" || user.role === "HOD") && (
```

Secondo CLAUDE.md, la presa visione obbligatoria è un meccanismo per gli OPERATOR. Gli HOD sono autori — non devono "prendere visione" delle SOP che loro stessi creano. HM/ADMIN/SUPER_ADMIN ovviamente no.

### Soluzione

Cambiare riga 65 da:
```tsx
{(user.role === "OPERATOR" || user.role === "HOD") && (
```
a:
```tsx
{user.role === "OPERATOR" && (
```

**Nota**: applicare la stessa correzione anche in:
- `src/app/(operator)/documents/[id]/page.tsx` — cercare lo stesso pattern
- `src/app/(operator)/brand-book/[id]/page.tsx` — cercare lo stesso pattern
- `src/app/(operator)/standard-book/[id]/page.tsx` — cercare lo stesso pattern

Verificare ciascun file: se il pattern `user.role === "OPERATOR" || user.role === "HOD"` esiste, cambiarlo a `user.role === "OPERATOR"`.

---

## FIX 5 — Rimozione border-radius residui nelle pagine HOO

### Problema
Il design system di ModusHO usa `border-radius: 0` ovunque (eccetto avatar e counter badge). Dopo il restyling (PROMPT-02), 131 occorrenze di `rounded-lg`, `rounded-md`, `rounded-xl` sono rimaste in 25 file, principalmente nel lato HOO.

### Soluzione

Sweep su tutti i file `.tsx` sotto `src/`:

1. **Sostituire** tutte le occorrenze di `rounded-lg`, `rounded-md`, `rounded-xl` con stringa vuota (rimuovere la classe).
2. **Eccezioni** da NON toccare:
   - `property-avatar.tsx` — gli avatar sono cerchi (lasciarli)
   - Qualsiasi contesto dove `rounded-full` è usato per badge circolari o avatar (lasciarli)
3. **File prioritari** (più occorrenze):
   - `src/app/(hoo)/library/page.tsx` (16 occorrenze)
   - `src/app/(hoo)/analytics/page.tsx` (13 occorrenze)
   - `src/components/hoo/user-form.tsx` (9 occorrenze)
   - `src/app/(hoo)/reports/page.tsx` (9 occorrenze)
   - `src/components/hoo/content-actions.tsx` (8 occorrenze)
   - `src/app/(hoo)/users/[id]/page.tsx` (7 occorrenze)
   - Tutti gli altri file con `rounded-*` (escluse eccezioni sopra)

4. **Attenzione**: nel file `content-actions.tsx` i dropdown e modali usano `rounded-lg` e `rounded-xl`. Sostituire con nessun border-radius (il design system è squadrato).

---

## FIX 6 — Styling coerente nella lista SOP

### Problema
La lista SOP (`src/app/(hoo)/hoo-sop/page.tsx`) usa classi generiche (gray-100, gray-200, gray-300, gray-500, gray-900) che non appartengono al design system ModusHO.

### Soluzione

Allineare al design system:

1. **STATUS_COLORS** (righe 14-21): sostituire con le classi standard
```tsx
const STATUS_COLORS: Record<string, string> = {
  DRAFT: "bg-ivory-medium text-charcoal/60",
  REVIEW_HM: "bg-[#FFF3E0] text-[#E65100]",
  REVIEW_ADMIN: "bg-[#FFF3E0] text-[#E65100]",
  PUBLISHED: "bg-[#E8F5E9] text-[#2E7D32]",
  RETURNED: "bg-[#FECACA] text-[#991B1B]",
  ARCHIVED: "bg-ivory-dark text-charcoal/50",
};
```

2. **Card SOP** (riga 73): sostituire classi generiche
```tsx
// PRIMA:
className="bg-white rounded-lg border border-gray-200 p-4 flex items-center justify-between"
// DOPO:
className="bg-white border border-ivory-dark p-4 flex items-center justify-between"
```

3. **Select filtro** (riga 59): sostituire classi generiche
```tsx
// PRIMA:
className="text-sm border border-gray-300 rounded-md px-3 py-2 bg-white"
// DOPO:
className="text-sm border border-ivory-dark px-3 py-2 bg-white font-ui"
```

4. **Testo** (riga 77-78, 81): da `text-gray-*` a palette design system
```tsx
// text-gray-500 → text-charcoal/45
// text-gray-900 → text-charcoal-dark
// text-gray-400 → text-charcoal/35
```

5. **Skeleton loading** (riga 67): da `bg-gray-200 rounded-lg animate-pulse` a `skeleton`

6. **Paginazione** (righe 104-107): rimuovere `rounded-md`, sostituire colori generic

---

## Ordine di esecuzione

1. FIX 2 (one-liner, link Documenti)
2. FIX 4 (presa visione, 4 file da verificare)
3. FIX 1 (hero dashboard, 3 file)
4. FIX 3 (detail page SOP + link dalla lista)
5. FIX 6 (styling lista SOP)
6. FIX 5 (sweep border-radius, ultimo perché tocca molti file)

## Verifica finale

Dopo l'implementazione:
1. `npm run build` deve completare senza errori TypeScript
2. Dashboard HOO mostra hero section con nome hotel + barra ricerca
3. Link "Vedi tutti" Documenti apre `/library`
4. Cliccando su una SOP dalla lista si apre la detail page con: breadcrumb, header con stato/codice, corpo, menu azioni (⋮), cronologia
5. Menu azioni (⋮) mostra: Modifica, In evidenza, Archivia, Elimina per HM/ADMIN/SUPER_ADMIN
6. Presa visione NON compare per HOD/HM/ADMIN/SUPER_ADMIN sulle detail page operatore
7. Nessun `rounded-lg`, `rounded-md`, `rounded-xl` presente nei file `.tsx` (eccetto avatar/badge circolari)
8. Tutte le pagine HOO usano colori del design system (no gray-100, gray-200, ecc.)
