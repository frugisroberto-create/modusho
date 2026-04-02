# Prompt per Claude Code — ModusHO
## Riscrittura e riorganizzazione SOP per import diretto

Lavora sul progetto già esistente di **ModusHO**.

---

## CONTESTO

Le 77 SOP del Patria Palace Hotel sono state estratte da file Word e convertite in HTML grezzo.
I file si trovano in `DomusGO/SOP_IMPORT/` e contengono HTML funzionale ma **non strutturato**:
- la maggior parte è solo `<ol><li>` piatti senza titoli di sezione
- alcuni hanno `<h2>` derivati da ALL CAPS ma senza logica coerente
- mancano sezioni standard (Obiettivo, Procedura, Responsabilità, etc.)
- il tono è misto: alcune SOP sono operative, altre narrative

L'obiettivo è **riscrivere e riorganizzare** tutte le 77 SOP in una **nuova cartella** producendo file HTML pronti per l'importazione diretta tramite l'API `POST /api/sop-import` in modalità HTML.

---

## CARTELLA DI LAVORO

### Input
- `DomusGO/SOP_IMPORT/*.html` — 77 file HTML grezzi (sorgente, da non modificare)
- `DomusGO/SOP_IMPORT/_manifest.json` — metadati originali
- `DomusGO/SOP_OUTPUT/` — file Word originali (consultabili per contesto)

### Output
- **`DomusGO/SOP_READY/`** — nuova cartella con i file riscritti

Contenuto atteso della cartella:

```
DomusGO/SOP_READY/
├── FO/
│   ├── PPL-FO-001 - Prenotazione e pre-arrival.html
│   ├── PPL-FO-002 - Transfer e accoglienza al pick-up.html
│   └── ...
├── RM/
│   ├── PPL-RM-001 - Pulizia camera standard.html
│   └── ...
├── FB/
│   ├── PPL-FB-001 - Colazione accoglienza e seating.html
│   └── ...
├── SP/
│   ├── PPL-SP-001 - Gestione prenotazioni SPA.html
│   └── ...
├── QA/
│   ├── PPL-QA-001 - Passaggi di consegna tra reparti.html
│   └── ...
└── manifest.xlsx
```

---

## REGOLE DI RINOMINA FILE

### Codice property
Sostituire `PAT` con `PPL` nei nomi file.

| Prima | Dopo |
|---|---|
| `PAT-FO-001 - Prenotazione e pre-arrival.html` | `PPL-FO-001 - Prenotazione e pre-arrival.html` |

### Organizzazione per reparto
I file vanno organizzati in sottocartelle per codice reparto: `FO/`, `RM/`, `FB/`, `SP/`, `QA/`.

### Numerazione
La numerazione originale (001, 002, ...) viene **mantenuta identica**. Non rinumerare.

---

## STRUTTURA HTML STANDARD PER OGNI SOP

Ogni file HTML riscritto deve seguire questa struttura semantica standard:

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
  <li><strong>Ruolo X:</strong> descrizione della responsabilità.</li>
  <li><strong>Ruolo Y:</strong> descrizione della responsabilità.</li>
</ul>

<h2>Standard e note</h2>
<p>Eventuali standard di qualità, riferimenti LHW, note operative.</p>
```

### Regole di struttura

1. **Obiettivo** (obbligatorio): un paragrafo che descrive lo scopo della procedura. Se l'originale non ha un obiettivo esplicito, ricavarlo dal contenuto.

2. **Procedura** (obbligatorio): la sequenza operativa in `<ol><li>`. Questo è il corpo principale della SOP. Se l'originale ha sotto-sezioni (es. "PREPARAZIONE", "DURANTE IL SERVIZIO", "POST SERVIZIO"), mantenerle come `<h3>` all'interno della sezione Procedura:

```html
<h2>Procedura</h2>
<h3>Preparazione</h3>
<ol>
  <li>...</li>
</ol>
<h3>Durante il servizio</h3>
<ol>
  <li>...</li>
</ol>
```

3. **Responsabilità** (facoltativo): elenco dei ruoli coinvolti. Inserire solo se l'informazione è presente o ricavabile dall'originale. Non inventare.

4. **Standard e note** (facoltativo): standard LHW, riferimenti brand Patria, note specifiche. Molte SOP originali contengono frasi di brand voice ("Lusso Gentile", citazioni di filosofia Patria). Queste vanno raccolte qui, non lasciate sparse nel corpo procedurale.

### Tag HTML consentiti

Solo questi tag sono ammessi nel body:
- `<h2>` — titoli di sezione principale
- `<h3>` — sottosezioni
- `<p>` — paragrafi
- `<ol><li>` — elenchi numerati (passaggi procedurali)
- `<ul><li>` — elenchi puntati (responsabilità, note)
- `<strong>` — grassetto (ruoli, termini chiave)
- `<em>` — corsivo (citazioni brand)

**Niente altro.** Niente `<div>`, `<span>`, `<table>`, `<br>`, attributi `style`, classi CSS.

---

## REGOLE DI RISCRITTURA CONTENUTO

### Cosa fare
1. **Ristrutturare** il contenuto nelle sezioni standard (Obiettivo, Procedura, Responsabilità, Standard)
2. **Mantenere** tutto il contenuto operativo — nessun passaggio può essere eliminato
3. **Separare** le frasi di brand/filosofia dal corpo procedurale e spostarle in "Standard e note"
4. **Correggere** errori di formattazione (liste spezzate, numerazione incoerente)
5. **Uniformare** il linguaggio: imperativo per le azioni ("Verificare...", "Comunicare...", "Assicurarsi che...")

### Cosa NON fare
1. **Non inventare** contenuto che non esiste nell'originale
2. **Non eliminare** passaggi operativi
3. **Non modificare** la sostanza delle procedure
4. **Non tradurre** — tutto resta in italiano
5. **Non aggiungere** sezioni "Frequenza" o "Eccezioni" se non ci sono nell'originale
6. **Non cambiare** i titoli delle SOP

---

## MANIFEST EXCEL

### File: `DomusGO/SOP_READY/manifest.xlsx`

Un unico file Excel con le colonne esatte attese dall'API di import:

| Colonna | Descrizione | Esempio |
|---|---|---|
| `titolo` | Titolo della SOP | `Prenotazione e pre-arrival` |
| `file` | Nome file relativo alla cartella | `FO/PPL-FO-001 - Prenotazione e pre-arrival.html` |
| `struttura` | Codice property sistema | `PPL` |
| `reparto` | Codice department | `FO` |

**ATTENZIONE**: la colonna `file` deve contenere **solo il nome del file** senza percorso di sottocartella (es. `PPL-FO-001 - Prenotazione e pre-arrival.html`, non `FO/PPL-FO-001 - ...`).

L'API usa `File.name` dal browser upload per il matching, quindi i percorsi relativi non funzionano.

Le sottocartelle per reparto servono solo per l'organizzazione locale. Al momento dell'upload, tutti i file vengono selezionati e caricati come lista piatta.

### Formato Excel
- intestazione in riga 1
- una riga per ogni SOP
- filtro automatico attivo
- 77 righe dati
- ordinamento: per reparto (FO → RM → FB → SP → QA) poi per numero

---

## MAPPING COMPLETO

### Property
| Codice file | Codice sistema | Struttura |
|---|---|---|
| `PAT` | `PPL` | Patria Palace Hotel |

### Reparti (nessun mapping necessario)
| Codice | Nome | N. SOP |
|---|---|---|
| `FO` | Front Office | 18 |
| `RM` | Room Division | 12 |
| `FB` | F&B | 17 |
| `SP` | Spa & Esperienze | 13 |
| `QA` | Back of House | 17 |

---

## PROCESSO DI LAVORO

### Fase 1 — Setup
1. Creare la struttura cartelle `SOP_READY/` con le 5 sottocartelle reparto
2. Leggere `_manifest.json` per avere la lista completa dei file

### Fase 2 — Riscrittura (reparto per reparto)
Per ogni reparto, in ordine FO → RM → FB → SP → QA:
1. Leggere ogni file HTML sorgente da `SOP_IMPORT/`
2. Se necessario, consultare il DOCX originale in `SOP_OUTPUT/` per contesto aggiuntivo
3. Ristrutturare il contenuto secondo le sezioni standard
4. Salvare il file riscritto in `SOP_READY/{REPARTO}/PPL-{REPARTO}-{NUM} - {Titolo}.html`

### Fase 3 — Manifest
1. Generare `manifest.xlsx` con tutte le 77 righe
2. Verificare coerenza: ogni file referenziato nel manifest deve esistere fisicamente

### Fase 4 — Verifica
1. Contare i file per reparto e verificare: FO=18, RM=12, FB=17, SP=13, QA=17
2. Aprire 5 file campione (uno per reparto) e verificare la struttura HTML
3. Verificare che il manifest abbia esattamente 77 righe
4. Verificare che tutti i file referenziati nel manifest esistano

---

## FILE DA NON TOCCARE

- `CLAUDE.md`
- `prisma/schema.prisma`
- `SOP_IMPORT/` — non modificare i file sorgente
- `SOP_OUTPUT/` — non modificare i file Word originali
- qualsiasi file in `src/`

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. Numero file creati per reparto
2. Totale file creati (atteso: 77)
3. Manifest generato e verificato
4. 5 file campione (uno per reparto) con contenuto mostrato
5. Eventuali SOP problematiche (contenuto troppo scarno, struttura ambigua)
6. Conferma che nessun contenuto operativo è stato eliminato
