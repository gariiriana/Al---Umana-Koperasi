import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePesananBahanSheet, sheetCellToIsoDate } from '../utils/pesananBahanSheetParser';

// Struktur mengikuti spreadsheet Daftar Pesanan Bahan (tab per tanggal, mis. "01102026"):
// tabel lembaga di atas, lalu tabel A:F TANGGAL | NAMA BAHAN | KUANTITAS | SATUAN | HARGA PER UNIT | TOTAL HARGA.
// Kolom H/I/J di luar tabel berisi hitungan bantu & catatan yang tidak boleh ikut terbaca.
function buildSheet(): XLSX.WorkSheet {
  const rows: unknown[][] = [
    ['No', 'NAMA LEMBAGA', 'KUANTITAS', 'HARGA PER PORSI'],
    [1, 'BALITA POSYANDU DESA KEBONMANGGU', 405, 8000],
    [2, 'TK IT Qurrota Ayun', 50, 8000],
    [],
    ['TANGGAL', 'NAMA BAHAN', 'KUANTITAS', 'SATUAN', 'HARGA PER UNIT', 'TOTAL HARGA'],
    [46295, 'Minyak Goreng Sovia', 6, 'karton', 252000, 1512000, null, 0],
    [null, 'Beras Putih (Premium)', 10, 'karung', 370000, 3700000, null, 0, 'Sisa 10 kg'],
    [null, 'Kacang Panjang', 69, 'kg', 17000, 1173000, null, 0, 'garam', '2 pcs'],
    [null, 'Kapulaga', 0.1, 'kg', 250000, 25000],
    [null, 'Minyak Goreng', 24, 'liter', null, 0],
    [null, null, null, null, null, 0],
    ['TOTAL PENGELUARAN BAHAN MAKANAN', null, null, null, null, 6410000, null, 0],
    ['TOTAL ANGGARAN', null, null, null, null, 25742000, null, 6410000],
    ['SELISIH', null, null, null, null, 19332000],
    [null, null, null, null, null, -4178000],
  ];
  return XLSX.utils.aoa_to_sheet(rows);
}

describe('parsePesananBahanSheet', () => {
  it('reads only the cells inside the table', () => {
    const result = parsePesananBahanSheet(buildSheet(), { fallbackTanggal: '2026-10-01' });

    expect(result.poRows.map((p) => p.item)).toEqual([
      'Minyak Goreng Sovia',
      'Beras Putih (Premium)',
      'Kacang Panjang',
      'Kapulaga',
      'Minyak Goreng',
    ]);
    expect(result.poRows[0]).toEqual({
      supplier: '',
      item: 'Minyak Goreng Sovia',
      jamKedatangan: '',
      jumlah: 6,
      satuan: 'karton',
      keterangan: '',
      hargaSatuan: 252000,
      totalHarga: 1512000,
    });
    // Catatan di kolom I (di luar tabel) tidak ikut terbaca
    expect(result.poRows[1].keterangan).toBe('');
    expect(result.poRows[2].keterangan).toBe('');
    expect(result.poRows[3]).toMatchObject({ jumlah: 0.1, totalHarga: 25000 });
    // Sel kosong tetap kosong, tidak dihitung/ditebak
    expect(result.poRows[4]).toMatchObject({ jumlah: 24, hargaSatuan: 0, totalHarga: 0 });

    // Ringkasan diambil dari kolom TOTAL HARGA, bukan angka bantu di kolom H
    expect(result.totalPengeluaran).toBe(6410000);
    expect(result.totalAnggaran).toBe(25742000);
    expect(result.selisih).toBe(19332000);

    // Kolom TANGGAL berisi serial Excel (46295 = 30 September 2026)
    expect(result.tanggal).toBe('2026-09-30');
    expect(result.realisasiPembelianRows[2].tanggal).toBe('2026-09-30');
    expect(result.inspectionRows[0].notes).toBe('');
  });

  it('leaves supplier empty when the table has no supplier column', () => {
    const result = parsePesananBahanSheet(buildSheet(), { fallbackTanggal: '2026-10-01' });
    expect(result.poRows.every((p) => p.supplier === '')).toBe(true);
  });

  it('reads supplier from the table when a supplier column exists', () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['Supplier', 'List Pesanan Bahan', 'Jumlah', 'Item'],
      ['INDOGROSIR', 'Minyak Goreng', 7, 'karton'],
      ['', 'Gula Pasir', 8, 'kg'],
    ]);
    const result = parsePesananBahanSheet(ws, { fallbackTanggal: '2026-09-14' });
    expect(result.poRows.map((p) => p.supplier)).toEqual(['INDOGROSIR', '']);
  });

  it('throws when the sheet has no bahan table', () => {
    const ws = XLSX.utils.aoa_to_sheet([['No', 'NAMA LEMBAGA'], [1, 'TK PDR']]);
    expect(() => parsePesananBahanSheet(ws, { fallbackTanggal: '2026-10-02' })).toThrow(/NAMA BAHAN/);
  });
});

describe('sheetCellToIsoDate', () => {
  it('handles excel serials and text dates', () => {
    expect(sheetCellToIsoDate(46296)).toBe('2026-10-01');
    expect(sheetCellToIsoDate('02/10/2026')).toBe('2026-10-02');
    expect(sheetCellToIsoDate('2026-10-02')).toBe('2026-10-02');
    expect(sheetCellToIsoDate('')).toBeNull();
  });
});
