/**
 * Servizio email — due adapter, nessun fallimento silenzioso.
 *
 * - RESEND_API_KEY presente  → invio reale via API Resend (chiamata fetch,
 *   nessuna dipendenza aggiuntiva).
 * - RESEND_API_KEY assente   → adapter console: l'email non parte ma viene
 *   loggata in modo strutturato, così in sviluppo si recupera il link.
 *
 * `sendEmail` non lancia mai: restituisce sempre un esito tracciato (e lo
 * logga). Chi chiama decide se l'esito è bloccante — ma non può ignorarlo
 * per distrazione, perché l'informazione è nel valore di ritorno.
 */

const RESEND_ENDPOINT = "https://api.resend.com/emails";
const DEFAULT_FROM = "ModusHO <onboarding@resend.dev>";

// ─── Design tokens del template (allineati al design system ModusHO) ──
const TERRACOTTA = "#964733";
const IVORY = "#FAF9F5";
const IVORY_DARK = "#E8E5DC";
const CHARCOAL = "#333333";
const FONT_HEADING = "'Playfair Display', Georgia, serif";
const FONT_BODY = "Cardo, Georgia, serif";
const FONT_UI = "Inter, -apple-system, 'Helvetica Neue', Arial, sans-serif";

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export interface SendEmailResult {
  ok: boolean;
  adapter: "resend" | "console";
  id?: string;
  error?: string;
}

/** URL pubblico dell'app, per costruire i link nelle email. */
export function getAppUrl(): string {
  const explicit = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL;
  if (explicit) return explicit.replace(/\/+$/, "");
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "http://localhost:3000";
}

function getFrom(): string {
  return process.env.EMAIL_FROM || DEFAULT_FROM;
}

/**
 * Invia l'email con l'adapter disponibile. Non lancia: l'esito è nel risultato.
 */
export async function sendEmail(message: EmailMessage): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    // Adapter console: log strutturato, così il link è recuperabile in sviluppo.
    console.log(
      "[email] adapter=console — invio NON effettuato (RESEND_API_KEY assente)",
      JSON.stringify({ to: message.to, from: getFrom(), subject: message.subject, text: message.text })
    );
    return { ok: true, adapter: "console" };
  }

  try {
    const response = await fetch(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: getFrom(),
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
      }),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => "");
      console.error(`[email] adapter=resend FALLITO to=${message.to} status=${response.status} — ${detail}`);
      return { ok: false, adapter: "resend", error: `HTTP ${response.status}` };
    }

    const data = (await response.json().catch(() => ({}))) as { id?: string };
    console.log(`[email] adapter=resend OK to=${message.to} id=${data.id ?? "-"}`);
    return { ok: true, adapter: "resend", id: data.id };
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    console.error(`[email] adapter=resend ERRORE to=${message.to} — ${detail}`);
    return { ok: false, adapter: "resend", error: detail };
  }
}

// ─── Template ────────────────────────────────────────────────────────

/**
 * Veste comune: header terracotta con wordmark, corpo avorio, un solo bottone
 * squadrato (border-radius 0, come tutti i CTA di ModusHO).
 */
function renderLayout(params: {
  title: string;
  bodyHtml: string;
  ctaLabel: string;
  ctaUrl: string;
  notesHtml: string;
}): string {
  return `<!DOCTYPE html>
<html lang="it">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:${IVORY};">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${IVORY};padding:0;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;width:100%;">

        <!-- Header terracotta -->
        <tr><td style="background:${TERRACOTTA};padding:28px 32px;text-align:center;">
          <div style="font-family:${FONT_UI};font-size:15px;letter-spacing:4px;color:#ffffff;text-transform:uppercase;">MODUSHO</div>
          <div style="font-family:${FONT_UI};font-size:11px;letter-spacing:1px;color:rgba(255,255,255,0.7);margin-top:6px;">HO Collection &middot; Governance operativa</div>
        </td></tr>

        <!-- Corpo -->
        <tr><td style="background:#ffffff;padding:40px 32px;border:1px solid ${IVORY_DARK};border-top:none;">
          <h1 style="margin:0 0 24px;font-family:${FONT_HEADING};font-size:26px;font-weight:500;line-height:1.35;color:${TERRACOTTA};">${params.title}</h1>
          ${params.bodyHtml}

          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:32px 0;"><tr><td style="background:${TERRACOTTA};border-radius:0;">
            <a href="${params.ctaUrl}" style="display:inline-block;padding:14px 40px;font-family:${FONT_UI};font-size:13px;font-weight:600;letter-spacing:1px;text-transform:uppercase;color:#ffffff;text-decoration:none;">${params.ctaLabel}</a>
          </td></tr></table>

          ${params.notesHtml}
        </td></tr>

        <!-- Chiusura -->
        <tr><td style="padding:24px 32px 40px;text-align:center;">
          <p style="margin:0;font-family:${FONT_UI};font-size:11px;line-height:1.7;color:rgba(51,51,51,0.5);">
            Questo messaggio arriva da un indirizzo che non riceve risposte.<br>
            Per qualsiasi dubbio rivolgiti al tuo responsabile.
          </p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

function paragraph(content: string): string {
  return `<p style="margin:0 0 16px;font-family:${FONT_BODY};font-size:16px;line-height:27px;color:${CHARCOAL};">${content}</p>`;
}

function note(content: string): string {
  return `<p style="margin:0 0 10px;font-family:${FONT_UI};font-size:12px;line-height:1.7;color:rgba(51,51,51,0.6);">${content}</p>`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Frase di contesto: cita struttura e reparto quando li conosciamo. */
function buildContextSentence(propertyName?: string | null, departmentName?: string | null): string {
  if (propertyName && departmentName) {
    return `Da oggi trovi qui le procedure e le comunicazioni di <strong>${escapeHtml(propertyName)}</strong>, reparto <strong>${escapeHtml(departmentName)}</strong>.`;
  }
  if (propertyName) {
    return `Da oggi trovi qui le procedure e le comunicazioni di <strong>${escapeHtml(propertyName)}</strong>.`;
  }
  return "Da oggi trovi qui le procedure e le comunicazioni che ti riguardano.";
}

export interface ActivationEmailParams {
  name: string;
  email: string;
  activationUrl: string;
  propertyName?: string | null;
  departmentName?: string | null;
}

/** Email di attivazione — link valido 30 giorni. */
export function buildActivationEmail(params: ActivationEmailParams): EmailMessage {
  const { name, email, activationUrl, propertyName, departmentName } = params;

  const bodyHtml = [
    paragraph(buildContextSentence(propertyName, departmentName)),
    paragraph("Ti serve un minuto: scegli la tua password e sei dentro. La password la scegli tu e la conosci solo tu."),
  ].join("\n");

  const notesHtml = [
    note("Questo link è personale ed è valido per <strong>30 giorni</strong>."),
    note(`Il tuo nome utente è questa email: <strong>${escapeHtml(email)}</strong>`),
    note("Dopo l'attivazione ti guidiamo noi a mettere ModusHO sul telefono: due tocchi."),
    note("Non ti aspettavi questo messaggio? Ignoralo."),
  ].join("\n");

  const html = renderLayout({
    title: `Ciao ${escapeHtml(name)}, il tuo accesso è pronto.`,
    bodyHtml,
    ctaLabel: "Attiva il tuo accesso",
    ctaUrl: activationUrl,
    notesHtml,
  });

  const text = [
    `Ciao ${name}, il tuo accesso è pronto.`,
    "",
    "Attiva il tuo accesso a ModusHO da questo link:",
    activationUrl,
    "",
    "Questo link è personale ed è valido per 30 giorni.",
    `Il tuo nome utente è questa email: ${email}`,
    "Dopo l'attivazione ti guidiamo noi a mettere ModusHO sul telefono: due tocchi.",
    "Non ti aspettavi questo messaggio? Ignoralo.",
    "",
    "Questo messaggio arriva da un indirizzo che non riceve risposte.",
    "Per qualsiasi dubbio rivolgiti al tuo responsabile.",
  ].join("\n");

  return { to: email, subject: "Il tuo accesso a ModusHO è pronto", html, text };
}

export interface ResetEmailParams {
  name: string;
  email: string;
  resetUrl: string;
}

/** Email di reset password — link valido 60 minuti. */
export function buildResetEmail(params: ResetEmailParams): EmailMessage {
  const { name, email, resetUrl } = params;

  const bodyHtml = [
    paragraph("Hai chiesto di rifare la password di ModusHO. Da qui ne scegli una nuova: ci vuole un minuto."),
    paragraph("La password la scegli tu e la conosci solo tu."),
  ].join("\n");

  const notesHtml = [
    note("Questo link è personale ed è valido per <strong>60 minuti</strong>."),
    note(`Il tuo nome utente è questa email: <strong>${escapeHtml(email)}</strong>`),
    note("Non hai chiesto tu di cambiare la password? Ignora questo messaggio: nulla cambia."),
  ].join("\n");

  const html = renderLayout({
    title: `Ciao ${escapeHtml(name)}, ecco il link per la password.`,
    bodyHtml,
    ctaLabel: "Crea la nuova password",
    ctaUrl: resetUrl,
    notesHtml,
  });

  const text = [
    `Ciao ${name}, ecco il link per la password.`,
    "",
    "Crea la nuova password di ModusHO da questo link:",
    resetUrl,
    "",
    "Questo link è personale ed è valido per 60 minuti.",
    `Il tuo nome utente è questa email: ${email}`,
    "Non hai chiesto tu di cambiare la password? Ignora questo messaggio: nulla cambia.",
    "",
    "Questo messaggio arriva da un indirizzo che non riceve risposte.",
    "Per qualsiasi dubbio rivolgiti al tuo responsabile.",
  ].join("\n");

  return { to: email, subject: "Crea la nuova password di ModusHO", html, text };
}
