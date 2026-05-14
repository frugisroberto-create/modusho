# HO Collection — Handover documento di contesto
## Base di riferimento per nuovi progetti digitali del gruppo

---

## 1. Contesto aziendale

### Il gruppo
**HO Collection** è un gruppo alberghiero italiano con base in Puglia. Sei strutture, ognuna con identità distinta ma governance centralizzata.

**CEO**: Daniele De Gennaro (fondatore)
**Managing Director / CMO**: Mattia De Gennaro
**COO**: Roberto Frugis — responsabile operations, standard qualitativi, governance HR, F&B di gruppo, acquisti e accordi quadro

### Le strutture

| Codice | Nome | Città | Posizionamento |
|--------|------|-------|---------------|
| NCL | The Nicolaus Hotel | Bari | Business / MICE. 174 camere, centro congressi, rooftop, wellness |
| HIB | Hi Hotel Bari | Bari | Lifestyle / design. 88 camere, ristorante Basilico |
| PPL | Patria Palace Hotel | Lecce | Lusso. Leading Hotels of the World, ristorante stellato Michelin |
| TCV | I Turchesi Club Village | Castellaneta Marina | Villaggio stagionale, piscina più grande d'Italia |
| DEL | Hotel Delfino | Taranto | Business / leisure, vista mare, MICE |
| MRW | Mercure Roma West | Roma | Franchising Accor, standard brand obbligatori |

### Reparti standard per struttura

| Codice | Nome reparto |
|--------|-------------|
| FO | Front Office |
| RM | Housekeeping / Room Division |
| FB | Food & Beverage |
| MT | Maintenance |
| SP | Spa / Wellness |
| QA | Administration / Back of House |

---

## 2. Design system — valori esatti

Il design di tutti i prodotti digitali HO Collection replica fedelmente l'impostazione grafica del sito **hocollection.com**. Non deve sembrare un software enterprise generico.

### Colori

```css
/* Primari */
--terracotta:       #964733;   /* brand, header, bottoni, accenti principali */
--terracotta-hover: #B8614A;   /* hover bottoni */

/* Accenti */
--sage-dark:        #4E564F;   /* navigazione, sfondi secondari */
--mauve:            #7E636B;   /* badge, tag */
--sage-light:       #848B82;   /* testo secondario, placeholder */

/* Neutri */
--ivory-warm:       #FEFBF4;   /* sfondo principale — MAI bianco puro */
--ivory-medium:     #F0EFE9;   /* sfondo card, sezioni alternate */
--ivory-dark:       #E8E5DC;   /* bordi, divisori */
--charcoal:         #333333;   /* testo principale */
--charcoal-dark:    #141413;   /* heading, testo forte */

/* Stato / feedback */
--alert-red:        #C0392B;
--alert-yellow:     #D4A017;
--success-green:    #4E564F;   /* stesso sage-dark */
--info-blue:        #5B7B8A;

/* Badge LQA / HO Brand (se rilevante) */
--lqa-bg:           #E3F2FD;
--lqa-text:         #1565C0;
--hobrand-bg:       #F3E5F5;
--hobrand-text:     #6A1B9A;
```

### Tipografia

```css
/* Heading — titoli principali, nomi sezione */
font-family: "Wulkan Display", "Playfair Display", Georgia, serif;

/* Body text — contenuti, paragrafi */
font-family: "Cardo", Georgia, serif;

/* UI / navigazione — bottoni, label, tabelle, dati */
font-family: "Inter", -apple-system, sans-serif;
```

Google Fonts da importare:
```
https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;0,600;1,400&family=Cardo:ital,wght@0,400;0,700;1,400&family=Inter:wght@400;500;600;700&display=swap
```

### Componenti UI — regole

```css
/* Bottoni primari */
background: #964733;
color: white;
border-radius: 0;          /* SQUADRATI — nessun arrotondamento */
padding: 10px 52px 16px;
font: Inter 600 12.6px uppercase letter-spacing 1px;

/* Bottoni secondari */
background: transparent;
border: 1px solid #964733;
color: #964733;

/* Card */
background: #F0EFE9;
border: 1px solid #E8E5DC;
border-radius: 8px;        /* card interne — lieve arrotondamento */
box-shadow: none;

/* Header (tutte le app) */
background: #964733;
height: 56px;
color: white;

/* Tabelle */
thead background: #E8E5DC;
righe alternate: #FEFBF4 / #F0EFE9;
nessun bordo verticale;
```

### Principi generali

- **Niente ombre aggressive** (box-shadow solo se strettamente necessario)
- **Niente colori saturi o neon**
- **Sfondi avorio caldi**, mai bianco puro (#FFFFFF)
- **Spaziatura generosa** — l'interfaccia deve respirare
- **Serif per i contenuti**, sans-serif per dati e UI
- Sensazione: hotel di lusso che gestisce le sue operations

---

## 3. Stack tecnologico di riferimento (da ModusHO)

```
Frontend:   Next.js 14+ (App Router)
Backend:    Next.js API Routes
Database:   PostgreSQL
ORM:        Prisma
Auth:       NextAuth.js (credentials provider)
UI:         Tailwind CSS + shadcn/ui
Editor:     TipTap (rich text — già integrato)
Language:   TypeScript (strict mode)
Deploy:     Vercel
```

### Convenzioni codice

- File e cartelle: `kebab-case`
- Componenti React: `PascalCase`
- Funzioni/variabili: `camelCase`
- Costanti: `UPPER_SNAKE_CASE`
- Tipi: `PascalCase` con prefisso per tipi DB (`type DbContent`)

### Convenzioni API

- Pattern RESTful: `GET /api/[resource]`, `POST /api/[resource]`, `GET /api/[resource]/[id]`
- Validazione input: sempre con **Zod**
- Risposta standard: `{ data, error, meta: { page, pageSize, total } }`
- Paginazione: **obbligatoria** su tutte le liste (default 20, max 50)
- RBAC: verificato server-side su ogni route, mai solo lato client

---

## 4. Modello di autorizzazione (RBAC)

Il sistema usa un modello a quattro dimensioni. **Prevale sempre la regola più restrittiva.**

### Ruoli

| Ruolo | Funzione |
|-------|----------|
| OPERATOR | Consulta e conferma presa visione |
| HOD | Head of Department — autore operativo di reparto |
| HOTEL_MANAGER | Responsabile struttura — revisiona e approva |
| ADMIN | Head of Operations (HOO) — approvazione finale |
| SUPER_ADMIN | Override tecnico globale |

### Le quattro dimensioni

1. **Ruolo globale** (`role` su User)
2. **Flag permessi** (`canView`, `canEdit`, `canApprove` su User)
3. **Accesso a property** (`PropertyAssignment`)
4. **Accesso a reparto** (`PropertyAssignment` con `departmentId`)

### Principio fondamentale

```
SUPER_ADMIN bypassa tutto.
Per tutti gli altri: il permesso più restrittivo prevale sempre.
Un utente senza PropertyAssignment non vede nulla.
```

### Modello PropertyAssignment

```typescript
PropertyAssignment {
  userId
  propertyId
  departmentId  // null = accesso a tutti i reparti della property
}
```

---

## 5. Layout e navigazione

### Struttura header

```
Header (sfondo #964733, altezza 56px)
└── Logo + Nav links (stessa riga)
    └── Nome utente + ruolo + avatar + Esci

Sub-nav (sfondo #FAF9F5, border-bottom #E8E5DC)
└── Funzioni di gestione/governance (solo HOD+)
```

**NON esiste sidebar.** Il layout usa header + sub-nav orizzontali.

### Principio "inbox zero operativa" (home operatore)

La home operatore mostra **solo** ciò che richiede azione. Quando non ci sono azioni pendenti, si riduce a hero + barra di ricerca. Nessun feed cronologico, nessuna sezione editoriale.

### Hero section

```
Sfondo: #FAF9F5
Nome hotel: Playfair Display 50px, weight 500, #964733
Tagline:    Inter 12px uppercase, letter-spacing 1px, rgba(51,51,51,0.5)
Ricerca:    bordo #E8E5DC, sfondo bianco, bottone "CERCA" terracotta
```

---

## 6. Loghi e asset

### File disponibili in `public/`

| File | Uso |
|------|-----|
| `modusho-logo-final.svg` | Logo verticale ModusHO (simbolo + testo + tagline) |
| `modusho-simbolo.svg` | Solo simbolo — per header, favicon |
| `images/ho-logo-verticale.png` | Logo HO Collection verticale |
| `images/ho-logo-orizzontale.png` | Logo HO Collection orizzontale |
| `images/ho-simbolo.png` | Solo simbolo HO Collection |

Logo su sfondo scuro: `filter: brightness(0) invert(1)`

---

## 7. Pattern architetturali consolidati

### Autenticazione

NextAuth.js con credentials provider. Sessione contiene: `id`, `name`, `email`, `role`, `propertyId` (prima property assegnata), `canEdit`, `canApprove`.

### Middleware RBAC

`src/middleware.ts` — intercetta tutte le route e verifica autenticazione. Le API verificano autorizzazione indipendentemente dal middleware (doppia verifica).

### Property context

Ogni dato è sempre scoped alla property. Le query includono sempre `propertyId: { in: accessiblePropertyIds }`. Un ADMIN senza PropertyAssignment non vede nulla (solo SUPER_ADMIN bypassa).

### Soft delete

I record non vengono mai eliminati fisicamente. Campo `isDeleted: boolean` (default false) + `deletedAt` + `deletedById`. Solo SUPER_ADMIN vede i record eliminati.

### Audit trail

Ogni cambio di stato crea un record in `ContentStatusHistory`. Immutabile.

### Paginazione

Tutte le liste sono paginate. Parametri standard: `?page=1&pageSize=20`. Risposta: `{ data: [], meta: { page, pageSize, total } }`.

---

## 8. Cosa esiste già — ModusHO

ModusHO è il primo prodotto sviluppato su questo stack. Gestisce:

- Distribuzione e approvazione SOP (Standard Operating Procedures)
- Presa visione obbligatoria da parte degli operatori
- Standard Book (HO Brand + LQA) con visibilità per reparto
- Brand Book (solo HM+)
- Memo
- Dashboard KPI e monitoring per il HOO
- Gestione utenti e strutture

**Repository**: cartella `DomusGO` sul Mac di Roberto.

---

## 9. Note per il nuovo progetto

### Cosa riusare direttamente

- Design system completo (sezione 2 di questo documento)
- Stack tecnologico (sezione 3)
- Modello RBAC (sezione 4) — stesso schema Prisma, stessi ruoli
- Layout e navigazione (sezione 5)
- Convenzioni codice e API (sezione 3)
- Componente `SopEditor` (TipTap) per eventuali campi rich text
- Componenti shadcn/ui già configurati

### Cosa adattare

- Il modello dati va progettato ex-novo per il dominio audit
- La home può seguire lo stesso principio "inbox zero" ma con azioni specifiche per l'audit
- I ruoli possono essere un sottoinsieme (es. solo OPERATOR, HOTEL_MANAGER, ADMIN)

### Cosa NON replicare

- Il workflow SOP a 4 stati (specifico di ModusHO)
- Il sistema di codifica automatica SOP
- Il sistema di presa visione (a meno che non serva anche nell'audit)
