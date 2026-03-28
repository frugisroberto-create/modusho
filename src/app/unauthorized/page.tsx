import Link from "next/link";
import { DomusGoLogo } from "@/components/ui/domusgo-logo";

export default function UnauthorizedPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <DomusGoLogo size="md" />
      <div className="mt-8 text-center">
        <h1 className="text-xl font-heading font-semibold text-charcoal-dark mb-3">Accesso non autorizzato</h1>
        <p className="text-sm font-ui text-sage-light mb-6">
          Non hai i permessi necessari per accedere a questa sezione.
        </p>
        <Link href="/" className="text-sm font-ui text-terracotta hover:text-terracotta-light transition-colors">
          Torna alla home
        </Link>
      </div>
    </div>
  );
}
