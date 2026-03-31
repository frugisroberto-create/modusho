# Prompt per Claude Code — ModusHO
## SOP Workflow — Conferma consultazione del ruolo C

Lavora sul progetto già esistente di **ModusHO**.

Contesto:
nel workflow SOP RACI esistono già:
- `R`
- `C`
- `A`
- sottoposizione a `C`
- sottoposizione ad `A`
- sottoposizione a `C e A`

Attualmente il soggetto `C` può leggere e lasciare note, ma manca una traccia formale del fatto che abbia effettivamente svolto il proprio passaggio di consultazione.

## OBIETTIVO

Aggiungere la funzione:

- **Conferma consultazione**

per il soggetto `C`.

Questa azione deve consentire a `C` di confermare formalmente di aver preso visione della bozza in qualità di consultato.

---

## REGOLA FUNZIONALE

La conferma consultazione:

- non equivale ad approvazione
- non equivale a restituzione
- non modifica il testo della SOP
- non chiude il workflow
- non blocca `A`

Quindi:
- `A` può comunque approvare anche se `C` non ha confermato
- ma `A` e `R` devono vedere chiaramente se `C` ha confermato o no

---

## REGOLA DI VERSIONE

La conferma di consultazione di `C` vale per la **versione corrente della bozza**.

Quindi:
- se `C` conferma la consultazione sulla versione corrente, lo stato risulta confermato
- se successivamente `R` salva una nuova versione del testo, la consultazione di `C` deve tornare **da confermare**

Questo serve a evitare che una conferma resti valida su una bozza modificata dopo il passaggio di `C`.

---

## COSA DEVI FARE

### 1. Dominio / persistenza
Aggiungi nel workflow la capacità di tracciare almeno:

- stato consultazione `C` sulla versione corrente
- `consultedAt`
- `consultedByUserId`

Se nel modello attuale conviene usare:
- campi su `SopWorkflow`
oppure
- workflow event + stato derivato

scegli la soluzione più coerente col dominio già esistente, senza overengineering.

### 2. Workflow event log
La conferma di consultazione deve generare un evento workflow persistente, ad esempio:
- `C_CONSULTED_CONFIRMED`

con:
- actorId
- timestamp
- eventuale nota se supportata

### 3. API
Aggiungi la route o l’azione minima necessaria per permettere a `C` di confermare la consultazione.

Regole:
- solo `C` può usare questa azione
- l’azione deve essere disponibile solo se la SOP è sottoposta a `C` oppure a `C e A`
- l’azione deve essere disponibile solo se `C` non ha già confermato la versione corrente
- non deve essere disponibile a `R`
- non deve essere disponibile a `A`

### 4. UI editor SOP
Nel workflow editor della SOP:

#### Se l’utente corrente è `C`
e la SOP è sottoposta a `C` o `C e A`:
- mostra un’azione:
  - **Conferma consultazione**

#### Dopo la conferma
il pulsante non deve restare come azione primaria uguale a prima.
La UI deve mostrare invece uno stato informativo chiaro, per esempio:
- **Consultazione confermata**
- con data/ora
- ed eventuale nota se presente

### 5. Visibilità per A e R
Nel pannello editor / testata / area workflow, rendi visibile anche a `A` e `R`:

- consultazione `C` in attesa
oppure
- consultazione `C` completata
- con utente e timestamp

Questa informazione non deve essere nascosta solo nella timeline eventi:
deve essere visibile anche nella parte principale del workflow della SOP.

### 6. Nota associata
La conferma consultazione può supportare una nota facoltativa.
La nota non è obbligatoria.

---

## REGOLE IMPORTANTI

- non modificare `CLAUDE.md`
- non trasformare questa conferma in una approvazione
- non introdurre un blocco rigido: `A` deve poter approvare anche senza conferma di `C`
- non allargare il perimetro oltre il minimo necessario
- non toccare Prisma o backend più del necessario
- se puoi estendere il modello esistente in modo leggero, fallo

---

## NAMING UI

Usare in interfaccia la dicitura:

- **Conferma consultazione**

Dopo la conferma usare una label tipo:
- **Consultazione confermata**

Evita label ambigue o inglesismi non necessari.

---

## VERIFICHE OBBLIGATORIE

Verifica almeno questi casi:

1. SOP sottoposta a `C`
   - `C` vede il pulsante “Conferma consultazione”

2. SOP sottoposta a `C e A`
   - `C` vede il pulsante “Conferma consultazione”

3. Dopo il click di `C`
   - la conferma viene salvata
   - compare timestamp
   - compare la traccia visibile ad `A` e `R`

4. `R` non vede il pulsante “Conferma consultazione”
5. `A` non vede il pulsante “Conferma consultazione”
6. `A` può ancora approvare anche se `C` non ha confermato
7. se `R` salva una nuova versione dopo la conferma di `C`, la consultazione torna da confermare
8. l’evento compare nello storico workflow
9. typecheck passa
10. build passa

---

## OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file modificati
2. come hai tracciato la conferma consultazione
3. se hai usato campi workflow, event log o entrambi
4. quale route/azione hai aggiunto
5. come hai mostrato lo stato a `C`, `R` e `A`
6. come hai gestito il reset della consultazione alla nuova versione
7. conferma che `A` può comunque approvare anche senza conferma di `C`
8. esito typecheck
9. esito build
