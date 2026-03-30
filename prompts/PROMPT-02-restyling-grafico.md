# PROMPT 2 — Restyling grafico: replica fedele del sito hocollection.com

## Contesto

Il software funziona. I componenti ci sono. Ma la grafica attuale non rispecchia il design system di hocollection.com. Questo prompt interviene SOLO sulla parte visiva, senza toccare funzionalità, API, modelli o logica.

## Riferimento visivo

I preview HTML di riferimento sono in:
- `modusho-home-operatore.html` (vista operatore)
- `modusho-home-preview.html` (vista HM/Admin/Super Admin)

## Valori CSS estratti da hocollection.com

```
Tagline:     Inter, 12px, uppercase, letter-spacing: 1px, color: rgba(51,51,51,0.5)
Hotel name:  Playfair Display, 50px, font-weight: 500, color: #964733
Body text:   Cardo, 16px, line-height: 27px, color: #333
UI labels:   Inter, 11-13px, uppercase, letter-spacing: 1.5px, color: rgba(51,51,51,0.45)
Nav links:   Playfair Display, 14px, color: white
Buttons:     Inter, 12.6px, font-weight: 600, uppercase, letter-spacing: 1px
Background:  #F0EFE9 (main), #FAF9F5 (hero/header aree chiare)
Terracotta:  #964733
Borders:     #E8E5DC
```

---

## TASK 1 — Border-radius: 0 ovunque

Il sito hocollection.com ha tutti gli elementi squadrati. Nessun arrotondamento.

### `src/app/globals.css`

Cambiare:
- `border-radius: 6px` → `border-radius: 0` su input, textarea, select
- `.skeleton` → `border-radius: 0`

### Tutti i componenti

Cercare e sostituire tutte le classi Tailwind `rounded-*` con niente (rimuoverle) oppure con `rounded-none` dove serve esplicitare.

**File da modificare:**
- `src/components/operator/operator-header.tsx` — rimuovere `rounded-md` da select, link Dashboard, badge pending
- `src/components/operator/pending-reads.tsx` — rimuovere `rounded-lg` dalle card, `rounded` dai badge, `rounded-md` dal bottone
- `src/components/operator/highlights-section.tsx` (o il nuovo `featured-section.tsx`) — rimuovere `rounded-lg`, `rounded`
- `src/components/operator/memo-section.tsx` — rimuovere `rounded-lg`, `rounded`
- `src/components/operator/search-bar.tsx` — verificare e rimuovere rounded
- `src/components/hoo/hoo-sidebar.tsx` — rimuovere rounded da voci nav, avatar
- `src/app/login/page.tsx` — rimuovere rounded da card login, input, button

**Eccezione**: l'avatar utente (cerchio) e il counter badge (cerchio) mantengono `rounded-full`.

---

## TASK 2 — PropertyHero: replica layout hocollection.com

### `src/components/operator/property-hero.tsx`

**Attualmente:**
```tsx
<h1 className="text-3xl sm:text-4xl font-heading font-semibold text-terracotta">
  {property.name}
</h1>
<p className="text-sm font-ui font-medium uppercase tracking-[0.2em] text-terracotta mt-2">
  {property.tagline}
</p>
```

**Problema**: tagline è SOTTO il nome e in terracotta. Sul sito hocollection.com la tagline è SOPRA e in grigio.

**Correzione:**
```tsx
<div className="flex flex-col items-center">
  {/* Tagline SOPRA — come hocollection.com */}
  {property.tagline && (
    <p className="text-xs font-ui uppercase tracking-[0.08em] text-charcoal/50 mb-3">
      {property.tagline}
    </p>
  )}
  {/* Nome hotel SOTTO — grande, terracotta */}
  <h1 className="text-[50px] font-heading font-medium text-terracotta text-center leading-[1.1]">
    {property.name}
  </h1>
</div>
```

Valori esatti:
- Tagline: `font-size: 12px`, `text-transform: uppercase`, `letter-spacing: 1px`, `color: rgba(51,51,51,0.5)` → classe `text-xs font-ui uppercase tracking-[0.08em] text-charcoal/50`
- Nome: `font-size: 50px`, `font-weight: 500`, `color: #964733` → classe `text-[50px] font-heading font-medium text-terracotta`

---

## TASK 3 — Header operatore: nav in Playfair Display

### `src/components/operator/operator-header.tsx`

I link di navigazione attualmente usano `font-ui` (Inter). Sul sito hocollection.com la nav usa Playfair Display.

Cambiare nelle nav links:
- `text-sm font-ui font-medium` → `text-sm font-heading`

Il logo `HO COLLECTION` nell'header resta invariato (è già il componente `HoLogo`).

---

## TASK 4 — Background della home

### `src/app/(operator)/page.tsx` o layout

Il background principale deve essere `#F0EFE9` (ivory-medium), non `#FEFBF4` (ivory).

La sezione hero (PropertyHero + SearchBar) deve avere background `#FAF9F5` per differenziarsi leggermente.

**Opzione 1** — nel layout operator, cambiare il background:
```tsx
<main className="bg-ivory-medium min-h-screen">
```

**Opzione 2** — in `globals.css`, cambiare `body { background-color: #F0EFE9; }` (attenzione: questo cambia tutto, anche il lato HOO).

Consiglio Opzione 1: cambiare solo il layout operator.

Hero section wrapper:
```tsx
<section className="bg-[#FAF9F5] flex flex-col items-center pt-16 sm:pt-20 pb-10">
```

---

## TASK 5 — SearchBar squadrata

### `src/components/operator/search-bar.tsx`

Verificare e assicurarsi che:
- L'input non abbia border-radius
- Il bottone "Cerca" sia: `bg-terracotta text-white font-ui text-xs font-semibold uppercase tracking-wider px-6 py-3.5`
- Border: `border border-ivory-dark`
- Nessun arrotondamento

---

## TASK 6 — Sezione "Da prendere visione" (PendingReads) — aggiornamento layout

### `src/components/operator/pending-reads.tsx`

Attualmente usa una **griglia 2 colonne con card**. Il nuovo layout è una **lista verticale** con righe orizzontali.

**Struttura per ogni riga:**
```
[pallino terracotta] [badge tipo] [titolo] [meta: codice, reparto, data]     [bottone "Leggi"]
```

Cambiare da:
```tsx
<div className="grid gap-3 sm:grid-cols-2">
  {items.map((item) => (
    <div className="bg-ivory-medium border border-ivory-dark rounded-lg p-5 flex flex-col gap-3">
```

A:
```tsx
<div className="bg-white border border-ivory-dark">
  {items.map((item, index) => (
    <div className={`flex items-center gap-4 px-5 py-4 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
      {/* Pallino terracotta */}
      <div className="w-2.5 h-2.5 rounded-full bg-terracotta shrink-0" />
      {/* Contenuto */}
      <div className="flex-1 flex flex-col gap-1">
        <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 w-fit ${badge.cls}`}>
          {badge.label}
        </span>
        <Link href={...} className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
          {item.title}
        </Link>
        <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45">
          {item.code && <span>{item.code}</span>}
          {item.department && <span>{item.department.name}</span>}
          {item.publishedAt && <span>Pubblicata {formatDate(item.publishedAt)}</span>}
        </div>
      </div>
      {/* Bottone */}
      <button className="shrink-0 px-3.5 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
        Leggi
      </button>
    </div>
  ))}
</div>
```

**Titolo sezione:**
```tsx
<div className="flex items-center gap-3 mb-4">
  <h2 className="text-xl font-heading font-medium text-charcoal-dark">Da prendere visione</h2>
  <span className="flex items-center justify-center w-6 h-6 rounded-full bg-alert-red text-white text-xs font-ui font-bold">
    {items.length}
  </span>
</div>
```

---

## TASK 7 — Badge colori per tipo contenuto

Definire colori consistenti per i badge tipo in tutto il sistema:

```
SOP:       background: #EDE7F6, color: #5E35B1
DOCUMENT:  background: #E3F2FD, color: #1565C0
MEMO:      background: #FFF3E0, color: #E65100
```

Aggiungere in `globals.css`:
```css
.badge-sop { background: #EDE7F6; color: #5E35B1; }
.badge-document { background: #E3F2FD; color: #1565C0; }
.badge-memo { background: #FFF3E0; color: #E65100; }
```

Oppure definire come variabili Tailwind nel @theme.

---

## TASK 8 — Bottoni globali squadrati e stile HO

Tutti i bottoni dell'applicazione devono seguire lo stile hocollection.com:

**Bottone primario:**
```css
background: #964733;
color: white;
border: none;
border-radius: 0;
font-family: Inter;
font-size: 12.6px;
font-weight: 600;
text-transform: uppercase;
letter-spacing: 1px;
padding: 13px 28px;
```

**Bottone outline:**
```css
background: transparent;
color: #964733;
border: 1px solid #964733;
border-radius: 0;
/* stesso font/size/weight/spacing del primario */
```

Verificare e aggiornare:
- Bottone login
- Bottone "Confermo presa visione" (PendingReads)
- Bottoni nella toolbar SOP
- Bottoni nel form di creazione SOP
- Bottoni nel lato HOO

---

## Regole generali

1. **NON modificare il CLAUDE.md**
2. **NON toccare funzionalità, API, modelli, logica** — solo CSS, classi Tailwind, layout HTML
3. **NON aggiungere nuovi componenti** — solo modificare quelli esistenti
4. **Il logo HO Collection nell'header resta invariato**
5. **Verificare con `npm run build`** dopo ogni modifica

## Ordine di esecuzione suggerito

1. TASK 1 (border-radius: 0 globale + globals.css)
2. TASK 7 (badge colori)
3. TASK 8 (bottoni globali)
4. TASK 2 (PropertyHero)
5. TASK 3 (header nav font)
6. TASK 4 (background)
7. TASK 5 (SearchBar)
8. TASK 6 (PendingReads layout → lista verticale)
