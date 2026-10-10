import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { MbgBahanChecklistForm, MbgDeliveryTask } from '@/types/mbg';

const fake = vi.hoisted(() => {
  const state = { actor: 'driver', failWrite: '', documents: new Map<string, Record<string, unknown>>() };
  const snapshot = (path: string) => ({ id: path.split('/').at(-1), ref: path,
    exists: () => state.documents.has(path), data: () => state.documents.get(path) });
  const get = vi.fn(async (path: string) => snapshot(path));
  const transactionUpdate = vi.fn();
  const merge = (path: string, fields: Record<string, unknown>) => {
    const current = state.documents.get(path) || {};
    const next = { ...current };
    for (const [key, value] of Object.entries(fields)) {
      if (value && typeof value === 'object' && 'union' in value) {
        next[key] = [...((current[key] as unknown[]) || []), ...(value.union as unknown[])];
      } else next[key] = value;
    }
    state.documents.set(path, next);
  };
  return {
    state, get, transactionUpdate,
    runTransaction: vi.fn(async (_db: unknown, callback: (tx: { get: typeof get; update: (path: string, fields: Record<string, unknown>) => void }) => Promise<unknown>) => {
      const pending: Array<[string, Record<string, unknown>]> = [];
      const update = (...args: [string, Record<string, unknown>]) => { transactionUpdate(...args); pending.push(args); };
      const result = await callback({ get, update });
      pending.forEach(([path, fields]) => merge(path, fields));
      return result;
    }),
    updateDoc: vi.fn(async (path: string, fields: Record<string, unknown>) => {
      if (path === state.failWrite) throw new Error('permission-denied');
      merge(path, fields);
    }),
    getDocs: vi.fn(async (q: { path: string; filters: Array<{ field: string; value: unknown }> }) => {
      const docs = [...state.documents.keys()].filter((path) => path.startsWith(q.path + '/') &&
        q.filters.every((filter) => state.documents.get(path)?.[filter.field] === filter.value)).map(snapshot);
      return { docs, empty: !docs.length };
    }),
    notify: vi.fn().mockResolvedValue(undefined),
    snapshot,
  };
});

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('@/services/authService', () => ({ currentUser: () => ({ uid: fake.state.actor }) }));
vi.mock('@/services/notificationWriter', () => ({ pushNotification: fake.notify, shortOrderId: (id: string) => id }));
vi.mock('@/services/flowNotifications', () => ({ notifyMbgBatchStatus: vi.fn(), notifyMbgDeliveryProgress: vi.fn() }));
vi.mock('@/services/whatsappService', () => ({ sendWhatsAppNotification: vi.fn(), sendWhatsAppNotificationDirect: vi.fn(), WA_MESSAGES: {} }));
vi.mock('@/services/developerRecycleBinService', () => ({ archiveAndDelete: vi.fn(), archiveSnapshotsAndDelete: vi.fn() }));
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  doc: (_db: unknown, ...parts: string[]) => parts.join('/'),
  collection: (_db: unknown, ...parts: string[]) => parts.join('/'),
  where: (field: string, _operator: string, value: unknown) => ({ field, value }),
  query: (path: string, ...filters: Array<{ field: string; value: unknown }>) => ({ path, filters }),
  getDoc: fake.get, getDocs: fake.getDocs, updateDoc: fake.updateDoc,
  runTransaction: fake.runTransaction, arrayUnion: (...union: unknown[]) => ({ union }),
}));

import { completeTaskAndBatch, updateTaskStatus } from '@/services/mbgDeliveryService';
import { confirmDelivery, dispatchOrder, reassignCourier } from '@/services/orderService';
import { saveBahanChecklist } from '@/services/mbgBahanService';

const task = { id: 'task', batchId: 'batch', petugasId: 'driver', kenekId: 'assistant', entryIds: ['school'], status: 'delivering' } as MbgDeliveryTask;
const handover = [{ kitchenName: 'Dapur', staffName: 'Petugas', photoFileIds: ['a', 'b'], signedAt: 'now' }];
beforeEach(() => {
  vi.clearAllMocks();
  fake.state.actor = 'driver';
  fake.state.failWrite = '';
  fake.state.documents.clear();
  fake.state.documents.set('mbg_delivery_tasks/task', { ...task });
  fake.state.documents.set('mbg_pm_batches/batch', { productionCookingStatus: 'cooked' });
  fake.state.documents.set('mbg_pm_entries/school', {
    batchId: 'batch', assignedPetugasId: 'driver', isSekolahLibur: false,
    photoMenuUrl: 'menu', photoPenerimaUrl: 'container', photoSerahTerimaUrl: 'handover', photoSuratJalanUrl: 'letter',
  });
  fake.state.documents.set('orders/order', {
    assignedCourierId: 'driver', status: 'READY_TO_DELIVER', items: [], deliveryAddress: 'Sekolah',
    createdAt: '2026-10-03T01:00:00Z', updatedAt: '2026-10-03T01:00:00Z',
  });
});

describe('MBG delivery completion using fresh persisted evidence', () => {
  it('rejects the missing fourth photo without changing task status', async () => {
    fake.state.documents.get('mbg_pm_entries/school')!.photoPenerimaUrl = '';
    await expect(completeTaskAndBatch(task)).rejects.toThrow('empat foto');
    expect(fake.transactionUpdate).not.toHaveBeenCalled();
  });
  it('rejects unfinished production', async () => {
    fake.state.documents.get('mbg_pm_batches/batch')!.productionCookingStatus = 'cooking';
    await expect(completeTaskAndBatch(task)).rejects.toThrow('Produksi harus selesai');
    expect(fake.transactionUpdate).not.toHaveBeenCalled();
  });
  it('rejects a stale school assignment', async () => {
    fake.state.documents.get('mbg_pm_entries/school')!.assignedPetugasId = 'other';
    await expect(completeTaskAndBatch(task)).rejects.toThrow('Penugasan telah berubah');
    expect(fake.transactionUpdate).not.toHaveBeenCalled();
  });
  it('requires departure before completion and prevents bypass through updateTaskStatus', async () => {
    fake.state.documents.get('mbg_delivery_tasks/task')!.status = 'waiting';
    await expect(completeTaskAndBatch(task)).rejects.toThrow('Mulai pengantaran');
    await expect(updateTaskStatus('task', 'delivered')).rejects.toThrow('memvalidasi');
  });
  it('finishes a fully documented task and then the shared batch', async () => {
    await completeTaskAndBatch(task);
    expect(fake.state.documents.get('mbg_delivery_tasks/task')?.status).toBe('delivered');
    expect(fake.state.documents.get('mbg_pm_batches/batch')?.status).toBe('DELIVERED');
  });
  it('keeps the batch active while another courier is still delivering', async () => {
    fake.state.documents.set('mbg_delivery_tasks/other', { batchId: 'batch', status: 'delivering', entryIds: ['other-school'] });
    await completeTaskAndBatch(task);
    expect(fake.state.documents.get('mbg_pm_batches/batch')?.status).not.toBe('DELIVERED');
  });
});

describe('catering delivery custody', () => {
  it('rejects dispatch after the task has been reassigned', async () => {
    fake.state.documents.get('orders/order')!.assignedCourierId = 'other';
    await expect(dispatchOrder('order', { kitchenSignatures: handover })).rejects.toThrow('tidak ditugaskan');
    expect(fake.transactionUpdate).not.toHaveBeenCalled();
  });
  it('requires handover evidence and a ready status', async () => {
    await expect(dispatchOrder('order')).rejects.toThrow('serah terima');
    fake.state.documents.get('orders/order')!.status = 'IN_PRODUCTION';
    await expect(dispatchOrder('order', { kitchenSignatures: handover })).rejects.toThrow('belum siap');
  });
  it('dispatches and completes the owned order with photo and signature', async () => {
    await dispatchOrder('order', { kitchenSignatures: handover });
    expect(fake.state.documents.get('orders/order')?.status).toBe('OUT_FOR_DELIVERY');
    await confirmDelivery('order', ['photo', 'signature'], [{ fileId: 'photo', description: '' }]);
    expect(fake.state.documents.get('orders/order')?.status).toBe('COMPLETED');
  });
  it('rejects completion without evidence or after reassignment', async () => {
    await expect(confirmDelivery('order', [])).rejects.toThrow('wajib');
    fake.state.documents.get('orders/order')!.assignedCourierId = 'other';
    await expect(confirmDelivery('order', ['photo', 'signature'], [{ fileId: 'photo', description: '' }])).rejects.toThrow('tidak ditugaskan');
  });
  it('records the previous courier and notifies them on reassignment', async () => {
    await reassignCourier('order', 'replacement', { reason: 'Sakit', reassignedBy: 'distribution', reassignedByName: 'Distribusi' });
    const history = fake.state.documents.get('orders/order')?.courierReassignments as Array<Record<string, unknown>>;
    expect(history[0].previousCourierId).toBe('driver');
    expect(fake.notify).toHaveBeenCalledWith(expect.objectContaining({ recipientId: 'driver', title: expect.stringContaining('Dialihkan') }));
  });
});

describe('checklist synchronization', () => {
  const form: Omit<MbgBahanChecklistForm, 'id'> = {
    batchId: 'batch', tanggal: '2026-10-03', dari: '', kepada: '', waktu: '', noForm: '',
    rows: [], officerName: 'Kurir', officerTitle: '', lokasiTtd: '', tanggalTtd: '',
    createdAt: 'now', updatedAt: 'now', createdBy: 'driver',
  };
  it('updates only inspection fields in the production report', async () => {
    fake.state.documents.set('mbg_inspection_forms/form', { batchId: 'batch' });
    fake.state.documents.set('mbg_daily_reports/report', { batchId: 'batch', cookingStatus: 'cooked' });
    await saveBahanChecklist(form, 'form');
    expect(fake.updateDoc).toHaveBeenCalledWith('mbg_daily_reports/report', { inspectionForm: expect.objectContaining({ officerName: 'Kurir' }), updatedAt: expect.any(String) });
    expect(fake.state.documents.get('mbg_daily_reports/report')?.cookingStatus).toBe('cooked');
  });
  it('propagates sync failures so callers cannot claim success', async () => {
    fake.state.documents.set('mbg_inspection_forms/form', { batchId: 'batch' });
    fake.state.documents.set('mbg_daily_reports/report', { batchId: 'batch' });
    fake.state.failWrite = 'mbg_daily_reports/report';
    await expect(saveBahanChecklist(form, 'form')).rejects.toThrow('permission-denied');
  });
});
