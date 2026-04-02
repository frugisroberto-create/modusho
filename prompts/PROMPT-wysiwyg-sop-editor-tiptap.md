# Prompt per Claude Code — ModusHO
## Editor WYSIWYG per SOP

Lavora sul progetto già esistente di **ModusHO**.

## OBIETTIVO

Sostituire tutte le textarea HTML usate per la composizione del corpo delle SOP con un editor WYSIWYG basato su **TipTap**.

L’utente (HOD, HM, Admin/HOO) deve scrivere procedure come in Word:
- formattazione visuale
- elenchi
- titoli
- blocchi di testo

senza mai vedere HTML.

Il sistema continua a salvare **HTML** nel campo `body`.

## DECISIONI ARCHITETTURALI DEFINITIVE

### 1. Libreria editor
Usare **TipTap** (basato su ProseMirror).

Pacchetti da installare:

```bash
npm install @tiptap/react @tiptap/starter-kit @tiptap/extension-underline @tiptap/extension-placeholder @tiptap/pm isomorphic-dompurify
```

`@tiptap/starter-kit` include già:
- Document
- Paragraph
- Text
- Bold
- Italic
- Strike
- Code
- Heading
- BulletList
- OrderedList
- ListItem
- Blockquote
- HardBreak
- HorizontalRule
- History

### 2. Output
TipTap produce HTML tramite `editor.getHTML()`.

Il formato salvato resta HTML, identico a quello già usato nel database e nella visualizzazione read-only.

### 3. Input
In modalità edit, il contenuto HTML esistente viene caricato nell’editor tramite `setContent(htmlString)`.

### 4. Backend / DB / API
Nessuna modifica a:
- schema Prisma
- struttura database
- contratto API

Il campo `body` resta `String`.
Le API continuano a ricevere HTML nel campo `body`.

Sono consentiti solo eventuali adeguamenti minimi di import o typing, purché non cambino il contratto API.

---

# COSA QUESTA TASK DEVE FARE

## FIX 1 — Componente `SopEditor`

Creare un componente riutilizzabile:

**File:** `src/components/shared/sop-editor.tsx`

```ts
interface SopEditorProps {
  content: string;                         // HTML iniziale
  onChange: (html: string) => void;       // callback ad ogni modifica utente
  placeholder?: string;
  editable?: boolean;                     // default true
  minHeight?: string;                     // default "300px"
}
```

## Toolbar

La toolbar deve contenere, nell’ordine:

### Gruppo testo
- Grassetto
- Corsivo
- Sottolineato

### Gruppo titoli
- H2
- H3

Non usare H1: il titolo SOP è un campo separato.

### Gruppo liste
- Elenco puntato
- Elenco numerato

### Gruppo blocchi
- Citazione (`blockquote`)
- Linea orizzontale

### Gruppo storico
- Undo
- Redo

## Regole toolbar
Ogni bottone deve:
- mostrare lo stato attivo
- usare icone SVG minimali inline
- essere accessibile da tastiera

---

## Design system del componente

### Contenitore
- `border border-ivory-dark`
- nessun `rounded-*`

### Toolbar
- sfondo `bg-ivory`
- bordo inferiore `border-b border-ivory-dark`
- bottoni `p-1.5`
- hover `bg-ivory-dark`

### Bottone attivo
- `bg-ivory-dark`
- `text-charcoal-dark`

### Area editing
- sfondo bianco
- `px-4 py-3`
- `font-body`
- `text-charcoal`
- line-height rilassato

### Placeholder
- `text-charcoal/30`

### Focus
- bordo `border-terracotta`

---

## Styling del contenuto nell’editor

Il contenuto nell’editor deve avere lo stesso aspetto che avrà poi in lettura.

Usare `prose` di Tailwind o styling equivalente.

Regole minime:

- `h2`: `text-lg font-semibold mt-6 mb-2`
- `h3`: `text-base font-semibold mt-4 mb-1`
- `p`: margine verticale standard
- `ol`, `ul`: padding sinistro, marker visibili
- `blockquote`: bordo sinistro terracotta, padding sinistro, italic

---

## FIX 2 — Integrazione in `SopForm` (creazione)

**File:** `src/components/hoo/sop-form.tsx`

Sostituire la textarea del campo “Contenuto” con `SopEditor`.

### Prima
```tsx
<textarea
  value={body}
  onChange={(e) => setBody(e.target.value)}
  rows={15}
  className="w-full font-mono text-sm"
  placeholder="Contenuto della SOP (HTML o testo)"
/>
```

### Dopo
```tsx
<SopEditor
  content={body}
  onChange={setBody}
  placeholder="Scrivi il contenuto della procedura..."
/>
```

### Regola
Lo stato `body` resta invariato (`string`).

`SopEditor` chiama `onChange` con l’HTML prodotto.

---

## FIX 3 — Integrazione in `SopWorkflowEditor` (editing bozza)

**File:** `src/components/hoo/sop-workflow-editor.tsx`

Sostituire la textarea del body nell’editor bozza con `SopEditor`.

### Prima
```tsx
<textarea
  value={editBody}
  onChange={...}
  rows={18}
  className="w-full font-body text-charcoal leading-relaxed bg-ivory border border-ivory-dark px-4 py-3 focus:border-terracotta resize-y"
  placeholder="Corpo della procedura (HTML)"
/>
```

### Dopo
```tsx
<SopEditor
  content={editBody}
  onChange={(html) => {
    setEditBody(html);
    setDirty(true);
  }}
  placeholder="Corpo della procedura..."
/>
```

### Regola importante
Quando `wf.canEditText === false`, la visualizzazione read-only continua a usare `dangerouslySetInnerHTML`.

Quella parte **non va modificata**.

---

## FIX 4 — Sanitizzazione HTML (sicurezza)

Con l’introduzione dell’editor WYSIWYG l’utente non scrive più HTML a mano, ma la sanitizzazione deve essere robusta anche lato server.

### Libreria
Usare `isomorphic-dompurify`.

### File da creare
**File:** `src/lib/sanitize-html.ts`

Esportare una funzione:

```ts
sanitizeHtml(dirty: string): string
```

che sanifichi HTML sia lato client sia lato server.

### Tag consentiti
Consentire solo i tag realmente supportati da questa task:

- `h2`
- `h3`
- `p`
- `br`
- `hr`
- `strong`
- `em`
- `u`
- `s`
- `ul`
- `ol`
- `li`
- `blockquote`

### Attributi
Non aggiungere supporto link in questa task.

Quindi:
- non includere `<a>`
- non includere `href`, `target`, `rel`

### Applicazione
Applicare `sanitizeHtml()` nel componente `SopEditor` prima di chiamare `onChange`, così l’HTML emesso dall’editor resta pulito.

---

## FIX 5 — Sincronizzazione contenuto iniziale

Il componente `SopEditor` deve sincronizzarsi con il prop `content` quando questo cambia dall’esterno.

Usare `editor.commands.setContent(...)` o soluzione equivalente.

### Regola importante
La sincronizzazione non deve generare loop inutili.

Se `content` cambia dall’esterno, l’editor deve aggiornarsi correttamente.

Questo serve in particolare nei casi di:
- refresh
- ricarica bozza
- cambio stato workflow
- rientro nell’editor con contenuto già presente

---

## FIX 6 — Dirty state corretto

L’inizializzazione o sincronizzazione del contenuto **non deve** marcare il form come dirty.

Il dirty state deve attivarsi **solo su modifica utente reale**.

Quindi:
- mount iniziale → non dirty
- `setContent(...)` da sync esterno → non dirty
- digitazione / formattazione utente → dirty

---

# FILE DA CREARE

| File | Descrizione |
|---|---|
| `src/components/shared/sop-editor.tsx` | Componente editor WYSIWYG con TipTap |
| `src/lib/sanitize-html.ts` | Utility di sanitizzazione HTML |

---

# FILE DA MODIFICARE

| File | Modifica |
|---|---|
| `src/components/hoo/sop-form.tsx` | Sostituire textarea con `SopEditor` |
| `src/components/hoo/sop-workflow-editor.tsx` | Sostituire textarea con `SopEditor` |

---

# FILE DA NON TOCCARE

Non toccare:
- `CLAUDE.md`
- schema Prisma
- API routes
- pagine di visualizzazione read-only
- componenti upload allegati

---

# COSA QUESTA TASK NON FA

Questa task:
- non aggiunge immagini inline nell’editor
- non aggiunge tabelle
- non cambia backend o formato di salvataggio
- non modifica la visualizzazione read-only delle SOP
- non aggiunge import da file
- non aggiunge supporto link

---

# VERIFICA ATTESA

## Creazione SOP da form
- editor WYSIWYG visibile
- toolbar funzionante

## Formattazione
- grassetto / corsivo / sottolineato applicati correttamente
- bottone attivo evidenziato

## Heading
- H2 e H3 funzionano
- resa visiva coerente

## Liste
- elenco puntato e numerato funzionano

## Storico
- undo / redo funzionano
- toolbar ok
- shortcut tastiera ok (`Cmd+Z`, `Cmd+Shift+Z`)

## Salvataggio
- `body` contiene HTML pulito
- l’API continua a ricevere HTML valido

## Edit SOP esistente
- contenuto HTML esistente caricato correttamente nell’editor
- formattazione preservata

## Workflow editor
- `SopEditor` al posto della textarea
- dirty state corretto

## Read-only
- nessun cambiamento
- continua a usare `dangerouslySetInnerHTML`

## Sicurezza
- HTML sanitizzato correttamente
- nessun supporto link

## Build
- `npm run build` passa senza errori

---

# OUTPUT RICHIESTO

Alla fine restituisci un report con:

1. file creati
2. file modificati
3. come hai implementato `SopEditor`
4. come hai gestito la sanitizzazione HTML
5. come hai gestito la sincronizzazione del prop `content`
6. come hai evitato dirty state falsi
7. conferma che backend/API/Prisma non sono cambiati nel contratto
8. esito typecheck
9. esito build
