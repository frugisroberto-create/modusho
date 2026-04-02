# Prompt per Claude Code — ModusHO
## PWA Push Notification — Fase 1 (solo SOP)

Lavora sul progetto già esistente di **ModusHO**.

---

## PREREQUISITI

Questo prompt assume che siano già stati implementati:

1. **Versione smartphone** — modalità consultazione e presa visione
2. **Infrastruttura PWA minima** — `public/manifest.json`, `public/sw.js`, meta tag nel layout, service worker registrato lato client in modo controllato

Se questi prerequisiti non sono presenti, segnalalo e fermati.

---

## OBIETTIVO

Implementare un sistema di **push notification** via PWA, limitato in questa fase alle **SOP**.

Il caso d’uso è questo:

**Una SOP viene pubblicata → gli utenti nel target audience della SOP ricevono una notifica push sul telefono → toccano la notifica → si apre ModusHO sulla SOP corretta → leggono e confermano presa visione.**

Questa fase riguarda **solo le SOP**.

Fuori scope in questa fase:
- Documenti
- Memo
- Brand Book
- Standard Book

---

## PRINCIPIO DI PRODOTTO

Le push notification di ModusHO servono a **una sola cosa**:

**avvisare l’utente che esiste una nuova SOP pubblicata da consultare o da prendere visione.**

Non servono a:
- notificare passaggi di workflow
- notificare review HM / ADMIN
- notificare return
- notificare note di redazione
- notificare attività amministrative
- fare marketing o comunicazioni generiche

La push è il collegamento tra:
- pubblicazione SOP
- consultazione su smartphone
- presa visione

---

## EVENTI CHE GENERANO NOTIFICA

### Notifica obbligatoria

| Evento | Destinatari | Messaggio |
|---|---|---|
| SOP passa a `PUBLISHED` per la prima volta | Tutti gli utenti nel target audience della SOP, escluso chi pubblica | `Nuova procedura: {titolo}` |
| SOP ripubblicata con `requiresNewAcknowledgment = true` | Tutti gli utenti nel target audience che devono riconfermare, escluso chi pubblica | `Aggiornamento procedura: {titolo}` |

### Non generano notifica

- SOP in `DRAFT`
- passaggi di review
- return
- archivio
- note workflow
- salvataggi intermedi
- ripubblicazione con `requiresNewAcknowledgment = false`

---

## RISOLUZIONE DEI DESTINATARI

Quando una SOP viene pubblicata, il sistema deve determinare chi notificare.

Il sistema ha già `ContentTarget`, che definisce il target audience del contenuto.

Gestire almeno questi casi:
- `targetType: DEPARTMENT`
- `targetType: ROLE`
- `targetType: USER`

### Logica richiesta
1. leggere i `ContentTarget` della SOP pubblicata
2. risolvere gli userId corrispondenti
3. deduplicare
4. escludere l’utente che ha eseguito la pubblicazione
5. escludere utenti inattivi/disabilitati
6. recuperare tutte le `PushSubscription` valide di ciascun utente
7. inviare la push a ogni subscription valida

---

## MODELLO DATI

### Nuova tabella: `PushSubscription`

```prisma
model PushSubscription {
  id        String   @id @default(cuid())
  userId    String
  endpoint  String   @unique
  p256dh    String
  auth      String
  createdAt DateTime @default(now())

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([userId])
}
```

Aggiungere nel modello `User`:

```prisma
pushSubscriptions PushSubscription[]
```

### Nessuna tabella `Notification`
Non creare uno storico notifiche nel database in questa fase.

Le push sono **best-effort**:
- se arrivano, bene
- se non arrivano, non blocca il sistema

---

## REGOLA SU ENDPOINT GIÀ ESISTENTI

Definire chiaramente questa regola:

Se una `PushSubscription.endpoint` esiste già:
- aggiorna i dati (`p256dh`, `auth`) se necessario
- riassocia la subscription all’utente corrente

Questo gestisce il caso in cui lo stesso device/browser venga usato da account diversi in momenti diversi.

---

## FLUSSO TECNICO

## 1. Subscription (client → server)

Quando l’utente usa ModusHO su smartphone:

1. il service worker è già registrato
2. il sistema può proporre l’attivazione notifiche
3. se l’utente accetta:
   - richiede permesso con `Notification.requestPermission()`
   - ottiene una `PushSubscription` via `pushManager.subscribe()`
   - invia la subscription al server
   - il server la salva nel database

### Quando chiedere il permesso
Non chiedere il permesso:
- al primo accesso
- al mount pagina
- al login
- alla home appena aperta

Chiederlo solo **dopo un’interazione positiva e contestuale**, coerente con il prodotto.

### Regola consigliata
Chiedere il permesso:
- dopo che l’utente ha completato almeno una presa visione su mobile

Mostrare un messaggio semplice tipo:
- `Vuoi ricevere una notifica quando ci sono nuove procedure da leggere?`

### Se l’utente rifiuta
Non riproporre subito il banner.
Memorizzare il dismiss almeno localmente lato client, così da non stressare l’utente a ogni refresh.

### Compatibilità browser
Se il browser non supporta:
- `Notification`
- `serviceWorker`
- `PushManager`

non mostrare nulla.

---

## 2. Invio push (server → device)

Quando una SOP passa a `PUBLISHED`:

1. la pubblicazione completa con successo
2. **solo dopo** la transazione completata, parte la logica push
3. risolvi i destinatari dai `ContentTarget`
4. recuperi le `PushSubscription`
5. invii la push con `web-push`

### Regola importante
L’invio push deve essere **best-effort**:
- errori push non devono far fallire la pubblicazione della SOP
- la response della route di pubblicazione non deve dipendere dal successo dell’invio push

### Implementazione pratica
Se non esiste un sistema di job/background processing, fai l’invio nel request flow ma gestisci gli errori in modo non bloccante.

---

## 3. Payload push

Payload minimo richiesto:

```json
{
  "title": "ModusHO",
  "body": "Nuova procedura: Check-in ospite VIP",
  "data": {
    "contentId": "xxx",
    "type": "SOP",
    "url": "/sop/xxx"
  }
}
```

### Regola importante sul deep link
Non usare hardcoded route tipo:
- `/hoo-sop/{id}`

La push deve aprire una route **coerente con la consultazione della SOP** e compatibile con l’utente che la riceve.

In questa fase, dato che la push è pensata per la consultazione mobile, il deep link deve aprire la vista consultativa corretta della SOP, non una vista HOO di governance.

Se nel progetto esiste già una route consultativa univoca e sicura, usa quella.
Se non esiste, segnalarlo chiaramente.

---

## 4. Ricezione push (service worker)

Estendere il service worker esistente `public/sw.js`, senza sovrascriverlo in modo distruttivo.

Aggiungere la gestione:

```js
self.addEventListener('push', (event) => {
  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: data.data
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
```

### Regola
Estendere il SW esistente.
Non riscriverlo da zero se c’è già infrastruttura PWA minima attiva.

---

## 5. Cleanup subscription scadute

Quando `web-push` restituisce errori come:
- `410 Gone`
- `404 Not Found`

eliminare la `PushSubscription` corrispondente dal database.

Questo gestisce:
- device disinstallati
- permessi revocati
- subscription non più valide

---

## API ENDPOINTS

### `POST /api/push-subscription`
Salva o aggiorna una subscription push.

**Autenticazione:** richiesta

**Body:**
```json
{
  "endpoint": "https://...",
  "keys": {
    "p256dh": "...",
    "auth": "..."
  }
}
```

### Logica
- se endpoint non esiste → crea
- se endpoint esiste → aggiorna e riassocia all’utente corrente
- salva `userId`, `endpoint`, `p256dh`, `auth`

---

### `DELETE /api/push-subscription`
Rimuove una subscription.

**Autenticazione:** richiesta

**Body:**
```json
{
  "endpoint": "https://..."
}
```

### Logica
- rimuove solo la subscription coerente con utente corrente + endpoint
- non cancellare subscription di altri utenti

---

## VAPID KEYS

### Script generazione
Creare:

- `scripts/generate-vapid-keys.ts`

Esempio:

```ts
import webpush from "web-push";

const vapidKeys = webpush.generateVAPIDKeys();

console.log("VAPID_PUBLIC_KEY=" + vapidKeys.publicKey);
console.log("VAPID_PRIVATE_KEY=" + vapidKeys.privateKey);
```

### Configurazione
Aggiungere in `.env.example`:

```env
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:tech@hocollection.it
```

La chiave pubblica è usata lato client.
La chiave privata resta server-side.

---

## INTEGRAZIONE NEL FLUSSO SOP

Il punto di aggancio è:

- `src/app/api/sop-workflow/[id]/approve/route.ts`

### Regola
Integrare la logica push **dopo** la pubblicazione SOP completata con successo.

### Approccio corretto
Usare una funzione di servizio dedicata, per esempio:

- `src/lib/push-notification.ts`

Questa funzione deve:
- ricevere `contentId` e `actorId`
- verificare che il contenuto sia una SOP pubblicata
- risolvere i destinatari
- inviare le push
- gestire cleanup subscription scadute
- non far fallire la pubblicazione se l’invio push ha errori

---

## COMPONENTE CLIENT: PERMESSO PUSH

Creare un componente client per la richiesta permesso push.

### Path consigliato
Non metterlo in un namespace `hoo`.
Usa un path condiviso, per esempio:
- `src/components/shared/push-permission-banner.tsx`

### Comportamento
- si attiva solo su mobile
- si attiva solo dopo almeno una presa visione completata
- non si attiva se browser non supporta push
- non si attiva se permesso già concesso o negato
- mostra un banner semplice, non invasivo

### Testo esempio
- `Vuoi ricevere una notifica quando ci sono nuove procedure da leggere?`

### Bottoni
- `Sì, attiva`
- `Non ora`

### Se l’utente accetta
- request permission
- subscribe
- salva subscription

### Se l’utente rifiuta o chiude
- non riproporre subito il banner
- salva un dismiss locale minimo

---

## DIPENDENZE

Verificare prima:

```bash
npm ls web-push
```

Se non presente:

```bash
npm install web-push
```

---

## FILE DA CREARE

| File | Descrizione |
|---|---|
| `src/lib/push-notification.ts` | servizio invio push per SOP |
| `src/app/api/push-subscription/route.ts` | API registrazione/rimozione subscription |
| `src/components/shared/push-permission-banner.tsx` | banner richiesta permesso push |
| `scripts/generate-vapid-keys.ts` | script generazione chiavi VAPID |

---

## FILE DA MODIFICARE

| File | Modifica |
|---|---|
| `prisma/schema.prisma` | aggiunta modello `PushSubscription` + relazione in `User` |
| `public/sw.js` | estensione con handler `push` e `notificationclick` |
| `src/app/api/sop-workflow/[id]/approve/route.ts` | invocazione push dopo pubblicazione SOP |
| `.env.example` | aggiunta variabili VAPID |

---

## FILE DA NON TOCCARE

- `CLAUDE.md`
- logica di approvazione esistente oltre l’aggancio push
- flusso presa visione
- desktop UX generale
- altri tipi contenuto fuori scope

---

## COSA QUESTA TASK NON FA

- non implementa caching offline
- non implementa notifiche per passaggi di workflow
- non implementa push per Documento/Memo/Book
- non crea uno storico notifiche nel database
- non implementa preferenze avanzate di notifica per utente
- non implementa email
- non implementa badge app
- non implementa install prompt

---

## VERIFICA ATTESA

### 1. Subscription
- utente mobile completa una presa visione
- compare banner permesso
- utente accetta → subscription salvata nel database
- utente rifiuta → banner non ricompare immediatamente

### 2. Invio push
- SOP pubblicata → push inviata ai destinatari del target audience
- chi pubblica non riceve la push
- utenti inattivi non ricevono la push
- subscription scaduta → rimossa dal database

### 3. Ricezione
- la notifica compare sul device
- tocco sulla notifica → apre ModusHO sulla SOP corretta in vista consultativa

### 4. Ripubblicazione
- se `requiresNewAcknowledgment = true` → push inviata
- se `requiresNewAcknowledgment = false` → nessuna push

### 5. VAPID
- script genera chiavi correttamente
- `.env.example` aggiornato

### 6. Nessuna regressione
- pubblicazione SOP funziona come prima
- presa visione funziona come prima
- desktop non è alterato inutilmente

### 7. Integrità tecnica
- `npx prisma generate` senza errori
- typecheck passa
- build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file creati
2. file modificati
3. come hai implementato la risoluzione destinatari dai `ContentTarget`
4. come hai integrato l’invio push nel flusso di pubblicazione SOP
5. come hai gestito il permesso push lato client
6. come hai esteso il service worker
7. come hai gestito il cleanup delle subscription scadute
8. conferma che la push è best-effort e non blocca la response
9. conferma che la fase è limitata alle sole SOP
10. esito `prisma generate`
11. esito typecheck
12. esito build
