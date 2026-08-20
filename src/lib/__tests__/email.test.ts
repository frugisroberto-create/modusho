import { describe, it, expect, vi, afterEach } from "vitest";
import { buildActivationEmail, buildResetEmail, sendEmail } from "../email";
import { TOKEN_TTL_MS, formatDuration } from "../token-ttl";

const ATTIVAZIONE = buildActivationEmail({
  name: "Maria",
  email: "maria@example.com",
  activationUrl: "https://modusho.test/attiva/tok123",
  propertyName: "Patria Palace",
  departmentName: "Front Office",
});

const RESET = buildResetEmail({
  name: "Maria",
  email: "maria@example.com",
  resetUrl: "https://modusho.test/reimposta/tok456",
});

describe("template email — attivazione", () => {
  it("è indirizzata all'utente con oggetto proprio", () => {
    expect(ATTIVAZIONE.to).toBe("maria@example.com");
    expect(ATTIVAZIONE.subject).toBe("Il tuo accesso a ModusHO è pronto");
  });

  it("ha l'header terracotta con wordmark e tagline", () => {
    expect(ATTIVAZIONE.html).toContain("#964733");
    expect(ATTIVAZIONE.html).toContain("MODUSHO");
    expect(ATTIVAZIONE.html).toContain("HO Collection &middot; Governance operativa");
  });

  it("ha il titolo previsto col nome della persona", () => {
    expect(ATTIVAZIONE.html).toContain("Ciao Maria, il tuo accesso è pronto.");
  });

  it("cita struttura e reparto", () => {
    expect(ATTIVAZIONE.html).toContain("Patria Palace");
    expect(ATTIVAZIONE.html).toContain("Front Office");
  });

  it("ha UN SOLO bottone, squadrato, col testo previsto", () => {
    expect(ATTIVAZIONE.html).toContain("ATTIVA IL TUO ACCESSO");
    expect(ATTIVAZIONE.html).toContain("border-radius:0");
    // Un solo link cliccabile in tutta l'email: il CTA.
    expect(ATTIVAZIONE.html.match(/<a\s/g) ?? []).toHaveLength(1);
  });

  it("il bottone punta al link di attivazione", () => {
    expect(ATTIVAZIONE.html).toContain('href="https://modusho.test/attiva/tok123"');
    expect(ATTIVAZIONE.text).toContain("https://modusho.test/attiva/tok123");
  });

  it("dichiara la validità di 30 giorni", () => {
    expect(ATTIVAZIONE.html).toContain("30 giorni");
    expect(ATTIVAZIONE.text).toContain("30 giorni");
  });

  it("dice qual è il nome utente", () => {
    expect(ATTIVAZIONE.html).toContain("Il tuo nome utente è questa email");
    expect(ATTIVAZIONE.html).toContain("maria@example.com");
  });

  it("contiene la riga sull'installazione sul telefono", () => {
    expect(ATTIVAZIONE.html).toContain(
      "Dopo l'attivazione ti guidiamo noi a mettere ModusHO sul telefono: due tocchi."
    );
  });

  it("contiene la nota per chi non aspettava il messaggio", () => {
    expect(ATTIVAZIONE.html).toContain("Non ti aspettavi questo messaggio? Ignoralo.");
  });

  it("chiude con no-reply e rimando al responsabile", () => {
    expect(ATTIVAZIONE.html).toContain("non riceve risposte");
    expect(ATTIVAZIONE.html).toContain("rivolgiti al tuo responsabile");
  });

  it("ha una versione testuale con gli stessi contenuti chiave", () => {
    expect(ATTIVAZIONE.text).toContain("Ciao Maria, il tuo accesso è pronto.");
    expect(ATTIVAZIONE.text).toContain("maria@example.com");
    expect(ATTIVAZIONE.text).not.toContain("<");
  });

  it("senza reparto non lascia frasi monche", () => {
    const solo = buildActivationEmail({
      name: "Luca",
      email: "luca@example.com",
      activationUrl: "https://modusho.test/attiva/x",
      propertyName: "Hi Hotel Bari",
    });
    expect(solo.html).toContain("Hi Hotel Bari");
    expect(solo.html).not.toContain("reparto <strong></strong>");
  });

  it("senza struttura né reparto resta una frase sensata", () => {
    const nessuno = buildActivationEmail({
      name: "Luca",
      email: "luca@example.com",
      activationUrl: "https://modusho.test/attiva/x",
    });
    expect(nessuno.html).toContain("le procedure e le comunicazioni che ti riguardano");
  });

  it("neutralizza l'HTML nei dati dell'utente", () => {
    const ostile = buildActivationEmail({
      name: '<script>alert("x")</script>',
      email: "luca@example.com",
      activationUrl: "https://modusho.test/attiva/x",
    });
    expect(ostile.html).not.toContain("<script>");
    expect(ostile.html).toContain("&lt;script&gt;");
  });
});

describe("template email — reset", () => {
  it("ha oggetto e destinatario propri", () => {
    expect(RESET.to).toBe("maria@example.com");
    expect(RESET.subject).toBe("Crea la nuova password di ModusHO");
  });

  it("mantiene la stessa veste dell'attivazione", () => {
    expect(RESET.html).toContain("#964733");
    expect(RESET.html).toContain("MODUSHO");
    expect(RESET.html).toContain("HO Collection &middot; Governance operativa");
    expect(RESET.html).toContain("border-radius:0");
  });

  it("ha il bottone previsto, uno solo", () => {
    expect(RESET.html).toContain("CREA LA NUOVA PASSWORD");
    expect(RESET.html.match(/<a\s/g) ?? []).toHaveLength(1);
    expect(RESET.html).toContain('href="https://modusho.test/reimposta/tok456"');
  });

  it("dichiara la validità di 4 ore", () => {
    expect(RESET.html).toContain("4 ore");
    expect(RESET.text).toContain("4 ore");
  });

  it("non promette 30 giorni come l'attivazione", () => {
    expect(RESET.html).not.toContain("30 giorni");
  });

  it("dice qual è il nome utente e chiude con no-reply", () => {
    expect(RESET.html).toContain("maria@example.com");
    expect(RESET.html).toContain("rivolgiti al tuo responsabile");
  });

  it("rassicura chi non ha chiesto il cambio", () => {
    expect(RESET.html).toContain("Non hai chiesto tu di cambiare la password?");
  });
});

// ─── Durate: una sola fonte, testo e comportamento non possono divergere ──

describe("durate dichiarate nelle email", () => {
  it("il token di attivazione dura 30 giorni", () => {
    expect(TOKEN_TTL_MS.ACTIVATION).toBe(30 * 24 * 60 * 60 * 1000);
  });

  it("il token di reimpostazione dura 4 ore", () => {
    expect(TOKEN_TTL_MS.RESET).toBe(4 * 60 * 60 * 1000);
  });

  it("formatDuration sceglie l'unità e la concorda in italiano", () => {
    expect(formatDuration(30 * 24 * 60 * 60 * 1000)).toBe("30 giorni");
    expect(formatDuration(24 * 60 * 60 * 1000)).toBe("1 giorno");
    expect(formatDuration(4 * 60 * 60 * 1000)).toBe("4 ore");
    expect(formatDuration(60 * 60 * 1000)).toBe("1 ora");
    expect(formatDuration(90 * 60 * 1000)).toBe("90 minuti");
    expect(formatDuration(60 * 1000)).toBe("1 minuto");
  });

  // Il punto di questi due: se qualcuno cambia la costante e non il testo, il
  // test si accorge. Non asseriscono una stringa fissa, ma la derivazione.
  it("il testo del reset dichiara esattamente la durata della costante", () => {
    const atteso = formatDuration(TOKEN_TTL_MS.RESET);
    expect(RESET.html).toContain(`valido per <strong>${atteso}</strong>`);
    expect(RESET.text).toContain(`valido per ${atteso}`);
  });

  it("il testo dell'attivazione dichiara esattamente la durata della costante", () => {
    const atteso = formatDuration(TOKEN_TTL_MS.ACTIVATION);
    expect(ATTIVAZIONE.html).toContain(`valido per <strong>${atteso}</strong>`);
    expect(ATTIVAZIONE.text).toContain(`valido per ${atteso}`);
  });
});

// ─── sendEmail: senza chiave non mente, e non scrive il token nei log ─────

describe("sendEmail — RESEND_API_KEY assente", () => {
  const ORIGINALE = process.env.RESEND_API_KEY;

  afterEach(() => {
    if (ORIGINALE === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = ORIGINALE;
    vi.restoreAllMocks();
  });

  it("dichiara il fallimento con il motivo, invece di fingere successo", async () => {
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});

    const esito = await sendEmail(ATTIVAZIONE);

    expect(esito.ok).toBe(false);
    expect(esito.reason).toBe("not-configured");
    expect(esito.adapter).toBe("console");
  });

  it("non lascia il token né l'URL di attivazione nei log", async () => {
    delete process.env.RESEND_API_KEY;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendEmail(ATTIVAZIONE);

    const scritto = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");

    expect(scritto).not.toContain("tok123");
    expect(scritto).not.toContain("https://modusho.test/attiva/tok123");
    expect(scritto).not.toContain("/attiva/");
  });

  it("non riversa nei log il corpo del messaggio, in nessuna forma", async () => {
    delete process.env.RESEND_API_KEY;
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});

    await sendEmail(RESET);

    const scritto = [...errorSpy.mock.calls, ...logSpy.mock.calls]
      .flat()
      .map((arg) => (typeof arg === "string" ? arg : JSON.stringify(arg)))
      .join(" ");

    expect(scritto).not.toContain("tok456");
    expect(scritto).not.toContain("/reimposta/");
    expect(scritto).not.toContain(RESET.text);
    expect(scritto).not.toContain(RESET.html);
  });

  it("non tenta nemmeno la chiamata di rete", async () => {
    delete process.env.RESEND_API_KEY;
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await sendEmail(ATTIVAZIONE);

    expect(fetchSpy).not.toHaveBeenCalled();
  });
});
