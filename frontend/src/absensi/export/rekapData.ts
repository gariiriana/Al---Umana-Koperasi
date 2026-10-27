// Data rekap yang dipakai bersama oleh export Excel dan Word (dibuat di browser dari GET /admin/rekap).
import { SHIFT_STATUS_LABEL, formatDurasi, formatJam, formatTanggalPanjang } from "@/absensi/logic/format";
import type { RekapRow } from "@/absensi/types";

export interface RekapMeta {
  /** `YYYY-MM-DD` */
  from: string;
  to: string;
  areaNames: string[];
  printedBy: string;
  printedAt: number;
}

export interface RekapSummary {
  uid: string;
  name: string;
  hariHadir: number;
  tidakClockOut: number;
  totalMenit: number;
}

export const SUMMARY_HEADER = ["Nama", "Hari hadir", "Tidak clock out", "Total jam kerja"];
export const DETAIL_HEADER = ["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status", "Area"];
const EMPLOYEE_DETAIL_HEADER = DETAIL_HEADER.filter((cell) => cell !== "Nama");

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "id");
const byDateThenName = (a: RekapRow, b: RekapRow) => a.workDate.localeCompare(b.workDate) || byName(a, b);

/** Satu baris per karyawan; `totalMenit` hanya dari shift yang lengkap. */
export function summarizeRekap(rows: RekapRow[]): RekapSummary[] {
  const byUid = new Map<string, RekapSummary>();
  for (const row of rows) {
    const summary = byUid.get(row.uid) ?? { uid: row.uid, name: row.name, hariHadir: 0, tidakClockOut: 0, totalMenit: 0 };
    summary.hariHadir += 1;
    if (row.status === "lupa_pulang") summary.tidakClockOut += 1;
    if (row.status === "selesai" && row.durationMin !== null) summary.totalMenit += row.durationMin;
    byUid.set(row.uid, summary);
  }
  return [...byUid.values()].sort(byName);
}

function detailCells(row: RekapRow, withName: boolean): string[] {
  const cells = [
    formatTanggalPanjang(row.workDate),
    formatJam(row.masukAt),
    row.pulangAt !== null ? formatJam(row.pulangAt) : "-",
    row.durationMin !== null ? formatDurasi(row.durationMin) : "-",
    SHIFT_STATUS_LABEL[row.status],
    row.areaName ?? "-",
  ];
  if (withName) cells.splice(1, 0, row.name);
  return cells;
}

/** Tabel siap tulis (baris pertama = header). */
export function rekapTables(rows: RekapRow[]): {
  summary: string[][];
  detail: string[][];
  detailByEmployee: { name: string; rows: string[][] }[];
} {
  const summaries = summarizeRekap(rows);
  const sorted = [...rows].sort(byDateThenName);
  return {
    summary: [
      SUMMARY_HEADER,
      ...summaries.map((s) => [s.name, String(s.hariHadir), String(s.tidakClockOut), formatDurasi(s.totalMenit)]),
    ],
    detail: [DETAIL_HEADER, ...sorted.map((row) => detailCells(row, true))],
    detailByEmployee: summaries.map((s) => ({
      name: s.name,
      rows: [EMPLOYEE_DETAIL_HEADER, ...sorted.filter((row) => row.uid === s.uid).map((row) => detailCells(row, false))],
    })),
  };
}

export function rekapFileName(from: string, to: string, ext: "xlsx" | "docx"): string {
  return `Rekap-Absensi_${from}_${to}.${ext}`;
}
