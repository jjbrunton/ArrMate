"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { CheckCircle, XCircle, Loader2 } from "lucide-react";

import type { InstanceType } from "@/lib/instances/definitions";

interface ConnectionTestProps {
  type: InstanceType;
  baseUrl: string;
  apiKey: string;
}

export function ConnectionTest({ type, baseUrl, apiKey }: ConnectionTestProps) {
  const [status, setStatus] = useState<"idle" | "testing" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function test() {
    if (!baseUrl || !apiKey) {
      setStatus("error");
      setMessage("URL and API key are required");
      return;
    }

    setStatus("testing");
    try {
      const res = await fetch("/api/instances/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, baseUrl: baseUrl.replace(/\/+$/, ""), apiKey }),
      });
      const json = await res.json();
      if (res.ok) {
        setStatus("success");
        setMessage(`Connected to ${json.data.appName} v${json.data.version}`);
      } else {
        setStatus("error");
        setMessage(json.error || "Connection failed");
      }
    } catch {
      setStatus("error");
      setMessage("Connection failed");
    }
  }

  return (
    <div className="app-panel-muted flex flex-col gap-3 rounded-[1rem] p-4 sm:flex-row sm:items-center">
      <Button type="button" variant="outline" size="sm" onClick={test} disabled={status === "testing"}>
        {status === "testing" ? (
          <>
            <Loader2 className="h-3 w-3 animate-spin" />
            Testing...
          </>
        ) : (
          "Test Connection"
        )}
      </Button>
      {status === "success" && (
        <span className="flex items-center gap-1 text-sm text-emerald-200">
          <CheckCircle className="h-4 w-4" />
          {message}
        </span>
      )}
      {status === "error" && (
        <span className="flex items-center gap-1 text-sm text-rose-200">
          <XCircle className="h-4 w-4" />
          {message}
        </span>
      )}
    </div>
  );
}
