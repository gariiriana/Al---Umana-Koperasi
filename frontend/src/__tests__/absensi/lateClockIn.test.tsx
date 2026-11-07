import { act, fireEvent, render, renderHook, screen, waitFor } from "@testing-library/react";
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
  fetchPhotoUrl: vi.fn(async () => "blob:foto-alasan"),
  compressPhoto: vi.fn(),
}));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  absenOptions: mocks.absenOptions,
  absen: mocks.absen,
  getHariIni: mocks.getHariIni,
  fetchPhotoUrl: mocks.fetchPhotoUrl,
}));
vi.mock("@/absensi/device/passkey", () => ({ signWithPasskey: mocks.signWithPasskey }));
vi.mock("@/absensi/device/photo", () => ({ compressPhoto: mocks.compressPhoto }));

import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { LateReasonForm } from "@/absensi/components/LateReasonForm";
import { buildUnifiedRekapItems, rekapTables } from "@/absensi/export/rekapData";
import { useClockFlow } from "@/absensi/flow/useClockFlow";
import type { Me, RekapRow, ShiftStatus } from "@/absensi/types";

const wib = (hhmm: string) => Date.parse(`2026-11-07T${hhmm}:00+07:00`);
const STATUS: ShiftStatus = { today: null, open: null, last: null };
const JPEG = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3, 4, 5]);
const PHOTO_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 9, 9, 9]);
const photo = () => new Blob([PHOTO_BYTES], { type: "image/jpeg" });
const PHOTO_BASE64 = btoa(String.fromCharCode(...PHOTO_BYTES));
const inside = { lat: PIN.lat, lng: PIN.lng, accuracy: 8 };

const me = {
  uid: "u1",
  name: "Sari",
  faceRequired: true,
  faceDescriptor: [0.1, 0.2],
  areas: [{
    id: "sppg",
    name: "SPPG",
    toleranceM: 15,
    active: true,
    polygon: [
      { lat: PIN.lat - d, lng: PIN.lng - d },
      { lat: PIN.lat - d, lng: PIN.lng + d },
      { lat: PIN.lat + d, lng: PIN.lng + d },
      { lat: PIN.lat + d, lng: PIN.lng - d },
    ],
  }],
} as unknown as Me;

beforeEach(() => {
  mocks.absen.mockReset();
  mocks.absen.mockResolvedValue({ serverTime: wib("19:00"), status: STATUS });
  mocks.absenOptions.mockClear();
  mocks.signWithPasskey.mockClear();
  mocks.getHariIni.mockReset();
  mocks.fetchPhotoUrl.mockClear();
  mocks.compressPhoto.mockReset();
  mocks.compressPhoto.mockImplementation(async () => photo());
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});

async function finishClock(hook: { result: { current: ReturnType<typeof useClockFlow> } }) {
  await act(async () => hook.result.current.confirmLocation(inside));
  await waitFor(() => expect(hook.result.current.step).toBe("selfie"));
  await act(async () => hook.result.current.selfieDone({ jpeg: new Blob([JPEG], { type: "image/jpeg" }), descriptor: [0.1, 0.2], distance: 0.3 }));
  await waitFor(() => expect(hook.result.current.passkeyReady).toBe(true));
  await act(async () => hook.result.current.confirmPasskey());
}

describe("clock in lewat jam 08:00", () => {
  it("jam 19:00: minta alasan + foto dulu, lalu keduanya terkirim ke Worker", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("19:00") }));
    await act(async () => hook.result.current.start("masuk"));
    expect(hook.result.current.step).toBe("alasan");

    await act(async () => hook.result.current.submitLateReason("  Lupa absen pagi  ", photo()));
    expect(hook.result.current.step).toBe("lokasi");
    await finishClock(hook);
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[0][0]).toMatchObject({
      kind: "masuk",
      lateReason: "Lupa absen pagi",
      latePhotoBase64: PHOTO_BASE64,
    });
  });

  it("alasan kurang dari 3 huruf atau tanpa foto tidak diterima", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("09:15") }));
    await act(async () => hook.result.current.start("masuk"));
    await act(async () => hook.result.current.submitLateReason(" a ", photo()));
    expect(hook.result.current.step).toBe("alasan");
    await act(async () => hook.result.current.submitLateReason("Macet di jalan", null));
    expect(hook.result.current.step).toBe("alasan");
  });

  it("jam 08:00 tepat dan clock out tidak menanyakan alasan", async () => {
    const onTime = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("08:00") }));
    await act(async () => onTime.result.current.start("masuk"));
    expect(onTime.result.current.step).toBe("lokasi");
    await finishClock(onTime);
    await waitFor(() => expect(onTime.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[0][0]).not.toHaveProperty("lateReason");
    expect(mocks.absen.mock.calls[0][0]).not.toHaveProperty("latePhotoBase64");

    const pulang = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("19:00") }));
    await act(async () => pulang.result.current.start("pulang"));
    expect(pulang.result.current.step).toBe("lokasi");
  });

  it("Coba lagi sesudah gagal tidak menanyakan alasan untuk kedua kalinya", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("10:00") }));
    await act(async () => hook.result.current.start("masuk"));
    await act(async () => hook.result.current.submitLateReason("Macet di jalan", photo()));
    await act(async () => hook.result.current.confirmLocation({ ...inside, lat: PIN.lat + 0.001 }));
    expect(hook.result.current.step).toBe("gagal");

    await act(async () => hook.result.current.retry());
    expect(hook.result.current.step).toBe("lokasi");
    await finishClock(hook);
    await waitFor(() => expect(hook.result.current.step).toBe("sukses"));
    expect(mocks.absen.mock.calls[0][0]).toMatchObject({ lateReason: "Macet di jalan", latePhotoBase64: PHOTO_BASE64 });
  });

  it("Batal lalu mulai lagi menanyakan alasan dari awal", async () => {
    const hook = renderHook(() => useClockFlow({ me, onStatus: vi.fn(), now: () => wib("10:00") }));
    await act(async () => hook.result.current.start("masuk"));
    await act(async () => hook.result.current.submitLateReason("Macet di jalan", photo()));
    await act(async () => hook.result.current.cancel());
    await act(async () => hook.result.current.start("masuk"));
    expect(hook.result.current.step).toBe("alasan");
  });
});

describe("LateReasonForm", () => {
  it("menampilkan jam, pilihan cepat mengisi kolom, Lanjut aktif setelah alasan + foto ada", async () => {
    const onSubmit = vi.fn();
    render(<LateReasonForm now={wib("19:02")} onSubmit={onSubmit} onCancel={vi.fn()} />);
    expect(screen.getByText(/19:02/)).toBeTruthy();

    const lanjut = screen.getByRole("button", { name: "Lanjut" }) as HTMLButtonElement;
    expect(lanjut.disabled).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: "Lupa absen pagi" }));
    const field = screen.getByLabelText("Alasan clock in terlambat") as HTMLTextAreaElement;
    expect(field.value).toBe("Lupa absen pagi");
    expect(lanjut.disabled).toBe(true); // foto belum ada

    const camera = screen.getByLabelText("Kamera") as HTMLInputElement;
    expect(camera.getAttribute("capture")).toBe("environment");
    expect((screen.getByLabelText("Galeri") as HTMLInputElement).hasAttribute("capture")).toBe(false);
    const raw = new File([new Uint8Array([1, 2, 3])], "bukti.jpg", { type: "image/jpeg" });
    fireEvent.change(camera, { target: { files: [raw] } });
    expect(await screen.findByAltText("Foto bukti alasan")).toBeTruthy();
    expect(mocks.compressPhoto).toHaveBeenCalledWith(raw);
    expect(lanjut.disabled).toBe(false);

    fireEvent.change(field, { target: { value: "Lupa absen pagi, HP lowbat" } });
    fireEvent.click(lanjut);
    expect(onSubmit).toHaveBeenCalledWith("Lupa absen pagi, HP lowbat", expect.any(Blob));
  });

  it("foto gagal diproses: pesan tampil dan Lanjut tetap mati", async () => {
    mocks.compressPhoto.mockRejectedValueOnce(new Error("rusak"));
    render(<LateReasonForm now={wib("19:02")} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Lupa absen pagi" }));
    fireEvent.change(screen.getByLabelText("Galeri"), { target: { files: [new File([new Uint8Array([1])], "x.heic")] } });
    expect(await screen.findByText("Foto bukti tidak terbaca. Pilih atau ambil foto lain.")).toBeTruthy();
    expect((screen.getByRole("button", { name: "Lanjut" }) as HTMLButtonElement).disabled).toBe(true);
  });
});

describe("admin melihat alasan terlambat", () => {
  it("Hari Ini: badge Terlambat, alasan, dan tombol lihat foto bukti", async () => {
    mocks.getHariIni.mockResolvedValue({
      date: "2026-11-07",
      rows: [
        { uid: "a", name: "Ani", masukAt: wib("07:30"), pulangAt: null, state: "masuk", lateReason: null, latePhotoId: null },
        { uid: "b", name: "Budi", masukAt: wib("19:00"), pulangAt: null, state: "masuk", lateReason: "Lupa absen pagi", latePhotoId: "lp-1" },
      ],
    });
    render(<HariIniTab />);
    expect(await screen.findByText("Alasan terlambat: Lupa absen pagi")).toBeTruthy();
    expect(screen.getAllByText(/^Terlambat/)).toHaveLength(1);

    fireEvent.click(screen.getByRole("button", { name: "Lihat foto bukti Budi" }));
    expect(await screen.findByRole("dialog", { name: "Foto bukti Budi" })).toBeTruthy();
    await waitFor(() => expect(mocks.fetchPhotoUrl).toHaveBeenCalledWith("lp-1"));
    expect(await screen.findByAltText("Foto bukti alasan terlambat")).toBeTruthy();
  });

  it("Rekap & export: alasan masuk ke kolom Area / Keterangan, ditandai kalau ada foto", () => {
    const row: RekapRow = {
      shiftId: "s1", uid: "b", name: "Budi", workDate: "2026-11-07", masukAt: wib("19:00"), pulangAt: null,
      durationMin: null, status: "terbuka", areaName: "SPPG", masukPhotoId: null, pulangPhotoId: null,
      lateReason: "Lupa absen pagi",
    };
    const [item] = buildUnifiedRekapItems([row]);
    expect(item.info).toBe("SPPG · Alasan terlambat: Lupa absen pagi");
    expect(item.late).toBe(true);
    expect(rekapTables([row]).detail[1][6]).toBe("SPPG · Alasan terlambat: Lupa absen pagi");

    const [withPhoto] = buildUnifiedRekapItems([{ ...row, latePhotoId: "lp-1" }]);
    expect(withPhoto.info).toBe("SPPG · Alasan terlambat: Lupa absen pagi (ada foto bukti)");

    const [onTime] = buildUnifiedRekapItems([{ ...row, masukAt: wib("07:45"), lateReason: null }]);
    expect(onTime.info).toBe("SPPG");
    expect(onTime.late).toBe(false);
  });
});
