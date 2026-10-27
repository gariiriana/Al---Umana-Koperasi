// Export rekap absensi → Excel: sheet "Ringkasan" (per karyawan) dan "Detail" (per shift).
import * as XLSX from "xlsx";

import { formatDurasi } from "@/absensi/logic/format";
import { SUMMARY_HEADER, rekapFileName, rekapTables, summarizeRekap, type RekapMeta } from "@/absensi/export/rekapData";
import type { RekapRow } from "@/absensi/types";

const columnWidths = (rows: string[][]) =>
  rows[0].map((_, col) => ({ wch: Math.min(40, Math.max(...rows.map((row) => String(row[col] ?? "").length)) + 2) }));

export function buildRekapWorkbook(rows: RekapRow[], meta: RekapMeta): XLSX.WorkBook {
  const { detail } = rekapTables(rows);
  // Ringkasan memakai angka asli supaya bisa dijumlah di Excel.
  const summaryRows: (string | number)[][] = [
    SUMMARY_HEADER,
    ...summarizeRekap(rows).map((s) => [s.name, s.hariHadir, s.tidakClockOut, formatDurasi(s.totalMenit)]),
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

export function downloadRekapExcel(rows: RekapRow[], meta: RekapMeta): void {
  XLSX.writeFile(buildRekapWorkbook(rows, meta), rekapFileName(meta.from, meta.to, "xlsx"));
}
