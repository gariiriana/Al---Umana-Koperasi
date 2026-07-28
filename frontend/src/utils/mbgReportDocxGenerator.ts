// ============================================================================
// MBG Distribution Report DOCX Generator — Word Exporter
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
  ImageRun,
  PageBreak,
} from 'docx';
import type { MbgPmEntry } from '@/types/mbg';

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
    console.error('Failed converting data URI to Uint8Array:', err);
    return null;
  }
}

export interface MbgDateGroup {
  tanggal: string;
  formattedTanggal: string;
  entries: MbgPmEntry[];
}

export async function generateMbgDistributionDocx(
  periodText: string,
  groupedData: MbgDateGroup[],
  logoBase64?: string | null
): Promise<Blob> {
  const sections: any[] = [];

  // === 1. COVER PAGE ===
  const coverChildren: any[] = [];

  // Logo (if available)
  if (logoBase64) {
    const logoBytes = dataUriToUint8Array(logoBase64);
    if (logoBytes) {
      coverChildren.push(
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          children: [
            new ImageRun({
              data: logoBytes,
              transformation: { width: 90, height: 90 },
              type: 'png',
            }),
          ],
        })
      );
    }
  }

  // Header Title Text
  coverChildren.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 100, after: 60 },
      children: [
        new TextRun({
          text: 'BADAN GIZI NASIONAL',
          bold: true,
          size: 28, // 14pt
          font: 'Arial',
          color: '111827',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 60 },
      children: [
        new TextRun({
          text: 'SPPG SUKABUMI GUNUNGGURUH KEBONMANGGU',
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '111827',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
      children: [
        new TextRun({
          text: 'YAYASAN LEMBAGA AL UMANAA',
          bold: true,
          size: 22, // 11pt
          font: 'Arial',
          color: '92400E',
        }),
      ],
    }),

    // Document Title
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 300, after: 100 },
      children: [
        new TextRun({
          text: 'LAPORAN KEGIATAN DISTRIBUSI',
          bold: true,
          size: 32, // 16pt
          font: 'Arial',
          color: '111827',
        }),
      ],
    }),
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { before: 0, after: 400 },
      children: [
        new TextRun({
          text: periodText.toUpperCase(),
          bold: true,
          size: 24, // 12pt
          font: 'Arial',
          color: '92400E',
        }),
      ],
    })
  );

  // Table Summary Outline on Cover Page
  const outlineTable = new Table({
    width: { size: 80, type: WidthType.PERCENTAGE },
    alignment: AlignmentType.CENTER,
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 20, type: WidthType.PERCENTAGE },
            shading: { fill: 'F3F4F6' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'NO', bold: true, size: 20 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 80, type: WidthType.PERCENTAGE },
            shading: { fill: 'F3F4F6' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'KETERANGAN', bold: true, size: 20 })],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '1.', size: 20 })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Laporan Dokumentasi Pengiriman', size: 20 })],
              }),
            ],
          }),
        ],
      }),
      new TableRow({
        children: [
          new TableCell({
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: '2.', size: 20 })],
              }),
            ],
          }),
          new TableCell({
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'Lampiran Surat Jalan / Berita Acara Penerimaan (BAST)', size: 20 })],
              }),
            ],
          }),
        ],
      }),
    ],
  });

  coverChildren.push(outlineTable);

  // Add PageBreak after cover
  coverChildren.push(new Paragraph({ children: [new PageBreak()] }));

  // === 2. DAILY REPORT PAGES ===
  for (const group of groupedData) {
    coverChildren.push(
      new Paragraph({
        spacing: { before: 200, after: 150 },
        children: [
          new TextRun({
            text: group.formattedTanggal,
            bold: true,
            size: 26, // 13pt
            color: '111827',
            font: 'Arial',
          }),
        ],
      })
    );

    // Build Table Rows for this date
    const tableRows: TableRow[] = [
      // Table Header Row
      new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 6, type: WidthType.PERCENTAGE },
            shading: { fill: '111827' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'NO', bold: true, color: 'FFFFFF', size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 24, type: WidthType.PERCENTAGE },
            shading: { fill: '111827' },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'SEKOLAH / INSTITUSI', bold: true, color: 'FFFFFF', size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 23, type: WidthType.PERCENTAGE },
            shading: { fill: '111827' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'MENU', bold: true, color: 'FFFFFF', size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 23, type: WidthType.PERCENTAGE },
            shading: { fill: '111827' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'SERAH TERIMA', bold: true, color: 'FFFFFF', size: 18 })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 24, type: WidthType.PERCENTAGE },
            shading: { fill: '111827' },
            children: [
              new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: 'SURAT JALAN', bold: true, color: 'FFFFFF', size: 18 })],
              }),
            ],
          }),
        ],
      }),
    ];

    let rowNo = 1;
    for (const entry of group.entries) {
      if (entry.isSekolahLibur) continue;

      // Prepare image cell children
      const menuCellChildren: any[] = [];
      if (entry.photoMenuUrl) {
        const menuBytes = dataUriToUint8Array(entry.photoMenuUrl);
        if (menuBytes) {
          menuCellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: menuBytes,
                  transformation: { width: 110, height: 85 },
                  type: 'jpg',
                }),
              ],
            })
          );
        }
      }
      if (menuCellChildren.length === 0) {
        menuCellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: '-', color: '9CA3AF', size: 16 })],
          })
        );
      }

      const serahCellChildren: any[] = [];
      if (entry.photoSerahTerimaUrl) {
        const serahBytes = dataUriToUint8Array(entry.photoSerahTerimaUrl);
        if (serahBytes) {
          serahCellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: serahBytes,
                  transformation: { width: 110, height: 85 },
                  type: 'jpg',
                }),
              ],
            })
          );
        }
      }
      if (serahCellChildren.length === 0) {
        serahCellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: '-', color: '9CA3AF', size: 16 })],
          })
        );
      }

      const sjCellChildren: any[] = [];
      if (entry.photoSuratJalanUrl) {
        const sjBytes = dataUriToUint8Array(entry.photoSuratJalanUrl);
        if (sjBytes) {
          sjCellChildren.push(
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [
                new ImageRun({
                  data: sjBytes,
                  transformation: { width: 110, height: 85 },
                  type: 'jpg',
                }),
              ],
            })
          );
        }
      }
      if (sjCellChildren.length === 0) {
        sjCellChildren.push(
          new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: '-', color: '9CA3AF', size: 16 })],
          })
        );
      }

      tableRows.push(
        new TableRow({
          children: [
            // NO
            new TableCell({
              width: { size: 6, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  alignment: AlignmentType.CENTER,
                  children: [new TextRun({ text: `${rowNo}.`, bold: true, size: 18 })],
                }),
              ],
            }),
            // SEKOLAH
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: entry.institutionName, bold: true, size: 18 }),
                    new TextRun({
                      text: `\nPorsi: ${entry.jumlah}`,
                      size: 16,
                      color: '6B7280',
                    }),
                  ],
                }),
              ],
            }),
            // MENU
            new TableCell({
              width: { size: 23, type: WidthType.PERCENTAGE },
              children: menuCellChildren,
            }),
            // SERAH TERIMA
            new TableCell({
              width: { size: 23, type: WidthType.PERCENTAGE },
              children: serahCellChildren,
            }),
            // SURAT JALAN
            new TableCell({
              width: { size: 24, type: WidthType.PERCENTAGE },
              children: sjCellChildren,
            }),
          ],
        })
      );

      rowNo++;
    }

    const dateTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableRows,
    });

    coverChildren.push(dateTable);
    coverChildren.push(new Paragraph({ spacing: { after: 300 }, children: [] }));
  }

  sections.push({
    properties: {},
    children: coverChildren,
  });

  const doc = new Document({
    sections,
  });

  return await Packer.toBlob(doc);
}
