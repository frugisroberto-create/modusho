"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { useSession, signOut } from "next-auth/react";
import { shouldExpireSession, buildSessionExpiredUrl } from "@/lib/session-expiry";

/**
 * Sorveglia la sessione da un punto solo.
 *
 * Sta dentro `Providers`, quindi sotto `SessionProvider` e sopra ogni pagina:
 * è l'unico posto attraversato da tutta l'applicazione, e quindi l'unico in cui
 * il controllo non va replicato. Sparso nelle pagine sarebbe divergente al primo
 * schermo nuovo — lo stesso meccanismo che ha prodotto il difetto.
 *
 * Non interferisce con l'invalidazione lato server, che resta invariata: qui si
 * aggiunge soltanto la comunicazione all'utente.
 */
export function SessionGuard({ children }: { children: React.ReactNode }) {
  const { data: session, status } = useSession();
  const pathname = usePathname();
  // L'espulsione parte una volta sola: senza il guardiano, un re-render fra il
  // signOut e il cambio di pagina la farebbe ripartire.
  const espulsoRef = useRef(false);

  useEffect(() => {
    if (espulsoRef.current) return;

    const espelli = shouldExpireSession({
      status,
      hasUser: Boolean(session?.user),
      pathname: pathname ?? "",
    });
    if (!espelli) return;

    espulsoRef.current = true;
    // Il cookie va rimosso: senza, il middleware continuerebbe a leggere un
    // token che lui considera ancora valido e non porterebbe mai al login.
    signOut({ redirect: false }).finally(() => {
      window.location.href = buildSessionExpiredUrl();
    });
  }, [status, session, pathname]);

  return <>{children}</>;
}
