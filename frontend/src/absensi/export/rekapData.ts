// Data rekap terpadu (shift hadir + cuti/sakit/izin + pergantian shift) untuk layar Rekap, Excel, dan Word.
import { isSilahOn, type SilahHistoryEntry } from "../../../../workers/absensi/shared/silah.js";
import { isLateClockIn } from "../../../../workers/absensi/shared/time.js";
import {
  LEAVE_TYPE_LABEL,
  SHIFT_STATUS_LABEL,
  expandDatesInRange,
  formatDurasi,
  formatJam,
  formatTanggalPanjang,
  isClockInRejected,
  rejectedLabel,
  worstZoneStatus,
  zoneNotes,
} from "@/absensi/logic/format";
import type { AbsensiRequestView, LeaveType, RekapRow, RequestStatus, SilahEntry } from "@/absensi/types";

/** Rentang rekap + riwayat jadwal Silah (hari Silah hanya dihitung sampai `today`). */
export interface RekapRange {
  from?: string;
  to?: string;
  silah?: SilahEntry[];
  /** `YYYY-MM-DD` hari ini (WIB); hari Silah sesudahnya belum terjadi. */
  today?: string;
}

export interface RekapMeta {
  /** `YYYY-MM-DD` */
  from: string;
  to: string;
  areaNames: string[];
  printedBy: string;
  printedAt: number;
  silah?: SilahEntry[];
  today?: string;
}

export interface RekapSummary {
  uid: string;
  name: string;
  hariHadir: number;
  cuti: number;
  sakit: number;
  izin: number;
  silah: number;
  tidakClockOut: number;
  pergantianShift: number;
  totalMenit: number;
}

export interface UnifiedRekapItem {
  key: string;
  kind: "shift" | "leave" | "silah";
  uid: string;
  name: string;
  workDate: string;
  masukAt: number | null;
  pulangAt: number | null;
  durationMin: number | null;
  statusLabel: string;
  badgeTone: "selesai" | "terbuka" | "lupa_pulang" | "cuti" | "sakit" | "izin" | "silah";
  /** Clock in lewat 08:00 WIB. */
  late: boolean;
  /** Absen di luar zona: menunggu (perlu verifikasi) / disetujui / ditolak; null = di dalam zona. */
  zoneStatus: RequestStatus | null;
  /** Kolom "Area / Keterangan" lengkap (tabel layar lebar & export). */
  info: string;
  areaName: string | null;
  /** Keterangan tanpa nama area (alasan terlambat, pergantian shift, alasan cuti) untuk kartu di HP. */
  notes: string[];
  shiftRow: RekapRow | null;
}

export const SUMMARY_HEADER = [
  "Nama",
  "Hari hadir",
  "Cuti",
  "Sakit",
  "Izin",
  "Silah",
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
    silah: 0,
    tidakClockOut: 0,
    pergantianShift: 0,
    totalMenit: 0,
  };
}

export const SILAH_SHIFT_NOTE = "Masuk di hari Silah";

/** Setiap hari Silah per karyawan di rentang (sampai hari ini), dengan kunci `uid:tanggal`. */
function silahDayMap(range?: RekapRange): Map<string, { uid: string; name: string; date: string }> {
  const out = new Map<string, { uid: string; name: string; date: string }>();
  if (!range?.from || !range.to || !range.silah?.length) return out;
  const last = range.today && range.today < range.to ? range.today : range.to;
  const dates = expandDatesInRange(range.from, last);
  const byUid = new Map<string, { name: string; history: SilahHistoryEntry[] }>();
  for (const entry of range.silah) {
    const person = byUid.get(entry.uid) ?? { name: entry.name, history: [] };
    person.history.push({ effectiveFrom: entry.effectiveFrom, days: entry.days });
    byUid.set(entry.uid, person);
  }
  for (const [uid, { name, history }] of byUid) {
    for (const date of dates) {
      if (isSilahOn(history, date)) out.set(`${uid}:${date}`, { uid, name, date });
    }
  }
  return out;
}

/** Menggabungkan baris shift, pengajuan disetujui, dan hari Silah menjadi daftar harian terurut. */
export function buildUnifiedRekapItems(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: RekapRange,
): UnifiedRekapItem[] {
  const swapNoteByUidDate = new Map<string, string>();
  for (const r of requests) {
    if (r.status === "approved" && r.kind === "pergantian_shift") {
      const partner = r.partnerName ? ` (rekan: ${r.partnerName})` : "";
      swapNoteByUidDate.set(`${r.uid}:${r.startDate}`, `Shift: ${r.fromShift} → ${r.toShift}${partner}`);
    }
  }

  const silahDays = silahDayMap(range);
  const shiftDates = new Set<string>();
  const items: UnifiedRekapItem[] = rows.map((row) => {
    const key = `${row.uid}:${row.workDate}`;
    shiftDates.add(key);
    const swapNote = swapNoteByUidDate.get(key);
    const lateNote = row.lateReason
      ? `Alasan terlambat: ${row.lateReason}${row.latePhotoId ? " (ada foto bukti)" : ""}`
      : null;
    const zoneStatus = worstZoneStatus(row);
    // Shift dengan status persetujuan Silah sudah punya catatan sendiri dari zoneNotes.
    const silahNote = silahDays.has(key) && !row.silahMasuk ? SILAH_SHIFT_NOTE : null;
    const notes = [...zoneNotes(row), lateNote, swapNote, silahNote].filter((note): note is string => Boolean(note));
    const infoParts = [row.areaName, ...notes].filter(Boolean);
    return {
      key: `shift-${row.shiftId}`,
      kind: "shift",
      uid: row.uid,
      name: row.name,
      workDate: row.workDate,
      masukAt: row.masukAt,
      pulangAt: row.pulangAt,
      durationMin: row.durationMin,
      statusLabel: zoneStatus === "pending"
        ? `${SHIFT_STATUS_LABEL[row.status]} · Perlu verifikasi`
        : zoneStatus === "rejected"
          ? `${SHIFT_STATUS_LABEL[row.status]} · ${rejectedLabel(row)}`
          : SHIFT_STATUS_LABEL[row.status],
      badgeTone: row.status,
      late: isLateClockIn(row.masukAt),
      zoneStatus,
      info: infoParts.length > 0 ? infoParts.join(" · ") : "-",
      areaName: row.areaName,
      notes,
      shiftRow: row,
    };
  });

  const leaveAdded = new Set<string>();
  for (const r of requests) {
    if (r.status !== "approved" || r.kind !== "cuti" || !r.leaveType) continue;
    const dates = expandDatesInRange(r.startDate, r.endDate, range?.from, range?.to);
    for (const date of dates) {
      const uidDate = `${r.uid}:${date}`;
      // Hari Silah bukan hari kerja, jadi tidak memotong cuti/sakit/izin.
      if (shiftDates.has(uidDate) || silahDays.has(uidDate) || leaveAdded.has(uidDate)) continue;
      leaveAdded.add(uidDate);
      const leaveType: LeaveType = r.leaveType;
      const typeTitle = r.leaveSubtype || LEAVE_TYPE_LABEL[leaveType];
      const partnerSuffix = r.partnerName ? ` (Pengganti: ${r.partnerName})` : "";
      const info = `${r.reason ? `${typeTitle}: ${r.reason}` : typeTitle}${partnerSuffix}`;
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
        late: false,
        zoneStatus: null,
        info,
        areaName: null,
        notes: [info],
        shiftRow: null,
      });
    }
  }

  for (const [uidDate, { uid, name, date }] of silahDays) {
    if (shiftDates.has(uidDate)) continue;
    items.push({
      key: `silah-${uidDate}`,
      kind: "silah",
      uid,
      name,
      workDate: date,
      masukAt: null,
      pulangAt: null,
      durationMin: null,
      statusLabel: "Silah",
      badgeTone: "silah",
      late: false,
      zoneStatus: null,
      info: "Libur mingguan",
      areaName: null,
      notes: [],
      shiftRow: null,
    });
  }

  return items.sort(byDateThenName);
}

/** Satu baris ringkasan per karyawan; `totalMenit` dihitung dari shift yang selesai. */
export function summarizeRekap(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: RekapRange,
): RekapSummary[] {
  const byUid = new Map<string, RekapSummary>();
  const shiftDates = new Set<string>();
  const silahDays = silahDayMap(range);

  for (const row of rows) {
    shiftDates.add(`${row.uid}:${row.workDate}`);
    const summary = byUid.get(row.uid) ?? emptySummary(row.uid, row.name);
    // Clock in luar zona / di hari Silah yang ditolak kepala unit / admin tidak dihitung hadir.
    if (!isClockInRejected(row)) summary.hariHadir += 1;
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
        if (shiftDates.has(uidDate) || silahDays.has(uidDate) || leaveAdded.has(uidDate)) continue;
        leaveAdded.add(uidDate);
        if (r.leaveType === "sakit") summary.sakit += 1;
        else if (r.leaveType === "izin") summary.izin += 1;
        else summary.cuti += 1;
      }
    }
    byUid.set(r.uid, summary);
  }

  for (const [uidDate, { uid, name }] of silahDays) {
    if (shiftDates.has(uidDate)) continue;
    const summary = byUid.get(uid) ?? emptySummary(uid, name);
    summary.silah += 1;
    byUid.set(uid, summary);
  }

  return [...byUid.values()].sort(byName);
}

function detailCells(item: UnifiedRekapItem, withName: boolean): string[] {
  const cells = [
    formatTanggalPanjang(item.workDate),
    item.masukAt !== null ? formatJam(item.masukAt) : "-",
    item.pulangAt !== null ? formatJam(item.pulangAt) : "-",
    item.durationMin !== null ? formatDurasi(item.durationMin) : "-",
    item.late ? `${item.statusLabel} · Terlambat` : item.statusLabel,
    item.info,
  ];
  if (withName) cells.splice(1, 0, item.name);
  return cells;
}

/** Tabel siap tulis (baris pertama = header). */
export function rekapTables(
  rows: RekapRow[],
  requests: AbsensiRequestView[] = [],
  range?: RekapRange,
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
        String(s.silah),
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
