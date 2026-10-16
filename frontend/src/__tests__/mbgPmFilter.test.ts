import { describe, expect, it } from 'vitest';
import type { MbgPmEntry } from '../types/mbg';
import { getAllDetailedPmEntries, getAutoRekapTotals, getPmRekapRow } from '../utils/mbgPmFilter';
import { MBG_OFFICIAL_PM_MASTER, resolveEffectivePmEntries } from '../constants/mbgConstants';

function pmEntry(overrides: Partial<MbgPmEntry>): MbgPmEntry {
  return {
    id: overrides.institutionName || 'entry',
    batchId: 'batch-1',
    institutionName: 'SD Contoh',
    institutionType: 'sekolah',
    qtSiswaBalita: 0,
    qtBumilBusui: 0,
    qtGuruKader: 0,
    qtPobiaNasi: 0,
    jumlah: 0,
    jadwalPengantaran: '06.00-08.30',
    assignedPetugasId: '',
    assignedPetugasName: '',
    menuItems: [],
    menuKeringanItems: [],
    isSekolahLibur: false,
    notes: '',
    sortOrder: 1,
    createdBy: 'admin',
    createdAt: '2026-10-13T00:00:00.000Z',
    updatedAt: '2026-10-13T00:00:00.000Z',
    ...overrides,
  };
}

// Shapes taken from the live 2026-10-13 batch (17 schools + Organoleptik Dapur).
const adminSchoolRows = [
  pmEntry({ institutionName: 'SPS CEMPAKA', qtPorsiKecilL: 14, qtPorsiKecilP: 17, qtGuruP: 3, qtTendikP: 3, qtGuruKader: 6, jumlah: 39 }),
  pmEntry({ institutionName: 'SMK AL-FATHONAH', qtPorsiBesarL: 159, qtPorsiBesarP: 150, qtGuruL: 17, qtGuruP: 15, qtTendikL: 3, qtTendikP: 3, qtGuruKader: 38, jumlah: 349 }),
  pmEntry({ institutionName: 'Organoleptik Dapur', qtGuruKader: 6, jumlah: 6 }),
];

describe('resolveEffectivePmEntries - Produksi MBG shows Admin MBG rows', () => {
  it('keeps the admin rows when the batch does not have exactly 30 institutions', () => {
    const resolved = resolveEffectivePmEntries(adminSchoolRows, 'batch-1');

    expect(resolved.map((e) => e.institutionName)).toEqual(['SPS CEMPAKA', 'SMK AL-FATHONAH', 'Organoleptik Dapur']);
    expect(getAutoRekapTotals(resolved).jumlah).toBe(39 + 349 + 6);
  });

  it('keeps 31 admin rows instead of swapping in the 30-row master', () => {
    const posyanduRows = Array.from({ length: 13 }, (_, i) =>
      pmEntry({ institutionName: `CEMPAKA ${i + 1}`, institutionType: 'posyandu', qtPorsiKecilL: 10, qtPorsiKecilP: 10, qtBumil: 1, qtBusui: 2, qtPorsiBesarL: 1, qtPorsiBesarP: 2, jumlah: 23 })
    );
    const schoolRows = Array.from({ length: 18 }, (_, i) =>
      pmEntry({ institutionName: `SEKOLAH ${i + 1}`, qtPorsiKecilL: 5, qtPorsiKecilP: 5, jumlah: 10 })
    );

    const resolved = resolveEffectivePmEntries([...schoolRows, ...posyanduRows], 'batch-1');

    expect(resolved).toHaveLength(31);
    expect(getAutoRekapTotals(resolved).jumlah).toBe(18 * 10 + 13 * 23);
  });

  it('still falls back to the official master when the batch has no usable rows', () => {
    expect(resolveEffectivePmEntries([], 'batch-1')).toHaveLength(MBG_OFFICIAL_PM_MASTER.length);
    expect(
      resolveEffectivePmEntries([pmEntry({ institutionName: 'SD Tanpa Rincian', qtSiswaBalita: 100, jumlah: 100 })], 'batch-1')
    ).toHaveLength(MBG_OFFICIAL_PM_MASTER.length);
  });
});

describe('getPmRekapRow - Auto Rekap row math', () => {
  it('counts posyandu bumil/busui once, like Admin MBG and the exports', () => {
    // CEMPAKA 9 on 2026-10-16: Porsi Besar mirrors bumil/busui.
    const row = getPmRekapRow(pmEntry({
      institutionName: 'CEMPAKA 9',
      institutionType: 'posyandu',
      qtPorsiKecilL: 7,
      qtPorsiKecilP: 9,
      qtPorsiBesarL: 1,
      qtPorsiBesarP: 9,
      qtBumil: 1,
      qtBusui: 9,
    }));

    expect(row).toMatchObject({ porsiBesarL: 1, porsiBesarP: 9, totalL: 7, totalP: 19, totalSiswa: 26 });
  });

  it('adds Porsi Kecil and Porsi Besar per gender for a school', () => {
    const row = getPmRekapRow(pmEntry({
      institutionName: 'SD QURROTAYAUN',
      qtPorsiKecilL: 86,
      qtPorsiKecilP: 77,
      qtPorsiBesarL: 40,
      qtPorsiBesarP: 32,
      qtGuruL: 5,
      qtGuruP: 17,
      qtTendikL: 1,
      qtTendikP: 1,
    }));

    expect(row).toMatchObject({ totalL: 126, totalP: 109, totalSiswa: 235, totalStaf: 24 });
  });
});

describe('mbgPmFilter - imported PM fidelity', () => {
  it('does not invent an SD class split when the workbook only provides murid and guru', () => {
    const [row] = getAllDetailedPmEntries([{
      id: 'source-1',
      batchId: 'batch-1',
      institutionName: 'SD Contoh',
      institutionType: 'sekolah',
      schoolLevel: 'sd',
      qtSiswaBalita: 100,
      qtBumilBusui: 0,
      qtGuruKader: 5,
      qtPobiaNasi: 0,
      jumlah: 105,
      jadwalPengantaran: '06.30-08.30',
      assignedPetugasId: '',
      assignedPetugasName: '',
      menuItems: [],
      menuKeringanItems: [],
      isSekolahLibur: false,
      notes: '',
      sortOrder: 1,
      createdBy: 'import_excel',
      createdAt: '2026-09-21T00:00:00.000Z',
      updatedAt: '2026-09-21T00:00:00.000Z',
    }]);

    expect(row).toMatchObject({
      porsiKecil: 0,
      porsiBesar: 0,
      totalJumlah: 105,
      rincian: '100 Murid + 5 Guru/Kader',
    });
  });
});
