"use client";

export default function Error({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <h1 className="font-heading text-6xl font-medium text-alert-red mb-4">Errore</h1>
      <p className="font-ui text-lg text-charcoal mb-8">Si è verificato un problema. Riprova.</p>
      <button onClick={reset} className="btn-primary">
        Riprova
      </button>
    </div>
  );
}
