"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";

interface HooHeaderProps {
  userName: string;
  userRole: string;
}

const HOO_NAV_ITEMS: { href: string; label: string; minRole?: string }[] = [
  { href: "/dashboard", label: "Home" },
  { href: "/hoo-sop", label: "SOP" },
  { href: "/library", label: "Documenti" },
  { href: "/memo", label: "Memo" },
  { href: "/hoo-brand-book", label: "Brand Book" },
  { href: "/hoo-standard-book", label: "Standard Book" },
  { href: "/analytics", label: "Analytics", minRole: "ADMIN" },
];

export function HooHeader({ userName, userRole }: HooHeaderProps) {
  const pathname = usePathname();
  const isAdmin = userRole === "ADMIN" || userRole === "SUPER_ADMIN";

  const visibleNav = HOO_NAV_ITEMS.filter((item) => {
    if (!item.minRole) return true;
    if (item.minRole === "ADMIN") return isAdmin;
    return false;
  });

  return (
    <header className="bg-terracotta sticky top-0 z-50">
      <div className="max-w-[1200px] mx-auto px-6 lg:px-10">
        <div className="flex items-center justify-between h-14">
          <div className="flex items-center gap-10">
            <Link href="/dashboard" className="shrink-0">
              <span className="font-heading text-white text-base tracking-[0.25em] font-normal">
                HO COLLECTION
              </span>
            </Link>
            <nav className="hidden md:flex gap-7">
              {visibleNav.map((item) => {
                const isActive = item.href === "/dashboard"
                  ? pathname === "/dashboard"
                  : pathname.startsWith(item.href);
                return (
                  <Link key={item.href} href={item.href}
                    className={`text-sm font-heading py-4 relative transition-colors ${
                      isActive ? "text-white" : "text-white/75 hover:text-white"
                    }`}>
                    {item.label}
                    {isActive && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-white" />}
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="flex items-center gap-4">
            <Link href="/"
              className="text-sm font-ui font-medium text-white/80 hover:text-white bg-white/10 px-3 py-1.5 transition-colors">
              Vista Hotel
            </Link>
            <div className="flex items-center gap-2.5 text-white/85 text-[13px] font-ui">
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center text-xs font-semibold text-white">
                {userName.split(" ").map(n => n[0]).join("").slice(0, 2)}
              </div>
              <span className="hidden sm:inline">{userName}</span>
            </div>
            <button onClick={() => signOut({ callbackUrl: "/login" })}
              className="text-sm text-white/60 hover:text-white px-2 py-1 font-ui transition-colors">
              Esci
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
