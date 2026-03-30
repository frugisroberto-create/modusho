# Prompt per Claude Code — ModusHO
## PROMPT-14 — Modularization / Document Governance
Lavora sul progetto già esistente di **ModusHO**.
## OBIETTIVO
Rimettere ordine nella documentazione operativa e nello stato del progetto, senza sviluppare nuove feature.
Questa NON è una task di sviluppo applicativo.
Questa è una task di **governance documentale**, con quattro obiettivi:
1. censire e ordinare i file markdown del progetto
2. allineare i prompt operativi alla loro posizione corretta
3. aggiornare lo stato reale del progetto in `CURRENT_STATE.md`
4. aggiornare `roadmap.md` con la sequenza reale dei prossimi lavori
---
## REGOLA FONDAMENTALE
### CLAUDE.md
`CLAUDE.md` è la **Costituzione del progetto**.
Quindi:
- NON va modificato in questa task
- NON va trasformato in diario di avanzamento
- NON va usato per tracciare prompt eseguiti o fix puntuali
Se emergono regole strutturali mancanti, vanno segnalate nel riepilogo finale, ma **non scritte nel file**.
---
## COSA QUESTA TASK DEVE FARE
### 1. Censire tutti i markdown rilevanti
Individuare tutti i file `.md` rilevanti nella repository e classificarli come:
- prompt operativi
- stato progetto
- roadmap
- documentazione architetturale
- file duplicati / ambigui / obsoleti
### 2. Ordinare i prompt
Portare ordine nella cartella prompt del progetto.
### 3. Aggiornare `CURRENT_STATE.md`
Fare in modo che descriva il progetto reale, non la memoria delle chat.
### 4. Aggiornare `roadmap.md`
Fare in modo che rifletta davvero la prossima sequenza di lavoro.
### 5. Segnalare eventuali gap strutturali
Dire se dai prompt 12 e 13 emergono regole architetturali stabili che mancano in `CLAUDE.md`, senza modificarlo.
---
## COSA QUESTA TASK NON DEVE FARE
- non modificare `CLAUDE.md`
- non creare nuove feature
- non toccare API, componenti, schema Prisma o UI
- non fare refactor del codice applicativo
- non cambiare la logica business del sistema
- non rinumerare arbitrariamente i prompt già esistenti
- non cancellare file senza segnalarlo chiaramente
---
# PARTE 1 — LETTURA OBBLIGATORIA INIZIALE
Prima di agire, leggi in quest'ordine:
1. `DomusGO/CLAUDE.md`
2. `DomusGO/docs/CURRENT_STATE.md`
3. `DomusGO/docs/roadmap.md`
4. tutti i file in `DomusGO/prompts/`
5. eventuali file prompt markdown ancora fuori dalla cartella `DomusGO/prompts/`, se presenti nella repository
---
# PARTE 2 — CENSIMENTO MARKDOWN
## Obiettivo
Capire esattamente quali file markdown esistono e che ruolo hanno.
## Task
Fare un elenco di tutti i `.md` rilevanti del progetto e classificarli.
## Categorie richieste
- **Prompt operativi**
- **Documenti di stato**
- **Roadmap**
- **Documentazione architetturale**
- **Duplicati / file ambigui / file obsoleti**
## Regola
Non limitarti alla cartella `prompts`.
Controlla anche se ci sono prompt ancora in root o in posizioni incoerenti.
---
# PARTE 3 — RIORDINO PROMPT
## Obiettivo
Fare in modo che i prompt reali del progetto vivano tutti nella stessa area.
## Regola target
La posizione corretta dei prompt è:
- `DomusGO/prompts/`
## Task
1. verificare quali prompt reali esistono già
2. verificare dove si trovano
3. se trovi prompt ancora fuori cartella:
   - non cancellarli
   - spostali in `DomusGO/prompts/` se il caso è chiaro e sicuro
   - mantieni naming coerente
4. se trovi naming incoerente, segnalalo chiaramente
5. non creare duplicati inutili
## Regola di naming
Mantenere numerazione reale e naming chiaro, per esempio:
- `PROMPT-01-...`
- `PROMPT-02-...`
- ...
- `PROMPT-12-upload-engine.md`
- `PROMPT-13-secure-delivery.md`
- `PROMPT-14-modularization-document-governance.md`
## Regola
Non rinumerare arbitrariamente i prompt storici.
---
# PARTE 4 — AGGIORNAMENTO DI CURRENT_STATE
## Obiettivo
Fare di `DomusGO/docs/CURRENT_STATE.md` la fonte reale dello stato del progetto.
## Regola critica
Non segnare un prompt come eseguito solo perché esiste o perché è stato dichiarato completato in una chat.
Segna come:
- **eseguito** → solo se verificabile nel codice o nel comportamento reale
- **parziale** → se implementato solo in parte
- **non eseguito** → se non presente davvero
## Struttura minima richiesta
`CURRENT_STATE.md` deve contenere almeno:
1. prompt eseguiti e verificati nel codice
2. prompt parzialmente eseguiti
3. prompt non ancora eseguiti
4. limiti residui aperti
5. prossimo prompt consigliato
## Cosa deve includere esplicitamente
Segnare correttamente:
- **PROMPT-12** come eseguito
- **PROMPT-13** come eseguito
E riportare eventuali limiti residui degli allegati, se ancora veri:
- upload solo in edit mode
- no thumbnail pipeline
- no retry automatico presigned URL
- sortOrder non persistito, se ancora aperto
## Regola
Scrivere in modo secco, verificabile e utile.
Niente narrativa superflua.
---
# PARTE 5 — AGGIORNAMENTO DI ROADMAP
## Obiettivo
Fare in modo che `DomusGO/docs/roadmap.md` rappresenti il futuro vero del progetto.
## Regola
La roadmap non deve raccontare il passato.
Deve dire solo:
- cosa viene dopo
- in che ordine
- con quale priorità
## Task
Aggiorna `roadmap.md` con l'ordine reale dei prossimi lavori.
## Sequenza attesa
Salvo incoerenze rilevate nel codice, l'ordine atteso è:
- `PROMPT-14 — Modularization / Document Governance`
- poi i prompt successivi realmente coerenti con lo stato del progetto
## Regola
Non inventare fasi astratte o troppo generiche.
La roadmap deve riflettere il repository reale.
---
# PARTE 6 — GESTIONE FILE AMBIGUI O OBSOLETI
## Obiettivo
Pulire senza fare danni.
## Task
Se trovi:
- duplicati
- prompt vecchi in posizione sbagliata
- file markdown ambigui
- documenti palesemente fuori posto
allora:
- non cancellarli in automatico senza criterio
- segnalali nel report finale
- se lo spostamento è ovvio e sicuro, eseguilo in modo conservativo
- se il caso è dubbio, non forzare
## Regola
Meglio segnalare un dubbio che fare pulizia sbagliata.
---
# PARTE 7 — VERIFICA SU CLAUDE.MD SENZA TOCCARLO
## Obiettivo
Capire se i prompt 12 e 13 hanno introdotto decisioni strutturali stabili che oggi non risultano nella Costituzione.
## Task
Dopo aver letto:
- `CLAUDE.md`
- `CURRENT_STATE.md`
- `PROMPT-12`
- `PROMPT-13`
devi dire se esistono regole architetturali stabili che mancano in `CLAUDE.md`, ad esempio:
- storage attachments su bucket privato
- allegati che ereditano RBAC dal contenuto madre
- secure delivery tramite presigned URL temporanei
- distinzione inline vs attachment per preview/download
## Regola
Non aggiornare il file.
Segnalalo solo nel report finale come proposta minima di integrazione, se davvero necessario.
---
# PARTE 8 — FILE TARGET
Questa task dovrebbe toccare soprattutto:
- `DomusGO/docs/CURRENT_STATE.md`
- `DomusGO/docs/roadmap.md`
- file in `DomusGO/prompts/`
- eventuali file markdown fuori posto da spostare nella cartella corretta
## Regola
Non toccare codice applicativo salvo necessità strettamente documentale o organizzativa.
---
# PARTE 9 — VERIFICHE OBBLIGATORIE
Alla fine della task, verifica di aver fatto davvero queste cose:
1. hai censito i file markdown rilevanti
2. hai identificato tutti i prompt reali
3. hai verificato la loro posizione
4. hai aggiornato `CURRENT_STATE.md` in base al codice reale
5. hai aggiornato `roadmap.md` in base allo stato reale
6. non hai modificato `CLAUDE.md`
7. non hai sviluppato nuove feature
8. hai segnalato eventuali regole stabili mancanti in `CLAUDE.md` senza toccarlo
---
# OUTPUT FINALE OBBLIGATORIO
Alla fine restituisci un riepilogo breve con:
1. elenco dei file markdown rilevati
2. prompt trovati e loro posizione finale
3. file spostati o rinominati
4. cosa hai aggiornato in `CURRENT_STATE.md`
5. cosa hai aggiornato in `roadmap.md`
6. eventuali incoerenze ancora aperte
7. proposta del prossimo prompt corretto da eseguire
8. eventuali regole architetturali stabili emerse dai prompt 12 e 13 che mancano in `CLAUDE.md`, senza modificare il file
---
## REGOLA FINALE
L'obiettivo di questa task è rendere il progetto:
- ordinato
- verificabile
- governabile
Non fare sviluppo applicativo.
Non trasformare `CLAUDE.md` in diario.
Non dichiarare chiuso ciò che non è verificabile.
