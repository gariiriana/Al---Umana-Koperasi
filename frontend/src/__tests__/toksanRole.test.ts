import { describe, expect, it } from "vitest";
import { ROLE_DEFAULT_REDIRECT, ROLE_PERMISSIONS } from "@/constants/roles";
import { navItemsForRole } from "@/components/layout/navItems";
import { formatRupiah, formatTanggalPanjang, toksanErrorMessage } from "@/toksan/format";
import { ToksanApiError } from "@/toksan/api";

const menu = (role: string) => navItemsForRole(role).map((item) => item.label);
const TOKSAN_MENU = ["Input Harian", "Obral", "Rekap", "Trafik Produk", "Produk Toksan"];

describe("role Toksan", () => {
  it("admin Toksan sees exactly the five Toksan pages and lands on Input Harian", () => {
    expect(menu("toksan")).toEqual(TOKSAN_MENU);
    expect(ROLE_DEFAULT_REDIRECT.toksan).toBe("/toksan/input");
  });

  it("super_admin and developer can open Toksan", () => {
    for (const role of ["super_admin", "developer"]) {
      expect(ROLE_PERMISSIONS[role]).toEqual(expect.arrayContaining(["/toksan/input", "/toksan/rekap"]));
    }
  });

  it("other roles, including catering admin and kepala unit, never see Toksan", () => {
    for (const role of ["admin", "kepala_unit", "tim_unit", "kurir", "admin_mbg"]) {
      for (const label of TOKSAN_MENU) expect(menu(role)).not.toContain(label);
    }
  });
});

describe("format Toksan", () => {
  it("formats rupiah with id-ID grouping", () => {
    expect(formatRupiah(12_450_000)).toBe("Rp12.450.000");
    expect(formatRupiah(0)).toBe("Rp0");
  });

  it("formats long Indonesian dates", () => {
    expect(formatTanggalPanjang("2026-11-14")).toBe("Sabtu, 14 November 2026");
  });

  it("explains error codes in Indonesian", () => {
    expect(toksanErrorMessage(new ToksanApiError("DUPLIKAT", 409))).toMatch(/sudah ada/i);
    expect(toksanErrorMessage(new ToksanApiError("JARINGAN", 0))).toMatch(/internet|jaringan/i);
    expect(toksanErrorMessage(new Error("x"))).toBeTruthy();
  });
});
