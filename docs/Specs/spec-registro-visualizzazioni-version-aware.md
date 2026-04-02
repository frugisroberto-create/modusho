# Spec — Registro visualizzazioni e nuova conferma solo se necessaria

## Scopo

Gestire in modo semplice ma robusto la tracciabilità della visualizzazione di:

- SOP
- Documenti
- Memo

evitando però che ogni minima modifica generi automaticamente un nuovo processo di presa visione.

L’obiettivo è sapere:

- chi ha visto il contenuto
- quando lo ha visto
- quale versione ha visto
- se la nuova versione richiede oppure no una nuova conferma di visualizzazione

---

## Principio generale

Il sistema deve essere **version-aware**, ma non deve essere rigido in modo inutile.

Quindi:

- ogni visualizzazione deve essere collegata alla versione del contenuto
- una nuova versione **non** deve generare automaticamente una nuova richiesta di conferma
- la nuova richiesta deve partire solo se chi pubblica la nuova versione ritiene che la modifica sia rilevante

---

## Contenuti interessati

La logica si applica a:

- SOP
- Documenti
- Memo

Non è richiesta in questa fase per:
- Brand Book
- Standard Book

---

## Distinzione da mantenere

### 1. Visualizzazione
Evento tecnico/storico che registra che un utente ha aperto il contenuto.

Serve a sapere:
- chi ha aperto
- quando
- quale versione ha aperto

### 2. Conferma di visualizzazione / presa visione
Evento più forte, quando previsto dal modello del contenuto.

Serve a sapere:
- se la versione corrente richiede una nuova conferma
- chi l’ha confermata
- quando

---

## Regola chiave sulle nuove versioni

La pubblicazione di una nuova versione **non deve automaticamente** riattivare la presa visione.

Questo perché:
- molte modifiche possono essere minori
- non ha senso generare un nuovo obbligo per correzioni irrilevanti
- il sistema deve restare governabile

Quindi la decisione deve essere esplicita.

---

## Quando deve comparire la domanda

La domanda deve comparire **solo** quando si verifica questa condizione:

### Caso corretto
Una SOP già pubblicata in passato viene modificata e si sta pubblicando una nuova versione ufficiale.

In quel momento il sistema deve chiedere:

**“È stata generata una nuova versione della SOP. Questa modifica richiede una nuova conferma di visualizzazione?”**

---

## Quando NON deve comparire

La domanda **non** deve comparire:

- durante i salvataggi intermedi di bozza
- durante il lavoro editoriale in corso
- quando la SOP non è mai stata pubblicata prima
- quando si salva una modifica ma non si arriva ancora alla nuova pubblicazione ufficiale
- durante i semplici passaggi interni del workflow prima della pubblicazione

---

## Momento esatto corretto

La domanda deve apparire **al momento della pubblicazione della nuova versione** di una SOP già pubblicata in precedenza.

Non:
- al primo salvataggio
- non alla riapertura
- non in fase di edit
- non in fase di submit

Sì:
- nel punto in cui una nuova versione diventa la nuova versione ufficiale pubblicata

---

## Chi decide

La decisione deve essere chiesta a **chi sta pubblicando la nuova versione ufficiale**.

Nel modello attuale questo significa, in pratica:
- soprattutto **HOO**

La regola quindi non va costruita su “chi ha modificato”, ma su:
- **chi pubblica**

---

## Testo della domanda

Testo consigliato:

**“È stata generata una nuova versione della SOP. Questa modifica richiede una nuova conferma di visualizzazione?”**

Bottoni consigliati:

- **Sì, richiedi nuova conferma**
- **No, mantieni valida la visualizzazione precedente**

---

## Cosa succede se la risposta è SÌ

Se chi pubblica risponde **Sì**:

- la nuova versione viene pubblicata
- la nuova versione apre un nuovo ciclo di visualizzazione/conferma
- lo storico delle versioni precedenti resta disponibile
- la visualizzazione/conferma precedente non vale per la nuova versione
- il sistema può segnalare la nuova versione come da vedere / da confermare

In sostanza:
la nuova versione richiede una nuova presa visione.

---

## Cosa succede se la risposta è NO

Se chi pubblica risponde **No**:

- la nuova versione viene pubblicata
- non si apre un nuovo ciclo di conferma
- il sistema mantiene valida la visualizzazione precedente
- lo storico resta comunque versionato
- la nuova versione non genera un nuovo obbligo organizzativo

In sostanza:
la modifica viene considerata non sostanziale ai fini della nuova conferma.

---

## Caso di SOP mai pubblicata prima

Se la SOP viene pubblicata per la prima volta:

- non c’è una versione ufficiale precedente
- non ha senso chiedere confronto con una visualizzazione già esistente

Quindi:
- **nessuna domanda**
- segue la logica standard della prima pubblicazione

---

## Dati da tracciare

Per il registro visualizzazioni/conferme servono almeno:

- `contentId`
- `contentType`
- `versionId` oppure `versionNumber`
- `userId`
- `viewedAt`
- `acknowledgedAt`, se previsto
- eventuale stato della versione rispetto alla conferma

Per la gestione della nuova versione serve inoltre una decisione esplicita tipo:

- `requiresNewAcknowledgement = true/false`

oppure campo equivalente associato alla nuova versione pubblicata.

---

## Regola di storico

Il sistema non deve perdere lo storico precedente.

Quindi deve essere sempre possibile sapere:

- chi ha visto la versione 3
- chi ha visto la versione 4
- se la versione 4 ha richiesto o no una nuova conferma
- chi ha confermato la versione 4

---

## Regola UI nel contenuto

Dentro ogni SOP, Documento e Memo deve essere possibile vedere un registro leggibile con almeno:

- utente
- ultima visualizzazione
- versione visualizzata
- conferma sì/no
- data conferma

Per i contenuti che hanno una nuova versione con nuova conferma richiesta, il sistema deve rendere evidente che la versione corrente è ancora da confermare.

---

## Regola di semplicità

Il sistema non deve diventare inutilmente pesante.

Quindi:

- niente nuova conferma automatica a ogni versione
- niente richiesta su salvataggi intermedi
- decisione solo al momento della pubblicazione della nuova versione ufficiale
- decisione lasciata a chi pubblica

---

## Formula operativa finale

Quando viene pubblicata una nuova versione di una SOP già precedentemente pubblicata, il sistema deve chiedere a chi sta pubblicando se la modifica richiede una nuova conferma di visualizzazione.

Se la risposta è:
- **Sì** → la nuova versione apre un nuovo ciclo di visualizzazione/conferma
- **No** → la nuova versione viene pubblicata mantenendo valida la visualizzazione precedente

La domanda non deve comparire:
- durante i salvataggi di bozza
- durante l’editing
- per SOP mai pubblicate prima

---

## Sintesi finale pratica

### Prima pubblicazione
- nessuna domanda

### Nuova versione di SOP già pubblicata
- il sistema chiede se serve nuova conferma

### Modifica minima
- risposta: No

### Modifica sostanziale
- risposta: Sì

### Registro interno
Deve sempre mostrare:
- chi
- quando
- quale versione
- se la conferma è richiesta e se è avvenuta
