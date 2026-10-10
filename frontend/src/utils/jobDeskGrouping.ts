import type { CateringJobDesk } from "@/types/cateringJobDesk";

/** Urutan daftar dipertahankan; tugas dikelompokkan per tanggal untuk tampilan kartu HP. */
export function groupJobDesksByTanggal<T extends Pick<CateringJobDesk, "tanggal">>(jobDesks: T[]): Array<[string, T[]]> {
  const groups = new Map<string, T[]>();
  for (const jd of jobDesks) {
    const key = jd.tanggal || "Tanpa tanggal";
    groups.set(key, [...(groups.get(key) ?? []), jd]);
  }
  return [...groups.entries()];
}

/** "2026-10-12" → "12 Okt 2026". */
export function formatTanggalPanjang(tanggal: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(tanggal);
  if (!m) return tanggal;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString("id-ID", { day: "numeric", month: "short", year: "numeric" });
}
