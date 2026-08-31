"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";
import {
  SESSION_EXPIRED_PARAM,
  SESSION_EXPIRED_VALUE,
  SESSION_EXPIRED_MESSAGE,
} from "@/lib/session-expiry";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const authError = searchParams.get("error");
  // Chi arriva qui per una sessione decaduta merita il motivo, non un modulo muto.
  const sessioneScaduta =
    searchParams.get(SESSION_EXPIRED_PARAM) === SESSION_EXPIRED_VALUE;

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(authError ? "Credenziali non valide" : "");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    const result = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    if (result?.error) {
      setLoading(false);
      // "CredentialsSignin" è il codice generico che NextAuth assegna quando
      // authorize() restituisce null (email o password sbagliate): lì il
      // messaggio resta neutro, non deve mai far capire se l'indirizzo è
      // registrato o no. Qualsiasi altro testo arriva da un throw esplicito
      // in authorize() — un blocco per troppi tentativi — ed è già scritto
      // per essere mostrato così com'è: parla di tentativi e minuti, mai
      // dell'account.
      setError(
        result.error === "CredentialsSignin" ? "Credenziali non valide" : result.error
      );
    } else {
      window.location.href = callbackUrl;
    }
  }

  return (
    <div className="w-full max-w-[400px] bg-ivory-medium border border-ivory-dark p-8 sm:p-10">
      {sessioneScaduta && (
        <p
          role="status"
          className="mb-5 text-sm font-ui leading-relaxed text-[#E65100] bg-[#FFF3E0] border-l-2 border-[#E65100] px-3 py-2.5"
        >
          {SESSION_EXPIRED_MESSAGE}
        </p>
      )}
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-ui font-medium text-charcoal mb-1.5">
            Email
          </label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="w-full"
          />
          <p className="mt-1 text-xs font-ui text-charcoal/50">
            L&apos;indirizzo a cui è arrivato il tuo invito.
          </p>
        </div>
        <div>
          <label htmlFor="password" className="block text-sm font-ui font-medium text-charcoal mb-1.5">
            Password
          </label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
            className="w-full"
          />
        </div>
        {error && (
          <p className="text-sm text-alert-red">{error}</p>
        )}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {loading ? "Accesso in corso..." : "Accedi"}
        </button>
      </form>

      <div className="mt-5 text-center">
        <Link
          href="/password-dimenticata"
          className="text-[12px] font-ui text-terracotta hover:text-terracotta-light transition-colors"
        >
          Password dimenticata?
        </Link>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <div className="mb-10 text-center">
        <h1 className="font-heading text-[34px] font-medium tracking-[0.15em] text-terracotta">ModusHO</h1>
        <p className="mt-3 font-ui text-xs uppercase tracking-[0.35em] text-charcoal/45">where standards become action</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
