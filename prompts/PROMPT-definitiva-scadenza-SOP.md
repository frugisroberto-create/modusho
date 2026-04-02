# Prompt per Claude Code — ModusHO
## Scadenza SOP — validità temporale, badge, alert e permessi

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Implementare nel sistema una logica completa di **scadenza delle SOP**.

La regola di prodotto è questa:

**ogni SOP pubblicata ha una validità temporale e una data di scadenza. Di default la scadenza è fissata a 12 mesi dalla pubblicazione.**

La scadenza serve a:
- evitare che una SOP resti implicitamente valida per sempre
- segnalare quando una procedura richiede revisione
- dare ai ruoli di governo una vista chiara delle SOP da aggiornare

### Regola importante
La scadenza:
- **non archivia automaticamente** la SOP
- **non la rende non leggibile**
- **non la rimuove dalla consultazione**

Una SOP scaduta resta consultabile, ma viene segnalata come **da revisionare**.

---

## PRINCIPIO DI PRODOTTO

La scadenza è una logica di **validità temporale**, separata da:

- stato editoriale/workflow
- presa visione
- pubblicazione
- approvazione

Quindi una SOP può essere contemporaneamente:
- `PUBLISHED`
- `EXPIRED`

oppure:
- `PUBLISHED`
- `EXPIRING`

La scadenza non sostituisce il workflow.  
Lo affianca.

---

## REGOLA GENERALE DI VALIDITÀ

### Default
Alla pubblicazione di una SOP:

- `publishedAt` = data/ora di pubblicazione
- `expiresAt = publishedAt + 12 mesi`

Questa è la regola standard di default.

### Soglia “In scadenza”
Una SOP entra nello stato **In scadenza**:

- `30 giorni` prima di `expiresAt`

### Stati di validità
Gli stati concettuali sono:

- `VALID`
- `EXPIRING`
- `EXPIRED`

### Regola consigliata
Questi stati vanno **calcolati**, non necessariamente persistiti nel database.

Se possibile, preferisco:
- `expiresAt` salvato
- `validityStatus` calcolato dinamicamente

### Logica calcolo
- `VALID` se `today < expiresAt - 30 giorni`
- `EXPIRING` se `today >= expiresAt - 30 giorni` e `today < expiresAt`
- `EXPIRED` se `today >= expiresAt`

### Regola temporale
Usare il timezone applicativo già adottato dal progetto ed evitare comportamenti ambigui dovuti a UTC/orari.
La valutazione di “in scadenza” e “scaduta” deve essere coerente a livello data, non introdurre sorprese per differenze di fuso.

---

## CAMPI DATI

### Campo da introdurre
Aggiungere sulla SOP / sul contenuto di tipo SOP:

- `expiresAt: DateTime?`

### Nota
Usare `publishedAt` come riferimento della validità.
Non creare campi ridondanti se non servono.

### Facoltativo
Se utile al modello, puoi valutare anche:
- `validityOverrideMonths: Int?`

ma **solo se davvero necessario**.

Non introdurre complessità inutile se basta salvare direttamente `expiresAt`.

---

## CREAZIONE E AGGIORNAMENTO DELLA SCADENZA

### Prima pubblicazione
Alla prima pubblicazione:

- il sistema imposta automaticamente `expiresAt = publishedAt + 12 mesi`

### Regola
L’utente non deve inserire la scadenza manualmente come comportamento standard.

La scadenza nasce automaticamente.

### Ripubblicazione
Quando una SOP viene aggiornata e ripubblicata come nuova versione:

- nuova `publishedAt`
- nuova `expiresAt = nuova publishedAt + 12 mesi`

Questa deve essere la regola standard.

### Override manuale
Solo ruoli autorizzati possono modificare la scadenza standard.

Questa modifica deve essere possibile come eccezione, per esempio:
- SOP particolarmente sensibile → 6 mesi
- SOP molto stabile → 18 o 24 mesi

Ma la regola base resta:
- default 12 mesi

### Chiarimento vincolante
La modifica manuale di `expiresAt` da parte di HM/HOO è ammessa come eccezione **anche senza ripubblicazione della SOP**, ma:
- non deve cambiare `publishedAt`
- non deve creare una nuova versione
- non deve attivare workflow redazionali aggiuntivi

---

## SOP LEGACY GIÀ PUBBLICATE

Questa parte è obbligatoria.

Esistono potenzialmente SOP già pubblicate prima di questa feature e prive di `expiresAt`.

### Cosa devi fare
Definire esplicitamente come gestirle.

### Regola preferita
Se `publishedAt` è affidabile:
- valorizzare `expiresAt = publishedAt + 12 mesi` per le SOP già pubblicate

### Se una migrazione piena non è possibile
Implementare un fallback chiaro:
- se SOP è `PUBLISHED`
- e `expiresAt` è `null`
- allora la validità viene derivata da `publishedAt + 12 mesi`

### Se manca anche `publishedAt`
Non inventare una data.
Gestire il caso in modo esplicito, per esempio:
- nessun alert di scadenza
- messaggio / stato che segnala data validità non disponibile

Non lasciare questo comportamento implicito.

---

## PERMESSI

### Operatore
Può:
- vedere lo stato di validità della SOP
- vedere la data di scadenza
- leggere la SOP anche se scaduta

Non può:
- modificare la scadenza
- prorogarla
- avviare modifiche di validità

### HOD
Può:
- vedere stato validità e data scadenza
- vedere SOP in scadenza/scadute del proprio reparto
- usare queste informazioni come alert operativo
- partecipare alla revisione contenuto se il workflow lo consente

Non può:
- modificare direttamente `expiresAt`
- prorogare la validità

### HM
Può:
- vedere tutte le SOP del proprio perimetro con stato validità
- modificare `expiresAt` nel proprio perimetro
- decidere una proroga eccezionale
- governare la revisione della SOP
- ripubblicare la nuova versione

### HOO
Può:
- vedere tutte le SOP del perimetro di governo
- modificare `expiresAt`
- definire eccezioni di validità
- supervisionare SOP in scadenza/scadute
- governare la revisione

### Regola netta
La scadenza deve essere:
- **generata automaticamente dal sistema**
- **modificabile solo da HM e HOO**
- **visibile ai ruoli che leggono la SOP**
- **non modificabile da HOD o Operatore**

### Perimetro visibilità
La logica di visibilità segue il perimetro ruolo già esistente:
- HOD vede solo il proprio reparto
- HM il proprio hotel
- HOO il proprio perimetro di governo

---

## BADGE E LINGUAGGIO UI

### Badge da mostrare
Introdurre badge di validità sempre leggibili.

#### `Valida`
- label: `Valida`
- tono visivo: verde

#### `In scadenza`
- label: `In scadenza`
- tono visivo: ambra / arancio

#### `Scaduta`
- label: `Scaduta`
- tono visivo: rosso / terracotta critica

### Informazione data
Mostrare sempre anche:
- `Scade il 14/05/2027`
oppure
- `Scaduta il 14/05/2027`

Se semplice da implementare, per `In scadenza` può essere utile anche:
- `Scade tra 18 giorni`

---

## PAGINA DETTAGLIO SOP

### Per tutti i ruoli
Nella pagina dettaglio SOP devono comparire:

- badge di validità
- data di scadenza
- eventuale messaggio contestuale se la SOP è in scadenza o scaduta

### Se la SOP è `EXPIRING`
Mostrare un messaggio leggero tipo:
- `Questa procedura è in scadenza e dovrà essere rivista entro breve.`

### Se la SOP è `EXPIRED`
Mostrare un messaggio più chiaro tipo:
- `Questa procedura è scaduta e richiede revisione.`

### Regola importante
La SOP scaduta:
- resta leggibile
- resta consultabile
- non viene rimossa

### Presa visione su SOP scaduta
Se una SOP è `PUBLISHED` ma `EXPIRED`, la presa visione continua a funzionare secondo la logica già esistente della versione corrente.
Non trattare “scaduta” come blocco automatico della presa visione.

---

## LISTE SOP

Nelle liste SOP aggiungere:

- badge validità
- data di scadenza
- eventuali filtri di validità per ruoli di governo

### Filtri consigliati
Per HOD / HM / HOO:
- Tutte
- In scadenza
- Scadute

### Ordinamento consigliato
Priorità:
1. Scadute
2. In scadenza
3. Valide

Non introdurre complessità se la lista attuale non lo regge bene, ma almeno i badge devono esserci.

### Perimetro
Applicare sempre il perimetro ruolo:
- HOD → proprio reparto
- HM → proprio hotel
- HOO → proprio perimetro

---

## HOME ALERT

### Regola generale
Gli alert home devono restare **sobri**.
Non voglio una nuova dashboard dedicata alla scadenza.

### Formato preferito
- contatore
- riepilogo compatto
- eventuale link a lista SOP filtrata

### Home HOD
Mostrare alert riferiti solo al proprio reparto, per esempio:
- SOP in scadenza
- SOP scadute

Esempi:
- `2 SOP del Front Office in scadenza`
- `1 SOP del Front Office scaduta`

### Home HM
Mostrare alert nel proprio perimetro hotel:
- SOP in scadenza
- SOP scadute

### Home HOO
Mostrare alert aggregati di governance:
- SOP in scadenza
- SOP scadute

### Home Operatore
Non trasformare la home operatore in dashboard di validità.

Può bastare:
- badge sulla singola SOP
- nessun blocco home dedicato alla scadenza

---

## REGOLA DI REVISIONE

### SOP scaduta
Quando una SOP è scaduta:
- non viene archiviata automaticamente
- non viene nascosta
- viene segnalata come **da revisionare**

### Revisione
- HOD può vederla, segnalarla, contribuire
- HM e HOO possono governare la revisione
- la nuova pubblicazione riavvia il ciclo di validità

### Nuova pubblicazione
Alla nuova pubblicazione:
- si aggiorna `publishedAt`
- si ricalcola `expiresAt`
- il precedente stato di scadenza si azzera

---

## REGOLA SU PRESA VISIONE E SCADENZA

La scadenza e la presa visione sono due logiche diverse.

### Presa visione
Dice:
- l’utente ha letto/confermato questa versione?

### Scadenza
Dice:
- questa SOP è ancora temporalmente valida?

Quindi una SOP può essere:
- confermata dall’utente
- ma comunque scaduta

Non mischiare le due logiche.

---

## LIMITI DI SCOPE DI QUESTA TASK

### Non introdurre in questa task:
- push notification per SOP in scadenza o scadute
- reminder automatici
- job complessi giornalieri, se non strettamente necessari
- dashboard dedicate solo alla scadenza
- nuovi flussi redazionali autonomi

### UI modifica scadenza
In questa fase non introdurre una UI complessa dedicata alla proroga.
Implementare solo quanto è coerente con le schermate già esistenti, senza aprire un nuovo flusso gestionale separato.

---

## APPLICAZIONE DELLA LOGICA

La logica di validità/scadenza si applica solo alle SOP:
- pubblicate
- non archiviate

Una SOP archiviata non deve più entrare negli alert di scadenza né nella governance di validità attiva.

---

## COSA DEVI FARE

1. introdurre il campo dati necessario per la scadenza SOP
2. impostare il default automatico a 12 mesi alla pubblicazione
3. gestire in modo esplicito le SOP legacy già pubblicate
4. ricalcolare la scadenza alla ripubblicazione
5. implementare il calcolo degli stati:
   - valida
   - in scadenza
   - scaduta
6. mostrare badge e data di scadenza nella pagina SOP
7. mostrare badge e data anche nelle liste SOP dove coerente
8. introdurre alert home sobri per HOD / HM / HOO
9. gestire i permessi in modo che solo HM e HOO possano modificare la scadenza
10. mantenere la SOP scaduta consultabile
11. non rompere la logica esistente di presa visione e workflow

---

## REGOLE IMPORTANTI

- non modificare `CLAUDE.md`
- non archiviare automaticamente le SOP scadute
- non nascondere le SOP scadute dalla consultazione
- non introdurre job complessi se non necessari
- non creare una dashboard separata solo per la scadenza
- non mescolare scadenza e presa visione
- non permettere a HOD o Operatore di modificare `expiresAt`
- non lasciare comportamenti impliciti sui contenuti legacy
- non introdurre push o automazioni non richieste in questa fase

---

## VERIFICA ATTESA

Verifica almeno questi casi:

### 1. Prima pubblicazione
- SOP pubblicata
- `expiresAt` impostato automaticamente a +12 mesi

### 2. Stato valida
- SOP appena pubblicata risulta `Valida`

### 3. Stato in scadenza
- SOP a meno di 30 giorni dalla scadenza risulta `In scadenza`

### 4. Stato scaduta
- SOP oltre `expiresAt` risulta `Scaduta`

### 5. Dettaglio SOP
- badge e data scadenza visibili
- messaggio coerente se in scadenza/scaduta

### 6. Liste SOP
- badge validità visibili
- eventuali filtri funzionanti se implementati

### 7. Permessi
- HM e HOO possono modificare la scadenza
- HOD e Operatore no

### 8. Ripubblicazione
- nuova pubblicazione → nuova `expiresAt`

### 9. Legacy
- SOP già pubblicate prima della feature gestite in modo esplicito e coerente

### 10. Nessuna regressione
- workflow SOP continua a funzionare
- presa visione continua a funzionare
- la SOP scaduta resta leggibile

### 11. Integrità tecnica
- `prisma generate` passa
- typecheck passa
- build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file modificati
2. campo dati introdotto
3. come hai implementato il calcolo della validità
4. come hai impostato il default 12 mesi
5. come hai gestito la ripubblicazione
6. come hai gestito i contenuti legacy già pubblicati
7. come hai mostrato badge e data di scadenza
8. come hai introdotto gli alert home
9. come hai gestito i permessi HM/HOO vs HOD/Operatore
10. conferma che la SOP scaduta resta consultabile
11. conferma che la task non introduce push o automazioni extra
12. esito `prisma generate`
13. esito typecheck
14. esito build
