import { afterEach, describe, expect, it, vi } from "vitest";

describe("syncSecureTime", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("reads the server Date from a file the host serves, bypassing the HTTP cache", async () => {
    const serverDate = "Sat, 21 Nov 2026 04:30:00 GMT";
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(null, { status: 200, headers: { Date: serverDate } }),
    );
    vi.stubGlobal("fetch", fetchMock);

    const { syncSecureTime, isSecureTimeSynced } = await import("@/services/secureTimeService");
    await syncSecureTime();

    const urls = fetchMock.mock.calls.map(([url]) => String(url));
    expect(urls.every((u) => u === `${window.location.origin}/index.html`)).toBe(true);
    expect(urls.some((u) => u.includes("healthz"))).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith(
      `${window.location.origin}/index.html`,
      expect.objectContaining({ method: "HEAD", cache: "no-store" }),
    );
    expect(isSecureTimeSynced()).toBe(true);
  });
});
