"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { X, CircleCheck, CircleAlert, Info } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * App-wide transient-message infrastructure (Slice: reusable toast
 * infrastructure). Deliberately just presentation + a generic `showToast`
 * API — nothing here knows about any specific feature (received shares,
 * save confirmations, etc.); each caller decides *whether* a toast is
 * warranted and supplies its own copy. Mounted once, at the root layout, so
 * any route (marketing or authenticated app) can call `useToast()`.
 */

export type ToastVariant = "default" | "success" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type ToastOptions = {
  id?: string;
  title: string;
  description?: string;
  variant?: ToastVariant;
  action?: ToastAction;
  // `null` disables auto-dismiss — for a toast whose only reasonable
  // dismissal is the user acting on it (e.g. the received-share notice,
  // which is dismissed explicitly, not on a timer). Defaults to 6s.
  durationMs?: number | null;
  // Fires exactly once, whenever this toast leaves the screen for any
  // reason (explicit close, the action link, or the auto-dismiss timer) —
  // the one hook a caller needs to persist "the user has seen this," kept
  // out of the presentation layer itself (see the module doc comment).
  onDismiss?: () => void;
};

type ToastEntry = Required<Pick<ToastOptions, "id" | "title">> &
  Omit<ToastOptions, "id" | "title">;

type ToastContextValue = {
  toasts: ToastEntry[];
  showToast: (options: ToastOptions) => string;
  dismissToast: (id: string) => void;
};

const ToastContext = React.createContext<ToastContextValue | undefined>(
  undefined,
);

const DEFAULT_DURATION_MS = 6000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = React.useState<ToastEntry[]>([]);
  const nextId = React.useRef(0);
  // Mirrors `toasts` for `dismissToast`'s imperative lookup — reading state
  // via a ref (not `toasts` itself, which would need to be a dependency)
  // keeps `dismissToast`'s identity stable and its side effect (firing
  // `onDismiss`) out of the `setToasts` updater, which React may otherwise
  // invoke more than once per commit.
  const toastsRef = React.useRef<ToastEntry[]>([]);
  React.useEffect(() => {
    toastsRef.current = toasts;
  }, [toasts]);

  const dismissToast = React.useCallback((id: string) => {
    const toast = toastsRef.current.find((entry) => entry.id === id);
    if (toast) {
      toastsRef.current = toastsRef.current.filter((entry) => entry.id !== id);
      toast.onDismiss?.();
    }
    setToasts((prev) => prev.filter((entry) => entry.id !== id));
  }, []);

  const showToast = React.useCallback(
    (options: ToastOptions) => {
      const id = options.id ?? `toast-${++nextId.current}`;
      setToasts((prev) => [
        ...prev.filter((toast) => toast.id !== id),
        { ...options, id },
      ]);
      const duration =
        options.durationMs === undefined
          ? DEFAULT_DURATION_MS
          : options.durationMs;
      if (duration !== null) {
        setTimeout(() => dismissToast(id), duration);
      }
      return id;
    },
    [dismissToast],
  );

  const value = React.useMemo(
    () => ({ toasts, showToast, dismissToast }),
    [toasts, showToast, dismissToast],
  );

  return (
    <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
  );
}

export function useToast(): ToastContextValue {
  const context = React.useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

const VARIANT_ICON: Record<ToastVariant, React.ComponentType<{ className?: string }>> = {
  default: Info,
  success: CircleCheck,
  error: CircleAlert,
};

const VARIANT_ICON_CLASS: Record<ToastVariant, string> = {
  default: "text-muted-foreground",
  success: "text-primary",
  error: "text-destructive-text",
};

/** Renders the live toast stack via a portal so it always sits above route
 * content regardless of where in the tree `ToastProvider` was mounted. */
export function Toaster() {
  const { toasts, dismissToast } = useToast();
  const [mounted, setMounted] = React.useState(false);
  React.useEffect(() => setMounted(true), []);
  if (!mounted || toasts.length === 0) return null;

  return createPortal(
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-4 sm:inset-x-auto sm:right-0 sm:items-end"
      role="region"
      aria-label="Notifications"
    >
      {toasts.map((toast) => {
        const variant = toast.variant ?? "default";
        const Icon = VARIANT_ICON[variant];
        return (
          <div
            key={toast.id}
            role="status"
            className="border-border bg-card text-foreground pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-lg border p-3 shadow-lg"
          >
            <Icon
              className={cn("mt-0.5 size-4 shrink-0", VARIANT_ICON_CLASS[variant])}
              aria-hidden="true"
            />
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-sm font-medium">{toast.title}</p>
              {toast.description && (
                <p className="text-muted-foreground text-sm">
                  {toast.description}
                </p>
              )}
              {toast.action && (
                <button
                  type="button"
                  onClick={toast.action.onClick}
                  className="text-primary text-sm font-medium underline-offset-4 hover:underline"
                >
                  {toast.action.label}
                </button>
              )}
            </div>
            <button
              type="button"
              onClick={() => dismissToast(toast.id)}
              aria-label="Dismiss notification"
              className="text-muted-foreground hover:text-foreground -m-1 shrink-0 rounded-md p-1"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>,
    document.body,
  );
}
