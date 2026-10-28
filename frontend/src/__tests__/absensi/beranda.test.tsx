import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: {
      uid: "u1",
      name: "Sari",
      role: "absen_karyawan",
      faceRequired: false,
      faceDescriptor: null,
      activated: true,
      areas: [{ id: "site-tde", name: "SITE TDE", polygon: [], toleranceM: 15, active: true }],
      status: { today: null, open: null, last: null },
      unreadNotifications: 2,
      pendingRequests: 1,
    },
    setStatus: vi.fn(),
    reloadMe: vi.fn(async () => {}),
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getRiwayat: vi.fn(async () => ({ rows: [], requests: [] })),
}));

import { BerandaPage } from "@/absensi/pages/BerandaPage";

const BANNER = "HP ini belum terdaftar. Minta admin absensi reset HP kamu.";

beforeEach(() => localStorage.clear());

describe("BerandaPage", () => {
  it("tanpa penanda perangkat: banner tampil, Clock In tetap bisa ditekan, menu layanan & Lihat Selengkapnya tampil", async () => {
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    expect(screen.getByText(BANNER)).toBeTruthy();
    expect((screen.getByRole("button", { name: /^Clock In$/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: /Clock in dulu/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("link", { name: /Lihat Selengkapnya/ }).getAttribute("href")).toBe("/absensi/riwayat");
    expect(screen.getByRole("link", { name: /Permohonan Cuti/ }).getAttribute("href")).toBe("/absensi/persetujuan?buat=cuti");
    expect(screen.getByRole("link", { name: /Pergantian Shift/ }).getAttribute("href")).toBe("/absensi/persetujuan?buat=shift");
    await screen.findByText("Belum ada catatan absensi terbaru.");
  });

  it("dengan penanda perangkat: tanpa banner, menampilkan nama dan area kerja", async () => {
    localStorage.setItem("absensi:device:u1", "1");
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(screen.getByText("Sari")).toBeTruthy();
    expect(screen.getByText("SITE TDE")).toBeTruthy();
    await screen.findByText("Belum ada catatan absensi terbaru.");
  });
});
