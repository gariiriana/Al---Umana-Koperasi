import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const d = 0.0001;

const mocks = vi.hoisted(() => ({
  absenOptions: vi.fn(async () => ({ challengeId: "ch-1", nonce: "bm9uY2U", rpId: "localhost", allowCredentials: [] })),
  absen: vi.fn(),
  getHariIni: vi.fn(),
  getTeamApprovals: vi.fn(),
  reviewTeamRequest: vi.fn(),
  reviewTeamZone: vi.fn(),
  reviewTeamSilah: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => "blob:selfie"),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...mocks,
}));
vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: { uid: "inas", name: "Inas", role: "absen_karyawan", headOf: [{ id: "kasma", name: "Kasma Katering" }], teamPending: 1 },
    reloadMe: vi.fn(async () => {}),
  }),
}));

import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { buildUnifiedRekapItems, summarizeRekap } from "@/absensi/export/rekapData";
import { useClockFlow } from "@/absensi/flow/useClockFlow";
import { TimPage } from "@/absensi/pages/TimPage";
import type { Me, RekapRow, ShiftStatus, SilahExceptionView } from "@/absensi/types";

const wib = (hhmm: string) => Date.parse(`2026-11-13T${hhmm}:00+07:00`);
const STATUS: ShiftStatus = { today: null, open: null, last: null };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const selfie = { jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1], distance: 0.3 };

const me = {
  uid: "febri",
  name: "Febri",
  faceRequired: true,
  faceDescriptor: [0.1],
  silahToday: true,
  areas: [{
    id: "sppg", name: "SPPG", toleranceM: 15, active: true,
    polygon: [
      { lat: PIN.lat - d, lng: PIN.lng - d }, { lat: PIN.lat - d, lng: PIN.lng + d },
      { lat: PIN.lat + d, lng: PIN.lng + d }, { lat: PIN.lat + d, lng: PIN.lng - d },
    ],
  }],
} as unknown as Me;

beforeEach(() => {
  mocks.absen.mockReset();
  mocks.absen.mockResolvedValue({ serverTime: wib("09:30"), status: STATUS });
  mocks.getTeamApprovals.mockReset();
  mocks.reviewTeamSilah.mockReset();
});

describe("clock in di hari Silah", () => {
  it("alasan Silah terkirim ke Worker dan tidak menanyakan alasan terlambat", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("09:30") }));
    await act(async () => hook.result.current.start("masuk", { silahReason: "  Gantiin  Ani " }));
    expect(hook.result.current.step).toBe("lokasi");
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }));
    await act(async () => hook.result.current.selfieDone(selfie));
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    const body = mocks.absen.mock.calls[0][0];
    expect(body).toMatchObject({ kind: "masuk", silahReason: "Gantiin Ani" });
    expect(body).not.toHaveProperty("lateReason");
  });

  it("Coba lagi sesudah gagal tetap membawa alasan Silah; clock out tidak mengirimnya", async () => {
    mocks.absen.mockRejectedValueOnce(new Error("jaringan"));
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("09:30") }));
    await act(async () => hook.result.current.start("masuk", { silahReason: "Pesanan banyak" }));
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }));
    await act(async () => hook.result.current.selfieDone(selfie));
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));

    await act(async () => hook.result.current.retry());
    expect(hook.result.current.step).toBe("lokasi");
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }));
    await act(async () => hook.result.current.selfieDone(selfie));
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[1][0]).toMatchObject({ silahReason: "Pesanan banyak" });

    await act(async () => hook.result.current.start("pulang"));
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }));
    await act(async () => hook.result.current.selfieDone(selfie));
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[2][0]).not.toHaveProperty("silahReason");
  });
});

describe("admin: masuk di hari Silah", () => {
  it("Hari Ini menandai Perlu verifikasi + catatan alasan", async () => {
    mocks.getHariIni.mockResolvedValue({
      date: "2026-11-13",
      rows: [{
        uid: "febri", name: "Febri", masukAt: wib("09:30"), pulangAt: null, state: "masuk", silah: true,
        zoneMasuk: null, zonePulang: null, silahMasuk: { id: "x1", status: "pending", reason: "Gantiin Ani" },
      }],
    });
    render(<HariIniTab />);
    expect(await screen.findByText("Perlu verifikasi")).toBeTruthy();
    expect(screen.getByText("Perlu verifikasi · masuk di hari Silah (Gantiin Ani)")).toBeTruthy();
  });

  it("Rekap: ditolak tidak dihitung hadir dan diberi label Masuk Silah ditolak", () => {
    const base: RekapRow = {
      shiftId: "s1", uid: "febri", name: "Febri", workDate: "2026-11-13", masukAt: wib("09:30"), pulangAt: null,
      durationMin: null, status: "terbuka", areaName: null, masukPhotoId: null, pulangPhotoId: null,
    };
    const rejected = { ...base, silahMasuk: { id: "x1", status: "rejected" as const, reason: "Gantiin Ani" } };
    const [item] = buildUnifiedRekapItems([rejected]);
    expect(item.statusLabel).toMatch(/ · Masuk Silah ditolak$/);
    expect(item.info).toContain("Masuk di hari Silah · ditolak (Gantiin Ani)");

    const approved = { ...base, shiftId: "s2", workDate: "2026-11-06", silahMasuk: { id: "x2", status: "approved" as const, reason: "ok ok" } };
    const [summary] = summarizeRekap([rejected, approved]);
    expect(summary.hariHadir).toBe(1);
  });
});

describe("kepala unit: Persetujuan Tim", () => {
  it("menampilkan masuk di hari Silah dan bisa menolaknya", async () => {
    const silah: SilahExceptionView = {
      id: "x1", shiftId: "s1", uid: "febri", employeeName: "Febri", unitName: "Kasma Katering", workDate: "2026-11-13",
      at: wib("09:30"), reason: "Gantiin Ani", photoId: "selfie-1", status: "pending", reviewedBy: null,
      reviewerName: null, reviewedAt: null, reviewNote: null, createdAt: wib("09:30"),
    };
    mocks.getTeamApprovals.mockResolvedValue({
      units: [{ id: "kasma", name: "Kasma Katering" }], requests: [], zoneExceptions: [], silahExceptions: [silah], pendingCount: 1,
    });
    mocks.reviewTeamSilah.mockResolvedValue({ ...silah, status: "rejected" });

    render(<MemoryRouter><TimPage /></MemoryRouter>);
    expect(await screen.findByText("Masuk di hari Silah")).toBeTruthy();
    expect(screen.getByText(/"Gantiin Ani"/)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Lihat selfie" }));
    expect(await screen.findByAltText("Selfie Febri")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Tolak" }));
    await waitFor(() => expect(mocks.reviewTeamSilah).toHaveBeenCalledWith("x1", { action: "reject" }));
  });
});
