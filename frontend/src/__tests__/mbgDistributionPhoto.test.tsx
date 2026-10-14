import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MbgDeliveryTask, MbgPmBatch, MbgPmEntry } from '@/types/mbg';

const fake = vi.hoisted(() => ({
  batch: { id: 'batch', tanggal: '2026-10-03', status: 'DELIVERING', totalJumlah: 10 } as MbgPmBatch,
  entry: { id: 'school', batchId: 'batch', institutionName: 'SDN 1', institutionType: 'sekolah',
    assignedPetugasId: 'driver', assignedPetugasName: 'Andi', jumlah: 10, menuItems: [],
    schoolLevel: 'sd', qtSiswaBalita: 10, qtBumilBusui: 0, qtGuruKader: 0, qtPobiaNasi: 0,
    jadwalPengantaran: '08.00', menuKeringanItems: [], isSekolahLibur: false,
    notes: '', sortOrder: 0, createdBy: 'distribution', createdAt: 'now', updatedAt: 'now',
    photoMenuUrl: 'menu', photoSerahTerimaUrl: 'handover', photoSuratJalanUrl: 'letter', photoPenerimaUrl: 'container' } as MbgPmEntry,
  task: { id: 'task', batchId: 'batch', petugasId: 'driver', petugasName: 'Andi', entryIds: ['school'], schoolProofs: {} } as MbgDeliveryTask,
  save: vi.fn().mockResolvedValue(undefined),
  exportPdf: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
}));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/utils/date', () => ({ getJakartaDate: () => '2026-10-03' }));
vi.mock('@/components/LiveCamera', () => ({ LiveCamera: () => null }));
vi.mock('@/components/mbg/SearchableBatchSelector', () => ({ SearchableBatchSelector: () => null }));
vi.mock('@/services/flowNotifications', () => ({ notifyMbgCourierTasks: vi.fn() }));
vi.mock('@/utils/rotatePhoto', () => ({ rotatePhoto: (url: string, turns: number) => Promise.resolve(turns ? 'rotated' : url) }));
vi.mock('@/utils/mbgDeliveryReportPdfExporter', () => ({
  exportMbgDeliveryReportPdf: fake.exportPdf, exportMbgDailyDistributionReportPdf: vi.fn(),
  formatIndonesianDate: (date: string) => date,
  compareCouriers: (a: string, _b: unknown, c: string) => a.localeCompare(c),
}));
vi.mock('@/services/mbgAdminService', () => ({
  subscribeBatches: (cb: (items: MbgPmBatch[]) => void) => { cb([fake.batch]); return () => {}; },
  subscribeEntries: (_id: string, cb: (items: MbgPmEntry[]) => void) => { cb([fake.entry]); return () => {}; },
  updateEntry: vi.fn(),
}));
vi.mock('@/services/mbgDistributionService', () => ({
  subscribeDeliveryTasks: (_id: string, cb: (items: MbgDeliveryTask[]) => void) => { cb([fake.task]); return () => {}; },
  subscribeKurirUsers: (cb: (items: unknown[]) => void) => { cb([]); return () => {}; },
  addDeliveryTask: vi.fn(), updateDeliveryTask: vi.fn(),
}));
vi.mock('@/services/mbgDeliveryService', () => ({
  subscribeBatchDeliveryDocuments: (_id: string, cb: (items: unknown[]) => void) => { cb([]); return () => {}; },
  updateSchoolDeliveryProof: vi.fn(), deleteSchoolDeliveryProof: vi.fn(), saveRotatedSchoolDeliveryProof: fake.save,
  MBG_PROOF_PHOTO_FIELDS: { menu: 'photoMenuUrl', penerima: 'photoPenerimaUrl', serah_terima: 'photoSerahTerimaUrl', surat_jalan: 'photoSuratJalanUrl' },
}));

import { MbgDistributionPage } from '@/pages/mbg/MbgDistributionPage';
afterEach(cleanup);

describe('distribution courier report photo corrections', () => {
  it('saves a rotated photo and includes it when exporting the corrected report', async () => {
    render(<MbgDistributionPage />);
    fireEvent.click(await screen.findByRole('button', { name: /Laporan Kurir/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit & Koreksi' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Edit foto: SDN 1 — 3. Foto Surat Jalan' }));
    fireEvent.click(screen.getByRole('button', { name: 'Putar kiri 90°' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Simpan foto' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan foto' }));
    await waitFor(() => expect(fake.save).toHaveBeenCalledWith('school', 'surat_jalan', 'letter', 'rotated', 'task'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit foto' })).toBeNull());
    expect((screen.getByAltText('3. Foto Surat Jalan') as HTMLImageElement).getAttribute('src')).toBe('rotated');
    fireEvent.click(screen.getByRole('button', { name: 'Simpan & Export Ulang PDF' }));
    await waitFor(() => expect(fake.exportPdf).toHaveBeenCalledWith(expect.objectContaining({ entries: [expect.objectContaining({ photoSuratJalanUrl: 'rotated' })] })));
  });
});
