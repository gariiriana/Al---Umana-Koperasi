import { describe, expect, it } from "vitest";
import { ROLE_DEFAULT_REDIRECT } from "@/constants/roles";
import { navItemsForRole } from "@/components/layout/navItems";

const menu = (role: string) => navItemsForRole(role).map((item) => item.label);

// Pembagian akun MBG per 2026-11-12 (grup WA): Wandi = adminmbg@, Hashifah = produksimbg@, Dwi = distribusimbg@.
describe("menu akun MBG", () => {
  it("adminmbg@ (Kang Wandi): data PM, Arsip PM, Distribusi MBG (penugasan kurir), Kurir MBG (monitoring dokumentasi), Job Desk Teklap, Performa Saya", () => {
    expect(menu("admin_mbg")).toEqual(["Job Desk Teklap", "Admin MBG", "Arsip PM", "Distribusi MBG", "Kurir MBG", "Performa Saya"]);
    expect(ROLE_DEFAULT_REDIRECT.admin_mbg).toBe("/mbg/admin");
  });

  it("produksimbg@: Produksi MBG, Arsip PM, Job Desk Teklap, Performa Saya", () => {
    expect(menu("produksi_mbg")).toEqual(["Job Desk Teklap", "Arsip PM", "Produksi MBG", "Performa Saya"]);
    expect(ROLE_DEFAULT_REDIRECT.produksi_mbg).toBe("/mbg/production");
  });

  it("distribusimbg@ (Ustadz Dwi): hanya Persiapan (Cek List & Dokumentasi Bahan), Job Desk Teklap, Performa Saya", () => {
    expect(menu("distribusi_mbg")).toEqual(["Job Desk Teklap", "Persiapan", "Performa Saya"]);
    expect(ROLE_DEFAULT_REDIRECT.distribusi_mbg).toBe("/mbg/persiapan");
  });

  it("Cek List & Dokumentasi Bahan tidak ada di menu adminmbg@ maupun produksimbg@", () => {
    expect(menu("admin_mbg")).not.toContain("Persiapan");
    expect(menu("produksi_mbg")).not.toContain("Persiapan");
  });
});
