import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/session";
import { AuthShell } from "@/components/auth/auth-shell";
import { ChangePasswordForm } from "@/components/auth/change-password-form";

export const dynamic = "force-dynamic";

/** Cambio password volontario, dalla voce "Cambia password" del menu utente. */
export default async function CambiaPasswordPage() {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  return (
    <AuthShell
      title="Cambia la tua password"
      subtitle="Scegline una che ricordi facilmente ma che nessun altro possa indovinare."
    >
      <ChangePasswordForm
        email={user.email}
        submitLabel="Salva la nuova password"
        redirectTo="/"
        help={{
          question: "Perché mi chiede la password di adesso?",
          answer:
            "È una sicurezza: serve a essere certi che sia proprio tu a cambiarla e non qualcuno che ha trovato il telefono o il computer aperto. Se non la ricordi, esci e usa \"Password dimenticata?\" nella pagina di accesso.",
        }}
      />
    </AuthShell>
  );
}
