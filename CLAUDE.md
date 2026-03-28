# DomusGO — CLAUDE.md

## Cos'è questo progetto

DomusGO è un sistema di governance operativa per gruppo alberghiero (HO Collection).
NON è un archivio documenti. NON è un CMS. NON è un LMS.

È un sistema che:
- distribuisce procedure operative (SOP) alle strutture alberghiere
- obbliga alla presa visione
- traccia l'avanzamento dell'adozione
- rende visibile chi lavora e chi no
- fornisce al management KPI di governance

## Stack tecnologico

- **Frontend**: Next.js 14+ (App Router)
- **Backend**: Next.js API Routes
- **Database**: PostgreSQL
- **ORM**: Prisma
- **Auth**: NextAuth.js (credentials provider)
- **UI**: Tailwind CSS + shadcn/ui
- **Linguaggio**: TypeScript (strict mode)

## Architettura concettuale

Il sistema ha DUE interfacce distinte per DUE utenti diversi:

### Lato Operatore
L'operatore deve trovare subito quello che gli serve. Non naviga, non esplora. Cerca e legge.

Funzioni:
- Ricerca full-text in home page (barra centrale, cerca nel contenuto non solo nei titoli)
- Memo dell'Hotel Manager (comunicazioni operative attive)
- Contenuti in evidenza (nuove SOP, documenti sicurezza, prioritari)
- Contenuti da visionare (presa visione obbligatoria)

**La home è il centro dell'esperienza, non i menu o le liste.**

### Lato HOO (Head of Operations)
Il HOO usa DomusGO come strumento di governo operativo e monitoraggio dell'avanzamento. Non è un utente che "usa" il sistema — è chi lo governa.

Funzioni:

1. **Approvazione SOP**
   Il HOO deve poter visualizzare con immediatezza tutte le SOP che richiedono approvazione finale, valutarle, approvarle o restituirle con nota. La vista approvazioni è la prima cosa che il HOO deve vedere quando accede.

2. **Monitoraggio andamento hotel**
   Il HOO deve avere un quadro chiaro dello stato di avanzamento delle singole strutture e dei singoli reparti nella produzione, revisione e pubblicazione delle SOP. Non basta un numero: serve capire dove si sta lavorando e dove no.

3. **Reporting manageriale**
   Il sistema deve consentire di produrre report sintetici e leggibili da condividere con il Managing Director per mostrare l'avanzamento del progetto. Il report deve parlare da solo, senza bisogno di spiegazioni.

4. **Individuazione dei colli di bottiglia**
   Il sistema deve rendere evidente dove le SOP si fermano, quali hotel stanno avanzando, quali sono in ritardo e quali reparti necessitano sollecito o supporto. Questo è il valore differenziante del sistema: rendere visibile chi lavora e chi no.

## Modello dati — Entità principali

### Utenti e Ruoli

```
User {
  id
  email
  name
  passwordHash
  role: OPERATOR | HOD | HOTEL_MANAGER | ADMIN | SUPER_ADMIN
  canView: boolean       // default true per tutti
  canEdit: boolean       // default false per OPERATOR
  canApprove: boolean    // default false per OPERATOR e HOD
  isActive
  createdAt
  updatedAt
}

PropertyAssignment {
  userId
  propertyId
  departmentId (nullable — se null, accesso a tutti i reparti)
}

UserContentPermission {
  id
  userId
  contentType: SOP | DOCUMENT | MEMO | BRAND_BOOK | STANDARD_BOOK
}
```

**REGOLA**: Il campo `role` identifica la posizione dell'utente nel processo.
I flag `canView`, `canEdit`, `canApprove` identificano cosa può fare.
`PropertyAssignment` identifica dove può farlo.
`UserContentPermission` identifica su cosa può lavorare.

Queste quattro dimensioni NON sono intercambiabili. Ruolo e permessi NON sono la stessa cosa.

### Ruoli e significato nel workflow

| Ruolo | Funzione | canView | canEdit | canApprove | Preset contenuti |
|-------|----------|---------|---------|------------|------------------|
| OPERATOR | Consulta e conferma presa visione | sì | no | no | nessuno |
| HOD | Autore operativo di reparto | sì | sì | no | Memo, SOP, Document |
| HOTEL_MANAGER | Responsabile di struttura, revisiona | sì | sì | sì | Memo, SOP, Document |
| ADMIN | Approvazione finale e pubblicazione (HOO) | sì | sì | sì | tutti |
| SUPER_ADMIN | Override tecnico globale | sì | sì | sì | tutti |

**Nota critica**: HOTEL_MANAGER con `canApprove = sì` NON significa pubblicazione finale. Nel workflow SOP, HM valida lo step intermedio (REVIEW_HM) e promuove ad ADMIN. Solo ADMIN e SUPER_ADMIN possono fare pubblicazione finale (REVIEW_ADMIN → PUBLISHED).

**Nota su ADMIN**: ADMIN è il profilo operativo finale del workflow (il HOO). NON va confuso con SUPER_ADMIN che è un override tecnico.

### Regole di coerenza ruolo-permessi

1. OPERATOR non può avere canEdit = sì né canApprove = sì (salvo override esplicito documentato)
2. HOD non può avere canApprove = sì
3. Se canApprove = sì, il ruolo deve essere almeno HOTEL_MANAGER
4. Se canEdit = no, UserContentPermission non è selezionabile (non puoi gestire contenuti che non puoi modificare)
5. I preset sono valori iniziali suggeriti, NON vincoli assoluti — l'admin può fare override

```

Property {
  id
  name          // es. "The Nicolaus Hotel", "Hi Hotel Bari", "Patria Palace"
  code          // es. "NCL", "HIB", "PPL"
  city          // es. "Bari", "Lecce", "Roma", "Taranto", "Castellaneta Marina"
  address       // indirizzo completo (opzionale)
  description   // descrizione breve della struttura (opzionale)
  website       // URL sito web della struttura (opzionale)
  logoUrl       // percorso logo della struttura (opzionale, upload in /public/uploads/logos/)
  isActive
  createdAt
  updatedAt
}

Department {
  id
  name          // es. "Front Office", "Housekeeping", "F&B", "Maintenance"
  code
  propertyId    // un reparto appartiene a una struttura
}
```

### Contenuti

```
Content {
  id
  type: SOP | DOCUMENT | MEMO
  title
  body              // rich text (HTML sanitizzato o Markdown)
  status: DRAFT | REVIEW_HM | REVIEW_ADMIN | PUBLISHED | RETURNED | ARCHIVED
  version           // incrementale
  propertyId        // a quale struttura appartiene
  departmentId      // a quale reparto (nullable = trasversale)
  createdById
  updatedById
  publishedAt
  createdAt
  updatedAt
}

ContentAcknowledgment {
  id
  contentId
  userId
  acknowledgedAt
  required: boolean  // se true, è presa visione obbligatoria
}

ContentReview {
  id
  contentId
  reviewerId
  action: APPROVED | RETURNED | FORWARDED
  note              // obbligatoria se RETURNED
  createdAt
}

ContentStatusHistory {
  id
  contentId
  fromStatus        // stato precedente (nullable per creazione iniziale)
  toStatus          // nuovo stato
  changedById       // chi ha cambiato lo stato
  changedAt         // timestamp del cambio
  note              // opzionale, contesto del cambio
}
```

**REGOLA**: ogni cambio di stato di un Content DEVE creare un record in ContentStatusHistory.
Questo è necessario per calcolare:
- tempo di permanenza in ogni stato
- tempo totale di attraversamento del workflow
- identificazione dei colli di bottiglia temporali

```
Memo {
  id
  contentId         // relazione 1:1 con Content di tipo MEMO
  propertyId
  expiresAt         // memo hanno scadenza
  isPinned
}
```

### Contenuti statici

```
StaticDocument {
  id
  type: BRAND_BOOK | STANDARD_BOOK
  title
  fileUrl           // PDF statico
  propertyId (nullable — se null, vale per tutto il gruppo)
  uploadedAt
}
```

## Workflow SOP — REGOLE NON NEGOZIABILI

### Stati

```
DRAFT → REVIEW_HM → REVIEW_ADMIN → PUBLISHED
                                   ↘ RETURNED (con nota obbligatoria)
PUBLISHED → ARCHIVED (quando sostituita da nuova versione)
```

### Permessi per stato

| Azione | Chi può farla |
|--------|---------------|
| Creare bozza (DRAFT) | ADMIN, SUPER_ADMIN |
| Modificare bozza | Autore, ADMIN, SUPER_ADMIN |
| Inviare a REVIEW_HM | Autore, ADMIN |
| Approvare/restituire da HM | HOTEL_MANAGER della property |
| Inoltrare a REVIEW_ADMIN | HOTEL_MANAGER della property |
| Approvare/pubblicare | ADMIN, SUPER_ADMIN |
| Restituire | HOTEL_MANAGER, ADMIN, SUPER_ADMIN |
| Archiviare | ADMIN, SUPER_ADMIN |

### Regole RETURNED
- La nota è OBBLIGATORIA. Se manca, il sistema blocca.
- Deve tracciare: chi ha restituito, quando, perché.
- Una SOP restituita torna a DRAFT.

### Regole ARCHIVED
- Una SOP pubblicata può essere archiviata quando viene sostituita.
- Le SOP archiviate restano visibili in uno storico ma non appaiono nelle viste operative.

## Sistema di autorizzazione (RBAC)

### Tre livelli
1. **Ruolo globale** (globalRole su User)
2. **Permesso su property** (PropertyAssignment)
3. **Permesso su reparto** (PropertyAssignment con departmentId)

### Regola fondamentale
**Prevale SEMPRE il livello più restrittivo.**

Eccezione unica: `SUPER_ADMIN` bypassa tutto.

### Esempi concreti
- Un OPERATOR assegnato a "Nicolaus Hotel" + "Front Office" vede SOLO i contenuti del Front Office del Nicolaus.
- Un HOTEL_MANAGER assegnato a "Nicolaus Hotel" (senza departmentId) vede TUTTI i reparti del Nicolaus.
- Un ADMIN senza property assignment NON vede nulla (deve avere almeno un'assegnazione, a meno che non sia SUPER_ADMIN).

## Dashboard HOO — Layout e priorità

La dashboard è lo strumento di governo del HOO. In pochi secondi deve rispondere a:
1. Cosa richiede la mia azione immediata?
2. Dove si sta fermando il sistema?
3. Come stanno avanzando gli hotel?

### Ordine delle sezioni in pagina (NON modificare)

**Sezione 1 — Header sintetico di contesto**
- Periodo selezionato
- Property incluse nel perimetro
- Numero SOP in attesa approvazione finale
- Numero alert critici

**Sezione 2 — Coda approvazioni** (PRIMA sezione operativa)
SOP in `REVIEW_ADMIN` con: titolo, hotel, reparto, autore/ultimo editor, data ultimo avanzamento, giorni in attesa, nota di review precedente (se presente), azioni rapide (apri, approva, restituisci)

**Sezione 3 — Alert critici**
Solo segnalazioni ad alta utilità manageriale:
- SOP ferme oltre soglia (REVIEW_HM > 5gg, REVIEW_ADMIN > 3gg, DRAFT > 10gg)
- Hotel senza avanzamento recente
- Reparti bloccati
- Hotel con alto numero di restituzioni
- Contenuti critici con presa visione non completata

**Sezione 4 — KPI principali**
- SOP totali
- SOP pubblicate
- SOP in review HM
- SOP in attesa approvazione finale
- SOP restituite
- SOP approvate nel periodo
- Tempo medio di attraversamento del workflow (totale + per singolo stato)
- Tasso di presa visione (% operatori che hanno confermato lettura)

**Sezione 5 — Confronto per hotel**
Vista comparativa per property: SOP totali, pubblicate, in review, restituite, % avanzamento, ultimo avanzamento

**Sezione 6 — Confronto per reparto**
Vista comparativa per reparto: SOP totali, pubblicate, in review, restituite, aging medio o indicatore di blocco

### Principi di design della dashboard

La dashboard DEVE privilegiare:
- immediatezza
- leggibilità
- azione
- confronto
- evidenza dei colli di bottiglia

La dashboard NON deve privilegiare:
- grafici decorativi
- statistiche secondarie
- informazioni non azionabili
- complessità visiva

## Design System — Identità visiva HO Collection

L'interfaccia DomusGO deve ispirarsi all'identità visiva di HO Collection (hocollection.com). Elegante, calda, minimal. NON deve sembrare un software enterprise generico.

### Logo e brand identity

Il sistema usa i loghi ufficiali di HO Collection, NON un logo generato.

**File disponibili in `public/images/`:**
- `ho-logo-verticale.png` — logo verticale completo: simbolo + "HO COLLECTION — INSPIRED HOTELS" impilato. **LOGO PRINCIPALE per la home operatore.**
- `ho-logo-orizzontale.png` — logo orizzontale: simbolo + testo su una riga. Per header e contesti orizzontali.
- `ho-simbolo.png` — solo simbolo (cerchio con tratto). Per favicon, sidebar, spazi compatti.

**File sorgente nella root del progetto (alta risoluzione):**
- `HO_Logo_Orizzontale_Nero.png` (3509×709, RGBA)
- `HO_Simbolo_Nero.png` (1772×2364, RGBA)

**Nota**: tutti i loghi sono in nero su sfondo trasparente. Su sfondi scuri (sidebar, header terracotta) devono essere visualizzati in BIANCO. Usa CSS `filter: brightness(0) invert(1)`.

**Gerarchia di brand:**
- **HO Collection** = brand madre, domina visivamente
- **DomusGO** = nome commerciale del software, sottotitolo discreto

**Dove usare cosa:**

| Contesto | File | Dettagli |
|----------|------|----------|
| Home operatore (hero, SOPRA la barra di ricerca) | `ho-logo-verticale.png` | DOMINANTE. Grande (max-width 300px), centrato. Nessun testo aggiuntivo sotto il logo. |
| Login | `ho-logo-verticale.png` | Centrato, max-width 250px. Nessun testo aggiuntivo. |
| Sidebar HOO (in alto) | `ho-simbolo.png` | Bianco (filter invert), 32px, + testo "DomusGO" bianco accanto |
| Header operatore | `ho-simbolo.png` | Bianco, 24px, a sinistra |
| Favicon | `ho-simbolo.png` | Ridotto a 32×32 |
| Report PDF export | `ho-logo-orizzontale.png` | In header del documento |
| Empty states / pagine vuote | `ho-simbolo.png` | Grande centrato, opacità 15%, decorativo |

### Palette colori

**Primario**
- Terracotta/Marsala: `#964733` — colore brand, bottoni CTA, header attivo, link hover, accenti primari
- Terracotta chiaro: `#B8614A` — hover su bottoni primari

**Accenti**
- Verde salvia scuro: `#4E564F` — sidebar, navigazione, sfondi secondari
- Malva/Rosa antico: `#7E636B` — badge, tag, accenti soft
- Verde salvia chiaro: `#848B82` — testo secondario, placeholder, icone

**Neutri**
- Avorio caldo: `#FEFBF4` — sfondo principale (NON bianco puro)
- Avorio medio: `#F0EFE9` — sfondo card, sfondo sezioni alternate
- Avorio scuro: `#E8E5DC` — bordi, divisori, sfondo hover
- Grigio testo: `#333333` — testo principale
- Quasi nero: `#141413` — heading, testo forte

**Stato / Feedback**
- Alert rosso: `#C0392B` — errori, alert critici
- Alert giallo: `#D4A017` — warning, SOP in ritardo
- Successo verde: `#4E564F` (verde salvia) — conferme, stato ok
- Info blu: `#5B7B8A` — informazioni neutre

### Tipografia

- **Heading**: `"Wulkan Display", Georgia, serif` — titoli principali, nomi sezione
  - Se Wulkan Display non è disponibile (è un font custom), usare `Georgia, serif` come fallback
  - In alternativa: importare un serif elegante da Google Fonts come `Playfair Display` o `Cormorant Garamond`
- **Body text**: `"Cardo", Georgia, serif` — testo contenuti, paragrafi SOP
  - Disponibile su Google Fonts: `@import url('https://fonts.googleapis.com/css2?family=Cardo:ital,wght@0,400;0,700;1,400&display=swap')`
- **UI / Navigazione**: `"Inter", -apple-system, sans-serif` — bottoni, label, tabelle, dati
  - Brooklyn (font originale HO Collection) non è disponibile pubblicamente; Inter è il sostituto più vicino
  - Disponibile su Google Fonts

### Componenti UI

- **Bottoni primari**: sfondo `#964733`, testo bianco, border-radius 4px, padding generoso, nessuna ombra
- **Bottoni secondari**: sfondo trasparente, bordo 1px `#964733`, testo `#964733`
- **Card**: sfondo `#F0EFE9`, bordo 1px `#E8E5DC`, border-radius 8px, nessuna box-shadow
- **Sidebar HOO**: sfondo `#4E564F`, testo bianco, link attivo con accento `#964733`
- **Header operatore**: sfondo `#964733`, testo bianco
- **Tabelle**: header sfondo `#E8E5DC`, righe alternate `#FEFBF4` / `#F0EFE9`, nessun bordo verticale
- **Badge stato SOP**: DRAFT grigio, REVIEW_HM malva `#7E636B`, REVIEW_ADMIN terracotta `#964733`, PUBLISHED verde `#4E564F`, RETURNED rosso `#C0392B`
- **Alert critici**: bordo sinistro 4px colorato (rosso/giallo/grigio), sfondo avorio

### Principi generali di stile
- Niente ombre aggressive (box-shadow)
- Niente colori saturi o neon
- Sfondi avorio caldi, mai bianco puro (#FFFFFF)
- Spaziatura generosa — l'interfaccia deve respirare
- Tipografia serif per i contenuti, sans-serif per i dati e la UI
- Sensazione complessiva: hotel di lusso che gestisce le sue operations, non un SaaS generico

## Ricerca

La ricerca è funzione CRITICA. Se non funziona bene, il sistema perde valore.

### Requisiti
- Ricerca full-text nel body dei contenuti (non solo titoli)
- Rispetta SEMPRE i permessi RBAC (un operatore non vede mai contenuti fuori dal suo perimetro)
- Mostra snippet rilevanti con highlight del termine cercato
- Implementare con PostgreSQL full-text search (tsvector/tsquery) — no Elasticsearch nella v1

## Scalabilità

Target: 300 utenti, 250 operatori.

### Regole
- Paginazione obbligatoria su TUTTE le liste (default 20 items, max 50)
- Query ottimizzate con indici su: propertyId, departmentId, status, type, createdAt
- Niente caricamenti massivi — sempre lazy loading o pagination
- API con cursor-based pagination per liste lunghe

## Struttura del progetto

```
DomusGO/
├── CLAUDE.md                 # questo file
├── docs/
│   └── progetto.md           # documento di progetto originale
├── prisma/
│   └── schema.prisma
├── src/
│   ├── app/
│   │   ├── (auth)/           # login, logout
│   │   ├── (operator)/       # interfaccia operatore
│   │   │   ├── page.tsx      # home operatore (ricerca, memo, evidenza)
│   │   │   ├── sop/
│   │   │   ├── documents/
│   │   │   └── memo/
│   │   ├── (hoo)/            # interfaccia HOO/admin
│   │   │   ├── dashboard/    # KPI e monitoraggio
│   │   │   ├── approvals/    # approvazione SOP
│   │   │   ├── properties/   # gestione strutture
│   │   │   ├── users/        # gestione utenti
│   │   │   └── reports/      # report per MD
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── content/
│   │   │   ├── search/
│   │   │   ├── users/
│   │   │   ├── properties/
│   │   │   └── dashboard/
│   │   └── layout.tsx
│   ├── components/
│   │   ├── ui/               # shadcn components
│   │   ├── operator/         # componenti specifici operatore
│   │   └── hoo/              # componenti specifici HOO
│   ├── lib/
│   │   ├── prisma.ts         # client Prisma
│   │   ├── auth.ts           # config NextAuth
│   │   ├── rbac.ts           # logica autorizzazione
│   │   └── search.ts         # logica ricerca
│   ├── types/
│   │   └── index.ts          # tipi TypeScript condivisi
│   └── middleware.ts          # auth + RBAC middleware
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── next.config.ts
└── .env.example
```

## Convenzioni di codice

### Naming
- File e cartelle: kebab-case (`content-list.tsx`)
- Componenti React: PascalCase (`ContentList`)
- Funzioni e variabili: camelCase (`getContentById`)
- Costanti: UPPER_SNAKE_CASE (`MAX_PAGE_SIZE`)
- Tipi/Interface: PascalCase con prefisso per i tipi DB (`type DbContent`, `interface ContentFilters`)

### API Routes
- Sempre in `src/app/api/`
- Pattern RESTful: `GET /api/content`, `POST /api/content`, `GET /api/content/[id]`
- Sempre validare input con Zod
- Sempre controllare autorizzazione RBAC prima di qualsiasi operazione
- Risposta standard: `{ data, error, meta: { page, pageSize, total } }`

### Componenti
- Server Components di default
- Client Components solo quando serve interattività (`"use client"`)
- Props tipizzate con interface
- Niente prop drilling oltre 2 livelli — usare context o composizione

## Regole per Claude Code — LEGGERE SEMPRE

1. **NON modificare il workflow SOP.** Gli stati sono fissi. Se pensi che servano modifiche, CHIEDI.
2. **NON inventare campi** nel modello dati. Se serve un campo nuovo, CHIEDI.
3. **RISPETTA RBAC** in ogni singola query, ogni singola API, ogni singolo componente. Non esistono scorciatoie.
4. **RISPETTA il property context.** Un utente vede SOLO i dati delle property a cui è assegnato.
5. **Se qualcosa è ambiguo, CHIEDI.** Non assumere. Non indovinare.
6. **Paginazione obbligatoria** su tutte le liste. Nessuna eccezione.
7. **Ogni API deve validare** input (Zod) e autorizzazione (RBAC) prima di fare qualsiasi cosa.
8. **I test devono coprire** RBAC: verificare che un utente non autorizzato NON accede ai dati fuori perimetro.
9. **Brand Book e Standard Book** sono PDF statici. NON fanno parte del workflow operativo. Non hanno stati, non hanno approvazione.
10. **La ricerca deve rispettare i permessi.** Un operatore non deve MAI vedere nei risultati contenuti fuori dal suo perimetro.

## Permessi vincolanti — REGOLE ESPLICITE

Le azioni disponibili dipendono SEMPRE da quattro fattori verificati esplicitamente:
1. **Ruolo** dell'utente (OPERATOR, HOD, HOTEL_MANAGER, ADMIN, SUPER_ADMIN)
2. **Flag permessi** (canView, canEdit, canApprove)
3. **Accesso alla property** (PropertyAssignment)
4. **Accesso al reparto** (PropertyAssignment con departmentId)
5. **Tipi di contenuto autorizzati** (UserContentPermission)

### Regole di conflitto
- In caso di conflitto tra livelli, **prevale SEMPRE la regola più restrittiva**
- `SUPER_ADMIN` ha override globale (unica eccezione)
- Se un utente ha canEdit = sì ma NON ha UserContentPermission per quel tipo di contenuto → non può modificarlo

### Permessi per ruolo operativo
- **OPERATOR**: può solo leggere (canView) e confermare presa visione. Non crea, non modifica, non approva.
- **HOD**: può creare e modificare contenuti (canEdit) SOLO nel proprio reparto, SOLO per i tipi di contenuto autorizzati. Non approva.
- **HOTEL_MANAGER**: può creare, modificare e revisionare (canApprove). Può modificare SOP durante REVIEW_HM. Valida e promuove ad ADMIN. NON pubblica.
- **ADMIN**: approvazione finale e pubblicazione. Può creare e pubblicare direttamente. Può intervenire su tutto il backstage finale.
- **SUPER_ADMIN**: override tecnico globale su tutto.

### Regola fondamentale di implementazione
- Nessuna azione può bypassare i controlli server-side
- I permessi NON devono essere dedotti implicitamente: devono essere implementati ESPLICITAMENTE in ogni API route e in ogni query
- Il backend verifica SEMPRE: ruolo + flag + property + department + content type permission
- Il frontend può nascondere UI elements per UX, ma il backend DEVE sempre rivalidare indipendentemente

## Ordine di sviluppo suggerito

### Fase 1 — Fondamenta
1. Setup progetto Next.js + Prisma + PostgreSQL
2. Schema Prisma completo
3. Seed database con dati di test (3 hotel, 5 reparti, utenti per ruolo)
4. Sistema auth (NextAuth.js)
5. Middleware RBAC

### Fase 2 — Core operatore
6. Home operatore (ricerca, memo, evidenza, da visionare)
7. Vista SOP per operatore
8. Presa visione
9. Ricerca full-text

### Fase 3 — Core HOO
10. Dashboard KPI
11. Approvazione SOP (workflow completo)
12. Monitoraggio per property e reparto
13. Gestione utenti e assegnazioni

### Fase 4 — Completamento
14. Report per MD
15. Gestione Memo
16. Brand Book / Standard Book (PDF viewer)
17. Ottimizzazione e performance

## Properties di riferimento (seed data)

| Code | Nome | Città | Sito web |
|------|------|-------|----------|
| NCL | The Nicolaus Hotel | Bari | thenicolaushotel.com |
| HIB | Hi Hotel Bari | Bari | hihotelbari.com |
| PPL | Patria Palace Hotel | Lecce | patriapalace.com |
| TCV | I Turchesi Club Village | Castellaneta Marina | iturchesi.com |
| DEL | Hotel Delfino Taranto | Taranto | hoteldelfino.com |
| MRW | Mercure Roma West | Roma | mercureromawest.com |

Descrizioni sintetiche:
- **NCL**: Cuore business di Bari. 174 camere, centro congressi, 4 location banqueting, Skyline Rooftop, wellness area, museo verticale d'arte.
- **HIB**: Smart e design oriented. 88 camere, ristorante Basilico, concept lifestyle per modern travellers.
- **PPL**: Hotel di lusso a Lecce, membro Leading Hotels of the World. Esperienza poetica, ristorante stellato, vista senza pari.
- **TCV**: Villaggio turistico stagionale. Piscina più grande d'Italia, sport, mare, costa pugliese.
- **DEL**: Hotel business/leisure vista mare a Taranto. Camere, suite, sale MICE e banqueting.
- **MRW**: Franchising Accor a Roma. Soggiorni business, MICE, area wellness. Standard brand Accor obbligatori.

## Reparti standard (seed data)

Front Office, Housekeeping, F&B, Maintenance, Spa/Wellness, Administration

Nota: i reparti possono variare per struttura. Il sistema deve permettere di configurare reparti diversi per ogni property.

## Gestione Property — CRUD e configurazione

Il sistema deve permettere la gestione completa delle strutture.

### Funzionalità richieste

**Lato HOO** — solo ADMIN e SUPER_ADMIN:

1. **Lista strutture**: src/app/(hoo)/properties/page.tsx
   - Card per ogni property con: logo, nome, città, numero SOP, stato avanzamento
   - Pulsante "Aggiungi struttura"

2. **Dettaglio struttura**: src/app/(hoo)/properties/[id]/page.tsx
   - Info generali (nome, codice, città, indirizzo, descrizione, sito web)
   - Logo della struttura (visualizzazione + cambio)
   - Lista reparti configurati (aggiungi/rimuovi/modifica)
   - KPI della struttura (SOP totali, pubblicate, % presa visione)
   - Lista operatori assegnati

3. **Crea nuova struttura**: src/app/(hoo)/properties/new/page.tsx
   - Form: nome, codice, città, indirizzo, descrizione, sito web
   - Upload logo (immagine PNG/JPG, max 2MB, salvata in /public/uploads/logos/)
   - Selezione reparti iniziali (da lista predefinita + possibilità di aggiungerne di custom)

4. **Modifica struttura**: src/app/(hoo)/properties/[id]/edit/page.tsx
   - Modifica tutti i campi
   - Cambio logo (upload nuovo, preview)
   - Attiva/disattiva struttura (isActive)

5. **Gestione reparti per struttura**:
   - Aggiungi reparto (nome, codice)
   - Rimuovi reparto (solo se non ha SOP associate)
   - Modifica nome reparto

### Logo della struttura

- Il logo è associato alla singola property (campo logoUrl)
- Upload: file immagine (PNG, JPG, SVG), max 2MB
- Salvataggio: /public/uploads/logos/{propertyCode}-logo.{ext}
- Visualizzazione: nel header quando l'operatore è in contesto di quella property, nella lista strutture lato HOO, nei report
- Se non c'è logo: mostrare le iniziali del nome property in un cerchio colorato (fallback)

### API

- GET /api/properties — lista tutte le property (rispetta RBAC)
- GET /api/properties/[id] — dettaglio property
- POST /api/properties — crea nuova property (solo ADMIN, SUPER_ADMIN)
- PUT /api/properties/[id] — modifica property
- POST /api/properties/[id]/logo — upload logo (multipart/form-data)
- DELETE /api/properties/[id]/logo — rimuovi logo
- GET /api/properties/[id]/departments — lista reparti
- POST /api/properties/[id]/departments — aggiungi reparto
- PUT /api/properties/[id]/departments/[depId] — modifica reparto
- DELETE /api/properties/[id]/departments/[depId] — rimuovi reparto (solo se senza SOP)

## Out of scope — NON implementare

- Editor collaborativo (tipo Google Docs)
- App mobile nativa
- LMS / quiz / certificazioni
- Chat interna
- BPM avanzato / workflow builder
- Notifiche push (v1 senza notifiche, solo dashboard)
- Integrazione con PMS
