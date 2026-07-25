"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { PushPermissionBanner } from "@/components/shared/push-permission-banner";
import { HelpTip } from "@/components/auth/help-tip";

type Platform = "ios" | "android" | "desktop";

function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "desktop";
  const ua = navigator.userAgent;
  // iPadOS recente si presenta come Mac: si riconosce dal touch.
  const isIpadOS = /Macintosh/.test(ua) && typeof document !== "undefined" && "ontouchend" in document;
  if (/iPhone|iPad|iPod/.test(ua) || isIpadOS) return "ios";
  if (/Android/.test(ua)) return "android";
  return "desktop";
}

/**
 * Schermata post-attivazione: mettere ModusHO sul telefono in due tocchi.
 * Raggiungibile anche dal menu utente ("Installa l'app sul telefono").
 */
export default function BenvenutoPage() {
  const [platform, setPlatform] = useState<Platform>("desktop");

  useEffect(() => {
    setPlatform(detectPlatform());
  }, []);

  return (
    <div className="min-h-screen bg-ivory px-4 py-10">
      <div className="max-w-[460px] mx-auto">
        <div className="text-center mb-8">
          <h1 className="font-heading text-[30px] font-medium tracking-[0.15em] text-terracotta">
            ModusHO
          </h1>
          <p className="mt-2 font-ui text-[10px] uppercase tracking-[0.3em] text-charcoal/45">
            HO Collection · Governance operativa
          </p>
        </div>

        <div className="bg-ivory-medium border border-ivory-dark p-6 sm:p-9">
          <h2 className="font-heading text-[24px] font-medium leading-snug text-charcoal-dark">
            Ci sei. Ora mettilo sul telefono.
          </h2>
          <p className="mt-3 text-sm font-ui leading-relaxed text-charcoal/70">
            Bastano due tocchi: ModusHO resta a portata di mano come una qualsiasi app, senza
            passare ogni volta dal browser.
          </p>

          <div className="mt-7">
            {platform === "ios" && <IosSteps />}
            {platform === "android" && <AndroidSteps />}
            {platform === "desktop" && <DesktopNote />}
          </div>

          <div className="mt-8 pt-6 border-t border-ivory-dark">
            <Link href="/" className="btn-primary w-full block text-center">
              Vai a ModusHO
            </Link>
            <Link
              href="/"
              className="mt-3 block text-center text-[12px] font-ui text-charcoal/55 hover:text-terracotta transition-colors"
            >
              Lo farò dopo
            </Link>
          </div>

          <HelpTip
            question="Perché conviene installarla?"
            answer="Con l'app sulla schermata Home apri ModusHO con un tocco e ricevi le notifiche quando esce una procedura nuova da leggere. Dal browser, invece, rischi di accorgertene in ritardo."
          />
        </div>
      </div>

      {/* Attivazione notifiche: stesso banner usato nel resto dell'app */}
      <PushPermissionBanner />
    </div>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="w-6 h-6 shrink-0 bg-terracotta text-white font-ui text-[12px] font-semibold flex items-center justify-center">
        {n}
      </span>
      <span className="text-sm font-ui leading-relaxed text-charcoal pt-0.5">{children}</span>
    </li>
  );
}

function IosSteps() {
  return (
    <>
      <p className="text-[11px] font-ui uppercase tracking-[1.5px] text-charcoal/45 mb-4">
        Sul tuo iPhone
      </p>
      <ol className="space-y-4">
        <Step n={1}>
          Tocca <strong>Condividi</strong> — il quadrato con la freccia in su, in basso allo schermo.
        </Step>
        <Step n={2}>
          Scorri e tocca <strong>Aggiungi alla schermata Home</strong>, poi <strong>Aggiungi</strong>.
        </Step>
      </ol>
      <p className="mt-5 text-[12px] font-ui leading-relaxed text-charcoal/70 bg-white border-l-2 border-alert-yellow p-3">
        Su iPhone questo passaggio è necessario: senza aggiungere ModusHO alla schermata Home,
        le notifiche non arrivano.
      </p>
    </>
  );
}

function AndroidSteps() {
  return (
    <>
      <p className="text-[11px] font-ui uppercase tracking-[1.5px] text-charcoal/45 mb-4">
        Sul tuo telefono Android
      </p>
      <ol className="space-y-4">
        <Step n={1}>
          Tocca il menu <strong>⋮</strong> in alto a destra nel browser.
        </Step>
        <Step n={2}>
          Tocca <strong>Installa app</strong> (a volte si chiama &quot;Aggiungi a schermata Home&quot;)
          e conferma.
        </Step>
      </ol>
    </>
  );
}

function DesktopNote() {
  return (
    <p className="text-sm font-ui leading-relaxed text-charcoal/70">
      Stai usando ModusHO da computer. Quando lo apri dal telefono ti mostriamo qui i due passaggi
      per aggiungerlo alla schermata Home: è da lì che arrivano le notifiche.
    </p>
  );
}
