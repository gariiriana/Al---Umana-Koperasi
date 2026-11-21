/**
 * Word (.docx) Laporan 2 Minggu, mengikuti "Lampiran 2 minggu format baru.docx":
 * A4, Times New Roman, tabel bergaris tipis, sel digabung seperti contoh. Dokumentasi foto
 * disusun ulang jadi tabel rapi per tanggal → per bagian, 2 foto per baris dengan keterangan.
 */
import {
  AlignmentType,
  BorderStyle,
  Document,
  ImageRun,
  Packer,
  PageBreak,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableLayoutType,
  TableRow,
  TextRun,
  VerticalAlign,
  VerticalMergeType,
  WidthType,
  type ITableCellOptions,
} from 'docx';
import { LAPORAN_TEMPLATE as T, SPPG_ID, SPPG_NAMA } from '@/constants/mbgLaporanMaster';
import { MENU_BELUM_DIISI, formatHariTanggal, laporanFileName, type LaporanModel, type MenuDay } from '@/lib/laporan2Minggu';
import { containFitDataUrl, dataUrlBytes, downloadBlob } from '@/utils/laporanPhotoFit';

const FONT = 'Times New Roman';
const MM = 56.7; // twip per mm
const CONTENT_MM = 210 - 2 * 25.4;
const INDENT = Math.round(6.35 * MM);
const BODY = 24; // 12 pt
const TABLE = 18; // 9 pt
const PHOTO_ASPECT = 4 / 3;
const PHOTO_W = 268; // px (±71 mm), 2 foto per baris
const PHOTO_H = Math.round(PHOTO_W / PHOTO_ASPECT);
const GRAY = 'F1F5F9';
const AMBER = 'FEF3C7';
const AMBER_DARK = 'FDE68A';

type Block = Paragraph | Table;

const run = (text: string, opts: { bold?: boolean; italics?: boolean; size?: number; color?: string } = {}) =>
  new TextRun({ text, bold: opts.bold, italics: opts.italics, size: opts.size ?? BODY, font: FONT, color: opts.color });

const centerBold = (text: string) =>
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 80 }, children: [run(text, { bold: true })] });

const heading = (text: string, left = 0, before = 240) =>
  new Paragraph({ keepNext: true, keepLines: true, indent: { left }, spacing: { before, after: 120 }, children: [run(text, { bold: true })] });

const para = (text: string, left = INDENT) =>
  new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { left, firstLine: INDENT },
    spacing: { after: 120, line: 276 },
    children: [run(text)],
  });

const note = (text: string, left = INDENT) =>
  new Paragraph({ keepNext: true, indent: { left }, spacing: { after: 100 }, children: [run(text, { italics: true, size: 20, color: '475569' })] });

/** Daftar "1." / "a." dengan indentasi gantung. */
const list = (items: readonly string[], marker: 'number' | 'alpha', left = INDENT) =>
  items.map(
    (item, i) =>
      new Paragraph({
        indent: { left: left + 360, hanging: 360 },
        tabStops: [{ type: 'left', position: left + 360 }],
        spacing: { after: 60 },
        children: [run(`${marker === 'number' ? `${i + 1}.` : `${String.fromCharCode(97 + i)}.`}\t${item}`)],
      }),
  );

const pageBreak = () => new Paragraph({ children: [new PageBreak()] });
const withPeriod = (text: string, period: string) => text.replace('{periode}', period);
const num = (v: number | null) => (v == null ? '-' : v === 0 ? '' : v.toLocaleString('id-ID'));
const total = (v: number | null) => (v == null ? '-' : v.toLocaleString('id-ID'));

interface CellOpts {
  bold?: boolean;
  center?: boolean;
  rowSpan?: number;
  columnSpan?: number;
  merge?: 'restart' | 'continue';
  fill?: string;
  size?: number;
  color?: string;
}

function cell(text: string | Paragraph[], opts: CellOpts = {}) {
  const children = typeof text === 'string'
    ? text.split('\n').map(
        (line) =>
          new Paragraph({
            alignment: opts.center ? AlignmentType.CENTER : AlignmentType.LEFT,
            children: [run(line, { bold: opts.bold, size: opts.size ?? TABLE, color: opts.color })],
          }),
      )
    : text;
  const options: ITableCellOptions = {
    rowSpan: opts.rowSpan,
    columnSpan: opts.columnSpan,
    verticalMerge: opts.merge === 'restart' ? VerticalMergeType.RESTART : opts.merge === 'continue' ? VerticalMergeType.CONTINUE : undefined,
    verticalAlign: VerticalAlign.CENTER,
    margins: { top: 40, bottom: 40, left: 80, right: 80 },
    shading: opts.fill ? { type: ShadingType.CLEAR, color: 'auto', fill: opts.fill } : undefined,
    children,
  };
  return new TableCell(options);
}

const head = (labels: string[]) =>
  new TableRow({ tableHeader: true, cantSplit: true, children: labels.map((h) => cell(h, { bold: true, center: true })) });

function table(rows: TableRow[], widthsMm: number[]) {
  const scale = CONTENT_MM / widthsMm.reduce((a, b) => a + b, 0);
  const widths = widthsMm.map((w) => Math.round(w * scale * MM));
  return new Table({
    layout: TableLayoutType.FIXED,
    width: { size: widths.reduce((a, b) => a + b, 0), type: WidthType.DXA },
    columnWidths: widths,
    rows,
  });
}

// ---------------------------------------------------------------------------
// 1). Penerima Manfaat
// ---------------------------------------------------------------------------

function pesertaDidikTable(model: LaporanModel): Block {
  const rows: TableRow[] = [
    head(['NO', 'Nama Satuan Pendidikan', 'Kelas', 'Alamat Satuan Pendidikan (Lengkap)', 'Jumlah siswa yang mendapat MBG', 'Jumlah siswa laki-laki', 'Jumlah siswa perempuan', 'Total Jumlah Peserta Didik']),
  ];
  for (const s of model.penerima?.pesertaDidik ?? []) {
    s.kelas.forEach((k, i) => {
      const span = s.kelas.length;
      const first = i === 0;
      const merged = (text: string, center = true) =>
        cell(first ? text : '', { center, merge: span > 1 ? (first ? 'restart' : 'continue') : undefined });
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            merged(String(s.no)),
            merged(s.nama, false),
            cell(k.kelas, { center: true }),
            merged(s.alamat, false),
            merged(total(s.jumlah)),
            cell(num(k.l), { center: true }),
            cell(num(k.p), { center: true }),
            merged(total(s.jumlah)),
          ],
        }),
      );
    });
  }
  return table(rows, [9, 29, 11, 34, 18, 17, 18, 18]);
}

function ptkTable(model: LaporanModel): Block {
  const rows: TableRow[] = [
    head(['NO', 'Nama Satuan Pendidikan', 'Wilayah Kecamatan', 'Alamat Satuan Pendidikan (Lengkap)', 'Jumlah Pendidik dan Kependidikan yang mendapat MBG', 'Jumlah laki-laki', 'Jumlah perempuan', 'Total Jumlah']),
  ];
  for (const r of model.penerima?.ptk ?? []) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell(String(r.no), { center: true }),
          cell(r.nama),
          cell(r.kecamatan),
          cell(r.alamat),
          cell(total(r.jumlah), { center: true }),
          cell(num(r.l), { center: true }),
          cell(num(r.p), { center: true }),
          cell(total(r.jumlah), { center: true }),
        ],
      }),
    );
  }
  return table(rows, [9, 27, 25, 29, 22, 15, 20, 15]);
}

function posyanduTable(model: LaporanModel): Block {
  const rows: TableRow[] = [
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell('NO', { bold: true, center: true, merge: 'restart' }),
        cell('Nama Posyandu', { bold: true, center: true, merge: 'restart' }),
        cell('Alamat Posyandu', { bold: true, center: true, merge: 'restart' }),
        cell('Ibu Hamil', { bold: true, center: true, merge: 'restart' }),
        cell('Ibu Menyusui', { bold: true, center: true, merge: 'restart' }),
        cell('Anak di bawah 5 tahun mulai usia 6 bulan', { bold: true, center: true, columnSpan: 2 }),
        cell('Total Jumlah', { bold: true, center: true, merge: 'restart' }),
      ],
    }),
    new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: [
        cell('', { merge: 'continue' }),
        cell('', { merge: 'continue' }),
        cell('', { merge: 'continue' }),
        cell('', { merge: 'continue' }),
        cell('', { merge: 'continue' }),
        cell('Laki-laki', { bold: true, center: true }),
        cell('Perempuan', { bold: true, center: true }),
        cell('', { merge: 'continue' }),
      ],
    }),
  ];
  for (const r of model.penerima?.posyandu ?? []) {
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          cell(String(r.no), { center: true }),
          cell(r.nama),
          cell(r.alamat),
          cell(num(r.bumil), { center: true }),
          cell(num(r.busui), { center: true }),
          cell(num(r.l), { center: true }),
          cell(num(r.p), { center: true }),
          cell(total(r.total), { center: true }),
        ],
      }),
    );
  }
  return table(rows, [9, 32, 34, 16, 18, 18, 18, 17]);
}

// ---------------------------------------------------------------------------
// 2). Jenis Menu
// ---------------------------------------------------------------------------

function menuParagraphs(day: MenuDay): { paragraphs: Paragraph[]; fill?: string } {
  if (day.menu.length === 0) {
    return {
      fill: AMBER,
      paragraphs: [
        new Paragraph({ alignment: AlignmentType.CENTER, children: [run(MENU_BELUM_DIISI, { bold: true, size: TABLE, color: 'B91C1C' })] }),
        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run('Lengkapi di Produksi MBG lalu download ulang.', { italics: true, size: 16, color: '92400E' })] }),
      ],
    };
  }
  const p: Paragraph[] = [new Paragraph({ spacing: { after: 60 }, children: [run('Menu Ompreng:', { bold: true, size: TABLE })] })];
  day.menu.forEach((block, i) => {
    p.push(new Paragraph({ spacing: { before: i === 0 ? 0 : 100 }, children: [run(block.label, { bold: true, size: TABLE })] }));
    for (const item of block.items) p.push(new Paragraph({ children: [run(`- ${item}`, { size: TABLE })] }));
  });
  return { paragraphs: p };
}

function menuTable(day: MenuDay): Block {
  const rows: TableRow[] = [
    head(['Nama Satuan Pendidikan / Posyandu', 'Hari/Tanggal Pemberian', 'Kelompok Penerima Manfaat', 'Jumlah Penerima Manfaat', 'Jenis Menu MBG']),
  ];
  const groups = [
    { label: 'SEKOLAH', rows: day.sekolah },
    { label: 'POSYANDU', rows: day.posyandu },
  ].filter((g) => g.rows.length > 0);
  const menu = menuParagraphs(day);
  let firstRow = true;
  for (const g of groups) {
    g.rows.forEach((r, i) => {
      const children: TableCell[] = [
        cell(i === 0 ? g.label : '', { bold: true, merge: g.rows.length > 1 ? (i === 0 ? 'restart' : 'continue') : undefined }),
        cell(firstRow ? day.hariTanggal : '', { center: true, merge: firstRow ? 'restart' : 'continue' }),
        cell(r.nama),
        cell(r.jumlah.toLocaleString('id-ID'), { center: true }),
        firstRow
          ? cell(menu.paragraphs, { merge: 'restart', fill: menu.fill })
          : cell('', { merge: 'continue', fill: menu.fill }),
      ];
      rows.push(new TableRow({ cantSplit: true, children }));
      firstRow = false;
    });
  }
  const jumlah = [...day.sekolah, ...day.posyandu].reduce((s, r) => s + r.jumlah, 0);
  rows.push(
    new TableRow({
      cantSplit: true,
      children: [
        cell('Total Penerima Manfaat', { bold: true, columnSpan: 3 }),
        cell(jumlah.toLocaleString('id-ID'), { bold: true, center: true }),
        cell('', { fill: menu.fill }),
      ],
    }),
  );
  return table(rows, [24, 26, 34, 20, 56]);
}

// ---------------------------------------------------------------------------
// 3). Tim Pelaksana
// ---------------------------------------------------------------------------

function timTable(model: LaporanModel): Block {
  const rows: TableRow[] = [
    head(['Jabatan Sebagai', 'Nama', 'Jenis Kelamin Laki-laki', 'Jenis Kelamin Perempuan', 'Umur', 'Kecamatan Tempat Tinggal']),
  ];
  const tim = model.tim;
  const runStart = (i: number, col: 0 | 4) => i === 0 || tim[i - 1][col] !== tim[i][col];
  const runLength = (i: number, col: 0 | 4) => {
    let len = 1;
    while (i + len < tim.length && tim[i + len][col] === tim[i][col]) len++;
    return len;
  };
  tim.forEach((m, i) => {
    const mergedCell = (col: 0 | 4) => {
      const start = runStart(i, col);
      if (start) return cell(m[col], { merge: runLength(i, col) > 1 ? 'restart' : undefined });
      return cell('', { merge: 'continue' });
    };
    rows.push(
      new TableRow({
        cantSplit: true,
        children: [
          mergedCell(0),
          cell(m[1]),
          cell(m[2] === 'L' ? 'L' : '', { center: true }),
          cell(m[2] === 'P' ? 'P' : '', { center: true }),
          cell(String(m[3]), { center: true }),
          mergedCell(4),
        ],
      }),
    );
  });
  return table(rows, [28, 50, 20, 20, 14, 30]);
}

// ---------------------------------------------------------------------------
// 4). Dokumentasi
// ---------------------------------------------------------------------------

const NONE = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
const THIN = { style: BorderStyle.SINGLE, size: 4, color: 'CBD5E1' };

async function dokumentasi(model: LaporanModel): Promise<Block[]> {
  if (model.dokumentasi.length === 0) return [note('(Belum ada foto dokumentasi untuk periode ini.)')];
  const out: Block[] = [];
  for (const day of model.dokumentasi) {
    const rows: TableRow[] = [
      new TableRow({
        cantSplit: true,
        children: [
          new TableCell({
            columnSpan: 2,
            shading: { type: ShadingType.CLEAR, color: 'auto', fill: AMBER_DARK },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
            children: [new Paragraph({ alignment: AlignmentType.CENTER, keepNext: true, children: [run(day.hariTanggal, { bold: true, size: 22 })] })],
          }),
        ],
      }),
    ];
    for (const section of day.sections) {
      rows.push(
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              columnSpan: 2,
              shading: { type: ShadingType.CLEAR, color: 'auto', fill: GRAY },
              margins: { top: 60, bottom: 60, left: 120, right: 120 },
              borders: { top: THIN, bottom: THIN, left: THIN, right: THIN },
              children: [new Paragraph({ keepNext: true, children: [run(`${section.label}  (${section.photos.length} foto)`, { bold: true, size: 20 })] })],
            }),
          ],
        }),
      );
      const fitted = await Promise.all(section.photos.map((p) => containFitDataUrl(p.url, PHOTO_ASPECT, 900)));
      for (let i = 0; i < fitted.length; i += 2) {
        const pair = [0, 1].map((k) => (i + k < fitted.length ? { src: fitted[i + k], caption: section.photos[i + k].caption } : null));
        const lastRowOfSection = i + 2 >= fitted.length;
        rows.push(
          new TableRow({
            cantSplit: true,
            children: pair.map(
              (ph) =>
                new TableCell({
                  borders: { top: NONE, bottom: lastRowOfSection ? THIN : NONE, left: THIN, right: THIN },
                  margins: { top: 100, bottom: 100, left: 100, right: 100 },
                  verticalAlign: VerticalAlign.TOP,
                  children: ph
                    ? [
                        new Paragraph({
                          alignment: AlignmentType.CENTER,
                          children: [new ImageRun({ type: 'jpg', data: dataUrlBytes(ph.src), transformation: { width: PHOTO_W, height: PHOTO_H } })],
                        }),
                        new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60 }, children: [run(ph.caption, { size: 18, color: '334155' })] }),
                      ]
                    : [new Paragraph({ children: [] })],
                }),
            ),
          }),
        );
      }
    }
    out.push(table(rows, [1, 1]), new Paragraph({ spacing: { after: 240 }, children: [] }));
  }
  return out;
}

// ---------------------------------------------------------------------------
// Dokumen
// ---------------------------------------------------------------------------

export async function renderLaporanDocx(model: LaporanModel): Promise<Blob> {
  const dataNote = model.penerima
    ? [note(`(Data ${formatHariTanggal(model.penerima.tanggal)})`)]
    : [note('(Belum ada data PM dari Admin MBG di periode ini.)')];

  const menuBlocks: Block[] = [];
  model.menuDays.forEach((day, i) => {
    if (i > 0) menuBlocks.push(pageBreak());
    menuBlocks.push(menuTable(day));
  });
  if (model.menuDays.length === 0) menuBlocks.push(note('(Belum ada data PM dari Admin MBG di periode ini.)'));

  const children: Block[] = [
    centerBold(T.judul),
    centerBold(`Nama SPPG: ${SPPG_NAMA}`),
    centerBold(`ID SPPG: ${SPPG_ID}`),
    centerBold(`Periode : ${model.periodHeader}`),
    heading('BAB I. PENDAHULUAN', 0, 360),
    heading('a.   Latar Belakang', INDENT / 2),
    ...T.latarBelakang.map((p) => para(p)),
    heading('b.   Tujuan', INDENT / 2),
    ...list(T.tujuan, 'alpha'),
    heading('c.   Sasaran', INDENT / 2),
    para(withPeriod(T.sasaran, model.periodRange)),
    pageBreak(),
    heading('BAB II. PELAKSANAAN KEGIATAN', 0, 0),
    heading('a.   Persiapan (koordinasi lintas sektor)', INDENT / 2),
    para(T.persiapan),
    ...list(T.persiapanList, 'number'),
    heading('b.   Pelaksanaan', INDENT / 2),
    para(withPeriod(T.pelaksanaan, model.periodRange.replace(' - ', ' – '))),
    heading('1). PENERIMA MANFAAT MBG'),
    heading('a.   Peserta Didik', INDENT / 2, 120),
    ...dataNote,
    pesertaDidikTable(model),
    heading('b.   Pendidik dan Tenaga Kependidikan', INDENT / 2),
    ptkTable(model),
    heading('c.   Non Peserta Didik', INDENT / 2),
    posyanduTable(model),
    pageBreak(),
    heading('2). JENIS MENU MBG YANG DIBERIKAN', 0, 0),
    ...menuBlocks,
    pageBreak(),
    heading('3). TIM PELAKSANA PROGRAM MBG DI SPPG', 0, 0),
    new Paragraph({ indent: { left: INDENT }, spacing: { after: 120 }, children: [run(T.timIntro)] }),
    timTable(model),
    pageBreak(),
    heading('4) DOKUMENTASI KEGIATAN', 0, 0),
    new Paragraph({ spacing: { after: 160 }, children: [run(T.dokumentasiIntro)] }),
    ...(await dokumentasi(model)),
    pageBreak(),
    heading('BAB III. PERMASALAHAN DAN KENDALA', 0, 0),
    heading('a.   Permasalahan dan Kendala', INDENT / 2),
    ...list(T.permasalahan, 'number'),
    heading('b.   Penanganan Permasalahan', INDENT / 2),
    ...list(T.penanganan, 'number'),
    heading('c.   Rencana Tindak Lanjut', INDENT / 2),
    ...list(T.tindakLanjut, 'number'),
    heading('BAB IV. PENUTUP', 0, 360),
    para(T.penutup, 0),
  ];

  const margin = Math.round(25.4 * MM);
  const doc = new Document({
    creator: 'Koperasi Al-Umanaa',
    title: `${T.judul} ${model.periodHeader}`,
    styles: { default: { document: { run: { font: FONT, size: BODY } } } },
    sections: [{ properties: { page: { margin: { top: margin, bottom: margin, left: margin, right: margin } } }, children }],
  });
  return Packer.toBlob(doc);
}

export async function exportLaporanDocx(model: LaporanModel): Promise<void> {
  downloadBlob(await renderLaporanDocx(model), laporanFileName(model, 'docx'));
}
