/**
 * Lightweight typed fetch wrapper for the Go backend API.
 *
 * Responsibilities:
 *  - Inject a fresh Firebase ID token into the `Authorization` header.
 *  - Decode JSON responses into typed values.
 *  - Surface API error envelopes as typed `ApiError` instances.
 *  - Retry transient network failures with exponential backoff (≤ 3 tries).
 *
 * The base URL is read from the `VITE_API_BASE_URL` env var; if unset, the
 * client falls back to "/api" (i.e. assumes a Vite dev proxy or same-origin
 * deployment).
 */

import { getIdToken } from "@/services/authService";

const BASE_URL =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";

/** Field-level error from the backend's `error.details` array. */
export interface ApiFieldError {
  field: string;
  reason: string;
}

/** Canonical API error shape, parallel to the Go `common.ErrorResponse`. */
export interface ApiErrorBody {
  code: string;
  message: string;
  details?: ApiFieldError[];
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: ApiFieldError[];

  constructor(status: number, body: ApiErrorBody) {
    super(body.message);
    this.name = "ApiError";
    this.status = status;
    this.code = body.code;
    this.details = body.details;
  }
}

/** Options accepted by the typed request helpers. */
export interface RequestOptions extends Omit<RequestInit, "body"> {
  /** Parsed JSON body. Mutually exclusive with `rawBody`. */
  json?: unknown;
  /** Raw body — caller-managed Content-Type. */
  rawBody?: BodyInit;
  /** Maximum retry attempts for network errors. Default: 2 (3 tries total). */
  retries?: number;
}

/**
 * Issues a request and returns the parsed JSON body typed as `T`. Network
 * errors and 5xx responses are retried with exponential backoff; 4xx
 * responses are surfaced immediately as ApiError.
 */
export async function apiRequest<T = unknown>(
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const url = path.startsWith("http")
    ? path
    : `${BASE_URL}${path.startsWith("/") ? "" : "/"}${path}`;

  const headers = new Headers(opts.headers);
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined;
  if (opts.json !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.json);
  } else if (opts.rawBody !== undefined) {
    body = opts.rawBody;
  }

  const token = await getIdToken();
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const maxRetries = opts.retries ?? 2;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= maxRetries) {
    try {
      const res = await fetch(url, {
        ...opts,
        headers,
        body,
      });
      if (res.status >= 500 && attempt < maxRetries) {
        // 5xx — retryable
        attempt += 1;
        await delay(backoffMs(attempt));
        continue;
      }
      return await parseResponse<T>(res);
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        attempt += 1;
        await delay(backoffMs(attempt));
        continue;
      }
      throw err;
    }
  }
  // Should be unreachable; appease TS.
  throw lastError ?? new Error("apiRequest exhausted retries");
}

/** Convenience helpers for common HTTP verbs. */
export const api = {
  get: <T = unknown>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "GET" }),
  post: <T = unknown>(path: string, json?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "POST", json }),
  patch: <T = unknown>(path: string, json?: unknown, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "PATCH", json }),
  delete: <T = unknown>(path: string, opts?: RequestOptions) =>
    apiRequest<T>(path, { ...opts, method: "DELETE" }),
};

async function parseResponse<T>(res: Response): Promise<T> {
  const text = await res.text();

  if (!res.ok) {
    let body: ApiErrorBody = {
      code: "UNKNOWN_ERROR",
      message: text || res.statusText,
    };
    if (text) {
      try {
        const parsed = JSON.parse(text) as { error?: ApiErrorBody };
        if (parsed.error) body = parsed.error;
      } catch {
        // Non-JSON error body — keep the fallback.
      }
    }
    throw new ApiError(res.status, body);
  }

  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    // Some endpoints (e.g. download) return non-JSON; caller is responsible
    // for handling that case via `apiRequest` directly.
    return text as unknown as T;
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  // 200ms, 400ms, 800ms, ... capped at 3 seconds.
  return Math.min(200 * 2 ** (attempt - 1), 3_000);
}
