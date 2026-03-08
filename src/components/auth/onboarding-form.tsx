"use client";

import { ShieldCheck, ServerCog } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getInstanceDefinition, INSTANCE_TYPE_VALUES, type InstanceType } from "@/lib/instances/definitions";

export function OnboardingForm({
  canSubmit,
  configurationMessage,
}: {
  canSubmit: boolean;
  configurationMessage?: string;
}) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [addFirstInstance, setAddFirstInstance] = useState(false);
  const [instanceName, setInstanceName] = useState("");
  const [instanceType, setInstanceType] = useState<InstanceType>("sonarr");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!canSubmit) {
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setIsSubmitting(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/setup", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username,
          password,
          firstInstance: addFirstInstance
            ? {
                name: instanceName,
                type: instanceType,
                baseUrl,
                apiKey,
              }
            : undefined,
        }),
      });

      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to complete onboarding");
      }

      window.location.assign("/dashboard");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to complete onboarding");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-6xl items-center">
      <div className="grid w-full gap-8 lg:grid-cols-[1.05fr_0.95fr]">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-cyan-300/20 bg-cyan-400/10 px-4 py-2 text-xs font-medium uppercase tracking-[0.2em] text-cyan-100">
            <ShieldCheck className="h-4 w-4" />
            First Run
          </div>
          <div className="space-y-4">
            <p className="app-eyebrow">Onboarding</p>
            <h1 className="max-w-2xl text-4xl font-semibold text-white sm:text-5xl">
              Lock down ArrMate before the dashboard comes online.
            </h1>
            <p className="max-w-2xl text-base leading-7 text-slate-300">
              The first launch now requires an administrator account. You can also attach your first Sonarr,
              Radarr, or Overseerr instance here and land directly in a usable dashboard.
            </p>
          </div>
        </section>

        <section className="app-panel-strong p-6 sm:p-8">
          <div className="mb-6">
            <p className="app-eyebrow">Setup</p>
            <h2 className="mt-2 text-2xl font-semibold text-white">Create the administrator account</h2>
            <p className="mt-2 text-sm text-slate-400">
              This only runs once. You can add more instances after sign-in.
            </p>
          </div>

          {!canSubmit ? (
            <div className="mb-4 rounded-[var(--radius-panel)] border border-amber-300/20 bg-amber-400/10 p-4 text-sm text-amber-100">
              {configurationMessage ?? "Onboarding is unavailable until required environment variables are set."}
            </div>
          ) : null}

          <form className="space-y-5" onSubmit={handleSubmit}>
            <label className="block space-y-2">
              <span className="app-control-label">Username</span>
              <Input
                autoComplete="username"
                value={username}
                onChange={(event) => setUsername(event.target.value)}
                disabled={!canSubmit || isSubmitting}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="app-control-label">Password</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!canSubmit || isSubmitting}
                required
              />
            </label>

            <label className="block space-y-2">
              <span className="app-control-label">Confirm password</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                disabled={!canSubmit || isSubmitting}
                required
              />
            </label>

            <div className="rounded-[var(--radius-panel)] border border-white/10 bg-white/5 p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-sm font-medium text-white">
                    <ServerCog className="h-4 w-4 text-cyan-200" />
                    Add the first instance now
                  </div>
                  <p className="text-sm text-slate-400">
                    Optional. Skip this if you only want to create the admin account first.
                  </p>
                </div>
                <Switch
                  checked={addFirstInstance}
                  onCheckedChange={setAddFirstInstance}
                  disabled={!canSubmit || isSubmitting}
                />
              </div>

              {addFirstInstance ? (
                <div className="mt-4 space-y-4 border-t border-white/10 pt-4">
                  <label className="block space-y-2">
                    <span className="app-control-label">Instance name</span>
                    <Input
                      value={instanceName}
                      onChange={(event) => setInstanceName(event.target.value)}
                      disabled={!canSubmit || isSubmitting}
                      placeholder={getInstanceDefinition(instanceType).defaultName}
                      required={addFirstInstance}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="app-control-label">Type</span>
                    <Select
                      value={instanceType}
                      onValueChange={(value) => setInstanceType(value as InstanceType)}
                      disabled={!canSubmit || isSubmitting}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {INSTANCE_TYPE_VALUES.map((value) => (
                          <SelectItem key={value} value={value}>
                            {getInstanceDefinition(value).label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </label>

                  <label className="block space-y-2">
                    <span className="app-control-label">Base URL</span>
                    <Input
                      value={baseUrl}
                      onChange={(event) => setBaseUrl(event.target.value)}
                      disabled={!canSubmit || isSubmitting}
                      placeholder={getInstanceDefinition(instanceType).baseUrlPlaceholder}
                      required={addFirstInstance}
                    />
                  </label>

                  <label className="block space-y-2">
                    <span className="app-control-label">API key</span>
                    <Input
                      type="password"
                      value={apiKey}
                      onChange={(event) => setApiKey(event.target.value)}
                      disabled={!canSubmit || isSubmitting}
                      placeholder="Paste the instance API key"
                      required={addFirstInstance}
                    />
                  </label>
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="rounded-[var(--radius-control)] border border-rose-300/20 bg-rose-400/10 px-4 py-3 text-sm text-rose-100">
                {error}
              </div>
            ) : null}

            <Button type="submit" className="w-full" disabled={!canSubmit || isSubmitting}>
              {isSubmitting ? "Saving setup..." : "Finish setup"}
            </Button>
          </form>
        </section>
      </div>
    </div>
  );
}
