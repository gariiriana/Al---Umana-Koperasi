// ============================================================================
// Export Rekap KPI Task Super Admin → Excel
// Satu worksheet per orang (nama tab = nama orang), berisi ringkasan,
// penilaian KPI otomatis, dan daftar task bulan tersebut.
// ============================================================================

import * as XLSX from "xlsx";
import type { AdHocTask } from "@/services/performanceService";
import {
  KPI_STATUS_LABEL, assessKpi, formatDeadline, formatDuration, formatWib, lateMinutes,
  monthLabel, summarizeTasks, taskKpiStatus, toMillis,
} from "@/utils/taskKpi";

export interface KpiPersonSheet {
  name: string;
  role: string;
  tasks: AdHocTask[];
}

/** Nama sheet Excel: maks 31 karakter, tanpa \ / ? * [ ] :, dan unik. */
export function uniqueSheetName(name: string, used: Set<string>): string {
  const base = (name.replace(/[\\/?*[\]:]/g, " ").replace(/^'+|'+$/g, "").replace(/\s+/g, " ").trim() || "Tanpa Nama").slice(0, 31);
  let candidate = base;
  for (let i = 2; used.has(candidate.toLowerCase()); i++) {
    const suffix = ` (${i})`;
    candidate = base.slice(0, 31 - suffix.length) + suffix;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const byDeadline = (a: AdHocTask, b: AdHocTask) => (a.deadline ?? "").localeCompare(b.deadline ?? "");

function buildPersonSheet(person: KpiPersonSheet, monthKey: string, now: number): XLSX.WorkSheet {
  const periode = monthLabel(monthKey);
  const s = summarizeTasks(person.tasks, now);
  const a = assessKpi(s, person.name, periode);
  const pctText = (n: number) => `${n}%`;

  const rows: (string | number)[][] = [
    ["REKAP KPI TASK SUPER ADMIN"],
    [],
    ["Nama", person.name],
    ["Role", person.role],
    ["Periode", periode],
    ["Dicetak", formatWib(now)],
    [],
    ["RINGKASAN", "Jumlah", "Persentase"],
    ["Total Task", s.total, s.total > 0 ? "100%" : "-"],
    ["Proses", s.proses, pctText(s.pctProses)],
    ["Terpenuhi (tepat waktu)", s.terpenuhi, pctText(s.pctTerpenuhi)],
    ["Terlambat", s.terlambat, pctText(s.pctTerlambat)],
    ["   • Disubmit terlambat", s.terlambatSubmit, ""],
    ["   • Belum submit (deadline lewat)", s.belumSubmit, ""],
    ["Ketepatan Waktu", s.ketepatanWaktu == null ? "-" : `${s.ketepatanWaktu}%`, "Terpenuhi ÷ (Terpenuhi + Terlambat)"],
    ["Rata-rata Keterlambatan", formatDuration(s.avgLateMinutes), ""],
    [],
    ["PENILAIAN KPI", "Bobot", "Skor", "Nilai", "Keterangan"],
    ...a.komponen.map((k) => [k.label, `${Math.round(k.bobot * 100)}%`, k.skor, Math.round(k.skor * k.bobot * 10) / 10, k.keterangan]),
    ["Nilai KPI", "", "", a.nilai ?? "-", ""],
    ["Grade", `${a.grade} — ${a.predikat}`],
    ["Skala", "A ≥ 90 Sangat Baik · B ≥ 75 Baik · C ≥ 60 Cukup · D < 60 Perlu Pembinaan"],
    ["Kesimpulan", a.kesimpulan],
    ["Rekomendasi", a.rekomendasi],
    [],
    ["DAFTAR TASK"],
    ["No", "Judul Task", "Instruksi", "Dibuat", "Deadline", "Waktu Submit", "Status", "Keterlambatan", "Keterangan", "Foto Bukti"],
  ];

  [...person.tasks].sort(byDeadline).forEach((t, i) => {
    const status = taskKpiStatus(t, now);
    const submitted = toMillis(t.submittedAt);
    rows.push([
      i + 1,
      t.title,
      t.instructions,
      formatWib(toMillis(t.createdAt)),
      formatDeadline(t.deadline),
      Number.isNaN(submitted) ? "Belum submit" : formatWib(submitted),
      KPI_STATUS_LABEL[status],
      status === "terlambat" ? formatDuration(lateMinutes(t, now)) : "-",
      t.evidenceNote ?? "",
      t.evidencePhoto ? "Ada" : "-",
    ]);
  });

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws["!cols"] = [
    { wch: 30 }, { wch: 32 }, { wch: 40 }, { wch: 22 }, { wch: 22 },
    { wch: 22 }, { wch: 12 }, { wch: 16 }, { wch: 40 }, { wch: 11 },
  ];
  const textRows = ["Grade", "Skala", "Kesimpulan", "Rekomendasi"].map((label) => rows.findIndex((r) => r[0] === label));
  ws["!merges"] = [
    { s: { r: 0, c: 0 }, e: { r: 0, c: 9 } },
    ...textRows.map((r) => ({ s: { r, c: 1 }, e: { r, c: 9 } })),
  ];
  return ws;
}

export function buildKpiWorkbook(people: KpiPersonSheet[], monthKey: string, now: number): XLSX.WorkBook {
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();
  [...people]
    .sort((x, y) => x.name.localeCompare(y.name, "id"))
    .forEach((person) => XLSX.utils.book_append_sheet(wb, buildPersonSheet(person, monthKey, now), uniqueSheetName(person.name, used)));
  return wb;
}

export function exportKpiExcel(people: KpiPersonSheet[], monthKey: string, now = Date.now()): void {
  if (people.length === 0) throw new Error("Tidak ada task pada bulan ini untuk diexport.");
  const suffix = people.length === 1 ? `_${people[0].name.replace(/[^\w-]+/g, "_")}` : "";
  XLSX.writeFile(buildKpiWorkbook(people, monthKey, now), `Rekap_KPI_Task_${monthKey}${suffix}.xlsx`);
}
