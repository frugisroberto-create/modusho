"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  url: string | null;
  readAt: string | null;
  createdAt: string;
}

const TYPE_ICON: Record<string, { icon: string; color: string }> = {
  CONTENT_PUBLISHED: { icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z", color: "text-sage" },
  TEXT_SAVED: { icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z", color: "text-terracotta" },
  NOTE_ADDED: { icon: "M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z", color: "text-charcoal/50" },
  SUBMITTED: { icon: "M12 19l9 2-9-18-9 18 9-2zm0 0v-8", color: "text-mauve" },
  ACK_REMINDER: { icon: "M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z", color: "text-[#E65100]" },
};

function formatRelative(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "adesso";
  if (mins < 60) return `${mins} min fa`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h fa`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}g fa`;
  return new Date(dateStr).toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit" });
}

export function NotificationList() {
  const router = useRouter();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async (p: number, append = false) => {
    try {
      const res = await fetch(`/api/notifications?page=${p}&pageSize=20`);
      if (res.ok) {
        const { data, meta } = await res.json();
        setItems((prev) => append ? [...prev, ...data] : data);
        setTotal(meta.total);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchNotifications(1); }, [fetchNotifications]);

  const handleClick = async (notif: NotificationItem) => {
    if (!notif.readAt) {
      await fetch("/api/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notificationId: notif.id }),
      });
    }
    if (notif.url) {
      router.push(notif.url);
    }
  };

  const handleMarkAll = async () => {
    setMarkingAll(true);
    try {
      await fetch("/api/notifications/read", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markAll: true }),
      });
      setItems((prev) => prev.map((n) => ({ ...n, readAt: n.readAt || new Date().toISOString() })));
    } finally {
      setMarkingAll(false);
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchNotifications(nextPage, true);
  };

  const hasUnread = items.some((n) => !n.readAt);
  const hasMore = items.length < total;

  if (loading) {
    return <div className="space-y-3">{[1, 2, 3].map((i) => <div key={i} className="h-16 skeleton" />)}</div>;
  }

  return (
    <div className="space-y-4">
      {hasUnread && (
        <div className="flex justify-end">
          <button onClick={handleMarkAll} disabled={markingAll}
            className="text-xs font-ui text-terracotta hover:underline disabled:opacity-50">
            {markingAll ? "..." : "Segna tutte come lette"}
          </button>
        </div>
      )}

      {items.length === 0 ? (
        <p className="text-sm font-ui text-charcoal/40 italic text-center py-8">Nessuna notifica</p>
      ) : (
        <div className="space-y-1">
          {items.map((notif) => {
            const typeInfo = TYPE_ICON[notif.type] || TYPE_ICON.CONTENT_PUBLISHED;
            const isUnread = !notif.readAt;
            return (
              <button
                key={notif.id}
                onClick={() => handleClick(notif)}
                className={`w-full text-left flex items-start gap-3 px-4 py-3 transition-colors hover:bg-ivory-dark/50 ${
                  isUnread ? "bg-ivory border-l-3 border-terracotta" : "bg-white"
                }`}
              >
                <svg className={`w-5 h-5 shrink-0 mt-0.5 ${typeInfo.color}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d={typeInfo.icon} />
                </svg>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-ui leading-snug ${isUnread ? "font-semibold text-charcoal-dark" : "text-charcoal"}`}>
                    {notif.body}
                  </p>
                  <p className="text-[10px] font-ui text-charcoal/40 mt-0.5">
                    {formatRelative(notif.createdAt)}
                  </p>
                </div>
                {isUnread && (
                  <span className="w-2 h-2 rounded-full bg-terracotta shrink-0 mt-2" />
                )}
              </button>
            );
          })}
        </div>
      )}

      {hasMore && (
        <div className="flex justify-center pt-2">
          <button onClick={handleLoadMore} className="text-xs font-ui text-terracotta hover:underline">
            Carica altre
          </button>
        </div>
      )}
    </div>
  );
}
