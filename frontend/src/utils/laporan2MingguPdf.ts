/**
 * PDF Laporan 2 Minggu: isi dan urutan sama dengan laporan2MingguDocx (format
 * "Lampiran 2 minggu format baru"): A4, huruf Times, tabel bergaris hitam tipis; dokumentasi
 * berupa tabel foto per tanggal → per bagian, 2 foto per baris dengan keterangan.
 */
import { jsPDF } from 'jspdf';
import autoTable, { type CellDef, type CellInput, type RowInput } from 'jspdf-autotable';
import { LAPORAN_TEMPLATE as T, SPPG_ID, SPPG_NAMA } from '@/constants/mbgLaporanMaster';
import { MENU_BELUM_DIISI, formatHariTanggal, laporanFileName, type LaporanModel, type MenuDay } from '@/lib/laporan2Minggu';
import { containFitDataUrl } from '@/utils/laporanPhotoFit';

const PAGE_H = 297;
const M = 25.4;
const CW = 210 - 2 * M;
const FONT = 'times';
const BODY = 12;
const LH = 6;
const SUB_X = M + 3;
const TEXT_X = M + 6.35;
const TEXT_W = CW - 6.35;
const PHOTO_ASPECT = 4 / 3;

const withPeriod = (text: string, period: string) => text.replace('{periode}', period);
const num = (v: number | null) => (v == null ? '-' : v === 0 ? '' : v.toLocaleString('id-ID'));
const total = (v: number | null) => (v == null ? '-' : v.toLocaleString('id-ID'));

const TABLE_STYLES = {
  font: FONT,
  fontSize: 9,
  textColor: 0,
  lineColor: 0,
  lineWidth: 0.2,
  cellPadding: 1.4,
  valign: 'middle' as const,
};
const HEAD_STYLES = { fillColor: 255 as const, textColor: 0, fontStyle: 'bold' as const, halign: 'center' as const };

class Writer {
  y = M;
  constructor(readonly doc: jsPDF) {}

  newPage() {
    this.doc.addPage();
    this.y = M;
  }

  ensure(height: number) {
    if (this.y + height > PAGE_H - M) this.newPage();
  }

  gap(mm: number) {
    this.y += mm;
  }

  bold(text: string, x: number, opts: { align?: 'center'; keep?: number } = {}) {
    this.ensure(LH + (opts.keep ?? 0));
    this.doc.setFont(FONT, 'bold');
    this.doc.setFontSize(BODY);
    this.doc.text(text, opts.align === 'center' ? 105 : x, this.y, opts.align ? { align: 'center' } : undefined);
    this.y += LH + 0.8;
  }

  note(text: string, x = TEXT_X) {
    this.ensure(LH);
    this.doc.setFont(FONT, 'italic');
    this.doc.setFontSize(10);
    this.doc.setTextColor(71, 85, 105);
    this.doc.text(text, x, this.y);
    this.doc.setTextColor(0);
    this.y += LH;
  }

  /** Paragraf rata kiri-kanan dengan baris pertama menjorok. */
  paragraph(text: string, x = TEXT_X, width = TEXT_W, indent = 6.35) {
    const doc = this.doc;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(BODY);
    const first: string = doc.splitTextToSize(text, width - indent)[0];
    const rest = text.slice(first.length).trim();
    const lines: string[] = [first, ...(rest ? (doc.splitTextToSize(rest, width) as string[]) : [])];
    lines.forEach((line, i) => {
      this.ensure(LH);
      const lx = i === 0 ? x + indent : x;
      const lw = i === 0 ? width - indent : width;
      // jsPDF tidak meratakan baris terakhir sebuah blok, jadi tiap baris diberi baris kosong sesudahnya.
      if (i === lines.length - 1) doc.text(line, lx, this.y);
      else doc.text([line.trim(), ''], lx, this.y, { align: 'justify', maxWidth: lw });
      this.y += LH;
    });
    this.y += 2;
  }

  list(items: readonly string[], marker: 'number' | 'alpha', x = TEXT_X, width = TEXT_W) {
    const doc = this.doc;
    doc.setFont(FONT, 'normal');
    doc.setFontSize(BODY);
    items.forEach((item, i) => {
      const lines: string[] = doc.splitTextToSize(item, width - 7);
      lines.forEach((line, j) => {
        this.ensure(LH);
        if (j === 0) doc.text(marker === 'number' ? `${i + 1}.` : `${String.fromCharCode(97 + i)}.`, x, this.y);
        doc.text(line, x + 7, this.y);
        this.y += LH;
      });
    });
    this.y += 1;
  }

  table(t: TableArgs) {
    autoTable(this.doc, tableOptions(t, this.y));
    this.y = lastY(this.doc) + 6;
  }

  /**
   * Judul bagian + tabelnya tanpa terpisah halaman: tabel yang muat satu halaman dipindah utuh
   * ke halaman baru bila sisa halaman tidak cukup; tabel panjang minimal membawa kepala + beberapa baris.
   */
  section(title: string, x: number, t: TableArgs, note?: string) {
    const headH = LH + 0.8 + (note ? LH : 0);
    const { pages, height } = measureTable(t);
    this.ensure(headH + (pages === 1 ? height : 45));
    this.bold(title, x);
    if (note) this.note(note);
    this.table(t);
  }
}

interface TableArgs {
  head: RowInput[];
  body: RowInput[];
  widths: number[];
  center?: number[];
  /** 'avoid' = baris (dan kelompok sel gabung) tidak dipotong antarhalaman. */
  pageBreak?: 'auto' | 'avoid';
}

function tableOptions(t: TableArgs, startY: number) {
  const scale = CW / t.widths.reduce((a, b) => a + b, 0);
  const columnStyles: Record<number, { cellWidth: number; halign?: 'center' }> = {};
  t.widths.forEach((w, i) => {
    columnStyles[i] = { cellWidth: w * scale, ...((t.center ?? []).includes(i) ? { halign: 'center' as const } : {}) };
  });
  return {
    startY,
    head: t.head,
    body: t.body,
    theme: 'grid' as const,
    margin: { left: M, right: M, top: M, bottom: M },
    styles: TABLE_STYLES,
    headStyles: HEAD_STYLES,
    columnStyles,
    rowPageBreak: t.pageBreak ?? ('avoid' as const),
  };
}

const lastY = (doc: jsPDF) => (doc as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

/** Tinggi tabel bila digambar dari atas halaman kosong (dokumen percobaan, tidak ikut tersimpan). */
function measureTable(t: TableArgs): { pages: number; height: number } {
  const probe = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  autoTable(probe, tableOptions(t, M));
  return { pages: probe.getNumberOfPages(), height: lastY(probe) - M };
}

function writePendahuluan(w: Writer, model: LaporanModel) {
  w.bold(T.judul, 0, { align: 'center' });
  w.bold(`Nama SPPG: ${SPPG_NAMA}`, 0, { align: 'center' });
  w.bold(`ID SPPG: ${SPPG_ID}`, 0, { align: 'center' });
  w.bold(`Periode : ${model.periodHeader}`, 0, { align: 'center' });
  w.gap(6);
  w.bold('BAB I. PENDAHULUAN', M);
  w.bold('a.   Latar Belakang', SUB_X, { keep: LH * 2 });
  T.latarBelakang.forEach((p) => w.paragraph(p));
  w.bold('b.   Tujuan', SUB_X, { keep: LH * 2 });
  w.list(T.tujuan, 'alpha');
  w.bold('c.   Sasaran', SUB_X, { keep: LH * 2 });
  w.paragraph(withPeriod(T.sasaran, model.periodRange));
}

function writePenerima(w: Writer, model: LaporanModel) {
  w.newPage();
  w.bold('BAB II. PELAKSANAAN KEGIATAN', M);
  w.bold('a.   Persiapan (koordinasi lintas sektor)', SUB_X, { keep: LH * 2 });
  w.paragraph(T.persiapan);
  w.list(T.persiapanList, 'number');
  w.bold('b.   Pelaksanaan', SUB_X, { keep: LH * 2 });
  w.paragraph(withPeriod(T.pelaksanaan, model.periodRange.replace(' - ', ' – ')));
  w.gap(2);
  w.bold('1). PENERIMA MANFAAT MBG', M, { keep: LH + 50 });
  const p = model.penerima;

  const pd: RowInput[] = [];
  for (const s of p?.pesertaDidik ?? []) {
    s.kelas.forEach((k, i) => {
      const row: CellDef[] = [];
      const span = s.kelas.length;
      if (i === 0) row.push({ content: String(s.no), rowSpan: span }, { content: s.nama, rowSpan: span });
      row.push({ content: k.kelas, styles: { halign: 'center' } });
      if (i === 0) row.push({ content: s.alamat, rowSpan: span }, { content: total(s.jumlah), rowSpan: span, styles: { halign: 'center' } });
      row.push({ content: num(k.l), styles: { halign: 'center' } }, { content: num(k.p), styles: { halign: 'center' } });
      if (i === 0) row.push({ content: total(s.jumlah), rowSpan: span, styles: { halign: 'center' } });
      pd.push(row);
    });
  }
  w.section(
    'a.   Peserta Didik',
    SUB_X,
    {
      head: [['NO', 'Nama Satuan Pendidikan', 'Kelas', 'Alamat Satuan Pendidikan (Lengkap)', 'Jumlah siswa yang mendapat MBG', 'Jumlah siswa laki-laki', 'Jumlah siswa perempuan', 'Total Jumlah Peserta Didik']],
      body: pd,
      widths: [9, 29, 11, 34, 18, 17, 18, 18],
      center: [0],
    },
    model.penerima ? `(Data ${formatHariTanggal(model.penerima.tanggal)})` : '(Belum ada data PM dari Admin MBG di periode ini.)',
  );

  w.section('b.   Pendidik dan Tenaga Kependidikan', SUB_X, {
    head: [['NO', 'Nama Satuan Pendidikan', 'Wilayah Kecamatan', 'Alamat Satuan Pendidikan (Lengkap)', 'Jumlah Pendidik dan Kependidikan yang mendapat MBG', 'Jumlah laki-laki', 'Jumlah perempuan', 'Total Jumlah']],
    body: (p?.ptk ?? []).map((r) => [String(r.no), r.nama, r.kecamatan, r.alamat, total(r.jumlah), num(r.l), num(r.p), total(r.jumlah)]),
    widths: [8, 24, 21, 40, 21, 14, 18, 14],
    center: [0, 4, 5, 6, 7],
  });

  const center = { halign: 'center' as const };
  w.section('c.   Non Peserta Didik', SUB_X, {
    head: [
      [
        { content: 'NO', rowSpan: 2 },
        { content: 'Nama Posyandu', rowSpan: 2 },
        { content: 'Alamat Posyandu', rowSpan: 2 },
        { content: 'Ibu Hamil', rowSpan: 2 },
        { content: 'Ibu Menyusui', rowSpan: 2 },
        { content: 'Anak di bawah 5 tahun mulai usia 6 bulan', colSpan: 2 },
        { content: 'Total Jumlah', rowSpan: 2 },
      ],
      [{ content: 'Laki-laki', styles: center }, { content: 'Perempuan', styles: center }],
    ],
    body: (p?.posyandu ?? []).map((r) => [String(r.no), r.nama, r.alamat, num(r.bumil), num(r.busui), num(r.l), num(r.p), total(r.total)]),
    widths: [9, 32, 34, 16, 18, 18, 18, 17],
    center: [0, 3, 4, 5, 6, 7],
  });
}

function menuContent(day: MenuDay): string {
  if (day.menu.length === 0) return `${MENU_BELUM_DIISI}\n\nLengkapi di Produksi MBG lalu download ulang.`;
  return ['Menu Ompreng:', ...day.menu.flatMap((b, i) => [...(i > 0 ? [''] : []), b.label, ...b.items.map((x) => `- ${x}`)])].join('\n');
}

function writeMenu(w: Writer, model: LaporanModel) {
  w.newPage();
  w.bold('2). JENIS MENU MBG YANG DIBERIKAN', M);
  if (model.menuDays.length === 0) {
    w.note('(Belum ada data PM dari Admin MBG di periode ini.)', M);
    return;
  }
  model.menuDays.forEach((day, di) => {
    if (di > 0) w.newPage();
    const rows = [
      ...day.sekolah.map((r) => ({ ...r, group: 'SEKOLAH' })),
      ...day.posyandu.map((r) => ({ ...r, group: 'POSYANDU' })),
    ];
    const missing = day.menu.length === 0;
    const menuStyles = missing
      ? { fillColor: [254, 243, 199] as [number, number, number], textColor: [185, 28, 28] as [number, number, number], fontStyle: 'bold' as const, halign: 'center' as const }
      : { valign: 'top' as const };
    const body: RowInput[] = rows.map((r, i) => {
      const cells: CellInput[] = [];
      const groupStart = i === 0 || rows[i - 1].group !== r.group;
      if (groupStart) cells.push({ content: r.group, rowSpan: rows.filter((x) => x.group === r.group).length, styles: { fontStyle: 'bold', valign: 'top' } });
      if (i === 0) cells.push({ content: day.hariTanggal, rowSpan: rows.length, styles: { halign: 'center' } });
      cells.push(r.nama, { content: r.jumlah.toLocaleString('id-ID'), styles: { halign: 'center' } });
      if (i === 0) cells.push({ content: menuContent(day), rowSpan: rows.length, styles: menuStyles });
      return cells;
    });
    body.push([
      { content: 'Total Penerima Manfaat', colSpan: 3, styles: { fontStyle: 'bold' } },
      { content: rows.reduce((s, r) => s + r.jumlah, 0).toLocaleString('id-ID'), styles: { fontStyle: 'bold', halign: 'center' } },
      { content: '', styles: missing ? { fillColor: [254, 243, 199] } : {} },
    ]);
    w.table({
      head: [['Nama Satuan Pendidikan / Posyandu', 'Hari/Tanggal Pemberian', 'Kelompok Penerima Manfaat', 'Jumlah Penerima Manfaat', 'Jenis Menu MBG']],
      body,
      widths: [24, 26, 34, 20, 56],
      pageBreak: 'auto',
    });
  });
}

function writeTim(w: Writer, model: LaporanModel) {
  w.newPage();
  w.bold('3). TIM PELAKSANA PROGRAM MBG DI SPPG', M);
  w.doc.setFont(FONT, 'normal');
  w.doc.text(T.timIntro, TEXT_X, w.y);
  w.y += LH + 1;
  const tim = model.tim;
  // Sel kecamatan hanya digabung di dalam satu jabatan: gabungan sepanjang 48 baris tidak bisa
  // dipotong antarhalaman dan membuat halaman pertama tabel nyaris kosong.
  const sameGroup = (a: number, b: number, col: 0 | 4) => tim[a][col] === tim[b][col] && (col === 0 || tim[a][0] === tim[b][0]);
  const span = (i: number, col: 0 | 4) => {
    let len = 1;
    while (i + len < tim.length && sameGroup(i, i + len, col)) len++;
    return len;
  };
  const body: RowInput[] = tim.map((m, i) => {
    const cells: CellInput[] = [];
    if (i === 0 || tim[i - 1][0] !== m[0]) cells.push({ content: m[0], rowSpan: span(i, 0) });
    cells.push(m[1], { content: m[2] === 'L' ? 'L' : '', styles: { halign: 'center' } }, { content: m[2] === 'P' ? 'P' : '', styles: { halign: 'center' } }, { content: String(m[3]), styles: { halign: 'center' } });
    if (i === 0 || !sameGroup(i - 1, i, 4)) cells.push({ content: m[4], rowSpan: span(i, 4) });
    return cells;
  });
  w.table({
    head: [['Jabatan Sebagai', 'Nama', 'Jenis Kelamin Laki-laki', 'Jenis Kelamin Perempuan', 'Umur', 'Kecamatan Tempat Tinggal']],
    body,
    widths: [28, 50, 20, 20, 14, 30],
  });
}

async function writeDokumentasi(w: Writer, model: LaporanModel) {
  w.newPage();
  w.bold('4) DOKUMENTASI KEGIATAN', M);
  w.doc.setFont(FONT, 'normal');
  w.doc.setFontSize(BODY);
  const intro: string[] = w.doc.splitTextToSize(T.dokumentasiIntro, CW);
  intro.forEach((l) => {
    w.doc.text(l, M, w.y);
    w.y += LH;
  });
  w.gap(2);
  if (model.dokumentasi.length === 0) {
    w.note('(Belum ada foto dokumentasi untuk periode ini.)', M);
    return;
  }
  const doc = w.doc;
  const pad = 3;
  const colW = CW / 2;
  const photoW = colW - pad * 2;
  const photoH = photoW / PHOTO_ASPECT;
  const captionH = 5;
  const rowH = photoH + captionH + pad * 2;
  const bandH = 8;
  const sectionH = 7;

  const frame = (y: number, h: number) => {
    doc.setDrawColor(203, 213, 225);
    doc.setLineWidth(0.25);
    doc.rect(M, y, CW, h);
  };

  for (const day of model.dokumentasi) {
    // Judul tanggal selalu bersama bagian + baris foto pertamanya.
    w.ensure(bandH + sectionH + rowH);
    doc.setFillColor(253, 230, 138);
    doc.rect(M, w.y, CW, bandH, 'F');
    frame(w.y, bandH);
    doc.setFont(FONT, 'bold');
    doc.setFontSize(11);
    doc.setTextColor(0);
    doc.text(day.hariTanggal, 105, w.y + bandH / 2 + 1.4, { align: 'center' });
    w.y += bandH;

    for (const section of day.sections) {
      const photos = await Promise.all(section.photos.map((p) => containFitDataUrl(p.url, PHOTO_ASPECT, 900)));
      if (w.y + sectionH + rowH > PAGE_H - M) w.newPage();
      doc.setFillColor(241, 245, 249);
      doc.rect(M, w.y, CW, sectionH, 'F');
      frame(w.y, sectionH);
      doc.setFont(FONT, 'bold');
      doc.setFontSize(10);
      doc.text(`${section.label}  (${section.photos.length} foto)`, M + 3, w.y + sectionH / 2 + 1.2);
      w.y += sectionH;
      for (let i = 0; i < photos.length; i += 2) {
        if (w.y + rowH > PAGE_H - M) {
          w.newPage();
          // Lanjutan di halaman baru diberi judul ulang supaya foto tetap jelas milik tanggal & bagian mana.
          doc.setFillColor(241, 245, 249);
          doc.rect(M, w.y, CW, sectionH, 'F');
          frame(w.y, sectionH);
          doc.setFont(FONT, 'bold');
          doc.setFontSize(10);
          doc.text(`${day.hariTanggal} · ${section.label} (lanjutan)`, M + 3, w.y + sectionH / 2 + 1.2);
          w.y += sectionH;
        }
        [0, 1].forEach((k) => {
          const idx = i + k;
          const x = M + k * colW;
          if (idx < photos.length) {
            doc.addImage(photos[idx], 'JPEG', x + pad, w.y + pad, photoW, photoH, undefined, 'FAST');
            doc.setFont(FONT, 'normal');
            doc.setFontSize(9);
            doc.setTextColor(51, 65, 85);
            doc.text(section.photos[idx].caption, x + colW / 2, w.y + pad + photoH + 4, { align: 'center' });
            doc.setTextColor(0);
          }
        });
        frame(w.y, rowH);
        doc.line(M + colW, w.y, M + colW, w.y + rowH);
        w.y += rowH;
      }
    }
    w.gap(6);
  }
}

function writePenutup(w: Writer) {
  w.newPage();
  w.bold('BAB III. PERMASALAHAN DAN KENDALA', M);
  w.bold('a.   Permasalahan dan Kendala', SUB_X);
  w.list(T.permasalahan, 'number');
  w.bold('b.   Penanganan Permasalahan', SUB_X);
  w.list(T.penanganan, 'number');
  w.bold('c.   Rencana Tindak Lanjut', SUB_X);
  w.list(T.tindakLanjut, 'number');
  w.newPage();
  w.bold('BAB IV. PENUTUP', M);
  w.paragraph(T.penutup, M, CW);
}

export async function renderLaporanPdf(model: LaporanModel): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });
  doc.setProperties({ title: `${T.judul} ${model.periodHeader}` });
  const w = new Writer(doc);
  writePendahuluan(w, model);
  writePenerima(w, model);
  writeMenu(w, model);
  writeTim(w, model);
  await writeDokumentasi(w, model);
  writePenutup(w);
  return doc;
}

export async function exportLaporanPdf(model: LaporanModel): Promise<void> {
  (await renderLaporanPdf(model)).save(laporanFileName(model, 'pdf'));
}
