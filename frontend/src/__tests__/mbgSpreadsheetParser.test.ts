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

  it('correctly parses multi-row MBG Rekapitulasi headers and extracts Porsi Kecil, Porsi Besar, and stops at TOTAL', () => {
    const rows: Array<Array<string | number | null>> = [
      ['SEKOLAH', 'REKAPITULASI PENERIMA MANFAAT PERIODE 31 Agustus - 11 September 2026'],
      [null, 'Porsi Kecil', null, 'Porsi Besar', null, 'TOTAL', null, 'JML', 'GURU', null, 'TENDIK', null, 'JML', 'TOTAL\nKESELURUHAN'],
      [null, 'L', 'P', 'L', 'P', 'L', 'P', null, 'L', 'P', 'L', 'P'],
      ['SPS CEMPAKA', 14, 17, null, null, 14, 17, 31, 0, 5, '', '', 5, 36],
      ['SDN PASIRBADAK', 48, 45, 39, 37, 87, 82, 169, 2, 8, 1, '', 11, 180],
      ['SMP AL - UMANAA', null, null, 148, 130, 148, 130, 278, 33, 23, 22, 10, 88, 366],
      ['Balita Cempaka ', 213, 192, null, null, 213, 192, 405, null, null, null, null, 0, 405],
      ['Bumil Cempaka ', null, null, null, 28, 0, 28, 28, null, null, null, null, 0, 28],
      ['Busui Cempaka', null, null, null, 94, 0, 94, 94, null, null, null, null, 0, 94],
      ['TOTAL', 516, 488, 783, 811, 936, 1299, 2598, 126, 151, 45, 34, 361, 2959],
      // Secondary breakdown table that MUST be ignored
      [null, 'BALITA', null, 'BUMIL/BUSUI', null, null, null, null, null, null, null, null, null, 'Jumlah'],
      ['CEMPAKA 1', 11, 12, 0, 7, null, null, null, null, null, null, null, null, 30],
    ];

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);

    // Must have exactly 6 entries (SPS CEMPAKA, SDN PASIRBADAK, SMP AL - UMANAA, Balita Cempaka, Bumil Cempaka, Busui Cempaka)
    expect(entries).toHaveLength(6);

    // SDN Pasirbadak: 48+45=93 porsi kecil, 39+37=76 porsi besar siswa + 11 guru/tendik = 87 porsi besar, total 180
    const sdn = entries.find(e => e.institutionName === 'SDN PASIRBADAK')!;
    expect(sdn).toBeDefined();
    expect(sdn.institutionType).toBe('sekolah');
    expect(sdn.qtPorsiKecil).toBe(93);
    expect(sdn.qtPorsiBesar).toBe(87);
    expect(sdn.qtSiswaBalita).toBe(169);
    expect(sdn.qtGuruKader).toBe(11);
    expect(sdn.jumlah).toBe(180);

    // SMP Al-Umanaa: 0 porsi kecil, 148+130=278 siswa porsi besar + 88 guru/tendik = 366 porsi besar, total 366
    const smp = entries.find(e => e.institutionName === 'SMP AL - UMANAA')!;
    expect(smp).toBeDefined();
    expect(smp.institutionType).toBe('sekolah');
    expect(smp.qtPorsiKecil).toBe(0);
    expect(smp.qtPorsiBesar).toBe(366);
    expect(smp.qtSiswaBalita).toBe(278);
    expect(smp.qtGuruKader).toBe(88);
    expect(smp.jumlah).toBe(366);

    // Balita Cempaka
    const balita = entries.find(e => e.institutionName.includes('Balita Cempaka'))!;
    expect(balita).toBeDefined();
    expect(balita.institutionType).toBe('posyandu');
    expect(balita.qtPorsiBalita).toBe(405);
    expect(balita.jumlah).toBe(405);

    // Bumil & Busui
    const bumil = entries.find(e => e.institutionName.includes('Bumil Cempaka'))!;
    expect(bumil.institutionType).toBe('posyandu');
    expect(bumil.qtBumilBusui).toBe(28);
    expect(bumil.jumlah).toBe(28);

    const busui = entries.find(e => e.institutionName.includes('Busui Cempaka'))!;
    expect(busui.institutionType).toBe('posyandu');
    expect(busui.qtBumilBusui).toBe(94);
    expect(busui.jumlah).toBe(94);

    // CEMPAKA 1 must NOT be imported as a school or duplicate
    expect(entries.find(e => e.institutionName === 'CEMPAKA 1')).toBeUndefined();

    // Sum of all entries must match the TOTAL row exactly
    const sum = entries.reduce((acc, e) => acc + e.jumlah, 0);
    expect(sum).toBe(36 + 180 + 366 + 405 + 28 + 94);
  });

  it('correctly parses sheet 3B Posyandu table layout', () => {
    const rows: Array<Array<string | number | null>> = [
      ['POSYANDU \nCEMPAKA', 'DATA BALITA DAN BUMIL DESA KEBONMANGGU\nPeriode 14 September - 25 September'],
      [null, 'BALITA \nNon PAUD', 'J KELAMIN', null, 'POBIA NASI', null, 'BUMIL', 'BUSUI', 'KADER', 'JUMLAH'],
      [null, null, 'L', 'P', 'Balita', 'Bumil', null, null, null, null],
      [1, 23, 11, 12, null, null, 0, 7, 2, 32],
      [2, 19, 11, 8, null, null, 4, 3, 2, 28],
      ['TOTAL', 405, 213, 192, null, null, 27, 94, 26, 552],
    ];

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);
    expect(entries).toHaveLength(2);
    expect(entries[0].institutionName).toBe('Posyandu Cempaka 1');
    expect(entries[0].institutionType).toBe('posyandu');
    expect(entries[0].qtSiswaBalita).toBe(23);
    expect(entries[0].qtBumil).toBe(0);
    expect(entries[0].qtBusui).toBe(7);
    expect(entries[0].qtGuruKader).toBe(2);
    expect(entries[0].jumlah).toBe(32);

    expect(entries[1].institutionName).toBe('Posyandu Cempaka 2');
    expect(entries[1].jumlah).toBe(28);
  });
});
