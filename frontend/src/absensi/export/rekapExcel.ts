// Export rekap absensi → Excel: sheet "Ringkasan" (per karyawan) dan "Detail" (per hari/shift).
import * as XLSX from "xlsx";

import { formatDurasi } from "@/absensi/logic/format";
import { SUMMARY_HEADER, rekapFileName, rekapTables, summarizeRekap, type RekapMeta } from "@/absensi/export/rekapData";
import type { AbsensiRequestView, RekapRow } from "@/absensi/types";

const columnWidths = (rows: string[][]) =>
  rows[0].map((_, col) => ({ wch: Math.min(44, Math.max(...rows.map((row) => String(row[col] ?? "").length)) + 2) }));

export function buildRekapWorkbook(
  rows: RekapRow[],
  meta: RekapMeta,
  requests: AbsensiRequestView[] = [],
): XLSX.WorkBook {
  const range = { from: meta.from, to: meta.to };
  const { detail } = rekapTables(rows, requests, range);
  const summaryRows: (string | number)[][] = [
    SUMMARY_HEADER,
    ...summarizeRekap(rows, requests, range).map((s) => [
      s.name,
      s.hariHadir,
      s.cuti,
      s.sakit,
      s.izin,
      s.tidakClockOut,
      s.pergantianShift,
      formatDurasi(s.totalMenit),
    ]),
  ];

  const summarySheet = XLSX.utils.aoa_to_sheet(summaryRows);
  summarySheet["!cols"] = columnWidths(summaryRows.map((row) => row.map(String)));
  const detailSheet = XLSX.utils.aoa_to_sheet(detail);
  detailSheet["!cols"] = columnWidths(detail);

  const workbook = XLSX.utils.book_new();
  workbook.Props = { Title: `Rekap Absensi ${meta.from} – ${meta.to}`, Author: meta.printedBy };
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Ringkasan");
  XLSX.utils.book_append_sheet(workbook, detailSheet, "Detail");
  return workbook;
}

export function downloadRekapExcel(rows: RekapRow[], meta: RekapMeta, requests: AbsensiRequestView[] = []): void {
  XLSX.writeFile(buildRekapWorkbook(rows, meta, requests), rekapFileName(meta.from, meta.to, "xlsx"));
}
