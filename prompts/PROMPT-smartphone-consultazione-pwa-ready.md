# Prompt per Claude Code — ModusHO
## Versione smartphone — modalità solo consultazione e presa visione

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Definire e implementare in modo chiaro la logica della **versione smartphone** dell'app.

La regola di prodotto è questa:

**la versione smartphone di ModusHO è esclusivamente una modalità di consultazione e presa visione, identica come principio per tutti i livelli di utenza.**

Questo vale per tutti i ruoli:
- Operatore
- HOD
- HM
- HOO

Su smartphone tutti devono poter:
- cercare contenuti
- navigare tra le sezioni contenuto
- leggere i contenuti
- vedere metadati essenziali
- confermare la propria presa visione quando richiesta

Su smartphone **non devono esistere** funzioni complesse, per nessun ruolo.

---

## PRINCIPIO DI PRODOTTO

La versione smartphone **non è** una versione ridotta del desktop con quasi tutte le funzioni.

È una modalità separata per uso rapido e frequente, orientata a:

1. ricerca
2. consultazione
3. presa visione

Tutto il resto deve essere escluso dal mobile.

Questa implementazione prepara la base per una futura integrazione PWA / push notification, ma **non** deve implementarla in questa task.

---

## BREAKPOINT MOBILE

Usa questa regola esplicita:

- **viewport < 768px = modalità smartphone**
- **viewport >= 768px = modalità desktop/tablet full**

Quindi:
- smartphone sotto 768px → consultazione + presa visione
- tablet / desktop da 768px in su → comportamento completo esistente

Non lasciare il breakpoint implicito.

---

## APPROCCIO TECNICO RICHIESTO

Non voglio una soluzione solo CSS con `display: none`.

Per le funzioni complesse su smartphone voglio un approccio strutturale:
- rilevazione esplicita del viewport mobile
- condizionamento del rendering a livello di componente
- **non renderizzare** su mobile le sezioni/funzioni complesse

Puoi usare un meccanismo centralizzato pulito, per esempio:
- hook tipo `useIsMobile()`
- oppure altra soluzione equivalente coerente col progetto

Ma la regola è:

**su mobile le funzioni complesse non devono solo essere nascoste: non devono proprio essere renderizzate.**

Questo è importante per:
- chiarezza
- performance
- riduzione bug
- sicurezza del comportamento UI

---

## PERIMETRO DELLA VERSIONE SMARTPHONE

Su smartphone, per tutti i ruoli, l'app deve servire principalmente a:

- usare la barra di ricerca
- accedere alle sezioni contenuto
- aprire contenuti
- leggere contenuti
- confermare presa visione

Le sezioni contenuto che devono restare accessibili su mobile sono:

- SOP
- Documenti
- Memo
- Brand Book
- Standard Book

---

## CONTENUTI SOP VISIBILI SU SMARTPHONE

Su smartphone devono essere visibili solo contenuti **pubblicati** e consultabili.

### Regola netta
Per tutti i ruoli, su mobile:
- mostrare solo contenuti `PUBLISHED`
- non mostrare SOP in `DRAFT`
- non mostrare SOP in `REVIEW`
- non mostrare contenuti in lavorazione o workflow attivo

Quindi:
- HOD su smartphone non deve vedere le SOP del proprio reparto in lavorazione
- HM su smartphone non deve vedere workflow da lavorare
- HOO su smartphone non deve vedere passaggi di approvazione complessi

Il mobile non serve a lavorare il workflow. Serve a consultare contenuti ufficiali e a confermare la presa visione personale.

---

## FUNZIONI CONSENTITE SU SMARTPHONE

Per tutti i ruoli, su smartphone devono essere consentite solo queste funzioni:

### 1. Ricerca
- barra di ricerca ben visibile
- risultati leggibili
- accesso rapido ai contenuti

### 2. Navigazione sezioni
- accesso alle sezioni contenuto
- liste contenuti leggibili
- apertura semplice del dettaglio

### 3. Lettura contenuti
- lettura pulita di SOP / Documenti / Memo / Book
- metadati essenziali
- layout mobile-first

### 4. Presa visione
- stato personale chiaro
- bottone `Confermo presa visione` quando richiesto
- aggiornamento corretto dello stato dopo conferma

---

## FUNZIONI DA ESCLUDERE SU SMARTPHONE

Questa esclusione vale per **tutti i ruoli**, senza eccezioni.

Su smartphone **non devono esserci**:

- workflow complesso
- editing di contenuti
- redazione SOP
- approvazioni articolate
- gestione di passaggi R/C/A
- registri visualizzazioni completi
- tabelle utenti estese
- cronologie pesanti
- note workflow
- dashboard di governance
- analytics
- gestione utenti
- gestione proprietà
- configurazioni avanzate
- strumenti di controllo o governo reparto/struttura

In sintesi:
**su smartphone nessun ruolo deve usare funzioni complesse.**

---

## NAVIGAZIONE MOBILE

La navigazione smartphone va esplicitamente adattata.

Per una modalità di consultazione rapida, la soluzione preferita è una **bottom navigation** semplice con accesso alle aree principali.

Per esempio:
- Ricerca
- SOP
- Documenti
- Memo
- Altro / Profilo

Non usare la stessa navigazione laterale desktop compressa in modo scomodo.

Se nel progetto esiste già una soluzione mobile coerente, riusala.
Se non esiste, introduci una navigazione mobile semplice e orientata alla consultazione.

---

## REGOLA UI GLOBALE SU SMARTPHONE

La UI mobile deve essere:

- molto pulita
- veloce
- leggibile
- orientata al contenuto
- orientata alla CTA principale

### Ogni schermata mobile deve privilegiare:
- titolo
- contenuto
- metadati essenziali
- stato personale
- CTA primaria

### E deve ridurre o eliminare:
- box secondari
- sezioni duplicate
- filtri complessi
- tabelle
- colonne multiple
- modali pesanti
- elementi di governance

---

## HOME SU SMARTPHONE

La home su smartphone deve essere una home **solo consultativa**, valida per tutti i ruoli.

### Deve contenere:
1. barra di ricerca
2. accesso rapido alle sezioni contenuto
3. eventuali contenuti da prendere visione
4. ultimi contenuti recenti in forma compatta

### Non deve contenere:
- KPI
- dashboard di ruolo
- attività SOP complesse
- elementi gestionali o di controllo

---

## PAGINA CONTENUTO SU SMARTPHONE

Quando si apre un contenuto su smartphone, la pagina deve essere orientata solo a:

- leggere
- capire rapidamente di cosa si tratta
- confermare presa visione, se richiesta

### Deve mostrare:
- titolo
- tipo contenuto
- metadati essenziali
- contenuto
- stato personale di presa visione
- bottone `Confermo presa visione` se applicabile

### Non deve mostrare:
- registro visualizzazioni completo
- informazioni sugli altri utenti
- cronologie workflow complesse
- strumenti di redazione
- note workflow
- strumenti di approvazione

---

## REGOLA SU SOP

Su smartphone una SOP deve essere leggibile molto bene.

### Per tutti i ruoli
La pagina SOP mobile deve servire a:
- leggere la SOP
- vedere il proprio stato personale
- confermare presa visione

### Non deve servire a:
- governare il workflow
- leggere registri completi
- approvare
- modificare
- redigere
- inserire note di processo

---

## REGOLA SU HOD / HM / HOO

Anche i ruoli più alti, su smartphone, devono avere una modalità semplificata.

Quindi:
- possono consultare contenuti nel proprio perimetro
- possono leggere
- possono confermare la propria presa visione personale

Ma **non** devono avere su mobile strumenti di governance avanzata.

Non voglio versioni mobile "quasi desktop" per HOD/HM/HOO.

---

## REGOLA DI COERENZA

La filosofia mobile deve essere la stessa per tutti:
- cambia il perimetro dei contenuti accessibili
- non cambiano le funzioni ammesse

Quindi:
- differenze di ruolo sì sui contenuti accessibili
- differenze di ruolo no sulle funzioni complesse su mobile, che restano escluse per tutti

---

## PREDISPOSIZIONE PWA (solo infrastruttura, nessuna funzionalità attiva)

Questa task **non implementa** la PWA né le push notification.

Deve però predisporre l'infrastruttura minima che rende immediata l'implementazione futura, senza impatto sull'esperienza utente attuale.

### 1. Web App Manifest

Creare `public/manifest.json` con:

```json
{
  "name": "ModusHO",
  "short_name": "ModusHO",
  "description": "Sistema di governance operativa - HO Collection",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#ffffff",
  "theme_color": "#1a1a1a",
  "icons": [
    {
      "src": "/icons/icon-192.png",
      "sizes": "192x192",
      "type": "image/png"
    },
    {
      "src": "/icons/icon-512.png",
      "sizes": "512x512",
      "type": "image/png"
    }
  ]
}
```

Il `theme_color` deve essere coerente con la palette del progetto. Se il progetto usa un colore primario diverso, adattalo.

Le icone possono essere placeholder generati programmaticamente (quadrato con iniziali "MH") — verranno sostituite in futuro.

Aggiungere nel layout principale (`src/app/layout.tsx`) i meta tag:

```html
<link rel="manifest" href="/manifest.json" />
<meta name="theme-color" content="#1a1a1a" />
<meta name="apple-mobile-web-app-capable" content="yes" />
<meta name="apple-mobile-web-app-status-bar-style" content="default" />
```

### 2. Service Worker vuoto

Creare `public/sw.js` con un service worker minimale che non intercetta nulla e non attiva cache:

```js
// ModusHO Service Worker — predisposizione PWA
// Non attivare cache o intercettazione fetch in questa versione
self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});
```

### 3. Registrazione service worker

Nel layout principale, registrare il service worker **solo lato client**:

```tsx
// In un componente client-side caricato dal layout, oppure nello stesso Providers
if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js');
  });
}
```

### 4. Cosa NON fare in questa task

- Non implementare caching offline
- Non implementare push notification
- Non mostrare banner "Installa app"
- Non aggiungere logica di subscription
- Non creare tabelle nel database per notifiche

Questa è **solo predisposizione strutturale**. Le funzionalità PWA verranno in un prompt dedicato successivo.

---

## COSA DEVI FARE

1. analizzare il comportamento attuale dell'app su viewport mobile `< 768px`
2. introdurre o usare un meccanismo centralizzato per distinguere mobile da desktop
3. identificare pagine, componenti e CTA che espongono funzioni complesse su mobile
4. fare in modo che tali funzioni su mobile **non vengano renderizzate**
5. mantenere forti e ben funzionanti:
   - ricerca
   - navigazione sezioni
   - lettura contenuti
   - conferma presa visione
6. assicurarti che la logica valga per tutti i ruoli
7. assicurarti che su mobile siano visibili solo contenuti pubblicati
8. adattare la navigazione mobile in modo semplice e coerente
9. predisporre l'infrastruttura PWA (manifest, service worker, meta tag)
10. non cambiare il desktop oltre quanto strettamente necessario
11. non introdurre nuove feature: solo allineamento del mobile alla regola di prodotto + infrastruttura PWA

---

## REGOLE IMPORTANTI

- non modificare `CLAUDE.md`
- non toccare la logica desktop se non necessario
- non creare eccezioni per HOD/HM/HOO su smartphone
- non lasciare su mobile funzioni complesse "per comodità"
- il mobile deve essere consultazione-first e conferma-first
- evitare soluzioni ibride confuse
- non limitarti a nascondere con CSS: non renderizzare le funzioni complesse su mobile
- la predisposizione PWA non deve attivare nessuna funzionalità visibile all'utente

---

## VERIFICA ATTESA

Verifica almeno questi punti:

### 1. Home mobile
- ricerca ben visibile
- accesso semplice alle sezioni contenuto
- nessuna dashboard complessa

### 2. Liste contenuti mobile
- leggibili
- pulite
- consultative
- solo contenuti pubblicati

### 3. Dettaglio SOP mobile
- lettura chiara
- metadati essenziali
- stato personale visibile
- bottone `Confermo presa visione` quando richiesto

### 4. Assenza funzioni complesse
Su mobile non devono comparire:
- workflow complesso
- editing
- registri completi
- governance
- approvazioni articolate

### 5. Coerenza tra ruoli
- tutti i ruoli rispettano la stessa filosofia mobile
- cambiano solo i contenuti accessibili
- non cambiano le funzioni complesse, che restano escluse per tutti

### 6. Navigazione mobile
- semplice
- coerente
- adatta a consultazione rapida

### 7. Rendering corretto
Le funzioni complesse su mobile non vengono renderizzate, non solo nascoste.

### 8. Infrastruttura PWA
- `public/manifest.json` presente e corretto
- `public/sw.js` presente e registrato
- meta tag nel layout
- icone placeholder presenti in `public/icons/`
- nessuna funzionalità PWA attiva (no cache, no push, no install prompt)

### 9. Integrità tecnica
- typecheck passa
- build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file modificati
2. file creati
3. quale meccanismo hai usato per distinguere mobile da desktop
4. quali funzioni complesse hai rimosso o non renderizzato su smartphone
5. come hai rafforzato la parte di consultazione
6. come hai mantenuto visibile e semplice la conferma di presa visione
7. come hai gestito la regola "solo contenuti pubblicati su mobile"
8. come hai adattato la navigazione mobile
9. cosa hai predisposto per la PWA
10. conferma che la regola vale per tutti i ruoli
11. conferma che il desktop non è stato alterato inutilmente
12. conferma che nessuna funzionalità PWA è attiva
13. esito typecheck
14. esito build
