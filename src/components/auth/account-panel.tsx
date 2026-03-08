"use client";

import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { KeyRound, LockKeyhole } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { LogoutButton } from "@/components/auth/logout-button";

interface AccountResponse {
  username: string;
}

export function AccountPanel() {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  function resetForm() {
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  }

  const accountQuery = useQuery<AccountResponse>({
    queryKey: ["auth-account"],
    queryFn: async () => {
      const response = await fetch("/api/auth/account");

      if (!response.ok) {
        throw new Error("Failed to load account details");
      }

      const payload = await response.json() as { data: AccountResponse };
      return payload.data;
    },
  });

  const changePasswordMutation = useMutation({
    mutationFn: async () => {
      const response = await fetch("/api/auth/account", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          currentPassword,
          newPassword,
        }),
      });

      const payload = await response.json() as { error?: string };

      if (!response.ok) {
        throw new Error(payload.error ?? "Failed to change password");
      }
    },
    onSuccess: () => {
      toast({
        title: "Password updated",
        description: "The administrator password was changed successfully.",
        variant: "success",
      });
      setOpen(false);
      resetForm();
    },
    onError: (err) => {
      toast({
        title: "Password update failed",
        description: err instanceof Error ? err.message : "Failed to change password",
        variant: "error",
      });
    },
  });

  const username = accountQuery.data?.username ?? "Administrator";
  const subtitle = accountQuery.isLoading
    ? "Loading account"
    : accountQuery.isError
      ? "Authenticated session"
      : `Username: ${username}`;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (newPassword !== confirmPassword) {
      toast({
        title: "Passwords do not match",
        description: "Enter the same new password in both fields.",
        variant: "error",
      });
      return;
    }

    changePasswordMutation.mutate();
  }

  return (
    <>
      <div className="app-panel-muted mt-4 space-y-3 px-3 py-3">
        <div className="flex items-center gap-3 px-1">
          <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/20 bg-cyan-300/10 text-cyan-200">
            <LockKeyhole className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-white">Administrator</p>
            <p className="truncate text-xs text-slate-400">{subtitle}</p>
          </div>
        </div>
        <Button variant="ghost" size="sm" className="w-full justify-start" onClick={() => setOpen(true)}>
          <KeyRound className="h-4 w-4" />
          Change password
        </Button>
        <LogoutButton />
      </div>

      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          setOpen(nextOpen);
          if (!nextOpen) {
            resetForm();
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change Password</DialogTitle>
            <DialogDescription>
              Update the password for <span className="font-medium text-slate-200">{username}</span>.
            </DialogDescription>
          </DialogHeader>

          <form className="space-y-4" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <span className="app-control-label">Current password</span>
              <Input
                type="password"
                autoComplete="current-password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                required
              />
            </div>

            <div className="space-y-2">
              <span className="app-control-label">New password</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={newPassword}
                onChange={(event) => setNewPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="space-y-2">
              <span className="app-control-label">Confirm new password</span>
              <Input
                type="password"
                autoComplete="new-password"
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                minLength={8}
                required
              />
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
                disabled={changePasswordMutation.isPending}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={changePasswordMutation.isPending}>
                {changePasswordMutation.isPending ? "Saving..." : "Save password"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
