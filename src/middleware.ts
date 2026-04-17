import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

const ROLE_HIERARCHY: Record<Role, number> = {
  OPERATOR: 0,
  HOD: 1,
  HOTEL_MANAGER: 2,
  PRO: 3,
  ADMIN: 4,
  SUPER_ADMIN: 5,
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    if (!token || !token.role) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const userRole = token.role as Role;
    if (!(userRole in ROLE_HIERARCHY)) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    // Utente con canView=false non può accedere a nessuna pagina (disattivato)
    if (token.canView === false) {
      return NextResponse.redirect(new URL("/unauthorized", req.url));
    }

    // 1. Cestino: solo SUPER_ADMIN
    if (pathname.startsWith("/content/deleted")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.SUPER_ADMIN) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 2. Analytics: solo ADMIN+
    if (pathname.startsWith("/analytics")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.ADMIN) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 3. Utenti e Strutture: solo ADMIN+
    if (pathname.startsWith("/users") || pathname.startsWith("/properties")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.ADMIN) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 4a. Dashboard: HM+ (overview operativa)
    if (pathname.startsWith("/dashboard")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOTEL_MANAGER) {
        return NextResponse.redirect(new URL("/hoo-sop", req.url));
      }
    }

    // 4a2. Approvazioni, presa visione e report: accessibili da HOD+
    if (pathname.startsWith("/approvals") || pathname.startsWith("/compliance") || pathname.startsWith("/reports")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 4b. Standard Book HOO: accessibile a HOD+
    if (pathname.startsWith("/hoo-standard-book")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 4c. SOP workflow: almeno HOD (HOD crea e gestisce bozze SOP)
    if (pathname.startsWith("/hoo-sop") || pathname.startsWith("/sop-workflow")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 4d. Brand Book HOO: solo HM+ (workflow approvazione obbligatorio)
    if (pathname.startsWith("/hoo-brand-book")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOTEL_MANAGER) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // 4e. Library/Memo/Content: HOD+ (HOD può creare DOCUMENT/MEMO direttamente
    //     limitatamente al proprio reparto — vedi /api/content e /api/memo)
    if (pathname.startsWith("/library") || pathname.startsWith("/memo") ||
        pathname.startsWith("/content")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOD) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => !!token,
    },
  }
);

export const config = {
  matcher: [
    "/((?!login|api/auth|api/health|api/cron|_next/static|_next/image|favicon.ico|images|manifest.json|sw.js|icons).*)",
  ],
};
