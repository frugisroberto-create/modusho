# PROMPT 4 — Revisione diretta con tracciamento modifiche evidente

## Contesto

Il flusso attuale di review ha un problema pratico: quando l'HM o l'ADMIN trovano un errore minore in un contenuto in review, l'unica opzione è restituirlo (RETURNED → DRAFT), costringendo l'autore a ricominciare l'intero ciclo approvativo. Per una correzione di 30 secondi, il contenuto fa tre giri completi.

La soluzione: permettere al reviewer di modificare direttamente il contenuto durante il review, con tracciamento completo e visibile di ogni modifica.

## Prerequisito

Il Prompt 03 (flusso creazione per ruolo) deve essere stato eseguito prima di questo prompt. Questo prompt lavora sulla versione del codice aggiornata dal Prompt 03.

---

## TASK 1 — Nuovo modello Prisma: `ContentRevision`

### File: `prisma/schema.prisma`

Aggiungere il modello:

```prisma
model ContentRevision {
  id             String   @id @default(cuid())
  contentId      String
  content        Content  @relation(fields: [contentId], references: [id])
  revisedById    String
  revisedBy      User     @relation("contentRevisions", fields: [revisedById], references: [id])
  previousTitle  String
  previousBody   String   @db.Text
  newTitle       String
  newBody        String   @db.Text
  note           String?
  status         ContentStatus   // stato del contenuto al momento della revisione (REVIEW_HM, REVIEW_ADMIN, PUBLISHED)
  createdAt      DateTime @default(now())

  @@index([contentId, createdAt])
}
```

**Nota**: salvare sia `previous*` che `new*` permette di calcolare il diff senza dover ricostruire la catena di revisioni.

Aggiungere le relazioni inverse:

Nel modello `Content`, aggiungere:
```prisma
revisions      ContentRevision[]
```

Nel modello `User`, aggiungere:
```prisma
contentRevisions ContentRevision[] @relation("contentRevisions")
```

Eseguire `npx prisma migrate dev --name add-content-revision`.

---

## TASK 2 — Modificare API PUT `/api/content/[id]/route.ts`

### Logica attuale

Attualmente il PUT aggiorna il contenuto direttamente. Per le modifiche post-pubblicazione incrementa `version` e crea un ContentStatusHistory.

### Nuova logica

**Prima di ogni modifica di title o body**, se il contenuto è in uno stato di review (`REVIEW_HM`, `REVIEW_ADMIN`) oppure `PUBLISHED`, il sistema deve creare un `ContentRevision` con lo snapshot prima/dopo.

Aggiungere questa logica DOPO il check dei permessi e PRIMA dell'update:

```typescript
import { prisma } from "@/lib/prisma";

// Determina se title o body stanno cambiando
const isTitleChanging = title !== undefined && title !== content.currentTitle;
const isBodyChanging = body !== undefined && body !== content.currentBody;
const isContentChanging = isTitleChanging || isBodyChanging;

// Se il contenuto cambia e siamo in review o published → salva revisione
if (isContentChanging && ["REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED"].includes(content.status)) {
  await prisma.contentRevision.create({
    data: {
      contentId: id,
      revisedById: userId,
      previousTitle: content.currentTitle,
      previousBody: content.currentBody,
      newTitle: title ?? content.currentTitle,
      newBody: body ?? content.currentBody,
      note: parsed.data.revisionNote || null,   // ← campo opzionale (vedi sotto)
      status: content.status,
    },
  });
}
```

### Aggiornare lo schema di validazione

Aggiungere `revisionNote` al schema:

```typescript
const updateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),
  requireNewAcknowledgment: z.boolean().optional(),
  revisionNote: z.string().max(500).optional(),   // ← AGGIUNGERE
});
```

### Aggiornare la query di fetch del contenuto

Il select attuale recupera solo `id, status, propertyId, departmentId, type, version`. Servono anche `title` e `body` per lo snapshot:

```typescript
const content = await prisma.content.findUnique({
  where: { id, isDeleted: false },
  select: {
    id: true,
    status: true,
    propertyId: true,
    departmentId: true,
    type: true,
    version: true,
    title: true,       // ← AGGIUNGERE
    body: true,        // ← AGGIUNGERE
  },
});
```

### Incremento versione anche in review

Attualmente `version` si incrementa solo per modifiche post-pubblicazione. Estendere: incrementare anche quando un reviewer modifica il contenuto in REVIEW_HM o REVIEW_ADMIN.

```typescript
const shouldIncrementVersion = ["REVIEW_HM", "REVIEW_ADMIN", "PUBLISHED"].includes(content.status) && isContentChanging;

const updated = await prisma.content.update({
  where: { id },
  data: {
    ...(title !== undefined && { title }),
    ...(body !== undefined && { body }),
    ...(departmentId !== undefined && { departmentId }),
    updatedById: userId,
    ...(shouldIncrementVersion && { version: content.version + 1 }),
  },
});
```

---

## TASK 3 — Nuova API: GET `/api/content/[id]/revisions`

### File: `src/app/api/content/[id]/revisions/route.ts` (NUOVO)

Restituisce tutte le revisioni di un contenuto, ordinate per data decrescente.

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkAccess } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const { id } = await params;

  const content = await prisma.content.findUnique({
    where: { id, isDeleted: false },
    select: { id: true, propertyId: true, departmentId: true },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  // RBAC: almeno HOD per vedere le revisioni
  const hasAccess = await checkAccess(
    session.user.id, "HOD", content.propertyId, content.departmentId ?? undefined
  );
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const revisions = await prisma.contentRevision.findMany({
    where: { contentId: id },
    select: {
      id: true,
      previousTitle: true,
      previousBody: true,
      newTitle: true,
      newBody: true,
      note: true,
      status: true,
      createdAt: true,
      revisedBy: { select: { id: true, name: true, role: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ data: revisions });
}
```

---

## TASK 4 — Componente `RevisionHistory`

### File: `src/components/hoo/revision-history.tsx` (NUOVO)

Componente che mostra la cronologia delle revisioni con diff visuale.

### Specifiche:

1. **Fetch** da `/api/content/{id}/revisions` al mount
2. **Se zero revisioni**, non renderizzare nulla (return null)
3. **Layout**: pannello collassabile con titolo "Cronologia revisioni ({count})"
4. **Ogni revisione** mostra:
   - Avatar/nome del revisore + ruolo (badge colorato)
   - Data e ora (formato italiano: "28 mar 2026, 14:32")
   - Stato al momento della revisione (badge: "Durante review HM" / "Durante review Admin" / "Post-pubblicazione")
   - Nota del revisore (se presente), in corsivo
   - **Diff visuale** del body: testo rimosso evidenziato in rosso chiaro (`#FECACA` sfondo, `#991B1B` testo, barrato), testo aggiunto evidenziato in verde chiaro (`#D1FAE5` sfondo, `#065F46` testo)
   - Se solo il titolo è cambiato, mostrare "Titolo: {vecchio} → {nuovo}"
   - Se solo il body è cambiato, mostrare il diff del body
   - Se entrambi sono cambiati, mostrare entrambi

### Diff algorithm

Per il diff del body, usare un approccio a livello di paragrafo (split per `\n\n`) piuttosto che a livello di carattere. Questo è più leggibile per contenuti lunghi come le SOP. Per ogni paragrafo:
- Se identico → mostra in grigio (contesto)
- Se rimosso → sfondo rosso chiaro, testo barrato
- Se aggiunto → sfondo verde chiaro
- Se modificato → mostra vecchio (rosso) e nuovo (verde) in sequenza

Implementare il diff con una funzione utility in `src/lib/text-diff.ts`:

```typescript
export interface DiffBlock {
  type: "unchanged" | "added" | "removed";
  text: string;
}

export function computeParagraphDiff(oldText: string, newText: string): DiffBlock[]
```

Usare l'algoritmo LCS (Longest Common Subsequence) a livello di paragrafo. NON installare librerie esterne — implementare internamente, il numero di paragrafi è sempre gestibile (< 100).

---

## TASK 5 — Bottone "Modifica" nella pagina di review

### File: `src/app/(hoo)/approvals/[id]/page.tsx`

La pagina di dettaglio review attualmente mostra il contenuto in sola lettura + ApprovalActions. Aggiungere la possibilità di modificare inline.

### Specifiche:

1. **Bottone "Modifica contenuto"** accanto a "Approva" e "Restituisci", visibile solo se l'utente ha i permessi di modifica per lo stato corrente:
   - In REVIEW_HM: visibile a HOTEL_MANAGER della property, ADMIN, SUPER_ADMIN
   - In REVIEW_ADMIN: visibile a ADMIN, SUPER_ADMIN

2. **Click su "Modifica contenuto"**: il body (e il titolo) diventano editabili inline. Appare:
   - Campo titolo editabile (input)
   - Campo body editabile (textarea o rich text se già implementato)
   - Campo "Nota revisione" (textarea, opzionale, placeholder: "Descrivi brevemente le modifiche apportate")
   - Bottone "Salva modifiche" (chiama PUT `/api/content/{id}` con `revisionNote`)
   - Bottone "Annulla" (ripristina la vista in sola lettura)

3. **Dopo il salvataggio**: la vista torna in sola lettura, il componente RevisionHistory si aggiorna automaticamente mostrando la nuova revisione.

4. **Il contenuto resta nello stesso stato** — la modifica non cambia lo stato. L'HM può modificare e poi approvare nella stessa sessione, o modificare e lasciare in review per un secondo controllo.

---

## TASK 6 — Badge "Revisionato" nella lista approvazioni

### File: `src/app/(hoo)/approvals/page.tsx`

Nella lista dei contenuti in attesa di approvazione, se un contenuto ha revisioni (`version > 1` o revisioni presenti), mostrare un badge accanto al titolo:

- **"Revisionato dall'HM"** (malva/rosa `#7E636B`) — se ci sono revisioni fatte durante REVIEW_HM
- **"Revisionato dall'Admin"** (terracotta `#964733`) — se ci sono revisioni fatte durante REVIEW_ADMIN
- **"v{N}"** — numero di versione corrente

Questo permette all'ADMIN, quando riceve un contenuto in REVIEW_ADMIN, di vedere immediatamente che l'HM ha apportato modifiche e può consultare la cronologia.

### Implementazione

Aggiungere alla query della lista approvazioni:
```typescript
_count: { revisions: true },
version: true,
revisions: {
  select: { status: true, revisedBy: { select: { role: true } } },
  distinct: ["status"],
}
```

---

## TASK 7 — Integrare `RevisionHistory` nella pagina di dettaglio

### File: `src/app/(hoo)/approvals/[id]/page.tsx`

Aggiungere il componente `RevisionHistory` nella pagina di dettaglio, **sotto** il contenuto e **sopra** lo storico workflow esistente.

Ordine delle sezioni nella pagina:
1. Header (titolo, badge stato, metadata)
2. Corpo del contenuto (body)
3. **Cronologia revisioni** ← NUOVO (RevisionHistory component)
4. Storico workflow (ContentStatusHistory — già esistente)
5. Review (ContentReview — già esistente)
6. ApprovalActions (bottoni approva/restituisci/modifica)

### Anche nella pagina di dettaglio HOO-SOP

Il componente `RevisionHistory` deve essere visibile anche nella pagina `/hoo-sop/[id]` (dettaglio SOP lato HOO), così l'autore può vedere le modifiche fatte dai reviewer.

---

## TASK 8 — Aggiornare seed con revisioni di esempio

### File: `prisma/seed.ts`

Aggiungere almeno 2 ContentRevision di esempio:

1. Una revisione fatta dall'HM su un contenuto in REVIEW_HM:
   - previousTitle e newTitle uguali (solo body modificato)
   - note: "Corretto riferimento normativa check-in"
   - status: REVIEW_HM

2. Una revisione fatta dall'ADMIN su un contenuto in REVIEW_ADMIN:
   - previousTitle modificato (aggiunto codice reparto nel titolo)
   - previousBody e newBody uguali
   - note: "Aggiunto codice reparto nel titolo per coerenza"
   - status: REVIEW_ADMIN

---

## Regole imperative

1. **NON toccare** il flusso di approvazione (`/api/content/[id]/review/route.ts`). La modifica diretta è un'azione separata dall'approvazione. Il reviewer può modificare E POI approvare, oppure modificare E lasciare in review.
2. **NON toccare** la logica di instradamento per ruolo (Prompt 03). I due sistemi sono indipendenti.
3. **NON toccare** la grafica globale — niente CSS di font, colori palette, border-radius. Usare solo le classi/colori già definiti nel design system per i nuovi componenti.
4. **Ogni revisione DEVE salvare sia il before che l'after** (previousTitle/Body + newTitle/Body). Non fare affidamento sulla catena cronologica per ricostruire i diff.
5. **La nota di revisione è opzionale ma incoraggiata**. Il placeholder del campo deve suggerire di descrivere la modifica.
6. **Il diff deve essere evidente e leggibile**: rosso per rimosso, verde per aggiunto, a livello di paragrafo. Non usare diff a livello di carattere (illeggibile su testi lunghi).
7. **Il numero di versione deve essere visibile** nel badge del contenuto e nella cronologia revisioni.
8. **`ContentRevision` è immutabile**: una volta creato, non può essere modificato né eliminato. È un record di audit.
