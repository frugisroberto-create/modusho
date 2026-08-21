/**
 * Reset password da riga di comando — uso locale, non è una API.
 *
 * Serve quando nessuno può più entrare con un account amministrativo e il
 * flusso "password dimenticata" non è praticabile (es. RESEND_API_KEY assente:
 * l'email di reset non parte davvero, viene solo loggata a console).
 *
 * Fa esattamente ciò che fa POST /api/auth/reset:
 *   - hash bcrypt con 12 round
 *   - passwordChangedAt = ora → le sessioni aperte altrove decadono
 *   - activatedAt valorizzato se l'invito non era mai stato completato
 *   - token di attivazione/reset ancora pendenti marcati come usati
 *
 * Uso:
 *   npx tsx scripts/reset-password-cli.ts --list          # elenca gli account admin
 *   npx tsx scripts/reset-password-cli.ts email@dominio.it
 *
 * La password viene chiesta a schermo con input nascosto: non passa da
 * argomenti (che finirebbero nella history della shell). Con --temp la nuova
 * password viene generata dallo script e stampata una sola volta: in quel caso
 * l'account resta con mustChangePassword = true.
 */

import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import * as readline from "node:readline";
import { randomBytes } from "node:crypto";
import { getPasswordError } from "../src/lib/password-policy";

const prisma = new PrismaClient();

/** Domanda con risposta visibile. */
function ask(question: string): Promise<string> {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) =>
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    })
  );
}

/** Domanda con input nascosto: nulla compare a schermo mentre si digita. */
function askHidden(question: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const { stdin, stdout } = process;
    if (!stdin.isTTY) {
      reject(new Error("Serve un terminale interattivo: lancia lo script a mano, non in pipe."));
      return;
    }

    const ENTER = ["\n", "\r"];
    const CTRL_C = String.fromCharCode(3);
    const CTRL_D = String.fromCharCode(4);
    const BACKSPACE = [String.fromCharCode(127), "\b"];

    stdout.write(question);
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding("utf8");

    let value = "";

    const onData = (chunk: string) => {
      for (const char of chunk) {
        if (ENTER.includes(char) || char === CTRL_D) {
          stdin.setRawMode(false);
          stdin.pause();
          stdin.removeListener("data", onData);
          stdout.write("\n");
          resolve(value);
          return;
        }
        if (char === CTRL_C) {
          stdin.setRawMode(false);
          stdin.pause();
          stdout.write("\n");
          process.exit(130);
        }
        if (BACKSPACE.includes(char)) {
          value = value.slice(0, -1);
          continue;
        }
        // Ignora i caratteri di controllo residui (frecce, sequenze escape…)
        if (char >= " ") value += char;
      }
    };

    stdin.on("data", onData);
  });
}

/** Password temporanea leggibile e conforme alla policy (lettere + numeri). */
function generateTempPassword(): string {
  const alphabet = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ";
  const digits = "23456789";
  const bytes = randomBytes(12);
  let out = "";
  for (let i = 0; i < 10; i++) out += alphabet[bytes[i] % alphabet.length];
  out += digits[bytes[10] % digits.length];
  out += digits[bytes[11] % digits.length];
  return out;
}

/**
 * Il branch feat/credenziali-v1 aggiunge colonne che possono non esistere
 * ancora sul database puntato da DATABASE_URL (il progetto usa `db push`, non
 * migration versionate). Si interroga lo schema reale e si aggiorna solo ciò
 * che c'è: così lo script funziona sia prima sia dopo il push.
 */
async function detectSchema() {
  const columns = await prisma.$queryRaw<{ column_name: string }[]>`
    SELECT column_name FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'User'
  `;
  const names = new Set(columns.map((c) => c.column_name));

  const tables = await prisma.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'AuthToken'
  `;

  return {
    hasActivatedAt: names.has("activatedAt"),
    hasPasswordChangedAt: names.has("passwordChangedAt"),
    hasMustChangePassword: names.has("mustChangePassword"),
    hasAuthToken: tables.length > 0,
  };
}

type AdminRow = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
};

async function listAdmins(): Promise<AdminRow[]> {
  const admins = await prisma.$queryRaw<AdminRow[]>`
    SELECT id, email, name, role::text AS role, "isActive"
    FROM "User"
    WHERE role IN ('SUPER_ADMIN', 'ADMIN')
    ORDER BY role DESC, email ASC
  `;

  if (admins.length === 0) {
    console.log("Nessun account ADMIN o SUPER_ADMIN nel database.");
    return admins;
  }

  console.log("\nAccount amministrativi:\n");
  admins.forEach((u, i) => {
    const state = u.isActive ? "attivo" : "DISATTIVATO";
    console.log(`  ${i + 1}) [${u.role}] ${u.email} — ${u.name} (${state})`);
  });
  console.log("");
  return admins;
}

async function main() {
  const args = process.argv.slice(2);
  const useTemp = args.includes("--temp");
  const positional = args.filter((a) => !a.startsWith("--"));

  if (args.includes("--list")) {
    await listAdmins();
    return;
  }

  let email = positional[0]?.trim().toLowerCase();

  if (!email) {
    const admins = await listAdmins();
    if (admins.length === 0) {
      process.exitCode = 1;
      return;
    }
    const choice = await ask("Numero dell'account (o email): ");
    const index = Number.parseInt(choice, 10);
    email =
      Number.isInteger(index) && admins[index - 1]
        ? admins[index - 1].email
        : choice.toLowerCase();
  }

  const found = await prisma.$queryRaw<AdminRow[]>`
    SELECT id, email, name, role::text AS role, "isActive"
    FROM "User" WHERE lower(email) = ${email} LIMIT 1
  `;
  const user = found[0];

  if (!user) {
    console.error(`\nNessun utente con email ${email}.`);
    process.exitCode = 1;
    return;
  }

  console.log(`\nReset password per: ${user.name} <${user.email}> — ruolo ${user.role}`);
  if (!user.isActive) {
    console.log("Attenzione: l'account è disattivato (isActive = false). Il reset non lo riattiva.");
  }

  let password: string;

  if (useTemp) {
    password = generateTempPassword();
  } else {
    console.log("Regola: almeno 8 caratteri, almeno una lettera e un numero.\n");
    password = await askHidden("Nuova password: ");
    const policyError = getPasswordError(password);
    if (policyError) {
      console.error(`\n${policyError}`);
      process.exitCode = 1;
      return;
    }
    const confirm = await askHidden("Conferma password: ");
    if (password !== confirm) {
      console.error("\nLe due password non coincidono. Nessuna modifica effettuata.");
      process.exitCode = 1;
      return;
    }
  }

  const now = new Date();
  const passwordHash = await bcrypt.hash(password, 12);
  const schema = await detectSchema();

  await prisma.$executeRaw`
    UPDATE "User" SET "passwordHash" = ${passwordHash} WHERE id = ${user.id}
  `;

  if (schema.hasPasswordChangedAt) {
    await prisma.$executeRaw`
      UPDATE "User" SET "passwordChangedAt" = ${now} WHERE id = ${user.id}
    `;
  }

  if (schema.hasMustChangePassword) {
    // Con una password temporanea l'utente è obbligato a cambiarla al login.
    await prisma.$executeRaw`
      UPDATE "User" SET "mustChangePassword" = ${useTemp} WHERE id = ${user.id}
    `;
  }

  if (schema.hasActivatedAt) {
    // Solo se mancante: non si sovrascrive la data dell'attivazione originale.
    await prisma.$executeRaw`
      UPDATE "User" SET "activatedAt" = ${now}
      WHERE id = ${user.id} AND "activatedAt" IS NULL
    `;
  }

  let invalidatedTokens = 0;
  if (schema.hasAuthToken) {
    // I token di attivazione/reset pendenti non devono restare spendibili.
    invalidatedTokens = await prisma.$executeRaw`
      UPDATE "AuthToken" SET "usedAt" = ${now}
      WHERE "userId" = ${user.id} AND "usedAt" IS NULL
    `;
  }

  console.log(`\nPassword aggiornata per ${user.email}.`);
  if (useTemp) {
    console.log(`Password temporanea: ${password}`);
  }
  if (schema.hasPasswordChangedAt) {
    console.log("Le sessioni aperte altrove sono decadute (passwordChangedAt aggiornato).");
  }
  if (useTemp && schema.hasMustChangePassword) {
    console.log("Va cambiata al primo accesso (mustChangePassword = true).");
  } else if (useTemp) {
    console.log(
      "Nota: la colonna mustChangePassword non esiste ancora su questo database, " +
        "quindi il cambio al primo accesso non è imposto. Cambiala a mano."
    );
  }
  if (invalidatedTokens > 0) {
    console.log(`Token di attivazione/reset pendenti invalidati: ${invalidatedTokens}.`);
  }
}

main()
  .catch((error) => {
    console.error("\nErrore:", error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
