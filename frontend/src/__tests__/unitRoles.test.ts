import { describe, expect, it } from "vitest";
import { ALL_ROLES, ROLE_DEFAULT_REDIRECT, ROLE_PERMISSIONS, UNIT_ROLES } from "@/constants/roles";
import { UNITS, unitName, unitPositionLabel } from "@/constants/units";
import { navItemsForRole } from "@/components/layout/navItems";

describe("role unit usaha", () => {
  it("Kepala Unit membuka KPI & Task Unit dan Performa Saya; Tim Unit hanya Performa Saya", () => {
    expect(navItemsForRole("kepala_unit").map((item) => item.to)).toEqual(["/unit/control-center", "/performance"]);
    expect(navItemsForRole("tim_unit").map((item) => item.to)).toEqual(["/performance"]);
    expect(ROLE_DEFAULT_REDIRECT.kepala_unit).toBe("/unit/control-center");
    expect(ROLE_DEFAULT_REDIRECT.tim_unit).toBe("/performance");
  });

  it("role unit tidak bisa dipilih lewat Pindahkan role dan tidak membuka Control Center Super Admin", () => {
    for (const role of UNIT_ROLES) {
      expect(ALL_ROLES as readonly string[]).not.toContain(role);
      expect(ROLE_PERMISSIONS[role]).not.toContain("/super-admin/control-center");
    }
    expect(navItemsForRole("super_admin").map((item) => item.to)).not.toContain("/unit/control-center");
  });

  it("tujuh unit dengan nama tampilan dan jabatan", () => {
    expect(UNITS).toHaveLength(7);
    expect(new Set(UNITS.map((unit) => unit.id)).size).toBe(7);
    expect(unitName("al_umanaa_medika")).toBe("Al Umanaa Medika");
    expect(unitName("unit_lama")).toBe("unit_lama");
    expect(unitPositionLabel("pengabdian")).toBe("Pengabdian");
    expect(unitPositionLabel(undefined)).toBe("Anggota");
  });
});
