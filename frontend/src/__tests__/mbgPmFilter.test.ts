import { describe, expect, it } from 'vitest';
import { getAllDetailedPmEntries } from '../utils/mbgPmFilter';

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
