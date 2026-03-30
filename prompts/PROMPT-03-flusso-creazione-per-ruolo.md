# PROMPT 3 — Correzione flusso creazione/invio contenuti per ruolo

## Contesto

Il sistema attuale tratta tutti i ruoli allo stesso modo nella creazione dei contenuti: chiunque crei un contenuto e clicchi "Salva e invia", il sistema lo manda sempre a `REVIEW_HM`. Questo è sbagliato dal punto di vista della governance.

La matrice RACI del flusso approvativo è:

| Ruolo | Tipo RACI | Significato |
|-------|-----------|-------------|
| OPERATOR | I (Informed) | Riceve, legge, conferma presa visione |
| HOD | R (Responsible) | Crea contenuti per il proprio reparto |
| HOTEL_MANAGER | R + C (Responsible + Consulted) | Crea contenuti per la struttura E viene consultato su quelli creati da HOD o ADMIN |
| ADMIN | A + R (Accountable + Responsible) | Approvazione finale E può creare/pubblicare in autonomia |
| SUPER_ADMIN | A + R (Accountable + Responsible) | Stesso livello di ADMIN, bypassa tutto |

**Regola chiave**: ogni ruolo, quando invia un contenuto, deve saltare i livelli di approvazione pari o inferiori al proprio. Non ha senso che un Hotel Manager invii "a se stesso" per review.

## Flusso target per ruolo

### HOD → invia a HM
- `sendToReview` porta a stato `REVIEW_HM`
- È il flusso standard, già funzionante
- Bottone: **"Invia a Hotel Manager"**

### HOTEL_MANAGER → invia a ADMIN
- `sendToReview` porta a stato `REVIEW_ADMIN` (salta REVIEW_HM)
- L'HM non può approvare se stesso — il suo livello è già soddisfatto
- Bottone: **"Invia per approvazione finale"**

### ADMIN → due opzioni
- Opzione 1: `sendToReview` porta a stato `REVIEW_HM` — manda all'HM della struttura per consultazione. L'HM revisiona e inoltra, poi torna all'ADMIN per approvazione finale.
- Opzione 2: `publishDirectly` porta a stato `PUBLISHED` — l'ADMIN ha autorità finale, può pubblicare in autonomia.
- Bottoni: **"Invia a Hotel Manager"** + **"Pubblica"**

### SUPER_ADMIN → stesse opzioni di ADMIN
- Opzione 1: `sendToReview` → `REVIEW_HM`
- Opzione 2: `publishDirectly` → `PUBLISHED`
- Bottoni: **"Invia a Hotel Manager"** + **"Pubblica"**

---

## TASK 1 — Nuova utility: `getSubmitTargetStatus`

### File: `src/lib/content-workflow.ts` (NUOVO)

Crea una funzione che calcola lo stato target in base al ruolo del creatore:

```typescript
import { Role, ContentStatus } from "@prisma/client";

export type SubmitAction = "sendToReview" | "publishDirectly";

/**
 * Determina lo stato target quando un utente invia un contenuto.
 * Ogni ruolo salta i livelli di approvazione ≤ al proprio.
 */
export function getSubmitTargetStatus(
  role: Role,
  action: SubmitAction
): ContentStatus {
  if (action === "publishDirectly") {
    // Solo ADMIN e SUPER_ADMIN possono pubblicare direttamente
    if (role === "ADMIN" || role === "SUPER_ADMIN") {
      return "PUBLISHED";
    }
    throw new Error(`Il ruolo ${role} non può pubblicare direttamente`);
  }

  // action === "sendToReview"
  switch (role) {
    case "HOD":
      return "REVIEW_HM";          // HOD → manda all'HM
    case "HOTEL_MANAGER":
      return "REVIEW_ADMIN";        // HM → salta se stesso, manda ad ADMIN
    case "ADMIN":
    case "SUPER_ADMIN":
      return "REVIEW_HM";           // ADMIN/SA → manda a HM per consultazione
    default:
      throw new Error(`Il ruolo ${role} non può inviare contenuti`);
  }
}

/**
 * Restituisce le azioni disponibili per il ruolo del creatore.
 * Usato dal frontend per mostrare i bottoni corretti.
 */
export function getAvailableSubmitActions(role: Role): {
  canSendToReview: boolean;
  canPublishDirectly: boolean;
  reviewLabel: string;
} {
  switch (role) {
    case "HOD":
      return {
        canSendToReview: true,
        canPublishDirectly: false,
        reviewLabel: "Invia a Hotel Manager",
      };
    case "HOTEL_MANAGER":
      return {
        canSendToReview: true,
        canPublishDirectly: false,
        reviewLabel: "Invia per approvazione finale",
      };
    case "ADMIN":
    case "SUPER_ADMIN":
      return {
        canSendToReview: true,
        canPublishDirectly: true,
        reviewLabel: "Invia a Hotel Manager",
      };
    default:
      return {
        canSendToReview: false,
        canPublishDirectly: false,
        reviewLabel: "",
      };
  }
}
```

---

## TASK 2 — Modificare API POST `/api/content/route.ts`

### Cambiamenti nel body schema

Aggiungere `publishDirectly` al schema di validazione:

```typescript
const createContentSchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),
});
```

### Cambiamenti nella logica di creazione

Sostituire la riga:

```typescript
const initialStatus = sendToReview ? "REVIEW_HM" : "DRAFT";
```

Con la logica che usa `getSubmitTargetStatus`:

```typescript
import { getSubmitTargetStatus } from "@/lib/content-workflow";

// Determina lo stato iniziale in base al ruolo
let initialStatus: ContentStatus = "DRAFT";

if (publishDirectly) {
  initialStatus = getSubmitTargetStatus(session.user.role, "publishDirectly");
} else if (sendToReview) {
  initialStatus = getSubmitTargetStatus(session.user.role, "sendToReview");
}
```

### Aggiornare la sezione ContentStatusHistory

Se `publishDirectly` → creare due record di history:
1. `null → DRAFT` (creazione)
2. `DRAFT → PUBLISHED` (pubblicazione diretta)

E settare `publishedAt: new Date()` nel content.create.

Se `sendToReview` con ruolo HM → creare:
1. `null → DRAFT` (creazione)
2. `DRAFT → REVIEW_ADMIN` (invio diretto ad approvazione finale)

Se `sendToReview` con ruolo HOD → comportamento invariato:
1. `null → DRAFT`
2. `DRAFT → REVIEW_HM`

Se `sendToReview` con ruolo ADMIN/SUPER_ADMIN → creare:
1. `null → DRAFT`
2. `DRAFT → REVIEW_HM` (consultazione HM)

---

## TASK 3 — Modificare API PUT `/api/content/[id]/route.ts`

Stessa logica del POST. La sezione "Invio a review" (righe 170-179) attualmente forza sempre `REVIEW_HM`:

```typescript
// VECCHIO (da sostituire)
if (sendToReview && (content.status === "DRAFT" || content.status === "RETURNED")) {
  await changeContentStatus({
    contentId: id,
    fromStatus: content.status,
    toStatus: "REVIEW_HM",
    changedById: userId,
    note: "Inviata a review HM",
  });
}
```

Sostituire con:

```typescript
// NUOVO
if ((sendToReview || publishDirectly) && (content.status === "DRAFT" || content.status === "RETURNED")) {
  const action = publishDirectly ? "publishDirectly" : "sendToReview";
  const targetStatus = getSubmitTargetStatus(role, action);

  await changeContentStatus({
    contentId: id,
    fromStatus: content.status,
    toStatus: targetStatus,
    changedById: userId,
    note: publishDirectly
      ? "Pubblicazione diretta da " + role
      : `Inviato a ${targetStatus === "REVIEW_HM" ? "Hotel Manager" : "approvazione finale"}`,
  });
}
```

Aggiungere `publishDirectly` anche allo schema di validazione dell'update:

```typescript
const updateContentSchema = z.object({
  title: z.string().min(1).max(500).optional(),
  body: z.string().min(1).optional(),
  departmentId: z.string().nullable().optional(),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),       // ← AGGIUNGERE
  requireNewAcknowledgment: z.boolean().optional(),
});
```

---

## TASK 4 — Nuova API: GET `/api/content/submit-actions`

Endpoint che il frontend chiama per sapere quali bottoni mostrare.

### File: `src/app/api/content/submit-actions/route.ts` (NUOVO)

```typescript
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getAvailableSubmitActions } from "@/lib/content-workflow";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autenticato" }, { status: 401 });
  }

  const actions = getAvailableSubmitActions(session.user.role);

  return NextResponse.json({ data: actions });
}
```

---

## TASK 5 — Modificare `SopForm` con bottoni dinamici per ruolo

### File: `src/components/hoo/sop-form.tsx`

Il form deve chiamare `/api/content/submit-actions` all'avvio e mostrare i bottoni corretti.

### Cambiamenti:

1. **Aggiungere stato per le azioni disponibili:**

```typescript
const [submitActions, setSubmitActions] = useState<{
  canSendToReview: boolean;
  canPublishDirectly: boolean;
  reviewLabel: string;
} | null>(null);
```

2. **Fetch azioni al mount:**

```typescript
useEffect(() => {
  async function fetchActions() {
    const res = await fetch("/api/content/submit-actions");
    if (res.ok) {
      const json = await res.json();
      setSubmitActions(json.data);
    }
  }
  fetchActions();
}, []);
```

3. **Modificare `handleSubmit`** per accettare il tipo di azione:

```typescript
const handleSubmit = async (action: "draft" | "sendToReview" | "publishDirectly") => {
  if (!title.trim() || !body.trim() || !propertyId) return;
  setLoading(true);
  try {
    const payload = {
      title, body, propertyId,
      departmentId: departmentId || null,
      ...(mode === "create" ? { type: "SOP" } : {}),
      sendToReview: action === "sendToReview",
      publishDirectly: action === "publishDirectly",
    };
    // ... rest unchanged
  } finally { setLoading(false); }
};
```

4. **Sostituire i bottoni** (attualmente righe 99-111):

```tsx
<div className="flex gap-3 pt-2">
  {/* Sempre visibile: Salva bozza */}
  <button onClick={() => handleSubmit("draft")}
    disabled={loading || !title.trim() || !body.trim()}
    className="px-5 py-2.5 text-sm font-medium text-gray-700 bg-white border border-gray-300 hover:bg-gray-50 rounded-lg disabled:opacity-50">
    {loading ? "Salvataggio..." : "Salva come bozza"}
  </button>

  {/* Invia a review (label dinamica per ruolo) */}
  {submitActions?.canSendToReview && (
    <button onClick={() => handleSubmit("sendToReview")}
      disabled={loading || !title.trim() || !body.trim()}
      className="px-5 py-2.5 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50">
      {loading ? "Invio..." : submitActions.reviewLabel}
    </button>
  )}

  {/* Pubblica direttamente (solo ADMIN/SUPER_ADMIN) */}
  {submitActions?.canPublishDirectly && (
    <button onClick={() => handleSubmit("publishDirectly")}
      disabled={loading || !title.trim() || !body.trim()}
      className="px-5 py-2.5 text-sm font-medium text-white bg-green-600 hover:bg-green-700 rounded-lg disabled:opacity-50">
      {loading ? "Pubblicazione..." : "Pubblica"}
    </button>
  )}

  <button onClick={() => router.back()}
    className="px-5 py-2.5 text-sm text-gray-500 hover:text-gray-700">
    Annulla
  </button>
</div>
```

---

## TASK 6 — Aggiornare seed per testare il flusso

### File: `prisma/seed.ts`

Aggiungere almeno 2 contenuti che testino i nuovi flussi:

1. Un contenuto creato da HOTEL_MANAGER con status `REVIEW_ADMIN` (ha saltato REVIEW_HM) — con ContentStatusHistory: `null → DRAFT → REVIEW_ADMIN`
2. Un contenuto creato da ADMIN con status `PUBLISHED` (pubblicazione diretta) — con ContentStatusHistory: `null → DRAFT → PUBLISHED`

---

## Regole imperative

1. **NON toccare** il flusso di review (`/api/content/[id]/review/route.ts`) — il processo HM→ADMIN→PUBLISHED di approvazione è corretto e non cambia.
2. **NON toccare** la grafica — niente CSS, font, colori, border-radius.
3. **Usare SEMPRE** `changeContentStatus()` per i cambi di stato — mai update diretto.
4. **Ogni cambio di stato** deve generare un record in `ContentStatusHistory`.
5. La funzione `getSubmitTargetStatus` è l'UNICA fonte di verità per il calcolo dello stato target. Le API non devono contenere logica duplicata.
6. Il bottone "Pubblica" deve avere uno stile visivamente distinto (verde, non blu) per comunicare che è un'azione finale.
7. **Validazione server-side**: se un HOD tenta `publishDirectly=true`, l'API deve restituire 403. Non fidarsi del frontend.
