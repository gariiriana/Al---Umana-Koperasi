import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getHariIni: vi.fn(),
  getRekap: vi.fn(),
  listEmployees: vi.fn(),
  patchEmployee: vi.fn(),
  getTeamApprovals: vi.fn(),
  reviewTeamRequest: vi.fn(),
  reviewTeamZone: vi.fn(),
  reviewTeamSilah: vi.fn(),
  reviewTeamLateOut: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => "blob:x"),
}));
const session = vi.hoisted(() => ({ me: null as unknown }));

vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...mocks,
}));
vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({ me: session.me, reloadMe: vi.fn(async () => {}) }),
}));
vi.mock("@/absensi/components/NotificationSheet", () => ({ NotificationBellButton: () => null }));
vi.mock("@/absensi/components/EmployeeBottomNav", () => ({ EmployeeBottomNav: () => null }));

import { TimPage } from "@/absensi/pages/TimPage";

const baseMe = { uid: "prianka", name: "Prianka", email: "p@absen.test", role: "absen_karyawan", faceRequired: true, activated: true, areas: [] };
const employee = (uid: string, name: string, silahDays: number[]) => ({
  uid, name, email: `${uid}@absen.test`, role: "absen_karyawan" as const, status: "aktif" as const,
  faceRequired: true, activated: true, referencePhotoId: null, createdAt: 0, silahDays,
});

function renderTim(path = "/absensi/tim") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/absensi/tim" element={<TimPage />} />
        <Route path="/absensi" element={<p>Beranda</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  Object.values(mocks).forEach((fn) => fn.mockReset());
  mocks.fetchPhotoUrl.mockResolvedValue("blob:x");
  mocks.getTeamApprovals.mockResolvedValue({ units: [], requests: [], zoneExceptions: [], pendingCount: 0 });
  mocks.getHariIni.mockResolvedValue({
    date: "2026-11-28",
    rows: [{ uid: "febri", name: "Febri", masukAt: null, pulangAt: null, state: "belum", silah: false }],
  });
  mocks.getRekap.mockResolvedValue({ rows: [], requests: [], silah: [], today: "2026-11-28" });
  mocks.listEmployees.mockResolvedValue({ employees: [employee("prianka", "Prianka", []), employee("febri", "Febri", [5])] });
  mocks.patchEmployee.mockResolvedValue(employee("febri", "Febri", [5, 6]));
});

describe("halaman Tim kepala unit", () => {
  it("kepala unit: tab Persetujuan, Hari Ini, Rekap, Silah, data dari endpoint tim", async () => {
    session.me = { ...baseMe, headOf: [{ id: "fish", name: "Fish n Kids" }], teamPending: 2 };
    renderTim();
    const nav = screen.getByRole("navigation", { name: "Menu tim" });
    expect(["Persetujuan", "Hari Ini", "Rekap", "Silah"].every((label) => nav.textContent?.includes(label))).toBe(true);

    fireEvent.click(screen.getByRole("button", { name: /Hari Ini/ }));
    expect(await screen.findByText("Febri")).toBeTruthy();
    expect(mocks.getHariIni).toHaveBeenCalledWith("tim");
    expect(screen.getByText("unit Fish n Kids")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /Rekap/ }));
    await waitFor(() => expect(mocks.getRekap).toHaveBeenCalledWith(expect.objectContaining({ uid: undefined }), "tim"));
    expect(mocks.listEmployees).toHaveBeenCalledWith("tim");
  });

  it("Silah: kepala unit mengubah jadwal anggota lewat endpoint tim, jadwalnya sendiri dikunci", async () => {
    session.me = { ...baseMe, headOf: [{ id: "fish", name: "Fish n Kids" }] };
    renderTim("/absensi/tim?tab=silah");
    fireEvent.click(await screen.findByRole("button", { name: "Ubah jadwal" }));
    expect(screen.queryByRole("group", { name: "Hari Silah Prianka" })).toBeNull();
    expect(screen.getByText("Jadwal Silah kamu sendiri diatur oleh admin absensi.")).toBeTruthy();

    const febri = screen.getByRole("group", { name: "Hari Silah Febri" });
    fireEvent.click(febri.querySelector('button[aria-label="Sabtu"]') as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Simpan" }));
    await waitFor(() => expect(mocks.patchEmployee).toHaveBeenCalledWith("febri", { action: "set_silah", silahDays: [5, 6] }, "tim"));
  });

  it("izin lihat semua unit tanpa mengepalai unit: tanpa tab Persetujuan, label semua unit", async () => {
    session.me = { ...baseMe, headOf: [], viewAllUnits: true };
    renderTim();
    expect(screen.queryByRole("button", { name: /Persetujuan/ })).toBeNull();
    expect(await screen.findByText("Febri")).toBeTruthy();
    expect(screen.getByText("semua unit")).toBeTruthy();
    expect(mocks.getTeamApprovals).not.toHaveBeenCalled();
  });

  it("karyawan biasa dialihkan ke Beranda", () => {
    session.me = { ...baseMe, headOf: [] };
    renderTim();
    expect(screen.getByText("Beranda")).toBeTruthy();
  });
});
