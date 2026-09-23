import { describe, expect, it } from 'vitest';
import { parsePmRowsToEntries } from '../utils/mbgSpreadsheetParser';

describe('mbgSpreadsheetParser', () => {
  it('finds a PM table below report titles and preserves its named columns', () => {
    const rows: Array<Array<string | number>> = [
      ['LAPORAN HARIAN MBG'],
      ['Kecamatan Contoh'],
      ['Tanggal', '23 September 2026'],
    ];

    // Real report workbooks commonly put the PM table well below the title.
    while (rows.length < 16) rows.push([]);
    rows.push(['No', 'Nama Sekolah', 'Murid', 'Guru', 'Total', '', '', '', 'Catatan']);
    rows.push([1, 'SD Al-Umana', 120, 8, 128, '', '', '', 'tetap terbaca walau sheet lebar']);
    rows.push([2, 'SMP Al-Umana', 90, 6, 0]);
    rows.push(['', 'TOTAL', 210, 14, 224]);

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);

    expect(entries).toHaveLength(2);
    expect(entries[0]).toMatchObject({
      institutionName: 'SD Al-Umana',
      qtSiswaBalita: 120,
      qtGuruKader: 8,
      qtPorsiKecil: 0,
      qtPorsiBesar: 0,
      jumlah: 128,
    });
    // A zero total in the source must not be replaced by a calculated value.
    expect(entries[1]).toMatchObject({ institutionName: 'SMP Al-Umana', jumlah: 0, isSekolahLibur: true });
  });

  it('keeps separate valid rows even when they share an institution name', () => {
    const entries = parsePmRowsToEntries([
      ['No', 'Sekolah', 'Murid', 'Guru', 'Total'],
      [1, 'Cempaka 8', 12, 0, 12],
      [2, 'Cempaka 8', 28, 0, 28],
    ], 'batch-1', 'admin-1', []);

    expect(entries).toHaveLength(2);
    expect(entries.map((entry) => entry.jumlah)).toEqual([12, 28]);
    expect(entries.reduce((total, entry) => total + entry.jumlah, 0)).toBe(40);
  });
});
