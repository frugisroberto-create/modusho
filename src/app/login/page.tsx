"use client";

import { Suspense, useState } from "react";
import { signIn } from "next-auth/react";
import { useSearchParams } from "next/navigation";

function LoginForm() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get("callbackUrl") || "/";
  const authError = searchParams.get("error");

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
      setError("Credenziali non valide");
    } else {
      window.location.href = callbackUrl;
    }
  }

  return (
    <div className="w-full max-w-[400px] bg-ivory-medium border border-ivory-dark p-8 sm:p-10">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="email" className="block text-sm font-ui font-medium text-charcoal mb-1.5">
            Nome utente
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
    </div>
  );
}

export default function LoginPage() {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <div className="mb-10 text-center">
        <h1 className="font-heading text-5xl font-medium tracking-[0.15em] text-terracotta">ModusHO</h1>
        <p className="mt-3 font-ui text-xs uppercase tracking-[0.35em] text-charcoal/45">where standards become action</p>
      </div>
      <Suspense>
        <LoginForm />
      </Suspense>
    </div>
  );
}
