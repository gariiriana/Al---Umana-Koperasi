// Rekap Toksan sebagai PDF A4, isi sama persis dengan DOCX (lihat rekapModel.ts).
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { NUMERIC_COLUMNS, type RekapModel, type RekapSection } from "@/toksan/export/rekapModel";
import { bytesToDataUrl, loadLogoBytes } from "@/toksan/export/logo";

const MARGIN = 14;
const AMBER: [number, number, number] = [251, 191, 36];
const SOFT: [number, number, number] = [255, 251, 235];
const DARK: [number, number, number] = [17, 24, 39];
const MUTED: [number, number, number] = [107, 114, 128];

type Doc = jsPDF & { lastAutoTable?: { finalY: number } };

function ensureSpace(doc: Doc, y: number, needed: number): number {
  const bottom = doc.internal.pageSize.getHeight() - 18;
  if (y + needed <= bottom) return y;
  doc.addPage();
  return 18;
}

function drawSection(doc: Doc, section: RekapSection, startY: number): number {
  let y = ensureSpace(doc, startY, 22);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...DARK);
  doc.text(section.title, MARGIN, y);
  const columnStyles: Record<number, { halign: "right" }> = {};
  section.columns.forEach((c, i) => { if (NUMERIC_COLUMNS.has(c)) columnStyles[i] = { halign: "right" }; });
  autoTable(doc, {
    startY: y + 2,
    margin: { left: MARGIN, right: MARGIN },
    head: [section.columns],
    body: section.rows,
    foot: section.subtotal ? [section.subtotal] : undefined,
    showFoot: "lastPage",
    theme: "grid",
    styles: { font: "helvetica", fontSize: 8.5, cellPadding: 1.8, textColor: DARK, lineColor: [229, 231, 235], lineWidth: 0.2 },
    headStyles: { fillColor: AMBER, textColor: DARK, fontStyle: "bold" },
    footStyles: { fillColor: SOFT, textColor: DARK, fontStyle: "bold" },
    alternateRowStyles: { fillColor: [249, 250, 251] },
    columnStyles,
    didParseCell: (hook) => {
      if ((hook.section === "head" || hook.section === "foot") && NUMERIC_COLUMNS.has(section.columns[hook.column.index])) {
        hook.cell.styles.halign = "right";
      }
    },
  });
  y = (doc.lastAutoTable?.finalY ?? y) + 8;
  return y;
}

export function buildRekapPdf(model: RekapModel, logoDataUrl: string | null): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4" }) as Doc;
  const width = doc.internal.pageSize.getWidth();

  if (logoDataUrl) doc.addImage(logoDataUrl, "PNG", MARGIN, 9, 20, 20, "logo", "FAST");
  doc.setTextColor(...DARK);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(14);
  doc.text(model.kop, width / 2, 15, { align: "center" });
  doc.setFontSize(11.5);
  doc.text(model.judul, width / 2, 21.5, { align: "center" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.setTextColor(...MUTED);
  doc.text(model.periode, width / 2, 27, { align: "center" });
  doc.setDrawColor(...AMBER);
  doc.setLineWidth(0.9);
  doc.line(MARGIN, 32, width - MARGIN, 32);
  doc.setLineWidth(0.2);
  doc.line(MARGIN, 33.3, width - MARGIN, 33.3);

  // Ringkasan: label/nilai berpasangan, dua per baris.
  const pairs: string[][] = [];
  for (let i = 0; i < model.ringkasan.length; i += 2) {
    const a = model.ringkasan[i];
    const b = model.ringkasan[i + 1];
    pairs.push([a.label, a.value, b?.label ?? "", b?.value ?? ""]);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  doc.setTextColor(...DARK);
  doc.text("Ringkasan", MARGIN, 41);
  autoTable(doc, {
    startY: 43,
    margin: { left: MARGIN, right: MARGIN },
    body: pairs,
    theme: "grid",
    styles: { font: "helvetica", fontSize: 9, cellPadding: 2, textColor: DARK, lineColor: [253, 230, 138], lineWidth: 0.2 },
    columnStyles: {
      0: { fillColor: SOFT, textColor: MUTED },
      1: { fontStyle: "bold", halign: "right" },
      2: { fillColor: SOFT, textColor: MUTED },
      3: { fontStyle: "bold", halign: "right" },
    },
  });
  let y = (doc.lastAutoTable?.finalY ?? 43) + 9;

  for (const section of model.sections) y = drawSection(doc, section, y);
  if (model.obral) y = drawSection(doc, model.obral, y);

  y = ensureSpace(doc, y, 14);
  doc.setFillColor(...AMBER);
  doc.roundedRect(width - MARGIN - 92, y - 6, 92, 11, 2, 2, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10);
  doc.setTextColor(...DARK);
  doc.text("TOTAL KESELURUHAN", width - MARGIN - 88, y + 1.2);
  doc.setFontSize(12);
  doc.text(model.grandTotal, width - MARGIN - 4, y + 1.4, { align: "right" });

  const signX = width - MARGIN - 45;
  y = ensureSpace(doc, y + 16, 30);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9.5);
  doc.text(model.footer.tempatTanggal, signX, y, { align: "center" });
  doc.text(model.footer.jabatan, signX, y + 5, { align: "center" });
  doc.setFont("helvetica", "bold");
  doc.text(model.footer.nama, signX, y + 26, { align: "center" });
  const nameWidth = doc.getTextWidth(model.footer.nama);
  doc.setLineWidth(0.3);
  doc.setDrawColor(...DARK);
  doc.line(signX - nameWidth / 2, y + 27, signX + nameWidth / 2, y + 27);

  const pages = doc.getNumberOfPages();
  for (let p = 1; p <= pages; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    const h = doc.internal.pageSize.getHeight();
    doc.text(`${model.judul} · ${model.periode.replace("Periode: ", "")}`, MARGIN, h - 8);
    doc.text(`Halaman ${p} dari ${pages}`, width - MARGIN, h - 8, { align: "right" });
  }
  return doc;
}

export async function exportRekapPdf(model: RekapModel): Promise<void> {
  const bytes = await loadLogoBytes();
  buildRekapPdf(model, bytes ? bytesToDataUrl(bytes) : null).save(`${model.fileName}.pdf`);
}
