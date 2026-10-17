/**
 * Unit usaha Al-Umanaa. Tiap unit dipimpin satu Kepala Unit (role `kepala_unit`,
 * `users.unitId` = unit yang dipimpin) yang memberi task dan memantau KPI timnya
 * sendiri. Anggota tim tercatat lewat `users.unitIds`; satu orang boleh menjadi
 * anggota beberapa unit.
 */
export const UNITS = [
  { id: "fish_n_kids", name: "Fish n Kids" },
  { id: "kasma_tani", name: "Kasma Tani" },
  { id: "toko_santri", name: "Toko Santri" },
  { id: "kasma_tailor", name: "Kasma Tailor" },
  { id: "kasma_laundry", name: "Kasma Laundry" },
  { id: "kasma_waste_management", name: "Kasma Waste Management" },
  { id: "al_umanaa_medika", name: "Al Umanaa Medika" },
] as const;

export type UnitId = (typeof UNITS)[number]["id"];

/** Jabatan anggota di dalam satu unit (`users.unitPositions[unitId]`). */
export const UNIT_POSITION_LABEL: Record<string, string> = {
  anggota_utama: "Anggota Utama",
  pengabdian: "Pengabdian",
};

export function unitName(unitId: string | undefined): string {
  return UNITS.find((unit) => unit.id === unitId)?.name ?? unitId ?? "-";
}

export function unitPositionLabel(position: string | undefined): string {
  return (position && UNIT_POSITION_LABEL[position]) || "Anggota";
}
