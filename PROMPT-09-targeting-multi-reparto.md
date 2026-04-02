# PROMPT-09 — Targeting multi-reparto destinatari

## Obiettivo

Consentire di indirizzare una SOP (o Document/Memo) a uno, più o tutti i reparti di una struttura. Attualmente il form di creazione ha un dropdown singolo: o un reparto o "Trasversale (tutti i reparti)". Nella realtà operativa una procedura può essere rivolta a 2-3 reparti specifici senza necessariamente coinvolgere tutti.

**Il modello dati NON cambia.** `ContentTarget` è già una relazione uno-a-molti con Content. La modifica riguarda:
1. La UI del form (da dropdown singolo a multi-select con checkbox)
2. La API POST/PUT che deve creare i record `ContentTarget` corretti
3. La visualizzazione dei destinatari nelle liste

**Riferimento**: sezione "Regole di targeting" in CLAUDE.md.

---

## FIX 1 — Componente DepartmentTargetSelector

### File: `src/components/shared/department-target-selector.tsx` (NUOVO FILE)

```tsx
"use client";

import { useState, useEffect } from "react";

interface Department {
  id: string;
  name: string;
  code: string;
}

interface DepartmentTargetSelectorProps {
  propertyId: string;
  userRole: string;
  userDepartmentId?: string | null;
  selectedDepartmentIds: string[];
  onChange: (departmentIds: string[], allSelected: boolean) => void;
}

export function DepartmentTargetSelector({
  propertyId,
  userRole,
  userDepartmentId,
  selectedDepartmentIds,
  onChange,
}: DepartmentTargetSelectorProps) {
  const [departments, setDepartments] = useState<Department[]>([]);
  const [allSelected, setAllSelected] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDepartments = async () => {
      try {
        const res = await fetch(`/api/properties/${propertyId}/departments`);
        if (res.ok) {
          const json = await res.json();
          setDepartments(json.data || []);
        }
      } finally {
        setLoading(false);
      }
    };
    if (propertyId) {
      setLoading(true);
      fetchDepartments();
    }
  }, [propertyId]);

  // HOD: mostra solo il proprio reparto, pre-selezionato, non modificabile
  if (userRole === "HOD") {
    const ownDept = departments.find((d) => d.id === userDepartmentId);
    return (
      <div>
        <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">
          Reparti destinatari
        </label>
        <div className="border border-ivory-dark bg-ivory-medium/30 px-3 py-2 text-sm text-charcoal">
          {ownDept?.name || "Il tuo reparto"}
        </div>
        <p className="text-xs text-charcoal/40 mt-1">
          Come Capo Reparto puoi creare contenuti solo per il tuo reparto.
        </p>
      </div>
    );
  }

  // HM / ADMIN / SUPER_ADMIN: multi-select libero
  const handleToggleAll = () => {
    if (allSelected) {
      setAllSelected(false);
      onChange([], false);
    } else {
      setAllSelected(true);
      onChange(departments.map((d) => d.id), true);
    }
  };

  const handleToggleDept = (deptId: string) => {
    if (allSelected) {
      // Deselezionare "tutti" e togliere questo reparto
      const newIds = departments.map((d) => d.id).filter((id) => id !== deptId);
      setAllSelected(false);
      onChange(newIds, false);
    } else {
      const isSelected = selectedDepartmentIds.includes(deptId);
      const newIds = isSelected
        ? selectedDepartmentIds.filter((id) => id !== deptId)
        : [...selectedDepartmentIds, deptId];

      // Se tutti selezionati manualmente → attiva "tutti"
      if (newIds.length === departments.length) {
        setAllSelected(true);
        onChange(newIds, true);
      } else {
        onChange(newIds, false);
      }
    }
  };

  if (loading) {
    return <div className="text-sm text-charcoal/40">Caricamento reparti...</div>;
  }

  return (
    <div>
      <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">
        Reparti destinatari
      </label>

      {/* Opzione "Tutti i reparti" */}
      <label className="flex items-center gap-3 py-2.5 px-3 border border-ivory-dark cursor-pointer hover:bg-ivory-medium/30 transition-colors">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={handleToggleAll}
          className="w-4 h-4 accent-terracotta"
        />
        <span className="text-sm font-medium text-charcoal">Tutti i reparti</span>
      </label>

      {/* Lista reparti singoli */}
      <div className="border border-ivory-dark border-t-0 divide-y divide-ivory-dark/50 max-h-[240px] overflow-y-auto">
        {departments.map((dept) => (
          <label
            key={dept.id}
            className="flex items-center gap-3 py-2.5 px-3 cursor-pointer hover:bg-ivory-medium/30 transition-colors"
          >
            <input
              type="checkbox"
              checked={allSelected || selectedDepartmentIds.includes(dept.id)}
              disabled={allSelected}
              onChange={() => handleToggleDept(dept.id)}
              className="w-4 h-4 accent-terracotta disabled:opacity-40"
            />
            <span className="text-sm text-charcoal">{dept.name}</span>
            <span className="text-xs text-charcoal/40 ml-auto">{dept.code}</span>
          </label>
        ))}
      </div>

      {!allSelected && selectedDepartmentIds.length === 0 && (
        <p className="text-xs text-alert-red mt-1.5">Seleziona almeno un reparto destinatario</p>
      )}

      {!allSelected && selectedDepartmentIds.length > 0 && (
        <p className="text-xs text-charcoal/40 mt-1.5">
          {selectedDepartmentIds.length} di {departments.length} reparti selezionati
        </p>
      )}
    </div>
  );
}
```

---

## FIX 2 — Aggiornare SopForm: da dropdown singolo a multi-select

### File: `src/components/hoo/sop-form.tsx`

**Stato attuale:** il form ha un `<select>` singolo per `departmentId` (riga 97-103) con opzione "Trasversale (tutti i reparti)" e un singolo reparto selezionabile.

**Modifiche richieste:**

1. **Aggiungere import** del componente:
```tsx
import { DepartmentTargetSelector } from "@/components/shared/department-target-selector";
```

2. **Sostituire lo state `departmentId`** con due nuovi state:
```tsx
// RIMUOVERE:
// const [departmentId, setDepartmentId] = useState(initialData?.departmentId || "");

// AGGIUNGERE:
const [targetDepartmentIds, setTargetDepartmentIds] = useState<string[]>(
  initialData?.departmentId ? [initialData.departmentId] : []
);
const [targetAllDepartments, setTargetAllDepartments] = useState(
  !initialData?.departmentId // se nessun departmentId iniziale → era trasversale
);
```

3. **Aggiungere props per ruolo e reparto utente** all'interfaccia:
```tsx
interface SopFormProps {
  mode: "create" | "edit";
  contentId?: string;
  initialData?: { title: string; body: string; propertyId: string; departmentId: string | null };
  userRole: string;
  userDepartmentId?: string | null;
}
```

4. **Sostituire il blocco `<select>` del reparto** (righe 97-103) con:
```tsx
<DepartmentTargetSelector
  propertyId={propertyId}
  userRole={userRole}
  userDepartmentId={userDepartmentId}
  selectedDepartmentIds={targetDepartmentIds}
  onChange={(ids, all) => {
    setTargetDepartmentIds(ids);
    setTargetAllDepartments(all);
  }}
/>
```

5. **Aggiornare il layout grid**: il selettore reparti va su riga intera (non colonna), sotto la riga property. Cambiare da `grid-cols-2` a layout verticale per property + reparti:
```tsx
<div>
  <label className="block text-sm font-ui font-medium text-charcoal mb-1.5">Struttura</label>
  <select value={propertyId} onChange={(e) => { setPropertyId(e.target.value); setTargetDepartmentIds([]); setTargetAllDepartments(false); }}
    disabled={mode === "edit"} className="w-full disabled:opacity-50">
    {properties.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
  </select>
</div>

<DepartmentTargetSelector
  propertyId={propertyId}
  userRole={userRole}
  userDepartmentId={userDepartmentId}
  selectedDepartmentIds={targetDepartmentIds}
  onChange={(ids, all) => {
    setTargetDepartmentIds(ids);
    setTargetAllDepartments(all);
  }}
/>
```

6. **Aggiornare il payload di submit** (riga 58-64):
```tsx
const payload = {
  title, body, propertyId,
  departmentId: targetAllDepartments ? null : (targetDepartmentIds[0] || null),
  targetDepartmentIds: targetAllDepartments ? [] : targetDepartmentIds,
  targetAllDepartments,
  ...(mode === "create" ? { type: "SOP" } : {}),
  sendToReview: action === "sendToReview",
  publishDirectly: action === "publishDirectly",
};
```

7. **Aggiornare la validazione `isValid`** (riga 79):
```tsx
const isValid = title.trim() && body.trim() && propertyId && (targetAllDepartments || targetDepartmentIds.length > 0);
```

8. **Reset reparti quando cambia property**: nel `onChange` del select property, resettare i reparti selezionati (già fatto nel punto 5 sopra).

---

## FIX 3 — Aggiornare API POST `/api/content` per creare ContentTarget

### File: `src/app/api/content/route.ts`

**Modifiche allo schema di validazione** (riga 163-171):

```typescript
const createContentSchema = z.object({
  type: z.enum(["SOP", "DOCUMENT", "MEMO", "BRAND_BOOK", "STANDARD_BOOK"]),
  title: z.string().min(1).max(500),
  body: z.string().min(1),
  propertyId: z.string(),
  departmentId: z.string().nullable().optional(),
  targetDepartmentIds: z.array(z.string()).optional().default([]),
  targetAllDepartments: z.boolean().optional().default(false),
  sendToReview: z.boolean().optional(),
  publishDirectly: z.boolean().optional(),
});
```

**Aggiungere creazione ContentTarget** dopo la creazione del Content (dopo riga 233, prima di ContentStatusHistory):

```typescript
// Creazione ContentTarget per i destinatari
if (parsed.data.targetAllDepartments) {
  // Trasversale: target tutti gli operatori della property
  await prisma.contentTarget.create({
    data: {
      contentId: content.id,
      targetType: "ROLE",
      targetRole: "OPERATOR",
    },
  });
} else if (parsed.data.targetDepartmentIds.length > 0) {
  // Target specifico: un record per ogni reparto selezionato
  await prisma.contentTarget.createMany({
    data: parsed.data.targetDepartmentIds.map((deptId) => ({
      contentId: content.id,
      targetType: "DEPARTMENT" as const,
      targetDepartmentId: deptId,
    })),
  });
} else if (departmentId) {
  // Fallback retrocompatibile: se c'è un departmentId singolo (vecchio formato)
  await prisma.contentTarget.create({
    data: {
      contentId: content.id,
      targetType: "DEPARTMENT",
      targetDepartmentId: departmentId,
    },
  });
}
```

**Nota retrocompatibilità:** il campo `departmentId` sul Content resta — indica il reparto "organizzativo" di appartenenza (usato per la generazione del codice SOP, es. NCL-FO-001). I `ContentTarget` indicano a chi è rivolta. Se un HOD del Front Office crea una SOP, `departmentId = Front Office` (codice SOP) E `ContentTarget = Front Office` (destinatario). Se un ADMIN crea una SOP con `departmentId = null` (trasversale) e la indirizza a Front Office + Manutenzione, il codice SOP sarà `NCL-QA-xxx` (Administration) ma i destinatari saranno i 2 reparti selezionati.

---

## FIX 4 — Aggiornare API PUT `/api/content/[id]` per aggiornare ContentTarget

### File: `src/app/api/content/[id]/route.ts`

Nella funzione PUT, se il contenuto è in stato DRAFT o RETURNED (non ancora pubblicato), consentire l'aggiornamento dei destinatari:

```typescript
// Aggiornamento ContentTarget (solo se non ancora pubblicato)
if (
  content.status === "DRAFT" || content.status === "RETURNED"
) {
  const { targetDepartmentIds, targetAllDepartments } = validatedBody;

  if (targetDepartmentIds !== undefined || targetAllDepartments !== undefined) {
    // Rimuovere target esistenti
    await prisma.contentTarget.deleteMany({
      where: { contentId: params.id },
    });

    // Ricreare
    if (targetAllDepartments) {
      await prisma.contentTarget.create({
        data: {
          contentId: params.id,
          targetType: "ROLE",
          targetRole: "OPERATOR",
        },
      });
    } else if (targetDepartmentIds && targetDepartmentIds.length > 0) {
      await prisma.contentTarget.createMany({
        data: targetDepartmentIds.map((deptId: string) => ({
          contentId: params.id,
          targetType: "DEPARTMENT" as const,
          targetDepartmentId: deptId,
        })),
      });
    }
  }
}
```

Aggiornare anche lo schema di validazione del PUT per accettare i nuovi campi.

---

## FIX 5 — Visualizzazione destinatari nelle card e liste

### Utility: `src/lib/format-targets.ts` (NUOVO FILE)

```typescript
interface ContentTargetInfo {
  targetType: string;
  targetRole?: string | null;
  targetDepartment?: { name: string } | null;
}

/**
 * Formatta i destinatari di un contenuto in stringa leggibile.
 * - 1 reparto: "Rivolta a: Front Office"
 * - 2-3 reparti: "Rivolta a: Front Office, Manutenzione"
 * - 4+ reparti: "Rivolta a: Front Office, Manutenzione +2"
 * - Tutti: "Rivolta a: Tutti i reparti"
 */
export function formatTargetAudience(targets: ContentTargetInfo[]): string {
  if (!targets || targets.length === 0) return "";

  // Se c'è un target ROLE → trasversale
  const roleTarget = targets.find((t) => t.targetType === "ROLE");
  if (roleTarget) return "Tutti i reparti";

  // Reparti specifici
  const deptNames = targets
    .filter((t) => t.targetType === "DEPARTMENT" && t.targetDepartment)
    .map((t) => t.targetDepartment!.name);

  if (deptNames.length === 0) return "";
  if (deptNames.length <= 3) return deptNames.join(", ");
  return `${deptNames.slice(0, 2).join(", ")} +${deptNames.length - 2}`;
}
```

### Aggiornare le query nelle liste per includere targetAudience

In tutte le query che caricano contenuti per le liste (GET `/api/content`, componenti lista SOP, ecc.), aggiungere al `select`:

```typescript
targetAudience: {
  select: {
    targetType: true,
    targetRole: true,
    targetDepartment: { select: { name: true } },
  },
},
```

### Aggiornare le card SOP per mostrare i destinatari

Nei componenti che renderizzano le card SOP (es. `content-list.tsx`, `hoo-latest-by-type.tsx`, `latest-by-type.tsx`), aggiungere sotto il titolo o nei meta:

```tsx
import { formatTargetAudience } from "@/lib/format-targets";

// nel JSX della card:
{content.targetAudience && content.targetAudience.length > 0 && (
  <span className="text-xs text-charcoal/45">
    Rivolta a: {formatTargetAudience(content.targetAudience)}
  </span>
)}
```

---

## FIX 6 — Caricare dati iniziali dei target in modalità edit

### File: `src/components/hoo/sop-form.tsx`

Quando il form è in modalità `edit`, i target attuali del contenuto devono essere caricati per pre-popolare il `DepartmentTargetSelector`.

Aggiungere un fetch nel `useEffect` iniziale:

```typescript
// In modalità edit, caricare i target attuali
if (mode === "edit" && contentId) {
  const targetRes = await fetch(`/api/content/${contentId}`);
  if (targetRes.ok) {
    const targetJson = await targetRes.json();
    const targets = targetJson.data.targetAudience || [];
    const hasRoleTarget = targets.some((t: any) => t.targetType === "ROLE");
    if (hasRoleTarget) {
      setTargetAllDepartments(true);
      setTargetDepartmentIds([]);
    } else {
      const deptIds = targets
        .filter((t: any) => t.targetType === "DEPARTMENT")
        .map((t: any) => t.targetDepartmentId);
      setTargetDepartmentIds(deptIds);
      setTargetAllDepartments(false);
    }
  }
}
```

L'API GET del singolo contenuto (`/api/content/[id]`) deve includere `targetAudience` nel select se non lo fa già.

---

## Riepilogo modifiche

| # | File | Azione | Tipo |
|---|------|--------|------|
| 1 | `src/components/shared/department-target-selector.tsx` | Nuovo file — multi-select reparti con checkbox | Componente |
| 2 | `src/components/hoo/sop-form.tsx` | Sostituire dropdown singolo reparto con DepartmentTargetSelector | Modifica |
| 3 | `src/app/api/content/route.ts` (POST) | Aggiungere validazione + creazione ContentTarget per array reparti | API |
| 4 | `src/app/api/content/[id]/route.ts` (PUT) | Aggiornare ContentTarget se contenuto non ancora pubblicato | API |
| 5 | `src/lib/format-targets.ts` | Nuovo file — utility formattazione destinatari | Utility |
| 5b | Componenti lista (content-list, latest-by-type, ecc.) | Mostrare "Rivolta a: ..." nelle card | UI |
| 6 | `src/components/hoo/sop-form.tsx` | Caricare target esistenti in modalità edit | Modifica |

## Ordine di esecuzione

1. FIX 1 (componente DepartmentTargetSelector)
2. FIX 5 (utility formatTargetAudience)
3. FIX 3 (API POST — creazione ContentTarget)
4. FIX 4 (API PUT — aggiornamento ContentTarget)
5. FIX 2 + FIX 6 (SopForm — integrazione multi-select + caricamento dati edit)
6. FIX 5b (visualizzazione nelle card)

## Verifica

Dopo l'implementazione:
1. `npm run build` deve completare senza errori TypeScript
2. **HOD** crea una SOP → vede solo il proprio reparto pre-selezionato, non modificabile. ContentTarget creato: 1 record DEPARTMENT con il suo reparto
3. **HM** crea una SOP selezionando 2 reparti su 6 → ContentTarget creati: 2 record DEPARTMENT. Card mostra "Rivolta a: Front Office, Manutenzione"
4. **ADMIN** crea una SOP selezionando "Tutti i reparti" → ContentTarget creato: 1 record ROLE con targetRole OPERATOR. Card mostra "Rivolta a: Tutti i reparti"
5. **ADMIN** crea una SOP selezionando 4 reparti → card mostra "Rivolta a: Front Office, Housekeeping +2"
6. Modificare una SOP in DRAFT: i reparti selezionati devono apparire pre-selezionati nel form
7. Modificare una SOP in PUBLISHED: i reparti NON devono essere modificabili (i destinatari sono fissi dopo la pubblicazione)
8. La validazione impedisce di salvare senza almeno un reparto selezionato
