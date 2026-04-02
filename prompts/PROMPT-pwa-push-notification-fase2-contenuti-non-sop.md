# Prompt per Claude Code — ModusHO
## PWA Push Notification — Fase 2 (Documenti, Memo, Brand Book, Standard Book)

Lavora sul progetto già esistente di **ModusHO**.

---

## PREREQUISITI

Questo prompt assume che siano già stati implementati e stabilizzati:

1. **Versione smartphone** — modalità consultazione e presa visione
2. **Infrastruttura PWA minima** — manifest, service worker, registrazione controllata
3. **PWA Push Notification — Fase 1 (solo SOP)** già funzionante

Se questi prerequisiti non sono presenti, segnalalo e fermati.

---

## OBIETTIVO

Estendere il sistema di **push notification** via PWA già implementato per le SOP anche agli altri contenuti pubblicati:

- Documenti
- Memo
- Brand Book
- Standard Book

Questa fase deve **riusare l’infrastruttura della Fase 1**:
- `PushSubscription`
- service worker
- banner permesso push
- VAPID
- logica invio best-effort
- cleanup subscription scadute

Non voglio un nuovo sistema.  
Voglio estendere il motore esistente in modo pulito e coerente.

---

## PRINCIPIO DI PRODOTTO

Le push notification di ModusHO servono a **una sola cosa**:

**avvisare l’utente che esiste un nuovo contenuto pubblicato da consultare o da prendere visione.**

Questo principio resta identico alla Fase 1.

Le push **non** servono a:
- notificare passaggi di workflow
- notificare approvazioni
- notificare return
- notificare note redazionali
- notificare attività amministrative
- creare un centro notifiche interno
- fare marketing o comunicazioni generiche

---

## SCOPE DELLA FASE 2

Questa fase estende le push a questi contenuti:

- `DOCUMENT`
- `MEMO`
- `BRAND_BOOK`
- `STANDARD_BOOK`

Le SOP sono già coperte in Fase 1 e non vanno rifatte.

---

## REGOLA EVENTI CHE GENERANO PUSH

### Generano notifica
Un contenuto genera push quando passa a **`PUBLISHED`** in modo effettivo.

### Per questa fase
Gestire:
- prima pubblicazione
- eventuale ripubblicazione **solo se** nel contenuto esiste una logica coerente di nuova presa visione / nuova conferma

### Non generano notifica
- `DRAFT`
- passaggi intermedi di review
- return
- archiviazione
- note workflow
- salvataggi intermedi
- modifiche che non portano a una nuova pubblicazione effettiva

---

## REGOLA IMPORTANTE SULLA RIPUBBLICAZIONE

Per SOP esiste già la logica `requiresNewAcknowledgment`.

Per gli altri contenuti non voglio assunzioni arbitrarie.

### Cosa devi fare
Verificare se per:
- Documenti
- Memo
- Brand Book
- Standard Book

esiste già nel progetto una logica equivalente per distinguere:
- semplice ripubblicazione senza nuova presa visione
- nuova versione che richiede nuova presa visione

### Regola
- se esiste una logica chiara e già supportata, usala
- se non esiste, in questa fase limita la push alla **prima pubblicazione**
- non inventare nuovi flag o nuovi modelli solo per questa task

---

## RISOLUZIONE DESTINATARI

La logica di risoluzione destinatari deve restare coerente con la Fase 1.

Usare `ContentTarget` come fonte.

Gestire almeno:
- `DEPARTMENT`
- `ROLE`
- `USER`

### Logica richiesta
1. leggere i `ContentTarget` del contenuto pubblicato
2. risolvere gli userId
3. deduplicare
4. escludere l’utente che ha pubblicato
5. escludere utenti inattivi/disabilitati
6. recuperare tutte le `PushSubscription` valide
7. inviare la push a ogni subscription valida

### Regola sul fallback senza target
Non lasciare fallback impliciti.

Usa la stessa regola business definita/approvata nella rifinitura finale della Fase 1.
Non introdurre una regola diversa per questi contenuti.

---

## PAYLOAD PUSH

Riutilizzare il formato della Fase 1, adattandolo al contenuto.

Payload minimo:

```json
{
  "title": "ModusHO",
  "body": "Nuovo documento: Procedura accoglienza gruppi",
  "data": {
    "contentId": "xxx",
    "type": "DOCUMENT",
    "url": "/documents/xxx"
  }
}
```

### Regola messaggi
Usare un body coerente col tipo contenuto:

- SOP → `Nuova procedura: {titolo}`
- Documento → `Nuovo documento: {titolo}`
- Memo → `Nuovo memo: {titolo}`
- Brand Book → `Aggiornamento Brand Book: {titolo}` oppure formula coerente
- Standard Book → `Aggiornamento Standard Book: {titolo}` oppure formula coerente

### Regola importante sul deep link
Non usare route hardcoded sbagliate o di governance.

Ogni push deve aprire la **route consultativa corretta** del tipo contenuto.

Verificare e usare route corrette per:
- SOP
- Documenti
- Memo
- Brand Book
- Standard Book

Se qualche tipo contenuto non ha una route consultativa univoca e sicura, segnalarlo chiaramente e non improvvisare.

---

## ARCHITETTURA RICHIESTA

Non duplicare la logica.

La Fase 1 aveva già introdotto, per esempio:
- `src/lib/push-notification.ts`

La Fase 2 deve trasformare quel servizio in qualcosa di più generale e riusabile, senza rompere la SOP.

### Obiettivo
Passare da:
- servizio push solo SOP

a:
- servizio push per contenuti pubblicati supportati

### Regola
Non fare copia-incolla per tipo contenuto.
Centralizza:
- costruzione destinatari
- costruzione payload
- invio push
- cleanup subscription scadute

---

## INTEGRAZIONE AI PUNTI DI PUBBLICAZIONE

Questo è il punto più importante della Fase 2.

Devi individuare con precisione **dove** nel codice questi contenuti diventano `PUBLISHED`:

- Documenti
- Memo
- Brand Book
- Standard Book

### Cosa devi fare
1. identificare i punti di pubblicazione reali nel progetto
2. integrare l’invocazione push **dopo** la pubblicazione riuscita
3. non toccare inutilmente logiche esistenti
4. mantenere l’invio push best-effort

### Regola
Se i punti di pubblicazione non sono uniformi:
- integrali dove serve
- ma centralizza la chiamata al servizio push

---

## BANNER PERMESSO PUSH

Il banner lato client della Fase 1 deve restare il punto unico di richiesta permesso.

### Regola
Non creare un secondo banner.
Non cambiare la filosofia.

Il banner già esistente va bene se:
- resta mobile-only
- resta non invasivo
- continua a comparire solo dopo un’interazione positiva utile

Se serve, aggiorna solo il testo in modo leggermente più generale, per esempio:
- `Vuoi ricevere una notifica quando ci sono nuovi contenuti da leggere?`

Ma fallo solo se coerente e senza peggiorare la UX.

---

## SERVICE WORKER

Riutilizzare il service worker già esteso nella Fase 1.

### Regola
Non creare un nuovo SW.
Non cambiare il paradigma.

Aggiorna solo quanto necessario per supportare correttamente:
- payload dei nuovi tipi contenuto
- apertura della route consultativa corretta

---

## COSA QUESTA TASK NON FA

Questa fase **non** deve introdurre:

- notifiche per passaggi di workflow
- notifiche per attività redazionali interne
- storico notifiche nel database
- centro notifiche in app
- preferenze avanzate utente per tipo notifica
- email
- badge app
- reminder automatici ai non letti
- digest
- nuove tabelle di dominio non necessarie

---

## FILE DA TOCCARE

Tocca solo i file necessari per:
- estendere il servizio push
- integrare i punti di pubblicazione reali dei contenuti
- aggiornare eventualmente il banner/client text
- aggiornare eventuali mapping deep link per tipo contenuto

Non fare refactor ampio fuori scope.

---

## REGOLE IMPORTANTI

- non modificare `CLAUDE.md`
- non rifare la Fase 1 SOP
- non rompere la logica già funzionante per SOP
- non introdurre nuove feature di prodotto non richieste
- mantieni l’invio push **best-effort**
- mantieni la configurazione VAPID e subscription già esistente
- non creare differenze arbitrarie tra i tipi contenuto

---

## VERIFICA ATTESA

Verifica almeno questi punti:

### 1. Documento pubblicato
- genera push
- apre il documento corretto

### 2. Memo pubblicato
- genera push
- apre il memo corretto

### 3. Brand Book pubblicato
- genera push se il modello di pubblicazione lo consente in modo coerente
- apre la vista consultativa corretta

### 4. Standard Book pubblicato
- genera push se il modello di pubblicazione lo consente in modo coerente
- apre la vista consultativa corretta

### 5. Destinatari
- risoluzione da `ContentTarget`
- publisher escluso
- utenti inattivi esclusi
- deduplica corretta

### 6. Cleanup
- subscription 404/410 rimosse

### 7. Nessuna regressione SOP
- la logica push SOP già esistente continua a funzionare

### 8. Integrità tecnica
- `npx prisma generate` passa
- typecheck passa
- build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file modificati
2. quali punti di pubblicazione hai integrato per Documento / Memo / Brand Book / Standard Book
3. come hai generalizzato il servizio push
4. come hai costruito i payload per i diversi tipi contenuto
5. quali route consultative hai usato per ogni tipo contenuto
6. quale regola hai applicato sulla ripubblicazione dei contenuti non-SOP
7. conferma che la logica SOP Fase 1 non è stata alterata inutilmente
8. esito `prisma generate`
9. esito typecheck
10. esito build
