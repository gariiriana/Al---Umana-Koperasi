import { describe, it, expect, vi } from 'vitest';
import type { MbgProductionDailyReport } from '@/types/mbg';
import { createEmptyReport } from '@/utils/productionSheetParser';

vi.mock('@/lib/firebase', () => ({
  db: {},
}));

const {
  extractIngredientsFromDailyReport,
  bahanPhotoDocId,
  attachBahanPhotos,
  describeBahanSaveError,
  BahanSaveError,
} = await import('@/services/mbgBahanService');

describe('bahan photo storage helpers', () => {
  it('builds a Firestore-safe photo id per batch and item', () => {
    expect(bahanPhotoDocId('b1', 'item-3-Gula/Garam (kasar)')).toBe('b1_item-3-Gula-Garam--kasar-');
    expect(bahanPhotoDocId('b1', 'custom-1730000000000')).toBe('b1_custom-1730000000000');
  });

  it('attaches stored photos by photoId and keeps legacy inline photos', () => {
    const items = [
      { id: 'a', namaBahan: 'Beras', photoId: 'b1_a' },
      { id: 'b', namaBahan: 'Telur', photoUrl: 'data:legacy' },
      { id: 'c', namaBahan: 'Tahu', photoId: 'b1_c' },
    ];
    expect(attachBahanPhotos(items, { b1_a: 'data:new' })).toEqual([
      { id: 'a', namaBahan: 'Beras', photoId: 'b1_a', photoUrl: 'data:new' },
      { id: 'b', namaBahan: 'Telur', photoUrl: 'data:legacy' },
      { id: 'c', namaBahan: 'Tahu', photoId: 'b1_c' },
    ]);
  });
});

describe('describeBahanSaveError', () => {
  it('explains the common Firestore failures in plain words', () => {
    expect(describeBahanSaveError({ code: 'permission-denied' })).toMatch(/tidak punya izin/);
    expect(describeBahanSaveError({ code: 'resource-exhausted' })).toMatch(/Kuota harian/);
    expect(describeBahanSaveError({ code: 'unavailable' })).toMatch(/Koneksi internet/);
    expect(describeBahanSaveError({ code: 'invalid-argument', message: 'Document exceeds the maximum allowed size' })).toMatch(/terlalu besar/);
    expect(describeBahanSaveError(new BahanSaveError('Foto "Beras" terlalu besar.'))).toBe('Foto "Beras" terlalu besar.');
    expect(describeBahanSaveError(new Error('boom'))).toBe('Gagal menyimpan dokumentasi bahan (boom).');
  });
});

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
