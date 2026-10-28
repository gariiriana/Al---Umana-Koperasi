import { describe, expect, it } from "vitest";

import { buttonState } from "@/absensi/logic/buttonState";
import { formatDurasi, formatJam, formatTanggalPanjang, formatTanggalPendek } from "@/absensi/logic/format";
import type { ShiftStatus, ShiftView } from "@/absensi/types";

const wib = (date: string, hhmm: string) => Date.parse(`${date}T${hhmm}:00+07:00`);

function shift(partial: Partial<ShiftView> & Pick<ShiftView, "workDate" | "masukAt" | "status">): ShiftView {
  return { id: "s1", pulangAt: null, durationMin: null, ...partial };
}

const EMPTY: ShiftStatus = { today: null, open: null, last: null };

describe("format", () => {
  it("jam WIB, tanggal, dan durasi", () => {
    expect(formatJam(wib("2026-10-27", "07:02"))).toBe("07:02");
    expect(formatTanggalPendek("2026-10-26")).toBe("26 Okt");
    expect(formatTanggalPendek(wib("2026-11-01", "06:00"))).toBe("1 Nov");
    expect(formatTanggalPanjang("2026-10-26")).toBe("26 Oktober 2026");
    expect(formatDurasi(543)).toBe("9 jam 3 menit");
    expect(formatDurasi(45)).toBe("45 menit");
    expect(formatDurasi(120)).toBe("2 jam");
  });
});

describe("buttonState (tabel spec 5.3)", () => {
  it("belum clock in hari ini", () => {
    const view = buttonState(EMPTY, wib("2026-10-27", "06:50"));
    expect(view.clockIn).toEqual({ state: "aktif", label: "Clock In" });
    expect(view.clockOut).toEqual({ state: "nonaktif", label: "Clock in dulu" });
    expect(view.durasi).toBeNull();
  });

  it("sudah clock in, belum clock out", () => {
    const open = shift({ workDate: "2026-10-27", masukAt: wib("2026-10-27", "07:02"), status: "terbuka" });
    const view = buttonState({ today: open, open, last: null }, wib("2026-10-27", "10:00"));
    expect(view.clockIn).toEqual({ state: "selesai", label: "✓ Sudah clock in · 07:02" });
    expect(view.clockOut).toEqual({ state: "aktif", label: "Clock Out" });
    expect(view.shiftDateLabel).toBeNull();
  });

  it("sudah clock in dan clock out", () => {
    const done = shift({
      workDate: "2026-10-27",
      masukAt: wib("2026-10-27", "07:02"),
      pulangAt: wib("2026-10-27", "16:05"),
      status: "selesai",
      durationMin: 543,
    });
    const view = buttonState({ today: done, open: null, last: done }, wib("2026-10-27", "16:10"));
    expect(view.clockIn).toEqual({ state: "selesai", label: "✓ Sudah clock in · 07:02" });
    expect(view.clockOut).toEqual({ state: "selesai", label: "✓ Sudah clock out · 16:05" });
    expect(view.durasi).toBe("9 jam 3 menit");
    expect(view.lastShiftLine).toBeNull();
  });

  it("ditutup otomatis karena lupa clock out", () => {
    const stale = shift({ workDate: "2026-10-27", masukAt: wib("2026-10-27", "07:02"), status: "lupa_pulang" });
    const view = buttonState({ today: stale, open: null, last: stale }, wib("2026-10-27", "23:30"));
    expect(view.clockIn).toEqual({ state: "selesai", label: "✓ Sudah clock in · 07:02" });
    expect(view.clockOut).toEqual({ state: "tidak_clock_out", label: "Tidak clock out" });
    expect(view.durasi).toBeNull();
  });

  it("shift malam dari kemarin masih terbuka: tampil dengan tanggalnya", () => {
    const open = shift({ workDate: "2026-10-26", masukAt: wib("2026-10-26", "22:00"), status: "terbuka" });
    const view = buttonState({ today: null, open, last: null }, wib("2026-10-27", "05:00"));
    expect(view.shiftDateLabel).toBe("Shift 26 Okt");
    expect(view.clockIn).toEqual({ state: "selesai", label: "✓ Sudah clock in · 22:00" });
    expect(view.clockOut).toEqual({ state: "aktif", label: "Clock Out" });
  });

  it("sesudah clock out shift malam jam 06:00: baris shift terakhir dan Clock In aktif lagi", () => {
    const last = shift({
      workDate: "2026-10-26",
      masukAt: wib("2026-10-26", "22:00"),
      pulangAt: wib("2026-10-27", "06:00"),
      status: "selesai",
      durationMin: 480,
    });
    const view = buttonState({ today: null, open: null, last }, wib("2026-10-27", "06:10"));
    expect(view.lastShiftLine).toBe("Shift terakhir: 26 Okt, 22:00–06:00 ✓");
    expect(view.clockIn).toEqual({ state: "aktif", label: "Clock In" });
    expect(view.clockOut).toEqual({ state: "nonaktif", label: "Clock in dulu" });
  });

  it("shift terakhir yang ditutup kemarin tidak ditampilkan lagi", () => {
    const last = shift({
      workDate: "2026-10-26",
      masukAt: wib("2026-10-26", "07:00"),
      pulangAt: wib("2026-10-26", "15:00"),
      status: "selesai",
      durationMin: 480,
    });
    expect(buttonState({ today: null, open: null, last }, wib("2026-10-27", "06:10")).lastShiftLine).toBeNull();
  });

  it("membuka kembali Clock In saat lewat tengah malam WIB tanpa reload", () => {
    const yesterdayDone = shift({
      workDate: "2026-10-26",
      masukAt: wib("2026-10-26", "07:00"),
      pulangAt: wib("2026-10-26", "16:00"),
      status: "selesai",
      durationMin: 540,
    });
    const view = buttonState({ today: yesterdayDone, open: null, last: yesterdayDone }, wib("2026-10-27", "00:05"));
    expect(view.clockIn).toEqual({ state: "aktif", label: "Clock In" });
    expect(view.clockOut).toEqual({ state: "nonaktif", label: "Clock in dulu" });
  });

  it("mengubah shift terbuka yang lewat 20 jam menjadi Tidak clock out secara reaktif", () => {
    const staleOpen = shift({
      workDate: "2026-10-27",
      masukAt: wib("2026-10-27", "01:00"),
      status: "terbuka",
    });
    const view = buttonState({ today: staleOpen, open: staleOpen, last: staleOpen }, wib("2026-10-27", "21:30"));
    expect(view.clockIn).toEqual({ state: "selesai", label: "✓ Sudah clock in · 01:00" });
    expect(view.clockOut).toEqual({ state: "tidak_clock_out", label: "Tidak clock out" });
  });
});
