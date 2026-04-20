"use client";

import { CheckCircle2, Info, TriangleAlert, X } from "lucide-react";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useState
} from "react";

import { cn } from "@/lib/utils";

type ToastVariant = "success" | "info" | "warning";

type Toast = {
  id: string;
  title: string;
  description?: string;
  variant: ToastVariant;
};

type ToastContextValue = {
  notify: (toast: Omit<Toast, "id">) => void;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const icons = {
  success: CheckCircle2,
  info: Info,
  warning: TriangleAlert
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const notify = useCallback(
    (toast: Omit<Toast, "id">) => {
      const id = `toast-${crypto.randomUUID()}`;
      setToasts((current) => [{ ...toast, id }, ...current].slice(0, 3));
      window.setTimeout(() => dismiss(id), 4200);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="fixed right-4 top-4 z-50 flex w-[calc(100vw-2rem)] max-w-sm flex-col gap-3 sm:right-6">
        {toasts.map((toast) => {
          const Icon = icons[toast.variant];

          return (
            <div
              key={toast.id}
              className={cn(
                "rounded-lg border bg-white/95 p-4 shadow-luxury backdrop-blur",
                toast.variant === "success" && "border-emerald-200",
                toast.variant === "warning" && "border-citrine-200",
                toast.variant === "info" && "border-ink-200"
              )}
            >
              <div className="flex items-start gap-3">
                <Icon
                  className={cn(
                    "mt-0.5 size-5 shrink-0",
                    toast.variant === "success" && "text-emerald-600",
                    toast.variant === "warning" && "text-citrine-700",
                    toast.variant === "info" && "text-peacock-700"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-ink-900">{toast.title}</p>
                  {toast.description ? (
                    <p className="mt-1 text-sm leading-5 text-ink-600">{toast.description}</p>
                  ) : null}
                </div>
                <button
                  type="button"
                  aria-label="Dismiss notification"
                  className="rounded-md p-1 text-ink-400 transition hover:bg-ink-100 hover:text-ink-700"
                  onClick={() => dismiss(toast.id)}
                >
                  <X className="size-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const value = useContext(ToastContext);

  if (!value) {
    throw new Error("useToast must be used within ToastProvider");
  }

  return value;
}
