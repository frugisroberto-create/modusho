# ISTRUZIONI PER LA SCRITTURA DI SOP — ModusHO

Queste istruzioni descrivono le specifiche tecniche per scrivere procedure operative standard (SOP) destinate all'importazione nel software **ModusHO**.

Ogni SOP viene scritta come file HTML e importata tramite un manifest Excel che la assegna a una struttura alberghiera e a un reparto.

---

## 1. FILE HTML — SPECIFICHE TECNICHE

Ogni SOP è un singolo file `.html` contenente **solo il body HTML** della procedura — nessun wrapper `<html>`, `<head>`, `<body>`.

### Tag consentiti

| Tag | Uso |
|---|---|
| `<h2>` | Titoli di sezione principale |
| `<h3>` | Sottosezioni all'interno di una sezione |
| `<p>` | Paragrafi di testo |
| `<ol><li>` | Liste numerate (passaggi procedurali) |
| `<ul><li>` | Liste puntate (responsabilità, note, elenchi) |
| `<strong>` | Grassetto (ruoli, termini chiave) |
| `<em>` | Corsivo (citazioni, riferimenti) |

**Nessun altro tag è ammesso.** Niente `<div>`, `<span>`, `<table>`, `<br>`, attributi `style`, classi CSS, commenti HTML.

### Struttura standard del contenuto

Ogni file HTML deve seguire questa struttura di sezioni:

```html
<h2>Obiettivo</h2>
<p>Descrizione sintetica dello scopo della procedura.</p>

<h2>Procedura</h2>
<ol>
  <li>Primo passaggio operativo.</li>
  <li>Secondo passaggio operativo.</li>
  <li>Terzo passaggio operativo.</li>
</ol>

<h2>Responsabilità</h2>
<ul>
  <li><strong>Ruolo X:</strong> descrizione responsabilità.</li>
  <li><strong>Ruolo Y:</strong> descrizione responsabilità.</li>
</ul>

<h2>Standard e note</h2>
<p>Standard di qualità, note operative, riferimenti brand.</p>
```

### Dettaglio sezioni

**Obiettivo** — OBBLIGATORIO
- Un paragrafo `<p>` che spiega lo scopo della procedura
- Tono professionale, diretto, operativo
- Una o due frasi

**Procedura** — OBBLIGATORIO
- Lista numerata `<ol><li>` con i passaggi operativi
- Ogni `<li>` è un'azione concreta e verificabile
- Le azioni sono scritte all'imperativo: "Verificare…", "Comunicare…", "Assicurarsi che…"
- Se la procedura ha fasi distinte (es. preparazione, esecuzione, chiusura), usare `<h3>` per le sottosezioni:

```html
<h2>Procedura</h2>
<h3>Preparazione</h3>
<ol>
  <li>...</li>
</ol>
<h3>Esecuzione</h3>
<ol>
  <li>...</li>
</ol>
```

**Responsabilità** — FACOLTATIVO
- Lista puntata `<ul><li>` con ruoli e responsabilità
- Formato: `<strong>Ruolo:</strong> descrizione`
- Inserire solo se pertinente alla procedura

**Standard e note** — FACOLTATIVO
- Standard qualitativi, riferimenti a certificazioni o brand, note particolari
- Omettere la sezione se non c'è nulla di rilevante

---

## 2. NAMING DEI FILE

I file devono seguire questa convenzione:

```
{CODICE_STRUTTURA}-{CODICE_REPARTO}-{NUMERO} - {Titolo}.html
```

Esempio:
```
PPL-FO-001 - Check-in e registrazione.html
NCL-FB-003 - Gestione buffet colazione.html
HIB-RM-002 - Housekeeping departure.html
```

Regole:
- Il numero è a 3 cifre con zero-padding (001, 002, ..., 099, 100)
- Il titolo nel nome file corrisponde al titolo nel manifest
- Nessun carattere speciale nel titolo (no `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`)

---

## 3. STRUTTURE ALBERGHIERE (PROPERTY)

Ogni SOP appartiene a una struttura alberghiera identificata da un codice.

I codici delle strutture nel sistema ModusHO sono:

| Codice | Struttura | Città |
|---|---|---|
| `NCL` | The Nicolaus Hotel | Bari |
| `HIB` | Hi Hotel Bari | Bari |
| `PPL` | Patria Palace Hotel | Lecce |
| `TCM` | I Turchesi Club Village | Castellaneta Marina |
| `DHT` | Hotel Delfino | Taranto |
| `MRW` | Mercure Roma West | Roma |

**Usa sempre il codice esatto della tabella.** Il codice è case-insensitive nell'API ma per coerenza usa sempre maiuscolo.

---

## 4. REPARTI (DEPARTMENT)

Ogni SOP è assegnata a un reparto. I codici reparto sono gli stessi per tutte le strutture:

| Codice | Nome reparto |
|---|---|
| `FO` | Front Office |
| `RM` | Room Division |
| `FB` | Food & Beverage |
| `MT` | Maintenance |
| `SP` | SPA / Esperienze |
| `QA` | Back of House |

L'assegnazione al reparto determina:
- chi può vedere la SOP
- chi viene assegnato come responsabile (R) nel workflow
- a quale audience viene targetizzata la SOP dopo l'importazione

**La SOP viene assegnata al reparto che è il principale destinatario operativo**, non al reparto che l'ha scritta. Se una procedura riguarda il Front Office, il reparto è `FO` anche se è scritta dal COO.

---

## 5. MANIFEST EXCEL

Il manifest è il file che mappa ogni SOP alla sua struttura e reparto. È un file `.xlsx` con una sola sheet e queste colonne esatte:

| Colonna | Obbligatoria | Descrizione |
|---|---|---|
| `titolo` | Sì | Titolo della SOP (corrisponde al titolo nel nome file) |
| `file` | Sì | Nome del file `.html` (solo il nome, senza percorso cartella) |
| `struttura` | Sì | Codice property del sistema (es. `PPL`, `NCL`) |
| `reparto` | Sì | Codice department (es. `FO`, `RM`, `FB`) |

Esempio:

| titolo | file | struttura | reparto |
|---|---|---|---|
| Check-in e registrazione | PPL-FO-001 - Check-in e registrazione.html | PPL | FO |
| Gestione buffet colazione | PPL-FB-003 - Gestione buffet colazione.html | PPL | FB |
| Housekeeping departure | NCL-RM-004 - Housekeeping departure.html | NCL | RM |

Regole:
- I nomi delle colonne devono essere esattamente `titolo`, `file`, `struttura`, `reparto` (minuscolo)
- Il nome file nella colonna `file` deve corrispondere esattamente al file fisico
- Ogni file referenziato nel manifest deve esistere tra i file caricati
- Il codice struttura deve esistere nel sistema
- Il codice reparto deve esistere per quella struttura

---

## 6. ORGANIZZAZIONE CARTELLA

La cartella di output deve avere questa struttura:

```
{NOME_CARTELLA}/
├── FO/
│   ├── {STRUTTURA}-FO-001 - Titolo.html
│   └── ...
├── RM/
│   └── ...
├── FB/
│   └── ...
├── SP/
│   └── ...
├── QA/
│   └── ...
├── MT/
│   └── ...
└── manifest.xlsx
```

Le sottocartelle per reparto servono per l'organizzazione locale. Al momento dell'upload nel software, i file vengono caricati come lista piatta (il sistema usa solo il nome file, non il percorso).

Se un reparto non ha SOP, la sottocartella non va creata.

---

## 7. COSA SUCCEDE DOPO L'IMPORTAZIONE

Quando i file e il manifest vengono caricati nel software:

1. Il sistema legge il manifest Excel
2. Per ogni riga, cerca il file HTML corrispondente
3. L'HTML viene sanitizzato (i tag non consentiti vengono rimossi)
4. Viene creata una SOP in stato **DRAFT** (bozza)
5. Viene creato un workflow SOP in stato **IN_LAVORAZIONE**
6. Il codice SOP viene generato automaticamente dal sistema (non va indicato nel manifest)
7. La SOP entra nel flusso di approvazione normale (R → C → A)

Le SOP importate **non vengono pubblicate automaticamente**. Passano dal workflow di approvazione come qualsiasi SOP creata manualmente.

---

## 8. REGOLE DI SCRITTURA

### Linguaggio
- Italiano come lingua predefinita
- Imperativo per le azioni procedurali
- Tono professionale e operativo
- Frasi concise e verificabili
- Evitare generalizzazioni vaghe ("fare attenzione", "essere cortesi") — preferire azioni specifiche ("salutare l'ospite per nome", "verificare il profilo nel PMS")

### Contenuto
- Ogni passaggio procedurale deve essere un'azione che un operatore può eseguire e un supervisore può verificare
- I tempi e le soglie devono essere espressi in numeri quando possibile ("entro 3 minuti", "massimo 5 minuti", "almeno 2 ore prima")
- I riferimenti a sistemi o strumenti specifici dell'hotel vanno mantenuti (PMS, POS, etc.)

### Cosa evitare
- Non mescolare istruzioni operative con frasi di brand o filosofia — separarle nella sezione "Standard e note"
- Non inserire tabelle di metadati (DA, A, P.C., DATA) — queste informazioni vanno nel manifest
- Non inserire header tipo "PROCEDURE" o il titolo della SOP nel body — il titolo è nel manifest
- Non usare ALL CAPS per i sottotitoli — usare `<h3>`

---

## 9. CHECKLIST FINALE

Prima di considerare il lavoro completato, verificare:

- [ ] Ogni file HTML contiene solo tag consentiti
- [ ] Ogni file ha almeno le sezioni Obiettivo e Procedura
- [ ] I nomi file seguono la convenzione `{STRUTTURA}-{REPARTO}-{NUM} - {Titolo}.html`
- [ ] Il manifest ha esattamente le colonne `titolo`, `file`, `struttura`, `reparto`
- [ ] Ogni file nel manifest esiste fisicamente nella cartella
- [ ] I codici struttura corrispondono alla tabella delle property
- [ ] I codici reparto corrispondono alla tabella dei department
- [ ] Il numero totale di righe nel manifest corrisponde al numero di file HTML
