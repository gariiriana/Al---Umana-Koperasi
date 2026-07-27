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
  HeadingLevel,
} from 'docx';

// Helper to convert base64 image data URL to Uint8Array
export async function base64ToUint8Array(base64Str: string): Promise<Uint8Array | null> {
  try {
    if (!base64Str) return null;
    let cleanStr = base64Str;
    if (base64Str.includes(',')) {
      cleanStr = base64Str.split(',')[1];
    }
    const binaryStr = atob(cleanStr);
    const len = binaryStr.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryStr.charCodeAt(i);
    }
    return bytes;
  } catch (err) {
    console.error('Failed to convert base64 to Uint8Array:', err);
    return null;
  }
}

// ----------------------------------------------------
// 1. EXPORT PURCHASING REPORT TO DOCX
// ----------------------------------------------------
export interface PurchasingDocxItem {
  name: string;
  category?: string;
  qty: number;
  unit: string;
  pricePerUnit?: number;
  totalPrice?: number;
  supplierName?: string;
  photoUrl?: string;
  jamKedatangan?: string;
  keterangan?: string;
}

export interface PurchasingDocxData {
  title?: string;
  formNo?: string;
  dari?: string;
  kepada?: string;
  waktu?: string;
  batchDate: string;
  totalItems: number;
  totalAmount?: number;
  items: PurchasingDocxItem[];
  notes?: string;
  officerName?: string;
  logoBase64?: string;
}

export async function exportPurchasingToDocx(data: PurchasingDocxData, fileName: string) {
  const tableRows: TableRow[] = [];

  // Table Header Row 1
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({
          width: { size: 5, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'No', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 28, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Jenis Bahan Makanan', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Banyaknya (Angka)', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 11, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Satuan', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          columnSpan: 2,
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Jumlah', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          columnSpan: 2,
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Kondisi Bahan Makanan', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
        new TableCell({
          width: { size: 14, type: WidthType.PERCENTAGE },
          shading: { fill: 'FFFFFF' },
          children: [new Paragraph({ children: [new TextRun({ text: 'Dokumentasi', bold: true, color: '000000', size: 18 })], alignment: AlignmentType.CENTER })],
        }),
      ],
    })
  );

  // Table Header Row 2 (Sub-headers for Jumlah and Kondisi)
  tableRows.push(
    new TableRow({
      tableHeader: true,
      children: [
        new TableCell({ children: [new Paragraph({ text: '' })] }),
        new TableCell({ children: [new Paragraph({ text: '' })] }),
        new TableCell({ children: [new Paragraph({ text: '' })] }),
        new TableCell({ children: [new Paragraph({ text: '' })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Sesuai', bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Tidak', bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Baik', bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Rusak', bold: true, size: 16 })], alignment: AlignmentType.CENTER })] }),
        new TableCell({ children: [new Paragraph({ text: '' })] }),
      ],
    })
  );

  // Table Data Rows
  for (let idx = 0; idx < data.items.length; idx++) {
    const item = data.items[idx];

    const docuCellChildren: Paragraph[] = [];
    if (item.photoUrl) {
      const imgBytes = await base64ToUint8Array(item.photoUrl);
      if (imgBytes) {
        docuCellChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imgBytes,
                type: 'png',
                transformation: { width: 65, height: 50 },
              }),
            ],
            alignment: AlignmentType.CENTER,
          })
        );
      }
    }
    if (docuCellChildren.length === 0) {
      docuCellChildren.push(new Paragraph({ text: '' }));
    }

    tableRows.push(
      new TableRow({
        children: [
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `${idx + 1}`, size: 18 })], alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: item.name, size: 18 })] })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: `${item.qty}`, size: 18 })], alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: item.unit, size: 18 })], alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'V', bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            children: [new Paragraph({ text: '' })],
          }),
          new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: 'V', bold: true, size: 18 })], alignment: AlignmentType.CENTER })],
          }),
          new TableCell({
            children: [new Paragraph({ text: '' })],
          }),
          new TableCell({
            children: docuCellChildren,
          }),
        ],
      })
    );
  }

  // Generate Header Table (Logo + Form Title)
  const logoChildren: Paragraph[] = [];
  if (data.logoBase64) {
    const logoBytes = await base64ToUint8Array(data.logoBase64);
    if (logoBytes) {
      logoChildren.push(
        new Paragraph({
          children: [
            new ImageRun({
              data: logoBytes,
              type: 'png',
              transformation: { width: 50, height: 50 },
            }),
          ],
        })
      );
    }
  }

  const headerTable = new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    borders: {
      top: { style: BorderStyle.NONE },
      bottom: { style: BorderStyle.NONE },
      left: { style: BorderStyle.NONE },
      right: { style: BorderStyle.NONE },
      insideHorizontal: { style: BorderStyle.NONE },
      insideVertical: { style: BorderStyle.NONE },
    },
    rows: [
      new TableRow({
        children: [
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              ...logoChildren,
              new Paragraph({
                children: [new TextRun({ text: 'BADAN GIZI NASIONAL', bold: true, size: 22, color: '0F172A' })],
              }),
            ],
          }),
          new TableCell({
            width: { size: 50, type: WidthType.PERCENTAGE },
            children: [
              new Paragraph({
                children: [new TextRun({ text: 'FORM PEMERIKSAAN BAHAN MAKANAN', bold: true, size: 22, color: '0F172A' })],
                alignment: AlignmentType.RIGHT,
              }),
              new Paragraph({
                children: [new TextRun({ text: data.formNo || 'NO : 01/PBM/III/2026', bold: true, size: 20, color: '0F172A' })],
                alignment: AlignmentType.RIGHT,
              }),
            ],
          }),
        ],
      }),
    ],
  });

  const waktuStr = data.waktu || data.batchDate;

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: [
          headerTable,
          new Paragraph({ text: '', spacing: { after: 200 } }),

          // Metadata Dari / Kepada / Waktu
          new Paragraph({
            children: [
              new TextRun({ text: 'Dari       : ', bold: true, size: 20 }),
              new TextRun({ text: data.dari || 'Koperasi Al Umanaa Sejahtera Mandiri', size: 20 }),
            ],
            spacing: { after: 50 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Kepada : ', bold: true, size: 20 }),
              new TextRun({ text: data.kepada || 'SPPG Sukabumi Gunungguruh Kebonmanggu', size: 20 }),
            ],
            spacing: { after: 50 },
          }),
          new Paragraph({
            children: [
              new TextRun({ text: 'Waktu    : ', bold: true, size: 20 }),
              new TextRun({ text: waktuStr, size: 20 }),
            ],
            spacing: { after: 250 },
          }),

          // Main Table
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: tableRows,
          }),

          new Paragraph({ text: '', spacing: { after: 500 } }),

          // Bottom Right Signatures
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            borders: {
              top: { style: BorderStyle.NONE },
              bottom: { style: BorderStyle.NONE },
              left: { style: BorderStyle.NONE },
              right: { style: BorderStyle.NONE },
              insideHorizontal: { style: BorderStyle.NONE },
              insideVertical: { style: BorderStyle.NONE },
            },
            rows: [
              new TableRow({
                children: [
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    children: [new Paragraph({ text: '' })],
                  }),
                  new TableCell({
                    width: { size: 50, type: WidthType.PERCENTAGE },
                    children: [
                      new Paragraph({ children: [new TextRun({ text: `Sukabumi, ${waktuStr}`, size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ children: [new TextRun({ text: 'Kepala Satuan Pelayanan Pemenuhan Gizi', size: 20 })], alignment: AlignmentType.CENTER }),
                      new Paragraph({ text: '', spacing: { after: 900 } }),
                      new Paragraph({ children: [new TextRun({ text: data.officerName || 'Ragha Eskha Utama, S. Hum.', bold: true, size: 20 })], alignment: AlignmentType.CENTER }),
                    ],
                  }),
                ],
              }),
            ],
          }),
        ],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
}

// ----------------------------------------------------
// 2. EXPORT DISTRIBUTION / QC REPORT TO DOCX
// ----------------------------------------------------
export interface DistributionDocxData {
  title: string;
  deliveryDate: string;
  institutionName: string;
  institutionType: 'sekolah' | 'posyandu';
  driverName?: string;
  vehicleNumber?: string;
  qtPorsiBesar: number;
  qtPorsiKecil: number;
  qtPorsiBalita: number;
  qtPorsiBumilBusui: number;
  qtGuruKader: number;
  totalPortions: number;
  qcStatus: string;
  qcNotes?: string;
  photos?: string[];
}

export async function exportDistributionToDocx(data: DistributionDocxData, fileName: string) {
  const docxChildren: (Paragraph | Table)[] = [
    new Paragraph({
      children: [
        new TextRun({
          text: 'SURAT JALAN & LAPORAN QC DISTRIBUSI',
          bold: true,
          size: 30,
          color: '0F172A',
        }),
      ],
      heading: HeadingLevel.HEADING_1,
      spacing: { after: 100 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Institusi Penerima: `, bold: true, size: 20 }),
        new TextRun({ text: `${data.institutionName} (${data.institutionType.toUpperCase()})`, size: 20 }),
      ],
      spacing: { after: 50 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Tanggal Pengiriman: `, bold: true, size: 20 }),
        new TextRun({ text: `${data.deliveryDate}`, size: 20 }),
      ],
      spacing: { after: 50 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Driver / Kurir: `, bold: true, size: 20 }),
        new TextRun({ text: `${data.driverName || '-'} (Plat: ${data.vehicleNumber || '-'})`, size: 20 }),
      ],
      spacing: { after: 50 },
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `Status QC Hasil Pengiriman: `, bold: true, size: 20 }),
        new TextRun({ text: `${data.qcStatus.toUpperCase()}`, bold: true, color: data.qcStatus === 'pass' ? '15803D' : 'B91C1C', size: 20 }),
      ],
      spacing: { after: 200 },
    }),

    // Table of Portions
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [
        new TableRow({
          tableHeader: true,
          children: [
            new TableCell({ shading: { fill: '1E293B' }, children: [new Paragraph({ children: [new TextRun({ text: 'KATEGORI PORSI', bold: true, color: 'FFFFFF', size: 18 })] })] }),
            new TableCell({ shading: { fill: '1E293B' }, children: [new Paragraph({ children: [new TextRun({ text: 'TARGET PENERIMA', bold: true, color: 'FFFFFF', size: 18 })] })] }),
            new TableCell({ shading: { fill: '1E293B' }, children: [new Paragraph({ children: [new TextRun({ text: 'JUMLAH (PORSI)', bold: true, color: 'FFFFFF', size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PORSI BESAR', bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Siswa Kelas Tinggi / Remaja', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.qtPorsiBesar}`, size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PORSI KECIL', bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Siswa TK / SD Kelas Rendah', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.qtPorsiKecil}`, size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PORSI BALITA', bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Anak Usia Balita (Posyandu)', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.qtPorsiBalita}`, size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PORSI BUMIL & BUSUI', bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Ibu Hamil & Menyusui (Posyandu)', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.qtPorsiBumilBusui}`, size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'PETUGAS (GURU/KADER/STAF)', bold: true, size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: 'Guru, Kader Posyandu, Tendik', size: 18 })] })] }),
            new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: `${data.qtGuruKader}`, size: 18 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
        new TableRow({
          children: [
            new TableCell({ columnSpan: 2, shading: { fill: 'FEF3C7' }, children: [new Paragraph({ children: [new TextRun({ text: 'TOTAL PORSI TERKIRIM', bold: true, color: '92400E', size: 20 })], alignment: AlignmentType.RIGHT })] }),
            new TableCell({ shading: { fill: 'FEF3C7' }, children: [new Paragraph({ children: [new TextRun({ text: `${data.totalPortions} Porsi`, bold: true, color: '92400E', size: 20 })], alignment: AlignmentType.RIGHT })] }),
          ],
        }),
      ],
    }),
    new Paragraph({ text: '', spacing: { after: 300 } }),
  ];

  // Attached Photos Section if available
  if (data.photos && data.photos.length > 0) {
    docxChildren.push(
      new Paragraph({
        children: [new TextRun({ text: 'FOTO DOKUMENTASI BAHAN & SERAH TERIMA QC', bold: true, size: 22, color: '0F172A' })],
        spacing: { after: 150 },
      })
    );

    for (let i = 0; i < data.photos.length; i++) {
      const imgBytes = await base64ToUint8Array(data.photos[i]);
      if (imgBytes) {
        docxChildren.push(
          new Paragraph({
            children: [
              new ImageRun({
                data: imgBytes,
                type: 'png',
                transformation: { width: 240, height: 180 },
              }),
            ],
            spacing: { after: 150 },
          })
        );
      }
    }
  }

  // Signatures Section
  docxChildren.push(
    new Paragraph({ text: '', spacing: { after: 300 } }),
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: {
        top: { style: BorderStyle.NONE },
        bottom: { style: BorderStyle.NONE },
        left: { style: BorderStyle.NONE },
        right: { style: BorderStyle.NONE },
        insideHorizontal: { style: BorderStyle.NONE },
        insideVertical: { style: BorderStyle.NONE },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Petugas Distribusi,', size: 18 })], alignment: AlignmentType.CENTER }),
                new Paragraph({ text: '', spacing: { after: 800 } }),
                new Paragraph({ children: [new TextRun({ text: '( _______________________ )', bold: true, size: 18 })], alignment: AlignmentType.CENTER }),
              ],
            }),
            new TableCell({
              width: { size: 33, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Driver / Transport,', size: 18 })], alignment: AlignmentType.CENTER }),
                new Paragraph({ text: '', spacing: { after: 800 } }),
                new Paragraph({ children: [new TextRun({ text: '( _______________________ )', bold: true, size: 18 })], alignment: AlignmentType.CENTER }),
              ],
            }),
            new TableCell({
              width: { size: 34, type: WidthType.PERCENTAGE },
              children: [
                new Paragraph({ children: [new TextRun({ text: 'Penerima (PIC/Kader),', size: 18 })], alignment: AlignmentType.CENTER }),
                new Paragraph({ text: '', spacing: { after: 800 } }),
                new Paragraph({ children: [new TextRun({ text: '( _______________________ )', bold: true, size: 18 })], alignment: AlignmentType.CENTER }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  const doc = new Document({
    sections: [
      {
        children: docxChildren,
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName.endsWith('.docx') ? fileName : `${fileName}.docx`;
  a.click();
  window.URL.revokeObjectURL(url);
}
