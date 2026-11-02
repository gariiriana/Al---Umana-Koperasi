import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { MbgPmBatch } from '@/types/mbg';

const fake = vi.hoisted(() => ({
  batches: [] as MbgPmBatch[],
  subscribeEntries: vi.fn(() => () => {}),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { uid: 'admin' } }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: vi.fn() }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/pages/mbg/MbgAdminPage', () => ({ ManageMenuModal: () => null }));
vi.mock('@/services/mbgAdminService', () => ({
  subscribeBatches: (callback: (data: MbgPmBatch[]) => void) => { callback(fake.batches); return () => {}; },
  subscribeEntries: fake.subscribeEntries,
}));

import { MbgArchivePage } from '@/pages/mbg/MbgArchivePage';

const batch = (id: string, tanggal: string, extra: Partial<MbgPmBatch>): MbgPmBatch => ({
  id, tanggal, status: 'DELIVERED', petugasList: [], totalSiswaBalita: 0, totalBumilBusui: 0, totalGuruKader: 0,
  totalPobiaNasi: 0, totalJumlah: 100, batchNotes: '', createdBy: 'admin', createdAt: `${tanggal}T08:00:00.000Z`,
  updatedAt: `${tanggal}T08:00:00.000Z`, ...extra,
});

const search = (text: string) =>
  fireEvent.change(screen.getByPlaceholderText('Cari sekolah atau posyandu...'), { target: { value: text } });

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fake.batches = [
    batch('b1', '2026-10-01', { institutionNames: ['SDN 1 Sukabumi', 'Posyandu Cempaka 7'], petugasList: ['Dwi'] }),
    batch('b2', '2026-10-02', { institutionNames: ['TK Melati'], petugasList: ['Wandi'] }),
    batch('old', '2026-09-01', { petugasList: ['Ujang'] }),
  ];
});

const renderPage = () => render(<MemoryRouter><MbgArchivePage /></MemoryRouter>);

describe('Arsip PM search by school name', () => {
  it('finds the batch that served a school and names the school, without reading PM rows', () => {
    renderPage();
    search('cempaka');

    expect(screen.getByText('Pengiriman: 2026-10-01')).toBeTruthy();
    expect(screen.queryByText('Pengiriman: 2026-10-02')).toBeNull();
    expect(screen.getByText(/Posyandu Cempaka 7/)).toBeTruthy();
    expect(fake.subscribeEntries).not.toHaveBeenCalled();
  });

  it('still finds a batch by its courier', () => {
    renderPage();
    search('wandi');

    expect(screen.getByText('Pengiriman: 2026-10-02')).toBeTruthy();
    expect(screen.queryByText('Pengiriman: 2026-10-01')).toBeNull();
  });

  it('says how many older archives cannot be searched by school name yet', () => {
    renderPage();
    search('cempaka');

    expect(screen.getByText(/1 arsip lama belum bisa dicari lewat nama sekolah/)).toBeTruthy();
  });
});
