/**
 * Minimal toast notification system used across the Storefront and Admin
 * Panel. Built on top of `@radix-ui/react-toast` for accessibility, focus, and
 * keyboard handling, exposing a small context API tailored to this app's
 * needs.
 *
 * Usage:
 *   <ToastProvider>
 *     <App />
 *   </ToastProvider>
 *
 *   const { showToast } = useToast();
 *   showToast({ message: "Tersimpan", variant: "success" });
 */

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as RadixToast from "@radix-ui/react-toast";

/** Severity levels — drive default styling and ARIA `role`. */
export type ToastVariant = "info" | "success" | "error";

/** Public input accepted by `showToast`. */
export interface ToastInput {
  /** Message rendered in the toast body. */
  message: string;
  /** Optional title rendered above the message. */
  title?: string;
  /** Visual + a11y variant. Default `"info"`. */
  variant?: ToastVariant;
  /** Auto-dismiss duration in ms. Default 5000. */
  durationMs?: number;
}

/** Internal toast record stored in state. */
interface ToastRecord extends Required<Omit<ToastInput, "title">> {
  id: number;
  title?: string;
  open: boolean;
}

/** Public context API. */
export interface ToastContextValue {
  /** Show a toast and return its identifier. */
  showToast: (input: ToastInput) => number;
  /** Dismiss a toast by identifier (no-op if it has already disappeared). */
  dismissToast: (id: number) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const DEFAULT_DURATION_MS = 5_000;

export interface ToastProviderProps {
  children: ReactNode;
  /** Override the default 5-second dismissal timeout app-wide. */
  defaultDurationMs?: number;
}

/**
 * Provides toast state and renders Radix toast viewport. Place once near the
 * root of the React tree.
 */
export function ToastProvider({
  children,
  defaultDurationMs = DEFAULT_DURATION_MS,
}: ToastProviderProps) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);

  const showToast = useCallback(
    (input: ToastInput): number => {
      const id = nextId();
      const record: ToastRecord = {
        id,
        message: input.message,
        title: input.title,
        variant: input.variant ?? "info",
        durationMs: input.durationMs ?? defaultDurationMs,
        open: true,
      };
      setToasts((prev) => [...prev, record]);
      return id;
    },
    [defaultDurationMs]
  );

  const dismissToast = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, open: false } : t))
    );
  }, []);

  const removeToast = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const value = useMemo<ToastContextValue>(
    () => ({ showToast, dismissToast }),
    [showToast, dismissToast]
  );

  return (
    <ToastContext.Provider value={value}>
      <RadixToast.Provider swipeDirection="right">
        {children}
        {toasts.map((t) => (
          <RadixToast.Root
            key={t.id}
            open={t.open}
            duration={t.durationMs}
            onOpenChange={(open) => {
              if (!open) {
                // Mark closed first so the exit animation (if any) plays,
                // then drop the record on the next tick.
                dismissToast(t.id);
                window.setTimeout(() => removeToast(t.id), 200);
              }
            }}
            className={toastClassName(t.variant)}
            role={t.variant === "error" ? "alert" : "status"}
          >
            {t.title ? (
              <RadixToast.Title className="font-semibold">
                {t.title}
              </RadixToast.Title>
            ) : null}
            <RadixToast.Description>{t.message}</RadixToast.Description>
          </RadixToast.Root>
        ))}
        <RadixToast.Viewport className="fixed bottom-4 right-4 z-50 flex max-w-sm flex-col gap-2 outline-none" />
      </RadixToast.Provider>
    </ToastContext.Provider>
  );
}

/** Hook returning the toast API. Throws when used outside a `<ToastProvider>`. */
// eslint-disable-next-line react-refresh/only-export-components
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within a <ToastProvider>");
  }
  return ctx;
}

let _toastIdCounter = 0;
function nextId(): number {
  _toastIdCounter += 1;
  return _toastIdCounter;
}

function toastClassName(variant: ToastVariant): string {
  const base =
    "rounded-lg px-4 py-3 shadow-lg text-sm leading-snug border outline-none";
  switch (variant) {
    case "success":
      return `${base} bg-emerald-50 border-emerald-200 text-emerald-900`;
    case "error":
      return `${base} bg-red-50 border-red-200 text-red-900`;
    case "info":
    default:
      return `${base} bg-white border-gray-200 text-gray-900`;
  }
}
