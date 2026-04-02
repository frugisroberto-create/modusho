# SPECIFICA TECNICA — Import SOP in ModusHO

Le SOP che stai scrivendo verranno importate in un software gestionale alberghiero chiamato ModusHO.

L'importazione avviene caricando un insieme di file HTML e un file manifest Excel (.xlsx) che associa ogni file a una struttura alberghiera e a un reparto.

Di seguito le specifiche tecniche che i file devono rispettare per essere importati ed assegnati correttamente.

---

## FILE HTML

Ogni SOP è un singolo file `.html` contenente solo il body HTML della procedura.

Il file non deve contenere wrapper di pagina (`<html>`, `<head>`, `<body>`, `<!DOCTYPE>`). Solo il contenuto.

### Tag consentiti

| Tag | Uso |
|---|---|
| `<h2>` | Titoli di sezione |
| `<h3>` | Sottosezioni |
| `<p>` | Paragrafi |
| `<ol><li>` | Liste numerate |
| `<ul><li>` | Liste puntate |
| `<strong>` | Grassetto |
| `<em>` | Corsivo |

Qualsiasi altro tag viene rimosso automaticamente dal sistema in fase di import. Evitare `<div>`, `<span>`, `<table>`, `<br>`, attributi `style`, classi CSS, commenti HTML.

---

## NAMING FILE

Convenzione:

```
{STRUTTURA}-{REPARTO}-{NUMERO} - {Titolo}.html
```

Esempi:
```
PPL-FO-001 - Check-in e registrazione.html
NCL-FB-003 - Gestione buffet colazione.html
HIB-RM-002 - Housekeeping departure.html
```

- `{STRUTTURA}` = codice property (vedi tabella sotto)
- `{REPARTO}` = codice department (vedi tabella sotto)
- `{NUMERO}` = progressivo a 3 cifre zero-padded (001, 002, ...)
- `{Titolo}` = titolo della SOP, identico a quello nel manifest
- Nessun carattere speciale nel titolo: no `/`, `\`, `:`, `*`, `?`, `"`, `<`, `>`, `|`

---

## STRUTTURE ALBERGHIERE

Ogni SOP appartiene a una struttura. Usare esclusivamente questi codici:

| Codice | Struttura | Città |
|---|---|---|
| `NCL` | The Nicolaus Hotel | Bari |
| `HIB` | Hi Hotel Bari | Bari |
| `PPL` | Patria Palace Hotel | Lecce |
| `TCM` | I Turchesi Club Village | Castellaneta Marina |
| `DHT` | Hotel Delfino | Taranto |
| `MRW` | Mercure Roma West | Roma |

---

## REPARTI

Ogni SOP è assegnata a un reparto. I codici sono gli stessi per tutte le strutture:

| Codice | Reparto |
|---|---|
| `FO` | Front Office |
| `RM` | Room Division |
| `FB` | Food & Beverage |
| `MT` | Maintenance |
| `SP` | SPA / Esperienze |
| `QA` | Back of House |

### Criterio di assegnazione

La SOP va assegnata al reparto che è il **principale destinatario operativo** della procedura.

Il reparto indica chi deve leggere e applicare la procedura, non chi l'ha scritta. Esempio: una procedura sulla gestione del check-in è `FO` anche se è scritta dal COO o dall'Hotel Manager.

Se una procedura è trasversale a più reparti (es. passaggi di consegna, sicurezza, grooming), assegnala a `QA` (Back of House).

---

## MANIFEST EXCEL

Il manifest è un file `.xlsx` con **una sola sheet** e **quattro colonne** con questi nomi esatti (minuscolo):

| titolo | file | struttura | reparto |
|---|---|---|---|
| Check-in e registrazione | PPL-FO-001 - Check-in e registrazione.html | PPL | FO |
| Gestione buffet colazione | PPL-FB-003 - Gestione buffet colazione.html | PPL | FB |

Descrizione colonne:

- `titolo` — titolo della SOP (obbligatorio, non vuoto)
- `file` — nome del file HTML corrispondente, **solo il nome senza percorso di cartella** (obbligatorio)
- `struttura` — codice property dalla tabella strutture (obbligatorio)
- `reparto` — codice department dalla tabella reparti (obbligatorio)

Il nome del file nella colonna `file` deve corrispondere esattamente al file fisico caricato. Il sistema fa il matching per nome file.

---

## ORGANIZZAZIONE CARTELLA

```
{CARTELLA}/
├── FO/
│   └── ...
├── RM/
│   └── ...
├── FB/
│   └── ...
├── SP/
│   └── ...
├── QA/
│   └── ...
└── manifest.xlsx
```

Le sottocartelle per reparto servono per l'organizzazione locale. In fase di upload nel software i file vengono caricati tutti insieme come lista piatta.

Creare solo le sottocartelle dei reparti che hanno effettivamente SOP.

---

## CHECKLIST FINALE

- [ ] Ogni file è un `.html` con solo tag consentiti, senza wrapper di pagina
- [ ] I nomi file seguono la convenzione `{STRUTTURA}-{REPARTO}-{NUM} - {Titolo}.html`
- [ ] Il manifest ha esattamente le colonne `titolo`, `file`, `struttura`, `reparto`
- [ ] Ogni file referenziato nel manifest esiste fisicamente nella cartella
- [ ] I codici struttura e reparto usati sono presenti nelle tabelle di riferimento
- [ ] Il numero totale di righe nel manifest corrisponde al numero di file HTML prodotti
