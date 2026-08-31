import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import {
  checkIpEmailRateLimit,
  checkIpCeilingRateLimit,
  checkEmailRateLimit,
  recordFailedAttempt,
  resetAttempts,
} from "./rate-limit";
import { normalizeEmail } from "./email-normalize";
import { findUserForLogin } from "./login-lookup-db";
import { isSessionStale } from "./session-validity";
import { hasUsablePassword } from "./login-guard";
import "@/types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        // Rate limiting per IP
        const ip = req?.headers?.["x-forwarded-for"]?.toString().split(",")[0]?.trim()
          || req?.headers?.["x-real-ip"]?.toString()
          || "unknown";

        // L'indirizzo va ripulito PRIMA di ogni ricerca o conteggio: è quello
        // che identifica l'account, non quello che la persona ha digitato.
        const email = normalizeEmail(credentials.email);

        // Rate limit per coppia IP+email (5 tentativi / 15 min): chi sbaglia
        // il proprio indirizzo non blocca nessun altro sullo stesso IP.
        const ipEmailCheck = await checkIpEmailRateLimit(ip, email);
        if (!ipEmailCheck.allowed) {
          const retryMin = Math.ceil(ipEmailCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED-IP-EMAIL ip=${ip} email=${email} — riprova tra ${retryMin} min`);
          throw new Error(`Troppi tentativi. Riprova tra ${retryMin} minuti.`);
        }

        // Tetto largo sul solo IP (50 tentativi / 15 min): difesa contro un
        // attacco automatico che provi molte email diverse dallo stesso IP.
        const ipCeilingCheck = await checkIpCeilingRateLimit(ip);
        if (!ipCeilingCheck.allowed) {
          const retryMin = Math.ceil(ipCeilingCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED-IP ip=${ip} email=${email} — riprova tra ${retryMin} min`);
          throw new Error(`Troppi tentativi. Riprova tra ${retryMin} minuti.`);
        }

        // Rate limit per email/account (10 tentativi / 30 min) — invariato
        const emailCheck = await checkEmailRateLimit(email);
        if (!emailCheck.allowed) {
          const retryMin = Math.ceil(emailCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED-ACCOUNT ip=${ip} email=${email} — account bloccato, riprova tra ${retryMin} min`);
          throw new Error(`Account temporaneamente bloccato. Riprova tra ${retryMin} minuti.`);
        }

        // Ricerca case-insensitive: copre anche le righe storiche salvate con
        // maiuscole, senza bisogno di correggerle. Se trova più di una riga
        // (indirizzi che in tabella differiscono solo per maiuscole/minuscole:
        // il vincolo di unicità sulla colonna è case-sensitive), non sceglie:
        // nega l'accesso e traccia l'anomalia nei log.
        const lookup = await findUserForLogin(email);

        if (lookup.kind === "ambiguous") {
          await recordFailedAttempt(ip, email);
          console.error(
            `[auth] ANOMALIA-EMAIL-DUPLICATA ip=${ip} email=${email} — ${lookup.count} account corrispondono, accesso negato. Richiede pulizia manuale.`
          );
          return null;
        }

        if (lookup.kind === "not_found") {
          await recordFailedAttempt(ip, email);
          console.warn(`[auth] FAILED ip=${ip} email=${email} — utente non trovato o disattivato`);
          return null;
        }

        const user = lookup.user;

        if (!user.isActive) {
          await recordFailedAttempt(ip, email);
          console.warn(`[auth] FAILED ip=${ip} email=${email} — utente non trovato o disattivato`);
          return null;
        }

        // Account creato ma non ancora attivato (hash vuoto): fallisce qui,
        // senza passare a bcrypt un hash malformato.
        if (!hasUsablePassword(user.passwordHash)) {
          await recordFailedAttempt(ip, email);
          console.warn(`[auth] FAILED ip=${ip} email=${email} — account non ancora attivato`);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          await recordFailedAttempt(ip, email);
          console.warn(`[auth] FAILED ip=${ip} email=${email} — password errata`);
          return null;
        }

        // Login riuscito: reset contatore tentativi
        await resetAttempts(ip, email);
        console.log(`[auth] OK ip=${ip} email=${email} role=${user.role}`);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          canView: user.canView,
          canEdit: user.canEdit,
          canApprove: user.canApprove,
          canPublish: user.canPublish,
          mustChangePassword: user.mustChangePassword,
          canCreateUsers: user.canCreateUsers,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
    maxAge: 24 * 60 * 60, // 24 ore — dopo scade e serve rientrare
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        // Primo login: popola il token dal DB e registra lastLoginAt
        token.id = user.id;
        token.email = user.email!;
        token.name = user.name!;
        token.role = user.role;
        token.canView = user.canView;
        token.canEdit = user.canEdit;
        token.canApprove = user.canApprove;
        token.canPublish = user.canPublish;
        token.mustChangePassword = user.mustChangePassword;
        token.canCreateUsers = user.canCreateUsers;
        token.invalidated = false;
        prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});
      } else if (token.id) {
        // Rinnovo token: aggiorna ruolo e permessi dal DB
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, canView: true, canEdit: true, canApprove: true, canPublish: true, isActive: true, name: true, mustChangePassword: true, passwordChangedAt: true, canCreateUsers: true },
          });
          if (!dbUser || !dbUser.isActive) {
            token.role = "OPERATOR";
            token.canView = false;
            token.canEdit = false;
            token.canApprove = false;
            token.canPublish = false;
            return token;
          }
          // Password cambiata dopo l'emissione di questo token: la sessione
          // non vale più (è un'altra sessione, rimasta aperta altrove).
          if (isSessionStale(token.iat as number | undefined, dbUser.passwordChangedAt)) {
            token.invalidated = true;
            token.canView = false;
            token.canEdit = false;
            token.canApprove = false;
            token.canPublish = false;
            return token;
          }
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.canView = dbUser.canView;
          token.canEdit = dbUser.canEdit;
          token.canApprove = dbUser.canApprove;
          token.canPublish = dbUser.canPublish;
          token.mustChangePassword = dbUser.mustChangePassword;
          token.canCreateUsers = dbUser.canCreateUsers;
        } catch {
          // Errore DB: mantieni i dati esistenti nel token
        }
      }
      return token;
    },
    async session({ session, token }) {
      // Sessione decaduta: nessun utente, chi legge la sessione tratta come non autenticato.
      if (token.invalidated) {
        return { ...session, user: undefined } as unknown as typeof session;
      }
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        canView: token.canView,
        canEdit: token.canEdit,
        canApprove: token.canApprove,
        canPublish: token.canPublish,
        mustChangePassword: token.mustChangePassword,
        canCreateUsers: token.canCreateUsers,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
