# Prompt per Claude Code — ModusHO
## PROMPT-11 — The Vault (Core)
Lavora sul progetto già esistente di **ModusHO**.
## OBIETTIVO
Implementare il **core architetturale dello storage file** per ModusHO in modo production-ready.
Questa fase NON deve ancora completare tutta la UX di upload.
Deve costruire le fondamenta corrette per gestire:
- foto nei Memo
- foto nelle SOP
- documenti allegati a Memo e SOP
- accesso sicuro ai file
- metadata coerenti nel database
- compatibilità con 300 utenti totali / circa 100 contemporanei
Il risultato di questa fase deve essere un sistema robusto dove:
- i file NON stanno nel filesystem locale come soluzione finale
- i file stanno in un bucket compatibile S3
- il bucket è **privato**
- il database contiene i metadata
- i file sono legati ai contenuti in modo chiaro
- la logica di sicurezza è già prevista nel modello
---
## DECISIONI ARCHITETTURALI DA CONSIDERARE DEFINITIVE
### 1. Storage
Usare un **bucket compatibile S3**, con target primario:
- **Cloudflare R2**
L'implementazione deve essere scritta in modo abbastanza standard da restare compatibile anche con S3 classico, evitando lock-in inutili.
### 2. Bucket privato
Il bucket deve essere **privato**.
Nessun file deve essere accessibile tramite URL pubblico permanente.
### 3. I file non passano per il filesystem locale
Non usare `/public/uploads/...` come architettura finale.
Per test locali può esistere fallback temporaneo solo se già presente, ma questa fase deve impostare la soluzione corretta basata su object storage.
### 4. Metadata nel database
Il database NON deve contenere i file binari.
Deve contenere solo metadata e collegamenti ai contenuti.
### 5. Access control by design
Lo storage non va pensato come "carico un file e poi vediamo chi lo legge".
Il file deve essere considerato fin da subito parte del contenuto protetto.
Quindi ogni allegato eredita il perimetro RBAC del contenuto madre.
### 6. Modello ibrido contenuti
- **Memo**: immagini pensate per esperienza inline / galleria
- **SOP**: immagini di supporto visivo + allegati tecnici
- **Documenti**: file tecnici scaricabili
In questa fase NON serve ancora implementare tutto il rendering finale inline, ma il modello deve già supportarlo.
---
## COSA QUESTA FASE DEVE FARE
1. definire il modello dati allegati
2. configurare il client storage S3/R2
3. definire naming e path strategy dei file
4. creare il servizio server-side di gestione metadata allegati
5. preparare endpoint o funzioni di registrazione upload
6. introdurre regole di validazione tipo file / dimensione
7. preparare il terreno per upload diretto client-side nelle fasi successive
8. non rompere il resto del sistema
---
## COSA QUESTA FASE NON DEVE FARE
- non costruire ancora drag&drop finale sofisticato
- non costruire ancora gallery UI definitiva
- non costruire ancora editor a blocchi
- non implementare ancora tutta la logica presigned URL finale per visualizzazione/download
- non fare refactor ampi delle pagine contenuto
- non modificare `CLAUDE.md`
- non introdurre filesystem locale come soluzione principale
- non caricare file nel database
---
# PARTE 1 — MODELLO DATI ALLEGATI
## Obiettivo
Introdurre un modello allegati serio, unico e coerente per SOP e Memo, e possibilmente riusabile anche in futuro.
## Scelta raccomandata
Creare una tabella/entità dedicata tipo `Attachment`.
### Campi minimi richiesti
Il modello deve avere almeno:
- `id`
- `contentId` — riferimento al contenuto madre
- `contentType` — almeno `SOP` o `MEMO` (eventualmente estendibile)
- `kind` — `IMAGE` | `DOCUMENT`
- `originalFileName`
- `storedFileName`
- `mimeType`
- `fileSize`
- `storageKey` — path interno nel bucket
- `storageBucket` — nome bucket, utile per portabilità
- `uploadedById`
- `sortOrder`
- `isInline` — per distinguere immagini inline/galleria da allegati puri
- `createdAt`
### Campo opzionale utile
- `altText` o `caption` per immagini, se vuoi già preparare il modello
## Regole
1. ogni attachment appartiene a un contenuto preciso
2. ogni attachment eredita il perimetro di accesso dal contenuto madre
3. niente attachment orfani
4. niente path salvati in modo casuale o non deterministico
5. `sortOrder` serve già da ora per ordinamento immagini/allegati
---
# PARTE 2 — CONTENUTI SUPPORTATI IN QUESTA FASE
## Priorità
Questa fase deve supportare almeno:
- allegati su `SOP`
- allegati su `MEMO`
## Regola
Non estendere ora a tutto il dominio se complica troppo.
Costruisci però il modello in modo da poter riusare lo stesso Attachment system anche per altri contenuti in seguito.
---
# PARTE 3 — PATH STRATEGY E NAMING
## Obiettivo
Definire una strategia di naming pulita, leggibile e deterministicamente generabile.
## Regola generale
Lo storage key deve essere leggibile e strutturato per tipo contenuto e contesto.
### Struttura consigliata
Usare una path strategy simile a questa:
- `properties/{propertyCode}/sop/{contentId}/images/{attachmentId}-{sanitizedName}.{ext}`
- `properties/{propertyCode}/sop/{contentId}/documents/{attachmentId}-{sanitizedName}.{ext}`
- `properties/{propertyCode}/memo/{contentId}/images/{attachmentId}-{sanitizedName}.{ext}`
- `properties/{propertyCode}/memo/{contentId}/documents/{attachmentId}-{sanitizedName}.{ext}`
### Regole di naming
- filename originale conservato nei metadata
- filename salvato nello storage deve essere sanificato
- evitare spazi, caratteri strani, collisioni
- usare `attachmentId` nel nome per unicità
- non usare mai solo il nome originale dell'utente come storage key
## Perché
Questo ti permette:
- leggibilità
- debug più semplice
- export più semplice
- portabilità
- pulizia nel bucket
---
# PARTE 4 — CLIENT STORAGE / SERVIZIO SERVER-SIDE
## Obiettivo
Centralizzare tutta la logica storage in un servizio riusabile.
## Cosa creare
Creare un modulo server-side tipo:
- `src/lib/storage.ts`
oppure
- `src/lib/attachments/storage.ts`
### Responsabilità del modulo
- inizializzazione client S3 compatibile
- validazione configurazione env
- costruzione storage key
- utility per content type / extension
- utility per validazione MIME e dimensioni
- metodi riusabili per:
  - preparare upload
  - registrare metadata
  - costruire riferimenti file
## Regola
Nessuna logica storage sparsa in route casuali.
Centralizzare.
---
# PARTE 5 — CONFIGURAZIONE ENV
## Obiettivo
Preparare la configurazione necessaria per bucket R2 / S3 compatibile.
## Variabili attese
Prevedere almeno:
- `S3_ENDPOINT`
- `S3_REGION`
- `S3_ACCESS_KEY_ID`
- `S3_SECRET_ACCESS_KEY`
- `S3_BUCKET`
- eventuale `S3_PUBLIC_BASE_URL` solo se davvero serve
- eventuale `S3_FORCE_PATH_STYLE` se utile alla compatibilità
## Regola
- validare presenza delle variabili lato server
- errore chiaro se la configurazione manca
- non hardcodare nulla nel codice
## Nota
Aggiornare `.env.example` con placeholder chiari, senza credenziali vere.
---
# PARTE 6 — VALIDAZIONE FILE
## Obiettivo
Impedire che entrino file ingestibili, pericolosi o inutili.
## Distinguere due famiglie
### Immagini
Supportare almeno:
- `image/jpeg`
- `image/png`
- `image/webp`
### Documenti
Supportare almeno:
- `application/pdf`
- `application/vnd.openxmlformats-officedocument.wordprocessingml.document` (`.docx`)
- `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet` (`.xlsx`)
## Limiti consigliati
### Immagini
- max 5 MB
### Documenti
- max 20 MB
## Regole
- validare MIME type lato server
- validare dimensione lato server
- non fidarsi solo dell'estensione file
- restituire errori chiari e leggibili
---
# PARTE 7 — PREPARAZIONE ALL'UPLOAD DIRETTO CLIENT-SIDE
## Obiettivo
Questa fase NON deve ancora completare tutta la UX upload, ma deve preparare l'architettura corretta.
## Regola architetturale
L'upload finale dovrà essere:
- **client → bucket**
- non `client → Next.js server → bucket`
### Perché
Così:
- il server non si tiene i byte in RAM
- riduci carico lato app
- migliori scalabilità per 100 utenti contemporanei
- separi bene metadata e contenuto binario
## In questa fase
Preparare i mattoni per quel flusso:
- endpoint o funzione server per "preparare upload"
- generazione del record attachment o pre-record
- generazione della key
- restituzione dei dati necessari al client per il passaggio successivo
## Nota
Se preferisci, in questa fase puoi fermarti a:
- schema
- servizio storage
- metadata flow
- preparazione upload
senza completare ancora tutto il presigned upload finale.
Ma il design deve puntare chiaramente al client-side upload.
---
# PARTE 8 — RBAC DEGLI ALLEGATI
## Obiettivo
Impostare fin da ora la regola non negoziabile:
**un allegato segue il perimetro del contenuto madre**.
## Regola
Se un utente non può vedere la SOP o il Memo, non può vedere nemmeno i suoi attachment.
### Quindi
Il modello attachment non deve inventarsi permessi propri separati.
Deve ereditare:
- property
- reparto
- audience
- stato contenuto
- ruolo utente
dal contenuto a cui è collegato.
## Implicazione tecnica
Ogni futura API di download/view dovrà:
1. recuperare l'attachment
2. recuperare il contenuto madre
3. applicare RBAC sul contenuto madre
4. solo dopo concedere accesso
In questa fase non serve ancora completare la delivery finale, ma questa regola deve essere già chiara nel modello e nel servizio.
---
# PARTE 9 — PERFORMANCE E TENUTA
## Obiettivo
Preparare una base che non si sbricioli con:
- 300 utenti registrati
- circa 100 contemporanei
- upload e consultazione frequente di immagini e documenti
## Regole tecniche minime
1. niente file nel database
2. niente passaggio dei file grossi nel server Next.js come soluzione finale
3. query attachment paginabili dove serve
4. niente join inutili pesanti sulle liste
5. index utili sulle relazioni attachment → content
## Indici raccomandati
Sul modello attachment:
- `contentId`
- `contentType`
- `uploadedById`
- `createdAt`
---
# PARTE 10 — MIGRAZIONE PRISMA
## Obiettivo
Aggiornare lo schema Prisma in modo coerente.
## Cosa fare
- aggiungere il modello `Attachment`
- aggiungere eventuali enum necessari (`AttachmentKind`, `ContentType` riuso se già esiste)
- collegare il contenuto agli allegati nel modo più coerente con lo schema attuale
- eseguire migrazione
- eseguire `prisma generate`
## Regola
Non rompere le entità contenuto già esistenti.
Aggiungere il nuovo layer in modo non distruttivo.
---
# PARTE 11 — SEED MINIMO
## Obiettivo
Avere dati minimi utili per sviluppo e test.
## Cosa fare
Se il seed del progetto è gestibile, aggiungere pochi attachment demo coerenti:
- 1 immagine su una SOP
- 1 documento su una SOP
- 1 immagine su un Memo
Se questo complica troppo, puoi saltarlo in questa fase e dichiararlo nel riepilogo finale.
Ma se fattibile, meglio aggiungerli.
---
# PARTE 12 — FILE E COMPONENTI ATTESI
## File da creare o aggiornare
Almeno questi:
- `prisma/schema.prisma`
- `.env.example`
- `src/lib/storage.ts` oppure `src/lib/attachments/storage.ts`
- eventuali helper tipo `src/lib/attachments/validation.ts`
- eventuale endpoint/server action per preparazione upload
- eventuali tipi shared per attachment
## Importante
Questa fase NON deve ancora creare tutta la UI finale drag&drop, salvo piccoli componenti tecnici strettamente necessari.
---
# PARTE 13 — OUTPUT ATTESO
Alla fine di questa fase deve esistere:
1. modello `Attachment` nel database
2. servizio storage compatibile R2/S3
3. configurazione env chiara
4. strategia di naming/path definita e implementata
5. validazione file type e dimensioni
6. architettura pronta per upload diretto client-side
7. regola RBAC allegati già incorporata nel design
8. progetto compilabile
---
# PARTE 14 — VERIFICA FINALE OBBLIGATORIA
Verifica almeno questi punti:
1. Prisma migra correttamente
2. `prisma generate` passa
3. build completa passa
4. esiste un servizio storage centralizzato
5. esiste una strategia chiara di storage key
6. immagini e documenti hanno validazioni separate
7. il modello attachment è collegato ai contenuti senza ambiguità
8. il codice non dipende dal filesystem locale come soluzione finale
9. `.env.example` contiene la configurazione richiesta
10. il progetto resta coerente con futuro upload diretto client-side
---
# OUTPUT FINALE DA RESTITUIRE
Alla fine del lavoro, restituisci un riepilogo breve con:
1. file creati o modificati
2. modello Prisma aggiunto
3. variabili env richieste
4. struttura storage key adottata
5. tipi file e limiti implementati
6. cosa è già pronto per la fase successiva "Upload Engine"
7. eventuali parti volutamente non ancora implementate
