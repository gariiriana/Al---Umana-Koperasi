import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({
  addDoc: vi.fn(async () => ({ id: 'new' })),
  compress: vi.fn(async (dataUrl: string) => dataUrl),
  select: vi.fn(),
}));

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: { getIdToken: async () => 'token' } } }));
vi.mock('@/lib/firebaseConfig', () => ({ firebaseConfig: { projectId: 'p' }, useEmulators: false }));
vi.mock('@/utils/imageCompressor', () => ({ compressBase64Image: m.compress }));
vi.mock('@/utils/firestoreRest', () => ({ runEqualityQuerySelect: m.select }));
vi.mock('firebase/firestore', () => ({
  addDoc: m.addDoc,
  collection: (_db: unknown, name: string) => name,
  deleteDoc: vi.fn(),
  doc: vi.fn(),
  getDocs: vi.fn(),
  onSnapshot: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
}));

import { addLaporanPhotos, loadLaporanDays, menusFromReport } from '@/services/laporan2MingguService';

const image = (name: string, size = 10) => new File(['x'.repeat(size)], name, { type: 'image/jpeg' });

beforeEach(() => {
  m.addDoc.mockClear();
  m.compress.mockReset();
  m.select.mockReset();
});

describe('addLaporanPhotos', () => {
  it('menyimpan foto kecil di tanggal + bagian yang dipilih, menolak yang tetap terlalu besar', async () => {
    m.compress.mockImplementation(async (dataUrl: string) => (dataUrl.includes('eHh4') ? 'data:image/jpeg;base64,' + 'A'.repeat(950_000) : 'data:image/jpeg;base64,ok'));
    const progress = vi.fn();
    const result = await addLaporanPhotos('2026-11-09', 'pemorsian', [image('kecil.jpg', 2), image('besar.jpg', 3)], 'Dwi', progress);

    expect(m.compress).toHaveBeenCalledWith(expect.stringMatching(/^data:image\/jpeg;base64,/), 1280, 1280, 0.7);
    expect(result).toEqual({ added: 1, rejected: ['besar.jpg'] });
    expect(m.addDoc).toHaveBeenCalledTimes(1);
    expect(m.addDoc).toHaveBeenCalledWith('mbg_laporan_photos', expect.objectContaining({
      tanggal: '2026-11-09', section: 'pemorsian', url: 'data:image/jpeg;base64,ok', createdBy: 'Dwi', order: expect.any(Number),
    }));
    expect(progress).toHaveBeenLastCalledWith(2, 2);
  });

  it('melewati file yang bukan foto', async () => {
    const result = await addLaporanPhotos('2026-11-09', 'menu', [new File(['a'], 'catatan.pdf', { type: 'application/pdf' })], 'Dwi');
    expect(result).toEqual({ added: 0, rejected: ['catatan.pdf'] });
    expect(m.addDoc).not.toHaveBeenCalled();
  });
});

describe('menusFromReport', () => {
  it('nama hidangan per porsi dari tabel gizi, cadangan dari daftar menu', () => {
    expect(menusFromReport({
      porsiKecil: { nutritionItems: [{ menuName: 'Nasi Liwet' }, { menuName: 'Nasi Liwet' }, { menuName: 'Telur Ceplok' }], menuList: ['Nasi Liwet', 'Telur Ceplok Bumbu Rica'] },
      porsiBesar: { menuList: ['Nasi Liwet', 'Telur Ceplok Bumbu Rica'] },
      porsiBalita: {},
    })).toEqual({ kecil: ['Nasi Liwet', 'Telur Ceplok'], besar: ['Nasi Liwet', 'Telur Ceplok Bumbu Rica'] });
    expect(menusFromReport(undefined)).toBeNull();
    expect(menusFromReport({ porsiKecil: { nutritionItems: [] } })).toBeNull();
  });
});

describe('loadLaporanDays', () => {
  it('memakai batch aktif tiap tanggal beserta entri dan menu Produksi terbaru', async () => {
    m.select.mockImplementation(async ({ collectionId, value }: { collectionId: string; value: string }) => {
      if (collectionId === 'mbg_pm_batches') {
        return value === '2026-11-09'
          ? [{ id: 'backup', isBackup: true, totalJumlah: 9 }, { id: 'b9', totalJumlah: 2835 }]
          : [];
      }
      if (collectionId === 'mbg_pm_entries') return [{ id: 'e1', institutionName: 'TK PADARAANG', qtSiswaBalita: 17, qtGuruL: 3 }];
      if (collectionId === 'mbg_daily_reports') {
        return [
          { id: 'old', updatedAt: '2026-11-08T10:00:00Z', porsiBesar: { menuList: ['Menu Lama'] } },
          { id: 'new', updatedAt: '2026-11-09T05:00:00Z', porsiBesar: { nutritionItems: [{ menuName: 'Nasi Liwet' }] } },
        ];
      }
      return [];
    });

    const days = await loadLaporanDays(['2026-11-09', '2026-11-10']);

    expect(days[0]).toMatchObject({
      tanggal: '2026-11-09', batchId: 'b9',
      entries: [{ institutionName: 'TK PADARAANG', qtSiswaBalita: 17, qtGuruL: 3 }],
      menus: { besar: ['Nasi Liwet'] },
    });
    expect(days[1]).toEqual({ tanggal: '2026-11-10', batchId: null, entries: [], menus: null });
    expect(m.select).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: 'mbg_pm_entries', value: 'b9', selectFields: expect.arrayContaining(['qtGuruL', 'qtTendikP', 'qtPorsiKecilL']),
    }));
    expect(m.select).toHaveBeenCalledWith(expect.objectContaining({
      collectionId: 'mbg_daily_reports', selectFields: expect.arrayContaining(['porsiKecil.nutritionItems', 'porsiBalita.menuList']),
    }));
  });
});
