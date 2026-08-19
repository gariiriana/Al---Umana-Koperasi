import { describe, it, expect } from 'vitest';
import type { MbgPmEntry } from '@/types/mbg';
import { isPosyanduName } from '@/utils/mbgDeliveryReportPdfExporter';

function computeBatchPortions(
  allEntries: MbgPmEntry[]
): Record<string, number> {
  const map: Record<string, number> = {};
  allEntries.forEach((e) => {
    if (e.batchId && !e.isSekolahLibur) {
      map[e.batchId] = (map[e.batchId] || 0) + (e.jumlah || 0);
    }
  });
  return map;
}

function prepareCopiedEntry(entry: MbgPmEntry, targetBatchId: string, createdBy: string): Partial<MbgPmEntry> {
  return {
    ...entry,
    batchId: targetBatchId,
    isSekolahLibur: false,
    photoMenuUrl: undefined,
    photoSerahTerimaUrl: undefined,
    photoPenerimaUrl: undefined,
    photoSuratJalanUrl: undefined,
    photoSerahTerimaTimestamp: undefined,
    photoPenerimaTimestamp: undefined,
    photoSerahTerimaLocation: undefined,
    photoPenerimaLocation: undefined,
    createdBy,
  };
}

describe('MBG Batch Portion & Copy Logic', () => {
  it('correctly aggregates portions per batch and excludes holiday schools', () => {
    const entries: MbgPmEntry[] = [
      { id: 'e1', batchId: 'b1', jumlah: 150, isSekolahLibur: false } as unknown as MbgPmEntry,
      { id: 'e2', batchId: 'b1', jumlah: 200, isSekolahLibur: false } as unknown as MbgPmEntry,
      { id: 'e3', batchId: 'b1', jumlah: 50, isSekolahLibur: true } as unknown as MbgPmEntry, // libur
      { id: 'e4', batchId: 'b2', jumlah: 300, isSekolahLibur: false } as unknown as MbgPmEntry,
    ];

    const portions = computeBatchPortions(entries);
    expect(portions['b1']).toBe(350); // 150 + 200 (50 excluded because libur)
    expect(portions['b2']).toBe(300);
  });

  it('resets photos and delivery timestamps when copying entries to a new batch', () => {
    const originalEntry: MbgPmEntry = {
      id: 'e1',
      batchId: 'old-batch',
      institutionName: 'SD N 1 Cibadak',
      jumlah: 180,
      assignedPetugasName: 'Andi & Dede',
      photoMenuUrl: 'https://example.com/menu.jpg',
      photoSerahTerimaUrl: 'https://example.com/serah.jpg',
      photoPenerimaUrl: 'https://example.com/penerima.jpg',
      photoSuratJalanUrl: 'https://example.com/sj.jpg',
      photoSerahTerimaTimestamp: '2026-08-17T08:00:00Z',
      photoPenerimaTimestamp: '2026-08-17T08:15:00Z',
      isSekolahLibur: true,
      createdBy: 'user-1',
    } as unknown as MbgPmEntry;

    const copied = prepareCopiedEntry(originalEntry, 'new-batch', 'user-2');

    expect(copied.batchId).toBe('new-batch');
    expect(copied.createdBy).toBe('user-2');
    expect(copied.institutionName).toBe('SD N 1 Cibadak');
    expect(copied.jumlah).toBe(180);
    expect(copied.assignedPetugasName).toBe('Andi & Dede');
    expect(copied.isSekolahLibur).toBe(false);
    expect(copied.photoMenuUrl).toBeUndefined();
    expect(copied.photoSerahTerimaUrl).toBeUndefined();
    expect(copied.photoPenerimaUrl).toBeUndefined();
    expect(copied.photoSuratJalanUrl).toBeUndefined();
    expect(copied.photoSerahTerimaTimestamp).toBeUndefined();
    expect(copied.photoPenerimaTimestamp).toBeUndefined();
  });

  it('accurately identifies posyandu names (including Cempaka 1-13) and differentiates from schools', () => {
    expect(isPosyanduName('CEMPAKA 6')).toBe(true);
    expect(isPosyanduName('CEMPAKA 10')).toBe(true);
    expect(isPosyanduName('Balita Cempaka')).toBe(true);
    expect(isPosyanduName('Bumil Cempaka')).toBe(true);
    expect(isPosyanduName('Busui Cempaka')).toBe(true);
    expect(isPosyanduName('Posyandu Mawar')).toBe(true);
    expect(isPosyanduName('Balita & Bumil RW 02')).toBe(true);
    expect(isPosyanduName('Paket 3B Melati')).toBe(true);

    expect(isPosyanduName('SPS CEMPAKA')).toBe(false);
    expect(isPosyanduName('SPS CEMPAKA 10')).toBe(false);
    expect(isPosyanduName('TK CEMPAKA')).toBe(false);
    expect(isPosyanduName('SDN 1 Cibadak')).toBe(false);
    expect(isPosyanduName('SMPN 2 Sukabumi')).toBe(false);
    expect(isPosyanduName('TK Pembina')).toBe(false);
  });
});

