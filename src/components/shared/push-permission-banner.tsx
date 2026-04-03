"use client";

import { useState, useEffect, useCallback } from "react";
import { useIsMobile } from "@/hooks/use-is-mobile";

const DISMISS_KEY = "modusho_push_dismissed";
const ACK_COUNT_KEY = "modusho_ack_count";

/**
 * Banner per richiedere permesso push notification.
 * Si mostra solo su mobile, dopo almeno una presa visione completata,
 * se il browser supporta push e il permesso non è stato ancora concesso/negato.
 */
export function PushPermissionBanner() {
  const isMobile = useIsMobile();
  const [show, setShow] = useState(false);
  const [subscribing, setSubscribing] = useState(false);

  useEffect(() => {
    // Debug: log conditions
    const checks = {
      isMobile,
      hasNotification: typeof window !== "undefined" && "Notification" in window,
      hasServiceWorker: typeof navigator !== "undefined" && "serviceWorker" in navigator,
      hasPushManager: typeof window !== "undefined" && "PushManager" in window,
      permission: typeof window !== "undefined" && "Notification" in window ? Notification.permission : "N/A",
      dismissed: typeof window !== "undefined" ? localStorage.getItem(DISMISS_KEY) : null,
    };
    console.log("[push-banner] checks:", JSON.stringify(checks));

    if (!isMobile) return;
    if (!("Notification" in window) || !("serviceWorker" in navigator) || !("PushManager" in window)) return;
    if (Notification.permission !== "default") return;
    if (localStorage.getItem(DISMISS_KEY)) return;

    setShow(true);
  }, [isMobile]);

  const handleSubscribe = useCallback(async () => {
    setSubscribing(true);
    try {
      const permission = await Notification.requestPermission();
      if (permission !== "granted") {
        setShow(false);
        localStorage.setItem(DISMISS_KEY, "1");
        return;
      }

      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });

      const json = sub.toJSON();
      await fetch("/api/push-subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint: json.endpoint,
          keys: json.keys,
        }),
      });

      setShow(false);
    } catch {
      setShow(false);
    } finally {
      setSubscribing(false);
    }
  }, []);

  const handleDismiss = useCallback(() => {
    setShow(false);
    localStorage.setItem(DISMISS_KEY, "1");
  }, []);

  if (!show) return null;

  return (
    <div className="fixed bottom-16 left-0 right-0 z-40 px-4 pb-2 md:hidden">
      <div className="bg-white border border-ivory-dark shadow-lg p-4">
        <p className="text-sm font-ui text-charcoal-dark mb-3">
          Vuoi ricevere una notifica quando ci sono nuovi contenuti da leggere?
        </p>
        <div className="flex gap-2">
          <button onClick={handleSubscribe} disabled={subscribing}
            className="flex-1 px-4 py-2 text-sm font-ui font-semibold text-white bg-terracotta hover:bg-terracotta-light transition-colors disabled:opacity-50">
            {subscribing ? "..." : "Sì, attiva"}
          </button>
          <button onClick={handleDismiss}
            className="px-4 py-2 text-sm font-ui text-charcoal/50 hover:text-charcoal transition-colors">
            Non ora
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Incrementa il contatore locale di prese visione completate.
 * Da chiamare dopo ogni acknowledge riuscito.
 */
export function incrementAckCount() {
  if (typeof window === "undefined") return;
  const count = parseInt(localStorage.getItem(ACK_COUNT_KEY) || "0", 10);
  localStorage.setItem(ACK_COUNT_KEY, String(count + 1));
}
