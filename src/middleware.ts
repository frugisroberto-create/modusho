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

    // Route HOO: richiedono almeno ADMIN
    if (pathname.startsWith("/dashboard") || pathname.startsWith("/approvals") ||
        pathname.startsWith("/properties") || pathname.startsWith("/users") ||
        pathname.startsWith("/reports") || pathname.startsWith("/hoo-sop") ||
        pathname.startsWith("/library") || pathname.startsWith("/memo") ||
        pathname.startsWith("/content")) {
      if (ROLE_HIERARCHY[userRole] < ROLE_HIERARCHY.ADMIN) {
        return NextResponse.redirect(new URL("/unauthorized", req.url));
      }
    }

    // Route operatore: accessibili a tutti i ruoli autenticati
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
