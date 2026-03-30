# PROMPT 5 — Riallineamento home operatore e home HOO alle preview approvate

## Contesto

Le preview HTML approvate sono i file di riferimento assoluto:
- `modusho-home-operatore.html` — home operatore
- `modusho-home-preview.html` — home HM / Admin / Super Admin

L'implementazione attuale ha diverse divergenze da queste preview. Questo prompt corregge TUTTE le divergenze per rendere l'app identica alle preview approvate.

**REGOLA ASSOLUTA**: i file HTML di preview sono la fonte di verità. In caso di dubbio, copia i valori CSS esatti dalla preview.

---

## TASK 1 — FeaturedSection: riscrivere come lista verticale identica a PendingReads

### File: `src/components/operator/featured-section.tsx`

**Problema**: usa una griglia a 2 colonne con card e barra terracotta laterale. Nella preview "In evidenza" ha la STESSA IDENTICA grafica di "Da prendere visione": lista verticale, pallino terracotta, badge tipo, titolo, meta, bottone "Leggi".

**Riscrivere il rendering** copiando la struttura di `pending-reads.tsx`:

```tsx
if (items.length === 0) return null;

return (
  <section className="space-y-4">
    <h2 className="text-xl font-heading font-medium text-charcoal-dark">In evidenza</h2>
    <div className="bg-white border border-ivory-dark">
      {items.map((item, index) => {
        const badge = TYPE_BADGE[item.type] || { label: item.type, cls: "bg-ivory-dark text-charcoal" };
        const detailPath = getDetailPath(item.type);
        return (
          <div key={item.id} className={`flex items-center gap-4 px-5 py-4 ${index < items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
            <div className="w-2.5 h-2.5 rounded-full bg-terracotta shrink-0" />
            <div className="flex-1 flex flex-col gap-1">
              <span className={`text-[10px] font-ui font-bold uppercase tracking-[0.15em] px-2 py-0.5 w-fit ${badge.cls}`}>
                {badge.label}
              </span>
              <Link href={`/${detailPath}/${item.id}`}
                className="font-ui font-medium text-charcoal-dark text-sm hover:text-terracotta transition-colors">
                {item.title}
              </Link>
              <div className="flex items-center gap-3 text-[11px] font-ui text-charcoal/45">
                {item.code && <span>{item.code}</span>}
                {item.department && <span>{item.department.name}</span>}
                {item.publishedAt && <span>Pubblicata {new Date(item.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" })}</span>}
              </div>
            </div>
            <Link href={`/${detailPath}/${item.id}`}
              className="shrink-0 px-3.5 py-1.5 text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta border border-terracotta hover:bg-terracotta hover:text-white transition-colors">
              Leggi
            </Link>
          </div>
        );
      })}
    </div>
  </section>
);
```

**Badge colori**: usare le classi globali `badge-sop`, `badge-document`, `badge-memo` (già definite in globals.css), NON `bg-sage text-white` o `bg-mauve text-white`.

Aggiornare la mappa `TYPE_BADGE`:
```typescript
const TYPE_BADGE: Record<string, { label: string; cls: string }> = {
  SOP: { label: "SOP", cls: "badge-sop" },
  DOCUMENT: { label: "Documento", cls: "badge-document" },
  MEMO: { label: "Memo", cls: "badge-memo" },
  BRAND_BOOK: { label: "Brand Book", cls: "badge-brand-book" },
  STANDARD_BOOK: { label: "Standard Book", cls: "badge-standard-book" },
};
```

**Titolo sezione**: `text-xl font-heading font-medium` (come PendingReads), NON `text-lg font-heading font-semibold`.

**NO counter badge** nel titolo (a differenza di "Da prendere visione" che ha il badge rosso con il conteggio).

---

## TASK 2 — QuickStats: correggere colori, font, sfondo

### File: `src/components/operator/quick-stats.tsx`

**Divergenze dalla preview:**

1. **Numero**: attualmente `text-3xl font-heading font-semibold text-charcoal-dark`. Nella preview: `font-family: Playfair Display, font-size: 36px, font-weight: 500, color: #964733`.
   - Cambiare in: `text-4xl font-heading font-medium text-terracotta`

2. **Label**: attualmente `text-xs font-ui font-medium uppercase tracking-wider text-sage-light`. Nella preview: `font-size: 11px, uppercase, letter-spacing: 1.5px, color: rgba(51,51,51,0.5)`.
   - Cambiare in: `text-[11px] font-ui uppercase tracking-[0.15em] text-charcoal/50 mt-1.5`

3. **Sfondo box**: attualmente `bg-ivory-medium`. Nella preview: `background: white`.
   - Cambiare in: `bg-white`

4. **Label "SOP"**: nella preview dice "SOP del tuo reparto", non solo "SOP".
   - Cambiare la label del primo box.

5. **Gap**: attualmente `gap-5`. Nella preview: `gap: 20px` = `gap-5`. OK.

Codice corretto:
```tsx
const boxes = [
  { label: "SOP del tuo reparto", count: stats.sopCount, href: "/sop" },
  { label: "Documenti", count: stats.docCount, href: "/documents" },
  { label: "Memo attivi", count: stats.memoCount, href: "/" },
];

return (
  <div className="flex gap-5">
    {boxes.map((box) => (
      <Link key={box.label} href={box.href}
        className="flex-1 bg-white border border-ivory-dark p-6 text-center hover:border-terracotta hover:shadow-md transition-all cursor-pointer">
        <p className="text-4xl font-heading font-medium text-terracotta">{box.count}</p>
        <p className="text-[11px] font-ui uppercase tracking-[0.15em] text-charcoal/50 mt-1.5">{box.label}</p>
      </Link>
    ))}
  </div>
);
```

---

## TASK 3 — LatestByType: correggere struttura pannelli

### File: `src/components/operator/latest-by-type.tsx`

**Divergenze dalla preview:**

1. **Sfondo pannello**: attualmente `bg-ivory-medium`. Nella preview: `background: white` con bordo `#E8E5DC`.
2. **Header pannello**: nella preview ha sfondo `#FAF9F5` (ivory) con bordo inferiore, titolo a sinistra e link "Vedi tutte" a destra. Nell'attuale il header è inline senza sfondo distinto.
3. **Titolo colonna**: nella preview `Playfair Display, 16px, font-weight: 500`. Attualmente `text-sm font-heading font-semibold` (troppo piccolo).
4. **Link "Vedi tutte"**: nella preview `Inter, 11px, font-weight: 600, uppercase, letter-spacing: 1px, color: #964733`.
5. **Item codice SOP**: nella preview il codice è in terracotta `#964733`, separato dal meta.

Riscrivere:
```tsx
return (
  <div className="grid gap-6 lg:grid-cols-3">
    {columns.map((col) => (
      <div key={col.title} className="bg-white border border-ivory-dark flex flex-col">
        {/* Header con sfondo avorio */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-ivory-dark bg-ivory">
          <h3 className="text-base font-heading font-medium text-charcoal-dark">{col.title}</h3>
          <Link href={col.linkAll}
            className="text-[11px] font-ui font-semibold uppercase tracking-wider text-terracotta hover:opacity-70 transition-opacity">
            {col.linkAllLabel}
          </Link>
        </div>
        {/* Body */}
        <div className="flex-1">
          {col.items.length === 0 ? (
            <p className="text-sm font-ui text-charcoal/45 px-5 py-4">Nessun contenuto</p>
          ) : (
            col.items.map((item, idx) => (
              <Link key={item.id} href={item.href}
                className={`block px-5 py-3.5 hover:bg-ivory transition-colors ${idx < col.items.length - 1 ? "border-b border-ivory-medium" : ""}`}>
                <div className="flex items-center justify-between gap-2">
                  <p className="text-[13px] font-ui font-medium text-charcoal-dark leading-snug">{item.title}</p>
                  {item.code && <span className="text-[11px] font-ui font-semibold text-terracotta tracking-wide shrink-0">{item.code}</span>}
                </div>
                <p className="text-[11px] font-ui text-charcoal/45 mt-1 flex items-center gap-3">{item.metaNoCode}</p>
              </Link>
            ))
          )}
        </div>
      </div>
    ))}
  </div>
);
```

**Nota**: il `meta` attualmente unisce codice + reparto + data in una stringa unica. Nella preview il codice SOP è separato e posizionato a destra del titolo (terracotta). Serve separare `code` dal resto del meta.

Modificare la costruzione delle colonne per esporre `code` separatamente:
```typescript
items: sopData.map(s => ({
  id: s.id,
  title: s.title,
  href: `/sop/${s.id}`,
  code: s.code || null,
  metaNoCode: [s.department?.name, s.publishedAt ? new Date(s.publishedAt).toLocaleDateString("it-IT", { day: "numeric", month: "short", year: "numeric" }) : null].filter(Boolean).join(" · "),
})),
```

Aggiornare l'interfaccia `Column.items` per includere `code: string | null` e `metaNoCode: string`.

---

## TASK 4 — SearchBar: aggiungere bottone "Cerca" come nella preview

### File: `src/components/operator/search-bar.tsx`

**Divergenza**: la preview ha un input con bottone "Cerca" terracotta a destra, squadrato. L'attuale ha un input con icona lente a sinistra e nessun bottone.

**Modifiche:**

1. Rimuovere l'icona SVG lente a sinistra
2. Aggiungere bottone "Cerca" a destra dell'input
3. Ridurre max-width da 600px a 520px come nella preview

Struttura dalla preview:
```tsx
<div ref={containerRef} className="relative w-full max-w-[520px] mx-auto">
  <div className="flex border border-ivory-dark bg-white overflow-hidden">
    <input
      type="text"
      value={query}
      onChange={handleChange}
      onFocus={() => results.length > 0 && setOpen(true)}
      placeholder="Cerca SOP, documenti, memo..."
      className="flex-1 border-none px-5 py-3.5 text-sm font-ui text-charcoal bg-transparent focus:outline-none focus:ring-0 focus:border-none focus:shadow-none"
      style={{ border: "none", boxShadow: "none" }}
    />
    <button
      type="button"
      onClick={() => search(query)}
      className="shrink-0 bg-terracotta text-white px-6 py-3.5 text-[12.6px] font-ui font-semibold uppercase tracking-wider hover:bg-terracotta-dark transition-colors"
    >
      {loading ? "..." : "Cerca"}
    </button>
  </div>
  {/* dropdown risultati — invariato */}
</div>
```

**IMPORTANTE**: non rimuovere il comportamento di ricerca con debounce. Il bottone "Cerca" è aggiuntivo (trigger manuale), il debounce su input resta attivo.

---

## TASK 5 — PendingReads: sfondo bianco (non ivory)

### File: `src/components/operator/pending-reads.tsx`

**Divergenza piccola**: il contenitore lista usa `bg-ivory` (riga 67). Nella preview è `background: white`.

Cambiare riga 67:
```tsx
// VECCHIO
<div className="bg-ivory border border-ivory-dark">
// NUOVO
<div className="bg-white border border-ivory-dark">
```

---

## TASK 6 — OperatorHeader: struttura nav come nella preview

### File: `src/components/operator/operator-header.tsx`

**Divergenze dalla preview:**

1. **Layout**: nella preview logo + nav sono sulla stessa riga a sinistra (`header-left`), utente a destra. Nell'attuale la nav è su una seconda riga sotto il logo.

2. **Logo**: nella preview è testo "HO COLLECTION" in Playfair Display 16px bianco con letter-spacing 4px. Nell'attuale è il componente `HoLogo` che potrebbe rendere diversamente.

3. **Nav items**: nella preview sono 4: Home, SOP, Documenti, Memo. Nell'attuale sono 5: Home, SOP, Documenti, Brand Book, Standard Book. Tenere quelli attuali (5 voci) dato che Brand Book e Standard Book sono stati aggiunti dopo la preview e sono corretti.

4. **Active state nella preview**: link attivo = bianco con underline bianca di 2px sotto. Attualmente usa `border-b-2` che è corretto ma lo stile `border-white` vs `border-transparent` va verificato.

**Modifiche da fare:**

Portare la nav sulla stessa riga del logo, a sinistra:

```tsx
return (
  <header className="bg-terracotta sticky top-0 z-50">
    <div className="max-w-7xl mx-auto px-6 sm:px-10">
      <div className="flex items-center justify-between h-14">
        {/* Left: logo + nav sulla stessa riga */}
        <div className="flex items-center gap-10">
          <Link href="/" className="shrink-0">
            <span className="font-heading text-white text-base tracking-[0.25em] font-normal">
              HO COLLECTION
            </span>
          </Link>
          <nav className="flex gap-7">
            {NAV_ITEMS.map((item) => {
              const isActive = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
              return (
                <Link key={item.href} href={item.href}
                  className={`text-sm font-heading py-4 relative transition-colors ${
                    isActive ? "text-white" : "text-white/75 hover:text-white"
                  }`}>
                  {item.label}
                  {isActive && (
                    <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />
                  )}
                </Link>
              );
            })}
          </nav>
        </div>

        {/* Right: property selector, user, etc */}
        <div className="flex items-center gap-4">
          {isAdmin && (
            <Link href="/dashboard"
              className="text-sm font-ui font-medium text-white/80 hover:text-white bg-white/10 px-3 py-1.5 transition-colors">
              Dashboard
            </Link>
          )}
          {pendingCount > 0 && (
            <Link href="/#da-leggere"
              className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white text-xs font-ui font-bold"
              title={`${pendingCount} contenuti da leggere`}>
              {pendingCount > 99 ? "99+" : pendingCount}
            </Link>
          )}
          {properties.length > 1 ? (
            <select value={currentPropertyId}
              onChange={(e) => onPropertyChange(e.target.value)}
              className="text-sm border border-white/30 px-2 py-1.5 bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/30 max-w-[160px] font-ui">
              {properties.map((p) => (
                <option key={p.id} value={p.id} className="text-charcoal">{p.name}</option>
              ))}
            </select>
          ) : null}
          <div className="flex items-center gap-2.5 text-white/85 text-[13px] font-ui">
            <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold text-white">
              {userName.split(" ").map(n => n[0]).join("").slice(0,2)}
            </div>
            <span>{userName}</span>
          </div>
          <button onClick={() => signOut({ callbackUrl: "/login" })}
            className="text-sm text-white/60 hover:text-white px-2 py-1 font-ui transition-colors">
            Esci
          </button>
        </div>
      </div>
    </div>
  </header>
);
```

**Altezza header**: nella preview 56px (`h-14`), attualmente `h-16` (64px). Cambiare in `h-14`.

---

## TASK 7 — Creare home HOO secondo la preview approvata

### Situazione attuale

La pagina `src/app/(hoo)/dashboard/page.tsx` contiene un cruscotto analitico complesso (tabelle, KPI, alert, confronti). Questa pagina NON corrisponde alla preview approvata per la home HM/Admin.

### Azioni

**Step 1**: Rinominare la dashboard attuale in analytics:
- Spostare `src/app/(hoo)/dashboard/page.tsx` → `src/app/(hoo)/analytics/page.tsx`
- Aggiornare eventuali link interni che puntano a `/dashboard` per puntare a `/analytics`
- In `operator-header.tsx`, cambiare il link Dashboard da `/dashboard` a `/analytics`

**Step 2**: Creare la nuova home HOO in `src/app/(hoo)/dashboard/page.tsx` (o la root page del layout HOO, a seconda di come è strutturato il routing).

La home HOO deve replicare ESATTAMENTE la preview `modusho-home-preview.html`:

### Struttura della pagina

```
1. Hero (tagline + nome hotel + search bar)
2. Stat box (4 box: SOP Attive, In attesa di approvazione, Documenti, Memo attivi)
3. In evidenza (lista verticale con barra terracotta + badge + titolo + meta + "Da X giorni")
4. Tre colonne (Ultime SOP / Documenti / Memo CON badge di stato)
```

### Specifiche CSS dalla preview

**Hero**: identico a quello operatore — `bg-[#FAF9F5]`, tagline SOPRA in grigio, nome hotel SOTTO in terracotta 50px, search bar sotto.

**Stat box**: 4 box (non 3 come l'operatore):
```
[47 SOP Attive]  [5 In attesa di approvazione]  [12 Documenti]  [3 Memo attivi]
```
- Il box "In attesa di approvazione" ha il numero in arancione `#E65100` (classe `stat-box--alert` nella preview) invece che terracotta
- Tutti linkati alle sezioni reali

**In evidenza**: lista verticale con:
- Barra terracotta verticale a sinistra (4px × 40px) — NON pallino come nell'operatore
- Badge tipo (SOP/Documento/Memo)
- Titolo
- Meta (codice, reparto, data)
- Testo "Da X giorni" in grigio corsivo a destra
- Link "Gestisci evidenze" nell'header della sezione

**Tre colonne**: come operatore MA con badge di stato per ogni item:
- Badge "In revisione" (`background: #FFF3E0; color: #E65100`)
- Badge "Approvata" / "Pubblicato" (`background: #E8F5E9; color: #2E7D32`)
- Badge "Bozza" (`background: #F0EFE9; color: #666`)
- Ogni item mostra anche l'autore nel meta

### Dati

La home HOO deve:
- Fetchare i conteggi per le stat box (SOP totali, in attesa = REVIEW_HM + REVIEW_ADMIN, documenti PUBLISHED, memo attivi)
- Fetchare i contenuti featured (`?featured=true`)
- Fetchare gli ultimi 3 per tipo (tutti gli stati, non solo PUBLISHED — a differenza dell'operatore)
- Usare la property selezionata (property selector nel header HOO o sidebar)

### Componenti

Questa pagina può usare componenti nuovi specifici per HOO o riusare quelli operatore adattati. Scelta consigliata: creare componenti HOO dedicati in `src/components/hoo/` per evitare complessità condizionale nei componenti operatore.

Componenti da creare:
- `src/components/hoo/hoo-home-stats.tsx` — 4 stat box con alert arancione
- `src/components/hoo/hoo-featured-section.tsx` — "In evidenza" con barra + "Da X giorni" + "Gestisci evidenze"
- `src/components/hoo/hoo-latest-by-type.tsx` — 3 colonne con badge stato

Per hero e search bar: riusare `PropertyHero` e `SearchBar` esistenti (sono generici).

---

## TASK 8 — Verificare accesso HOO per HOTEL_MANAGER

### File: `src/app/(hoo)/layout.tsx`

La preview è intitolata "Home HM / Admin / Super Admin". Verificare che il layout HOO permetta l'accesso anche a HOTEL_MANAGER, non solo ADMIN e SUPER_ADMIN.

Se attualmente il layout restringe a ADMIN/SUPER_ADMIN, aggiungere HOTEL_MANAGER:

```typescript
// VECCHIO (probabile)
if (user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
  redirect("/");
}

// NUOVO
if (user.role !== "HOTEL_MANAGER" && user.role !== "ADMIN" && user.role !== "SUPER_ADMIN") {
  redirect("/");
}
```

**NOTA**: l'HOTEL_MANAGER deve vedere la home HOO ma NON deve avere accesso alla pagina analytics (solo ADMIN/SUPER_ADMIN). Aggiungere un check di ruolo nella pagina analytics.

---

## Regole imperative

1. **I file HTML di preview sono la fonte di verità assoluta.** In caso di dubbio, aprire la preview e copiare i valori CSS.
2. **NON toccare**: API, modelli Prisma, logica backend, CLAUDE.md.
3. **NON toccare**: il flusso di workflow (Prompt 03/04).
4. **Usare le classi globali** badge-sop, badge-document, badge-memo già definite in globals.css. Non reinventare colori per i badge.
5. **Border-radius: 0** ovunque eccetto avatar (cerchio) e counter badge (cerchio).
6. **Font heading = Playfair Display** per titoli e nav links. **Font ui = Inter** per tutto il resto.
7. **Colore numeri stat box = terracotta #964733** per i conteggi normali, **arancione #E65100** solo per "In attesa di approvazione".
8. **Sfondo card/pannelli = bianco #FFFFFF**, NON ivory-medium. Lo sfondo ivory-medium `#F0EFE9` è il background della pagina.
9. **Verificare con `npm run build`** alla fine.

## Ordine di esecuzione suggerito

1. TASK 5 (PendingReads sfondo bianco — 1 riga)
2. TASK 1 (FeaturedSection riscrittura — alta priorità)
3. TASK 2 (QuickStats colori)
4. TASK 3 (LatestByType struttura pannelli)
5. TASK 4 (SearchBar bottone Cerca)
6. TASK 6 (OperatorHeader layout)
7. TASK 8 (Accesso HOO per HM)
8. TASK 7 (Home HOO — la più complessa, per ultima)
