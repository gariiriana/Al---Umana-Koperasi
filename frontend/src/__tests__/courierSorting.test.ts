import { describe, it, expect } from 'vitest';
import { getCourierGroupOrder, compareCouriers } from '@/utils/mbgDeliveryReportPdfExporter';

describe('Courier Sorting for MBG Distribution', () => {
  it('should rank pairs correctly: 1. Andi & Dede, 2. Yusep & Erik, 3. Agus & Firdi', () => {
    expect(getCourierGroupOrder('Andi & Dede')).toBe(10);
    expect(getCourierGroupOrder('Andi', 'Dede')).toBe(10);
    expect(getCourierGroupOrder('Dede', 'Andi')).toBe(10);

    expect(getCourierGroupOrder('Yusep & Erik')).toBe(20);
    expect(getCourierGroupOrder('Yusep', 'Erik')).toBe(20);
    expect(getCourierGroupOrder('Erik', 'Yusep')).toBe(20);

    expect(getCourierGroupOrder('Agus & Firdi')).toBe(30);
    expect(getCourierGroupOrder('Agus', 'Firdi')).toBe(30);
    expect(getCourierGroupOrder('Firdi', 'Agus')).toBe(30);
  });

  it('should rank individual courier names correctly within their respective group', () => {
    expect(getCourierGroupOrder('Andi Kurir')).toBe(11);
    expect(getCourierGroupOrder('Dede Kurir')).toBe(12);

    expect(getCourierGroupOrder('Yusep Kurir')).toBe(21);
    expect(getCourierGroupOrder('Erik Kurir')).toBe(22);

    expect(getCourierGroupOrder('Agus Kurir')).toBe(31);
    expect(getCourierGroupOrder('Firdi Kurir')).toBe(32);
  });

  it('should rank unknown couriers and unassigned appropriately', () => {
    expect(getCourierGroupOrder('Budi Kurir')).toBe(100);
    expect(getCourierGroupOrder('Belum Ditugaskan')).toBe(999);
    expect(getCourierGroupOrder('')).toBe(999);
    expect(getCourierGroupOrder(undefined)).toBe(999);
  });

  it('should sort a list of courier pairs in the exact requested order', () => {
    const rawCouriers = [
      { name: 'Agus & Firdi', kenek: '' },
      { name: 'Belum Ditugaskan', kenek: '' },
      { name: 'Andi & Dede', kenek: '' },
      { name: 'Kurir Tambahan', kenek: '' },
      { name: 'Yusep & Erik', kenek: '' },
    ];

    const sorted = rawCouriers.sort((a, b) => compareCouriers(a.name, a.kenek, b.name, b.kenek));

    expect(sorted.map((c) => c.name)).toEqual([
      'Andi & Dede',
      'Yusep & Erik',
      'Agus & Firdi',
      'Kurir Tambahan',
      'Belum Ditugaskan',
    ]);
  });

  it('should sort individual couriers with kenek correctly', () => {
    const raw = [
      { name: 'Firdi', kenek: 'Agus' },
      { name: 'Yusep', kenek: 'Erik' },
      { name: 'Andi', kenek: 'Dede' },
    ];

    const sorted = raw.sort((a, b) => compareCouriers(a.name, a.kenek, b.name, b.kenek));

    expect(sorted.map((c) => `${c.name} & ${c.kenek}`)).toEqual([
      'Andi & Dede',
      'Yusep & Erik',
      'Firdi & Agus',
    ]);
  });

  it('should sort courier option lists correctly', () => {
    const rawOptions = ['Dede Kurir', 'Andi Kurir', 'Erik Kurir', 'Yusep Kurir', 'Agus Kurir', 'Firdi Kurir'];

    const sorted = [...rawOptions].sort((a, b) => compareCouriers(a, undefined, b, undefined));

    expect(sorted).toEqual([
      'Andi Kurir',
      'Dede Kurir',
      'Yusep Kurir',
      'Erik Kurir',
      'Agus Kurir',
      'Firdi Kurir',
    ]);
  });
});
