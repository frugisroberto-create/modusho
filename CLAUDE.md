# ModusHO — CLAUDE.md

## Cos'è questo progetto

ModusHO è un sistema di governance operativa per gruppo alberghiero (HO Collection).
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
- Contenuti da prendere visione (presa visione obbligatoria) — scompare se non ci sono elementi
- Contenuti in evidenza (flag isFeatured, curati da HM/Admin) — stessa grafica di "Da prendere visione", scompare se vuoto
- Stat box linkate (contatori SOP/Documenti/Memo del reparto, cliccabili verso le rispettive sezioni)
- Ultime 3 per categoria (SOP/Documenti/Memo — feed automatico degli ultimi caricati, uguale per tutti i ruoli)

**La home è il centro dell'esperienza, non i menu o le liste.**

### Lato HOO (Head of Operations)
Il HOO usa ModusHO come strumento di governo operativo e monitoraggio dell'avanzamento. Non è un utente che "usa" il sistema — è chi lo governa.

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

**Nota su pubblicazione e flag canApprove**: il flag `canApprove` è il discriminante tecnico che abilita un utente a pubblicare direttamente i contenuti, indipendentemente dal suo ruolo nominale. Quando un HOO abilita `canApprove = sì` su un account, quell'utente può pubblicare le SOP delle proprie property assegnate.

In pratica:
- **Qualunque HOTEL_MANAGER** con `canApprove = sì` può pubblicare le SOP della propria struttura (oltre a validare lo step REVIEW_HM). Senza il flag, può solo creare, modificare e revisionare ma non pubblicare.
- **ADMIN** e **SUPER_ADMIN** hanno `canApprove = sì` per default e possono sempre pubblicare.
- Lo scope di pubblicazione è **sempre** limitato alle property a cui l'utente è esplicitamente assegnato (anche per ADMIN — non SUPER_ADMIN che è override globale).

La decisione di concedere o revocare `canApprove` a un HM è una scelta operativa dell'HOO, basata sulla fiducia e sull'autonomia che si vuole dare a quella persona specifica.

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
  tagline       // es. "Your business destination", "Welcome modern travellers" — tagline breve come da sito hocollection.com (opzionale)
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
  type: SOP | DOCUMENT | MEMO | BRAND_BOOK | STANDARD_BOOK
  code              // GENERATO AUTOMATICAMENTE — es. "NCL-FO-001", "PAT-FB-012"
  title
  body              // rich text (HTML sanitizzato o Markdown)
  fileUrl           // percorso file .docx originale (se caricato)
  status: DRAFT | REVIEW_HM | REVIEW_ADMIN | PUBLISHED | RETURNED | ARCHIVED
  version           // incrementale
  propertyId        // a quale struttura appartiene
  departmentId      // a quale reparto (nullable = trasversale)
  createdById       // CHI L'HA CREATA — l'HOD autore. Visibile sulla SOP.
  submittedById     // CHI L'HA INVIATA per approvazione (può coincidere con createdBy)
  updatedById
  publishedAt
  isDeleted         // SOFT DELETE — default false. Se true, il contenuto è eliminato.
  deletedAt         // timestamp eliminazione
  deletedById       // chi ha eliminato
  isFeatured        // Boolean, default false — flag "In evidenza" gestito da HM/ADMIN/SUPER_ADMIN
  featuredAt        // timestamp di quando è stato messo in evidenza
  featuredById      // chi ha messo in evidenza
  createdAt
  updatedAt

  // DESTINATARI — a chi è rivolta la SOP
  targetAudience    ContentTarget[]
}

ContentTarget {
  id
  contentId
  targetType: ROLE | DEPARTMENT | USER
  // Se ROLE: targetRole indica il ruolo destinatario (es. OPERATOR)
  targetRole: Role?         // es. OPERATOR, HOD
  // Se DEPARTMENT: targetDepartmentId indica il reparto destinatario
  targetDepartmentId: String?
  // Se USER: targetUserId indica uno specifico utente
  targetUserId: String?
  // Nota: almeno uno tra targetRole, targetDepartmentId, targetUserId deve essere valorizzato
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
  note: String?     // obbligatoria se RETURNED — motivazione della restituzione
  createdAt
}

ContentStatusHistory {
  id
  contentId
  fromStatus        // stato precedente (nullable per creazione iniziale)
  toStatus          // nuovo stato
  changedById       // chi ha cambiato lo stato
  changedAt         // timestamp del cambio
  note: String?     // opzionale, contesto del cambio di stato
}

ContentNote {
  id
  contentId         // a quale contenuto si riferisce
  authorId          // chi ha scritto (relazione con User)
  body              // testo della nota (rich text semplice)
  createdAt         // timestamp creazione
  // IMMUTABILE: una volta creata, non si modifica né elimina
}
```

**REGOLA**: ogni cambio di stato di un Content DEVE creare un record in ContentStatusHistory.
Questo è necessario per calcolare:
- tempo di permanenza in ogni stato
- tempo totale di attraversamento del workflow
- identificazione dei colli di bottiglia temporali

### Note sui contenuti (ContentNote) — Diario di bordo

Le note sono un **registro cronologico libero** associato a ogni contenuto. NON fanno parte del processo di invio/approvazione. NON sono un gate del workflow. Sono un diario dove chi lavora sul contenuto lascia osservazioni, contesto, motivazioni.

**Regole:**
1. Chiunque con accesso al contenuto (HOD+ per i contenuti del proprio reparto, HM+ per la struttura, ADMIN/SUPER_ADMIN per tutto) può aggiungere una nota in qualsiasi momento, indipendentemente dallo stato del contenuto
2. Una nota è **immutabile**: una volta creata, non si modifica né si elimina (record di audit)
3. Le note sono ordinate cronologicamente (la più recente in alto)
4. Ogni nota mostra: nome autore + ruolo + timestamp + testo
5. Non c'è limite al numero di note su un contenuto
6. Le note sono visibili a tutti i ruoli da HOD in su che hanno accesso al contenuto

**API:**
- GET `/api/content/[id]/notes` — lista note del contenuto (paginata, ordinata per createdAt desc)
- POST `/api/content/[id]/notes` — crea nuova nota (body: `{ body: string }`)

### Cronologia e audit trail — Specifica UI

La pagina di dettaglio di ogni contenuto include una sezione **"Cronologia"** che unisce in un unico flusso temporale:
1. **Cambi di stato** (da ContentStatusHistory) — es. "DRAFT → REVIEW_HM — Roberto F. — 25 mar 2026"
2. **Revisioni inline** (da ContentRevision) — es. "Contenuto modificato da Roberto F. durante REVIEW_ADMIN" + link al diff visuale
3. **Note** (da ContentNote) — es. nota libera con testo completo

**Rendering nella UI:**
- La cronologia è una **timeline verticale** nella pagina di dettaglio, sotto il corpo del contenuto
- Ogni evento ha un'**icona** diversa per tipo: cerchio per cambio stato, matita per revisione, fumetto per nota
- **Colore indicatore**: terracotta per cambi di stato, blu per revisioni, grigio per note
- Ogni evento mostra: tipo + autore (nome + ruolo) + timestamp relativo ("3 giorni fa") + dettaglio
- Per le revisioni, un bottone "Vedi modifiche" apre il diff visuale (testo rimosso rosso, aggiunto verde)
- Per le note, il testo è visibile direttamente nella timeline
- In fondo alla timeline: **campo di input** per aggiungere una nuova nota (textarea + bottone "Aggiungi nota")

**Visibilità per ruolo:**
- OPERATOR: NON vede la cronologia (vede solo il contenuto pubblicato)
- HOD: vede cronologia dei propri contenuti
- HM: vede cronologia di tutti i contenuti della propria struttura
- ADMIN: vede cronologia di tutti i contenuti delle strutture assegnate
- SUPER_ADMIN: vede tutto

```
Memo {
  id
  contentId         // relazione 1:1 con Content di tipo MEMO
  propertyId
  expiresAt         // memo hanno scadenza
  isPinned
}
```

### Brand Book e Standard Book

Brand Book e Standard Book NON sono più PDF statici. Sono contenuti testuali a pieno titolo, gestiti con titolo + corpo (rich text), creabili e modificabili da ADMIN e SUPER_ADMIN.

Utilizzano il modello Content esistente con type = BRAND_BOOK o STANDARD_BOOK.

```
// Già nel modello Content:
Content {
  type: SOP | DOCUMENT | MEMO | BRAND_BOOK | STANDARD_BOOK
  // title, body (rich text), fileUrl (allegato opzionale), ecc.
  // propertyId: se null → vale per tutto il gruppo
}
```

**Regole specifiche:**
- Creazione: solo ADMIN e SUPER_ADMIN
- Modifica: solo ADMIN e SUPER_ADMIN
- Eliminazione: solo ADMIN e SUPER_ADMIN
- NON seguono il workflow SOP (no DRAFT → REVIEW_HM → ecc.)
- Vengono pubblicati direttamente (status = PUBLISHED alla creazione)
- propertyId nullable: se null, il contenuto è di gruppo (visibile a tutte le strutture)
- Presa visione obbligatoria configurabile (come per le SOP)

**Visibilità per tipo:**
- **Brand Book**: visibile **solo a HOTEL_MANAGER, ADMIN, SUPER_ADMIN**. OPERATOR e HOD NON vedono il Brand Book — è materiale di brand interno destinato alla governance, non operativo. Bloccato sia in lista che in dettaglio.
- **Standard Book**: visibile a TUTTI i ruoli (OPERATOR, HOD, HM, ADMIN, SUPER_ADMIN), ma con filtro `targetAudience` (ContentTarget) per OPERATOR/HOD: vedono solo le sezioni destinate ai loro reparti, ai loro ruoli o specificamente a loro.

**Navigazione operatore:**
La header nav dell'operatore ha 4 tab (Brand Book e Standard Book NON sono nella header operatore):
```
Home | SOP | Documenti | Memo
```
- **OPERATOR e HOD**: non vedono Brand Book né Standard Book nell'header. Accedono allo Standard Book (quando previsto dal targetAudience) tramite la home (sezioni "in evidenza" / "ultimi per tipo") o tramite link diretti.
- **HM, ADMIN, SUPER_ADMIN**: vedono "Brand Book" e "Standard Book" come voci di navigazione diretta nell'header.

L'operatore NON vede la sub-nav (nessuna funzione di gestione).

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
| Creare bozza (DRAFT) | HOD, HOTEL_MANAGER, ADMIN, SUPER_ADMIN |
| Modificare bozza | Autore, HOTEL_MANAGER della property, ADMIN, SUPER_ADMIN |
| Inviare a review | Autore (stato target dipende dal ruolo — vedi flusso RACI sotto) |
| Pubblicare direttamente | ADMIN, SUPER_ADMIN |
| Approvare/restituire da HM | HOTEL_MANAGER della property, ADMIN, SUPER_ADMIN |
| Inoltrare a REVIEW_ADMIN | HOTEL_MANAGER della property |
| Approvare/pubblicare | ADMIN, SUPER_ADMIN |
| Restituire | HOTEL_MANAGER, ADMIN, SUPER_ADMIN |
| Archiviare | HOTEL_MANAGER, ADMIN, SUPER_ADMIN |
| **Modificare dopo pubblicazione** | **HOTEL_MANAGER, ADMIN, SUPER_ADMIN** |
| **Eliminare (soft delete)** | **HOTEL_MANAGER, ADMIN, SUPER_ADMIN** |

### Flusso di invio per ruolo (matrice RACI)

Il sistema instrada i contenuti in modo diverso in base al ruolo del creatore. La logica è centralizzata in `src/lib/content-workflow.ts` (funzione `getSubmitTargetStatus`).

**Matrice RACI:**
- OPERATOR = I (Informed) — riceve, legge, conferma presa visione
- HOD = R (Responsible) — crea contenuti per il proprio reparto
- HOTEL_MANAGER = R + C (Responsible + Consulted) — crea contenuti per la struttura E viene consultato su quelli creati da HOD o ADMIN
- ADMIN = A + R (Accountable + Responsible) — approvazione finale E può creare/pubblicare in autonomia
- SUPER_ADMIN = A + R (Accountable + Responsible) — come ADMIN, bypassa tutto

| Ruolo creatore | "Invia a review" → stato | "Pubblica direttamente" | Label bottone review |
|---------------|--------------------------|------------------------|---------------------|
| HOD | REVIEW_HM | ❌ Non disponibile | "Invia a Hotel Manager" |
| HOTEL_MANAGER | REVIEW_ADMIN (salta REVIEW_HM) | ❌ Non disponibile | "Invia per approvazione finale" |
| ADMIN | REVIEW_HM (consultazione HM) | ✅ → PUBLISHED | "Invia a Hotel Manager" |
| SUPER_ADMIN | REVIEW_HM (consultazione HM) | ✅ → PUBLISHED | "Invia a Hotel Manager" |

**Regole:**
- Ogni ruolo salta i livelli di approvazione ≤ al proprio (l'HM non invia a se stesso)
- ADMIN/SUPER_ADMIN hanno doppia opzione: consultare l'HM oppure pubblicare in autonomia
- La validazione è server-side: se un HOD tenta `publishDirectly=true`, l'API restituisce 403
- Il flusso di review/approvazione (REVIEW_HM → REVIEW_ADMIN → PUBLISHED) NON cambia

### Revisione diretta durante il review (ContentRevision)

I reviewer (HM, ADMIN, SUPER_ADMIN) possono modificare direttamente il contenuto durante il review senza restituirlo all'autore. Ogni modifica è tracciata in modo immutabile.

**Modello `ContentRevision`:**
- `previousTitle` + `previousBody`: snapshot prima della modifica
- `newTitle` + `newBody`: snapshot dopo la modifica
- `revisedById`: chi ha modificato
- `note`: descrizione opzionale della modifica
- `status`: stato del contenuto al momento della revisione (REVIEW_HM, REVIEW_ADMIN, PUBLISHED)
- `createdAt`: timestamp

**Regole:**
1. La revisione viene creata automaticamente quando un reviewer modifica title o body di un contenuto in REVIEW_HM, REVIEW_ADMIN o PUBLISHED
2. Il contenuto resta nello stesso stato — la modifica NON cambia lo stato. Il reviewer può modificare e poi approvare, o modificare e lasciare in review
3. Ogni revisione incrementa il campo `version` del Content
4. ContentRevision è **immutabile**: una volta creato, non può essere modificato né eliminato (record di audit)
5. La cronologia revisioni è visibile a tutti i ruoli ≥ HOD nella pagina di dettaglio
6. Il diff visuale mostra testo rimosso (rosso) e aggiunto (verde) a livello di paragrafo
7. Nella lista approvazioni, un badge "Revisionato dall'HM/Admin" indica che il contenuto è stato modificato durante il review

**Chi può modificare durante il review:**
- In REVIEW_HM: HOTEL_MANAGER della property, ADMIN, SUPER_ADMIN
- In REVIEW_ADMIN: ADMIN, SUPER_ADMIN
- RETURN resta disponibile per problemi strutturali gravi

**Logica centralizzata in:** `src/lib/text-diff.ts` (algoritmo diff a livello di paragrafo)

### Regole RETURNED
- Una SOP restituita torna a DRAFT.
- Il sistema traccia chi ha restituito e quando (ContentReview + ContentStatusHistory).
- La nota NON è obbligatoria come gate del workflow — chi restituisce può (e dovrebbe) aggiungere una ContentNote per spiegare il motivo, ma il sistema non blocca l'azione se manca.

### Regole ARCHIVED
- Una SOP pubblicata può essere archiviata da HOTEL_MANAGER, ADMIN o SUPER_ADMIN.
- Le SOP archiviate restano visibili in uno storico ma non appaiono nelle viste operative.

### Azioni post-pubblicazione — HOTEL_MANAGER, ADMIN, SUPER_ADMIN

Dopo la pubblicazione, i ruoli HOTEL_MANAGER, ADMIN e SUPER_ADMIN possono:

**1. Modificare** un contenuto PUBLISHED (SOP, Document, Memo):
- La modifica crea una NUOVA VERSIONE (version +1)
- Il contenuto resta PUBLISHED durante la modifica (non torna a DRAFT)
- La modifica viene tracciata in ContentStatusHistory con nota descrittiva
- Il campo `updatedById` registra chi ha modificato
- I destinatari NON devono rifare la presa visione (salvo flag esplicito "richiedi nuova presa visione")

**2. Archiviare** un contenuto PUBLISHED:
- Transizione PUBLISHED → ARCHIVED
- Nota obbligatoria (motivo dell'archiviazione)
- Il contenuto sparisce dalle viste operative ma resta nello storico
- Le prese visione precedenti restano registrate

**3. Eliminare** un contenuto (qualsiasi stato):
- SOFT DELETE: il campo `isDeleted` viene impostato a true, `deletedAt` registra il timestamp, `deletedById` registra chi ha eliminato
- Il contenuto NON viene mai rimosso fisicamente dal DB
- I contenuti eliminati NON appaiono in nessuna vista (né operatore né HOO)
- Solo SUPER_ADMIN può vedere i contenuti eliminati (vista admin dedicata)
- L'eliminazione è reversibile solo da SUPER_ADMIN

**Queste regole valgono per TUTTI i tipi di contenuto**: SOP, DOCUMENT, MEMO.

## Contenuti in evidenza (isFeatured)

Il sistema supporta contenuti "in evidenza" selezionati manualmente da HOTEL_MANAGER, ADMIN o SUPER_ADMIN.

**Campi nel modello Content:**
- `isFeatured: Boolean` (default false) — flag per contenuti in evidenza
- `featuredAt: DateTime?` — timestamp di quando è stato messo in evidenza
- `featuredById: String?` — relazione con User che ha messo in evidenza

**Regole:**
1. Solo contenuti con status PUBLISHED possono essere messi in evidenza
2. Solo HOTEL_MANAGER (della struttura), ADMIN e SUPER_ADMIN possono attivare/disattivare il flag
3. API: POST `/api/content/[id]/feature` (attiva) e DELETE `/api/content/[id]/feature` (disattiva)
4. Nella home operatore, la sezione "In evidenza" mostra i contenuti con `isFeatured=true` ordinati per `featuredAt desc`
5. Se non ci sono contenuti in evidenza, la sezione scompare dal DOM (return null)
6. La sezione "In evidenza" ha la stessa identica grafica di "Da prendere visione" (lista verticale, righe orizzontali)

## Archiviazione automatica SOP — REGOLE

Il sistema di archiviazione delle SOP è COMPLETAMENTE AUTOMATICO. L'utente NON deve catalogare, rinominare o organizzare manualmente. Il sistema gestisce tutto in base al contesto.

### Codifica automatica SOP

Ogni SOP riceve un codice auto-generato nel formato:

```
{PROPERTY_CODE}-{DEPT_CODE}-{NUMERO_SEQUENZIALE}
```

Esempi reali (dal Patria Palace):
- `PAT-FO-001` — Prenotazione e pre-arrival (Front Office)
- `PAT-FB-012` — Servizio al tavolo cena (F&B)
- `PAT-SP-003` — Percorso SPA (Spa/Esperienze)
- `NCL-FO-001` — Prima SOP Front Office del Nicolaus

### Codici reparto standard

| Reparto | Codice |
|---------|--------|
| Front Office | FO |
| Housekeeping / Room Division | RM |
| F&B | FB |
| Maintenance | MT |
| Spa/Wellness | SP |
| Administration / Back of House | QA |

Per reparti custom aggiunti dall'utente: il codice reparto viene auto-generato (prime 2 lettere uppercase) o specificato dall'admin.

### Regole di generazione codice

1. **Property code**: preso dal campo `code` della property assegnata (es. NCL, HIB, PPL)
2. **Department code**: preso dal campo `code` del department (es. FO, FB, SP)
3. **Numero sequenziale**: auto-incrementale per combinazione property+department, con zero-padding a 3 cifre (001, 002, ..., 999)
4. Il codice è **immutabile** dopo la creazione — non cambia se la SOP viene modificata, restituita o archiviata
5. Il codice è **unico** a livello di sistema (constraint unique su `Content.code`)

### Archiviazione file su filesystem

Quando viene caricato un file .docx associato a una SOP, il sistema lo salva automaticamente:

```
/uploads/sops/{PROPERTY_CODE}/{DEPT_CODE}/{CODE} - {TITLE_SANITIZED}.docx
```

Esempio:
```
/uploads/sops/PAT/FO/PAT-FO-001 - Prenotazione e pre-arrival.docx
/uploads/sops/NCL/FB/NCL-FB-003 - Mise en place ristorante.docx
```

Le directory vengono create automaticamente se non esistono.

### Cosa è automatico (l'utente NON sceglie)

- **Codice SOP**: generato dal sistema in base a property + department + sequenziale
- **Cartella di salvataggio**: derivata da property code + department code
- **Nome file**: composto da codice + titolo
- **Property**: ereditata dal contesto utente (se assegnato a una sola property) oppure selezionata nel form di creazione
- **Department**: selezionato dal form (dropdown dei reparti della property), poi tutto il resto è automatico

### Cosa sceglie l'utente

- **Titolo** della SOP
- **Reparto** (dropdown dei reparti disponibili per la property)
- **Property** (solo se l'utente ha accesso a più property — altrimenti auto-assegnata)
- **Corpo** della SOP (testo o upload .docx)

### Import bulk SOP esistenti

Per le SOP già prodotte (es. le 78 SOP del Patria Palace in SOP_OUTPUT/), il sistema deve supportare import bulk:
- Lettura della cartella di input
- Parsing del nome file per estrarre codice e titolo (es. "PAT-FO-001 - Prenotazione e pre-arrival.docx")
- Creazione automatica del record Content con property, department e codice corretti
- Salvataggio del file nella struttura di archiviazione corretta
- Status iniziale: DRAFT (pronto per il workflow di approvazione)

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

## Home HOO — Layout approvato (HM / Admin / Super Admin)

La home HOO è la prima pagina che vedono HOTEL_MANAGER, ADMIN e SUPER_ADMIN dopo il login. NON è la dashboard analytics: è un punto di partenza operativo con visibilità immediata su cosa richiede attenzione.

**Route:** `/dashboard` (la dashboard analytics si sposta a `/analytics`)

**Riferimento visivo:** `modusho-home-preview.html` (file preview approvato)

### Header (barra primaria — navigazione contenuti)

- Sfondo `#964733` (terracotta), altezza `56px` (`h-14`)
- **Riga unica**: logo "HO COLLECTION" (Playfair Display 16px, letter-spacing 4px, bianco) + nav sulla STESSA riga a sinistra
- Nav links: Playfair Display 14px, `rgba(255,255,255,0.75)`, link attivo bianco con underline 2px bianco
- A destra: nome utente + badge ruolo + avatar + "Esci"

**Voci header per ruolo (visibilità role-based):**

| Voce | OPERATOR | HOD | HM | ADMIN | SUPER_ADMIN |
|------|----------|-----|----|-------|-------------|
| Home | ✅ | ✅ | ✅ | ✅ | ✅ |
| SOP | ✅ | ✅ | ✅ | ✅ | ✅ |
| Documenti | ✅ | ✅ | ✅ | ✅ | ✅ |
| Memo | ✅ | ✅ | ✅ | ✅ | ✅ |
| Brand Book | — | — | ✅ | ✅ | ✅ |
| Standard Book | — | — | ✅ | ✅ | ✅ |
| Analytics | — | — | — | ✅ | ✅ |

**Nota**: OPERATOR e HOD non vedono **Brand Book** in nessuna sezione (è riservato a HM+). Per **Standard Book**, OPERATOR e HOD lo vedono solo dalla home / link diretti (sezioni in evidenza / ultime per tipo) e solo se previsto dal targetAudience della sezione. HM+ vede entrambi come voci di navigazione diretta nell'header.

### Sub-nav (barra secondaria — funzioni di gestione)

- Sfondo `#FAF9F5`, border-bottom 1px `#E8E5DC`
- Font Inter 13px, weight 500
- Link attivo: colore `#964733` con underline 2px terracotta
- **NON visibile per OPERATOR** (non ha funzioni di gestione)

**Voci sub-nav per ruolo (visibilità role-based):**

| Voce | OPERATOR | HOD | HM | ADMIN | SUPER_ADMIN |
|------|----------|-----|----|-------|-------------|
| Overview | — | ✅ | ✅ | ✅ | ✅ |
| Approvazioni (con badge count) | — | ✅ | ✅ | ✅ | ✅ |
| Report | — | ✅ | ✅ | ✅ | ✅ |
| Gestione utenti | — | — | — | ✅ | ✅ |
| Strutture | — | — | — | ✅ | ✅ |
| Cestino | — | — | — | — | ✅ |

**Riferimento visivo:** `modusho-nav-preview.html` (preview interattiva con switch ruoli)

**Principio architetturale:** la header contiene la navigazione verso i CONTENUTI (SOP, Memo, Documenti, ecc.), la sub-nav contiene le funzioni di GESTIONE e GOVERNANCE (approvazioni, report, utenti, strutture). Le voci admin-only appaiono solo se il ruolo lo consente — stesso meccanismo `minRole` applicato ai due livelli di navigazione.

**NON esiste sidebar.** Il layout HOO usa header + sub-nav orizzontali, coerente con la vista operatore. Questo consente larghezza piena per i contenuti e responsive mobile naturale.

### Hero

- Sfondo `#FAF9F5`, padding generoso (56px sopra, 48px sotto)
- Tagline SOPRA: Inter 12px uppercase, letter-spacing 1px, `rgba(51,51,51,0.5)`
- Nome hotel SOTTO: Playfair Display 50px, weight 500, `#964733`
- Descrizione: Cardo 16px, line-height 27px, `#333`, max-width 560px, centrata
- Barra ricerca: max-width `520px`, bordo `#C8C5BC`, sfondo bianco, **bottone "CERCA"** terracotta a destra (Inter 12.6px, 600, uppercase)

### Gerarchia sezioni (dall'alto verso il basso)

**1. Stat box** — 4 box orizzontali (NON 3 come operatore)
- SOP pubblicate → link a /sop
- Documenti → link a /documents
- Memo attivi → link a /memo
- **In attesa di approvazione** → link a /approvals (box con numero arancione `#E65100`)
- Sfondo `white` (NON ivory-medium), bordo `#E8E5DC`, border-radius 0
- Numero: Playfair Display 36px, weight 500, colore `#964733` (tranne "In attesa": `#E65100`)
- Label: Inter 11px, uppercase, letter-spacing 1.5px, `rgba(51,51,51,0.5)`

**2. In evidenza** — rendering condizionale (scompare se vuoto)
- Header: titolo Playfair Display 22px + link "GESTISCI" terracotta uppercase
- Lista verticale, sfondo `white`, bordo `#E8E5DC`
- Ogni riga: barra verticale 4px terracotta + badge tipo (SOP viola `#EDE7F6`/`#5E35B1`, Documento blu `#E3F2FD`/`#1565C0`, Memo arancio `#FFF3E0`/`#E65100`) + titolo + meta + data "in evidenza da"
- Hover: sfondo `#FAFAF7`

**3. Tre colonne affiancate** — Ultime SOP / Ultimi Documenti / Ultimi Memo
- Grid 3 colonne, gap 24px
- Ogni pannello: sfondo `white`, bordo `#E8E5DC`
- **Header pannello**: sfondo `#FAF9F5`, border-bottom `#E8E5DC`, titolo Playfair Display 16px + link "VEDI TUTTE" terracotta uppercase
- Ogni item: titolo Inter 13px + codice terracotta (solo SOP) + meta con badge stato + reparto + data
- Badge stato: DRAFT grigio, REVIEW_HM malva, REVIEW_ADMIN terracotta, PUBLISHED verde, RETURNED rosso

**4. Tabella ultime SOP** (opzionale, sotto le 3 colonne)
- Tabella con header `#FAF9F5`, colonne: Codice, Titolo, Reparto, Stato, Autore, Data
- Hover righe: sfondo `#FAFAF7`

### Differenze chiave tra Home Operatore e Home HOO

| Aspetto | OPERATOR | HOD | HM | ADMIN | SUPER_ADMIN |
|---------|----------|-----|----|-------|-------------|
| Header nav voci | 4 | 4 | 6 | 7 | 7 |
| Sub-nav | No | 3 voci | 3 voci | 5 voci | 6 voci (+ Cestino) |
| Stat box | 3 | 4 | 4 | 4 | 4 |
| "Da prendere visione" | Sì | No | No | No | No |
| "In evidenza" | No | Sì (senza "Gestisci") | Sì (senza "Gestisci") | Sì (con "Gestisci") | Sì (con "Gestisci") |
| Badge stato nelle colonne | No | Sì | Sì | Sì | Sì |
| Analytics nell'header | No | No | No | Sì | Sì |
| Gestione utenti in sub-nav | No | No | No | Sì | Sì |
| Strutture in sub-nav | No | No | No | Sì | Sì |
| Cestino in sub-nav | No | No | No | No | Sì |

---

## Analytics HOO — Layout e priorità

La pagina analytics (`/analytics`) è lo strumento di governo avanzato del HOO. In pochi secondi deve rispondere a:
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

## Design System — Replica fedele del sito hocollection.com

L'interfaccia ModusHO deve replicare FEDELMENTE l'impostazione grafica del sito hocollection.com. Stessi font, stesse dimensioni, stessi colori, stessa disposizione. NON deve sembrare un software enterprise generico.

### Riferimento: valori CSS esatti estratti da hocollection.com

Questi sono i valori reali del sito HO Collection da replicare:

**Header/Nav bar:**
- Sfondo: `rgb(150, 71, 51)` = `#964733` (terracotta)
- Altezza: ~70px (la barra di navigazione, non il banner completo)
- Nav links: font Wulkan Display (fallback: Playfair Display, Georgia, serif), 14px, weight 400, colore bianco
- Logo "HO COLLECTION / INSPIRED HOTELS" centrato nell'header, bianco

**Hero section (sotto header):**
- Sfondo: `rgb(240, 239, 233)` = `#F0EFE9` (avorio)
- Tagline (es. "YOUR BUSINESS DESTINATION"): SOPRA il nome hotel, Brooklyn (fallback: Inter), 12px, uppercase, letter-spacing 1px, colore `rgba(51,51,51,0.5)` (grigio sfumato 50%)
- Nome hotel (es. "The Nicolaus Hotel"): SOTTO la tagline, Wulkan Display (fallback: Playfair Display), **50px**, weight 500, colore `#964733` (terracotta), line-height 1.5
- Descrizione: Cardo, 16px, weight 400, line-height 27px, colore `#333`, text-align center
- Bottoni CTA: Brooklyn SemiBold (fallback: Inter 600), 12.6px, uppercase, letter-spacing 1px, sfondo `#964733`, colore bianco, padding 10px 52px 16px, **border-radius 0** (squadrati, NIENTE arrotondamento)

### Logo ModusHO

Il sistema usa il logo ModusHO (simbolo HO Collection con check di governance al centro).

**File disponibili in `public/`:**
- `modusho-logo-final.svg` — logo verticale completo: simbolo + "MODUSHO" + "GOVERNANCE OPERATIVA"
- `modusho-simbolo.svg` — solo simbolo (cerchio HO + check). Per header, favicon.

**File originali HO Collection (per contesti dove serve il brand madre):**
- `images/ho-logo-verticale.png` — logo verticale HO Collection
- `images/ho-logo-orizzontale.png` — logo orizzontale HO Collection
- `images/ho-simbolo.png` — solo simbolo HO Collection

**Nota**: loghi in nero su trasparente. Su sfondi scuri usare CSS `filter: brightness(0) invert(1)`.

**Gerarchia di brand:**
- **ModusHO** = brand del software, logo principale nell'app
- **HO Collection** = brand madre, presente nell'header come riferimento

**Dove usare cosa:**

| Contesto | File | Dettagli |
|----------|------|----------|
| Header operatore (barra terracotta) | `modusho-simbolo.svg` + testo "MODUSHO" | Bianco (filter invert), simbolo 28px, testo Inter 14px uppercase letter-spacing 3px. A sinistra. |
| Home operatore (hero, SOPRA barra ricerca) | Nessun logo grande | Al posto del logo: tagline piccola + nome hotel grande (come sito HO) |
| Login | `modusho-logo-final.svg` | Centrato, max-width 280px |
| Header HOO (a sinistra, accanto a "HO COLLECTION") | Nessun logo separato | Il testo "HO COLLECTION" funge da identità brand nella header terracotta |
| Favicon | `modusho-simbolo.svg` | Ridotto a 32×32 |
| Report PDF export | `modusho-logo-final.svg` | In header del documento |

### Layout home operatore — RICALCA hocollection.com/hotels/[hotel]

La home operatore deve avere ESATTAMENTE questa struttura.

**Hero (sfondo #FAF9F5):**
- Tagline SOPRA: Inter 12px, uppercase, letter-spacing 1px, colore rgba(51,51,51,0.5)
- Nome hotel SOTTO: Playfair Display 50px, weight 500, colore #964733
- Barra ricerca: bordo 1px #E8E5DC, sfondo bianco, border-radius 0, bottone "Cerca" terracotta

**Gerarchia sezioni (dall'alto verso il basso):**

1. **Da prendere visione (N)** — rendering condizionale: scompare se zero elementi
   - Lista verticale con righe orizzontali
   - Ogni riga: pallino terracotta + badge tipo (SOP/Documento/Memo) + titolo + meta (codice, reparto, data) + bottone "Leggi"
   - Counter badge rosso nel titolo sezione

2. **In evidenza** — rendering condizionale: scompare se zero contenuti con isFeatured=true
   - Stessa identica grafica di "Da prendere visione" (lista verticale, righe orizzontali)
   - Ogni riga: pallino terracotta + badge tipo + titolo + meta + bottone "Leggi"
   - NO counter badge nel titolo

3. **Stat box linkate** — sempre visibili, 3 box orizzontali
   - SOP del reparto → link a /sop
   - Documenti → link a /documents
   - Memo attivi → link a /memo (nota: nella vista HM/Admin c'è anche "In attesa di approvazione")
   - Numero grande (font-heading terracotta) + label sotto (font-ui uppercase)

4. **Ultime 3 per categoria** — sempre visibili, 3 colonne affiancate
   - "Ultime SOP" / "Ultimi Documenti" / "Ultimi Memo"
   - Header con titolo + link "Vedi tutte/tutti"
   - Ogni colonna mostra gli ultimi 3 contenuti PUBLISHED
   - Uguale per TUTTI i ruoli

**Regole precise:**
1. Tagline SOPRA il nome hotel — MAI sotto
2. Sfondo hero: `#FAF9F5`, sfondo pagina: `#F0EFE9`
3. Spaziatura generosa: almeno 30px sopra la tagline, 15px tra tagline e nome, 40px tra nome e barra ricerca
4. Tutto centrato orizzontalmente nel hero
5. Sezioni "Da prendere visione" e "In evidenza" scompaiono dal DOM se vuote (return null)
6. Le stat box nella vista HM/Admin/Super Admin includono anche "In attesa di approvazione" (arancione)


### Palette colori

**Primario**
- Terracotta/Marsala: `#964733` — colore brand, bottoni CTA, header attivo, link hover, accenti primari
- Terracotta chiaro: `#B8614A` — hover su bottoni primari

**Accenti**
- Verde salvia scuro: `#4E564F` — navigazione, sfondi secondari
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

- **Bottoni primari**: sfondo `#964733`, testo bianco, **border-radius 0** (squadrati, come sul sito HO), padding 10px 52px 16px, font Inter 600 12.6px uppercase letter-spacing 1px, nessuna ombra
- **Bottoni secondari**: sfondo trasparente, bordo 1px `#964733`, testo `#964733`
- **Card**: sfondo `#F0EFE9`, bordo 1px `#E8E5DC`, border-radius 8px, nessuna box-shadow
- **Header (tutti i ruoli)**: sfondo `#964733`, testo bianco, altezza `56px` (`h-14`), logo + nav sulla STESSA riga (no seconda riga separata). Voci visibili in base a `minRole` (vedi sezione Header HOO)
- **Sub-nav (HOD+)**: sfondo `#FAF9F5`, border-bottom 1px `#E8E5DC`, Inter 13px weight 500. Voci visibili in base a `minRole`. NON visibile per OPERATOR.
- **NON esiste sidebar** — il layout usa header + sub-nav orizzontali per tutti i ruoli
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

## Visibilità autore e destinatari sulla SOP

Ogni SOP deve mostrare CHIARAMENTE due informazioni:

### 1. Chi l'ha creata / inviata

- **Nella card/lista SOP**: "Creata da: [Nome HOD]" — visibile sotto il titolo
- **Nel dettaglio SOP**: sezione con nome, ruolo e reparto dell'autore
- **Nella coda approvazioni HOO**: colonna "Inviata da" con nome dell'HOD
- Il campo `createdById` identifica l'autore originale
- Il campo `submittedById` identifica chi l'ha inviata per approvazione (normalmente coincide con createdBy, ma può differire se un ADMIN invia una bozza di un HOD)
- In caso di SOP restituita e re-inviata, `submittedById` si aggiorna all'ultimo che ha inviato

### 2. A chi è rivolta (destinatari)

Ogni SOP ha uno o più destinatari definiti nel modello `ContentTarget`:

- **Per uno o più reparti** (caso più comune): una SOP può essere rivolta a uno, due o più reparti specifici. Per ogni reparto destinatario viene creato un record `ContentTarget` di tipo DEPARTMENT. Esempio: una procedura antincendio rivolta a Front Office + Manutenzione genera 2 record ContentTarget.
- **Per tutti i reparti** (trasversale): se nella UI si seleziona "Tutti i reparti", viene creato un record ContentTarget di tipo ROLE con `targetRole = OPERATOR` (senza specificare departmentId). Tutti gli operatori della property vedono la SOP.
- **Per ruolo**: targeting per ruolo specifico (es. tutti gli HOD della property)
- **Per utente specifico**: targeting individuale (raro, per casi eccezionali)

**Nella UI:**
- **Card/lista SOP**: "Rivolta a: Front Office, Manutenzione" oppure "Rivolta a: Tutti i reparti"
- **Dettaglio SOP**: lista completa dei destinatari con stato presa visione (chi ha letto, chi no)
- **Coda approvazioni**: colonna "Destinatari" con indicazione sintetica
- **Dashboard KPI**: % presa visione calcolata sul numero di destinatari che hanno confermato

### Regole di targeting

1. Quando un **HOD** crea una SOP: il target di default è DEPARTMENT = suo reparto. Non può selezionare altri reparti (crea solo per il proprio).
2. Quando un **HM** crea una SOP: può selezionare uno o più reparti della propria struttura (multi-select con checkbox). Può anche selezionare "Tutti i reparti".
3. Quando un **ADMIN/SUPER_ADMIN** crea una SOP: multi-select libero su tutti i reparti della property selezionata + opzione "Tutti i reparti".
4. I destinatari vengono definiti in fase di creazione e possono essere modificati fino alla pubblicazione.
5. Dopo la pubblicazione, i destinatari sono FISSI — il sistema genera automaticamente i ContentAcknowledgment obbligatori per tutti i destinatari.
6. Il modello dati NON cambia: `ContentTarget` supporta già target multipli (relazione uno-a-molti con Content). La modifica è nella UI del form di creazione/modifica.

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
ModusHO/
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
│   │   │   ├── dashboard/    # home HOO (hero, stats, in evidenza, 3 colonne — vedi sezione dedicata)
│   │   │   ├── analytics/    # KPI avanzati, monitoraggio, confronto hotel/reparti
│   │   │   ├── approvals/    # approvazione SOP
│   │   │   ├── properties/   # gestione strutture
│   │   │   ├── users/        # gestione utenti
│   │   │   └── reports/      # report per MD
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   ├── content/
│   │   │   │   ├── route.ts           # CRUD contenuti (POST con publishDirectly, routing per ruolo)
│   │   │   │   ├── [id]/route.ts      # GET/PUT/DELETE singolo contenuto
│   │   │   │   ├── [id]/revisions/    # GET cronologia revisioni (ContentRevision)
│   │   │   │   ├── [id]/notes/        # GET/POST note sul contenuto (ContentNote)
│   │   │   │   ├── [id]/feature/      # POST/DELETE toggle isFeatured
│   │   │   │   └── submit-actions/    # GET azioni disponibili per ruolo corrente
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
│   │   ├── search.ts         # logica ricerca
│   │   ├── content-workflow.ts # routing invio per ruolo (getSubmitTargetStatus, getAvailableSubmitActions)
│   │   └── text-diff.ts      # algoritmo diff paragrafo per revisioni tracciate
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
9. **Brand Book e Standard Book** sono contenuti testuali (tipo BRAND_BOOK / STANDARD_BOOK), gestiti con titolo + corpo rich text, creabili e modificabili da ADMIN e SUPER_ADMIN. NON fanno parte del workflow di approvazione. Non hanno stati multipli.
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
- **HOTEL_MANAGER**: può creare, modificare e revisionare. Può modificare SOP durante REVIEW_HM. Se l'account ha `canApprove = sì` (decisione discrezionale dell'HOO sul singolo utente), può anche pubblicare direttamente le SOP delle property a cui è assegnato. Senza il flag canApprove, può solo promuovere le SOP allo step successivo del workflow ma non pubblicarle.
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
16. Brand Book / Standard Book (contenuti testuali con editor rich text)
17. Ottimizzazione e performance

## Properties di riferimento (seed data)

| Code | Nome | Tagline | Città | Sito web |
|------|------|---------|-------|----------|
| NCL | The Nicolaus Hotel | Your business destination | Bari | thenicolaushotel.com |
| HIB | Hi Hotel Bari | Welcome modern travellers | Bari | hihotelbari.com |
| PPL | Patria Palace Hotel | Your main door to Salento | Lecce | patriapalace.com |
| TCV | I Turchesi Club Village | The Summer place to be | Castellaneta Marina | iturchesi.com |
| DEL | Hotel Delfino Taranto | Sea the Difference | Taranto | hoteldelfino.com |
| MRW | Mercure Roma West | No place is like Rome | Roma | mercureromawest.com |

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
   - Card per ogni property con: tagline (piccolo, uppercase, colore sage) + nome hotel (grande, font Playfair Display, colore terracotta), città, numero SOP, stato avanzamento
   - Lo stile delle card riprende il layout del sito hocollection.com: tagline sopra in piccolo, nome hotel grande sotto
   - NON mostrare il logo HO Collection verticale nelle card — ogni struttura mostra il proprio nome come identità visiva
   - Pulsante "Aggiungi struttura"

2. **Dettaglio struttura**: src/app/(hoo)/properties/[id]/page.tsx
   - Info generali (nome, codice, città, indirizzo, descrizione, sito web)
   - Logo della struttura (visualizzazione + cambio)
   - Lista reparti configurati (aggiungi/rimuovi/modifica)
   - KPI della struttura (SOP totali, pubblicate, % presa visione)
   - Lista operatori assegnati

3. **Crea nuova struttura**: src/app/(hoo)/properties/new/page.tsx
   - Form: nome, codice, tagline, città, indirizzo, descrizione, sito web
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
