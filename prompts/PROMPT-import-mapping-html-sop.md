# Prompt per Claude Code — ModusHO
## Import Mapping: 77 SOP pre-convertite da HTML

Lavora sul progetto già esistente di **ModusHO**.

---

## CONTESTO

Le 77 SOP del Patria Palace Hotel sono state convertite da Word a **HTML strutturato** e sono pronte per l'importazione.

I file si trovano in:
- `DomusGO/SOP_IMPORT/` — 77 file `.html` + `_manifest.json` + `_manifest.xlsx`

La conversione è già avvenuta con un processo custom che ha:
- rimosso le tabelle di intestazione (DA / A / P.C. / OGGETTO / DATA)
- rimosso l'header "PROCEDURE"
- convertito i testi ALL CAPS in `<h2>`
- convertito gli elenchi numerati in `<ol><li>`
- convertito gli elenchi con trattini in `<ul><li>`
- convertito il testo normale in `<p>`

Questa conversione **non può essere replicata da mammoth.js** perché i file Word originali usano solo lo stile "Normal" senza heading Word. Mammoth produrrebbe solo `<p>` piatti.

---

## MAPPING CODICI

### Property (struttura)

| Codice nei file SOP | Codice nel sistema (DB) | Struttura |
|---|---|---|
| `PAT` | `PPL` | Patria Palace Hotel, Lecce |

Il manifest e i nomi file usano `PAT`. Il sistema usa `PPL`.

### Reparti (department)

I codici reparto sono **già allineati** e non richiedono mapping:

| Codice | Nome | SOP |
|---|---|---|
| `FO` | Front Office | 18 |
| `RM` | Room Division | 12 |
| `FB` | F&B | 17 |
| `SP` | Spa & Esperienze | 13 |
| `QA` | Back of House | 17 |

Totale: **77 SOP**

---

## OBIETTIVO

Modificare la route di import `src/app/api/sop-import/route.ts` per supportare una **modalità di import da HTML pre-convertito**, in aggiunta alla modalità DOCX esistente.

La pagina UI `src/app/(hoo)/sop-import/page.tsx` deve essere aggiornata di conseguenza.

---

## DECISIONI ARCHITETTURALI

### 1. Due modalità di import nella stessa route
La route `POST /api/sop-import` deve supportare due modalità:

- **Modalità DOCX** (esistente): manifest + file `.docx` → mammoth → HTML
- **Modalità HTML** (nuova): manifest + file `.html` → HTML diretto (no mammoth)

La modalità viene determinata automaticamente dall'estensione dei file caricati:
- se i file sono `.docx` → modalità DOCX (flusso esistente, invariato)
- se i file sono `.html` → modalità HTML (nuovo flusso)
- se mix di estensioni → errore

### 2. In modalità HTML
- il file `.html` viene letto come testo UTF-8
- il contenuto viene sanitizzato con la stessa `sanitizeHtml()` già usata
- **non viene usato mammoth**
- tutto il resto del flusso è identico (validazione manifest, RACI, creazione SOP/workflow/version)

### 3. Formato manifest per import HTML
Il manifest Excel deve avere le stesse colonne della modalità DOCX:

| Colonna | Obbligatoria | Descrizione |
|---|---|---|
| `titolo` | Sì | Titolo della SOP |
| `file` | Sì | Nome file `.html` (non `.docx`) |
| `struttura` | Sì | Codice property **del sistema** (`PPL`, non `PAT`) |
| `reparto` | Sì | Codice department (`FO`, `RM`, `FB`, `SP`, `QA`) |

### 4. Mapping property nel manifest
Il manifest che verrà caricato deve usare i **codici del sistema**, non i codici dei file.

Quindi: `struttura` = `PPL` (non `PAT`).

Questo è responsabilità dell'operatore che prepara il manifest (o dello script che lo genera).

### 5. Nessuna modifica allo schema Prisma
Nessuna modifica a `schema.prisma`.

### 6. Retrocompatibilità
La modalità DOCX esistente **non deve essere toccata**. Il flusso attuale deve continuare a funzionare identicamente.

---

## COSA QUESTA TASK DEVE FARE

### FIX 1 — Aggiornamento route di import

**File:** `src/app/api/sop-import/route.ts`

Modificare la route per:

#### A. Rilevare la modalità di import
Dopo aver estratto i file dal FormData, determinare l'estensione:

```ts
const extensions = new Set(uploadedFiles.map(f => {
  const ext = f.name.split('.').pop()?.toLowerCase();
  return ext;
}));

if (extensions.size > 1) {
  return NextResponse.json({ error: "Tutti i file devono avere la stessa estensione (.docx o .html)" }, { status: 400 });
}

const importMode = extensions.has("html") ? "html" : "docx";
```

#### B. Conversione condizionale
Nel loop di processamento righe, sostituire il blocco conversione DOCX con:

```ts
let htmlBody: string;
try {
  const fileBuffer = Buffer.from(await file.arrayBuffer());

  if (importMode === "html") {
    // Modalità HTML: leggi direttamente come testo
    htmlBody = sanitizeHtml(fileBuffer.toString("utf-8"));
  } else {
    // Modalità DOCX: converti con mammoth
    const result = await mammoth.convertToHtml({ buffer: fileBuffer });
    htmlBody = sanitizeHtml(result.value);
  }
} catch (err) {
  errors.push({ row: rowNum, file: fileName, error: `Errore lettura file: ${err instanceof Error ? err.message : String(err)}` });
  continue;
}
```

#### C. Validazione estensione nel manifest
Verificare che il nome file nel manifest corrisponda alla modalità:
- modalità HTML → il campo `file` deve terminare con `.html`
- modalità DOCX → il campo `file` deve terminare con `.docx`

Se non corrisponde, errore su quella riga.

### FIX 2 — Aggiornamento pagina UI

**File:** `src/app/(hoo)/sop-import/page.tsx`

Modificare la sezione upload file per:

#### A. Accettare sia `.docx` che `.html`
L'input file deve accettare entrambe le estensioni:

```tsx
<input type="file" multiple accept=".docx,.html" />
```

#### B. Indicare la modalità rilevata
Dopo il caricamento dei file, mostrare un badge che indica la modalità:

```
Modalità: DOCX (conversione automatica)
```
oppure
```
Modalità: HTML (import diretto)
```

#### C. Warning se mix di estensioni
Se l'utente carica un mix di `.docx` e `.html`, mostrare un errore prima dell'invio:

```
Errore: tutti i file devono avere la stessa estensione (.docx o .html)
```

### FIX 3 — Script di generazione manifest pronto all'uso

**File:** `scripts/generate-import-manifest.ts`

Creare uno script Node.js che:
1. legge `DomusGO/SOP_IMPORT/_manifest.json`
2. genera un file `_import_manifest.xlsx` con le **colonne esatte** attese dall'API
3. applica il mapping property: `PAT` → `PPL`
4. usa i file `.html` (non `.docx`) nella colonna `file`

Output:
- `DomusGO/SOP_IMPORT/_import_manifest.xlsx`

Struttura dell'Excel generato:

| titolo | file | struttura | reparto |
|---|---|---|---|
| Prenotazione e pre-arrival | PAT-FO-001 - Prenotazione e pre-arrival.html | PPL | FO |
| Transfer e accoglienza al pick-up | PAT-FO-002 - Transfer e accoglienza al pick-up.html | PPL | FO |
| ... | ... | ... | ... |

Lo script deve:
- leggere il JSON manifest
- mappare `struttura`: `PAT` → `PPL`
- usare `file_html` come colonna `file`
- usare `titolo` come colonna `titolo`
- usare `reparto` direttamente (già allineato)
- salvare in formato `.xlsx` con intestazione nella prima riga

### FIX 4 — Generazione immediata del manifest di import

Oltre allo script, **genera direttamente** il file `_import_manifest.xlsx` nella cartella `SOP_IMPORT/` così che sia pronto all'uso senza dover eseguire lo script.

---

## MAPPING TABLE DI RIFERIMENTO

Per future importazioni di altre strutture, questa è la tabella completa dei codici property nel sistema:

| Struttura | Codice sistema |
|---|---|
| The Nicolaus Hotel | `NCL` |
| Hi Hotel Bari | `HIB` |
| Patria Palace Hotel | `PPL` |
| I Turchesi Club Village | `TCM` |
| Hotel Delfino | `DHT` |
| Mercure Roma West | `MRW` |

---

## FILE DA MODIFICARE

| File | Modifica |
|---|---|
| `src/app/api/sop-import/route.ts` | Aggiungere modalità HTML import |
| `src/app/(hoo)/sop-import/page.tsx` | Accettare `.html`, mostrare modalità |

## FILE DA CREARE

| File | Descrizione |
|---|---|
| `scripts/generate-import-manifest.ts` | Script generazione manifest con mapping |
| `DomusGO/SOP_IMPORT/_import_manifest.xlsx` | Manifest pronto all'uso per import 77 SOP |

## FILE DA NON TOCCARE

- `CLAUDE.md`
- `prisma/schema.prisma`
- `src/app/api/sop-workflow/route.ts`
- tutti i file in `SOP_IMPORT/*.html` (già convertiti)
- `SOP_IMPORT/_manifest.json` e `SOP_IMPORT/_manifest.xlsx` (archivio originale)
- componenti editor/viewer SOP

---

## VERIFICA ATTESA

### Import HTML
- upload `_import_manifest.xlsx` + 77 file `.html`
- 77 SOP create con status DRAFT e workflow IN_LAVORAZIONE
- HTML nel body corretto e strutturato (h2, ol, ul, p)
- propertyId corretto (Patria Palace / PPL)
- departmentId corretto per ogni reparto

### Retrocompatibilità DOCX
- l'import DOCX esistente continua a funzionare
- nessuna regressione

### Validazione
- file mix `.docx` + `.html` → errore
- manifest con `struttura` inesistente → errore per riga
- file mancante → errore per riga

### Build
- `npm run build` passa senza errori

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file creati
2. file modificati
3. come hai implementato la modalità HTML
4. come hai gestito il mapping property
5. conferma retrocompatibilità modalità DOCX
6. manifest generato e verificato
7. esito typecheck
8. esito build
