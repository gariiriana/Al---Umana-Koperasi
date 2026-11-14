// Periode rekap dalam WIB. Tanggal selalu string YYYY-MM-DD; hitungan pakai UTC supaya tidak terpengaruh zona perangkat.
import { BULAN } from "@/toksan/format";

export interface Range {
  dari: string;
  sampai: string;
}

const DAY_MS = 86_400_000;
const WIB_OFFSET_MS = 7 * 3_600_000;

const toMs = (iso: string) => Date.parse(`${iso}T00:00:00Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export function todayWib(now: Date = new Date()): string {
  return toIso(now.getTime() + WIB_OFFSET_MS);
}

export function addDays(iso: string, days: number): string {
  return toIso(toMs(iso) + days * DAY_MS);
}

/** Senin sampai Minggu yang memuat `tanggal`. */
export function weekRange(tanggal: string): Range {
  const day = new Date(toMs(tanggal)).getUTCDay(); // 0 = Minggu
  const dari = addDays(tanggal, -((day + 6) % 7));
  return { dari, sampai: addDays(dari, 6) };
}

export function monthRange(tanggal: string): Range {
  const [y, m] = tanggal.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return { dari: `${y}-${mm}-01`, sampai: `${y}-${mm}-${String(last).padStart(2, "0")}` };
}

export function datesBetween(dari: string, sampai: string): string[] {
  const out: string[] = [];
  for (let ms = toMs(dari); ms <= toMs(sampai); ms += DAY_MS) out.push(toIso(ms));
  return out;
}

const parts = (iso: string) => {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
};

/** "9 – 15 November 2026", "27 Oktober – 2 November 2026", "28 Desember 2026 – 3 Januari 2027" */
export function weekLabel({ dari, sampai }: Range): string {
  const a = parts(dari);
  const b = parts(sampai);
  const end = `${b.d} ${BULAN[b.m - 1]} ${b.y}`;
  if (a.y !== b.y) return `${a.d} ${BULAN[a.m - 1]} ${a.y} – ${end}`;
  if (a.m !== b.m) return `${a.d} ${BULAN[a.m - 1]} – ${end}`;
  return `${a.d} – ${end}`;
}

export function monthLabel(tanggal: string): string {
  const { y, m } = parts(tanggal);
  return `${BULAN[m - 1]} ${y}`;
}
