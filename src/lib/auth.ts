import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import { checkRateLimit, recordFailedAttempt, resetAttempts } from "./rate-limit";
import { headers } from "next/headers";
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

        const rateCheck = checkRateLimit(ip);
        if (!rateCheck.allowed) {
          const retryMin = Math.ceil(rateCheck.retryAfterMs / 60000);
          console.warn(`[auth] BLOCKED ip=${ip} email=${credentials.email} — troppi tentativi, riprova tra ${retryMin} min`);
          throw new Error(`Troppi tentativi. Riprova tra ${retryMin} minuti.`);
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.isActive) {
          recordFailedAttempt(ip);
          console.warn(`[auth] FAILED ip=${ip} email=${credentials.email} — utente non trovato o disattivato`);
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          recordFailedAttempt(ip);
          console.warn(`[auth] FAILED ip=${ip} email=${credentials.email} — password errata`);
          return null;
        }

        // Login riuscito: reset contatore tentativi
        resetAttempts(ip);
        console.log(`[auth] OK ip=${ip} email=${credentials.email} role=${user.role}`);

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role,
          canView: user.canView,
          canEdit: user.canEdit,
          canApprove: user.canApprove,
        };
      },
    }),
  ],
  session: {
    strategy: "jwt",
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
        prisma.user.update({
          where: { id: user.id },
          data: { lastLoginAt: new Date() },
        }).catch(() => {});
      } else if (token.id) {
        // Rinnovo token: aggiorna ruolo e permessi dal DB
        try {
          const dbUser = await prisma.user.findUnique({
            where: { id: token.id as string },
            select: { role: true, canView: true, canEdit: true, canApprove: true, isActive: true, name: true },
          });
          if (!dbUser || !dbUser.isActive) {
            // Utente disattivato o eliminato: segna come invalido
            token.role = "OPERATOR";
            token.canView = false;
            token.canEdit = false;
            token.canApprove = false;
            return token;
          }
          token.role = dbUser.role;
          token.name = dbUser.name;
          token.canView = dbUser.canView;
          token.canEdit = dbUser.canEdit;
          token.canApprove = dbUser.canApprove;
        } catch {
          // Errore DB: mantieni i dati esistenti nel token
        }
      }
      return token;
    },
    async session({ session, token }) {
      session.user = {
        id: token.id,
        email: token.email,
        name: token.name,
        role: token.role,
        canView: token.canView,
        canEdit: token.canEdit,
        canApprove: token.canApprove,
      };
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
};
