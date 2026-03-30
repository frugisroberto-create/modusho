# PROMPT-12 — Upload Engine (UI + flusso client-side)

## Obiettivo

Implementare il componente client-side di upload file e la sua integrazione nelle pagine di dettaglio contenuto. Questo prompt estende il core architetturale creato da PROMPT-11 (The Vault Core) aggiungendo l'esperienza utente di caricamento, visualizzazione e gestione allegati.

**Prerequisiti**: PROMPT-11 completato (modello Attachment, storage service, API prepare-upload, confirm-upload, content/[id]/attachments).

---

## FIX 1 — Componente AttachmentUploader

### File: `src/components/shared/attachment-uploader.tsx`

Creare un componente React client-side che gestisce l'intero ciclo di vita degli allegati per un contenuto.

### Interfaccia

```typescript
interface AttachmentUploaderProps {
  contentId: string;
  canEdit: boolean;
}
```

Il componente riceve l'ID del contenuto e un flag `canEdit` che controlla la visibilità dei controlli di upload e cancellazione.

### Comportamento

1. **Caricamento lista allegati**: al mount, chiama `GET /api/content/{contentId}/attachments?pageSize=50` e visualizza gli allegati suddivisi in due sezioni: Immagini e Documenti.
2. **Pre-fetch presigned URL per immagini**: per ogni allegato di tipo IMAGE, richiede un presigned GET URL via `GET /api/attachments/{id}/access` e lo usa come `src` per la preview. Le URL vengono cachate in stato React lato client.
3. **Upload file**: quando l'utente seleziona file tramite input:
   - Chiama `POST /api/attachments/prepare-upload` con `{ contentId, fileName, mimeType, fileSize, isInline, sortOrder }`
   - Riceve `{ attachmentId, uploadUrl, storageKey, kind }`
   - Esegue PUT diretto del file sulla `uploadUrl` (presigned URL S3/R2)
   - Chiama `POST /api/attachments/confirm-upload` con `{ attachmentId }`
   - Ricarica la lista allegati
4. **Feedback visivo upload**: mostra spinner e stato per ogni file in caricamento (uploading/done/error) con messaggi di errore in italiano.
5. **Cancellazione**: chi ha caricato il file (o ADMIN/SUPER_ADMIN) può rimuoverlo tramite `DELETE /api/content/{contentId}/attachments` con `{ attachmentId }`.
6. **Apertura file**: click su immagine o bottone "Apri" su documento → richiede presigned GET URL e apre in nuova tab.

### Sezioni visuali

- **Immagini**: griglia 2 colonne (3 su sm+) con preview reale dall'object storage, nome file e dimensione. Bottone delete visibile su hover (solo se `canEdit`).
- **Documenti**: lista verticale con icona file, nome, tipo/dimensione, bottone "Apri" in terracotta, bottone "Rimuovi" (solo se `canEdit`).
- **Stato vuoto**: se non ci sono allegati e `canEdit` è true, mostra dashed border con messaggio "Nessun allegato" e formati accettati. Se `canEdit` è false e non ci sono allegati, il componente non renderizza nulla.

### Formati accettati nell'input file

`image/jpeg, image/png, image/webp, application/pdf, .docx, .xlsx`

### Coerenza design system

- Colori: terracotta, charcoal, ivory, alert-red
- Font: font-ui per testi, font-heading per titoli sezione
- Border-radius: 0 (nessun rounded)
- Bottoni: btn-outline per "Aggiungi file"

---

## FIX 2 — Integrazione nella pagina dettaglio SOP

### File: `src/app/(hoo)/hoo-sop/[id]/page.tsx`

Importare e renderizzare `AttachmentUploader` nella pagina di dettaglio SOP, posizionato dopo il corpo del contenuto e prima della cronologia:

```tsx
import { AttachmentUploader } from "@/components/shared/attachment-uploader";

// Nel JSX, dopo il body e prima di ContentTimeline:
<AttachmentUploader contentId={content.id} canEdit={content.status !== "ARCHIVED"} />
```

La prop `canEdit` è true per tutti gli stati tranne ARCHIVED.

---

## FIX 3 — Integrazione nella pagina Memo

### File: `src/app/(hoo)/memo/[id]/page.tsx`

Importare e renderizzare `AttachmentUploader` nella pagina Memo:

```tsx
import { AttachmentUploader } from "@/components/shared/attachment-uploader";

// Nel JSX, quando il contentId è disponibile:
{contentId && <AttachmentUploader contentId={contentId} canEdit={true} />}
```

Nei Memo, `canEdit` è sempre true (i memo sono sempre in contesto di editing per chi vi accede).

---

## FIX 4 — Integrazione nel form SOP

### File: `src/components/hoo/sop-form.tsx`

Importare `AttachmentUploader` nel form di creazione/modifica SOP, per consentire l'aggiunta di allegati durante la composizione.

---

## COSA QUESTO PROMPT NON FA

- Non implementa drag & drop avanzato (riordino visuale allegati)
- Non implementa thumbnail pipeline server-side (usa immagini originali via presigned URL)
- Non implementa retry automatico su presigned URL scaduto
- Non implementa editor inline a blocchi con immagini incorporate nel testo
- Non modifica il modello Prisma o le API (già creati in PROMPT-11)

---

## VERIFICA ATTESA

| Check | Atteso |
|-------|--------|
| Upload immagine da SOP detail | File caricato su bucket, visibile in griglia con preview |
| Upload documento PDF da SOP detail | File caricato, visibile nella lista documenti con bottone "Apri" |
| Cancellazione allegato | Rimosso da bucket e DB, scompare dalla UI |
| Visualizzazione senza canEdit | Allegati visibili ma nessun bottone upload/rimuovi |
| Upload da Memo | Funzionante come da SOP |
| Nessun allegato + canEdit false | Componente non renderizza nulla |
| Formati non accettati | Rifiutati dall'API con errore in italiano |
