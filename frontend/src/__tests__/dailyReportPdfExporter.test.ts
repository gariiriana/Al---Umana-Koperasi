import { describe, expect, it } from 'vitest';
import type { MbgPmEntry } from '../types/mbg';
import { buildRekapPmRows } from '../utils/dailyReportPdfExporter';

const entry = (overrides: Partial<MbgPmEntry>): MbgPmEntry => ({
  id: 'entry', batchId: 'batch-1', institutionName: 'SD Contoh', institutionType: 'sekolah', schoolLevel: 'sd',
  qtSiswaBalita: 0, qtBumilBusui: 0, qtGuruKader: 0, qtPobiaNasi: 0, jumlah: 0,
  jadwalPengantaran: '06.30-08.30', assignedPetugasId: '', assignedPetugasName: '', menuItems: [], menuKeringanItems: [],
  isSekolahLibur: false, notes: '', sortOrder: 1, createdBy: 'import_excel', createdAt: '', updatedAt: '',
  ...overrides,
});

describe('dailyReportPdfExporter - PM totals', () => {
  it('uses the same class-name deduplication and imported total as the website', () => {
    const rows = buildRekapPmRows([
      entry({ id: 'kelas-13', institutionName: 'SD Contoh Kelas 1-3', qtSiswaBalita: 90, qtGuruKader: 3, jumlah: 93 }),
      entry({ id: 'kelas-46', institutionName: 'SD Contoh Kelas 4-6', qtSiswaBalita: 80, qtGuruKader: 7, jumlah: 87 }),
      entry({ id: 'balita', institutionName: 'Balita Posyandu Contoh', institutionType: 'posyandu', schoolLevel: undefined, qtSiswaBalita: 405, qtPorsiBalita: 405, jumlah: 405 }),
    ]);

    expect(rows).toHaveLength(2);
    expect(rows.map((row) => row.totalAkhir)).toEqual([93, 405]);
    expect(rows.reduce((sum, row) => sum + row.totalAkhir, 0)).toBe(498);
  });
});
