"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/toast";
import { getInstanceDefinition, INSTANCE_TYPE_VALUES, type InstanceType } from "@/lib/instances/definitions";
import { ConnectionTest } from "./connection-test";

interface InstanceFormProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  instance?: {
    id: number;
    name: string;
    type: InstanceType;
    baseUrl: string;
    pollIntervalSeconds: number;
    qualityCheckMaxItems: number;
    requestSyncIntervalSeconds: number | null;
  };
}

export function InstanceForm({ open, onOpenChange, instance }: InstanceFormProps) {
  const isEditing = !!instance;
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [name, setName] = useState(instance?.name ?? "");
  const [type, setType] = useState<InstanceType>(instance?.type ?? "sonarr");
  const [baseUrl, setBaseUrl] = useState(instance?.baseUrl ?? "");
  const [apiKey, setApiKey] = useState("");
  const [pollInterval, setPollInterval] = useState(
    String((instance?.pollIntervalSeconds ?? 300) / 60),
  );
  const [qualityCheckMaxItems, setQualityCheckMaxItems] = useState(
    String(instance?.qualityCheckMaxItems ?? 50),
  );
  const [requestSyncInterval, setRequestSyncInterval] = useState(
    String(((instance?.requestSyncIntervalSeconds ?? 300) || 300) / 60),
  );
  const definition = getInstanceDefinition(type);

  const mutation = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = {
        name,
        type,
        baseUrl: baseUrl.replace(/\/+$/, ""),
      };
      if (definition.supportsQueue) {
        body.pollIntervalSeconds = Number(pollInterval) * 60;
        body.qualityCheckMaxItems = Number(qualityCheckMaxItems);
      }
      if (definition.supportsRequestSync) {
        body.requestSyncIntervalSeconds = Number(requestSyncInterval) * 60;
      }
      if (apiKey || !isEditing) body.apiKey = apiKey;

      const url = isEditing ? `/api/instances/${instance.id}` : "/api/instances";
      const method = isEditing ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to save instance");
      return json.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["instances"] });
      toast({ title: isEditing ? "Instance updated" : "Instance added", variant: "success" });
      onOpenChange(false);
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "error" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Instance" : "Add Instance"}</DialogTitle>
          <DialogDescription>
            {isEditing
              ? `Update your ${getInstanceDefinition(instance?.type ?? type).label} instance configuration.`
              : "Connect a new Sonarr, Radarr, or Overseerr instance."}
          </DialogDescription>
        </DialogHeader>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            mutation.mutate();
          }}
          className="space-y-5"
        >
          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder={definition.defaultName}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Type</label>
            <Select value={type} onValueChange={(value) => setType(value as InstanceType)} disabled={isEditing}>
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
            {isEditing ? (
              <p className="mt-2 text-xs text-slate-500">Instance type cannot be changed after creation.</p>
            ) : null}
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">Base URL</label>
            <Input
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder={definition.baseUrlPlaceholder}
              required
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-slate-200">
              API Key {isEditing && "(leave blank to keep current)"}
            </label>
            <Input
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter API key"
              type="password"
              required={!isEditing}
            />
          </div>

          {definition.supportsQueue ? (
            <>
              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Poll Interval (minutes)</label>
                <Input
                  type="number"
                  value={pollInterval}
                  onChange={(e) => setPollInterval(e.target.value)}
                  min="1"
                  max="1440"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-medium text-slate-200">Quality Checks Per Run</label>
                <Input
                  type="number"
                  value={qualityCheckMaxItems}
                  onChange={(e) => setQualityCheckMaxItems(e.target.value)}
                  min="1"
                  max="500"
                />
              </div>
            </>
          ) : null}

          {definition.supportsRequestSync ? (
            <div>
              <label className="mb-2 block text-sm font-medium text-slate-200">Request Sync Interval (minutes)</label>
              <Input
                type="number"
                value={requestSyncInterval}
                onChange={(e) => setRequestSyncInterval(e.target.value)}
                min="1"
                max="1440"
              />
            </div>
          ) : null}

          <ConnectionTest type={type} baseUrl={baseUrl} apiKey={apiKey} />

          <div className="flex justify-end gap-2 border-t border-white/10 pt-4">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving..." : isEditing ? "Update" : "Add Instance"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
