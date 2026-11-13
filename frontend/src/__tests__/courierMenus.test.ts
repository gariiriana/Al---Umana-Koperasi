import { describe, expect, it } from "vitest";
import { ROLE_DEFAULT_REDIRECT, isCourierRole } from "@/constants/roles";
import { mobileTabsForRole, navItemsForRole } from "@/components/layout/navItems";

// Sejak 2026-11-13 semua kurir (katering & MBG) menerima tugas katering maupun MBG.
describe("menu kurir gabungan", () => {
  it.each(["kurir", "kurir_mbg"])("%s: Tugas Saya, Antar Katering, Antar MBG", (role) => {
    expect(navItemsForRole(role).map((item) => item.label)).toEqual(["Tugas Saya", "Antar Katering", "Antar MBG"]);
    expect(ROLE_DEFAULT_REDIRECT[role]).toBe("/kurir/tugas");
  });

  it.each(["kurir", "kurir_mbg"])("%s: tab bawah HP pendek dan Tugas Saya paling kiri", (role) => {
    const { tabs, hasMore } = mobileTabsForRole(role);
    expect(tabs.map((tab) => tab.shortLabel)).toEqual(["Tugas", "Katering", "MBG"]);
    expect(tabs.map((tab) => tab.to)).toEqual(["/kurir/tugas", "/distribusi/delivery", "/mbg/delivery"]);
    expect(hasMore).toBe(false);
  });

  it("role lain tetap memakai nama menu lama", () => {
    expect(navItemsForRole("admin_mbg").map((item) => item.label)).toContain("Kurir MBG");
    expect(navItemsForRole("admin_mbg").map((item) => item.label)).not.toContain("Tugas Saya");
    expect(navItemsForRole("admin_mbg").every((item) => item.shortLabel === undefined)).toBe(true);
  });

  it("isCourierRole hanya untuk akun kurir", () => {
    expect(isCourierRole("kurir")).toBe(true);
    expect(isCourierRole("kurir_mbg")).toBe(true);
    expect(isCourierRole("admin_mbg")).toBe(false);
    expect(isCourierRole(undefined)).toBe(false);
  });
});
