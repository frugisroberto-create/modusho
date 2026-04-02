import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "./prisma";
import "@/types";

export const authOptions: NextAuthOptions = {
  providers: [
    CredentialsProvider({
      name: "Credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: credentials.email },
        });

        if (!user || !user.isActive) {
          return null;
        }

        const isPasswordValid = await bcrypt.compare(
          credentials.password,
          user.passwordHash
        );

        if (!isPasswordValid) {
          return null;
        }

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
        // Primo login: popola il token dal DB
        token.id = user.id;
        token.email = user.email!;
        token.name = user.name!;
        token.role = user.role;
        token.canView = user.canView;
        token.canEdit = user.canEdit;
        token.canApprove = user.canApprove;
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
  cookies: {
    sessionToken: {
      name: "next-auth.session-token",
      options: {
        httpOnly: true,
        sameSite: "lax" as const,
        path: "/",
        secure: process.env.NODE_ENV === "production",
      },
    },
  },
};
