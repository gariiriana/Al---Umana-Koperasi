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
  getBahanItemPhotos,
  describeBahanSaveError,
  BahanSaveError,
} = await import('@/services/mbgBahanService');
const { photoMosaicCells, bahanPhotoTimeRange } = await import('@/utils/bahanPhotoLayout');

describe('bahan photo storage helpers', () => {
  it('builds a Firestore-safe photo id per batch and item', () => {
    expect(bahanPhotoDocId('b1', 'item-3-Gula/Garam (kasar)')).toBe('b1_item-3-Gula-Garam--kasar-');
    expect(bahanPhotoDocId('b1', 'custom-1730000000000')).toBe('b1_custom-1730000000000');
  });

  it('attaches stored photos and converts single-photo archives to the photos list', () => {
    const items = [
      { id: 'a', namaBahan: 'Beras', photoId: 'b1_a', waktuFoto: '07.10' },
      { id: 'b', namaBahan: 'Telur', photoUrl: 'data:legacy' },
      { id: 'c', namaBahan: 'Tahu', photoId: 'b1_c' },
      { id: 'd', namaBahan: 'Ayam', photos: [{ photoId: 'b1_d-1', waktu: '07.20' }, { photoId: 'b1_d-2' }] },
      { id: 'e', namaBahan: 'Garam' },
    ];
    expect(attachBahanPhotos(items, { b1_a: 'data:a', 'b1_d-1': 'data:d1', 'b1_d-2': 'data:d2' })).toEqual([
      { id: 'a', namaBahan: 'Beras', photos: [{ photoId: 'b1_a', url: 'data:a', waktu: '07.10' }] },
      { id: 'b', namaBahan: 'Telur', photos: [{ photoId: undefined, url: 'data:legacy', waktu: undefined }] },
      { id: 'c', namaBahan: 'Tahu', photos: [{ photoId: 'b1_c', url: undefined, waktu: undefined }] },
      { id: 'd', namaBahan: 'Ayam', photos: [{ photoId: 'b1_d-1', url: 'data:d1', waktu: '07.20' }, { photoId: 'b1_d-2', url: 'data:d2' }] },
      { id: 'e', namaBahan: 'Garam', photos: [] },
    ]);
  });

  it('reads photos from both the new list and the old single-photo fields', () => {
    expect(getBahanItemPhotos({ id: 'x', namaBahan: 'X' })).toEqual([]);
    expect(getBahanItemPhotos({ id: 'x', namaBahan: 'X', photoUrl: 'data:1', waktuFoto: '07.00' }))
      .toEqual([{ photoId: undefined, url: 'data:1', waktu: '07.00' }]);
    expect(getBahanItemPhotos({ id: 'x', namaBahan: 'X', photos: [{ url: 'data:1' }, { url: 'data:2' }], photoUrl: 'data:old' }))
      .toEqual([{ url: 'data:1' }, { url: 'data:2' }]);
  });
});

describe('bahan photo layout for PDF/Word', () => {
  const box = { x: 0, y: 0, w: 41, h: 31 };

  it('fills the photo box without overlap for 1–4 photos', () => {
    expect(photoMosaicCells(0, box, 1)).toEqual([]);
    expect(photoMosaicCells(1, box, 1)).toEqual([box]);
    expect(photoMosaicCells(2, box, 1)).toEqual([{ x: 0, y: 0, w: 20, h: 31 }, { x: 21, y: 0, w: 20, h: 31 }]);
    expect(photoMosaicCells(3, box, 1)).toEqual([
      { x: 0, y: 0, w: 20, h: 31 },
      { x: 21, y: 0, w: 20, h: 15 },
      { x: 21, y: 16, w: 20, h: 15 },
    ]);
    expect(photoMosaicCells(4, box, 1)).toEqual([
      { x: 0, y: 0, w: 20, h: 15 },
      { x: 21, y: 0, w: 20, h: 15 },
      { x: 0, y: 16, w: 20, h: 15 },
      { x: 21, y: 16, w: 20, h: 15 },
    ]);
  });

  it('summarises photo times as a range', () => {
    expect(bahanPhotoTimeRange([])).toBe('-');
    expect(bahanPhotoTimeRange([{ waktu: '07.10' }, { waktu: '07.10' }])).toBe('07.10');
    expect(bahanPhotoTimeRange([{ waktu: '07.25' }, {}, { waktu: '07.10' }])).toBe('07.10 – 07.25');
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
