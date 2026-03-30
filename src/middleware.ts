import { withAuth } from "next-auth/middleware";
import { NextResponse } from "next/server";
import type { Role } from "@prisma/client";

const ROLE_HIERARCHY: Record<Role, number> = {
  OPERATOR: 0,
  HOD: 1,
  HOTEL_MANAGER: 2,
  ADMIN: 3,
  SUPER_ADMIN: 4,
};

export default withAuth(
  function middleware(req) {
    const { pathname } = req.nextUrl;
    const token = req.nextauth.token;

    if (!token) {
      return NextResponse.redirect(new URL("/login", req.url));
    }

    const userRole = token.role as Role;

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

    // 4. Route HOO generiche: almeno HOTEL_MANAGER
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/approvals") ||
        pathname.startsWith("/reports") || pathname.startsWith("/hoo-sop") ||
        pathname.startsWith("/library") || pathname.startsWith("/memo") ||
        pathname.startsWith("/content") || pathname.startsWith("/hoo-brand-book") ||
        pathname.startsWith("/hoo-standard-book")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.HOTEL_MANAGER) {
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
    "/((?!login|api/auth|_next/static|_next/image|favicon.ico|images).*)",
  ],
};
