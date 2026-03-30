"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut } from "next-auth/react";
import { useState } from "react";
import { HoLogo } from "@/components/ui/ho-logo";

const NAV_ITEMS: { href: string; label: string; icon: string; minRole?: "ADMIN" | "SUPER_ADMIN" }[] = [
  { href: "/dashboard", label: "Home", icon: "M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" },
  { href: "/analytics", label: "Analytics", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z", minRole: "ADMIN" },
  { href: "/approvals", label: "Approvazioni", icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" },
  { href: "/hoo-sop", label: "SOP", icon: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" },
  { href: "/memo", label: "Memo", icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" },
  { href: "/properties", label: "Strutture", icon: "M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4", minRole: "ADMIN" },
  { href: "/users", label: "Utenti", icon: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z", minRole: "ADMIN" },
  { href: "/reports", label: "Report", icon: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" },
  { href: "/library", label: "Libreria", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { href: "/hoo-brand-book", label: "Brand Book", icon: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" },
  { href: "/hoo-standard-book", label: "Standard Book", icon: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" },
];

interface HooSidebarProps {
  userName: string;
  userRole: string;
  userRoleLabel: string;
}

function SidebarContent({ userName, userRole, userRoleLabel, pathname, onNavClick }: {
  userName: string; userRole: string; userRoleLabel: string; pathname: string; onNavClick?: () => void;
}) {
  return (
    <aside className="fixed inset-y-0 left-0 w-[260px] bg-sage text-white flex flex-col z-40">
      <div className="px-5 py-5 border-b border-white/10">
        <Link href="/dashboard">
          <HoLogo variant="horizontal" color="light" size={140} />
        </Link>
      </div>

      <nav className="flex-1 py-4 overflow-y-auto">
        {NAV_ITEMS.filter((item) => {
          if (!item.minRole) return true;
          const roleOrder = ["HOTEL_MANAGER", "ADMIN", "SUPER_ADMIN"];
          return roleOrder.indexOf(userRole) >= roleOrder.indexOf(item.minRole);
        }).map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <Link key={item.href} href={item.href} onClick={onNavClick}
              className={`flex items-center gap-3 px-5 py-2.5 text-sm font-ui transition-colors ${
                isActive
                  ? "bg-white/10 border-l-[3px] border-l-terracotta text-white"
                  : "text-white/70 hover:bg-white/5 hover:text-white/90 border-l-[3px] border-l-transparent"
              }`}>
              <svg className={`w-5 h-5 shrink-0 ${isActive ? "opacity-100" : "opacity-70"}`}
                fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={item.icon} />
              </svg>
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-white/10 px-5 py-3">
        <Link href="/" className="flex items-center gap-2 text-sm font-ui text-white/60 hover:text-white transition-colors">
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Vista Hotel
        </Link>
        {userRole === "SUPER_ADMIN" && (
          <Link href="/content/deleted" onClick={onNavClick}
            className={`flex items-center gap-2 text-sm font-ui mt-2 ${pathname.startsWith("/content/deleted") ? "text-white" : "text-white/60 hover:text-white"} transition-colors`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Cestino
          </Link>
        )}
      </div>

      <div className="border-t border-white/10 px-5 py-4">
        <p className="text-sm font-ui font-medium truncate text-white/90">{userName}</p>
        <p className="text-xs font-ui text-white/50 mt-0.5">{userRoleLabel}</p>
        <button onClick={() => signOut({ callbackUrl: "/login" })}
          className="mt-2.5 text-xs font-ui text-white/40 hover:text-white/70 transition-colors">
          Esci
        </button>
      </div>
    </aside>
  );
}

export function HooSidebar({ userName, userRole, userRoleLabel }: HooSidebarProps) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <>
      <button onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-sage rounded-lg text-white">
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
      </button>

      <div className="hidden lg:block">
        <SidebarContent userName={userName} userRole={userRole} userRoleLabel={userRoleLabel} pathname={pathname} />
      </div>

      {mobileOpen && (
        <>
          <div className="fixed inset-0 bg-black/40 z-30 lg:hidden" onClick={() => setMobileOpen(false)} />
          <div className="lg:hidden">
            <SidebarContent userName={userName} userRole={userRole} userRoleLabel={userRoleLabel} pathname={pathname} onNavClick={() => setMobileOpen(false)} />
          </div>
        </>
      )}
    </>
  );
}
