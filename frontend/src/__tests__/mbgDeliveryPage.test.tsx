import { beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { MbgDeliveryTask, MbgPmBatch, MbgPmEntry } from '@/types/mbg';

const fake = vi.hoisted(() => ({
  user: { uid: 'driver', email: 'andi@example.test' },
  profile: { uid: 'driver', displayName: 'Andi', role: 'kurir_mbg' },
  batches: [] as MbgPmBatch[], tasks: [] as MbgDeliveryTask[], entries: [] as MbgPmEntry[],
  exportPdf: vi.fn().mockResolvedValue(undefined),
  archive: vi.fn().mockResolvedValue('archive'),
  complete: vi.fn().mockResolvedValue(undefined),
  toast: vi.fn(),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fake.user, profile: fake.profile }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/utils/date', () => ({ getJakartaDate: () => '2026-10-03' }));
vi.mock('@/services/gpsService', () => ({ startTracker: () => ({ stop: vi.fn() }) }));
vi.mock('@/components/LiveCamera', () => ({ LiveCamera: () => null }));
vi.mock('@/components/mbg/SearchableBatchSelector', () => ({ SearchableBatchSelector: () => null }));
vi.mock('@/utils/mbgDeliveryReportPdfExporter', () => ({ exportMbgDeliveryReportPdf: fake.exportPdf }));
vi.mock('@/services/mbgAdminService', () => ({
  subscribeBatches: (callback: (data: MbgPmBatch[]) => void) => { callback(fake.batches); return () => {}; },
  subscribeEntries: (_id: string, callback: (data: MbgPmEntry[]) => void) => { callback(fake.entries); return () => {}; },
}));
vi.mock('@/services/mbgDeliveryService', () => ({
  subscribeKurirTasks: (_batch: string, _uid: string, _email: string, _name: string, callback: (data: MbgDeliveryTask[]) => void) => { callback(fake.tasks); return () => {}; },
  subscribeAllDeliveryDocuments: () => () => {},
  saveDeliveryDocument: fake.archive, completeTaskAndBatch: fake.complete,
  updateTaskStatus: vi.fn(), setHandoverPhoto: vi.fn(), addDeliveryPhoto: vi.fn(),
  updateSchoolDeliveryProof: vi.fn(), deleteSchoolDeliveryProof: vi.fn(), updatePhotoDescription: vi.fn(),
}));

import { MbgDeliveryPage } from '@/pages/mbg/MbgDeliveryPage';

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  sessionStorage.clear();
  fake.batches = [{ id: 'batch', tanggal: '2026-10-03', status: 'DELIVERING', productionCookingStatus: 'cooked', petugasList: ['Andi'],
    totalSiswaBalita: 10, totalBumilBusui: 0, totalGuruKader: 0, totalPobiaNasi: 0, totalJumlah: 10,
    batchNotes: '', createdBy: 'distribution', createdAt: 'now', updatedAt: 'now' }];
  fake.tasks = [{ id: 'task', batchId: 'batch', petugasId: 'driver', petugasName: 'Andi', kenekId: '', kenekName: '',
    entryIds: ['school'], status: 'delivering', totalPorsi: 10, deliveryPhotos: [], schoolProofs: {}, handoverPhotoId: 'handover',
    handoverAt: 'now', completedAt: '', createdAt: 'now', updatedAt: 'now' }];
  fake.entries = [{ id: 'school', batchId: 'batch', institutionName: 'SDN 1', institutionType: 'sekolah', schoolLevel: 'sd',
    assignedPetugasId: 'driver', assignedPetugasName: 'Andi', jumlah: 10, qtSiswaBalita: 10, qtBumilBusui: 0, qtGuruKader: 0,
    qtPobiaNasi: 0, jadwalPengantaran: '08.00', menuItems: [], menuKeringanItems: [], isSekolahLibur: false,
    notes: '', sortOrder: 0, createdBy: 'distribution', createdAt: 'now', updatedAt: 'now',
    photoMenuUrl: 'menu', photoSerahTerimaUrl: 'handover', photoSuratJalanUrl: 'letter', photoPenerimaUrl: 'container' }];
});

describe('MBG delivery PDF and completion actions', () => {
  it('exports and archives a PDF without marking the task delivered', async () => {
    render(<MbgDeliveryPage />);
    fireEvent.click(await screen.findByRole('button', { name: /^Export PDF$/ }));
    await waitFor(() => expect(fake.archive).toHaveBeenCalled());
    expect(fake.exportPdf).toHaveBeenCalled();
    expect(fake.complete).not.toHaveBeenCalled();
    expect(fake.archive).toHaveBeenCalledWith(expect.objectContaining({ petugasId: 'driver', completedCount: 1 }));
  });
  it('requires the fourth photo before enabling the explicit completion button', async () => {
    fake.entries[0].photoPenerimaUrl = '';
    render(<MbgDeliveryPage />);
    const button = await screen.findByRole('button', { name: 'Selesaikan Pengiriman' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(button);
    expect(fake.complete).not.toHaveBeenCalled();
  });
  it('requires production to finish before enabling completion', async () => {
    fake.batches[0].productionCookingStatus = 'cooking';
    render(<MbgDeliveryPage />);
    const button = await screen.findByRole('button', { name: 'Selesaikan Pengiriman' });
    expect((button as HTMLButtonElement).disabled).toBe(true);
  });
  it('completes only through the explicit action after evidence and production are ready', async () => {
    render(<MbgDeliveryPage />);
    const button = await screen.findByRole('button', { name: 'Selesaikan Pengiriman' });
    expect((button as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(button);
    await waitFor(() => expect(fake.complete).toHaveBeenCalledWith(fake.tasks[0]));
  });
});
