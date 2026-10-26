import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';

// The MO page with its Firestore services replaced by controllable stand-ins. Each batch's PM
// rows arrive only when a test delivers them, the way a slow phone receives them.
const fake = vi.hoisted(() => ({
  batches: [] as Record<string, unknown>[],
  listeners: new Map<string, {
    onData: (rows: Record<string, unknown>[], confirmed: boolean) => void;
    onError?: (error: Error) => void;
  }>(),
  create: vi.fn(async (inputs: unknown[]) => inputs.length),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'mo-uid' } }) }));
vi.mock('@/hooks/useJobDeskSync', () => ({ useJobDeskSync: () => ({ state: 'live', checkedAt: null, syncNow: () => {} }) }));
vi.mock('@/components/katering/TeklapArchive', () => ({ TeklapArchive: () => null }));
vi.mock('@/services/realtimeService', () => ({
  subscribeOrders: (cb: (orders: unknown[]) => void) => { cb([]); return () => {}; },
}));
vi.mock('@/services/mbgProductionService', () => ({
  subscribeAllDailyReports: (cb: (reports: unknown[]) => void) => { cb([]); return () => {}; },
}));
vi.mock('@/services/cateringJobDeskService', () => ({
  subscribeAllJobDesks: (cb: (desks: unknown[]) => void) => { cb([]); return () => {}; },
  batchCreateJobDesks: fake.create,
  deleteJobDesk: vi.fn(),
}));
vi.mock('@/services/mbgAdminService', () => ({
  subscribeBatches: (cb: (batches: unknown[]) => void) => { cb(fake.batches); return () => {}; },
  subscribeEntriesConfirmed: (
    batchId: string,
    onData: (rows: Record<string, unknown>[], confirmed: boolean) => void,
    onError?: (error: Error) => void,
  ) => {
    fake.listeners.set(batchId, { onData, onError });
    return () => fake.listeners.delete(batchId);
  },
}));
// "Today" is Monday 26 October 2026, the day of the report.
vi.mock('@/utils/date', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/utils/date')>();
  return { ...actual, getJakartaDate: (date?: Date) => (date ? actual.getJakartaDate(date) : '2026-10-26') };
});

import { MoJobDeskPage } from '@/pages/katering/MoJobDeskPage';

const batch = (id: string, tanggal: string, createdAt: string, extra: Record<string, unknown> = {}) => ({
  id, tanggal, createdAt, updatedAt: createdAt, status: 'NUTRITION_DONE', createdBy: 'admin-uid',
  totalJumlah: 107, totalInstitusi: 2, totalSiswaBalita: 99, totalBumilBusui: 3, totalGuruKader: 2, totalPobiaNasi: 0,
  petugasList: [], batchNotes: '', ...extra,
});
// Admin's Jumlah carries the planned extras, so it is higher than the category columns.
const rowsOf = (batchId: string) => [
  { id: `${batchId}-1`, batchId, institutionName: 'SPS CEMPAKA 10', institutionType: 'sekolah', jumlah: 63, qtSiswaBalita: 59, qtGuruKader: 2, qtBumilBusui: 0, qtPobiaNasi: 0, sortOrder: 1 },
  { id: `${batchId}-2`, batchId, institutionName: 'CEMPAKA 7', institutionType: 'posyandu', jumlah: 44, qtSiswaBalita: 40, qtGuruKader: 0, qtBumilBusui: 3, qtPobiaNasi: 0, sortOrder: 2 },
];
const deliver = (batchId: string, rows: Record<string, unknown>[], confirmed: boolean) =>
  act(() => fake.listeners.get(batchId)?.onData(rows, confirmed));
const cardOf = (title: string) =>
  within(screen.getByText(title).closest('[class*="border-emerald-200/80"]') as HTMLElement);
const openMbg = () => {
  render(<MoJobDeskPage />);
  fireEvent.click(screen.getByRole('button', { name: /Program MBG/ }));
};

beforeEach(() => {
  cleanup();
  localStorage.clear();
  fake.listeners.clear();
  fake.create.mockClear();
  fake.batches = [
    // Today's batch is being delivered: its rows carry the couriers' photos (~5 MB).
    batch('b26', '2026-10-26', '2026-10-23T12:24:02.583Z', { status: 'DELIVERING', totalJumlah: 2835, totalInstitusi: 31 }),
    batch('b27', '2026-10-27', '2026-10-25T08:37:35.286Z'),
    batch('b23', '2026-10-23', '2026-10-10T06:48:43.311Z'),
    batch('draft', '2026-10-25', '2026-10-25T08:36:44.526Z', { status: 'DRAFT', totalJumlah: 0, totalInstitusi: 0 }),
  ];
});

describe('MO job desk: PM rows entered by Admin MBG', () => {
  it('reads tomorrow’s rows on its own and never calls rows still loading "not entered"', () => {
    openMbg();

    // Only the batch still to be delivered is read up front, with its own listener.
    expect([...fake.listeners.keys()]).toEqual(['b27']);
    expect(screen.queryByText(/25 Oktober 2026/)).toBeNull();

    const card = cardOf('Selasa, 27 Oktober 2026');
    expect(card.getByText('Diinput Admin MBG: 25 Okt 2026, 15.37')).toBeTruthy();
    expect(card.getByText('107 Porsi Makanan')).toBeTruthy();

    fireEvent.click(card.getByRole('button', { name: /Lihat Institusi/ }));
    deliver('b27', [], false); // the phone's cache answered first, empty
    expect(card.getByText('Memuat rincian 2 institusi…')).toBeTruthy();
    expect(screen.queryByText(/Belum ada rincian institusi/)).toBeNull();

    act(() => fake.listeners.get('b27')?.onError?.(new Error('unavailable')));
    expect(card.getByText('Rincian institusi gagal dimuat. Mencoba lagi otomatis…')).toBeTruthy();

    deliver('b27', rowsOf('b27'), true);
    expect(card.getByText('SPS CEMPAKA 10')).toBeTruthy();
    expect(card.getByText('63 Porsi')).toBeTruthy();
    expect(card.getByText('44 Porsi')).toBeTruthy();
    // Totals stay the batch's own, the numbers Arsip PM shows.
    expect(card.getByText('107 Porsi Makanan')).toBeTruthy();
  });

  it('says "not entered" only once the server confirms the batch has no rows', () => {
    openMbg();
    const card = cardOf('Selasa, 27 Oktober 2026');
    fireEvent.click(card.getByRole('button', { name: /Lihat Institusi/ }));

    deliver('b27', [], true);
    expect(card.getByText('Belum ada rincian institusi yang diinput oleh Admin MBG untuk batch tanggal ini.')).toBeTruthy();
  });

  it('waits for an older batch’s rows, then builds a delivery row per institution with Admin’s Jumlah', async () => {
    openMbg();
    expect(fake.listeners.has('b23')).toBe(false);

    const card = cardOf('Jumat, 23 Oktober 2026');
    fireEvent.click(card.getByRole('button', { name: /Susun Job Desk/ }));
    expect(card.getByRole('button', { name: /Memuat rincian/ })).toBeTruthy();
    expect(fake.listeners.has('b23')).toBe(true);

    deliver('b23', [], false); // only the cache answered: no form without the rows
    expect(screen.queryByRole('button', { name: /Simpan Semua Baris/ })).toBeNull();

    deliver('b23', rowsOf('b23'), true);
    fireEvent.click(await screen.findByRole('button', { name: /Simpan Semua Baris \(3\)/ }));

    expect(fake.create).toHaveBeenCalledTimes(1);
    expect(fake.create.mock.calls[0][0]).toEqual(expect.arrayContaining([
      expect.objectContaining({ tanggal: '2026-10-23', kegiatan: 'Produksi MBG (Dapur Utama)', mbgPortionCount: 107 }),
      expect.objectContaining({ kegiatan: 'Pengantaran ke SPS CEMPAKA 10', mbgPortionCount: 63, mbgBatchId: 'b23' }),
      expect.objectContaining({ kegiatan: 'Pengantaran ke CEMPAKA 7', mbgPortionCount: 44, mbgBatchId: 'b23' }),
    ]));
  });

  it('finds a batch by the day Admin MBG entered it, as Arsip PM does', () => {
    openMbg();
    fireEvent.change(screen.getByPlaceholderText(/Cari tanggal batch/), { target: { value: '25 okt' } });

    expect(screen.getByText('Selasa, 27 Oktober 2026')).toBeTruthy();
    expect(screen.queryByText('Senin, 26 Oktober 2026')).toBeNull();
    expect(screen.queryByText('Jumat, 23 Oktober 2026')).toBeNull();
  });
});
