"use client";

import { signIn } from "next-auth/react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { DomusGoLogo } from "@/components/ui/domusgo-logo";

export default function LoginPage() {
  const router = useRouter();
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

    router.push("/");
    router.refresh();
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-ivory px-4">
      <div className="mb-10">
        <DomusGoLogo size="lg" />
      </div>

      <div className="w-full max-w-[400px] bg-ivory-medium border border-ivory-dark rounded-xl p-10">
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
            className="w-full py-3.5 bg-terracotta text-white rounded-md hover:bg-terracotta-light font-ui font-semibold text-sm tracking-wide disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? "Accesso in corso..." : "Accedi"}
          </button>
        </form>
      </div>

    </div>
  );
}
