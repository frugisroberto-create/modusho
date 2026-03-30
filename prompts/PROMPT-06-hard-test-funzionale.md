# Prompt per Claude Code — ModusHO

## Hard Test funzionale/manuale del software

Lavora sul progetto già esistente di **ModusHO**.

Questa task è un **hard test pratico** dell’app già sviluppata.  
Non devi introdurre nuove feature. Devi testare ciò che esiste davvero e individuare tutto ciò che non funziona, è incoerente o rischioso.

---

## OBIETTIVO

Verificare in modo duro e realistico:

1. se l’app si avvia e compila
2. se i permessi funzionano davvero
3. se la logica property-first è rispettata
4. se la visibilità multi-reparto è corretta
5. se il workflow delle SOP è credibile e funzionante
6. se la UI è coerente con i livelli utente
7. se ci sono bug gravi da correggere prima dell’uso reale

Non correggere subito tutto.  
Prima fai una diagnosi completa e ordinata.

---

## FASE 1 — CHECK TECNICO RAPIDO

Esegui:

1. installazione dipendenze, se necessaria
2. typecheck
3. lint
4. build
5. avvio locale

Riporta:
- cosa passa
- cosa fallisce
- eventuali warning importanti

---

## FASE 2 — TEST PERMESSI PER LIVELLO

Testa almeno questi profili, se presenti nel seed o facilmente simulabili:

- OPERATORE
- HOD
- HM
- ADMIN

Per ciascuno verifica:

### Menu
- quali voci vede
- se vede voci che non dovrebbe vedere
- se mancano voci che dovrebbe vedere

### Azioni
- cosa può leggere
- cosa può creare
- cosa può modificare
- cosa può approvare

### Route protette
Prova ad aprire direttamente via URL:
- /users
- /settings
- /properties
- /governance
- /editorial
- create/edit pages
- eventuali pagine backstage

Verifica che:
- l’utente corretto entri
- l’utente sbagliato venga bloccato
- non esistano accessi indebiti

---

## FASE 3 — TEST PROPERTY-FIRST

Verifica che il sistema funzioni davvero come minisito di struttura.

Controlla:

- home della property corretta
- branding corretto
- nessun contenuto di altre strutture
- property switcher solo dove serve
- route di struttura diverse non accessibili a utenti non autorizzati

Casi da testare:
- utente Nicolaus
- utente Patria
- utente multi-struttura
- accesso diretto a record di altra struttura

---

## FASE 4 — TEST MULTI-REPARTO

Questa è una delle aree più critiche.

Testa:

1. utente con un solo reparto
2. utente con due reparti
3. contenuto visibile a un solo reparto
4. contenuto visibile a due reparti
5. contenuto visibile a tutta la struttura

Verifica che:
- home rispetti i reparti
- search rispetti i reparti
- SOP, memo e documenti rispettino i reparti
- acknowledgment coinvolga solo i destinatari giusti
- notifiche vadano solo ai destinatari giusti

Cerca bug tipo:
- contenuti visibili al reparto sbagliato
- contenuti nascosti a chi dovrebbe vederli
- search troppo larga
- memo visibili a reparti non destinatari

---

## FASE 5 — TEST WORKFLOW SOP

Verifica il workflow delle procedure nei tre casi previsti.

### Caso 1 — autore HOD
Flusso atteso:
HOD → HM → ADMIN → Pubblicata

Controlla:
- HOD crea bozza
- vede “Invia a HM”
- HM riceve davvero
- HM può modificare
- HM può rimandare indietro
- HM può inviare ad ADMIN
- ADMIN riceve davvero
- ADMIN può approvare e pubblicare
- la SOP resta invisibile nel front finché non è pubblicata

### Caso 2 — autore HM
Flusso atteso:
HM → ADMIN → Pubblicata

Controlla:
- HM crea bozza
- vede “Invia ad ADMIN”
- ADMIN riceve davvero
- ADMIN può approvare

### Caso 3 — autore ADMIN
Flusso atteso:
ADMIN → Pubblicata

Controlla:
- ADMIN crea bozza
- vede “Approva e pubblica”
- pubblicazione diretta funziona

Verifica anche:
- reviewer corrente corretto
- pulsanti coerenti
- rimando indietro corretto
- front/back separati bene

---

## FASE 6 — TEST FORM PRINCIPALI

Testa almeno questi form:

- creazione utente
- modifica utente
- creazione SOP
- modifica SOP
- creazione Memo
- modifica Memo
- creazione Documento
- settings / tag / categorie
- editorial / featured

Controlla:
- validazioni
- campi obbligatori
- incoerenze tra ruolo e permessi
- incoerenze tra struttura e reparto
- campi legacy ancora presenti
- dropdown struttura residui dove non dovrebbero esserci
- combinazioni assurde ancora possibili

---

## FASE 7 — TEST UI / UX

Controlla in modo critico:

- home search-first davvero efficace o no
- blocchi Home coerenti o no
- “Da visionare” chiaro o no
- “In evidenza” chiaro o no
- pagine troppo piene o confuse
- dettagli contenuto leggibili o no
- menu coerente col livello utente
- etichette chiare o ambigue
- azioni promesse ma non realmente funzionanti

Segnala tutto ciò che:
- confonde
- appesantisce
- fa fare errori
- sembra incompleto

---

## FASE 8 — TEST API E SICUREZZA BASE

Controlla i principali endpoint e verifica che non si possano bypassare i limiti da API.

Concentrati almeno su:
- users
- sops
- memos
- documents
- acknowledgments
- search
- editorial
- governance
- settings
- departments
- properties

Verifica:
- autenticazione richiesta
- 403 corretti
- 404 corretti
- validazioni vere
- niente operazioni illecite via chiamata diretta

---

## OUTPUT FINALE OBBLIGATORIO

Non correggere subito il codice.

Restituisci un report strutturato con queste sezioni:

### 1. Stato tecnico
- build
- typecheck
- lint
- avvio

### 2. Problemi critici
### 3. Problemi alti
### 4. Problemi medi
### 5. Problemi bassi

### 6. Bug permessi
### 7. Bug workflow SOP
### 8. Bug multi-reparto
### 9. Bug UI/UX
### 10. Bug form
### 11. Bug API

### 12. Top 10 problemi da correggere prima dell’uso reale

### 13. Giudizio finale
Scegli una sola valutazione:
- pronto
- quasi pronto
- instabile
- da ristrutturare in parti importanti

---

## REGOLE FINALI

- Non essere indulgente.
- Non dichiarare “ok” ciò che non hai davvero verificato.
- Cerca attivamente punti deboli.
- Se trovi incoerenze tra prodotto dichiarato e comportamento reale, segnalarle chiaramente.