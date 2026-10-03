import * as XLSX from 'xlsx';
import type {
  MbgInspectionFormRow,
  MbgPoReportRow,
  MbgRealisasiPembelianRow,
} from '@/types/mbg';
import { num } from './productionSheetParser';

// Parser khusus spreadsheet "Daftar Pesanan Bahan" (terpisah dari spreadsheet produksi).
// Hanya isi tabel yang dibaca: batas kolom diambil dari baris header
// (mis. TANGGAL | NAMA BAHAN | KUANTITAS | SATUAN | HARGA PER UNIT | TOTAL HARGA)
// dan batas baris berakhir di baris SELISIH. Sel di luar tabel (catatan, hitungan
// bantu di kolom G/H/I, dst.) diabaikan, dan sel kosong tetap kosong.

export interface ParsedPesananBahanSheet {
  /** Tanggal (YYYY-MM-DD) yang tertulis di kolom TANGGAL, bila ada. */
  tanggal: string | null;
  poRows: MbgPoReportRow[];
  realisasiPembelianRows: MbgRealisasiPembelianRow[];
  inspectionRows: MbgInspectionFormRow[];
  totalPengeluaran: number;
  totalAnggaran: number;
  selisih: number;
}

interface PesananBahanTable {
  headerRow: number;
  /** Kolom pertama & terakhir tabel (inklusif) */
  firstCol: number;
  lastCol: number;
  nama: number;
  kuantitas: number;
  tanggal: number;
  satuan: number;
  hargaUnit: number;
  totalHarga: number;
  supplier: number;
  keterangan: number;
  jam: number;
}

function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

function normalizeHeader(v: unknown): string {
  return str(v).toLowerCase().replace(/\s+/g, ' ');
}

function findTable(rows: unknown[][]): PesananBahanTable | null {
  for (let r = 0; r < rows.length; r++) {
    const row = rows[r] || [];
    const headers = Array.from({ length: row.length }, (_, c) => normalizeHeader(row[c]));
    const nama = headers.findIndex((h) => h === 'nama bahan' || h === 'list pesanan bahan');
    if (nama === -1) continue;

    // Tabel = deretan header yang bersambung (tanpa sel kosong) di sekitar NAMA BAHAN
    let firstCol = nama;
    while (firstCol > 0 && headers[firstCol - 1]) firstCol--;
    let lastCol = nama;
    while (lastCol + 1 < headers.length && headers[lastCol + 1]) lastCol++;

    const find = (match: (h: string) => boolean) => {
      for (let c = firstCol; c <= lastCol; c++) {
        if (c !== nama && match(headers[c])) return c;
      }
      return -1;
    };

    const kuantitas = find((h) => h === 'kuantitas' || h === 'jumlah' || h === 'qty');
    if (kuantitas === -1) continue;

    return {
      headerRow: r,
      firstCol,
      lastCol,
      nama,
      kuantitas,
      tanggal: find((h) => h === 'tanggal' || h === 'tgl'),
      satuan: find((h) => h === 'satuan' || h === 'item' || h === 'unit' || h.includes('item (satuan)')),
      hargaUnit: find((h) => h.includes('harga') && !h.includes('total')),
      totalHarga: find((h) => h.includes('total') && (h.includes('harga') || h.includes('biaya'))),
      supplier: find((h) => h.includes('supplier') || h.includes('vendor')),
      keterangan: find((h) => h.includes('keterangan') || h.includes('catatan')),
      jam: find((h) => h.includes('jam') || h.includes('kedatangan')),
    };
  }
  return null;
}

/** Konversi isi sel tanggal (serial Excel / teks dd/mm/yyyy / yyyy-mm-dd) ke YYYY-MM-DD. */
export function sheetCellToIsoDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number' && v > 20000 && v < 80000) {
    const d = XLSX.SSF.parse_date_code(v);
    if (d) return `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}`;
  }
  const s = str(v);
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const dmy = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`;
  return null;
}

type SummaryKind = 'pengeluaran' | 'anggaran' | 'selisih';

function detectSummaryRow(row: unknown[], table: PesananBahanTable): SummaryKind | null {
  for (let c = table.firstCol; c <= table.lastCol; c++) {
    const label = normalizeHeader(row[c]);
    if (!label) continue;
    if (label.startsWith('total pengeluaran') || label.startsWith('total belanja')) return 'pengeluaran';
    if (label.startsWith('total anggaran')) return 'anggaran';
    if (label.startsWith('selisih')) return 'selisih';
  }
  return null;
}

/** Nilai sel di dalam tabel; kolom yang tidak ada di header dianggap kosong. */
function cell(row: unknown[], col: number): unknown {
  return col === -1 ? undefined : row[col];
}

/**
 * Baca satu worksheet Daftar Pesanan Bahan. Supplier hanya terisi bila tabel punya
 * kolom supplier; selain itu kosong dan diatur di website.
 */
export function parsePesananBahanSheet(
  ws: XLSX.WorkSheet,
  options: { fallbackTanggal: string }
): ParsedPesananBahanSheet {
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, blankrows: true }) as unknown[][];
  const table = findTable(rows);
  if (!table) {
    throw new Error('Tabel pesanan bahan tidak ditemukan. Pastikan sheet punya header "NAMA BAHAN" dan "KUANTITAS".');
  }

  let sheetTanggal: string | null = null;
  let currentTanggal: string | null = null;
  let summaryPengeluaran: number | null = null;
  let summaryAnggaran: number | null = null;
  let summarySelisih: number | null = null;
  let reachedSummary = false;

  const poRows: MbgPoReportRow[] = [];
  const realisasiPembelianRows: MbgRealisasiPembelianRow[] = [];

  for (let r = table.headerRow + 1; r < rows.length; r++) {
    const row = rows[r] || [];

    const summary = detectSummaryRow(row, table);
    if (summary) {
      reachedSummary = true;
      const value = num(cell(row, table.totalHarga));
      if (summary === 'pengeluaran') summaryPengeluaran = value;
      else if (summary === 'anggaran') summaryAnggaran = value;
      else summarySelisih = value;
      // SELISIH adalah baris terakhir tabel
      if (summary === 'selisih') break;
      continue;
    }
    if (reachedSummary) continue;

    // Kolom TANGGAL hanya diisi di baris pertama; baris berikutnya ikut tanggal tersebut
    const rowDate = sheetCellToIsoDate(cell(row, table.tanggal));
    if (rowDate) {
      currentTanggal = rowDate;
      sheetTanggal = sheetTanggal || rowDate;
    }

    const item = str(row[table.nama]);
    if (!item) continue;

    const jumlah = num(cell(row, table.kuantitas));
    const satuan = str(cell(row, table.satuan));
    const hargaSatuan = num(cell(row, table.hargaUnit));
    const totalHarga = num(cell(row, table.totalHarga));

    poRows.push({
      supplier: str(cell(row, table.supplier)),
      item,
      jamKedatangan: str(cell(row, table.jam)),
      jumlah,
      satuan,
      keterangan: str(cell(row, table.keterangan)),
      hargaSatuan,
      totalHarga,
    });
    realisasiPembelianRows.push({
      tanggal: currentTanggal || options.fallbackTanggal,
      namaBahan: item,
      kuantitas: jumlah,
      satuan,
      hargaPerUnit: hargaSatuan,
      totalHarga,
    });
  }

  return {
    tanggal: sheetTanggal,
    poRows,
    realisasiPembelianRows,
    inspectionRows: poRows.map((po) => ({
      jenisBahan: po.item,
      banyaknya: po.jumlah,
      satuan: po.satuan,
      isSesuai: null,
      isBaik: null,
      notes: '',
    })),
    // Total diambil dari baris ringkasan tabel; bila tabel tidak punya baris
    // TOTAL PENGELUARAN, gunakan jumlah kolom TOTAL HARGA.
    totalPengeluaran: summaryPengeluaran ?? poRows.reduce((s, po) => s + (po.totalHarga || 0), 0),
    totalAnggaran: summaryAnggaran ?? 0,
    selisih: summarySelisih ?? 0,
  };
}
