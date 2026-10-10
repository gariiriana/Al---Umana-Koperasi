import { monthLabel } from "@/utils/taskKpi";

/** Pemilih bulan berlabel Indonesia (11 bulan ke belakang s/d 2 bulan ke depan). */
export function PeriodSelect({ value, onChange, today, label = "Periode" }: {
  value: string; onChange: (v: string) => void; today: string; label?: string;
}) {
  const [y, m] = today.split("-").map(Number);
  const keys: string[] = [];
  for (let i = 2; i >= -11; i--) {
    const d = new Date(Date.UTC(y, m - 1 + i, 1));
    keys.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`);
  }
  if (!keys.includes(value)) keys.push(value);
  return (
    <label className="flex items-center gap-2 text-sm text-[#6B7280]">
      <span className="hidden sm:inline">{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}
        className="rounded-lg border border-[#E5E7EB] bg-white px-3 py-2 text-sm font-medium text-[#111827] focus:outline-none focus:ring-2 focus:ring-[#FBBF24] cursor-pointer">
        {keys.map((k) => <option key={k} value={k}>{monthLabel(k)}</option>)}
      </select>
    </label>
  );
}
