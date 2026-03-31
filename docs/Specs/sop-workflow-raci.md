# ModusHO — Mini-Spec Workflow SOP RACI

## Scopo

Definire il modello funzionale del workflow SOP in ModusHO secondo una logica RACI, basata su una **bozza unica condivisa**, con collaborazione strutturata tra i soggetti coinvolti e approvazione finale in capo a HOO.

Questo documento descrive il **modello di dominio** e le **regole funzionali**.  
Non definisce ancora nel dettaglio:
- implementazione database
- naming tecnico dei campi
- comportamento UI puntuale
- struttura finale del pannello
- dettaglio dei componenti frontend

---

## Premessa terminologica

Nel modello organizzativo si parla di **HOO**.

Nel sistema applicativo, il ruolo HOO è implementato tramite i profili:

- `ADMIN`
- `SUPER_ADMIN`

Quindi, in questa specifica:

- **HOO = ADMIN / SUPER_ADMIN**
- **A nel workflow SOP = ADMIN / SUPER_ADMIN**

---

## Principi base

1. La SOP esiste come **unica bozza condivisa**.
2. Non esistono copie separate della stessa procedura per i diversi attori.
3. Gli attori lavorano sulla stessa bozza, con:
   - **note sempre attive**
   - **storico salvataggi**
   - **allegati della bozza**
4. Il workflow è governato da una logica **RACI**:
   - **R = Responsible**
   - **C = Consulted**
   - **A = Accountable**
5. L’approvazione finale è sempre in capo ad **A**.
6. Quando la bozza è formalmente sottoposta a **C** e/o **A**, il testo entra in una fase di **lettura stabile**.
7. In questa fase, il testo può essere modificato **solo da R**.
8. Gli altri attori coinvolti possono sempre:
   - leggere
   - consultare lo storico salvataggi
   - inserire note
   - vedere gli allegati della bozza
9. La restituzione non è uno stato principale del documento, ma un **evento workflow** con nota obbligatoria.
10. La procedura pubblicata resta distinta dalla bozza in lavorazione.
11. Il workflow utilizza insieme:
   - **flag correnti** per rappresentare la situazione operativa attuale
   - **event log** per conservare la storia completa delle azioni

---

## Attori e ruoli RACI

### HOO
- è sempre **A = Accountable**
- approva o restituisce la bozza
- ha la responsabilità finale della procedura

### HM
Può assumere due ruoli diversi:

#### Caso 1 — nessun HOD coinvolto
- **HM = R**
- **HOO = A**

#### Caso 2 — HOD coinvolto
- **HM = C**
- **HOD = R**
- **HOO = A**

### HOD
Quando coinvolto:
- è **R = Responsible**
- è il proprietario operativo della bozza per il proprio reparto

---

## Avvio della SOP

L’avvio di una SOP è consentito a **HOO**, **HM** e **HOD**, secondo regole diverse in base al ruolo.

### HOD
L’HOD può avviare una SOP **solo per il proprio reparto**.

In questo caso:
- `HOD = R`
- `HM = C`
- `HOO = A`

Il reparto non è selezionabile liberamente, ma è determinato dal profilo utente.

### HM
L’HM può avviare una SOP e scegliere se coinvolgere o meno l’HOD nella redazione.

#### Se HM non coinvolge HOD
- `HM = R`
- `HOO = A`

#### Se HM coinvolge HOD
- `HOD = R`
- `HM = C`
- `HOO = A`

### HOO
HOO può avviare una SOP e scegliere se coinvolgere o meno l’HOD nella redazione.

#### Se HOO non coinvolge HOD
- `HM = R`
- `HOO = A`

#### Se HOO coinvolge HOD
- `HOD = R`
- `HM = C`
- `HOO = A`

---

## Modello del documento

La SOP è sempre una sola.

### Stati principali del documento
Gli stati principali del documento sono solo:

- `IN_LAVORAZIONE`
- `PUBBLICATA`
- `ARCHIVIATA`

Non si usano stati principali rigidi tipo:
- inviata
- reinviata
- restituita

Questi comportamenti vengono gestiti come:
- **flag correnti**
- **eventi workflow**

---

## Bozza condivisa

La SOP in lavorazione è una **bozza condivisa** tra i soggetti coinvolti nel processo.

### Regole
- quando uno dei soggetti autorizzati salva il testo, aggiorna la **bozza condivisa**
- la bozza aggiornata è visibile agli altri soggetti coinvolti
- la bozza non è visibile ai lettori finali come contenuto pubblicato
- ogni salvataggio esplicito del testo crea una **nuova versione**
- la versione pubblicata resta distinta dalle versioni di lavoro

### Informazioni minime da mostrare
Per ogni bozza devono risultare visibili almeno:
- stato documento
- autore ultimo salvataggio
- data/ora ultimo salvataggio
- soggetti coinvolti
- eventuale sottoposizione a C
- eventuale sottoposizione ad A

---

## Versioni e storico salvataggi

Ogni salvataggio esplicito del testo della bozza genera una nuova versione.

### Obiettivo
Consentire ai soggetti coinvolti di:
- vedere le versioni precedenti
- capire chi ha modificato cosa e quando
- recuperare il contesto delle modifiche

### Regole
- lo storico versioni è accessibile solo ai soggetti coinvolti nella SOP:
  - `R`
  - `C`
  - `A`
- i lettori finali della SOP pubblicata non vedono lo storico delle bozze
- le note non generano nuove versioni del testo
- gli allegati non generano nuove versioni del testo, ma producono eventi nel log

---

## Note

Il campo note è sempre attivo per i soggetti coinvolti.

### Funzione delle note
Le note servono a:
- confronto operativo
- osservazioni di revisione
- richieste di integrazione
- restituzione formale da parte di A
- commenti su testo o allegati

### Regole
- le note sono separate dal testo della SOP
- ogni nota deve essere tracciata con:
  - autore
  - data/ora
- le note restano consultabili nel tempo
- le note non sostituiscono il testo della procedura
- le note non generano nuove versioni del testo

### Chi può creare note
Possono creare note solo i soggetti coinvolti nella SOP:
- `R`
- `C`
- `A`

---

## Allegati della bozza

Gli allegati fanno parte della bozza di SOP e seguono il suo ciclo di lavorazione.

### Funzione degli allegati
Gli allegati servono a:
- documentare esempi operativi
- aggiungere immagini, screenshot, PDF o altri riferimenti utili
- supportare la costruzione della procedura
- entrare nella versione finale pubblicata se ancora presenti al momento dell’approvazione

### Regole generali
- gli allegati sono parte della bozza
- gli allegati sono visibili ai soggetti coinvolti:
  - `R`
  - `C`
  - `A`
- gli allegati presenti nella bozza al momento dell’approvazione finale diventano gli allegati della SOP pubblicata, salvo rimozione prima della pubblicazione

### Regole operative
#### In lavorazione
- `R` può aggiungere, rimuovere e organizzare gli allegati
- `C` e `A` possono vedere gli allegati
- `C` e `A` possono usare le note per commentarli

#### Quando la bozza è sottoposta a C e/o A
- `R` può ancora aggiungere o rimuovere allegati
- `C` e `A` non modificano il set allegati
- `C` e `A` restano in sola lettura sugli allegati e possono usare le note

#### Dopo restituzione
- `R` riprende pieno controllo operativo della bozza, inclusi gli allegati

### Tracciabilità
Gli allegati devono produrre eventi nel workflow log, per esempio:
- allegato aggiunto
- allegato rimosso
- allegato sostituito

Gli allegati non generano versioni del testo della SOP.

---

## Sottoposizione a C e A

La bozza non viene “inviata” come oggetto separato.  
Resta sempre la stessa bozza.

Ciò che cambia è il suo livello di formalizzazione verso i soggetti RACI.

### Concetto
La bozza può essere:
- sottoposta a **C**
- sottoposta ad **A**
- sottoposta a **C e A** contemporaneamente

### Significato
#### Sottoposta a C
La bozza viene portata formalmente all’attenzione del soggetto **Consulted** per visione/commento.

#### Sottoposta ad A
La bozza viene portata formalmente all’attenzione del soggetto **Accountable** per valutazione e decisione.

#### Sottoposta a entrambi
La bozza viene portata formalmente all’attenzione sia di **C** sia di **A**.

### Regola fondamentale
La sottoposizione non crea una nuova copia del documento.  
Aggiorna solo il workflow attorno alla bozza esistente.

---

## Flag correnti e log del workflow

Il workflow usa insieme:

### 1. Flag correnti
Servono a descrivere la situazione attuale della bozza.

Per esempio:
- bozza attualmente sottoposta a C
- bozza attualmente sottoposta ad A

### 2. Event log
Serve a descrivere tutta la storia del workflow.

Per esempio:
- chi ha sottoposto la bozza
- quando
- chi ha restituito
- quando
- con quale nota

### Regola confermata
Il modello usa **entrambi**:
- flag correnti per lo stato operativo immediato
- event log per la storia completa

---

## Tracciamento della sottoposizione

La sottoposizione a C e A non deve essere tracciata con un semplice booleano puro.

Deve essere tracciata almeno con:
- **timestamp**
- **autore**

Quindi il sistema deve poter esprimere concetti come:
- bozza sottoposta a C da X il giorno/ora Y
- bozza sottoposta ad A da X il giorno/ora Y

---

## Effetto della sottoposizione

Quando la bozza è sottoposta a **C** e/o **A**:

- il testo entra in **lettura stabile**
- il testo può essere modificato **solo da R**
- `C` e `A` possono:
  - leggere
  - consultare lo storico
  - inserire note
  - vedere gli allegati della bozza

### Regola UX obbligatoria
Se un soggetto diverso da **R** prova a modificare il testo in questa fase, il sistema deve mostrare un messaggio chiaro.

### Testo consigliato del messaggio
> Questa bozza è attualmente sottoposta a revisione. Il testo può essere modificato solo dal responsabile operativo della procedura. Puoi comunque lasciare note.

---

## Durata dei flag

### Flag verso C
Il flag verso **C** resta attivo fino a quando **R salva una nuova versione del testo**.

### Flag verso A
Il flag verso **A** resta attivo fino a quando **A**:
- approva
oppure
- restituisce

---

## Restituzione

La restituzione non è uno stato principale del documento.  
È un **evento workflow**.

### Significato
La restituzione avviene quando **A** valuta la bozza e decide che non è ancora approvabile.

### Regole
- la restituzione può essere effettuata solo da **A**
- la restituzione richiede una **nota obbligatoria**
- il **flag verso A si spegne**
- la bozza resta la stessa
- la procedura torna nella fase di lavoro attivo
- il soggetto **R** riprende il lavoro sul testo
- la nota di restituzione resta visibile e tracciata
- l’evento di restituzione deve restare nello storico workflow

---

## Approvazione finale

L’approvazione finale può essere effettuata solo da **A**.

### Regole
- solo **HOO / ADMIN / SUPER_ADMIN** approva e pubblica
- l’approvazione finale coincide con la **pubblicazione**
- non esiste un passaggio separato approvazione → pubblicazione
- dopo pubblicazione, il documento esce dal ciclo di lavorazione

---

## Regole operative per ruolo

### R
- lavora sul testo
- salva la bozza condivisa
- crea nuove versioni del testo
- può continuare a modificare il testo anche quando la bozza è sottoposta a C/A
- può gestire gli allegati della bozza
- riceve la restituzione di A

### C
- legge la bozza
- inserisce note
- consulta storico salvataggi
- vede gli allegati
- non modifica il testo quando la bozza è sottoposta
- non modifica gli allegati quando la bozza è sottoposta
- non approva la pubblicazione

### A
- legge la bozza
- inserisce note
- consulta storico salvataggi
- vede gli allegati
- approva oppure restituisce
- non è necessariamente autore operativo del testo

---

## Regole di visibilità della bozza

La bozza in lavorazione deve essere visibile solo ai soggetti coinvolti nella redazione della SOP.

### Devono poterla vedere
- `R`
- `C`, se presente
- `A`

### Non devono poterla vedere come bozza di lavoro
- lettori finali
- utenti fuori perimetro
- altri reparti non coinvolti
- operatori non interessati dalla procedura

---

## Concorrenza

Per la prima implementazione non è previsto co-editing live.

### Regole
- non esiste modifica simultanea in tempo reale del testo
- il testo si salva in modo esplicito
- se un altro soggetto ha salvato una nuova versione dopo l’apertura della bozza, il sistema deve mostrare un avviso

### Obiettivo
Evitare sovrascritture silenziose e ridurre conflitti di editing.

---

## Pannello personale di lavoro

Ogni SOP in lavorazione deve apparire nel pannello dei soggetti coinvolti.

La priorità e il significato della bozza nel pannello dipendono dal ruolo assunto nella specifica SOP.

### Pannello di A (HOO / ADMIN / SUPER_ADMIN)
A deve vedere almeno:

1. bozze sottoposte ad A e in attesa di decisione
2. bozze restituite e non ancora rielaborate
3. bozze in lavorazione dove è coinvolto come A, anche se non ancora sottoposte

### Pannello di R
R deve vedere almeno:
1. bozze in lavorazione di cui è responsabile
2. bozze sottoposte a C/A
3. bozze restituite da A e da correggere

### Pannello di C
C deve vedere almeno:
1. bozze sottoposte a C
2. bozze in cui è coinvolto come consultato
3. bozze dove ha lasciato note o deve esprimere osservazioni

### Informazioni minime nel pannello
Ogni voce deve mostrare almeno:
- titolo SOP
- struttura
- reparto
- ruolo del soggetto su quella SOP (`R`, `C`, `A`)
- stato documento
- stato workflow attuale
- ultimo salvataggio (chi + quando)

---

## Eventi workflow minimi da tracciare

Il sistema deve poter tracciare almeno questi eventi:

- creazione bozza
- salvataggio bozza
- aggiunta nota
- aggiunta allegato
- rimozione allegato
- sostituzione allegato
- sottoposizione a C
- sottoposizione ad A
- sottoposizione a entrambi
- restituzione da A con nota
- approvazione finale da A
- pubblicazione

---

## Decisioni già fissate

1. La bozza è unica e condivisa
2. Le note sono sempre attive
3. Esiste storico salvataggi
4. Gli allegati fanno parte del processo di bozza
5. HOO è sempre A
6. Se HOD è coinvolto:
   - HOD = R
   - HM = C
7. Se HOD non è coinvolto:
   - HM = R
   - HOO = A
8. HOD può avviare una SOP solo per il proprio reparto
9. HM e HOO possono decidere se coinvolgere o meno HOD
10. Quando la bozza è sottoposta a C/A:
   - testo in lettura stabile
   - solo R modifica il testo
   - C e A usano note e storico
11. La restituzione è un evento con nota obbligatoria
12. L’approvazione finale coincide con la pubblicazione
13. HOO nel processo equivale a ADMIN / SUPER_ADMIN nel sistema
14. Workflow tecnico basato su flag correnti + event log
15. Ogni salvataggio del testo crea una nuova versione
16. Le note non creano versioni del testo
17. Gli allegati producono eventi nel log ma non nuove versioni del testo
18. Il flag verso C resta acceso fino a nuova versione salvata da R
19. Il flag verso A resta acceso fino a approvazione o restituzione
20. Non è previsto co-editing live nella prima implementazione

---

## Punti da tradurre nella fase tecnica successiva

Questa mini-spec non decide ancora in dettaglio:
- naming tecnico dei campi
- struttura database definitiva
- se i flag correnti sono campi diretti, viste derivate o altra soluzione tecnica
- comportamento UI puntuale di editor, badge e banner
- eventuale lock ottimistico / controllo versione tecnico
- dettaglio dei componenti frontend

Questi punti saranno definiti nella prompt tecnica successiva.

---

## Obiettivo della prossima fase

Tradurre questo modello in:
- struttura tecnica coerente
- flusso workflow implementabile
- UI editor coerente con i ruoli `R`, `C`, `A`
- tracciabilità completa di note, salvataggi, allegati ed eventi                                


## Scadenza di revisione della SOP

Ogni SOP pubblicata deve avere una **scadenza di revisione**.

### Regole
- la scadenza viene impostata al momento della **pubblicazione**
- la scadenza viene ricalcolata a ogni **ripubblicazione dopo revisione**
- il valore di default è **12 mesi**
- la scadenza può essere modificata solo da **A**

### Effetto della scadenza
Alla scadenza:
- la SOP resta **pubblicata**
- la SOP resta **leggibile**
- la SOP viene segnalata come **necessita revisione**

### Segnalazione
La segnalazione di SOP che necessita revisione deve comparire almeno a:
- `HM`
- `HOO` (`ADMIN` / `SUPER_ADMIN`)

### Regola
La scadenza non archivia automaticamente la SOP e non ne blocca la lettura.
Produce una condizione di governance che richiede una revisione del contenuto.

