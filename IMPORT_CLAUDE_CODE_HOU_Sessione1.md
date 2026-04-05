# Prompt Claude Code — Import Sessione 1: HOUSEKEEPING (14 SOP)

> Copia questo intero file e passalo a Claude Code nella cartella ModusHO.
> Claude Code eseguirà l'importazione completa delle SOP Housekeeping nel sistema.

---

## BLOCCO 1 — Contesto sistema (fisso, non modificare)

```
Sei Claude Code in esecuzione nella cartella del progetto ModusHO.
Il progetto è un sistema di governance operativa per hotel su Next.js 14 + Prisma + PostgreSQL.
Devi importare SOP operative nel database tramite le API di ModusHO.

Architettura rilevante:
- API endpoint creazione contenuto: POST /api/content
- Auth: NextAuth.js con credentials provider
- Modello: Content { type, code, title, body, status, propertyId, departmentId, createdById, submittedById }
- Status di import: DRAFT
- type: SOP
- Formato body: HTML sanitizzato (converti da Markdown)

Regole RBAC per questo import:
- Ruolo autore: HOD (redattore Pierangelo Metrangolo)
- Property: Patria Palace Hotel (code: PPL)
- Reparto: Housekeeping (code: HOU)
- I codici SOP sono pre-assegnati (non auto-generare): usa quelli indicati nel manifest
- Status import: DRAFT (non pubblicare)

Prima di iniziare:
1. Verifica che l'utente pierangelo.metrangolo@patriapalace.com esista nel DB con ruolo HOD
2. Verifica che la property PPL (Patria Palace Hotel) esista nel DB
3. Verifica che il reparto HOU (Housekeeping) esista per la property PPL
4. ⚠️ NOTA CRITICA: Pierangelo deve avere PropertyAssignment per il reparto HOU in ModusHO.
   Se manca: eseguire INSERT in PropertyAssignment prima dell'import delle SOP HOU.
   Senza questo, il sistema rifiuterà la creazione dei DRAFT per Pierangelo in quel reparto.

Se qualcuna di queste verifiche fallisce: segnalare l'anomalia e fermarsi. Non procedere con l'import.
```

---

## BLOCCO 2 — Manifest Sessione 1: HOU

| # | Codice | File sorgente | Titolo | Reparto | Tipo | Autore (email) | Status |
|---|---|---|---|---|---|---|---|
| 1 | PPL-HOU-001 | PPL-HOU-001_Pulizia_Camera_Arrivo.md | Pulizia camera all'arrivo (checkout clean) | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 2 | PPL-HOU-002 | PPL-HOU-002_Servicing_Camera.md | Pulizia camera in stile (servicing) | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 3 | PPL-HOU-003 | PPL-HOU-003_Turndown_Service.md | Turndown service | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 4 | PPL-HOU-004 | PPL-HOU-004_Pulizia_Aree_Comuni.md | Pulizia aree comuni, corridoi, lobby | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 5 | PPL-HOU-005 | PPL-HOU-005_Laundry_Divise.md | Laundry: raccolta divise e biancheria di servizio | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 6 | PPL-HOU-006 | PPL-HOU-006_Lost_Found_HK.md | Lost & Found: Housekeeping | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 7 | PPL-HOU-007 | PPL-HOU-007_Standard_Dotazioni_Camera.md | Standard dotazioni camera: amenities, minibar, biancheria | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 8 | PPL-HOU-008 | PPL-HOU-008_Richieste_Speciali_Camera.md | Gestione richieste speciali in camera | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 9 | PPL-HOU-009 | PPL-HOU-009_Cimici_Letti.md | Prevenzione e gestione cimici dei letti | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 10 | PPL-HOU-010 | PPL-HOU-010_Vasca_302.md | Manutenzione vasca 302: pulizia e cura | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 11 | PPL-HOU-011 | PPL-HOU-011_Aree_Pubbliche_Setup.md | Setup e presidio aree pubbliche: lobby, lounge, bagni comuni | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 12 | PPL-HOU-012 | PPL-HOU-012_Minibar.md | Rifornimento e gestione minibar | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 13 | PPL-HOU-013 | PPL-HOU-013_Floor_Check.md | Floor check corridoi e parti comuni di piano | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |
| 14 | PPL-HOU-014 | PPL-HOU-014_Lavanderia_Ospiti.md | Servizio lavanderia ospiti: raccolta, trattamento e riconsegna | HOU | SOP | pierangelo.metrangolo@patriapalace.com | DRAFT |

**Cartella sorgente:** `SOPPATRIA/SOP_Produzione/`

---

## BLOCCO 3 — Istruzioni di esecuzione per Claude Code

```
Per ogni SOP nel manifest qui sopra, eseguire i seguenti step nell'ordine indicato:

STEP 1 — Leggi il file sorgente
  Leggi il file .md dalla cartella SOPPATRIA/SOP_Produzione/
  Il file è in formato Markdown con header metadati, sezioni di testo e checklist.

STEP 2 — Converti in HTML
  Converti il body Markdown in HTML sanitizzato.
  Regole di conversione:
  - ## Titolo sezione → <h2>
  - ### Titolo step → <h3>
  - Testo normale → <p>
  - Liste puntate → <ul><li>
  - Liste numerate → <ol><li>
  - Tabelle Markdown → <table><thead><tbody>
  - Blocchi "Nota Patria" → <div class="nota-patria"><strong>Nota Patria</strong><p>...</p></div>
  - Codici LQA inline (es. `[LQA std. X — Category]`) → <span class="lqa-ref">[LQA std. X — Category]</span>
  - Checklist (☐ voce) → <ul class="checklist"><li>voce</li>
  Non includere la tabella metadati nell'HTML del body: quella è separata nei campi del record.
  Il body HTML inizia da "## Obiettivo" fino alla fine del documento.

STEP 3 — Recupera gli ID necessari dal DB
  Recupera tramite Prisma:
  - userId di pierangelo.metrangolo@patriapalace.com
  - propertyId di PPL (Patria Palace Hotel)
  - departmentId di HOU per quella property

STEP 4 — Verifica PropertyAssignment
  Verifica che esista un record PropertyAssignment per:
    { userId: [Pierangelo ID], propertyId: [PPL ID], departmentId: [HOU ID] }
  Se non esiste: creare il record prima di procedere.
  Log: "PropertyAssignment HOU creato per Pierangelo" oppure "PropertyAssignment già presente"

STEP 5 — Crea il record Content tramite API o Prisma diretto
  Opzione A (se il server è running): POST /api/content con autenticazione come Pierangelo
  Opzione B (se in seed/migration): Prisma create diretto

  Payload:
  {
    type: "SOP",
    code: "[codice dal manifest — es. PPL-HOU-001]",
    title: "[titolo dal manifest]",
    body: "[HTML convertito nel STEP 2]",
    status: "DRAFT",
    propertyId: "[PPL ID]",
    departmentId: "[HOU ID]",
    createdById: "[Pierangelo userId]",
    submittedById: "[Pierangelo userId]",
    version: 1,
    isDeleted: false
  }

STEP 6 — Verifica
  Dopo ogni creazione, verificare che il record esista nel DB con:
  - code corretto
  - status DRAFT
  - propertyId e departmentId corretti
  Log: "✅ PPL-HOU-00X — [titolo] importato correttamente"
  In caso di errore: "❌ PPL-HOU-00X — [errore]" e continuare con la SOP successiva

STEP 7 — Crea ContentStatusHistory
  Per ogni Content creato, inserire il record iniziale in ContentStatusHistory:
  {
    contentId: [nuovo Content ID],
    fromStatus: null,
    toStatus: "DRAFT",
    changedById: [Pierangelo userId],
    changedAt: now(),
    note: "Import iniziale — Sessione 1 HOU"
  }

STEP 8 — Riepilogo finale
  Al termine dell'import, produrre un riepilogo:
  - N SOP importate con successo
  - N SOP con errori (lista codici + errore)
  - Verifica PropertyAssignment HOU per Pierangelo: presente/creato
  - Istruzione successiva: accedere a ModusHO come Pierangelo e verificare che le 14 SOP siano visibili nel reparto HOU in stato DRAFT
```

---

## Note per l'operatore

**PropertyAssignment critico:** Prima di avviare l'import, verificare manualmente in ModusHO → Gestione Utenti → Pierangelo Metrangolo che il reparto HOU sia nella lista dei reparti assegnati. Se manca, lo script lo aggiunge automaticamente, ma è bene verificarlo visivamente dopo l'import.

**Codici pre-assegnati:** I codici PPL-HOU-001…014 sono fissi e non devono essere auto-generati dal sistema. Il campo `code` viene impostato direttamente nel payload.

**ContentStatusHistory:** La creazione del record di storia è obbligatoria (regola architetturale ModusHO: ogni cambio di stato deve generare un record). Il primo record con fromStatus=null rappresenta la creazione iniziale.

**Sessione successiva:** Dopo l'import HOU, la prossima sessione è **Sessione 2 — Front Office (9 SOP: PPL-FO-001…009)**.
