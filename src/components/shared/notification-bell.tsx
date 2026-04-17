"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

export function NotificationBell() {
  const router = useRouter();
  const [count, setCount] = useState(0);

  const fetchCount = useCallback(async () => {
    try {
      const res = await fetch("/api/notifications/unread-count");
      if (res.ok) {
        const { data } = await res.json();
        setCount(data.count);
      }
    } catch { /* best-effort */ }
  }, []);

  useEffect(() => {
    fetchCount();
    const interval = setInterval(fetchCount, 30_000);
    return () => clearInterval(interval);
  }, [fetchCount]);

  return (
    <button
      onClick={() => router.push("/notifications")}
      className="relative p-1.5 rounded hover:bg-white/10 transition-colors"
      title="Notifiche"
    >
      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8}
          d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" />
      </svg>
      {count > 0 && (
        <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 flex items-center justify-center rounded-full bg-[#C0392B] text-white text-[9px] font-ui font-bold px-1">
          {count > 99 ? "99+" : count}
        </span>
      )}
    </button>
  );
}
