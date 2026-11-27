// Ekspor PDF, Excel (.xlsx), dan CSV untuk seluruh laporan & BKU Keuangan.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import * as XLSX from "xlsx";
import { recordExportLog } from "@/keuangan/api";
import { formatAngkaSen } from "@/keuangan/format";

export interface NumericExportCell {
  v: number; // nilai numerik (Rupiah desimal) untuk Excel & CSV
  text: string; // teks terformat untuk PDF
}

export type ExportCell = string | number | NumericExportCell;

/** Mengubah INTEGER sen menjadi sel numerik: angka asli di Excel/CSV, format Rupiah di PDF. */
export function senCell(sen: number, accountingParens = true): NumericExportCell {
  const n = Math.round(Number(sen) || 0);
  return {
    v: Number((n / 100).toFixed(2)),
    text: formatAngkaSen(n, accountingParens),
  };
}

function isNumCell(c: ExportCell): c is NumericExportCell {
  return typeof c === "object" && c !== null && "v" in c && "text" in c;
}

export interface ExportTablePayload {
  laporan: string;
  title: string;
  subtitle: string;
  unitLabel?: string;
  headers: string[];
  rows: ExportCell[][];
  filenameBase: string;
  filter?: Record<string, unknown>;
}

export async function exportReportPdf(p: ExportTablePayload): Promise<void> {
  const landscape = p.headers.length > 5;
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Koperasi & Unit Usaha Al-Umanaa", 14, 14);
  doc.setFontSize(11);
  doc.text(p.title, 14, 20);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(90);
  doc.text(p.subtitle, 14, 25);
  if (p.unitLabel) {
    doc.text(`Anak Perusahaan: ${p.unitLabel}`, pageWidth - 14, 14, { align: "right" });
  }
  doc.text(`Dicetak: ${new Date().toLocaleString("id-ID")}`, pageWidth - 14, 20, { align: "right" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 30,
    head: [p.headers],
    body: p.rows.map((r) =>
      r.map((c) => {
        if (c === null || c === undefined) return "";
        return isNumCell(c) ? c.text : String(c);
      }),
    ),
    styles: { fontSize: 8.5, cellPadding: 2.2 },
    headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: "bold" },
    theme: "grid",
    margin: { left: 14, right: 14 },
  });

  doc.save(`${p.filenameBase}.pdf`);
  recordExportLog(p.laporan, "pdf", p.filter || {}).catch(() => {});
}

export async function exportBkuPdf(p: ExportTablePayload & {
  accountName: string;
  bankInfo?: string;
  pjNama?: string;
  pjJabatan?: string;
}): Promise<void> {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(13);
  doc.text("Koperasi & Unit Usaha Al-Umanaa", 14, 13);
  doc.setFontSize(11);
  doc.text(`BUKU KAS UMUM — ${p.accountName}`, 14, 19);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(80);
  doc.text(p.subtitle + (p.bankInfo ? ` • ${p.bankInfo}` : ""), 14, 24);
  if (p.unitLabel) doc.text(`Anak Perusahaan: ${p.unitLabel}`, pageWidth - 14, 13, { align: "right" });
  doc.setTextColor(0);

  autoTable(doc, {
    startY: 28,
    head: [p.headers],
    body: p.rows.map((r) => r.map((c) => (c === null || c === undefined ? "" : isNumCell(c) ? c.text : String(c)))),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [217, 119, 6], textColor: 255, fontStyle: "bold" },
    theme: "grid",
    margin: { left: 14, right: 14 },
  });

  const finalY = (doc as unknown as { lastAutoTable?: { finalY?: number } }).lastAutoTable?.finalY || 140;
  const sigY = Math.min(finalY + 12, doc.internal.pageSize.getHeight() - 32);
  doc.setFontSize(9);
  doc.text("Dibuat oleh,", 35, sigY, { align: "center" });
  doc.text("Diperiksa,", pageWidth / 2, sigY, { align: "center" });
  doc.text("Mengetahui,", pageWidth - 35, sigY, { align: "center" });
  doc.text(p.pjNama || "(___________________)", 35, sigY + 18, { align: "center" });
  if (p.pjJabatan) doc.text(p.pjJabatan, 35, sigY + 23, { align: "center" });
  doc.text("(___________________)", pageWidth / 2, sigY + 18, { align: "center" });
  doc.text("(___________________)", pageWidth - 35, sigY + 18, { align: "center" });

  doc.save(`${p.filenameBase}.pdf`);
  recordExportLog(p.laporan, "pdf", p.filter || {}).catch(() => {});
}

export async function exportReportExcel(p: ExportTablePayload): Promise<void> {
  const aoa: (string | number)[][] = [
    ["Koperasi & Unit Usaha Al-Umanaa"],
    [p.title],
    [p.subtitle + (p.unitLabel ? ` | Unit: ${p.unitLabel}` : "")],
    [],
    p.headers,
    ...p.rows.map((r) =>
      r.map((c) => {
        if (c === null || c === undefined) return "";
        return isNumCell(c) ? c.v : c;
      }),
    ),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Laporan");
  XLSX.writeFile(wb, `${p.filenameBase}.xlsx`);
  recordExportLog(p.laporan, "excel", p.filter || {}).catch(() => {});
}

export async function exportReportCsv(p: ExportTablePayload): Promise<void> {
  const esc = (v: ExportCell) => {
    const raw = isNumCell(v) ? v.v : v;
    const s = String(raw ?? "");
    return /[",\n\r;]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s;
  };
  const lines = [p.headers.map(esc).join(","), ...p.rows.map((r) => r.map(esc).join(","))];
  const blob = new Blob(["\ufeff" + lines.join("\r\n")], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${p.filenameBase}.csv`;
  a.click();
  URL.revokeObjectURL(url);
  recordExportLog(p.laporan, "csv", p.filter || {}).catch(() => {});
}
