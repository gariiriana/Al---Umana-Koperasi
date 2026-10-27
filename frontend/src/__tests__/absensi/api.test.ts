import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const getIdToken = vi.hoisted(() => vi.fn(async () => "token-abc"));
vi.mock("@/absensi/firebaseAbsensi", () => ({ absensiAuth: { currentUser: { getIdToken } } }));

import { AbsensiApiError, absensiFetch, getMe } from "@/absensi/api";

const fetchMock = vi.fn();
beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

const jsonResponse = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("absensiFetch", () => {
  it("mengirim token akun absensi ke /api/absensi", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ uid: "u1" }));
    await getMe();
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("/api/absensi/me");
    expect(new Headers(init.headers).get("authorization")).toBe("Bearer token-abc");
  });

  it("error Worker jadi AbsensiApiError dengan kode, status, dan detail", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ error: { code: "DI_LUAR_AREA", details: { distanceM: 23.4 } } }, 422));
    const err = (await absensiFetch("/absen", { method: "POST", body: "{}" }).catch((e) => e)) as AbsensiApiError;
    expect(err).toBeInstanceOf(AbsensiApiError);
    expect(err.code).toBe("DI_LUAR_AREA");
    expect(err.status).toBe(422);
    expect(err.details).toEqual({ distanceM: 23.4 });
  });

  it("balasan HTML (SPA fallback) dianggap layanan tidak tersedia", async () => {
    fetchMock.mockResolvedValue(new Response("<!doctype html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(getMe()).rejects.toMatchObject({ code: "LAYANAN_TIDAK_TERSEDIA" });
  });

  it("fetch gagal dianggap masalah jaringan", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    await expect(getMe()).rejects.toMatchObject({ code: "JARINGAN" });
  });
});
