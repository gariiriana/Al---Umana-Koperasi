import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  APP_CHECK_ACTION,
  TURNSTILE_ONLOAD,
  TURNSTILE_SCRIPT_ID,
  appCheckEndpoint,
  appCheckSettings,
  fetchAppCheckToken,
  getTurnstileToken,
  loadTurnstile,
  resetTurnstileLoaderForTests,
} from "@/lib/appCheck";

const win = window as unknown as Record<string, unknown>;

/** Simulate api.js finishing: define window.turnstile, then call the onload callback like Cloudflare does. */
function finishScriptLoad(turnstile: unknown = fakeTurnstile()) {
  win.turnstile = turnstile;
  const cb = win[TURNSTILE_ONLOAD];
  if (typeof cb === "function") cb();
}

function fakeTurnstile(behaviour: "ok" | "error" | "silent" = "ok") {
  return {
    render: vi.fn((_el: HTMLElement, opts: Record<string, (v?: string) => void>) => {
      if (behaviour === "ok") setTimeout(() => opts.callback("turnstile-token"), 0);
      if (behaviour === "error") setTimeout(() => opts["error-callback"]("110200"), 0);
      return "widget-1";
    }),
    remove: vi.fn(),
  };
}

/** Mimics @marsidev/react-turnstile: assigns the onload callback once and waits for it. */
function reactTurnstileWaitsForLoad(): Promise<void> {
  return new Promise((resolve) => {
    win[TURNSTILE_ONLOAD] = () => {
      resolve();
      delete win[TURNSTILE_ONLOAD];
    };
  });
}

beforeEach(() => {
  resetTurnstileLoaderForTests();
  document.getElementById(TURNSTILE_SCRIPT_ID)?.remove();
  delete win.turnstile;
  delete win[TURNSTILE_ONLOAD];
});
afterEach(() => vi.useRealTimers());

describe("appCheckSettings", () => {
  const base = { MODE: "production", DEV: false, PROD: true } as const;

  it("is off in tests, in emulator mode and without a site key", () => {
    expect(appCheckSettings({ ...base, MODE: "test", VITE_TURNSTILE_APPCHECK_SITE_KEY: "k" }, false)).toBeNull();
    expect(appCheckSettings({ ...base, VITE_TURNSTILE_APPCHECK_SITE_KEY: "k" }, true)).toBeNull();
    expect(appCheckSettings({ ...base }, false)).toBeNull();
  });

  it("uses Turnstile in production", () => {
    expect(appCheckSettings({ ...base, VITE_TURNSTILE_APPCHECK_SITE_KEY: "0xKEY" }, false))
      .toEqual({ siteKey: "0xKEY", debugToken: null });
  });

  it("dev mode only runs with a registered debug token", () => {
    const dev = { MODE: "development", DEV: true, PROD: false, VITE_TURNSTILE_APPCHECK_SITE_KEY: "k" };
    expect(appCheckSettings(dev, false)).toBeNull();
    expect(appCheckSettings({ ...dev, VITE_APPCHECK_DEBUG_TOKEN: "dbg" }, false)).toEqual({ siteKey: "k", debugToken: "dbg" });
  });
});

describe("appCheckEndpoint", () => {
  it("defaults to the live domain in production and relative in dev", () => {
    expect(appCheckEndpoint({ PROD: true })).toBe("https://koperasi-alumana.com/api/security/app-check-token");
    expect(appCheckEndpoint({ PROD: false })).toBe("/api/security/app-check-token");
    expect(appCheckEndpoint({ PROD: true, VITE_PUSH_API_BASE_URL: "https://x.test" })).toBe("https://x.test/api/security/app-check-token");
  });
});

describe("loadTurnstile", () => {
  it("injects the same script react-turnstile uses and resolves on load", async () => {
    const loading = loadTurnstile();
    const script = document.getElementById(TURNSTILE_SCRIPT_ID) as HTMLScriptElement;
    expect(script.src).toBe(`https://challenges.cloudflare.com/turnstile/v0/api.js?onload=${TURNSTILE_ONLOAD}&render=explicit`);
    finishScriptLoad();
    await expect(loading).resolves.toBe(win.turnstile);
  });

  it("reuses an already loaded Turnstile without injecting again", async () => {
    win.turnstile = fakeTurnstile();
    await expect(loadTurnstile()).resolves.toBe(win.turnstile);
    expect(document.getElementById(TURNSTILE_SCRIPT_ID)).toBeNull();
  });

  it("login widget mounted while our script is loading still gets its onload", async () => {
    const loading = loadTurnstile();
    const loginReady = reactTurnstileWaitsForLoad();
    finishScriptLoad();
    await expect(loading).resolves.toBeTruthy();
    await expect(loginReady).resolves.toBeUndefined();
  });

  it("login widget mounted after our script loaded still gets its onload", async () => {
    const loading = loadTurnstile();
    finishScriptLoad();
    await loading;
    await expect(reactTurnstileWaitsForLoad()).resolves.toBeUndefined();
  });

  it("waits for a script react-turnstile already injected", async () => {
    const loginReady = reactTurnstileWaitsForLoad();
    const tag = document.createElement("script");
    tag.id = TURNSTILE_SCRIPT_ID;
    document.head.appendChild(tag);
    const loading = loadTurnstile();
    finishScriptLoad();
    await expect(loading).resolves.toBeTruthy();
    await expect(loginReady).resolves.toBeUndefined();
  });
});

describe("getTurnstileToken", () => {
  it("renders an invisible widget with the app-check action and cleans up", async () => {
    const ts = fakeTurnstile("ok");
    win.turnstile = ts;
    await expect(getTurnstileToken("0xKEY")).resolves.toBe("turnstile-token");
    const [el, opts] = ts.render.mock.calls[0] as unknown as [HTMLElement, Record<string, unknown>];
    expect(opts.sitekey).toBe("0xKEY");
    expect(opts.action).toBe(APP_CHECK_ACTION);
    expect(ts.remove).toHaveBeenCalledWith("widget-1");
    expect(el.isConnected).toBe(false);
  });

  it("rejects on a Turnstile error", async () => {
    win.turnstile = fakeTurnstile("error");
    await expect(getTurnstileToken("0xKEY")).rejects.toThrow(/110200/);
  });

  it("rejects when Turnstile never answers", async () => {
    vi.useFakeTimers();
    win.turnstile = fakeTurnstile("silent");
    const pending = getTurnstileToken("0xKEY", 1_000);
    const assertion = expect(pending).rejects.toThrow(/timeout/i);
    await vi.advanceTimersByTimeAsync(1_001);
    await assertion;
  });
});

describe("fetchAppCheckToken", () => {
  it("trades a Turnstile token for an App Check token", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ token: "act", expireTimeMillis: 123 }), { status: 200 }));
    const result = await fetchAppCheckToken("0xKEY", {
      endpoint: "https://koperasi-alumana.com/api/security/app-check-token",
      getTurnstileToken: async () => "tt",
      fetch: fetchMock as unknown as typeof fetch,
    });
    expect(result).toEqual({ token: "act", expireTimeMillis: 123 });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://koperasi-alumana.com/api/security/app-check-token");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ turnstileToken: "tt" });
  });

  it("throws when the Worker refuses", async () => {
    await expect(fetchAppCheckToken("0xKEY", {
      endpoint: "/x",
      getTurnstileToken: async () => "tt",
      fetch: (async () => new Response("{}", { status: 403 })) as unknown as typeof fetch,
    })).rejects.toThrow(/403/);
  });
});
