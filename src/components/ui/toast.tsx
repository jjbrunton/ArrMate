"use client";

import * as ToastPrimitive from "@radix-ui/react-toast";
import { X } from "lucide-react";
import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { cn } from "@/lib/utils/cn";

interface Toast {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error";
}

interface ToastContextValue {
  toast: (t: Omit<Toast, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ toast: () => {} });

export function useToast() {
  return useContext(ToastContext);
}

export function Toaster({ children }: { children?: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 5000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <ToastPrimitive.Provider>
        {toasts.map((t) => (
          <ToastPrimitive.Root
            key={t.id}
            className={cn(
              "app-panel flex rounded-[1.15rem] border p-4 shadow-[0_18px_40px_rgba(2,6,23,0.42)]",
              t.variant === "error"
                ? "border-rose-300/15 bg-rose-500/10 text-rose-100"
                : t.variant === "success"
                  ? "border-emerald-300/15 bg-emerald-500/10 text-emerald-100"
                  : "border-cyan-300/15 bg-slate-950/95 text-slate-100",
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <ToastPrimitive.Title className="text-sm font-medium">{t.title}</ToastPrimitive.Title>
                {t.description && (
                  <ToastPrimitive.Description className="mt-1 text-xs text-current/75">
                    {t.description}
                  </ToastPrimitive.Description>
                )}
              </div>
              <ToastPrimitive.Close className="rounded-full border border-white/10 bg-white/5 p-1 text-current opacity-60 hover:opacity-100">
                <X className="h-4 w-4" />
              </ToastPrimitive.Close>
            </div>
          </ToastPrimitive.Root>
        ))}
        <ToastPrimitive.Viewport className="fixed bottom-24 right-4 z-[100] flex max-w-md flex-col gap-2 md:bottom-4" />
      </ToastPrimitive.Provider>
    </ToastContext.Provider>
  );
}
