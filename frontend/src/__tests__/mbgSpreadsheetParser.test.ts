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

  it('correctly parses multi-row MBG Rekapitulasi headers and imports secondary Posyandu breakdown table (e.g. CEMPAKA 1)', () => {
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
      // Secondary breakdown table with Posyandu stations
      [null, 'BALITA', null, 'BUMIL/BUSUI', null, null, null, null, null, null, null, null, null, 'Jumlah'],
      ['CEMPAKA 1', 11, 12, 0, 7, null, null, null, null, null, null, null, null, 30],
    ];

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);

    // Must have 4 entries: 3 schools + CEMPAKA 1 (the 3 aggregate lines Balita/Bumil/Busui are replaced by detailed CEMPAKA 1)
    expect(entries).toHaveLength(4);

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

    // CEMPAKA 1 must be accurately parsed as Posyandu
    const cempaka1 = entries.find(e => e.institutionName === 'CEMPAKA 1')!;
    expect(cempaka1).toBeDefined();
    expect(cempaka1.institutionType).toBe('posyandu');
    expect(cempaka1.qtPorsiBalita).toBe(23); // 11 L + 12 P
    expect(cempaka1.qtPorsiKecilL).toBe(11);
    expect(cempaka1.qtPorsiKecilP).toBe(12);
    expect(cempaka1.qtBusui).toBe(7);
    expect(cempaka1.qtBumilBusui).toBe(7);
    expect(cempaka1.jumlah).toBe(30);

    // Generic category summaries must be excluded when detailed breakdown is present
    expect(entries.find(e => e.institutionName.includes('Balita Cempaka'))).toBeUndefined();
    expect(entries.find(e => e.institutionName.includes('Bumil Cempaka'))).toBeUndefined();
    expect(entries.find(e => e.institutionName.includes('Busui Cempaka'))).toBeUndefined();
  });

  it('preserves generic Balita/Bumil/Busui rows when no secondary breakdown table exists', () => {
    const rows: Array<Array<string | number | null>> = [
      ['SEKOLAH', 'REKAPITULASI PENERIMA MANFAAT'],
      [null, 'Porsi Kecil', null, 'Porsi Besar', null, 'TOTAL', null, 'JML', 'GURU', null, 'TENDIK', null, 'JML', 'TOTAL\nKESELURUHAN'],
      [null, 'L', 'P', 'L', 'P', 'L', 'P', null, 'L', 'P', 'L', 'P'],
      ['SPS CEMPAKA', 14, 17, null, null, 14, 17, 31, 0, 5, '', '', 5, 36],
      ['Balita Cempaka ', 213, 192, null, null, 213, 192, 405, null, null, null, null, 0, 405],
      ['Bumil Cempaka ', null, null, null, 28, 0, 28, 28, null, null, null, null, 0, 28],
      ['Busui Cempaka', null, null, null, 94, 0, 94, 94, null, null, null, null, 0, 94],
      ['TOTAL', 227, 209, null, 122, 227, 331, 558, 0, 5, null, null, 5, 563],
    ];

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);
    expect(entries).toHaveLength(4);
    expect(entries.find(e => e.institutionName.includes('Balita Cempaka'))).toBeDefined();
    expect(entries.find(e => e.institutionName.includes('Bumil Cempaka'))).toBeDefined();
    expect(entries.find(e => e.institutionName.includes('Busui Cempaka'))).toBeDefined();
  });

  it('correctly parses full Cempaka 1-13 breakdown matching AUTO REKAP totals', () => {
    const rows: Array<Array<string | number | null>> = [
      ['SEKOLAH', 'REKAPITULASI PENERIMA MANFAAT PERIODE 28 September - 08 Oktober - 2026'],
      [null, 'Porsi Kecil', null, 'Porsi Besar', null, 'TOTAL', null, 'JML', 'GURU', null, 'TENDIK', null, 'JML', 'TOTAL\nKESELURUHAN'],
      [null, 'L', 'P', 'L', 'P', 'L', 'P', null, 'L', 'P', 'L', 'P'],
      ['MTS SAMSUL ULUM 2', null, null, 24, 30, 24, 30, 54, 5, 6, null, 1, 12, 66],
      ['Balita Cempaka', 213, 192, null, null, 213, 192, 405, null, null, null, null, 0, 405],
      ['Bumil Cempaka', null, null, null, 28, 0, 28, 28, null, null, null, null, 0, 28],
      ['Busui Cempaka', null, null, null, 95, 0, 95, 95, null, null, null, null, 0, 95],
      ['TOTAL', 213, 192, 24, 153, 237, 345, 582, 5, 6, null, 1, 12, 594],
      ['', '', '', '', '', '', '', '', '', '', '', '', '', '', 2001, 2247],
      [],
      [],
      [null, 'BALITA', null, 'BUMIL/BUSUI', null, null, null, null, null, null, null, null, null, 'Jumlah'],
      ['CEMPAKA 1', 11, 12, 0, 7, null, null, null, null, null, null, null, null, 30],
      ['CEMPAKA 2', 11, 8, 4, 3, null, null, null, null, null, null, null, null, 26],
      ['CEMPAKA 3', 20, 13, 0, 8, null, null, null, null, null, null, null, null, 41],
      ['CEMPAKA 4', 23, 18, 2, 9, null, null, null, null, null, null, null, null, 52],
      ['CEMPAKA 5', 11, 10, 1, 10, null, null, null, null, null, null, null, null, 32],
      ['CEMPAKA 6', 17, 21, 2, 6, null, null, null, null, null, null, null, null, 46],
      ['CEMPAKA 7', 18, 16, 6, 4, null, null, null, null, null, null, null, null, 44],
      ['CEMPAKA 8', 28, 15, 3, 6, null, null, null, null, null, null, null, null, 52],
      ['CEMPAKA 9', 7, 9, 2, 9, null, null, null, null, null, null, null, null, 27],
      ['CEMPAKA 10', 10, 17, 3, 6, null, null, null, null, null, null, null, null, 36],
      ['CEMPAKA 11', 21, 27, 4, 8, null, null, null, null, null, null, null, null, 60],
      ['CEMPAKA 12', 15, 19, 0, 8, null, null, null, null, null, null, null, null, 42],
      ['CEMPAKA 13', 21, 7, 1, 11, null, null, null, null, null, null, null, null, 40],
      ['TOTAL', 213, 192, 28, 95, null, null, null, null, null, null, null, null, 528],
    ];

    const entries = parsePmRowsToEntries(rows, 'batch-1', 'admin-1', []);
    
    // Exactly 1 school + 13 Posyandu = 14 entries
    expect(entries).toHaveLength(14);
    
    const cempakas = entries.filter(e => e.institutionName.startsWith('CEMPAKA '));
    expect(cempakas).toHaveLength(13);
    
    const posyanduTotal = cempakas.reduce((s, e) => s + e.jumlah, 0);
    expect(posyanduTotal).toBe(528);

    const schoolTotal = entries.filter(e => e.institutionType === 'sekolah').reduce((s, e) => s + e.jumlah, 0);
    expect(schoolTotal).toBe(66);

    expect(schoolTotal + posyanduTotal).toBe(594);
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
