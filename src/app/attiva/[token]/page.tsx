import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { findValidToken } from "@/lib/auth-tokens";
import { AuthShell } from "@/components/auth/auth-shell";
import { ActivationForm } from "@/components/auth/activation-form";

export const dynamic = "force-dynamic";

/**
 * Pagina di attivazione dell'invito.
 *
 * Con token non valido la pagina NON rivela nulla: né il nome, né se
 * l'utente esiste. Mostra solo un messaggio neutro.
 */
export default async function AttivaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const owner = await findValidToken(token, "ACTIVATION");

  if (!owner) {
    return (
      <AuthShell title="Questo link non è più valido">
        <p className="text-sm font-ui leading-relaxed text-charcoal">
          Può essere scaduto oppure essere già stato usato. Chiedi al tuo responsabile di
          rimandarti l&apos;invito: ci vuole un attimo.
        </p>
        <Link
          href="/login"
          className="mt-6 inline-block text-[12px] font-ui text-terracotta hover:text-terracotta-light transition-colors"
        >
          Vai alla pagina di accesso
        </Link>
      </AuthShell>
    );
  }

  // Contesto di lavoro: struttura e reparto, per far capire subito "dove" si entra.
  const assignment = await prisma.propertyAssignment.findFirst({
    where: { userId: owner.id },
    select: {
      property: { select: { name: true } },
      department: { select: { name: true } },
    },
  });

  const context = [assignment?.property?.name, assignment?.department?.name]
    .filter(Boolean)
    .join(" · ");

  return (
    <AuthShell
      title={`Ciao ${owner.name}, scegli la tua password`}
      subtitle={
        <>
          {context && <span className="block">{context}</span>}
          <span className="block mt-1">
            Il tuo nome utente è <strong className="text-charcoal">{owner.email}</strong>
          </span>
        </>
      }
    >
      <ActivationForm token={token} email={owner.email} />
    </AuthShell>
  );
}
