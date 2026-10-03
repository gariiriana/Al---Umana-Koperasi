import { describe, it, expect, vi } from 'vitest';
import type { MbgProductionDailyReport } from '@/types/mbg';
import { createEmptyReport } from '@/utils/productionSheetParser';

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

const { extractIngredientsFromDailyReport } = await import('@/services/mbgBahanService');

function reportWith(partial: Partial<MbgProductionDailyReport>): MbgProductionDailyReport {
  return { id: 'r1', ...createEmptyReport('b1', '2026-10-02', '02102026'), ...partial };
}

const porsiKecilWithBahan = {
  ...createEmptyReport('b1', '2026-10-02', '02102026').porsiKecil,
  bahanItems: [
    { rincianBahan: 'Beras', hargaBahan: 0, bddPercent: 100, beratKotor: 0, totalGml: 0, sparePercent: 0, kebutuhan: 60, satuan: 'kg', harga: 0 },
  ],
};

describe('extractIngredientsFromDailyReport', () => {
  it('uses Daftar Pesanan Bahan first, even when per-porsi bahan exists', () => {
    const rows = extractIngredientsFromDailyReport(reportWith({
      porsiKecil: porsiKecilWithBahan,
      poRows: [
        { supplier: '', item: 'Beras Putih (Premium)', jamKedatangan: '', jumlah: 10, satuan: 'karung', keterangan: '', hargaSatuan: 370000, totalHarga: 3700000 },
        { supplier: '', item: 'Kapulaga', jamKedatangan: '', jumlah: 0.1, satuan: 'kg', keterangan: '' },
      ],
    }));
    expect(rows).toEqual([
      { jenisBahan: 'Beras Putih (Premium)', banyaknya: 10, satuan: 'karung', isSesuai: null, isBaik: null, notes: '' },
      { jenisBahan: 'Kapulaga', banyaknya: 0.1, satuan: 'kg', isSesuai: null, isBaik: null, notes: '' },
    ]);
  });

  it('falls back to per-porsi bahan when Daftar Pesanan Bahan is empty', () => {
    const rows = extractIngredientsFromDailyReport(reportWith({ porsiKecil: porsiKecilWithBahan }));
    expect(rows).toEqual([
      { jenisBahan: 'Beras', banyaknya: 60, satuan: 'kg', isSesuai: null, isBaik: null, notes: 'Porsi Kecil' },
    ]);
  });

  it('returns nothing (no placeholder data) when the report has no bahan', () => {
    expect(extractIngredientsFromDailyReport(reportWith({}))).toEqual([]);
    expect(extractIngredientsFromDailyReport(null)).toEqual([]);
  });

  it('keeps empty satuan empty instead of defaulting to kg', () => {
    const rows = extractIngredientsFromDailyReport(reportWith({
      poRows: [{ supplier: '', item: 'Daun Salam', jamKedatangan: '', jumlah: 5, satuan: '', keterangan: '' }],
    }));
    expect(rows[0].satuan).toBe('');
  });
});
