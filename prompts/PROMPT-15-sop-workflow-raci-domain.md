# Prompt per Claude Code — ModusHO

## PROMPT 1 — Workflow SOP RACI
### Dominio, logica applicativa e review lifecycle

Lavora sul progetto già esistente di **ModusHO**.

Leggi prima questa specifica funzionale:
- `DomusGO/docs/specs/sop-workflow-raci.md`

Questa specifica è la fonte di verità per questa task.

## OBIETTIVO

Implementare il **dominio workflow SOP** secondo la mini-spec approvata, includendo anche la logica di **scadenza/revisione delle SOP pubblicate**.

Questa task riguarda:
- modello applicativo
- logica workflow
- tracciabilità
- versionamento del testo
- note
- allegati di bozza
- regole di editabilità
- review lifecycle

Questa NON è ancora la task di rifinitura UI completa.  
Questa NON è ancora la task dei pannelli HOO/HM/HOD.

---

## COSA NON FARE

1. Non modificare `CLAUDE.md`
2. Non fare redesign grafico esteso
3. Non implementare ancora il pannello HOO/HM/HOD completo
4. Non fare co-editing live
5. Non aprire altre aree del progetto
6. Non cambiare Brand Book / Standard Book / Property / utenti, salvo stretta dipendenza tecnica
7. Non fare scorciatoie che tradiscono la mini-spec

---

# PARTE 1 — MODELLO DI DOMINIO SOP

## Obiettivo
Tradurre la mini-spec in una struttura tecnica coerente.

## Devi supportare almeno questi concetti

### Documento SOP
Stati principali del documento:
- `IN_LAVORAZIONE`
- `PUBBLICATA`
- `ARCHIVIATA`

### Ruoli sulla singola SOP
Ogni SOP deve poter sapere chi è:
- `R`
- `C` (opzionale)
- `A`

### Workflow corrente
La SOP deve poter sapere se è:
- sottoposta a `C`
- sottoposta ad `A`
- sottoposta a entrambi

### Storico workflow
Deve esistere un log eventi per tracciare almeno:
- creazione bozza
- salvataggio testo
- aggiunta nota
- aggiunta/rimozione/sostituzione allegato
- sottoposizione a `C`
- sottoposizione ad `A`
- sottoposizione a entrambi
- restituzione da `A`
- approvazione finale da `A`
- pubblicazione

## Regola
Se esistono già modelli riusabili, estendili in modo coerente.
Non creare doppioni inutili.

---

# PARTE 2 — AVVIO SOP E ASSEGNAZIONE R/C/A

## Obiettivo
Implementare la logica di assegnazione ruoli secondo la mini-spec.

## Regole da rispettare

### Se apre HOD
- può aprire solo SOP del proprio reparto
- `HOD = R`
- `HM = C`
- `HOO = A`

### Se apre HM senza coinvolgere HOD
- `HM = R`
- `HOO = A`

### Se apre HM coinvolgendo HOD
- `HOD = R`
- `HM = C`
- `HOO = A`

### Se apre HOO senza coinvolgere HOD
- `HM = R`
- `HOO = A`

### Se apre HOO coinvolgendo HOD
- `HOD = R`
- `HM = C`
- `HOO = A`

## Regola
Non implementare logiche alternative non previste.

---

# PARTE 3 — VERSIONI DEL TESTO

## Obiettivo
Ogni salvataggio esplicito del testo deve creare una nuova versione.

## Regole
- ogni save del testo = nuova versione
- le note non generano versioni del testo
- gli allegati non generano versioni del testo
- la versione pubblicata resta distinta dalle versioni di lavoro

## Serve poter sapere almeno:
- autore salvataggio
- timestamp
- contenuto/versione salvata

---

# PARTE 4 — NOTE

## Obiettivo
Integrare le note come layer sempre attivo del workflow.

## Regole
- note separate dal testo
- note disponibili ai soli soggetti coinvolti:
  - `R`
  - `C`
  - `A`
- ogni nota deve tracciare:
  - autore
  - timestamp
- le note non creano versioni del testo
- le note devono poter essere usate anche per la restituzione formale di `A`

---

# PARTE 5 — ALLEGATI DELLA BOZZA

## Obiettivo
Far rientrare gli allegati nel ciclo di bozza SOP.

## Regole
- gli allegati fanno parte della bozza
- sono visibili a:
  - `R`
  - `C`
  - `A`
- in fase di lavorazione:
  - `R` può aggiungere/rimuovere/organizzare allegati
  - `C` e `A` li vedono e li commentano via note
- quando la bozza è sottoposta a `C` e/o `A`:
  - `R` può ancora gestire gli allegati
  - `C` e `A` non modificano il set allegati
- gli allegati presenti al momento dell’approvazione diventano allegati della SOP pubblicata
- ogni modifica allegati genera eventi nel workflow log

## Nota
Se nel sistema esiste già un modello Attachment, riusalo in modo coerente.

---

# PARTE 6 — SOTTOPOSIZIONE A C E/O A

## Obiettivo
Implementare il concetto di sottoposizione senza creare copie del documento.

## Regole
La bozza può essere:
- sottoposta a `C`
- sottoposta ad `A`
- sottoposta a entrambi

## Tracciamento
La sottoposizione non deve essere un booleano puro.
Deve tracciare almeno:
- autore
- timestamp

## Regola dei flag
Usa flag correnti + event log.

### Flag verso C
Resta attivo fino a quando `R` salva una nuova versione del testo.

### Flag verso A
Resta attivo fino a quando `A`:
- approva
oppure
- restituisce

---

# PARTE 7 — EDITABILITÀ DEL TESTO

## Obiettivo
Applicare la regola chiave della mini-spec.

## Regola
Quando la bozza è sottoposta a `C` e/o `A`:
- il testo entra in lettura stabile
- il testo può essere modificato solo da `R`
- `C` e `A` non modificano il testo
- `C` e `A` possono continuare a usare:
  - note
  - storico versioni
  - visualizzazione allegati

## Importante
Questa task deve implementare la logica di permesso/editabilità.
La rifinitura UI del messaggio/blocco visuale verrà perfezionata in una task successiva, ma il comportamento deve esistere già.

---

# PARTE 8 — RESTITUZIONE

## Obiettivo
Implementare la restituzione come evento workflow.

## Regole
- solo `A` può restituire
- la restituzione richiede nota obbligatoria
- il flag verso `A` si spegne
- la bozza resta la stessa
- la SOP torna in fase di lavoro attivo
- `R` riprende il lavoro sul testo
- la restituzione deve essere tracciata nel workflow log

---

# PARTE 9 — APPROVAZIONE FINALE

## Obiettivo
Implementare l’approvazione finale secondo la mini-spec.

## Regole
- solo `A` (`ADMIN` / `SUPER_ADMIN`) approva
- approvazione finale = pubblicazione
- non esiste un passaggio separato “approvato ma non pubblicato”
- dopo approvazione il documento esce dal ciclo di lavorazione

---

# PARTE 10 — REVIEW LIFECYCLE DELLA SOP PUBBLICATA

## Obiettivo
Implementare la logica di scadenza/revisione delle SOP pubblicate.

## Regole
- ogni SOP pubblicata deve avere una **review due date**
- la review due date viene impostata al momento della pubblicazione
- a ogni ripubblicazione dopo revisione, la review due date viene ricalcolata
- valore di default: **12 mesi** dalla pubblicazione
- il valore può essere modificato solo da `A`

## Effetto della scadenza
Quando la review due date è superata:
- la SOP resta pubblicata
- la SOP resta leggibile
- la SOP entra nella condizione **“necessita revisione”**

## Importante
La scadenza non deve:
- archiviare automaticamente la SOP
- depubblicarla automaticamente
- bloccarne la lettura

La scadenza deve produrre una condizione di governance e tracciabilità.

## Visibilità della segnalazione
La condizione “necessita revisione” deve essere disponibile a livello dominio/applicativo e leggibile almeno da:
- `HM`
- `HOO` (`ADMIN` / `SUPER_ADMIN`)

La visualizzazione UI completa verrà rifinita nella task successiva o in quella dei pannelli.

---

# PARTE 11 — VISIBILITÀ DELLA BOZZA

## Obiettivo
Limitare la bozza ai soli attori coinvolti.

## Regole
La bozza in lavorazione è visibile solo a:
- `R`
- `C`
- `A`

Non deve essere visibile come bozza a:
- lettori finali
- utenti fuori perimetro
- altri reparti non coinvolti

---

# PARTE 12 — CONCORRENZA MINIMA

## Obiettivo
Evitare sovrascritture silenziose senza introdurre co-editing live.

## Regole
- niente co-editing live
- save esplicito
- se un altro soggetto ha salvato una nuova versione dopo l’apertura della bozza, il sistema deve poter rilevare il problema e supportare un avviso/coerenza minima

Non serve ancora una UX raffinata, ma serve una base applicativa corretta.

---

# PARTE 13 — COMPATIBILITÀ CON IL SISTEMA ATTUALE

## Obiettivo
Integrare il workflow senza rompere il sistema esistente.

## Regole
- riusa i modelli esistenti quando coerenti
- non duplicare inutilmente content, attachment, notes o versioning se esiste già qualcosa di vicino
- se devi estendere modelli esistenti, fallo in modo leggibile e coerente
- documenta chiaramente eventuali nuove entità o campi introdotti

---

# VERIFICHE OBBLIGATORIE

Verifica almeno questi casi:

1. HOD apre SOP del proprio reparto → `R = HOD`, `C = HM`, `A = HOO`
2. HM apre SOP senza HOD → `R = HM`, `A = HOO`
3. HM apre SOP con HOD → `R = HOD`, `C = HM`, `A = HOO`
4. HOO apre SOP senza HOD → `R = HM`, `A = HOO`
5. HOO apre SOP con HOD → `R = HOD`, `C = HM`, `A = HOO`

6. Salvataggio testo crea nuova versione
7. Nota non crea nuova versione
8. Allegato non crea nuova versione ma crea evento log
9. Sottoposizione a C tracciata con autore + timestamp
10. Sottoposizione ad A tracciata con autore + timestamp
11. Testo sottoposto a C/A → solo `R` può modificarlo
12. `C` e `A` possono continuare a usare note
13. `A` può restituire con nota obbligatoria
14. Restituzione spegne il flag verso A
15. `A` approva e la SOP viene pubblicata

16. Alla pubblicazione viene impostata la review due date
17. Default review due date = 12 mesi
18. Solo `A` può modificare la review due date
19. Alla ripubblicazione la review due date viene ricalcolata
20. SOP con review due date superata = “necessita revisione”, ma resta leggibile e pubblicata

21. Typecheck passa
22. Build passa

---

# OUTPUT FINALE DA RESTITUIRE

Alla fine restituisci un riepilogo breve con:

1. file modificati
2. modelli/campi/entità introdotti o estesi
3. come hai implementato R/C/A
4. come hai implementato flag correnti + workflow log
5. come hai implementato versioni del testo
6. come hai implementato note
7. come hai implementato allegati nella bozza
8. come hai implementato sottoposizione a C/A
9. come hai implementato la regola “solo R modifica quando la bozza è sottoposta”
10. come hai implementato restituzione e approvazione finale
11. come hai implementato review due date e condizione “necessita revisione”
12. eventuali limiti ancora presenti
13. esito typecheck
14. esito build
