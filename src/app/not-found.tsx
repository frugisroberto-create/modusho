import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <h1 className="font-heading text-6xl font-medium text-terracotta mb-4">404</h1>
      <p className="font-ui text-lg text-charcoal mb-8">Pagina non trovata</p>
      <Link href="/" className="btn-primary">
        Torna alla home
      </Link>
    </div>
  );
}
