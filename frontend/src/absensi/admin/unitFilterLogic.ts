import type { UnitRef } from "@/absensi/types";

/** Nilai pilihan "Tanpa unit" (karyawan yang belum dimasukkan ke unit mana pun). "" = semua unit. */
export const NO_UNIT = "__tanpa_unit";

export function matchesUnit(selected: string, unitId: string | null | undefined): boolean {
  if (!selected) return true;
  if (selected === NO_UNIT) return !unitId;
  return unitId === selected;
}

export function unitLabel(selected: string, units: UnitRef[]): string | undefined {
  if (!selected) return undefined;
  if (selected === NO_UNIT) return "Tanpa unit";
  return units.find((u) => u.id === selected)?.name;
}
