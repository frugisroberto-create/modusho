import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const dynamic = "force-dynamic";

/**
 * Cambio password obbligatorio (bloccante).
 *
 * Ci si arriva quando l'utente ha ancora la password impostata da altri: il
 * middleware devia qui ogni altra rotta finché non l'ha cambiata.
 *
 * Due soli campi: la password attuale non viene richiesta perché l'utente ha
 * appena fatto login e il server autorizza l'omissione in base al flag
 * mustChangePassword sul suo record.
 */
export default async function CambiaPasswordObbligatorioPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const { next } = await searchParams;
  // Solo percorsi interni: mai rimandare fuori dall'app.
  const redirectTo = next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  return (
    <AuthShell
      title={`Bentornato, ${user.name}.`}
      subtitle="Da oggi la password la scegli tu: quella di prima l'aveva impostata qualcun altro."
    >
      <ChangePasswordForm
        email={user.email}
        submitLabel="Salva e continua"
        redirectTo={redirectTo}
        requireCurrent={false}
        help={{
          question: "Perché mi viene chiesto?",
          answer:
            "Fino a ieri la password del tuo accesso l'aveva impostata un'altra persona. Da oggi la scegli tu e la conosci solo tu: nessuno, nemmeno il tuo responsabile, può vederla.",
        }}
      />
    </AuthShell>
  );
}
