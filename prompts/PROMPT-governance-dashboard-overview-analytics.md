# Prompt per Claude Code — ModusHO
## Governance Dashboard
### Unificazione Overview + Analytics

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Eliminare la pagina **Overview** come landing attuale lato HOO e trasformare la pagina **Analytics** in un’unica **governance dashboard** ottimizzata per il HOO.

La dashboard attuale di `/dashboard` mostra contenuti utili al lato operatore:
- hero
- ricerca
- contenuti in evidenza
- ultimi per tipo

La pagina `/analytics` ha invece i dati giusti, ma oggi è:
- troppo piatta
- troppo densa
- senza gerarchia visiva chiara

Il risultato finale deve essere:

**una pagina unica dove il HOO, in 3 secondi dall’apertura, capisce dove serve il suo intervento.**

---

## DECISIONI ARCHITETTURALI DEFINITIVE

### 1. Overview sparisce come landing HOO
La route `/dashboard` non deve più mostrare la landing page attuale.
Deve mostrare la nuova **governance dashboard**.

### 2. Analytics non esiste più come pagina autonoma
La route `/analytics` non deve più avere una pagina separata.
Deve fare redirect a `/dashboard`.

### 3. Sub-nav semplificata
Nella sub-nav:
- la voce **Overview** diventa **Dashboard**
- la voce **Analytics** viene rimossa

### 4. Componenti lato operatore non si cancellano
I componenti:
- `HooPropertyHero`
- `HooSearchBar`
- `HooFeaturedSection`
- `HooLatestByType`

restano nel codice, perché servono al lato operatore.  
Ma **non devono più essere importati nella pagina `/dashboard`**.

Il componente `HooHomeStats` resta disponibile nel codice, ma **non viene più usato nella dashboard HOO**.

### 5. Ruolo visibile
A livello UI il ruolo resta presentato come **HOO**.  
Non vanno toccati i ruoli applicativi reali:
- `ADMIN`
- `SUPER_ADMIN`

---

# STRUTTURA DELLA NUOVA GOVERNANCE DASHBOARD

La pagina deve avere **4 livelli gerarchici**, dal più urgente al più dettagliato.

L’utente deve trovare risposta alla domanda:

**“Dove devo intervenire?”**

senza scrollare troppo e senza leggere tabelle pesanti appena entra.

---

## LIVELLO 1 — Priorità immediate
### Sopra la piega

Tre card grandi affiancate, altezza uniforme, in griglia a 3 colonne desktop.

Ogni card mostra:
- un numero grande
- un’etichetta chiara
- eventualmente uno stato visivo di attenzione
- eventualmente un link di accesso rapido

### Card 1 — Da approvare
- Valore: `data.header.pendingApprovalCount`
- Link: `/approvals`
- Colore:
  - terracotta se `> 0`
  - sage se `= 0`

### Card 2 — Alert critici
- Valore: `data.header.totalAlerts`
- Link: anchor alla sezione alert della stessa pagina, es. `#critical-alerts`
- Colore:
  - alert-red se `> 0`
  - sage se `= 0`

### Card 3 — Tasso presa visione
- Valore: `data.kpi.ackRate`
- Etichetta chiara, non solo “Presa visione”, ma per esempio:
  - `Tasso presa visione`
- Colore:
  - terracotta se `< 70%`
  - sage se `>= 70%`

### Design card Livello 1
- `border border-ivory-dark`
- padding generoso (`p-8`)
- numero in `text-[42px] font-heading font-semibold`
- etichetta in `text-[12px] font-ui uppercase tracking-wider text-charcoal/50`
- se il valore è in stato di attenzione:
  - bordo sinistro `border-l-4`
  - con `border-l-terracotta` oppure `border-l-alert-red`

### Riga filtri sopra le card
Allineata a destra, stessa logica attuale:

- toggle periodo:
  - Settimana
  - Mese
  - Trimestre
- select struttura, se ci sono più property

Questi filtri devono continuare a guidare i dati della dashboard.

---

## LIVELLO 2 — Alert critici
### Solo se presenti

Se `allAlerts.length > 0`, mostra la sezione alert.  
Se non ci sono alert, la sezione **non deve apparire**.

La struttura resta quella già esistente nell’attuale Analytics:
- lista alert
- severità (`critical`, `warning`, `info`)
- bordo colorato a sinistra
- elementi cliccabili

### Regola
Qui non cambiare la logica funzionale degli alert.  
Cambia solo il loro posizionamento nella gerarchia della pagina.

Assegna a questa sezione un anchor esplicito, per esempio:
- `id="critical-alerts"`

così la card del Livello 1 può puntarci.

---

## LIVELLO 3 — Confronto hotel

Mostrare una tabella di confronto per property con le stesse colonne dell’Analytics attuale:

- Property
- Totali
- Pubblicate
- In review
- Restituite
- Avanzamento
- Ultimo avanzamento

### Aggiunta richiesta
Aggiungere un indicatore di salute visivo per riga:

- `advancementPct < 30` → sfondo `bg-alert-red/5`
- `advancementPct < 50` → sfondo `bg-alert-yellow/5`
- `advancementPct >= 50` → sfondo neutro

### Regola importante
Non cambiare la logica dei dati della tabella.  
Cambia solo la gerarchia visiva e il peso delle informazioni.

### Drill-down reparti
Il drill-down reparto già presente nell’Analytics attuale deve restare disponibile sotto la tabella hotel.

Regole:
- deve restare **chiuso di default**
- deve essere **espandibile per singola property**
- mantiene la stessa meccanica a fisarmonica già esistente

---

## LIVELLO 4 — KPI di dettaglio

In fondo alla dashboard devono restare le 8 card KPI dell’attuale Analytics.

Layout richiesto:
- 2 colonne su mobile
- 4 colonne su desktop

Sotto le card resta anche il dettaglio:
- **Tempo medio per stato**

### Regola di gerarchia visiva
Queste KPI devono avere **peso visivo inferiore** rispetto al Livello 1.

Quindi:
- meno dominanza
- meno contrasto
- ruolo di contesto, non di priorità immediata

---

# CODA APPROVAZIONI — DA RIMUOVERE DALLA DASHBOARD

La tabella approvazioni con azioni dirette attualmente presente nella pagina Analytics **non deve essere riprodotta nella nuova dashboard**.

Le approvazioni hanno già la loro pagina dedicata:
- `/approvals`

La card “Da approvare” del Livello 1 con link a `/approvals` è sufficiente come punto di accesso.

### Quindi
Rimuovere dalla dashboard:
- tabella approvazioni
- modale restituzione (`returnModal`)
- funzioni `handleApprove`
- funzioni `handleReturn`

### Regola netta
**Nessuna azione approvativa diretta deve restare nella dashboard.**

---

# FILE DA MODIFICARE

## 1. `src/app/(hoo)/dashboard/page.tsx`
Riscrivere completamente.

Può essere implementata come:
- server component
oppure
- client component

purché:
- mantenga i filtri periodo/property reattivi
- usi l’endpoint esistente `/api/dashboard`
- renderizzi i 4 livelli gerarchici descritti sopra

### Non deve più importare:
- `HooPropertyHero`
- `HooSearchBar`
- `HooHomeStats`
- `HooFeaturedSection`
- `HooLatestByType`

## 2. `src/app/(hoo)/analytics/page.tsx`
Questa pagina deve diventare solo un redirect a `/dashboard`.

Esempio atteso:
```tsx
import { redirect } from "next/navigation";

export default function AnalyticsPage() {
  redirect("/dashboard");
}
```

## 3. `src/components/hoo/hoo-sub-nav.tsx`
Modificare `SUB_NAV_ITEMS`:

- la voce con `href: "/dashboard"` cambia label da **Overview** a **Dashboard**
- rimuovere la voce:
  - `href: "/analytics"`
  - `label: "Analytics"`

---

# FILE DA NON TOCCARE

Non toccare:
- `HooPropertyHero`
- `HooSearchBar`
- `HooFeaturedSection`
- `HooLatestByType`
- `HooHomeStats`
- `src/app/api/dashboard/route.ts`
- `src/app/(hoo)/approvals/...`
- `CLAUDE.md`
- schema Prisma
- backend / API diverse da quanto strettamente necessario per il redirect

Nessuna modifica a:
- Prisma
- API
- autorizzazioni
- lato operatore

---

# DESIGN SYSTEM — REGOLE DA RISPETTARE

Usare questi colori:
- terracotta `#964733`
- sage `#4E564F`
- charcoal `#333333`
- avorio `#FAF9F5`
- `#F0EFE9`
- `#E8E5DC`
- `alert-red`
- `alert-yellow`

### Regole UI
- nessun `rounded-*`, tranne eventuali badge `rounded-full`
- `font-heading` (Playfair Display) per titoli e numeri grandi
- `font-ui` per etichette e corpo
- bottoni:
  - `btn-primary`
  - `btn-outline`
- card e tabelle:
  - `bg-ivory-medium`
  - `border border-ivory-dark`

---

# COSA QUESTO PROMPT NON FA

Questo prompt:
- non modifica `/api/dashboard`
- non crea nuovi endpoint
- non tocca il lato operatore
- non cancella componenti esistenti
- non modifica Prisma
- non aggiunge dipendenze
- non modifica `/approvals`

---

# VERIFICA ATTESA

## Navigazione
- `/dashboard` mostra la nuova governance dashboard
- `/analytics` fa redirect a `/dashboard`

## Sub-nav
- compare `Dashboard`
- non compare `Overview`
- non compare `Analytics`

## Livello 1
- mostra le 3 card grandi sopra la piega
- la card “Da approvare” linka a `/approvals`
- la card “Alert critici” porta alla sezione alert della stessa pagina
- la card “Tasso presa visione” mostra chiaramente la percentuale

## Livello 2
- se non ci sono alert, la sezione non appare
- se ci sono alert, la sezione appare correttamente

## Livello 3
- tabella hotel visibile
- righe con avanzamento basso evidenziate visivamente
- drill-down reparti chiuso di default

## Livello 4
- 8 KPI in fondo
- tempo medio per stato ancora presente
- peso visivo inferiore al Livello 1

## Componenti operatore
- ancora presenti nel codice
- non usati nella dashboard HOO

## Approvals
- nessuna azione approvativa diretta in dashboard
- la modale restituzione non è presente nella dashboard

---

# OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file modificati
2. come hai trasformato `/dashboard`
3. come hai gestito il redirect `/analytics -> /dashboard`
4. come hai aggiornato la sub-nav
5. come hai costruito i 4 livelli della dashboard
6. come hai rimosso la coda approvazioni dalla dashboard
7. conferma che non hai toccato API, Prisma e lato operatore
8. esito typecheck
9. esito build
