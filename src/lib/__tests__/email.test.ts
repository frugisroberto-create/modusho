import { describe, it, expect } from "vitest";
import { buildActivationEmail, buildResetEmail } from "../email";

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

  it("dichiara la validità di 60 minuti", () => {
    expect(RESET.html).toContain("60 minuti");
    expect(RESET.text).toContain("60 minuti");
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
