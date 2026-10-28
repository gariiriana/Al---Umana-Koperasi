import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getRiwayat = vi.hoisted(() => vi.fn());
vi.mock("@/absensi/AbsensiSession", () => ({
  useAbsensiSession: () => ({
    me: {
      uid: "u1",
      name: "Sari",
      role: "absen_karyawan",
      unreadNotifications: 0,
      pendingRequests: 0,
    },
    reloadMe: vi.fn(async () => {}),
  }),
}));
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getRiwayat,
}));

import { bulanWIB, formatTanggalPanjang, geserBulan } from "@/absensi/logic/format";
import { RiwayatPage } from "@/absensi/pages/RiwayatPage";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

beforeEach(() => getRiwayat.mockReset());

describe("RiwayatPage (Kalender Absensi & Ringkasan Kehadiran)", () => {
  it("menampilkan Kalender Absensi, Donut Ringkasan Kehadiran, dan detail saat tanggal diketuk", async () => {
    const bulan = bulanWIB(Date.now());
    const d1 = `${bulan}-01`;
    const d2 = `${bulan}-02`;
    const d3 = `${bulan}-03`;

    getRiwayat.mockResolvedValue({
      rows: [
        { id: "s1", workDate: d1, masukAt: wib(d1, "07:00"), pulangAt: wib(d1, "16:05"), status: "selesai", durationMin: 545 },
        { id: "s2", workDate: d2, masukAt: wib(d2, "07:10"), pulangAt: null, status: "lupa_pulang", durationMin: null },
      ],
      requests: [
        {
          id: "r1",
          uid: "u1",
          employeeName: "Sari",
          kind: "cuti",
          leaveType: "sakit",
          startDate: d3,
          endDate: d3,
          fromShift: null,
          toShift: null,
          partnerUid: null,
          partnerName: null,
          reason: "Demam tinggi",
          status: "approved",
          reviewedBy: "admin",
          reviewerName: "Admin",
          reviewedAt: wib(d3, "08:00"),
          reviewNote: null,
          createdAt: wib(d3, "06:30"),
        },
      ],
    });

    render(<MemoryRouter><RiwayatPage /></MemoryRouter>);

    await waitFor(() => expect(getRiwayat).toHaveBeenCalledWith(bulan));
    expect(await screen.findByText("Kalender Absensi")).toBeTruthy();
    expect(screen.getByText("Ringkasan Kehadiran")).toBeTruthy();

    // Total Hari = 3 (1 hadir + 1 lupa_pulang + 1 sakit), % Hadir = 33%
    expect(await screen.findByText("33% Hadir")).toBeTruthy();
    expect(screen.getAllByText("1 · 33%")).toHaveLength(3);

    // Ketuk tanggal 1 -> detail shift lengkap
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${formatTanggalPanjang(d1)}`) }));
    expect(await screen.findByText("Lengkap")).toBeTruthy();
    expect(screen.getByText("9 jam 5 menit")).toBeTruthy();

    // Ketuk tanggal 3 -> detail Sakit disetujui
    fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${formatTanggalPanjang(d3)}`) }));
    expect(await screen.findByText(/Sakit \(Disetujui\)/)).toBeTruthy();
  });

  it("navigasi bulan sebelumnya memanggil getRiwayat bulan sebelumnya", async () => {
    const bulan = bulanWIB(Date.now());
    const prev = geserBulan(bulan, -1);
    getRiwayat.mockResolvedValue({ rows: [], requests: [] });

    render(<MemoryRouter><RiwayatPage /></MemoryRouter>);
    await waitFor(() => expect(getRiwayat).toHaveBeenCalledWith(bulan));

    fireEvent.click(screen.getByRole("button", { name: "Bulan sebelumnya" }));
    await waitFor(() => expect(getRiwayat).toHaveBeenCalledWith(prev));
  });
});
