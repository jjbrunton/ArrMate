"use client";

import { useState } from "react";
import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export function LoginForm({
  configured,
  configurationMessage,
}: {
  configured: boolean;
  configurationMessage?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!configured) {
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to sign in");
      }

      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to sign in");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-5xl items-center">
      <div className="grid w-full gap-8 lg:grid-cols-[1.1fr_0.9fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-100">
            <ShieldCheck className="h-4 w-4" />
            Protected Mode
          </div>
          <div className="space-y-4">
            <p className="app-eyebrow">Administrator Access</p>
            <h1 className="max-w-xl text-4xl font-semibold text-white sm:text-5xl">
              Sign in before ArrMate touches your Arr stack.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              All dashboard pages and API routes are gated behind server-side sessions, origin checks,
              and brute-force throttling. Keep this app behind HTTPS and use a strong generated password hash.
            </p>
          </div>
        </section>

        <section className="app-panel-strong p-6 sm:p-8">
          <div className="mb-6">
            <p className="app-eyebrow">Login</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Administrator sign in</h2>
            <p className="mt-2 text-sm text-slate-400">
              Use the administrator credentials created during onboarding.
            </p>
          </div>

          {!configured ? (
            <div className="rounded-[var(--radius-panel)] border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              {configurationMessage ?? "Authentication is not configured."}
            </div>
          ) : null}

          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="app-control-label">Username</span>
              <Input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={!configured || isSubmitting}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="app-control-label">Password</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!configured || isSubmitting}
                required
              />
            </label>

            {error ? (
              <div className="rounded-[var(--radius-control)] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={!configured || isSubmitting}>
              {isSubmitting ? "Signing in..." : "Sign in"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
