import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const getRiwayat = vi.hoisted(() => vi.fn());
vi.mock("@/absensi/api", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/absensi/api")>()),
  getRiwayat,
}));

import { RiwayatList } from "@/absensi/components/RiwayatList";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

beforeEach(() => getRiwayat.mockReset());

describe("RiwayatList", () => {
  it("satu baris per hari kerja dengan label status", async () => {
    getRiwayat.mockResolvedValue({
      rows: [
        { id: "a", workDate: "2026-10-25", masukAt: wib("2026-10-25", "07:00"), pulangAt: wib("2026-10-25", "16:05"), status: "selesai", durationMin: 545 },
        { id: "b", workDate: "2026-10-26", masukAt: wib("2026-10-26", "07:10"), pulangAt: null, status: "lupa_pulang", durationMin: null },
        { id: "c", workDate: "2026-10-27", masukAt: wib("2026-10-27", "07:02"), pulangAt: null, status: "terbuka", durationMin: null },
      ],
    });
    render(<RiwayatList bulan="2026-10" onBulanChange={() => {}} />);

    expect(await screen.findByText("Lengkap")).toBeTruthy();
    expect(screen.getByText("Tidak clock out")).toBeTruthy();
    expect(screen.getByText("Belum clock out")).toBeTruthy();
    expect(screen.getByText("9 jam 5 menit")).toBeTruthy();
    expect(screen.getByText("16:05")).toBeTruthy();
    expect(getRiwayat).toHaveBeenCalledWith("2026-10");
  });

  it("bulan tanpa absen", async () => {
    getRiwayat.mockResolvedValue({ rows: [] });
    render(<RiwayatList bulan="2026-09" onBulanChange={() => {}} />);
    expect(await screen.findByText("Belum ada absen di bulan ini.")).toBeTruthy();
  });

  it("pilihan bulan: bulan ini sampai 11 bulan ke belakang", async () => {
    getRiwayat.mockResolvedValue({ rows: [] });
    render(<RiwayatList bulan="2026-10" onBulanChange={() => {}} />);
    await screen.findByText("Belum ada absen di bulan ini.");
    const options = screen.getAllByRole("option");
    expect(options).toHaveLength(12);
  });
});
