# Prompt per Claude Code — ModusHO
## Import Bulk SOP da Word (.docx)

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Permettere l’importazione massiva di SOP scritte in file Word (`.docx`) nel sistema.

Il flusso deve essere questo:

1. il team scrive le procedure in Word usando un template standard
2. prepara un file Excel (`.xlsx`) come manifest che mappa ogni file a struttura e reparto
3. un utente `ADMIN` / `SUPER_ADMIN` carica manifest + file `.docx`
4. il sistema crea automaticamente le SOP nel workflow

Questa task copre:

- definizione del template Word standard per le SOP
- definizione del formato manifest Excel
- endpoint API di importazione bulk
- pagina UI per upload manifest + file
- link di accesso alla funzione dalla pagina SOP

Prerequisiti:
- sistema allegati/upload già presente
- workflow SOP già funzionante
- logica di creazione SOP/workflow già disponibile nel progetto

---

## DECISIONI ARCHITETTURALI DEFINITIVE

### 1. Conversione DOCX → HTML con mammoth
Usare `mammoth.js` per la conversione da `.docx` a HTML.

`mammoth` converte gli stili Word standard in HTML semantico, coerente con il formato già usato nel campo `body` delle SOP:

- Heading 2 → `<h2>`
- Heading 3 → `<h3>`
- Paragrafo → `<p>`
- Elenco puntato → `<ul><li>`
- Elenco numerato → `<ol><li>`
- Grassetto → `<strong>`
- Corsivo → `<em>`

### 2. Stato iniziale delle SOP importate
Le SOP importate devono entrare nello **stato iniziale coerente con il modello attuale del workflow SOP**.

Non usare naming legacy in modo incoerente.

La SOP importata:
- non viene pubblicata
- non bypassa il workflow
- entra nel flusso normale come nuova bozza/workflow iniziale del sistema

### 3. Import server-side
L’import è server-side.

I file `.docx`:
- vengono inviati alla route di import
- vengono processati in memoria / lato server
- **non devono essere conservati** come allegati o file originali nel bucket

Solo l’HTML risultante viene salvato nel campo `body`.

### 4. Ruoli autorizzati
Solo:
- `ADMIN`
- `SUPER_ADMIN`

possono eseguire l’import bulk SOP.

### 5. Manifest in Excel
Il manifest deve essere un file `.xlsx`.

Non usare:
- CSV
- JSON

Excel è la scelta corretta per uso interno.

### 6. Reuso della logica di dominio esistente
La route di import **non deve duplicare a mano** la logica di creazione SOP/workflow/versione se nel progetto esiste già una funzione o servizio di dominio riusabile.

L’import bulk deve riusare, per quanto possibile, la stessa logica già usata per la creazione normale delle SOP.

### 7. Sanitizzazione HTML
L’HTML prodotto da `mammoth` deve essere sanitizzato con la stessa utility HTML già usata dal progetto per le SOP, se disponibile.

L’import bulk non deve introdurre una pipeline HTML diversa o meno sicura rispetto all’editor SOP.

### 8. Import parziale
L’import è **parziale / best-effort**.

Quindi:
- le righe valide vengono importate
- le righe invalide vengono riportate come errore
- un errore su una riga non blocca tutte le altre

### 9. Warning duplicati
I duplicati potenziali generano **warning**, non errore bloccante.

Quindi:
- la riga viene comunque importata
- il warning viene riportato nel report finale

### 10. Codice SOP
Il manifest **non contiene** il codice SOP.

Il codice SOP è sempre generato dal sistema.

---

# TEMPLATE WORD PER LE SOP

## Struttura del template

Il template Word che il team deve usare ha questa struttura standard di stili:

```text
[Heading 2] Obiettivo
[Paragrafo] Descrizione dell'obiettivo della procedura.

[Heading 2] Procedura
[Elenco numerato]
1. Primo passaggio
2. Secondo passaggio
3. Terzo passaggio

[Heading 2] Responsabilità
[Elenco puntato]
- Ruolo X: descrizione responsabilità
- Ruolo Y: descrizione responsabilità

[Heading 2] Frequenza
[Paragrafo] Giornaliera / Settimanale / Al bisogno / etc.

[Heading 2] Eccezioni e note
[Paragrafo] Eventuali casi particolari.
```

Le sezioni sono indicative.
Il team può:
- aggiungere sezioni
- rimuovere sezioni

Regola obbligatoria:
- usare `Heading 2` per i titoli di sezione
- usare stili Word standard per il resto
- niente colori custom
- niente font speciali
- niente tabelle complesse
- niente impaginazioni avanzate

## File template
Creare un file template scaricabile:

- `public/templates/template-sop.docx`

Il template deve essere generato programmaticamente e poi reso disponibile nel repo finale.

---

# FORMATO MANIFEST EXCEL

## Struttura del manifest

Il manifest è un file `.xlsx` con una sola sheet e queste colonne:

| Colonna | Obbligatoria | Descrizione | Esempio |
|---|---|---|---|
| titolo | Sì | Titolo della SOP | `Check-in ospite VIP` |
| file | Sì | Nome file `.docx` senza path | `checkin-vip.docx` |
| struttura | Sì | Codice property esistente nel sistema | `HO1` |
| reparto | Sì | Codice department esistente nel DB | `FO` |

## Regole di validazione

Per ogni riga:
- il file `.docx` referenziato deve esistere nell’upload
- il codice `struttura` deve corrispondere a una property esistente
- usare i codici property attuali del sistema, non codici legacy
- il codice `reparto` deve corrispondere a un department valido per la struttura indicata
- il titolo non può essere vuoto

## Duplicati
Duplicati potenziali (stesso titolo + struttura + reparto) generano:
- warning
- non errore bloccante

---

# COSA QUESTA TASK DEVE FARE

## FIX 1 — API di import bulk

**File:** `src/app/api/sop-import/route.ts`

Creare un endpoint `POST` che:

### A. Autenticazione / autorizzazione
- verifica sessione
- consente accesso solo a `ADMIN` / `SUPER_ADMIN`

### B. Ricezione multipart form-data
Riceve:
- un file `manifest` (`.xlsx`)
- N file `files` (`.docx`)

Esempio:

```ts
const formData = await request.formData();
const manifest = formData.get("manifest") as File;
const files = formData.getAll("files") as File[];
```

### C. Parsing manifest
Usare `xlsx` / SheetJS per leggere il file Excel.

Estrarre le righe e validare:
- colonne obbligatorie
- coerenza dei valori
- file presenti

### D. Validazione struttura / reparto
Per ogni riga:
- verificare che la property esista
- verificare che il reparto esista per quella property

### E. Conversione DOCX → HTML
Per ogni file `.docx` valido:
- leggere il file come buffer
- convertire con `mammoth.convertToHtml({ buffer })`

### F. Sanitizzazione HTML
Sanitizzare l’HTML prodotto da `mammoth` usando la utility del progetto.

### G. Creazione SOP
Per ogni riga valida:
- creare il contenuto SOP
- creare il workflow associato
- creare la prima text version

**Importante:** riusare la logica di dominio già esistente, se presente, e non duplicarla in modo divergente nella route.

Dati minimi da valorizzare:
- `type: "SOP"`
- titolo dal manifest
- body = HTML convertito e sanitizzato
- propertyId risolto dal codice struttura
- departmentId risolto dal codice reparto
- createdById = utente importatore
- code = generato automaticamente dal sistema

### H. Generazione codice SOP
Il codice deve essere generato dal sistema nel formato previsto dal progetto.

Se nel progetto esiste già una logica di generazione codice, riusarla.

Se va implementata qui, garantire:
- unicità
- coerenza nel batch
- assenza di collisioni intra-batch

### I. Risposta finale
Restituire un report strutturato, per esempio:

```json
{
  "data": {
    "imported": 12,
    "errors": [
      {
        "row": 3,
        "file": "manutenzione.docx",
        "error": "Reparto 'MNT' non trovato per struttura 'HO1'"
      },
      {
        "row": 7,
        "file": "missing.docx",
        "error": "File non trovato nell'upload"
      }
    ],
    "warnings": [
      {
        "row": 5,
        "message": "SOP con titolo simile già esistente: 'Check-in VIP'"
      }
    ]
  }
}
```

---

## FIX 2 — Pagina di import

**File:** `src/app/(hoo)/sop-import/page.tsx`

Pagina accessibile solo ad `ADMIN` / `SUPER_ADMIN`.

### Contenuti della pagina
Deve contenere:

#### 1. Download template
Link a:
- `/templates/template-sop.docx`

#### 2. Upload manifest
Input file che accetta `.xlsx`

Quando il manifest viene caricato:
- leggere lato client il file Excel
- mostrare anteprima tabellare semplice, non editable

#### 3. Upload multiplo file DOCX
Input file multiplo che accetta `.docx`

Mostrare:
- nome file
- dimensione

#### 4. Validazione client-side preliminare
Prima dell’invio:
- verificare che tutti i file referenziati nel manifest siano presenti tra quelli caricati
- segnalare i file mancanti
- mostrare conteggio es.:
  - `12 SOP da importare, 12 file trovati`

#### 5. Import
Bottone:
- `Importa SOP`

Invia tutto al server via `fetch` + `FormData`.

#### 6. Report risultato
Dopo l’import mostrare:
- numero SOP importate
- errori per riga
- warning
- link “Vai alla lista SOP”

## Regole UI
- no overengineering
- basta file input standard
- nessun drag&drop avanzato obbligatorio
- anteprima manifest semplice e leggibile
- usare palette e stili del progetto
- niente `rounded-*`

---

## FIX 3 — Link di accesso dalla pagina SOP

**File:** `src/app/(hoo)/hoo-sop/page.tsx`

Aggiungere un bottone nella pagina lista SOP, visibile solo per `ADMIN+`:

```tsx
{isAdmin && (
  <Link href="/sop-import" className="btn-outline text-xs px-4 py-2">
    Importa SOP
  </Link>
)}
```

Preferire questa soluzione rispetto all’aggiunta nella sub-nav.

---

## FIX 4 — Generazione template Word programmatica

**File:** `scripts/generate-sop-template.ts`

Usare la libreria `docx` per generare il template Word standard.

Pacchetto da installare:
```bash
npm install docx
```

Esecuzione:
```bash
npx ts-node scripts/generate-sop-template.ts
```

Il file finale deve essere salvato in:
- `public/templates/template-sop.docx`

Il file generato deve essere presente nel progetto al termine della task.

## Contenuto del template
Il template deve contenere:
- Heading 2 “Obiettivo” + placeholder
- Heading 2 “Procedura” + elenco numerato placeholder
- Heading 2 “Responsabilità” + elenco puntato placeholder
- Heading 2 “Frequenza” + placeholder
- Heading 2 “Eccezioni e note” + placeholder

Tutti i placeholder devono essere in italiano e spiegare cosa scrivere.

---

# FILE DA CREARE

| File | Descrizione |
|---|---|
| `src/app/api/sop-import/route.ts` | API di import bulk SOP |
| `src/app/(hoo)/sop-import/page.tsx` | Pagina UI per import |
| `scripts/generate-sop-template.ts` | Script generazione template `.docx` |
| `public/templates/template-sop.docx` | Template Word generato |

---

# FILE DA MODIFICARE

| File | Modifica |
|---|---|
| `src/app/(hoo)/hoo-sop/page.tsx` | Aggiungere bottone “Importa SOP” per ADMIN+ |

---

# FILE DA NON TOCCARE

Non toccare:
- `CLAUDE.md`
- schema Prisma
- API esistenti
- componenti editor/viewer SOP
- sistema allegati

---

# DIPENDENZE DA INSTALLARE

```bash
npm install mammoth xlsx docx
```

Verificare prima se `mammoth` è già presente:
```bash
npm ls mammoth
```

---

# COSA QUESTA TASK NON FA

Questa task:
- non modifica il workflow di approvazione
- non importa allegati
- non aggiorna o sovrascrive SOP esistenti
- non importa da Google Docs o altri formati
- non crea mapping tra versioni Word e versioni sistema

---

# VERIFICA ATTESA

## Import base
- upload manifest + 3 file `.docx`
- 3 SOP create correttamente
- stato iniziale coerente col workflow attuale
- HTML corretto nel body

## Errori per riga
- file `.docx` mancante → errore su quella riga
- struttura inesistente → errore su quella riga
- reparto inesistente → errore su quella riga

## Permessi
- utente non `ADMIN` / `SUPER_ADMIN` → 403

## Preview manifest
- anteprima leggibile lato client

## Template
- template scaricabile
- template `.docx` coerente con gli stili richiesti

## Contenuto importato
- SOP aperta nel sistema
- heading, liste e paragrafi corretti
- SOP coerente anche nell’editor workflow

## Codice SOP
- codice generato correttamente dal sistema
- nessuna collisione evidente nel batch

## Build
- `npm run build` passa senza errori

---

# OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file creati
2. file modificati
3. come hai implementato l’API di import
4. come hai gestito parsing manifest e validazione righe
5. come hai convertito e sanitizzato DOCX → HTML
6. come hai riusato la logica di creazione SOP/workflow esistente
7. come hai gestito i warning duplicati
8. come hai generato il template `.docx`
9. conferma che i file originali `.docx` non vengono persistiti
10. esito typecheck
11. esito build
