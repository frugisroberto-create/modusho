"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { HoLogo } from "@/components/ui/ho-logo";

interface Property {
  id: string;
  name: string;
  code: string;
  tagline: string | null;
}

interface OperatorHeaderProps {
  userName: string;
  userRole: string;
  properties: Property[];
  currentPropertyId: string;
  pendingCount: number;
  onPropertyChange: (propertyId: string) => void;
}

const NAV_ITEMS = [
  { href: "/", label: "Home" },
  { href: "/sop", label: "SOP" },
  { href: "/documents", label: "Documenti" },
  { href: "/brand-book", label: "Brand Book" },
  { href: "/standard-book", label: "Standard Book" },
];

export function OperatorHeader({
  userName,
  userRole,
  properties,
  currentPropertyId,
  pendingCount,
  onPropertyChange,
}: OperatorHeaderProps) {
  const pathname = usePathname();
  const currentProperty = properties.find((p) => p.id === currentPropertyId);
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  return (
    <header className="bg-terracotta sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="shrink-0">
            <HoLogo variant="horizontal" color="light" size={140} />
          </Link>

          {/* Right side */}
          <div className="flex items-center gap-3">
            {/* Link Dashboard per admin */}
            {isAdmin && (
              <Link href="/dashboard"
                className="text-sm font-ui font-medium text-white/80 hover:text-white bg-white/10 px-3 py-1.5 rounded-md transition-colors">
                Dashboard
              </Link>
            )}

            {pendingCount > 0 && (
              <Link
                href="/#da-leggere"
                className="flex items-center justify-center w-7 h-7 rounded-full bg-white/20 text-white text-xs font-ui font-bold"
                title={`${pendingCount} contenuti da leggere`}
              >
                {pendingCount > 99 ? "99+" : pendingCount}
              </Link>
            )}

            {properties.length > 1 ? (
              <select
                value={currentPropertyId}
                onChange={(e) => onPropertyChange(e.target.value)}
                className="text-sm border border-white/30 rounded-md px-2 py-1.5 bg-white/10 text-white focus:outline-none focus:ring-2 focus:ring-white/30 max-w-[160px] font-ui"
              >
                {properties.map((p) => (
                  <option key={p.id} value={p.id} className="text-charcoal">
                    {p.name}
                  </option>
                ))}
              </select>
            ) : currentProperty ? (
              <span className="text-sm text-white/80 hidden sm:inline font-ui">
                {currentProperty.name}
              </span>
            ) : null}

            <span className="text-sm text-white/90 hidden sm:inline font-ui">
              {userName}
            </span>

            <button
              onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-white/60 hover:text-white px-2 py-1 font-ui transition-colors"
            >
              Esci
            </button>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex gap-1 -mb-px">
          {NAV_ITEMS.map((item) => {
            const isActive =
              item.href === "/"
                ? pathname === "/"
                : pathname.startsWith(item.href);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`px-4 py-2.5 text-sm font-ui font-medium border-b-2 transition-colors ${
                  isActive
                    ? "border-white text-white"
                    : "border-transparent text-white/60 hover:text-white/80 hover:border-white/30"
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}
