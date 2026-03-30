# PROMPT-13 — Secure Delivery (accesso sicuro ai file)

## Obiettivo

Implementare l'endpoint di accesso sicuro ai file allegati, che genera presigned GET URL con TTL breve e RBAC ereditato dal contenuto madre. Questo prompt chiude il ciclo di sicurezza del sistema allegati: nessun file è mai accessibile tramite URL pubblico permanente.

**Prerequisiti**: PROMPT-11 (modello Attachment, storage service) e PROMPT-12 (UI upload) completati.

---

## FIX 1 — Endpoint di accesso sicuro

### File: `src/app/api/attachments/[id]/access/route.ts`

Creare un endpoint GET che, dato un ID allegato, verifica l'autenticazione e l'autorizzazione dell'utente e restituisce un presigned GET URL con TTL breve.

### Flusso

1. **Autenticazione**: verifica sessione NextAuth. Se assente → 401.
2. **Caricamento allegato con content madre**: query Prisma con `findUnique` sull'attachment, includendo i campi del content madre necessari per il check RBAC (`status`, `propertyId`, `departmentId`, `createdById`, `isDeleted`).
3. **Controllo contenuto eliminato**: se `content.isDeleted` è true → 404.
4. **RBAC — visibilità per stato**: stesse regole di `GET /api/content/[id]`:
   - Se il contenuto NON è PUBLISHED:
     - OPERATOR → 404 (non vede nulla di non pubblicato)
     - HOD → 404 se non è il creatore del contenuto
     - HM/ADMIN/SUPER_ADMIN → accesso consentito
   - Se il contenuto è PUBLISHED → tutti i ruoli con accesso alla property possono accedere
5. **RBAC — accesso property/department**: verifica con `checkAccess(userId, "OPERATOR", propertyId, departmentId)` che l'utente abbia assegnazione alla property e al department del contenuto.
6. **Disposition**: determinare la modalità di apertura in base al MIME type:
   - `inline` per: `image/jpeg`, `image/png`, `image/webp`, `application/pdf` (apertura in browser)
   - `attachment` per: DOCX, XLSX (download forzato con nome file originale)
7. **Generazione presigned URL**: chiamare `getPresignedDownloadUrl(storageKey, TTL, disposition, originalFileName)` con TTL di **120 secondi**.
8. **Risposta**: restituire `{ data: { url, fileName, mimeType, kind, expiresIn } }`.

### Sicurezza

- Il presigned URL scade dopo 120 secondi. Il client deve richiederne uno nuovo per ogni accesso.
- Non esiste nessun URL permanente verso lo storage. Ogni accesso è tracciabile e autorizzato.
- Gli errori di accesso restituiscono sempre 404 generico ("Allegato non trovato") per non rivelare l'esistenza di contenuti a utenti non autorizzati.
- Gli errori di generazione URL restituiscono 500 con messaggio generico ("File non disponibile").

---

## FIX 2 — Integrazione con il componente AttachmentUploader

Il componente `AttachmentUploader` (creato in PROMPT-12) utilizza l'endpoint di accesso sicuro in due punti:

1. **Pre-fetch URL immagini**: al caricamento della lista allegati, per ogni immagine viene richiesto un presigned URL che viene usato come `src` nella preview. Le URL sono cachate in stato React (`imageUrls`) con scadenza client-side.
2. **Apertura file on-demand**: quando l'utente clicca su un'immagine o sul bottone "Apri" di un documento, viene richiesto un nuovo presigned URL e aperto in una nuova tab del browser (`window.open`).

Questa integrazione è già implementata in PROMPT-12. Questo prompt specifica solo il contratto dell'endpoint.

---

## COSA QUESTO PROMPT NON FA

- Non implementa retry automatico su presigned URL scaduto (il client richiede un nuovo URL al prossimo click/accesso)
- Non implementa caching server-side delle URL
- Non implementa audit log degli accessi ai file (tracciabilità futura)
- Non implementa streaming di file di grandi dimensioni (il presigned URL punta direttamente al bucket)
- Non implementa thumbnail pipeline (le immagini sono servite a dimensione originale)

---

## VERIFICA ATTESA

| Check | Atteso |
|-------|--------|
| GET `/api/attachments/{id}/access` autenticato con permessi | Restituisce `{ data: { url, fileName, mimeType, kind, expiresIn: 120 } }` |
| GET senza autenticazione | 401 |
| GET su allegato di contenuto non PUBLISHED come OPERATOR | 404 |
| GET su allegato di contenuto non PUBLISHED come HOD non creatore | 404 |
| GET su allegato di contenuto PUBLISHED con accesso alla property | Presigned URL valido |
| GET su allegato di contenuto eliminato (isDeleted) | 404 |
| GET su allegato inesistente | 404 |
| Presigned URL per immagine | Content-Disposition: inline |
| Presigned URL per DOCX | Content-Disposition: attachment con filename originale |
| URL aperto dopo 120 secondi | Scaduto (403 da S3/R2) |
