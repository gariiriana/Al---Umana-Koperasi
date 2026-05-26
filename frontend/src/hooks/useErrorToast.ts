/**
 * `useErrorToast` returns a stable callback that converts a backend error
 * response (or any thrown value) into a Bahasa Indonesian toast.
 *
 * Translation lookup goes through `frontend/src/constants/errorMessages.ts`,
 * keeping a single source of truth for user-facing copy.
 */

import { useCallback } from "react";

import { ApiError } from "@/services/apiClient";
import { errorMessage } from "@/constants/errorMessages";
import { useToast } from "@/contexts/ToastContext";

/** Subset of fields the hook reads from a backend error envelope. */
export interface BackendErrorLike {
  /** Canonical error code (e.g. `"INVALID_PAYMENT_METHOD"`). */
  code?: string | null;
  /** Optional server-provided message; ignored unless the code is unknown. */
  message?: string | null;
}

/** Options accepted by the callback returned from `useErrorToast`. */
export interface ShowErrorOptions {
  /** Optional toast title; defaults to `"Terjadi Kesalahan"`. */
  title?: string;
  /** Override the auto-dismiss duration in ms. */
  durationMs?: number;
}

const DEFAULT_TITLE = "Terjadi Kesalahan";

/**
 * Returns `showError(error, opts?)`. The error may be:
 * - an `ApiError` thrown by the API client,
 * - a plain object with `{ code, message }` matching the backend envelope,
 * - any other thrown value (handled with the generic fallback).
 */
export function useErrorToast(): (
  error: unknown,
  opts?: ShowErrorOptions
) => number {
  const { showToast } = useToast();

  return useCallback(
    (error: unknown, opts?: ShowErrorOptions) => {
      const { code, fallbackMessage } = extractErrorParts(error);
      const message = code
        ? errorMessage(code)
        : fallbackMessage ?? errorMessage(undefined);

      return showToast({
        title: opts?.title ?? DEFAULT_TITLE,
        message,
        variant: "error",
        durationMs: opts?.durationMs,
      });
    },
    [showToast]
  );
}

interface ErrorParts {
  code?: string;
  fallbackMessage?: string;
}

function extractErrorParts(error: unknown): ErrorParts {
  if (error instanceof ApiError) {
    return { code: error.code, fallbackMessage: error.message };
  }
  if (isBackendErrorLike(error)) {
    return {
      code: error.code ?? undefined,
      fallbackMessage: error.message ?? undefined,
    };
  }
  if (error instanceof Error) {
    return { fallbackMessage: error.message };
  }
  return {};
}

function isBackendErrorLike(value: unknown): value is BackendErrorLike {
  return (
    typeof value === "object" &&
    value !== null &&
    ("code" in value || "message" in value)
  );
}
