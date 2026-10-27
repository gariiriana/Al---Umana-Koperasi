import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const api = vi.hoisted(() => ({
  getHariIni: vi.fn(),
  listEmployees: vi.fn(),
  createEmployee: vi.fn(),
  patchEmployee: vi.fn(),
  fetchPhotoUrl: vi.fn(async () => null),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  ...api,
}));

import { AbsensiApiError } from "@/absensi/api";
import { HariIniTab } from "@/absensi/admin/HariIniTab";
import { KaryawanTab } from "@/absensi/admin/KaryawanTab";

const wib = (hhmm: string) => Date.parse(`2026-10-27T${hhmm}:00+07:00`);

beforeEach(() => {
  Object.values(api).forEach((fn) => fn.mockReset());
  api.fetchPhotoUrl.mockResolvedValue(null);
  api.listEmployees.mockResolvedValue({ employees: [] });
});

describe("HariIniTab", () => {
  it("memetakan 4 state ke label persis", async () => {
    api.getHariIni.mockResolvedValue({
      date: "2026-10-27",
      rows: [
        { uid: "a", name: "Ani", masukAt: null, pulangAt: null, state: "belum" },
        { uid: "b", name: "Budi", masukAt: wib("07:02"), pulangAt: null, state: "masuk" },
        { uid: "c", name: "Citra", masukAt: wib("07:00"), pulangAt: wib("16:05"), state: "pulang" },
        { uid: "d", name: "Dedi", masukAt: wib("07:10"), pulangAt: null, state: "tidak_clock_out" },
      ],
    });
    render(<HariIniTab />);
    expect(await screen.findByText("Belum absen")).toBeTruthy();
    expect(screen.getByText("Sudah clock in · 07:02")).toBeTruthy();
    expect(screen.getByText("Sudah clock out · 16:05")).toBeTruthy();
    expect(screen.getByText("Tidak clock out")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Muat ulang" }));
    await waitFor(() => expect(api.getHariIni).toHaveBeenCalledTimes(2));
  });
});

describe("KaryawanTab", () => {
  function fillForm() {
    fireEvent.change(screen.getByLabelText("Nama"), { target: { value: "Sari Dewi" } });
    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "sari@absen.alumana.id" } });
    fireEvent.change(screen.getByLabelText("Password awal"), { target: { value: "rahasia123" } });
  }

  it("Tanpa cek wajah dicentang → createEmployee dengan faceRequired false", async () => {
    api.createEmployee.mockResolvedValue({ uid: "n1" });
    render(<KaryawanTab />);
    await waitFor(() => expect(api.listEmployees).toHaveBeenCalled());
    fillForm();
    fireEvent.click(screen.getByLabelText("Tanpa cek wajah"));
    fireEvent.click(screen.getByRole("button", { name: "Tambah karyawan" }));

    await waitFor(() => expect(api.createEmployee).toHaveBeenCalledWith({
      name: "Sari Dewi",
      email: "sari@absen.alumana.id",
      password: "rahasia123",
      role: "absen_karyawan",
      faceRequired: false,
    }));
    await waitFor(() => expect(api.listEmployees).toHaveBeenCalledTimes(2));
  });

  it("email sudah dipakai → pesan dari messageFor", async () => {
    api.createEmployee.mockRejectedValue(new AbsensiApiError("EMAIL_SUDAH_ADA", 409));
    render(<KaryawanTab />);
    await waitFor(() => expect(api.listEmployees).toHaveBeenCalled());
    fillForm();
    fireEvent.click(screen.getByRole("button", { name: "Tambah karyawan" }));
    expect(await screen.findByText("Email ini sudah dipakai akun lain.")).toBeTruthy();
  });

  it("baris karyawan: foto acuan yang sudah dihapus", async () => {
    api.listEmployees.mockResolvedValue({
      employees: [{
        uid: "u1", name: "Sari", email: "sari@absen.alumana.id", role: "absen_karyawan", status: "aktif",
        faceRequired: true, activated: true, referencePhotoId: "p1", createdAt: 0,
      }],
    });
    render(<KaryawanTab />);
    expect(await screen.findByText("Foto sudah dihapus")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Nonaktifkan" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Reset HP & wajah" })).toBeTruthy();
  });
});
