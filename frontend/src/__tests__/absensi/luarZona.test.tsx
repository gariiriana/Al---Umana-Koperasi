import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const d = 0.0001;

const mocks = vi.hoisted(() => ({
  absenOptions: vi.fn(async () => ({
    challengeId: "ch-1",
    nonce: "bm9uY2U",
    rpId: "localhost",
    allowCredentials: [{ id: "cred-1", transports: ["internal"] }],
  })),
  absen: vi.fn(),
  signWithPasskey: vi.fn(async () => ({ id: "cred-1", response: {} })),
  getHariIni: vi.fn(),
  getTeamApprovals: vi.fn(),
  reviewTeamRequest: vi.fn(),
  reviewTeamZone: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => "blob:selfie"),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  absenOptions: mocks.absenOptions,
  absen: mocks.absen,
  getHariIni: mocks.getHariIni,
  getTeamApprovals: mocks.getTeamApprovals,
  reviewTeamRequest: mocks.reviewTeamRequest,
  reviewTeamZone: mocks.reviewTeamZone,
  fetchPhotoUrl: mocks.fetchPhotoUrl,
}));
vi.mock("@/absensi/device/passkey", () => ({ signWithPasskey: mocks.signWithPasskey }));
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
import type { Me, RekapRow, ShiftStatus, ZoneExceptionView } from "@/absensi/types";

const wib = (hhmm: string) => Date.parse(`2026-11-07T${hhmm}:00+07:00`);
const STATUS: ShiftStatus = { today: null, open: null, last: null };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const outside = { lat: PIN.lat + 0.01, lng: PIN.lng, accuracy: 8 };

const me = {
  uid: "risa",
  name: "Risa",
  faceRequired: true,
  faceDescriptor: [0.1],
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
  mocks.absen.mockResolvedValue({ serverTime: wib("07:30"), status: STATUS });
  mocks.getTeamApprovals.mockReset();
  mocks.reviewTeamZone.mockReset();
});

describe("clock in di luar zona", () => {
  it("tanpa alasan gagal; dengan alasan lanjut dan alasan terkirim ke Worker", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("07:30") }));
    await act(async () => hook.result.current.start("masuk"));
    await act(async () => hook.result.current.confirmLocation(outside));
    expect(hook.result.current.step).toBe("gagal");

    await act(async () => hook.result.current.retry());
    await act(async () => hook.result.current.confirmLocation(outside, "  Antar bahan  ke sekolah "));
    expect(hook.result.current.step).toBe("selfie");
    await act(async () => hook.result.current.selfieDone({ jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1], distance: 0.3 }));
    await waitFor(() => expect(hook.result.current.passkeyReady).toBe(true));
    await act(async () => hook.result.current.confirmPasskey());
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[0][0]).toMatchObject({ outsideReason: "Antar bahan ke sekolah" });
  });

  it("di dalam zona tidak mengirim alasan luar zona walau ada teks", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("07:30") }));
    await act(async () => hook.result.current.start("masuk"));
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }, "iseng"));
    await act(async () => hook.result.current.selfieDone({ jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1], distance: 0.3 }));
    await waitFor(() => expect(hook.result.current.passkeyReady).toBe(true));
    await act(async () => hook.result.current.confirmPasskey());
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[0][0]).not.toHaveProperty("outsideReason");
  });
});

describe("admin: absen luar zona yang belum disetujui ditandai Perlu verifikasi", () => {
  it("Hari Ini menampilkan badge + catatan", async () => {
    mocks.getHariIni.mockResolvedValue({
      date: "2026-11-07",
      rows: [{
        uid: "risa", name: "Risa", masukAt: wib("07:30"), pulangAt: null, state: "masuk",
        zoneMasuk: { id: "z1", status: "pending", reason: "Antar bahan", distanceM: 1100 }, zonePulang: null,
      }],
    });
    render(<HariIniTab />);
    expect(await screen.findByText("Perlu verifikasi")).toBeTruthy();
    expect(screen.getByText("Clock in: Perlu verifikasi · absen di luar zona (Antar bahan)")).toBeTruthy();
  });

  it("Rekap: label status + ditolak tidak dihitung hadir", () => {
    const base: RekapRow = {
      shiftId: "s1", uid: "risa", name: "Risa", workDate: "2026-11-07", masukAt: wib("07:30"), pulangAt: null,
      durationMin: null, status: "terbuka", areaName: null, masukPhotoId: null, pulangPhotoId: null,
    };
    const [pending] = buildUnifiedRekapItems([{ ...base, zoneMasuk: { id: "z1", status: "pending", reason: "Antar bahan", distanceM: 900 } }]);
    expect(pending.zoneStatus).toBe("pending");
    expect(pending.statusLabel).toMatch(/ · Perlu verifikasi$/);
    expect(pending.info).toContain("Clock in: Perlu verifikasi · absen di luar zona (Antar bahan)");

    const rejected = { ...base, shiftId: "s2", workDate: "2026-11-06", zoneMasuk: { id: "z2", status: "rejected" as const, reason: "x y z", distanceM: 900 } };
    const [summary] = summarizeRekap([{ ...base, zoneMasuk: { id: "z1", status: "approved", reason: "ok", distanceM: 900 } }, rejected]);
    expect(summary.hariHadir).toBe(1);
  });
});

describe("kepala unit: halaman Persetujuan Tim", () => {
  it("menampilkan absen luar zona anggota tim dan bisa menyetujuinya", async () => {
    const zone: ZoneExceptionView = {
      id: "z1", shiftId: "s1", uid: "risa", employeeName: "Risa", unitName: "Kasma Katering", kind: "masuk",
      workDate: "2026-11-07", at: wib("07:30"), lat: outside.lat, lng: outside.lng, accuracy: 8, distanceM: 1100,
      reason: "Antar bahan", photoId: "selfie-1", status: "pending", reviewedBy: null, reviewerName: null,
      reviewedAt: null, reviewNote: null, createdAt: wib("07:30"),
    };
    mocks.getTeamApprovals.mockResolvedValue({ units: [{ id: "kasma", name: "Kasma Katering" }], requests: [], zoneExceptions: [zone], pendingCount: 1 });
    mocks.reviewTeamZone.mockResolvedValue({ ...zone, status: "approved" });

    render(<MemoryRouter><TimPage /></MemoryRouter>);
    expect(await screen.findByText("Clock In di luar zona")).toBeTruthy();
    expect(screen.getByText("Kasma Katering", { selector: "strong" })).toBeTruthy();
    expect(screen.getByText(/sekitar 1100 m dari zona/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Lihat lokasi/ }).getAttribute("href")).toBe(`https://www.google.com/maps?q=${outside.lat},${outside.lng}`);

    fireEvent.click(screen.getByRole("button", { name: "Lihat selfie" }));
    expect(await screen.findByAltText("Selfie Risa")).toBeTruthy();
    expect(mocks.fetchPhotoUrl).toHaveBeenCalledWith("selfie-1", "tim");

    fireEvent.change(screen.getByLabelText("Catatan untuk Risa"), { target: { value: "Oke" } });
    fireEvent.click(screen.getByRole("button", { name: "Setujui" }));
    await waitFor(() => expect(mocks.reviewTeamZone).toHaveBeenCalledWith("z1", { action: "approve", note: "Oke" }));
  });
});
