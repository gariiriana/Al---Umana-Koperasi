// Data rekap terpadu (shift hadir + cuti/sakit/izin + pergantian shift) untuk layar Rekap, Excel, dan Word.
import {
  LEAVE_TYPE_LABEL,
  SHIFT_STATUS_LABEL,
  expandDatesInRange,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, LeaveType, RekapRow } from "@/absensi/types";

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
  cuti: number;
  sakit: number;
  izin: number;
  tidakClockOut: number;
  pergantianShift: number;
  totalMenit: number;
}

export interface UnifiedRekapItem {
  key: string;
  kind: "shift" | "leave";
  uid: string;
  name: string;
  workDate: string;
  masukAt: number | null;
  pulangAt: number | null;
  durationMin: number | null;
  statusLabel: string;
  badgeTone: "selesai" | "terbuka" | "lupa_pulang" | "cuti" | "sakit" | "izin";
  info: string;
  shiftRow: RekapRow | null;
}

export const SUMMARY_HEADER = [
  "Nama",
  "Hari hadir",
  "Cuti",
  "Sakit",
  "Izin",
  "Tidak clock out",
  "Pergantian shift",
  "Total jam kerja",
];
export const DETAIL_HEADER = ["Tanggal", "Nama", "Clock in", "Clock out", "Durasi", "Status", "Area / Keterangan"];
const EMPLOYEE_DETAIL_HEADER = DETAIL_HEADER.filter((cell) => cell !== "Nama");

const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name, "id");
const byDateThenName = (a: { workDate: string; name: string }, b: { workDate: string; name: string }) =>
  a.workDate.localeCompare(b.workDate) || byName(a, b);

function emptySummary(uid: string, name: string): RekapSummary {
  return {
    uid,
    name,
    hariHadir: 0,
    cuti: 0,
    sakit: 0,
    izin: 0,
    tidakClockOut: 0,
    pergantianShift: 0,
    totalMenit: 0,
  };
}

/** Menggabungkan baris shift dan pengajuan disetujui menjadi daftar harian terurut. */
export function buildUnifiedRekapItems(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: { from?: string; to?: string },
): UnifiedRekapItem[] {
  const swapNoteByUidDate = new Map<string, string>();
  for (const r of requests) {
    if (r.status === "approved" && r.kind === "pergantian_shift") {
      const partner = r.partnerName ? ` (rekan: ${r.partnerName})` : "";
      swapNoteByUidDate.set(`${r.uid}:${r.startDate}`, `Shift: ${r.fromShift} → ${r.toShift}${partner}`);
    }
  }

  const shiftDates = new Set<string>();
  const items: UnifiedRekapItem[] = rows.map((row) => {
    const key = `${row.uid}:${row.workDate}`;
    shiftDates.add(key);
    const swapNote = swapNoteByUidDate.get(key);
    const infoParts = [row.areaName, swapNote].filter(Boolean);
    return {
      key: `shift-${row.shiftId}`,
      kind: "shift",
      uid: row.uid,
      name: row.name,
      workDate: row.workDate,
      masukAt: row.masukAt,
      pulangAt: row.pulangAt,
      durationMin: row.durationMin,
      statusLabel: SHIFT_STATUS_LABEL[row.status],
      badgeTone: row.status,
      info: infoParts.length > 0 ? infoParts.join(" · ") : "-",
      shiftRow: row,
    };
  });

  const leaveAdded = new Set<string>();
  for (const r of requests) {
    if (r.status !== "approved" || r.kind !== "cuti" || !r.leaveType) continue;
    const dates = expandDatesInRange(r.startDate, r.endDate, range?.from, range?.to);
    for (const date of dates) {
      const uidDate = `${r.uid}:${date}`;
      if (shiftDates.has(uidDate) || leaveAdded.has(uidDate)) continue;
      leaveAdded.add(uidDate);
      const leaveType: LeaveType = r.leaveType;
      const typeTitle = r.leaveSubtype || LEAVE_TYPE_LABEL[leaveType];
      const partnerSuffix = r.partnerName ? ` (Pengganti: ${r.partnerName})` : "";
      items.push({
        key: `leave-${r.id}-${date}`,
        kind: "leave",
        uid: r.uid,
        name: r.employeeName || r.uid,
        workDate: date,
        masukAt: null,
        pulangAt: null,
        durationMin: null,
        statusLabel: LEAVE_TYPE_LABEL[leaveType],
        badgeTone: leaveType,
        info: `${r.reason ? `${typeTitle}: ${r.reason}` : typeTitle}${partnerSuffix}`,
        shiftRow: null,
      });
    }
  }

  return items.sort(byDateThenName);
}

/** Satu baris ringkasan per karyawan; `totalMenit` dihitung dari shift yang selesai. */
export function summarizeRekap(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: { from?: string; to?: string },
): RekapSummary[] {
  const byUid = new Map<string, RekapSummary>();
  const shiftDates = new Set<string>();

  for (const row of rows) {
    shiftDates.add(`${row.uid}:${row.workDate}`);
    const summary = byUid.get(row.uid) ?? emptySummary(row.uid, row.name);
    summary.hariHadir += 1;
    if (row.status === "lupa_pulang") summary.tidakClockOut += 1;
    if (row.status === "selesai" && row.durationMin !== null) summary.totalMenit += row.durationMin;
    byUid.set(row.uid, summary);
  }

  const leaveAdded = new Set<string>();
  for (const r of requests) {
    if (r.status !== "approved") continue;
    const summary = byUid.get(r.uid) ?? emptySummary(r.uid, r.employeeName || r.uid);
    if (r.kind === "pergantian_shift") {
      if ((!range?.from || r.startDate >= range.from) && (!range?.to || r.startDate <= range.to)) {
        summary.pergantianShift += 1;
      }
    } else if (r.kind === "cuti" && r.leaveType) {
      for (const date of expandDatesInRange(r.startDate, r.endDate, range?.from, range?.to)) {
        const uidDate = `${r.uid}:${date}`;
        if (shiftDates.has(uidDate) || leaveAdded.has(uidDate)) continue;
        leaveAdded.add(uidDate);
        if (r.leaveType === "sakit") summary.sakit += 1;
        else if (r.leaveType === "izin") summary.izin += 1;
        else summary.cuti += 1;
      }
    }
    byUid.set(r.uid, summary);
  }

  return [...byUid.values()].sort(byName);
}

function detailCells(item: UnifiedRekapItem, withName: boolean): string[] {
  const cells = [
    formatTanggalPanjang(item.workDate),
    item.masukAt !== null ? formatJam(item.masukAt) : "-",
    item.pulangAt !== null ? formatJam(item.pulangAt) : "-",
    item.durationMin !== null ? formatDurasi(item.durationMin) : "-",
    item.statusLabel,
    item.info,
  ];
  if (withName) cells.splice(1, 0, item.name);
  return cells;
}

/** Tabel siap tulis (baris pertama = header). */
export function rekapTables(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: { from?: string; to?: string },
): {
  summary: string[][];
  detail: string[][];
  detailByEmployee: { name: string; rows: string[][] }[];
} {
  const summaries = summarizeRekap(rows, requests, range);
  const items = buildUnifiedRekapItems(rows, requests, range);
  return {
    summary: [
      SUMMARY_HEADER,
      ...summaries.map((s) => [
        s.name,
        String(s.hariHadir),
        String(s.cuti),
        String(s.sakit),
        String(s.izin),
        String(s.tidakClockOut),
        String(s.pergantianShift),
        formatDurasi(s.totalMenit),
      ]),
    ],
    detail: [DETAIL_HEADER, ...items.map((item) => detailCells(item, true))],
    detailByEmployee: summaries.map((s) => ({
      name: s.name,
      rows: [
        EMPLOYEE_DETAIL_HEADER,
        ...items.filter((item) => item.uid === s.uid).map((item) => detailCells(item, false)),
      ],
    })),
  };
}

export function rekapFileName(from: string, to: string, ext: "xlsx" | "docx"): string {
  return `Rekap-Absensi_${from}_${to}.${ext}`;
}
