# Prompt per Claude Code — ModusHO

## PROMPT-16 — SOP Editor Workflow UI
### Interfaccia editor coerente con workflow RACI

Lavora sul progetto già esistente di **ModusHO**.

Leggi prima:
- `DomusGO/docs/specs/sop-workflow-raci.md`
- `DomusGO/prompts/PROMPT-15-sop-workflow-raci-domain.md`

Assumi che il dominio workflow SOP della Prompt 15 sia già implementato e sia la base da usare.

## OBIETTIVO

Implementare l’interfaccia dell’editor SOP in modo coerente con il workflow RACI già definito.

Questa task riguarda la **UI/UX operativa della singola SOP**, non i pannelli aggregati.

L’editor deve rendere chiaro:
- chi è `R`
- chi è `C`
- chi è `A`
- se la bozza è in lavorazione
- se è sottoposta a `C`
- se è sottoposta ad `A`
- se è sottoposta a entrambi
- chi può modificare il testo
- chi può solo leggere e lasciare note
- se la SOP pubblicata necessita revisione

---

## COSA NON FARE

1. Non modificare `CLAUDE.md`
2. Non rifare il dominio workflow già implementato nella 15
3. Non costruire ancora il pannello HOO/HM/HOD
4. Non fare redesign globale dell’app
5. Non aprire altre aree del progetto
6. Non cambiare Brand Book / Standard Book / utenti / property
7. Non ridefinire lato UI i permessi di dominio già fissati nella Prompt 15: la UI deve rifletterli, non reinventarli

---

# PARTE 1 — HEADER / TESTATA DELLA SOP

## Obiettivo
La parte alta della pagina SOP deve spiegare subito il contesto.

## Deve mostrare in modo chiaro almeno:
- titolo SOP
- struttura
- reparto
- stato documento:
  - `IN_LAVORAZIONE`
  - `PUBBLICATA`
  - `ARCHIVIATA`
- stato workflow corrente:
  - sottoposta a `C`
  - sottoposta ad `A`
  - sottoposta a entrambi
- ruolo dell’utente corrente su quella SOP:
  - `R`
  - `C`
  - `A`

## Ruoli R/C/A
I soggetti coinvolti devono essere visibili con etichette chiare, per esempio:
- `R: ...`
- `C: ...`
- `A: ...`

---

# PARTE 2 — EDITOR DEL TESTO

## Obiettivo
L’editor deve riflettere il workflow.

## Regole
### Se la bozza NON è sottoposta a C/A
Il testo può essere modificato secondo le regole del workflow già implementato.

### Se la bozza è sottoposta a C e/o A
- il testo entra in **lettura stabile**
- il testo può essere modificato solo da `R`
- `C` e `A` devono vedere il testo in modalità non editabile

## UI obbligatoria
Se l’utente corrente non è `R` e il testo non è modificabile, l’interfaccia deve mostrare chiaramente il motivo.

### Messaggio da usare
Usa questo testo o una variante molto vicina:

> Questa bozza è attualmente sottoposta a revisione. Il testo può essere modificato solo dal responsabile operativo della procedura. Puoi comunque lasciare note.

## Regola
Non basta disabilitare il campo senza spiegazione.

---

# PARTE 3 — AZIONI DISPONIBILI PER RUOLO

## Obiettivo
Mostrare solo azioni coerenti col ruolo e col momento workflow.

## Azioni da gestire almeno
- salva testo
- sottoponi a `C`
- sottoponi ad `A`
- sottoponi a entrambi
- restituisci
- approva/pubblica
- modifica review due date
- aggiungi nota
- gestisci allegati
- consulta storico versioni

## Regole attese

### R
Deve poter:
- modificare il testo quando consentito dal dominio workflow
- salvare
- sottoporre a `C`
- sottoporre ad `A`
- sottoporre a entrambi
- gestire allegati
- usare note
- vedere storico versioni

### C
Deve poter:
- leggere
- usare note
- vedere allegati
- vedere storico versioni

Non deve poter:
- modificare il testo quando la bozza è sottoposta
- approvare
- restituire
- gestire allegati come owner
- vedere azioni di sottoposizione

### A
Deve poter:
- leggere
- usare note
- vedere allegati
- vedere storico versioni
- restituire con nota
- approva/pubblica
- modificare review due date

Non deve poter:
- essere trattato come editor operativo del testo in questa UI
- vedere azioni di sottoposizione

## Regole esplicite di visibilità azioni
- le azioni `sottoponi a C`, `sottoponi ad A`, `sottoponi a entrambi` devono comparire solo a `R`
- le azioni `restituisci` e `approva/pubblica` devono comparire solo a `A` e solo quando la bozza è sottoposta ad `A`

---

# PARTE 4 — NOTE

## Obiettivo
Rendere le note sempre disponibili e chiaramente separate dal testo.

## Regole UI
- area note sempre visibile ai soggetti coinvolti
- ogni nota deve mostrare:
  - autore
  - data/ora
- le note devono essere leggibili in ordine chiaro
- la restituzione di A deve essere visivamente riconoscibile anche dentro le note / timeline

## Regola
Le note non devono sembrare parte del testo SOP.

---

# PARTE 5 — STORICO VERSIONI

## Obiettivo
Rendere consultabile lo storico dei salvataggi del testo.

## Regole UI minime
Lo storico deve mostrare almeno:
- numero versione
- autore
- data/ora
- eventualmente titolo/snapshot o metadato utile

Non serve ancora diff avanzato se non esiste già.
Serve una visualizzazione leggibile e coerente.

## Accesso
Lo storico deve essere disponibile ai soli soggetti coinvolti:
- `R`
- `C`
- `A`

---

# PARTE 6 — ALLEGATI DELLA BOZZA

## Obiettivo
Rendere gli allegati coerenti con il workflow.

## Regole UI
### R
- può aggiungere/rimuovere allegati
- vede la lista allegati
- può usarli come parte della bozza

### C e A
- vedono gli allegati
- non gestiscono il set allegati come owner
- possono commentarli via note

## Regola
L’area allegati deve essere chiaramente distinta dal testo e dalle note.

---

# PARTE 7 — REVIEW DUE DATE E “NECESSITA REVISIONE”

## Obiettivo
Mostrare in modo chiaro la scadenza di revisione della SOP pubblicata.

## Regole UI
La review due date ha rilevanza visiva soprattutto quando la SOP è `PUBBLICATA`.

### Caso normale
Mostra la data di revisione prevista.

### Caso scaduto
Se la SOP necessita revisione:
- mostra badge o etichetta chiara:
  - `Necessita revisione`
oppure equivalente molto chiaro
- la SOP deve restare leggibile

## Modifica data
La modifica della review due date deve essere disponibile solo a `A`.

---

# PARTE 8 — STATO WORKFLOW VISIBILE

## Obiettivo
L’utente deve capire subito in che fase si trova la bozza.

## Da visualizzare chiaramente
- bozza in lavorazione
- sottoposta a `C`
- sottoposta ad `A`
- sottoposta a entrambi
- restituita da `A` con nota visibile
- pubblicata

## Regola
Non lasciare che queste informazioni restino implicite nelle sole azioni.
Devono essere visibili.

---

# PARTE 9 — COMPORTAMENTO UX GENERALE

## Obiettivo
Fare un’interfaccia chiara, non pesante.

## Regole di stile
- niente confusione tra testo, note, allegati e storico
- ruoli R/C/A visibili ma sobri
- azioni principali in posizione chiara
- banner/messaggi esplicativi leggibili
- niente overload inutile
- focus operativo

## Priorità UX
1. capire subito se posso modificare o no
2. capire il mio ruolo
3. capire a che punto è la SOP
4. accedere facilmente a note, versioni e allegati

---

# PARTE 10 — COMPATIBILITÀ CON IL DOMINIO DELLA 15

## Obiettivo
Usare il lavoro della Prompt 15 senza reinventarlo.

## Regole
- usa le route e la logica introdotte dalla 15
- non duplicare chiamate o stati inutili
- se servono piccoli adattamenti del dominio per far funzionare bene la UI, falli in modo minimale e dichiaralo nel report finale

---

# VERIFICHE OBBLIGATORIE

Verifica almeno questi casi:

1. l’editor mostra chiaramente `R`, `C`, `A`
2. l’editor mostra chiaramente stato documento e stato workflow
3. `R` può modificare il testo quando consentito dal dominio
4. quando la bozza è sottoposta a C/A, `C` e `A` vedono il testo non editabile
5. `C` e `A` vedono il messaggio esplicativo corretto
6. `R` vede le azioni di sottoposizione coerenti
7. `A` vede le azioni di restituzione e approvazione solo quando la bozza è sottoposta ad A
8. le note sono sempre accessibili ai soggetti coinvolti
9. lo storico versioni è consultabile
10. gli allegati della bozza sono visibili in modo coerente
11. `A` può modificare la review due date
12. una SOP pubblicata con review due date superata mostra “necessita revisione”
13. typecheck passa
14. build passa

---

# OUTPUT FINALE DA RESTITUIRE

Alla fine restituisci un riepilogo breve con:

1. file modificati
2. come hai strutturato la testata della SOP
3. come hai reso visibili `R`, `C`, `A`
4. come hai gestito l’editabilità del testo
5. come hai gestito il messaggio per chi non è `R`
6. come hai integrato note, versioni e allegati
7. come hai mostrato review due date e “necessita revisione”
8. eventuali limiti ancora presenti
9. esito typecheck
10. esito build
