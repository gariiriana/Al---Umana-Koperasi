// ============================================================================
// MBG Bahan DOCX Generator — Microsoft Word Exporter
// Generates official-standard Word (.docx) files for:
// 1. Formulir Pemeriksaan Bahan Makanan (Standar Badan Gizi Nasional)
// 2. Dokumentasi Foto Bahan Makanan (Distribusi MBG)
// ============================================================================

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
  ImageRun,
  Footer,
  PageNumber,
  ShadingType,
  TableLayoutType,
  VerticalAlign,
  type ISectionOptions,
} from 'docx';
import type { MbgBahanChecklistForm, MbgBahanDocumentation } from '@/types/mbg';
import { MBG_BAHAN_DOC_OFFICERS } from '@/constants/mbgConstants';
import { getLoadedBahanPhotos } from '@/services/mbgBahanService';
import { getBase64ImageWithDimensions } from './mbgDeliveryReportPdfExporter';
import { bahanPhotoTimeRange, coverCropDataUrl } from './bahanPhotoLayout';

const INDO_MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

/** "2026-11-02" → "02 November 2026" */
function formatIndoDate(dateStr?: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
  if (!m) return dateStr || '';
  return `${m[3]} ${INDO_MONTHS[Number(m[2]) - 1] || m[2]} ${m[1]}`;
}

function dataUriToUint8Array(dataUri: string): Uint8Array | null {
  try {
    const base64 = dataUri.split(',')[1] || dataUri;
    const binaryStr = atob(base64);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('[DOCX] Failed converting data URI to Uint8Array:', err);
    return null;
  }
}

const BLACK_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  bottom: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  left: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
  right: { style: BorderStyle.SINGLE, size: 1, color: '000000' },
};

const NO_BORDER = {
  top: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  bottom: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  left: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
  right: { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' },
};

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ============================================================================
// 1. FORMULIR PEMERIKSAAN BAHAN MAKANAN DOCX (BADAN GIZI NASIONAL)
// ============================================================================

export async function exportBahanChecklistDocx(form: MbgBahanChecklistForm): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  // Header Table: Logo Badan Gizi Nasional on left, "FORM PEMERIKSAAN..." on right
  let logoBytes: Uint8Array | null = null;
  let logoRatio = 2.376;
  try {
    const logoInfo =
      (await getBase64ImageWithDimensions('/logo_bgn_official.png', 'image/png')) ||
      (await getBase64ImageWithDimensions('/logo_badan_gizi.png', 'image/png'));
    if (logoInfo?.dataUrl) {
      logoBytes = dataUriToUint8Array(logoInfo.dataUrl);
      if (logoInfo.height > 0) {
        logoRatio = logoInfo.width / logoInfo.height;
      }
    }
  } catch {
    // ignore
  }

  const leftHeaderParagraphs: Paragraph[] = [];
  if (logoBytes) {
    const h = 48;
    const w = Math.round(h * logoRatio);
    leftHeaderParagraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBytes,
            transformation: { width: w, height: h },
            type: 'png',
          }),
        ],
        spacing: { after: 20 },
      })
    );
  }

  const rightHeaderParagraphs = [
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: 'FORM PEMERIKSAAN BAHAN MAKANAN', bold: true, size: 21, font: 'Times New Roman' }),
      ],
      spacing: { after: 40 },
    }),
    new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `NO : ${form.noForm || '01/PBM/IX/2026'}`, bold: true, size: 19, font: 'Times New Roman' }),
      ],
    }),
  ];

  children.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              borders: NO_BORDER,
              width: { size: 45, type: WidthType.PERCENTAGE },
              children: leftHeaderParagraphs,
            }),
            new TableCell({
              borders: NO_BORDER,
              width: { size: 55, type: WidthType.PERCENTAGE },
              children: rightHeaderParagraphs,
            }),
          ],
        }),
      ],
    })
  );

  // Spacing after header
  children.push(new Paragraph({ spacing: { before: 180, after: 120 } }));

  // Metadata block: Dari, Kepada, Waktu
  const metaTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDER,
            width: { size: 12, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Dari', font: 'Times New Roman', size: 20 })] })],
          }),
          new TableCell({
            borders: NO_BORDER,
            width: { size: 88, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: `: ${form.dari || 'Koperasi Al Umanaa Sejahtera Mandiri'}`, font: 'Times New Roman', size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDER,
            width: { size: 12, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Kepada', font: 'Times New Roman', size: 20 })] })],
          }),
          new TableCell({
            borders: NO_BORDER,
            width: { size: 88, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: `: ${form.kepada || 'SPPG Sukabumi Gunungguruh Kebonmanggu'}`, font: 'Times New Roman', size: 20 })] })],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            borders: NO_BORDER,
            width: { size: 12, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: 'Waktu', font: 'Times New Roman', size: 20 })] })],
          }),
          new TableCell({
            borders: NO_BORDER,
            width: { size: 88, type: WidthType.PERCENTAGE },
            children: [new Paragraph({ children: [new TextRun({ text: `: ${form.waktu || '06.00 - 08.00 WIB'}`, font: 'Times New Roman', size: 20 })] })],
          }),
        ],
      }),
    ],
  });
  children.push(metaTable);
  children.push(new Paragraph({ spacing: { before: 140, after: 80 } }));

  // Main Checklist Table
  const tableRows: TableRow[] = [];

  // Header Row 1
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          rowSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 5, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          rowSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 28, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jenis Bahan Makanan', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          rowSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 12, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Banyaknya\n(Angka)', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          rowSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 9, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Satuan', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          columnSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 16, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jumlah', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          columnSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 16, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Kondisi Bahan Makanan', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          rowSpan: 2,
          borders: BLACK_BORDER,
          width: { size: 14, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Keterangan', bold: true, size: 19, font: 'Times New Roman' })] })],
        }),
      ],
    })
  );

  // Header Row 2 (Sub-headers for Jumlah & Kondisi)
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          borders: BLACK_BORDER,
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Sesuai', bold: true, size: 18, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Tidak', bold: true, size: 18, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Baik', bold: true, size: 18, font: 'Times New Roman' })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          width: { size: 8, type: WidthType.PERCENTAGE },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Rusak', bold: true, size: 18, font: 'Times New Roman' })] })],
        }),
      ],
    })
  );

  // Table Body (Export exact items from form rows)
  const rawRows = form.rows || [];
  const rows = rawRows.filter(
    (item) => (item?.jenisBahan && item.jenisBahan.trim() !== '') || (item?.banyaknya !== undefined && item?.banyaknya !== null && String(item.banyaknya).trim() !== '' && Number(item.banyaknya) !== 0)
  );
  const itemsToRender = rows.length > 0 ? rows : rawRows;

  for (let i = 0; i < itemsToRender.length; i++) {
    const item = itemsToRender[i];
    const no = `${i + 1}`;
    const nama = item?.jenisBahan || '';
    const qty = item?.banyaknya ? String(item.banyaknya) : '';
    const sat = item?.satuan || '';
    const sesuai = item?.isSesuai === true ? 'V' : '';
    const tdkSesuai = item?.isSesuai === false ? 'V' : '';
    const baik = item?.isBaik === true ? 'V' : '';
    const rusak = item?.isBaik === false ? 'V' : '';
    const notes = item?.notes || '';

    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: no, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ children: [new TextRun({ text: nama, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: qty, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sat, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: sesuai, bold: true, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: tdkSesuai, bold: true, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: baik, bold: true, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: rusak, bold: true, font: 'Times New Roman', size: 18 })] })],
          }),
          new TableCell({
            borders: BLACK_BORDER,
            children: [new Paragraph({ children: [new TextRun({ text: notes, font: 'Times New Roman', size: 18 })] })],
          }),
        ],
      })
    );
  }

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows }));

  // Signature Block (Bottom Right)
  children.push(new Paragraph({ spacing: { before: 240, after: 60 } }));
  const formattedDate = form.tanggalTtd || form.tanggal || '01 September 2026';
  const locationDate = `${form.lokasiTtd || 'Sukabumi'}, ${formattedDate}`;

  const sigTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [
      new TableRow({
        children: [
          new TableCell({ borders: NO_BORDER, width: { size: 55, type: WidthType.PERCENTAGE }, children: [] }),
          new TableCell({
            borders: NO_BORDER,
            width: { size: 45, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({ children: [new TextRun({ text: locationDate, font: 'Times New Roman', size: 20 })] }),
              new Paragraph({ children: [new TextRun({ text: form.officerTitle || 'Kepala Satuan Pelayanan Pemenuhan Gizi', font: 'Times New Roman', size: 20 })], spacing: { after: 600 } }),
              new Paragraph({ children: [new TextRun({ text: form.officerName || 'Ragha Eskha Utama, S. Hum.', font: 'Times New Roman', size: 20 })] }),
            ],
          }),
        ],
      }),
    ],
  });
  children.push(sigTable);

  const sections: ISectionOptions[] = [{
    properties: {
      page: {
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    children,
  }];

  const doc = new Document({ sections });
  const blob = await Packer.toBlob(doc);
  const cleanDate = (form.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerDownload(blob, `Form_Pemeriksaan_Bahan_Makanan_${cleanDate}.docx`);
}

// ============================================================================
// 2. DOKUMENTASI FOTO BAHAN MAKANAN DOCX (DISTRIBUSI MBG)
// ============================================================================

// Lebar kolom dalam twip; total = lebar A4 (11906) − margin kiri/kanan (2 × 720).
const DOC_COLUMNS = { no: 620, nama: 2700, jumlah: 1250, kondisi: 1250, foto: 4646 };
const DOC_TABLE_WIDTH = Object.values(DOC_COLUMNS).reduce((a, b) => a + b, 0);
// Foto 4:3, dua per baris di kolom foto.
const DOC_PHOTO_W = 140;
const DOC_PHOTO_H = 105;

const GRID_BORDER = {
  top: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  bottom: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  left: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
  right: { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' },
};

function docText(text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) {
  return new TextRun({ text, size: opts.size ?? 18, bold: opts.bold, italics: opts.italics, color: opts.color });
}

function docCell(
  children: Paragraph[],
  width: number,
  opts: { fill?: string; align?: 'top' | 'center' } = {}
) {
  return new TableCell({
    borders: GRID_BORDER,
    width: { size: width, type: WidthType.DXA },
    verticalAlign: opts.align === 'top' ? VerticalAlign.TOP : VerticalAlign.CENTER,
    shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
    margins: { top: 80, bottom: 80, left: 100, right: 100 },
    children,
  });
}

async function loadLogo(path: string, size: number): Promise<Paragraph> {
  try {
    const logo = await getBase64ImageWithDimensions(path, 'image/png', 256);
    const bytes = logo ? dataUriToUint8Array(logo.dataUrl) : null;
    if (bytes) {
      return new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [new ImageRun({ data: bytes, transformation: { width: size, height: size }, type: 'png' })],
      });
    }
  } catch {
    // logo opsional
  }
  return new Paragraph({});
}

export async function exportBahanDocumentationDocx(docData: MbgBahanDocumentation): Promise<void> {
  const children: (Paragraph | Table)[] = [];
  const items = docData.items || [];
  const itemPhotos = items.map(getLoadedBahanPhotos);
  const withPhotos = itemPhotos.filter((p) => p.length > 0).length;
  const totalPhotos = itemPhotos.reduce((sum, p) => sum + p.length, 0);

  // Kop: logo BGN — judul — logo Al Umana
  const [bgnLogo, alumanaLogo] = await Promise.all([
    loadLogo('/logo_badan_gizi.png', 58),
    loadLogo('/logo_alumana.png', 58),
  ]);
  children.push(
    new Table({
      width: { size: DOC_TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [1300, DOC_TABLE_WIDTH - 2600, 1300],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            new TableCell({ borders: NO_BORDER, verticalAlign: VerticalAlign.CENTER, children: [bgnLogo] }),
            new TableCell({
              borders: NO_BORDER,
              verticalAlign: VerticalAlign.CENTER,
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  spacing: { after: 60 },
                  children: [docText('DOKUMENTASI FOTO BAHAN MAKANAN', { bold: true, size: 28, color: '0F172A' })],
                }),
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [docText('PROGRAM MAKAN BERGIZI GRATIS (MBG) — DISTRIBUSI & PENERIMAAN', { size: 18, color: '475569' })],
                }),
              ],
            }),
            new TableCell({ borders: NO_BORDER, verticalAlign: VerticalAlign.CENTER, children: [alumanaLogo] }),
          ],
        }),
      ],
    }),
    new Paragraph({
      border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: 'CBD5E1', space: 1 } },
      spacing: { after: 160 },
    })
  );

  // Ringkasan
  const metaLabel = (text: string) => docCell([new Paragraph({ children: [docText(text, { bold: true, color: '334155' })] })], 1700, { fill: 'F1F5F9' });
  const metaValue = (text: string) => docCell([new Paragraph({ children: [docText(text)] })], DOC_TABLE_WIDTH / 2 - 1700);
  children.push(
    new Table({
      width: { size: DOC_TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: [1700, DOC_TABLE_WIDTH / 2 - 1700, 1700, DOC_TABLE_WIDTH / 2 - 1700],
      layout: TableLayoutType.FIXED,
      rows: [
        new TableRow({
          children: [
            metaLabel('Tanggal Batch'), metaValue(formatIndoDate(docData.tanggal) || '-'),
            metaLabel('Petugas'), metaValue(MBG_BAHAN_DOC_OFFICERS),
          ],
        }),
        new TableRow({
          children: [
            metaLabel('Total Bahan'), metaValue(`${items.length} item`),
            metaLabel('Bahan Difoto'), metaValue(`${withPhotos} / ${items.length} bahan • ${totalPhotos} foto`),
          ],
        }),
      ],
    }),
    new Paragraph({ spacing: { after: 160 } })
  );

  // Tabel bahan: identitas bahan di kiri, foto (2 per baris) di kanan
  const headCell = (text: string, width: number) =>
    docCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [docText(text, { bold: true, color: 'FFFFFF' })] })], width, { fill: '047857' });
  const itemRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        headCell('No', DOC_COLUMNS.no),
        headCell('Nama Bahan', DOC_COLUMNS.nama),
        headCell('Jumlah', DOC_COLUMNS.jumlah),
        headCell('Kondisi', DOC_COLUMNS.kondisi),
        headCell('Foto Dokumentasi', DOC_COLUMNS.foto),
      ],
    }),
  ];

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const photos = itemPhotos[i];
    const zebra = i % 2 === 1 ? 'F8FAFC' : undefined;

    const photoRuns: ImageRun[] = [];
    for (const photo of photos) {
      const cropped = await coverCropDataUrl(photo.url!, DOC_PHOTO_W / DOC_PHOTO_H, 480);
      const bytes = dataUriToUint8Array(cropped);
      if (bytes) {
        photoRuns.push(new ImageRun({ data: bytes, transformation: { width: DOC_PHOTO_W, height: DOC_PHOTO_H }, type: 'jpg' }));
      }
    }
    const photoParagraphs: Paragraph[] = [];
    for (let p = 0; p < photoRuns.length; p += 2) {
      photoParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: p + 2 < photoRuns.length ? 60 : 0 },
          children: p + 1 < photoRuns.length ? [photoRuns[p], docText('  '), photoRuns[p + 1]] : [photoRuns[p]],
        })
      );
    }
    if (photoParagraphs.length === 0) {
      photoParagraphs.push(
        new Paragraph({ alignment: AlignmentType.CENTER, children: [docText('(Belum ada foto)', { italics: true, size: 16, color: '94A3B8' })] })
      );
    }

    const namaParagraphs = [
      new Paragraph({ children: [docText(it.namaBahan || '-', { bold: true, color: '0F172A' })] }),
    ];
    if (photos.length > 0) {
      namaParagraphs.push(
        new Paragraph({
          spacing: { before: 40 },
          children: [docText(`${photos.length} foto • ${bahanPhotoTimeRange(photos)}`, { size: 15, color: '64748B' })],
        })
      );
    }
    if (it.catatan) {
      namaParagraphs.push(
        new Paragraph({ spacing: { before: 40 }, children: [docText(`Catatan: ${it.catatan}`, { italics: true, size: 15, color: '475569' })] })
      );
    }

    const qtyStr = it.kuantitas ? `${it.kuantitas} ${it.satuan || ''}`.trim() : '-';
    const isRusak = it.kondisi === 'rusak';

    itemRows.push(
      new TableRow({
        cantSplit: true,
        children: [
          docCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [docText(`${i + 1}`, { bold: true })] })], DOC_COLUMNS.no, { fill: zebra }),
          docCell(namaParagraphs, DOC_COLUMNS.nama, { fill: zebra }),
          docCell([new Paragraph({ alignment: AlignmentType.CENTER, children: [docText(qtyStr)] })], DOC_COLUMNS.jumlah, { fill: zebra }),
          docCell(
            [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [docText(isRusak ? 'Rusak / Cacat' : 'Baik / Segar', { bold: true, size: 16, color: isRusak ? 'B91C1C' : '047857' })],
            })],
            DOC_COLUMNS.kondisi,
            { fill: isRusak ? 'FEE2E2' : 'D1FAE5' }
          ),
          docCell(photoParagraphs, DOC_COLUMNS.foto, { fill: zebra }),
        ],
      })
    );
  }

  children.push(
    new Table({
      width: { size: DOC_TABLE_WIDTH, type: WidthType.DXA },
      columnWidths: Object.values(DOC_COLUMNS),
      layout: TableLayoutType.FIXED,
      rows: itemRows,
    })
  );

  const sections: ISectionOptions[] = [{
    properties: {
      page: {
        margin: { top: 720, bottom: 720, left: 720, right: 720 },
      },
    },
    footers: {
      default: new Footer({
        children: [
          new Paragraph({
            alignment: AlignmentType.RIGHT,
            children: [
              new TextRun({ text: 'Dokumentasi Bahan MBG  •  Halaman ', size: 16, color: '94A3B8' }),
              new TextRun({ children: [PageNumber.CURRENT], size: 16, color: '94A3B8' }),
              new TextRun({ text: ' dari ', size: 16, color: '94A3B8' }),
              new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: '94A3B8' }),
            ],
          }),
        ],
      }),
    },
    children,
  }];

  const doc = new Document({
    styles: { default: { document: { run: { font: 'Arial' } } } },
    sections,
  });
  const blob = await Packer.toBlob(doc);
  const cleanDate = (docData.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerDownload(blob, `Dokumentasi_Foto_Bahan_MBG_${cleanDate}.docx`);
}
