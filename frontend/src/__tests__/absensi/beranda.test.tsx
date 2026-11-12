import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const session = vi.hoisted(() => ({ silahToday: false, reloadMe: vi.fn(async () => {}) }));

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
      silahToday: session.silahToday,
    },
    setStatus: vi.fn(),
    reloadMe: session.reloadMe,
    signOut: vi.fn(async () => {}),
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getRiwayat: vi.fn(async () => ({ rows: [], requests: [] })),
}));

import { BerandaPage } from "@/absensi/pages/BerandaPage";

const BANNER = "HP ini belum terdaftar. Minta admin absensi reset HP kamu.";

beforeEach(() => {
  localStorage.clear();
  session.silahToday = false;
  session.reloadMe.mockClear();
});

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

  it("Clock In jam 11:23 WIB: pop-up alasan + foto bukti muncul sebelum peta & scan wajah", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-07T11:23:00+07:00"));
    try {
      render(<MemoryRouter><BerandaPage /></MemoryRouter>);
      fireEvent.click(screen.getByRole("button", { name: /^Clock In$/ }));
      expect(await screen.findByText("Clock in lewat jam 08:00")).toBeTruthy();
      expect(screen.getByText(/Sekarang pukul 11:23/)).toBeTruthy();
      expect(screen.getByLabelText("Kamera")).toBeTruthy();
      expect(screen.getByLabelText("Galeri")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it("dengan penanda perangkat: tanpa banner, menampilkan nama dan area kerja", async () => {
    localStorage.setItem("absensi:device:u1", "1");
    render(<MemoryRouter><BerandaPage /></MemoryRouter>);
    expect(screen.queryByText(BANNER)).toBeNull();
    expect(screen.getByText("Sari")).toBeTruthy();
    expect(screen.getByText("SITE TDE")).toBeTruthy();
    await screen.findByText("Belum ada catatan absensi terbaru.");
  });

  it("hari Silah: Clock In memunculkan pop-up hubungi Ustadzah Santi, tanpa masuk alur peta/selfie", async () => {
    session.silahToday = true;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-13T07:30:00+07:00")); // Jumat
    try {
      render(<MemoryRouter><BerandaPage /></MemoryRouter>);
      expect(screen.getByText((text) => text.startsWith("Hari ini jadwal Silah (libur) Anda."))).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: /^Clock In$/ }));
      const dialog = await screen.findByRole("dialog", { name: "Hari Ini Jadwal Silah Anda" });
      expect(dialog.textContent).toContain("Jumat");
      expect(dialog.textContent).toContain("Ustadzah Santi");
      expect(screen.queryByText("Clock in lewat jam 08:00")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Baik, Mengerti" }));
      expect(screen.queryByRole("dialog")).toBeNull();
      expect(session.reloadMe).toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });
});
