import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { MbgPmBatch } from '@/types/mbg';

const fake = vi.hoisted(() => ({
  batches: [] as MbgPmBatch[],
  subscribeAllEntries: vi.fn(() => () => {}),
  noop: () => () => {},
  // Stable objects: the page re-subscribes whenever `user` changes identity.
  auth: { user: { uid: 'prod' }, profile: { uid: 'prod', role: 'tim_produksi' } },
  toast: { showToast: () => {} },
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => fake.auth }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => fake.toast }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/utils/date', () => ({ getJakartaDate: () => '2026-10-05' }));
vi.mock('@/utils/dailyReportPdfExporter', () => ({ export8PageDailyReportPdf: vi.fn() }));
vi.mock('@/utils/mbgProductionDocxGenerator', () => ({ exportProductionDocx: vi.fn() }));
vi.mock('@/services/mbgAdminService', () => ({
  subscribeBatches: (callback: (data: MbgPmBatch[]) => void) => { callback(fake.batches); return () => {}; },
  subscribeEntries: fake.noop, subscribeAllEntries: fake.subscribeAllEntries, subscribeWeeklySchedule: fake.noop,
  getMenuForDate: () => ({ menuItems: [] }),
}));
vi.mock('@/services/mbgProductionService', () => ({
  subscribeNutrition: fake.noop, subscribeCustomTkpiEntries: fake.noop, subscribeCustomRecipes: fake.noop,
  subscribeRecipeAdjustments: fake.noop, subscribeDailyReport: fake.noop, subscribeAllDailyReports: fake.noop,
}));

import { MbgProductionPage } from '@/pages/mbg/MbgProductionPage';

const batch = (id: string, tanggal: string, extra: Partial<MbgPmBatch>): MbgPmBatch => ({
  id, tanggal, status: 'DELIVERED', petugasList: [], totalSiswaBalita: 0, totalBumilBusui: 0, totalGuruKader: 0,
  totalPobiaNasi: 0, totalJumlah: 100, batchNotes: '', createdBy: 'admin', createdAt: `${tanggal}T08:00:00.000Z`,
  updatedAt: `${tanggal}T08:00:00.000Z`, ...extra,
});

const archiveCards = () => screen.queryAllByRole('heading', { level: 4 }).map((h) => h.textContent);

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fake.batches = [
    batch('b1', '2026-10-01', { institutionNames: ['SDN 1 Sukabumi', 'Posyandu Cempaka 7'], petugasList: ['Dwi'] }),
    batch('b2', '2026-10-02', { institutionNames: ['TK Melati'], petugasList: ['Wandi'] }),
    batch('old', '2026-09-01', { petugasList: ['Ujang'] }),
  ];
  render(<MbgProductionPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Arsip Gizi' }));
});

describe('Produksi archive search', () => {
  it('finds every batch that served a school, from names kept on the batch', () => {
    fireEvent.change(screen.getByPlaceholderText('Cari sekolah atau posyandu...'), { target: { value: 'cempaka' } });

    expect(archiveCards()).toEqual(['2026-10-01']);
    expect(screen.getByText(/Posyandu Cempaka 7/)).toBeTruthy();
    expect(screen.getByText(/1 arsip lama belum bisa dicari lewat nama sekolah/)).toBeTruthy();
  });

  it('does not open a PM row listener while typing', () => {
    fireEvent.change(screen.getByPlaceholderText('Cari sekolah atau posyandu...'), { target: { value: 'c' } });
    fireEvent.change(screen.getByPlaceholderText('Cari sekolah atau posyandu...'), { target: { value: 'ce' } });

    expect(fake.subscribeAllEntries).not.toHaveBeenCalled();
  });
});
