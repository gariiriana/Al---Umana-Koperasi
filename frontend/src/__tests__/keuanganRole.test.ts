import { describe, expect, it } from "vitest";
import { KEUANGAN_PATHS, NO_TASK_ROLES, ROLE_DEFAULT_REDIRECT, ROLE_PERMISSIONS } from "@/constants/roles";
import { navItemsForRole } from "@/components/layout/navItems";
import { formatQtyMilli, formatSen, formatTanggal, keuanganErrorMessage, parseRupiahToSen } from "@/keuangan/format";
import { senCell } from "@/keuangan/export/reportExport";
import { KeuanganApiError } from "@/keuangan/api";

const menu = (role: string) => navItemsForRole(role).map((item) => item.label);
const KEUANGAN_MENU = [
  "Beranda",
  "Ringkasan Bisnis",
  "Laporan",
  "Kas & Bank",
  "Rekonsiliasi Bank",
  "Penjualan",
  "Pembelian",
  "Biaya",
  "Kontak",
  "Produk",
  "Produksi",
  "Aset Tetap",
  "Anggaran",
  "Daftar Akun",
  "Daftar Lainnya",
  "Pengaturan",
];

describe("role Keuangan", () => {
  it("keuangan sees only Keuangan pages and lands on /keuangan/beranda", () => {
    expect(menu("keuangan")).toEqual(KEUANGAN_MENU);
    expect(ROLE_DEFAULT_REDIRECT.keuangan).toBe("/keuangan/beranda");
    expect(NO_TASK_ROLES).toContain("keuangan");
    expect(ROLE_PERMISSIONS.keuangan).not.toContain("/performance");
    expect(KEUANGAN_PATHS).toContain("/keuangan/penjualan");
    expect(KEUANGAN_PATHS).toContain("/keuangan/aset");
    expect(KEUANGAN_PATHS).toContain("/keuangan/produksi");
  });

  it("super_admin, developer, admin, and all other roles NEVER have Keuangan access", () => {
    for (const role of ["super_admin", "developer", "admin", "toksan", "kepala_unit", "tim_unit", "kurir", "admin_mbg"]) {
      const perms = ROLE_PERMISSIONS[role] || [];
      for (const p of KEUANGAN_PATHS) expect(perms).not.toContain(p);
      for (const label of KEUANGAN_MENU) expect(menu(role)).not.toContain(label);
    }
  });
});

describe("format Keuangan (sen & milli)", () => {
  it("formats integer sen accurately including decimal cents", () => {
    expect(formatSen(1_500_000_00)).toBe("Rp1.500.000");
    expect(formatSen(9090909)).toBe("Rp90.909,09");
    expect(formatSen(-50_000_00)).toBe("-Rp50.000");
    expect(formatSen(0)).toBe("Rp0");
  });

  it("formats milli quantities and converts senCell for numeric Excel exports", () => {
    expect(formatQtyMilli(2500, "kg")).toBe("2,5 kg");
    expect(formatQtyMilli(10000, "pcs")).toBe("10 pcs");
    const cell = senCell(1_250_000_50);
    expect(cell.v).toBe(1250000.5);
    expect(cell.text).toContain("1.250.000,50");
  });

  it("parses Indonesian Rupiah input strings back to integer sen", () => {
    expect(parseRupiahToSen("1.500.000")).toBe(1_500_000_00);
    expect(parseRupiahToSen("90.909,09")).toBe(9090909);
  });

  it("formats dates and translates API errors cleanly", () => {
    expect(formatTanggal("2026-01-31")).toBe("31 Januari 2026");
    expect(keuanganErrorMessage(new KeuanganApiError("FORBIDDEN", 403))).toMatch(/tidak memiliki akses/i);
    expect(keuanganErrorMessage(new KeuanganApiError("JARINGAN", 0))).toMatch(/internet/i);
  });
});
