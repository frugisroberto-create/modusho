# Prompt 07 — Hardening correttivo post Hard Test

Lavora sul progetto già esistente di **ModusHO** (cartella `DomusGO/`).

Questa task NON introduce nuove feature.
È una task di **hardening correttivo** successiva al report di hard test.
Obiettivo: correggere in modo chirurgico i problemi **Critici** e **Alti** emersi dal test, senza refactor inutili e senza rompere il comportamento sano già esistente.

---

## REGOLE DI ESECUZIONE

- Non fare refactor ampi o estetici.
- Non introdurre nuove entità o nuovi concetti di prodotto.
- Non cambiare il workflow SOP.
- Mantieni il progetto compilabile in ogni momento.
- Correggi i buchi in modo esplicito lato server. Non affidarti al frontend.
- Ogni fix deve essere verificabile con un test manuale descritto alla fine.

---

## FIX 1 — `GET /api/content/[id]` — Bloccare contenuti non pubblicati per OPERATOR e HOD non autore

### Problema
Il file `src/app/api/content/[id]/route.ts` (funzione GET) fa `checkAccess` su property/department ma non verifica lo `status` del contenuto rispetto al ruolo. Un OPERATOR che conosce un ID può leggere DRAFT, REVIEW_HM, RETURNED via chiamata diretta.

### Regola esatta per ruolo

| Ruolo | Contenuti visibili |
|-------|--------------------|
| OPERATOR | Solo `PUBLISHED` |
| HOD | `PUBLISHED` + contenuti dove è autore (`createdById === userId`) in qualsiasi stato |
| HOTEL_MANAGER | `PUBLISHED` + tutti i contenuti della propria property in qualsiasi stato (li revisiona) |
| ADMIN | Tutti i contenuti delle property assegnate in qualsiasi stato |
| SUPER_ADMIN | Tutto |

### Cosa fare

Dopo la riga `if (!hasAccess)` (riga ~49), aggiungere:

```typescript
// Visibilità basata su status + ruolo
const userRole = session.user.role;
if (content.status !== "PUBLISHED") {
  if (userRole === "OPERATOR") {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }
  if (userRole === "HOD" && content.createdById !== userId) {
    return NextResponse.json({ error: "Contenuto non trovato" }, { status: 404 });
  }
  // HM, ADMIN, SUPER_ADMIN: accesso già verificato da checkAccess
}
```

**Nota**: restituire 404 (non 403) per non rivelare l'esistenza del contenuto.

**Nota**: il `select` nella query Prisma attuale NON include `createdById`. Aggiungilo al `findUnique`.

---

## FIX 2 — `GET /api/content` — Forzare filtro status per OPERATOR e HOD

### Problema
Il file `src/app/api/content/route.ts` (funzione GET, riga ~80) applica `if (status) where.status = status` senza verificare se il ruolo ha diritto a vedere quello stato. Un OPERATOR può chiamare `?status=DRAFT` e ottenere bozze.

### Regola esatta

| Ruolo | Query `status` permessi |
|-------|------------------------|
| OPERATOR | Solo `PUBLISHED` (ignorare qualsiasi altro valore passato dal client) |
| HOD | `PUBLISHED`, `DRAFT`, `RETURNED` (solo i propri: aggiungere `createdById` al where), `REVIEW_HM` (solo i propri) |
| HOTEL_MANAGER | Qualsiasi stato (contenuti della propria property) |
| ADMIN | Qualsiasi stato (contenuti delle property assegnate) |
| SUPER_ADMIN | Qualsiasi stato |

### Cosa fare

Dopo riga ~79 (`if (type) where.type = type;`), sostituire il blocco `if (status) where.status = status;` con logica condizionale:

```typescript
const userRole = session.user.role;

if (userRole === "OPERATOR") {
  // Operatore vede SOLO PUBLISHED, ignora status dal client
  where.status = "PUBLISHED";
} else if (userRole === "HOD") {
  if (status && status !== "PUBLISHED") {
    // HOD vede non-PUBLISHED solo se è autore
    where.status = status;
    where.createdById = userId;
  } else if (!status) {
    // Senza filtro esplicito: mostra PUBLISHED + propri non-PUBLISHED
    where.OR = [
      ...(where.OR as Array<Record<string, unknown>> || []),
      // Questo va integrato con l'OR esistente per department
    ];
    // ATTENZIONE: l'OR esistente è per department. Valuta se usare AND con nested OR,
    // oppure semplifica: senza status esplicito, mostra solo PUBLISHED per HOD.
    // La soluzione più pulita: se HOD non specifica status → forza PUBLISHED
    where.status = "PUBLISHED";
  } else {
    where.status = status; // status === "PUBLISHED"
  }
} else {
  // HM, ADMIN, SUPER_ADMIN: rispetta il filtro status dal client
  if (status) where.status = status;
}
```

**ATTENZIONE**: la query ha già un `OR` per i department (riga ~73). Non creare conflitto con un secondo `OR` a top level. Prisma accetta un solo `OR` per livello. Se serve logica complessa, usa `AND: [{ OR: [...department...] }, { OR: [...status...] }]`.

La soluzione più sicura per HOD senza `status` nel query param: forzare `PUBLISHED`. Se l'HOD vuole i propri draft, deve passare esplicitamente `?status=DRAFT`.

---

## FIX 3 — `PUT /api/content/[id]` — Bloccare cambio `departmentId` non autorizzato

### Problema
Il file `src/app/api/content/[id]/route.ts` (funzione PUT, riga ~171) applica `departmentId` dal body senza verificare che l'utente abbia accesso al nuovo reparto. Un HOD Front Office può spostare una SOP su F&B.

### Cosa fare

Dopo riga ~141 (`const { title, body, departmentId, ... } = parsed.data;`) e prima dell'update, aggiungere:

```typescript
// Se il body contiene un nuovo departmentId, verificare accesso
if (departmentId !== undefined && departmentId !== content.departmentId) {
  if (departmentId !== null) {
    // Verifica che il nuovo reparto appartenga alla stessa property
    const newDept = await prisma.department.findFirst({
      where: { id: departmentId, propertyId: content.propertyId },
    });
    if (!newDept) {
      return NextResponse.json({ error: "Reparto non trovato nella property" }, { status: 400 });
    }
    // Verifica che l'utente abbia accesso al nuovo reparto
    const hasAccessToNewDept = await checkAccess(userId, "HOD", content.propertyId, departmentId);
    if (!hasAccessToNewDept) {
      return NextResponse.json({ error: "Non hai accesso al reparto selezionato" }, { status: 403 });
    }
  }
}
```

---

## FIX 4 — `GET /api/properties/[id]/departments` — Aggiungere RBAC

### Problema
Il file `src/app/api/properties/[id]/departments/route.ts` restituisce i reparti di qualsiasi property a qualsiasi utente autenticato. Un utente Nicolaus può enumerare i reparti del Patria.

### Cosa fare

Dopo il controllo di autenticazione, aggiungere:

```typescript
const { id: propertyId } = await params;

// RBAC: verifica accesso alla property
const accessiblePropertyIds = await getAccessiblePropertyIds(userId);
if (!accessiblePropertyIds.includes(propertyId)) {
  return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
}
```

Importare `getAccessiblePropertyIds` da `@/lib/rbac` se non già importato.

**Eccezione**: SUPER_ADMIN (senza property assignment) deve avere accesso. Verifica che `getAccessiblePropertyIds` gestisca già il bypass SUPER_ADMIN. Se non lo fa, aggiungi check esplicito:

```typescript
if (session.user.role !== "SUPER_ADMIN" && !accessiblePropertyIds.includes(propertyId)) {
  return NextResponse.json({ error: "Accesso negato" }, { status: 403 });
}
```

---

## FIX 5 — Guardrail server-side sulle pagine HOO

### Problema
Le pagine HOO sono tutte `"use client"` senza check server-side. Il middleware blocca OPERATOR e HOD, ma un HOTEL_MANAGER arriva su `/users/new` (form creazione utente) — azione riservata ad ADMIN.

### Mappa ruoli minimi per pagina

| Pagina | Ruolo minimo | Note |
|--------|-------------|------|
| `/dashboard` | HOTEL_MANAGER | Home HOO — OK col middleware attuale |
| `/approvals`, `/approvals/[id]` | HOTEL_MANAGER | HM revisiona, ADMIN approva |
| `/hoo-sop`, `/hoo-sop/new`, `/hoo-sop/[id]/edit` | HOTEL_MANAGER | HM e ADMIN creano contenuti |
| `/memo`, `/memo/new`, `/memo/[id]` | HOTEL_MANAGER | HM e ADMIN gestiscono memo |
| `/library` | HOTEL_MANAGER | Libreria contenuti |
| `/users`, `/users/new`, `/users/[id]` | **ADMIN** | Solo ADMIN gestisce utenti |
| `/properties`, `/properties/new`, `/properties/[id]`, `/properties/[id]/edit` | **ADMIN** | Solo ADMIN gestisce strutture |
| `/reports` | HOTEL_MANAGER | Report visibili anche a HM |
| `/analytics` | **ADMIN** | Già protetto nel middleware |
| `/content/deleted` | **SUPER_ADMIN** | Solo SUPER_ADMIN vede eliminati |

### Cosa fare

**Opzione consigliata**: aggiungere i check nel middleware (`src/middleware.ts`), che è il punto centralizzato di protezione.

Dopo il blocco `if (pathname.startsWith("/analytics"))` (riga ~25), aggiungere:

```typescript
// Route utenti e properties: solo ADMIN+
if (pathname.startsWith("/users") || pathname.startsWith("/properties")) {
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.ADMIN) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
}

// Route contenuti eliminati: solo SUPER_ADMIN
if (pathname.startsWith("/content/deleted")) {
  if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.SUPER_ADMIN) {
    return NextResponse.redirect(new URL("/unauthorized", req.url));
  }
}
```

**ATTENZIONE all'ordine**: questi check devono venire PRIMA del blocco generico che richiede `≥ HOTEL_MANAGER` (riga ~31), altrimenti il blocco generico li intercetta prima e li lascia passare.

Il middleware finale deve avere questo ordine:
1. Check `/content/deleted` → SUPER_ADMIN
2. Check `/analytics` → ADMIN
3. Check `/users`, `/properties` → ADMIN
4. Check generico HOO (`/dashboard`, `/approvals`, `/hoo-sop`, `/memo`, `/library`, `/reports`) → HOTEL_MANAGER

---

## FIX 6 — `isDeleted: false` mancante in Dashboard

### Problema
`src/app/api/dashboard/route.ts`: le query `deptsWithPublished` e `highReturnHotels` non filtrano `isDeleted: false`. I KPI contano anche contenuti eliminati.

### Cosa fare

Cerca TUTTE le query `prisma.content.` in quel file. Per ogni `findMany`, `count`, `groupBy`, `aggregate` che NON ha già `isDeleted: false` nel `where`, aggiungilo.

Non limitarti alle 2 query segnalate — fai un audit completo del file.

---

## FIX 7 — `isDeleted: false` mancante in Reports

### Problema
`src/app/api/reports/route.ts`: stessa carenza. Query `hotelStats` e simili non filtrano i contenuti eliminati.

### Cosa fare

Stessa procedural del Fix 6: audit completo di tutte le query `prisma.content.` nel file, aggiungere `isDeleted: false` dove manca.

---

## FIX 8 — HooHomeStats: memo count sempre 0

### Problema
`src/components/hoo/hoo-home-stats.tsx` (riga 29): la fetch memo usa `propertyId=` (stringa vuota). Riga 35: `memoActive` è hardcoded a `0`, il risultato della fetch viene ignorato.

### Cosa fare

1. Rimuovere il `propertyId=` vuoto — la fetch memo non deve filtrare per property singola nella home HOO (l'utente vede tutte le sue property)
2. Parsare effettivamente la risposta memo e assegnare il count a `memoActive`
3. Verificare che l'API `/api/memo` restituisca un `meta.total` come `/api/content`

Correzione indicativa:
```typescript
// Riga 29: sostituire
fetch("/api/memo?propertyId=&pageSize=1").catch(() => null),
// con
fetch("/api/memo?pageSize=1"),

// Riga 35: sostituire
memoActive: 0,
// con
memoActive: memoRes && memoRes.ok ? (await memoRes.json()).meta?.total ?? 0 : 0,
```

**ATTENZIONE**: `memoRes` alla riga 20 è dentro un `Promise.all` — la quarta posizione. Verificare che il tipo restituito sia compatibile (il `.catch(() => null)` attuale restituisce `null`, non un `Response`). Rimuovere il `.catch(() => null)` e gestire l'errore nel try/catch esterno.

---

## FIX 9 — Pulizia UI minima coerente coi fix

Dopo i fix server-side, allinea la UI dove il report segnala confusione.

### 9a — Sidebar/nav HOO: nascondi "Gestione utenti" e "Strutture" a HOTEL_MANAGER

Nel componente `src/components/hoo/hoo-sidebar.tsx` (o equivalente layout HOO), le voci menu per `/users` e `/properties` devono essere visibili solo a ADMIN e SUPER_ADMIN. Usa la session/ruolo per il rendering condizionale.

### 9b — Bottoni approvazione: nascondi a chi non ha `canApprove`

Nel componente `src/components/hoo/approval-actions.tsx`, i bottoni "Approva" e "Restituisci" devono essere visibili solo se `session.user.canApprove === true`. Il backend protegge già, ma l'utente non deve vedere azioni che non può compiere.

### 9c — Documenti link nella home HOO

In `hoo-home-stats.tsx` riga 55: il box "Documenti" punta a `/hoo-sop` invece di una route documenti dedicata. Se esiste una route documenti nel layout HOO (es. `/library`), correggi l'href. Se non esiste, lascia `/hoo-sop` ma cambia label.

---

## VERIFICA OBBLIGATORIA

Dopo tutti i fix, esegui:

```bash
npx tsc --noEmit
npm run build
```

Poi verifica manualmente questi casi:

### Caso A — OPERATOR (`op.fo.nicolaus@modusho.test`)
- [ ] `GET /api/content?status=DRAFT` → restituisce lista vuota (0 risultati), non errore
- [ ] `GET /api/content/[id-di-una-bozza]` → 404
- [ ] Navigazione a `/users` via URL → redirect a `/unauthorized`
- [ ] Navigazione a `/dashboard` via URL → redirect a `/unauthorized`

### Caso B — HOD (`hod.fo.nicolaus@modusho.test`)
- [ ] `GET /api/content?status=DRAFT` → restituisce SOLO le proprie bozze
- [ ] `GET /api/content/[id-bozza-altrui]` → 404
- [ ] `PUT /api/content/[id]` con departmentId di reparto F&B → 403
- [ ] `GET /api/properties/[id-patria]/departments` → 403
- [ ] Navigazione a `/users` → redirect a `/unauthorized`

### Caso C — HOTEL_MANAGER (`hm.nicolaus@modusho.test`)
- [ ] Vede contenuti in tutti gli stati della propria property
- [ ] NON vede voci menu "Gestione utenti" e "Strutture"
- [ ] Navigazione a `/users` via URL → redirect a `/unauthorized`
- [ ] Navigazione a `/approvals` → funziona normalmente

### Caso D — ADMIN (`admin@modusho.test`)
- [ ] Vede tutto nelle property assegnate
- [ ] Vede voci menu "Gestione utenti" e "Strutture"
- [ ] Navigazione a `/users/new` → funziona

### Caso E — Dashboard/Reports
- [ ] I KPI non contano contenuti con `isDeleted: true`
- [ ] Il contatore "Memo attivi" nella home HOO mostra un numero > 0 (se ci sono memo nel seed)

---

## OUTPUT ATTESO

1. Esegui `tsc --noEmit` e `npm run build` — entrambi devono passare
2. Restituisci riepilogo:
   - File modificati (elenco)
   - Per ogni fix: cosa è stato fatto, righe toccate
   - Esito verifica manuale
   - Eventuali punti ancora aperti

---

## PRIORITÀ DI ESECUZIONE

1. Fix 1 — GET content/[id] status check ← critico
2. Fix 2 — GET content lista status enforcement ← critico
3. Fix 5 — Middleware guardrail pagine ← critico (facile)
4. Fix 3 — PUT content departmentId check ← alto
5. Fix 4 — GET departments RBAC ← alto
6. Fix 6 — Dashboard isDeleted ← alto
7. Fix 7 — Reports isDeleted ← alto
8. Fix 8 — HooHomeStats memo count ← bug funzionale
9. Fix 9 — Pulizia UI minima ← coerenza

---

## REGOLA FINALE

Non fare overengineering. Chiudi i buchi veri, in modo chiaro, pulito e verificabile.
Se un fix rischia di rompere qualcosa, segnala il rischio e proponi alternativa — non procedere alla cieca.
