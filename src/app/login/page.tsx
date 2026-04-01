"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { ModusHoLogo } from "@/components/ui/modusho-logo";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
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

    setLoading(false);

    if (result?.error) {
      setError("Credenziali non valide");
      return;
    }

    // Hard redirect per evitare race condition tra push e refresh
    window.location.href = "/";
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <div className="mb-10">
        <ModusHoLogo size="lg" />
      </div>

      <div className="w-full max-w-[400px] bg-ivory-medium border border-ivory-dark p-10">
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

    </div>
  );
}
