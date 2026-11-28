import { NO_UNIT } from "@/absensi/admin/unitFilterLogic";
import type { UnitRef } from "@/absensi/types";

export interface UnitFilterProps {
  units: UnitRef[];
  value: string;
  onChange: (value: string) => void;
  /** Tampilkan pilihan "Tanpa unit" (ada karyawan yang belum punya unit). */
  showNoUnit?: boolean;
  className?: string;
  selectClassName?: string;
}

/**
 * Filter unit untuk Hari Ini / Rekap. Hanya muncul kalau ada lebih dari satu pilihan, jadi admin absensi dan yang
 * diizinkan lihat semua unit melihatnya, sedangkan kepala satu unit tidak.
 */
export function UnitFilter({ units, value, onChange, showNoUnit = false, className, selectClassName }: UnitFilterProps) {
  if (units.length + (showNoUnit ? 1 : 0) < 2) return null;
  return (
    <label className={className ?? "flex flex-col gap-1.5 text-xs font-bold text-neutral-700"}>
      <span>Unit</span>
      <select
        className={selectClassName ?? "rounded-xl border border-neutral-200 bg-white px-3 py-2 text-sm font-bold text-neutral-900 focus:border-amber-400 focus:outline-none focus:ring-2 focus:ring-amber-200"}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        <option value="">Semua unit</option>
        {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
        {showNoUnit && <option value={NO_UNIT}>Tanpa unit</option>}
      </select>
    </label>
  );
}
