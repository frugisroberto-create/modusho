import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit, checkEmailRateLimit, recordFailedAttempt, resetAttempts } from "./rate-limit";
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

        // Rate limit per IP (5 tentativi / 15 min)
        const ipCheck = await checkRateLimit(ip);
        if (!ipCheck.allowed) {
          const retryMin = Math.ceil(ipCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED-IP ip=${ip} email=${credentials.email} — riprova tra ${retryMin} min`);
          throw new Error(`Troppi tentativi. Riprova tra ${retryMin} minuti.`);
        }

        // Rate limit per email/account (10 tentativi / 30 min)
        const emailCheck = await checkEmailRateLimit(credentials.email);
        if (!emailCheck.allowed) {
          const retryMin = Math.ceil(emailCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED-ACCOUNT ip=${ip} email=${credentials.email} — account bloccato, riprova tra ${retryMin} min`);
          throw new Error(`Account temporaneamente bloccato. Riprova tra ${retryMin} minuti.`);
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.isActive) {
          await recordFailedAttempt(ip, credentials.email);
          console.warn(`[auth] FAILED ip=${ip} email=${credentials.email} — utente non trovato o disattivato`);
          return null;
        }

        // Account creato ma non ancora attivato (hash vuoto): fallisce qui,
        // senza passare a bcrypt un hash malformato.
        if (!hasUsablePassword(user.passwordHash)) {
          await recordFailedAttempt(ip, credentials.email);
          console.warn(`[auth] FAILED ip=${ip} email=${credentials.email} — account non ancora attivato`);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          await recordFailedAttempt(ip, credentials.email);
          console.warn(`[auth] FAILED ip=${ip} email=${credentials.email} — password errata`);
          return null;
        }

        // Login riuscito: reset contatore tentativi
        await resetAttempts(ip, credentials.email);
        console.log(`[auth] OK ip=${ip} email=${credentials.email} role=${user.role}`);

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
