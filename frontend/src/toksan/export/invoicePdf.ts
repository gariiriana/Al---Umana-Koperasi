// Invoice dapur → Toko Santri sebagai PDF A4, tata letak mengikuti "Sales Invoice" Kasma.
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { InvoiceModel } from "@/toksan/export/invoiceModel";
import { bytesToDataUrl, loadLogoBytes } from "@/toksan/export/logo";

const L = 11; // left margin (mm)
const R = 199; // right edge (mm)
const BLACK: [number, number, number] = [0, 0, 0];
const GREY: [number, number, number] = [190, 190, 190];
const LINE = 0.3;

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

function ensureSpace(doc: Doc, y: number, needed: number): number {
  if (y + needed <= doc.internal.pageSize.getHeight() - 16) return y;
  doc.addPage();
  return 16;
}

const wrap = (doc: Doc, body: string[], w: number) => {
  doc.setFontSize(8.5);
  return body.flatMap((line) => doc.splitTextToSize(line || " ", w - 4) as string[]);
};
const boxHeight = (title: string | null, lines: number) => (title ? 7 : 0) + lines * 4 + 3;

/** Box with a bold title row and pre-wrapped body lines; returns the y just below it. */
function box(doc: Doc, x: number, y: number, w: number, title: string | null, wrapped: string[]): number {
  doc.setFontSize(8.5);
  const titleH = title ? 7 : 0;
  const h = boxHeight(title, wrapped.length);
  doc.setDrawColor(...BLACK);
  doc.setLineWidth(LINE);
  doc.rect(x, y, w, h);
  if (title) {
    doc.setFont("helvetica", "bold");
    doc.text(title, x + 2, y + 5);
    doc.line(x, y + titleH, x + w, y + titleH);
  }
  doc.setFont("helvetica", "normal");
  wrapped.forEach((line, i) => doc.text(line, x + 2, y + titleH + 4 + i * 4));
  return y + h;
}

export function buildInvoicePdf(model: InvoiceModel, logoDataUrl: string | null): jsPDF {
  const doc: Doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setTextColor(...BLACK);

  // Kop: logo, nama penjual, unit.
  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", L, 9, 15, 15, undefined, "FAST");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(model.penjual, L, 33);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8.5);
  doc.text(model.unit, L, 43);

  // Faktur & tanggal (kanan).
  doc.setFont("helvetica", "bold");
  doc.text("FAKTUR #", 124, 40);
  doc.text("TANGGAL", 124, 45);
  doc.setFont("helvetica", "normal");
  doc.text(`: ${model.nomor}`, 153, 40);
  doc.text(`: ${model.tanggal}`, 153, 45);
  doc.setLineWidth(LINE);
  doc.line(L, 54, 122, 54);
  doc.line(153, 54, R, 54);

  // Pelanggan (kiri) dan jatuh tempo / tags (kanan).
  doc.setFontSize(8.5);
  doc.text("PELANGGAN", L, 64);
  doc.rect(L, 67, 102, 16);
  doc.text("NAMA", L + 2, 72);
  doc.text(`: ${model.pelanggan}`, L + 41, 72);
  doc.rect(122, 67, R - 122, 16);
  doc.text("JATUH TEMPO", 124, 72);
  doc.text(`: ${model.jatuhTempo}`, 153, 72);
  doc.text("TAGS", 124, 77);
  const tags = doc.splitTextToSize(`: ${model.tags}`, R - 154) as string[];
  tags.forEach((t, i) => doc.text(t, 153, 77 + i * 4));

  // Rincian.
  autoTable(doc, {
    startY: 87,
    margin: { left: L, right: 210 - R },
    head: [["NO.", "KETERANGAN", "QTY", "HARGA SATUAN\n(RP.)", "DISKON", "PAJAK", "JUMLAH (RP.)"]],
    body: model.lines.map((l) => [String(l.no), l.keterangan, l.qty, l.harga, "0.0%", "", l.jumlah]),
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.1, textColor: BLACK, lineColor: BLACK, lineWidth: LINE, valign: "top" },
    headStyles: { fillColor: [255, 255, 255], textColor: BLACK, fontStyle: "bold", lineWidth: LINE },
    columnStyles: {
      0: { cellWidth: 10 },
      1: { cellWidth: 36 },
      2: { cellWidth: 19, halign: "right" },
      3: { cellWidth: 32, halign: "right" },
      4: { cellWidth: 23 },
      5: { cellWidth: 23 },
      6: { halign: "right" },
    },
    didParseCell: (hook) => {
      if (hook.section === "head" && [2, 3, 6].includes(hook.column.index)) hook.cell.styles.halign = "right";
    },
  });

  // Ringkasan nilai (kanan).
  let y = ensureSpace(doc, (doc.lastAutoTable?.finalY ?? 100) + 5, 34);
  const totals: [string, string, boolean][] = [
    ["Subtotal", model.subtotal, false],
    ["Diskon", model.diskon, false],
    ["Diskon per Item", model.diskonPerItem, false],
    ["TOTAL", model.total, true],
    ["Sisa Tagihan", model.sisaTagihan, false],
  ];
  doc.setFontSize(8.5);
  for (const [label, value, strong] of totals) {
    doc.setFont("helvetica", strong ? "bold" : "normal");
    if (strong) {
      doc.setLineWidth(LINE);
      doc.line(119, y - 4, R, y - 4);
    }
    doc.text(label, 120, y);
    doc.text(value, R, y, { align: "right" });
    if (strong) {
      doc.setLineWidth(0.8);
      doc.line(119, y + 1.6, R, y + 1.6);
      doc.setLineWidth(LINE);
    }
    y += 5.6;
  }

  // Catatan, pesan, detail pembayaran, terbilang (kiri), tanda tangan (kanan): one block, never split across pages.
  const W = 105;
  const catatan = wrap(doc, [model.catatan || "-"], W);
  const pesan = wrap(doc, model.pesan ? model.pesan.split(/\r?\n/) : ["-"], W);
  const detail = wrap(doc, ["NAMA BANK :", "CABANG BANK :", "NOMOR AKUN BANK :", "ATAS NAMA :"], W);
  const terbilangLines = wrap(doc, ["TERBILANG", model.terbilang], W);
  const blockH = 2 + boxHeight("CATATAN", catatan.length) + 1 + boxHeight("PESAN", pesan.length) + 6
    + boxHeight(null, detail.length) + 1 + boxHeight(null, terbilangLines.length);
  y = ensureSpace(doc, y, blockH);
  y = box(doc, L, y + 2, W, "CATATAN", catatan);
  y = box(doc, L, y + 1, W, "PESAN", pesan);
  y += 6;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(8.5);
  doc.text("DETAIL PEMBAYARAN", L, y - 1);
  y = box(doc, L, y, W, null, detail);
  y = box(doc, L, y + 1, W, null, terbilangLines);
  doc.setLineWidth(LINE);
  doc.line(125, y - 4, 192, y - 4);

  // Footer setiap halaman.
  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...GREY);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`Sales Invoice #${model.nomor}`, L, h - 8);
    doc.text(`Page ${p} of ${pages}`, R, h - 8, { align: "right" });
  }
  doc.setTextColor(...BLACK);
  return doc;
}

export async function exportInvoicePdf(model: InvoiceModel): Promise<void> {
  const bytes = await loadLogoBytes();
  buildInvoicePdf(model, bytes ? bytesToDataUrl(bytes) : null).save(`${model.fileName}.pdf`);
}
