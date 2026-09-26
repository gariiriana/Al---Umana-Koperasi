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
  type ISectionOptions,
} from 'docx';
import type { MbgBahanChecklistForm, MbgBahanDocumentation } from '@/types/mbg';
import { getBase64ImageWithDimensions } from './mbgDeliveryReportPdfExporter';

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

  // Header Table: Logo & "BADAN GIZI NASIONAL" on left, "FORM PEMERIKSAAN..." on right
  let logoBytes: Uint8Array | null = null;
  try {
    const logoInfo = await getBase64ImageWithDimensions('/logo_badan_gizi.png');
    if (logoInfo?.dataUrl) {
      logoBytes = dataUriToUint8Array(logoInfo.dataUrl);
    }
  } catch {
    // ignore
  }

  const leftHeaderParagraphs: Paragraph[] = [];
  if (logoBytes) {
    leftHeaderParagraphs.push(
      new Paragraph({
        children: [
          new ImageRun({
            data: logoBytes,
            transformation: { width: 55, height: 55 },
            type: 'png',
          }),
        ],
        spacing: { after: 40 },
      })
    );
  }
  leftHeaderParagraphs.push(
    new Paragraph({
      children: [
        new TextRun({ text: 'BADAN GIZI NASIONAL', bold: true, size: 20, font: 'Times New Roman' }),
      ],
    })
  );

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

  // Table Body (Min 17 rows)
  const rows = form.rows || [];
  const minRows = Math.max(17, rows.length);

  for (let i = 0; i < minRows; i++) {
    const item = rows[i];
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

export async function exportBahanDocumentationDocx(docData: MbgBahanDocumentation): Promise<void> {
  const children: (Paragraph | Table)[] = [];

  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'DOKUMENTASI FOTO BAHAN MAKANAN', bold: true, size: 28, font: 'Arial' }),
      ],
      spacing: { after: 60 },
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [
        new TextRun({ text: 'PROGRAM MAKAN BERGIZI GRATIS (MBG) — PENERIMAAN DISTRIBUSI', size: 20, color: '475569', font: 'Arial' }),
      ],
      spacing: { after: 180 },
    })
  );

  // Metadata
  const metaRows = [
    new TableRow({
      children: [
        new TableCell({
          borders: BLACK_BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: 'Tanggal Batch', bold: true, size: 19 })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: docData.tanggal || '-', size: 19 })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: 'Petugas', bold: true, size: 19 })] })],
        }),
        new TableCell({
          borders: BLACK_BORDER,
          children: [new Paragraph({ children: [new TextRun({ text: docData.officerName || 'Tim Distribusi', size: 19 })] })],
        }),
      ],
    }),
  ];
  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: metaRows }));
  children.push(new Paragraph({ spacing: { before: 140, after: 100 } }));

  // Items table with embedded images
  const itemRows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ borders: BLACK_BORDER, width: { size: 5, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'No', bold: true, size: 19 })] })] }),
        new TableCell({ borders: BLACK_BORDER, width: { size: 25, type: WidthType.PERCENTAGE }, children: [new Paragraph({ children: [new TextRun({ text: 'Nama Bahan', bold: true, size: 19 })] })] }),
        new TableCell({ borders: BLACK_BORDER, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Jumlah', bold: true, size: 19 })] })] }),
        new TableCell({ borders: BLACK_BORDER, width: { size: 15, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Kondisi', bold: true, size: 19 })] })] }),
        new TableCell({ borders: BLACK_BORDER, width: { size: 40, type: WidthType.PERCENTAGE }, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: 'Foto Dokumentasi & Keterangan', bold: true, size: 19 })] })] }),
      ],
    }),
  ];

  const items = docData.items || [];
  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    const photoCellParagraphs: Paragraph[] = [];

    if (it.photoUrl) {
      const bytes = dataUriToUint8Array(it.photoUrl);
      if (bytes) {
        photoCellParagraphs.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: bytes,
                transformation: { width: 140, height: 105 },
                type: 'jpg',
              }),
            ],
            spacing: { after: 40 },
          })
        );
      }
    } else {
      photoCellParagraphs.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          children: [new TextRun({ text: '(Belum ada foto)', italics: true, size: 16, color: '94A3B8' })],
        })
      );
    }

    if (it.catatan) {
      photoCellParagraphs.push(
        new Paragraph({
          children: [new TextRun({ text: `Catatan: ${it.catatan}`, size: 16, italics: true, color: '475569' })],
        })
      );
    }

    const qtyStr = it.kuantitas ? `${it.kuantitas} ${it.satuan || ''}` : '-';
    const isBaik = it.kondisi !== 'rusak';

    itemRows.push(
      new TableRow({
        children: [
          new TableCell({ borders: BLACK_BORDER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: `${i + 1}`, size: 18 })] })] }),
          new TableCell({ borders: BLACK_BORDER, children: [new Paragraph({ children: [new TextRun({ text: it.namaBahan, bold: true, size: 18 })] })] }),
          new TableCell({ borders: BLACK_BORDER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: qtyStr, size: 18 })] })] }),
          new TableCell({ borders: BLACK_BORDER, children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: isBaik ? 'Baik / Segar' : 'Rusak', color: isBaik ? '16A34A' : 'DC2626', bold: true, size: 18 })] })] }),
          new TableCell({ borders: BLACK_BORDER, children: photoCellParagraphs }),
        ],
      })
    );
  }

  children.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: itemRows }));

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
  const cleanDate = (docData.tanggal || 'tanggal').replace(/[^a-zA-Z0-9_-]/g, '_');
  triggerDownload(blob, `Dokumentasi_Foto_Bahan_MBG_${cleanDate}.docx`);
}
