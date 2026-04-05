# Standard Book — Regole di visibilità e gestione reparti

## Cos'è lo Standard Book

Lo Standard Book contiene due blocchi distinti di standard operativi:

**HO Brand Standards** (`standardSource = "HO_BRAND"`)
Standard qualitativi definiti da HO Collection per le proprie strutture. Descrivono comportamenti, procedure e aspettative operative interne al gruppo. Creati e gestiti da ADMIN e SUPER_ADMIN.

**LQA Standards 2026–2028** (`standardSource = "LQA"`)
Standard dell'ente certificatore LQA (Leading Quality Assurance), applicabili alle strutture che aspirano o mantengono la certificazione LHW. Importati come blocco unico (25 sezioni, ~997 standard) tramite script di importazione. La traduzione italiana è operativa e validata.

---

## Come funziona la visibilità — il principio base

Ogni sezione dello Standard Book ha una lista di **reparti destinatari** (ContentTarget). Un operatore vede una sezione **solo se il suo reparto è tra i destinatari**.

Ci sono due modalità di assegnazione:

| Modalità | Cosa significa | Chi vede |
|----------|---------------|----------|
| **Tutti i reparti** | target tipo `ROLE / OPERATOR` | Tutti gli operatori della property |
| **Reparti specifici** | target tipo `DEPARTMENT` con ID reparto | Solo gli operatori assegnati a quei reparti |

Se una sezione non ha nessun target assegnato ("Nessun reparto assegnato"), non è visibile a nessun operatore — solo ADMIN e SUPER_ADMIN la vedono nella gestione HOO.

---

## Chi gestisce i target — ruoli e accessi

| Azione | Chi può farla |
|--------|--------------|
| Vedere la lista sezioni Standard Book (HOO) | HOTEL_MANAGER, ADMIN, SUPER_ADMIN |
| Assegnare / cambiare reparti destinatari | ADMIN, SUPER_ADMIN |
| Pubblicare una sezione (da DRAFT a PUBLISHED) | ADMIN, SUPER_ADMIN |
| Leggere una sezione pubblicata | OPERATOR, HOD, HOTEL_MANAGER — solo se il loro reparto è tra i destinatari |

---

## Come il HOO gestisce i reparti — flusso operativo

1. Accedere a **HOO > Standard Book** (voce nel menu header)
2. Per ogni sezione è visibile la riga "Visibile a:" con i reparti assegnati (pill colorati) o "Tutti i reparti" (verde) o "Nessun reparto assegnato" (corsivo grigio)
3. Cliccare **"Gestisci reparti"** sulla riga della sezione
4. Nel pannello che si apre:
   - Attivare **"Tutti i reparti"** per rendere la sezione trasversale
   - Oppure deselezionare "Tutti i reparti" e scegliere i reparti specifici con le checkbox
5. Cliccare **"Salva"**
6. Se la sezione è in stato DRAFT, cliccare **"Pubblica"** per renderla visibile agli operatori

**Nota**: la modifica dei target è possibile in qualsiasi stato (DRAFT o PUBLISHED). Modificare i target di una sezione già pubblicata ha effetto immediato — gli operatori vedranno o smetteranno di vedere la sezione al prossimo caricamento.

---

## Assegnazioni di default per le sezioni LQA

Queste assegnazioni sono state impostate in fase di import. Il HOO può modificarle in qualsiasi momento dalla UI.

| Sezione | Titolo | Reparti default |
|---------|--------|----------------|
| 01 | Porter & Doorman Arrival | FO |
| 02 | Check-In | FO |
| 03 | Guest Communications (Tel & Digital) | FO |
| 04 | Guest Communications (In Person) | FO |
| 05 | Check-Out & Departure | FO |
| 06 | Housekeeping: Arrivo Ospite | RM |
| 07 | Turn-Down Service | RM |
| 08 | Room Servicing | RM |
| 09 | F&B: Colazione | FB |
| 10 | F&B: Ristorante (Pranzo/Cena) | FB |
| 11 | F&B: Buffet | FB |
| 12 | F&B: Light Meals | FB |
| 13 | F&B: Servizio Bevande (Bar) | FB |
| 14 | Room Service (In-Room Dining) | FB + RM |
| 15 | Camera: Qualità e Standard | RM |
| 16 | Aree Comuni (Public Areas) | RM |
| 17 | Fitness & Wellness | SP |
| 18 | Spa: Strutture e Impianti | SP |
| 19 | Spa: Trattamenti | SP |
| 20 | Trasporto Ospiti | FO |
| 22 | Prenotazioni (Reservations) | FO |
| 23 | Digital & Comunicazione Online | FO |
| 24 | Sicurezza Ospiti | MT + FO |
| 25 | Lavanderia | RM |
| 26 | Housekeeping: EI Behavioural | RM |

---

## Azione richiesta per le sezioni HO Brand esistenti

Le sezioni HO Brand attualmente in DB sono state importate con target **"Tutti i reparti"** (ROLE/OPERATOR). Questo fa sì che tutti gli operatori della property le vedano, indipendentemente dal reparto.

Per correggere, il HOO deve:

1. Aprire **HOO > Standard Book**
2. Per ogni sezione HO Brand cliccare **"Gestisci reparti"**
3. Disattivare "Tutti i reparti"
4. Selezionare il reparto corretto (vedi tabella sotto)
5. Salvare

| Sezione HO Brand | Reparto consigliato |
|-----------------|-------------------|
| Standard Book Patria — Spa & Esperienze | SP |
| Standard Book Patria — Food & Beverage | FB |
| Standard Book Patria — Room Department e Lavanderia | RM |
| Standard Book Patria — Front of House e Transfer | FO |

---

## Codici reparto di riferimento

| Codice | Nome reparto |
|--------|-------------|
| FO | Front Office |
| RM | Housekeeping / Room Division |
| FB | Food & Beverage |
| MT | Maintenance |
| SP | Spa / Wellness |
| QA | Administration / Back of House |

---

## Implementazione tecnica — riferimenti codice

- **API targets**: `GET/PUT /api/content/[id]/targets`
  - GET restituisce `{ allDepartments: boolean, departments: [{id, name, code}] }`
  - PUT accetta `{ allDepartments: boolean, departmentIds: string[] }` — solo ADMIN e SUPER_ADMIN
- **Filtro visibilità API**: `src/app/api/content/route.ts` — blocco `if (type === "STANDARD_BOOK" && (userRole === "OPERATOR" || userRole === "HOD"))` — filtra per ContentTarget usando i dipartimenti accessibili dell'utente
- **UI gestione HOO**: `src/app/(hoo)/hoo-standard-book/page.tsx` — componente `DeptManager`
- **UI lista operatore**: `src/components/operator/book-list.tsx` — fetch con `type=STANDARD_BOOK`, il server restituisce già solo le sezioni visibili
- **UI dettaglio operatore**: `src/app/(operator)/standard-book/[id]/page.tsx`
