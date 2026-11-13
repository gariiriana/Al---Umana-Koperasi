import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

const mocks = vi.hoisted(() => ({
  absenOptions: vi.fn(async () => ({ challengeId: "ch-1", nonce: "bm9uY2U", rpId: "localhost", allowCredentials: [] })),
  absen: vi.fn(),
  getRiwayat: vi.fn(async () => ({ rows: [], requests: [] })),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...mocks,
}));

const fixtures = vi.hoisted(() => {
  const P = { lat: -6.9735229, lng: 106.8651559 };
  const s = 0.0001;
  return {
    areas: [{
      id: "sppg", name: "SPPG", toleranceM: 15, active: true,
      polygon: [
        { lat: P.lat - s, lng: P.lng - s }, { lat: P.lat - s, lng: P.lng + s },
        { lat: P.lat + s, lng: P.lng + s }, { lat: P.lat + s, lng: P.lng - s },
      ],
    }],
    // Jumat 13 Nov clock in 07:00, lupa clock out; sekarang Sabtu 14 Nov.
    open: {
      id: "s13", workDate: "2026-11-13", masukAt: Date.parse("2026-11-13T07:00:00+07:00"),
      pulangAt: null, status: "terbuka", durationMin: null,
    },
  };
});

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: {
      uid: "joko", name: "Joko", role: "absen_karyawan", faceRequired: false, faceDescriptor: null, activated: true,
      areas: fixtures.areas, status: { today: null, open: fixtures.open, last: null },
      unreadNotifications: 0, pendingRequests: 0, silahToday: false,
    },
    setStatus: vi.fn(),
    reloadMe: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}));

import { useClockFlow } from "@/absensi/flow/useClockFlow";
import { BerandaPage } from "@/absensi/pages/BerandaPage";
import type { Me } from "@/absensi/types";

const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
const selfie = { jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1], distance: 0.3 };

beforeEach(() => {
  mocks.absen.mockReset();
  mocks.absen.mockResolvedValue({ serverTime: wib("2026-11-14", "07:00"), status: { today: null, open: null, last: null } });
});
afterEach(() => vi.useRealTimers());

describe("Beranda: lupa clock out kemarin", () => {
  it("menampilkan kartu absensi kemarin dan mengunci Clock In hari ini", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T07:00:00+07:00"));
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    const card = screen.getByRole("region", { name: "Absensi Jumat, 13 Nov 2026" });
    expect(card.textContent).toContain("07:00");
    const clockIn = screen.getByRole("button", { name: "Selesaikan clock out 13 Nov dulu" }) as HTMLButtonElement;
    expect(clockIn.disabled).toBe(true);
    await screen.findByText("Belum ada catatan absensi terbaru.");
  });

  it("Clock Out kemarin memunculkan pop-up Sudah ganti hari, lalu lanjut ke peta", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-14T07:00:00+07:00"));
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Clock Out absensi 13 Nov" }));
    const dialog = await screen.findByRole("dialog", { name: "Sudah ganti hari" });
    expect(dialog.textContent).toContain("Jumat, 13 Nov 2026");
    expect(dialog.textContent).toContain("menunggu persetujuan");
    const lanjut = screen.getByRole("button", { name: "Lanjut Clock Out" }) as HTMLButtonElement;
    expect(lanjut.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Alasan clock out terlambat"), { target: { value: "Lupa menekan clock out" } });
    expect(lanjut.disabled).toBe(false);
    fireEvent.click(lanjut);
    expect(await screen.findByRole("dialog", { name: "Konfirmasi Clock Out" })).toBeTruthy();
    expect(screen.queryByRole("dialog", { name: "Sudah ganti hari" })).toBeNull();
  });
});

describe("useClockFlow: alasan clock out telat", () => {
  const me = { uid: "joko", name: "Joko", faceRequired: true, faceDescriptor: [0.1], areas: fixtures.areas } as unknown as Me;
  const finish = async (hook: { result: { current: ReturnType<typeof useClockFlow> } }) => {
    await act(async () => hook.result.current.confirmLocation({ ...PIN, accuracy: 8 }));
    await act(async () => hook.result.current.selfieDone(selfie));
  };

  it("server bilang sudah ganti hari (jam HP belum): minta alasan lalu kirim ulang tanpa ulang peta & selfie", async () => {
    const { AbsensiApiError } = await import("@/absensi/api");
    mocks.absenOptions.mockClear();
    mocks.absen.mockRejectedValueOnce(new AbsensiApiError("ALASAN_CLOCK_OUT_TELAT", 422));
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("2026-11-13", "23:58") }));
    await act(async () => hook.result.current.start("pulang"));
    await finish(hook);
    await waitFor(() => expect(hook.result.current.step).toBe("alasanPulang"));
    expect(hook.result.current.error).toBeNull();

    await act(async () => hook.result.current.submitLateOutReason("  Lembur lewat  tengah malam "));
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absenOptions).toHaveBeenCalledTimes(1);
    const [first, second] = mocks.absen.mock.calls.map((call) => call[0]);
    expect(first).not.toHaveProperty("lateOutReason");
    expect(second).toMatchObject({ challengeId: first.challengeId, kind: "pulang", lateOutReason: "Lembur lewat tengah malam" });
  });

  it("terkirim saat clock out, tetap ada sesudah Coba lagi, tidak terkirim saat clock in", async () => {
    mocks.absen.mockRejectedValueOnce(new Error("jaringan"));
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("2026-11-14", "07:00") }));
    await act(async () => hook.result.current.start("pulang", { lateOutReason: "  Lupa   pencet " }));
    expect(hook.result.current.step).toBe("lokasi");
    await finish(hook);
    await waitFor(() => expect(hook.result.current.step).toBe("gagal"));
    await act(async () => hook.result.current.retry());
    await finish(hook);
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[1][0]).toMatchObject({ kind: "pulang", lateOutReason: "Lupa pencet" });

    const masuk = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("2026-11-14", "07:30") }));
    await act(async () => masuk.result.current.start("masuk", { lateOutReason: "Lupa pencet" }));
    await finish(masuk);
    await waitFor(() => expect(masuk.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[2][0]).not.toHaveProperty("lateOutReason");
  });
});
