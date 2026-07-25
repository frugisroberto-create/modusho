import Link from "next/link";
import { findValidToken } from "@/lib/auth-tokens";
import { AuthShell } from "@/components/auth/auth-shell";
import { ResetForm } from "@/components/auth/reset-form";

export const dynamic = "force-dynamic";

/**
 * Pagina di reimpostazione password (link ricevuto per email, 60 minuti).
 * Con token non valido non rivela nulla sull'utente.
 */
export default async function ReimpostaPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const owner = await findValidToken(token, "RESET");

  if (!owner) {
    return (
      <AuthShell title="Questo link non è più valido">
        <p className="text-sm font-ui leading-relaxed text-charcoal">
          I link per la password durano 60 minuti. Se è passato più tempo, chiedine uno nuovo
          dalla pagina di accesso.
        </p>
        <Link
          href="/password-dimenticata"
          className="mt-6 inline-block text-[12px] font-ui text-terracotta hover:text-terracotta-light transition-colors"
        >
          Richiedi un nuovo link
        </Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell
      title="Crea la tua nuova password"
      subtitle={
        <span className="block">
          Il tuo nome utente è <strong className="text-charcoal">{owner.email}</strong>
        </span>
      }
    >
      <ResetForm token={token} email={owner.email} />
    </AuthShell>
  );
}
