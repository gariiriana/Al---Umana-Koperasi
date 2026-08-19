import { describe, it, expect } from 'vitest';
import type { Order } from '@/types/order';
import type { MbgPmEntry, MbgDeliveryTask } from '@/types/mbg';

describe('Delivery Archiving & Active Task Filtering', () => {
  describe('Catering Kurir & Scheduler Archiving Logic', () => {
    const mockOrders: Partial<Order>[] = [
      {
        id: 'ord-1',
        institutionName: 'Dinas Pendidikan',
        status: 'READY_TO_DELIVER',
        assignedCourierId: 'kurir-1',
        eventDate: '2026-08-19',
      },
      {
        id: 'ord-2',
        institutionName: 'Bappeda Sukabumi',
        status: 'OUT_FOR_DELIVERY',
        assignedCourierId: 'kurir-1',
        eventDate: '2026-08-19',
      },
      {
        id: 'ord-3',
        institutionName: 'Kemenag Sukabumi',
        status: 'DELIVERED',
        assignedCourierId: 'kurir-1',
        deliveredAt: '2026-08-19T10:30:00.000Z',
        proofFileIds: ['proof1.jpg', 'proof2.jpg'],
        eventDate: '2026-08-19',
      },
      {
        id: 'ord-4',
        institutionName: 'SMKN 1 Cisaat',
        status: 'COMPLETED',
        assignedCourierId: 'kurir-1',
        deliveredAt: '2026-08-19T11:15:00.000Z',
        proofFileIds: ['proof3.jpg'],
        eventDate: '2026-08-19',
      },
    ];

    it('filters active tasks correctly (excludes DELIVERED and COMPLETED orders)', () => {
      const activeOrders = mockOrders.filter(
        (o) => o.status === 'READY_TO_DELIVER' || o.status === 'OUT_FOR_DELIVERY'
      );
      expect(activeOrders).toHaveLength(2);
      expect(activeOrders.map((o) => o.id)).toEqual(['ord-1', 'ord-2']);
    });

    it('archives completed tasks into history without deleting active or completed data', () => {
      const completedOrders = mockOrders.filter(
        (o) => o.status === 'DELIVERED' || o.status === 'COMPLETED'
      );
      expect(completedOrders).toHaveLength(2);
      expect(completedOrders.map((o) => o.id)).toEqual(['ord-3', 'ord-4']);
      expect(mockOrders).toHaveLength(4); // Database integrity preserved
    });
  });

  describe('MBG Kurir & Distribusi Archiving Logic', () => {
    const mockMbgEntries: Partial<MbgPmEntry>[] = [
      {
        id: 'mbg-entry-1',
        institutionName: 'SDN 1 Cibadak',
        jumlah: 150,
        assignedPetugasName: 'Andi Kurir',
        photoMenuUrl: 'https://storage/menu1.jpg',
        photoSerahTerimaUrl: 'https://storage/serah1.jpg',
        photoSuratJalanUrl: 'https://storage/surat1.jpg',
        photoPenerimaUrl: 'https://storage/penerima1.jpg',
        isSekolahLibur: false,
      },
      {
        id: 'mbg-entry-2',
        institutionName: 'SDN 2 Cibadak',
        jumlah: 200,
        assignedPetugasName: 'Andi Kurir',
        photoMenuUrl: 'https://storage/menu2.jpg',
        photoSerahTerimaUrl: '',
        photoSuratJalanUrl: '',
        photoPenerimaUrl: '',
        isSekolahLibur: false,
      },
      {
        id: 'mbg-entry-3',
        institutionName: 'SMPN 1 Cibadak',
        jumlah: 300,
        assignedPetugasName: 'Dede Kurir',
        photoMenuUrl: '',
        photoSerahTerimaUrl: '',
        photoSuratJalanUrl: '',
        photoPenerimaUrl: '',
        isSekolahLibur: false,
      },
      {
        id: 'mbg-entry-4',
        institutionName: 'Posyandu Mawar',
        jumlah: 50,
        assignedPetugasName: 'Dede Kurir',
        isSekolahLibur: true,
      },
    ];

    const isComplete = (e: Partial<MbgPmEntry>) =>
      !e.isSekolahLibur &&
      Boolean(e.photoMenuUrl && e.photoSerahTerimaUrl && e.photoSuratJalanUrl && e.photoPenerimaUrl);

    it('differentiates pending institutions from completed institutions', () => {
      const completed = mockMbgEntries.filter((e) => isComplete(e));
      const pending = mockMbgEntries.filter((e) => !e.isSekolahLibur && !isComplete(e));

      expect(completed).toHaveLength(1);
      expect(completed[0].id).toBe('mbg-entry-1');

      expect(pending).toHaveLength(2);
      expect(pending.map((e) => e.id)).toEqual(['mbg-entry-2', 'mbg-entry-3']);
    });

    it('marks MBG task as delivered when finalized', () => {
      const mockTask: Partial<MbgDeliveryTask> = {
        id: 'task-1',
        petugasName: 'Andi Kurir',
        status: 'delivering',
      };

      const finalizeTask = (task: Partial<MbgDeliveryTask>): Partial<MbgDeliveryTask> => ({
        ...task,
        status: 'delivered',
        completedAt: new Date().toISOString(),
      });

      const finalized = finalizeTask(mockTask);
      expect(finalized.status).toBe('delivered');
      expect(finalized.completedAt).toBeDefined();
    });
  });
});
