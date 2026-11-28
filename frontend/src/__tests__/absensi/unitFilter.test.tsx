import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHariIni: vi.fn(),
  getRekap: vi.fn(),
  listEmployees: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => "blob:x"),
}));
const exportMock = vi.hoisted(() => ({ downloadRekapExcel: vi.fn() }));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...mocks,
}));
vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({ me: { uid: "adm", name: "Admin Absensi", role: "admin_absensi" } }),
}));
vi.mock("@/absensi/export/rekapExcel", () => exportMock);

import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { RekapTab } from "@/absensi/admin/RekapTab";

const UNITS = [{ id: "fish", name: "Fish n Kids" }, { id: "kasma", name: "Kasma Katering" }];
const person = (uid: string, name: string, unitId: string | null) => ({
  uid, name, email: `${uid}@absen.test`, role: "absen_karyawan" as const, status: "aktif" as const,
  faceRequired: true, activated: true, referencePhotoId: null, createdAt: 0, unitId, silahDays: [],
});
const shift = (uid: string, name: string, unitId: string | null) => ({
  shiftId: `s-${uid}`, uid, name, unitId, workDate: "2026-11-27", masukAt: Date.parse("2026-11-27T07:50:00+07:00"),
  pulangAt: Date.parse("2026-11-27T16:40:00+07:00"), durationMin: 530, status: "selesai", areaName: "SPPG",
  masukPhotoId: null, pulangPhotoId: null,
});

beforeEach(() => {
  Object.values(mocks).forEach((fn) => fn.mockReset());
  exportMock.downloadRekapExcel.mockReset();
  mocks.getHariIni.mockResolvedValue({
    date: "2026-11-28",
    units: UNITS,
    rows: [
      { uid: "febri", name: "Febri", unitId: "fish", masukAt: null, pulangAt: null, state: "belum" },
      { uid: "risa", name: "Risa", unitId: "kasma", masukAt: null, pulangAt: null, state: "belum" },
      { uid: "gari", name: "Gari", unitId: null, masukAt: null, pulangAt: null, state: "belum" },
    ],
  });
  mocks.getRekap.mockResolvedValue({
    rows: [shift("febri", "Febri", "fish"), shift("risa", "Risa", "kasma")],
    requests: [], silah: [], today: "2026-11-28", units: UNITS,
  });
  mocks.listEmployees.mockResolvedValue({
    employees: [person("febri", "Febri", "fish"), person("risa", "Risa", "kasma"), person("gari", "Gari", null)],
  });
});

describe("filter unit (admin absensi / lihat semua unit)", () => {
  it("Hari Ini: pilih Kasma Katering → hanya karyawan Kasma Katering, hitungan ikut", async () => {
    render(<HariIniTab />);
    expect(await screen.findByText("Febri")).toBeTruthy();
    const select = screen.getByLabelText("Unit") as HTMLSelectElement;
    expect([...select.options].map((o) => o.text)).toEqual(["Semua unit", "Fish n Kids", "Kasma Katering", "Tanpa unit"]);

    fireEvent.change(select, { target: { value: "kasma" } });
    expect(screen.getByText("Risa")).toBeTruthy();
    expect(screen.queryByText("Febri")).toBeNull();
    expect(screen.queryByText("Gari")).toBeNull();
    const belum = screen.getByText("Belum Absen").parentElement as HTMLElement;
    expect(within(belum).getByText("1")).toBeTruthy();

    fireEvent.change(select, { target: { value: "__tanpa_unit" } });
    expect(screen.getByText("Gari")).toBeTruthy();
    expect(screen.queryByText("Risa")).toBeNull();
  });

  it("Rekap: filter unit menyaring baris, daftar karyawan, dan export (nama unit ikut)", async () => {
    render(<RekapTab />);
    await waitFor(() => expect(mocks.getRekap).toHaveBeenCalled());
    const select = await screen.findByLabelText("Unit") as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "fish" } });

    const karyawan = screen.getByLabelText("Karyawan") as HTMLSelectElement;
    expect([...karyawan.options].map((o) => o.text)).toEqual(["Semua karyawan", "Febri"]);

    fireEvent.click(screen.getByRole("button", { name: /Export Excel/ }));
    await waitFor(() => expect(exportMock.downloadRekapExcel).toHaveBeenCalled());
    const [rows, meta] = exportMock.downloadRekapExcel.mock.calls[0];
    expect(rows.map((r: { name: string }) => r.name)).toEqual(["Febri"]);
    expect(meta.unitName).toBe("Fish n Kids");
  });

  it("kepala satu unit: filter unit tidak muncul", async () => {
    mocks.getHariIni.mockResolvedValue({
      date: "2026-11-28",
      units: [UNITS[0]],
      rows: [{ uid: "febri", name: "Febri", unitId: "fish", masukAt: null, pulangAt: null, state: "belum" }],
    });
    render(<HariIniTab />);
    expect(await screen.findByText("Febri")).toBeTruthy();
    expect(screen.queryByLabelText("Unit")).toBeNull();
  });
});
