/**
 * Firebase App Check with Cloudflare Turnstile (custom provider).
 *
 * Flow: an invisible Turnstile widget proves the visitor is a real browser on
 * our site. The push Worker (`POST /api/security/app-check-token`, see
 * workers/push/security.js) verifies that token with Cloudflare and returns an
 * App Check token. The Firebase SDK attaches it to every Firestore request.
 * Once enforcement is switched on in the Firebase console, scripts that only
 * carry the public API key can no longer read or write Firestore.
 *
 * Turnstile script sharing: the login pages use @marsidev/react-turnstile,
 * which injects the same api.js and waits for its own `onloadTurnstileCallback`.
 * The loader below injects the identical script tag, and wraps that callback so
 * the login widget still starts when its callback is assigned after the script
 * has already loaded.
 */
import type { FirebaseApp } from "firebase/app";
import { CustomProvider, initializeAppCheck, type AppCheck } from "firebase/app-check";
import { useEmulators } from "./firebaseConfig";

export const APP_CHECK_ACTION = "app-check";
export const TURNSTILE_SCRIPT_ID = "cf-turnstile-script";
export const TURNSTILE_ONLOAD = "onloadTurnstileCallback";
const TURNSTILE_SRC = `https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${TURNSTILE_ONLOAD}&render=explicit`;
const DEFAULT_TIMEOUT_MS = 30_000;

interface TurnstileApi {
  render: (element: HTMLElement, options: Record<string, unknown>) => string | undefined;
  remove: (widgetId: string) => void;
}

type AnyWindow = Window & Record<string, unknown>;
const win = (): AnyWindow => window as unknown as AnyWindow;
const loadedTurnstile = (): TurnstileApi | undefined => win().turnstile as TurnstileApi | undefined;

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export interface AppCheckEnv {
  MODE?: string;
  DEV?: boolean;
  PROD?: boolean;
  VITE_TURNSTILE_APPCHECK_SITE_KEY?: string;
  VITE_APPCHECK_DEBUG_TOKEN?: string;
  VITE_PUSH_API_BASE_URL?: string;
}

/** null = App Check stays off (tests, emulators, no site key, dev without debug token). */
export function appCheckSettings(env: AppCheckEnv, emulators: boolean): { siteKey: string; debugToken: string | null } | null {
  if (env.MODE === "test" || emulators) return null;
  const siteKey = env.VITE_TURNSTILE_APPCHECK_SITE_KEY?.trim();
  if (!siteKey) return null;
  if (env.DEV) {
    const debugToken = env.VITE_APPCHECK_DEBUG_TOKEN?.trim();
    return debugToken ? { siteKey, debugToken } : null;
  }
  return { siteKey, debugToken: null };
}

export function appCheckEndpoint(env: AppCheckEnv): string {
  const base = env.VITE_PUSH_API_BASE_URL ?? (env.PROD ? "https://koperasi-alumana.com" : "");
  return `${base}/api/security/app-check-token`;
}

// ---------------------------------------------------------------------------
// Turnstile loader
// ---------------------------------------------------------------------------

let loader: Promise<TurnstileApi> | null = null;
let shimInstalled = false;
const loadListeners = new Set<() => void>();

/**
 * Wrap `window.onloadTurnstileCallback`: api.js calls the wrapper, which notifies
 * our loader and whatever callback react-turnstile assigned. A callback assigned
 * after api.js has loaded is called right away, so the login widget never hangs.
 */
function installOnloadShim() {
  if (shimInstalled) return;
  shimInstalled = true;
  let assigned: unknown = win()[TURNSTILE_ONLOAD];
  const wrapper = () => {
    for (const listener of [...loadListeners]) listener();
    const callback = assigned;
    if (typeof callback === "function") callback();
  };
  Object.defineProperty(window, TURNSTILE_ONLOAD, {
    configurable: true,
    get: () => wrapper,
    set: (value: unknown) => {
      assigned = value;
      if (typeof value === "function" && loadedTurnstile()) {
        setTimeout(() => {
          if (assigned === value) (value as () => void)();
        }, 0);
      }
    },
  });
}

export function loadTurnstile(): Promise<TurnstileApi> {
  const ready = loadedTurnstile();
  if (ready) return Promise.resolve(ready);
  if (loader) return loader;

  installOnloadShim();
  loader = new Promise<TurnstileApi>((resolve, reject) => {
    const settle = () => {
      const api = loadedTurnstile();
      if (!api) return;
      loadListeners.delete(settle);
      resolve(api);
    };
    loadListeners.add(settle);

    let script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement("script");
      script.id = TURNSTILE_SCRIPT_ID;
      script.src = TURNSTILE_SRC;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }
    script.addEventListener("load", settle);
    script.addEventListener("error", () => {
      loadListeners.delete(settle);
      loader = null;
      reject(new Error("Turnstile script failed to load"));
    });
  });
  return loader;
}

/** For tests only: forget loader state. */
export function resetTurnstileLoaderForTests() {
  loader = null;
  loadListeners.clear();
  if (shimInstalled) delete win()[TURNSTILE_ONLOAD];
  shimInstalled = false;
}

/** Solve the invisible Turnstile widget once and return its token. */
export function getTurnstileToken(siteKey: string, timeoutMs = DEFAULT_TIMEOUT_MS): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const container = document.createElement("div");
    container.setAttribute("aria-hidden", "true");
    container.style.cssText = "position:fixed;left:-10000px;top:0;";
    let api: TurnstileApi | undefined;
    let widgetId: string | undefined;
    let done = false;

    const finish = (error: Error | null, token?: string) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try {
        if (api && widgetId !== undefined) api.remove(widgetId);
      } catch {
        // Widget already gone.
      }
      container.remove();
      if (error) reject(error);
      else resolve(token as string);
    };
    const timer = setTimeout(() => finish(new Error("Turnstile timeout")), timeoutMs);

    loadTurnstile()
      .then((loaded) => {
        if (done) return;
        api = loaded;
        document.body.appendChild(container);
        widgetId = loaded.render(container, {
          sitekey: siteKey,
          action: APP_CHECK_ACTION,
          retry: "never",
          "refresh-expired": "never",
          callback: (token: string) => finish(null, token),
          "error-callback": (code: string) => {
            finish(new Error(`Turnstile error ${code}`));
            return true;
          },
          "timeout-callback": () => finish(new Error("Turnstile timeout")),
        });
      })
      .catch((error: unknown) => finish(error instanceof Error ? error : new Error(String(error))));
  });
}

// ---------------------------------------------------------------------------
// App Check
// ---------------------------------------------------------------------------

interface FetchDeps {
  endpoint: string;
  getTurnstileToken: (siteKey: string) => Promise<string>;
  fetch: typeof fetch;
}

export async function fetchAppCheckToken(
  siteKey: string,
  deps: Partial<FetchDeps> = {},
): Promise<{ token: string; expireTimeMillis: number }> {
  const endpoint = deps.endpoint ?? appCheckEndpoint(import.meta.env);
  const solve = deps.getTurnstileToken ?? getTurnstileToken;
  const doFetch = deps.fetch ?? fetch;

  const turnstileToken = await solve(siteKey);
  const response = await doFetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ turnstileToken }),
  });
  if (!response.ok) throw new Error(`App Check token request failed (${response.status})`);
  const data = (await response.json()) as { token?: unknown; expireTimeMillis?: unknown };
  if (typeof data.token !== "string" || typeof data.expireTimeMillis !== "number") {
    throw new Error("App Check token response malformed");
  }
  return { token: data.token, expireTimeMillis: data.expireTimeMillis };
}

/** Start App Check on the main Firebase app. Call before any Firestore use. */
export function startAppCheck(app: FirebaseApp): AppCheck | null {
  if (typeof window === "undefined") return null;
  const settings = appCheckSettings(import.meta.env, useEmulators);
  if (!settings) return null;
  if (settings.debugToken) {
    (self as unknown as { FIREBASE_APPCHECK_DEBUG_TOKEN?: string }).FIREBASE_APPCHECK_DEBUG_TOKEN = settings.debugToken;
  }
  try {
    return initializeAppCheck(app, {
      provider: new CustomProvider({ getToken: () => fetchAppCheckToken(settings.siteKey) }),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (error) {
    console.warn("[appCheck] init failed", error);
    return null;
  }
}
