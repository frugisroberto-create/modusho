# Prompt per Claude Code — ModusHO
## Registro visualizzazioni e conferma version-aware SOP — Fase 1 (dominio + logica)

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Implementare la logica di dominio e persistenza per tracciare, sulle sole **SOP**:

- chi ha visualizzato la SOP
- quando l’ha visualizzata
- quale versione ha visualizzato
- se, per quella versione, è stata confermata la visualizzazione

Inoltre, quando una SOP già pubblicata viene ripubblicata in una nuova versione, il sistema non deve imporre automaticamente una nuova conferma di visualizzazione.  
Deve invece chiedere, al momento della nuova pubblicazione, se la modifica richiede oppure no una nuova conferma.

Questa prompt copre solo:
- modello dati / persistenza
- regole di dominio
- logica di versione
- comportamento alla pubblicazione della nuova versione SOP

Non copre ancora:
- UI completa del registro dentro la pagina SOP
- reportistica avanzata
- viste aggregate
- Memo
- Documenti
- Brand Book
- Standard Book

---

## PERIMETRO DEFINITIVO

Questa implementazione riguarda **esclusivamente le SOP**.

Fuori scope in questa fase:
- Documenti
- Memo
- Brand Book
- Standard Book

La logica di:
- registro visualizzazioni version-aware
- conferma visualizzazione
- decisione “richiede nuova conferma sì/no” alla nuova pubblicazione

deve essere implementata **solo per le SOP**.

Non estendere questa logica ad altri tipi contenuto in questa fase.

---

## PRINCIPIO GENERALE

Il sistema deve essere **version-aware**, ma non rigido in modo inutile.

Quindi:

- ogni visualizzazione deve essere riferita a una versione precisa della SOP
- ogni eventuale conferma deve essere riferita a una versione precisa
- una nuova versione non deve automaticamente riaprire la conferma
- la nuova conferma deve essere richiesta solo se chi pubblica la nuova versione lo decide esplicitamente

---

## DECISIONI FUNZIONALI VINCOLANTI

### 1. Distinzione eventi
Distinguere chiaramente tra:

#### Visualizzazione
Evento tecnico/storico:
- l’utente ha aperto la SOP

#### Conferma visualizzazione
Evento più forte:
- l’utente ha confermato formalmente la visualizzazione della versione corrente della SOP

La visualizzazione non equivale automaticamente a conferma.

---

### 2. Versione obbligatoria
Ogni record deve essere legato a una **versione precisa** della SOP.

Non basta sapere che un utente ha visto una SOP:
bisogna sapere quale versione ha visto.

---

### 3. Nuova versione di SOP già pubblicata
Quando una SOP già pubblicata viene pubblicata in una nuova versione, il sistema deve chiedere a chi la sta pubblicando:

**“È stata generata una nuova versione della SOP. Questa modifica richiede una nuova conferma di visualizzazione?”**

Risposte possibili:
- **Sì, richiedi nuova conferma**
- **No, mantieni valida la visualizzazione precedente**

---

### 4. Quando la domanda compare
La domanda compare **solo** in questo caso:

- la SOP era già stata pubblicata in passato
- si sta pubblicando una nuova versione ufficiale della SOP

La domanda **non** deve comparire:
- durante i salvataggi di bozza
- durante editing intermedi
- alla riapertura
- al submit verso C/A
- alla prima pubblicazione assoluta della SOP

---

### 5. Effetto della risposta

#### Se la risposta è SÌ
- la nuova versione viene pubblicata
- la nuova versione apre un nuovo ciclo di visualizzazione/conferma
- la conferma precedente non vale più per la nuova versione

#### Se la risposta è NO
- la nuova versione viene pubblicata
- non si apre un nuovo ciclo di conferma
- la conferma precedente resta valida anche per la nuova versione

---

### 6. Prima pubblicazione
Alla prima pubblicazione della SOP:
- la domanda non deve comparire

La prompt non deve alterare la logica standard già esistente della prima pubblicazione.
Introduce solo la decisione sulla nuova conferma per le **versioni successive**.

---

## COSA DEVI IMPLEMENTARE

## FIX 1 — Modello dati / persistenza

Implementare la persistenza minima necessaria per tracciare, sulle SOP:

- visualizzazioni version-aware
- conferme version-aware
- decisione sulla nuova conferma in caso di nuova versione pubblicata

### Requisiti minimi
Per ogni SOP/versione/utente devono essere tracciabili almeno:

- `contentId`
- `versionId` oppure `versionNumber`
- `userId`
- `viewedAt`
- `acknowledgedAt` (se confermata)
- indicazione se la versione richiede nuova conferma oppure no

Se il progetto ha già una struttura dati adatta, estenderla.
Se non esiste, creare il modello minimo coerente col sistema.

### Regola importante
Non creare overengineering.
Serve il minimo modello robusto per:
- tracciare la visualizzazione
- tracciare la conferma
- capire se la versione corrente richiede nuova conferma

---

## FIX 2 — Logica di registrazione visualizzazione

Implementare la logica per registrare che un utente ha visualizzato una certa versione della SOP.

### Regola
L’evento deve essere legato alla versione corrente visualizzata.

### Regola di pulizia dati
Mantenere un record logico per:
- utente
- SOP
- versione

Se la stessa versione viene riaperta più volte:
- aggiornare `viewedAt` all’ultima visualizzazione utile
- non creare duplicati inutili

### Obiettivo
Il sistema deve poter sapere:
- chi ha visto
- quando
- quale versione ha visto

Non è necessario in questa fase costruire tutta la UI del registro.

---

## FIX 3 — Logica di conferma visualizzazione

Implementare la logica per registrare la conferma di visualizzazione della versione corrente della SOP.

### Regola
La conferma deve essere separata dalla semplice visualizzazione.

### Obiettivo
Il sistema deve poter sapere:
- se l’utente ha confermato
- quando
- per quale versione

### Importante
In questa fase si implementa la capacità di registrare la conferma, senza definire ancora tutta la UI finale del flusso.

---

## FIX 4 — Logica di pubblicazione nuova versione SOP

Intervenire nel punto in cui viene pubblicata una nuova versione di una SOP già pubblicata in precedenza.

### Comportamento richiesto
Quando si arriva alla pubblicazione di una nuova versione:
- il sistema deve poter ricevere la scelta:
  - richiede nuova conferma = sì/no

### Se sì
La nuova versione deve risultare come nuova versione che richiede nuova conferma.

### Se no
La nuova versione deve risultare pubblicata mantenendo valida la conferma precedente.

### Importante
Questa logica vale solo per SOP già pubblicate in precedenza.
Non per la prima pubblicazione.

---

## FIX 5 — API / funzioni di dominio minime

Aggiungere le funzioni/route minime necessarie per:

1. registrare visualizzazione di una versione SOP
2. registrare conferma di visualizzazione di una versione SOP
3. supportare la decisione “richiede nuova conferma” nel momento della pubblicazione di una nuova versione SOP

Non fare ancora:
- reportistica avanzata
- dashboard aggregate
- UI completa del registro

---

## REGOLE IMPORTANTI

- non modificare `CLAUDE.md`
- non fare UI pesante in questa fase
- non introdurre nuovi stati workflow per distinguere le versioni da confermare
- non cambiare il workflow SOP oltre quanto necessario per la decisione al momento della pubblicazione
- non rendere obbligatoria una nuova conferma a ogni nuova versione
- non confondere visualizzazione tecnica e conferma formale
- mantenere separati:
  - evento `view`
  - evento `acknowledged`
- non estendere questa logica a Documenti o Memo

---

## FILE / AREE DA TOCCARE

Tocca solo ciò che è necessario per:
- modello dati o persistenza
- logica di dominio
- eventuali API/azioni minime
- punto di pubblicazione nuova versione SOP

Non costruire ancora la sezione UI completa “Registro visualizzazioni”.

---

## VERIFICA ATTESA

Verifica almeno questi casi:

### Caso 1 — Visualizzazione
- un utente apre una SOP
- viene registrata la visualizzazione della versione corrente

### Caso 2 — Conferma
- un utente conferma la visualizzazione della versione corrente
- il sistema registra la conferma correttamente

### Caso 3 — Nuova versione SOP già pubblicata, risposta SÌ
- si pubblica una nuova versione
- si indica che serve nuova conferma
- la nuova versione risulta da riconfermare

### Caso 4 — Nuova versione SOP già pubblicata, risposta NO
- si pubblica una nuova versione
- si indica che non serve nuova conferma
- la conferma precedente resta valida

### Caso 5 — Prima pubblicazione SOP
- nessuna domanda deve comparire

### Caso 6 — Tracciabilità
- il sistema sa distinguere versione 3 vs versione 4
- e sa dire quale versione è stata vista o confermata

### Caso 7 — Integrità tecnica
- typecheck passa
- build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. modello dati/struttura usata per tracciare visualizzazioni e conferme SOP
2. file creati
3. file modificati
4. come hai gestito la registrazione delle visualizzazioni SOP
5. come hai gestito la conferma di visualizzazione SOP
6. come hai implementato la decisione “nuova conferma sì/no” alla pubblicazione di una nuova SOP
7. conferma che la nuova conferma non viene richiesta automaticamente a ogni nuova versione
8. conferma che Documenti e Memo non sono stati toccati
9. esito typecheck
10. esito build
