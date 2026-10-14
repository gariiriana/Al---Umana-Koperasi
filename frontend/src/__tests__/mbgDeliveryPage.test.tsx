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
  rotate: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: fake.user, profile: fake.profile }) }));
vi.mock('@/contexts/ToastContext', () => ({ useToast: () => ({ showToast: fake.toast }) }));
vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/utils/date', () => ({ getJakartaDate: () => '2026-10-03' }));
vi.mock('@/services/gpsService', () => ({ startTracker: () => ({ stop: vi.fn() }) }));
vi.mock('@/components/LiveCamera', () => ({ LiveCamera: () => null }));
vi.mock('@/utils/rotatePhoto', () => ({ rotatePhoto: (url: string, turns: number) => Promise.resolve(turns ? `rotated_${url}` : url) }));
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
  saveRotatedSchoolDeliveryProof: fake.rotate,
  MBG_PROOF_PHOTO_FIELDS: { menu: 'photoMenuUrl', penerima: 'photoPenerimaUrl', serah_terima: 'photoSerahTerimaUrl', surat_jalan: 'photoSuratJalanUrl' },
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
  it.each([
    ['Foto Kedatangan Ompreng di Sekolah', 'menu', 'menu', 'photoMenuUrl'],
    ['Foto Serah Terima dengan PJ Sekolah (Geotag)', 'serah_terima', 'handover', 'photoSerahTerimaUrl'],
    ['Foto Surat Jalan / BAST', 'surat_jalan', 'letter', 'photoSuratJalanUrl'],
    ['Foto Pengambilan Ompreng Kosong', 'penerima', 'container', 'photoPenerimaUrl'],
  ])('saves rotated %s and uses it in the PDF', async (label, proofType, original, field) => {
    render(<MbgDeliveryPage />);
    fireEvent.click((await screen.findAllByRole('button', { name: /Lengkap \(4\/4\)/ }))[0]);
    fireEvent.click(await screen.findByRole('button', { name: `Edit foto: ${label}` }));
    fireEvent.click(screen.getByRole('button', { name: 'Putar kanan 90°' }));
    await waitFor(() => expect((screen.getByRole('button', { name: 'Simpan foto' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Simpan foto' }));
    await waitFor(() => expect(fake.rotate).toHaveBeenCalledWith('school', proofType, original, `rotated_${original}`, 'task'));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Edit foto' })).toBeNull());
    expect((screen.getByAltText(label) as HTMLImageElement).src).toContain(`rotated_${original}`);
    fireEvent.click(screen.getByRole('button', { name: 'Selesai' }));
    fireEvent.click(screen.getByRole('button', { name: /^Export PDF$/ }));
    await waitFor(() => expect(fake.exportPdf).toHaveBeenCalledWith(expect.objectContaining({ entries: [expect.objectContaining({ [field]: `rotated_${original}` })] })));
  });
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
