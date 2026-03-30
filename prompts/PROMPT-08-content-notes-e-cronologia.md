# PROMPT-08 — ContentNote + Cronologia UI

## Obiettivo

Implementare il sistema di note libere sui contenuti (ContentNote) e la cronologia unificata (audit trail) nella pagina di dettaglio. Le note sono un "diario di bordo" del contenuto: NON fanno parte del processo di invio/approvazione, NON bloccano alcuna azione, NON sono obbligatorie. Chiunque con accesso (HOD+) può aggiungere una nota in qualsiasi momento.

**Riferimento**: sezioni "Note sui contenuti (ContentNote)" e "Cronologia e audit trail — Specifica UI" in CLAUDE.md.

---

## FIX 1 — Modello Prisma: aggiungere ContentNote

### File: `prisma/schema.prisma`

Aggiungere il modello `ContentNote` DOPO `ContentRevision` (dopo riga 260):

```prisma
model ContentNote {
  id        String   @id @default(cuid())
  contentId String
  authorId  String
  body      String   @db.Text
  createdAt DateTime @default(now())

  content Content @relation(fields: [contentId], references: [id], onDelete: Cascade)
  author  User    @relation("ContentNoteAuthor", fields: [authorId], references: [id])

  @@index([contentId, createdAt])
  @@index([authorId])
}
```

### File: `prisma/schema.prisma` — Aggiornare model User

Aggiungere la relazione inversa nel model `User`, dopo la riga `targetedContents`:

```prisma
  contentNotes         ContentNote[]          @relation("ContentNoteAuthor")
```

### File: `prisma/schema.prisma` — Aggiornare model Content

Aggiungere la relazione inversa nel model `Content`, dopo la riga `revisions`:

```prisma
  notes            ContentNote[]
```

### NOTA: i campi `note` su ContentReview e ContentStatusHistory restano invariati

**NON rimuovere** il campo `note: String?` da ContentReview né da ContentStatusHistory. Sono dati di audit storici validi (es. nota obbligatoria su RETURNED, contesto di un cambio stato). ContentNote si aggiunge come layer separato per le note libere. Nella timeline, se un ContentReview o ContentStatusHistory ha una nota, viene mostrata inline nell'evento di stato/review.

Dopo le modifiche, eseguire:
```bash
npx prisma migrate dev --name add-content-notes
```

---

## FIX 2 — API: GET /api/content/[id]/notes

### File: `src/app/api/content/[id]/notes/route.ts` (NUOVO FILE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkContentAccess } from "@/lib/rbac";

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { propertyAssignments: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  // OPERATOR non vede la cronologia
  if (user.role === "OPERATOR") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Verificare accesso al contenuto
  const content = await prisma.content.findUnique({
    where: { id: params.id },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  const hasAccess = checkContentAccess(user, content);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Paginazione
  const url = new URL(request.url);
  const page = parseInt(url.searchParams.get("page") || "1");
  const pageSize = Math.min(parseInt(url.searchParams.get("pageSize") || "20"), 50);

  const [notes, total] = await Promise.all([
    prisma.contentNote.findMany({
      where: { contentId: params.id },
      include: {
        author: {
          select: { id: true, name: true, role: true },
        },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
    prisma.contentNote.count({ where: { contentId: params.id } }),
  ]);

  return NextResponse.json({
    data: notes,
    meta: { page, pageSize, total },
  });
}

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { propertyAssignments: true },
  });

  if (!user) {
    return NextResponse.json({ error: "Utente non trovato" }, { status: 404 });
  }

  // OPERATOR non può scrivere note
  if (user.role === "OPERATOR") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Verificare accesso al contenuto
  const content = await prisma.content.findUnique({
    where: { id: params.id },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  const hasAccess = checkContentAccess(user, content);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // HOD può scrivere note solo sui propri contenuti
  if (user.role === "HOD" && content.createdById !== user.id) {
    return NextResponse.json(
      { error: "HOD può aggiungere note solo ai propri contenuti" },
      { status: 403 }
    );
  }

  // Validare body
  const json = await request.json();
  const body = json.body?.trim();

  if (!body || body.length === 0) {
    return NextResponse.json({ error: "Il testo della nota è obbligatorio" }, { status: 400 });
  }

  if (body.length > 5000) {
    return NextResponse.json({ error: "La nota non può superare 5000 caratteri" }, { status: 400 });
  }

  const note = await prisma.contentNote.create({
    data: {
      contentId: params.id,
      authorId: user.id,
      body,
    },
    include: {
      author: {
        select: { id: true, name: true, role: true },
      },
    },
  });

  return NextResponse.json({ data: note }, { status: 201 });
}
```

---

## FIX 3 — API: GET /api/content/[id]/timeline

Endpoint unificato che restituisce la cronologia completa (cambi stato + revisioni + note) come flusso temporale unico.

### File: `src/app/api/content/[id]/timeline/route.ts` (NUOVO FILE)

```typescript
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { checkContentAccess } from "@/lib/rbac";

type TimelineEventType = "STATUS_CHANGE" | "REVISION" | "NOTE";

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  createdAt: Date;
  author: { id: string; name: string; role: string };
  data: Record<string, unknown>;
}

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    include: { propertyAssignments: true },
  });

  if (!user || user.role === "OPERATOR") {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  const content = await prisma.content.findUnique({
    where: { id: params.id },
  });

  if (!content) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }

  const hasAccess = checkContentAccess(user, content);
  if (!hasAccess) {
    return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
  }

  // Fetch parallelo delle tre sorgenti
  const [statusHistory, revisions, notes] = await Promise.all([
    prisma.contentStatusHistory.findMany({
      where: { contentId: params.id },
      include: { changedBy: { select: { id: true, name: true, role: true } } },
      orderBy: { changedAt: "desc" },
    }),
    prisma.contentRevision.findMany({
      where: { contentId: params.id },
      include: { revisedBy: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    }),
    prisma.contentNote.findMany({
      where: { contentId: params.id },
      include: { author: { select: { id: true, name: true, role: true } } },
      orderBy: { createdAt: "desc" },
    }),
  ]);

  // Unificare in timeline
  const timeline: TimelineEvent[] = [
    ...statusHistory.map((sh) => ({
      id: sh.id,
      type: "STATUS_CHANGE" as TimelineEventType,
      createdAt: sh.changedAt,
      author: sh.changedBy,
      data: { fromStatus: sh.fromStatus, toStatus: sh.toStatus, note: sh.note },
    })),
    ...revisions.map((rev) => ({
      id: rev.id,
      type: "REVISION" as TimelineEventType,
      createdAt: rev.createdAt,
      author: rev.revisedBy,
      data: {
        previousTitle: rev.previousTitle,
        newTitle: rev.newTitle,
        note: rev.note,
        status: rev.status,
        // body non incluso nella timeline (troppo pesante) — si usa GET /revisions/[id] per il diff
      },
    })),
    ...notes.map((n) => ({
      id: n.id,
      type: "NOTE" as TimelineEventType,
      createdAt: n.createdAt,
      author: n.author,
      data: { body: n.body },
    })),
  ];

  // Ordinare per data decrescente (più recente prima)
  timeline.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return NextResponse.json({ data: timeline });
}
```

---

## FIX 4 — Componente UI: ContentTimeline

### File: `src/components/shared/content-timeline.tsx` (NUOVO FILE)

```tsx
"use client";

import { useState, useEffect } from "react";
import { formatDistanceToNow } from "date-fns";
import { it } from "date-fns/locale";

// Etichette ruoli italiane
const ROLE_LABELS: Record<string, string> = {
  HOD: "Capo Reparto",
  HOTEL_MANAGER: "Hotel Manager",
  ADMIN: "Admin",
  SUPER_ADMIN: "Super Admin",
};

// Etichette stati italiane
const STATUS_LABELS: Record<string, string> = {
  DRAFT: "Bozza",
  REVIEW_HM: "Revisione HM",
  REVIEW_ADMIN: "Revisione Admin",
  PUBLISHED: "Pubblicato",
  RETURNED: "Restituito",
  ARCHIVED: "Archiviato",
};

interface TimelineEvent {
  id: string;
  type: "STATUS_CHANGE" | "REVISION" | "NOTE";
  createdAt: string;
  author: { id: string; name: string; role: string };
  data: Record<string, unknown>;
}

interface ContentTimelineProps {
  contentId: string;
}

export function ContentTimeline({ contentId }: ContentTimelineProps) {
  const [events, setEvents] = useState<TimelineEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const fetchTimeline = async () => {
    try {
      const res = await fetch(`/api/content/${contentId}/timeline`);
      if (res.ok) {
        const json = await res.json();
        setEvents(json.data);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [contentId]);

  const handleAddNote = async () => {
    if (!newNote.trim() || submitting) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/content/${contentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: newNote.trim() }),
      });
      if (res.ok) {
        setNewNote("");
        fetchTimeline(); // Ricarica timeline
      }
    } finally {
      setSubmitting(false);
    }
  };

  // Icona per tipo evento
  const getEventIcon = (type: string) => {
    switch (type) {
      case "STATUS_CHANGE":
        return (
          <div className="w-8 h-8 rounded-full bg-terracotta/10 flex items-center justify-center flex-shrink-0">
            <div className="w-3 h-3 rounded-full bg-terracotta" />
          </div>
        );
      case "REVISION":
        return (
          <div className="w-8 h-8 rounded-full bg-blue-50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
            </svg>
          </div>
        );
      case "NOTE":
        return (
          <div className="w-8 h-8 rounded-full bg-ivory-dark/50 flex items-center justify-center flex-shrink-0">
            <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
          </div>
        );
    }
  };

  // Rendering contenuto evento
  const renderEventContent = (event: TimelineEvent) => {
    const roleLabel = ROLE_LABELS[event.author.role] || event.author.role;

    switch (event.type) {
      case "STATUS_CHANGE": {
        const from = STATUS_LABELS[event.data.fromStatus as string] || event.data.fromStatus;
        const to = STATUS_LABELS[event.data.toStatus as string] || event.data.toStatus;
        const inlineNote = event.data.note as string | null;
        return (
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{event.author.name}</span>
              <span className="text-xs text-gray-400 ml-1">({roleLabel})</span>
            </p>
            <p className="text-sm text-gray-500">
              {event.data.fromStatus
                ? `${from} → ${to}`
                : `Creato come ${to}`}
            </p>
            {inlineNote && (
              <p className="text-sm text-gray-500 italic mt-1">"{inlineNote}"</p>
            )}
          </div>
        );
      }

      case "REVISION": {
        const titleChanged = event.data.previousTitle !== event.data.newTitle;
        const revisionNote = event.data.note as string | null;
        return (
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{event.author.name}</span>
              <span className="text-xs text-gray-400 ml-1">({roleLabel})</span>
              {" — "}
              <span className="text-blue-600">Contenuto modificato</span>
              {titleChanged && (
                <span className="text-xs text-gray-400 ml-1">(titolo cambiato)</span>
              )}
            </p>
            {revisionNote && (
              <p className="text-sm text-gray-500 italic mt-1">"{revisionNote}"</p>
            )}
            <a
              href={`/api/content/${contentId}/revisions/${event.id}`}
              className="text-xs font-semibold uppercase tracking-wide text-terracotta hover:opacity-70 transition-opacity"
            >
              Vedi modifiche
            </a>
          </div>
        );
      }

      case "NOTE":
        return (
          <div>
            <p className="text-sm text-gray-700">
              <span className="font-medium">{event.author.name}</span>
              <span className="text-xs text-gray-400 ml-1">({roleLabel})</span>
            </p>
            <p className="text-sm text-gray-600 mt-1 whitespace-pre-wrap">
              {event.data.body as string}
            </p>
          </div>
        );
    }
  };

  if (loading) {
    return (
      <div className="py-8 text-center text-sm text-gray-400">
        Caricamento cronologia...
      </div>
    );
  }

  return (
    <div className="mt-12">
      <h3 className="font-heading text-lg font-medium text-almost-black mb-6">
        Cronologia
      </h3>

      {/* Campo aggiungi nota */}
      <div className="mb-8 border border-ivory-dark bg-white p-4">
        <textarea
          value={newNote}
          onChange={(e) => setNewNote(e.target.value)}
          placeholder="Aggiungi una nota..."
          rows={3}
          maxLength={5000}
          className="w-full border border-ivory-dark p-3 text-sm font-body text-gray-700 resize-none focus:outline-none focus:border-terracotta placeholder:text-gray-400"
        />
        <div className="flex items-center justify-between mt-2">
          <span className="text-xs text-gray-400">
            {newNote.length}/5000
          </span>
          <button
            onClick={handleAddNote}
            disabled={!newNote.trim() || submitting}
            className="btn-primary text-xs px-4 py-2 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? "Invio..." : "Aggiungi nota"}
          </button>
        </div>
      </div>

      {/* Timeline */}
      {events.length === 0 ? (
        <p className="text-sm text-gray-400 text-center py-4">
          Nessun evento nella cronologia
        </p>
      ) : (
        <div className="relative">
          {/* Linea verticale */}
          <div className="absolute left-4 top-0 bottom-0 w-px bg-ivory-dark" />

          <div className="space-y-6">
            {events.map((event) => (
              <div key={event.id} className="flex gap-4 relative">
                {getEventIcon(event.type)}
                <div className="flex-1 pb-2">
                  {renderEventContent(event)}
                  <p className="text-xs text-gray-400 mt-1">
                    {formatDistanceToNow(new Date(event.createdAt), {
                      addSuffix: true,
                      locale: it,
                    })}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## FIX 5 — Integrare ContentTimeline nella pagina dettaglio contenuto

### File: `src/app/(operator)/sop/[id]/page.tsx` (e analoghi per documents, memo)

Aggiungere alla fine della pagina di dettaglio, DOPO il corpo del contenuto e PRIMA del footer, il componente timeline. Renderizzarlo solo per utenti con ruolo ≥ HOD:

```tsx
import { ContentTimeline } from "@/components/shared/content-timeline";

// ... nel JSX, dopo il body del contenuto:

{userRole !== "OPERATOR" && (
  <ContentTimeline contentId={content.id} />
)}
```

Lo stesso pattern va applicato nella pagina dettaglio HOO:
- `src/app/(hoo)/dashboard/content/[id]/page.tsx` (se esiste)
- Qualsiasi pagina che mostra il dettaglio completo di un contenuto

---

## FIX 6 — Installare dipendenza date-fns (se non presente)

```bash
npm install date-fns
```

Verificare in `package.json` che `date-fns` sia presente. Se già installata, saltare.

---

## Riepilogo modifiche

| # | File | Azione | Tipo |
|---|------|--------|------|
| 1 | `prisma/schema.prisma` | Aggiungere model ContentNote + relazioni in User e Content (campi note su ContentReview e ContentStatusHistory restano invariati) | Schema |
| 2 | `src/app/api/content/[id]/notes/route.ts` | Nuovo file — GET + POST note | API |
| 3 | `src/app/api/content/[id]/timeline/route.ts` | Nuovo file — GET cronologia unificata | API |
| 4 | `src/components/shared/content-timeline.tsx` | Nuovo file — componente timeline UI | Componente |
| 5 | Pagine dettaglio contenuto | Integrare `<ContentTimeline>` per ruoli ≥ HOD | Integrazione |
| 6 | `package.json` | Aggiungere date-fns se mancante | Dipendenza |

## Ordine di esecuzione

1. FIX 1 (schema + migrazione)
2. FIX 6 (dipendenza date-fns)
3. FIX 2 (API notes)
4. FIX 3 (API timeline)
5. FIX 4 (componente timeline UI)
6. FIX 5 (integrazione timeline nelle pagine)

## Verifica

Dopo l'implementazione:
1. `npx prisma migrate dev` deve completare senza errori
2. `npm run build` deve completare senza errori TypeScript
3. Creare un contenuto di test, aggiungere 2-3 note, verificare che appaiano nella timeline
4. Verificare che OPERATOR non veda la sezione cronologia
5. Verificare che HOD possa aggiungere note solo ai propri contenuti
6. Verificare che la timeline mostri cambi stato + revisioni + note in ordine cronologico unificato
