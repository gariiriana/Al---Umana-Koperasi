import { describe, expect, it } from 'vitest';
import {
  MENU_BELUM_DIISI,
  buildDokumentasi,
  buildLaporanModel,
  buildMenuBlocks,
  buildMenuDay,
  buildPenerimaManfaat,
  cleanMenuItem,
  formatHariTanggal,
  laporanFileName,
  laporanWarnings,
  mondayOf,
  periodHeader,
  periodRange,
  pickBatch,
  reportDates,
  type LaporanDayData,
  type LaporanEntry,
} from '@/lib/laporan2Minggu';

const sch = (
  institutionName: string,
  qtSiswaBalita: number,
  qtGuruKader: number,
  [qtPorsiKecilL, qtPorsiKecilP, qtPorsiBesarL, qtPorsiBesarP]: number[],
  [qtGuruL, qtGuruP, qtTendikL, qtTendikP]: number[],
): LaporanEntry => ({
  institutionName, institutionType: 'sekolah', qtSiswaBalita, qtGuruKader, jumlah: qtSiswaBalita + qtGuruKader + 2,
  qtPorsiKecilL, qtPorsiKecilP, qtPorsiBesarL, qtPorsiBesarP, qtGuruL, qtGuruP, qtTendikL, qtTendikP,
});
const pos = (institutionName: string, balita: number, l: number, p: number, qtBumil: number, qtBusui: number): LaporanEntry => ({
  institutionName, institutionType: 'posyandu', qtSiswaBalita: balita, qtPorsiKecilL: l, qtPorsiKecilP: p,
  qtBumil, qtBusui, qtBumilBusui: qtBumil + qtBusui, qtGuruKader: 0, jumlah: balita + qtBumil + qtBusui + 1,
});

// Batch asli admin MBG Senin 9 November 2026 (urutan dan angka seperti di Firestore).
const NOV_9: LaporanEntry[] = [
  sch('SPS CEMPAKA', 31, 6, [14, 17, 0, 0], [0, 3, 0, 3]),
  sch('SPS CEMPAKA 10', 53, 8, [27, 26, 0, 0], [0, 8, 0, 0]),
  sch('TK PADARAANG', 17, 3, [11, 6, 0, 0], [3, 0, 0, 0]),
  sch('TK AL-MUJAHID', 54, 7, [27, 27, 0, 0], [0, 6, 1, 0]),
  sch('SDN PASIRBADAK', 173, 11, [49, 46, 41, 37], [2, 8, 1, 0]),
  sch('SDN PADARAANG', 220, 10, [58, 49, 59, 54], [2, 8, 0, 0]),
  sch('SD ISLAM MASAGI', 61, 7, [7, 23, 15, 16], [1, 5, 0, 1]),
  sch('SMP AL - UMANAA', 277, 7, [0, 0, 147, 130], [3, 2, 1, 1]),
  sch('SMP ISLAM MASAGI', 169, 13, [0, 0, 104, 65], [8, 4, 1, 0]),
  sch('MTS AL-MUJAHID', 73, 10, [0, 0, 40, 33], [6, 4, 0, 0]),
  sch("MA SAMSUL MA'ARIF", 44, 6, [0, 0, 22, 22], [3, 3, 0, 0]),
  sch('SMA AL UMANAA', 180, 12, [0, 0, 101, 79], [5, 4, 2, 1]),
  sch('MTS SAMSUL ULUM 2', 54, 12, [0, 0, 24, 30], [5, 6, 0, 1]),
  sch('MA NURUL AZIZ', 61, 12, [0, 0, 33, 28], [2, 7, 1, 2]),
  sch('SMK AL-FATHONAH', 309, 38, [0, 0, 159, 150], [17, 15, 3, 3]),
  sch('TK QURROTAYAUN', 51, 6, [24, 27, 0, 0], [0, 4, 0, 2]),
  sch('SD QURROTAYAUN', 235, 24, [86, 77, 40, 32], [5, 17, 1, 1]),
  sch('Organoleptik Dapur', 0, 6, [0, 0, 0, 0], [0, 0, 0, 0]),
  pos('CEMPAKA 1', 21, 10, 11, 0, 8),
  pos('CEMPAKA 2', 19, 11, 8, 4, 3),
  pos('CEMPAKA 3', 34, 21, 13, 0, 8),
  pos('CEMPAKA 4', 41, 22, 19, 3, 8),
  pos('CEMPAKA 5', 24, 13, 11, 1, 7),
  pos('CEMPAKA 6', 36, 17, 19, 0, 8),
  pos('CEMPAKA 7', 33, 17, 16, 5, 5),
  pos('CEMPAKA 8', 43, 28, 15, 2, 8),
  pos('CEMPAKA 9', 17, 7, 10, 1, 10),
  pos('CEMPAKA 10', 28, 10, 18, 2, 6),
  pos('CEMPAKA 11', 48, 21, 27, 4, 8),
  pos('CEMPAKA 12', 35, 15, 20, 0, 8),
  pos('CEMPAKA 13', 31, 22, 9, 1, 8),
];

// Nama hidangan per porsi dari Arsip Gizi (Produksi MBG), sama seperti di Firestore.
const MENU_9 = {
  kecil: ['Nasi Liwet (Beras Putih (Premium))', 'Telur Ceplok', 'Kering Tempe', 'Buncis Kukus', 'Jeruk Medan D Polos'],
  besar: ['Nasi Liwet (Beras Putih (Premium))', 'Telur Ceplok Bumbu Rica', 'Kering Tempe', 'Buncis Kukus', 'Jeruk Medan D Polos'],
  balita: ['Nasi Liwet (Beras Putih (Premium))', 'Telur Ceplok', 'Kering Tempe', 'Buncis Kukus', 'Jeruk Medan D Polos'],
  bumilBusui: ['Nasi Liwet (Beras Putih (Premium))', 'Telur Ceplok Bumbu Rica', 'Kering Tempe', 'Buncis Kukus', 'Jeruk Medan D Polos'],
};
const MENU_12 = {
  kecil: ['Nasi Putih (Beras Putih (Premium))', 'Tongseng Ayam (Uk Rata)', 'Tahu Goreng Kecil', 'Tumis Kol Wortel', 'Pisang Ambon'],
  besar: ['Nasi Putih (Beras Putih (Premium))', 'Tongseng Ayam (Uk Rata)', 'Tahu Goreng Besar', 'Tumis Kol Wortel', 'Pisang Ambon'],
  balita: ['Nasi Putih (Beras Putih (Premium))', 'Tongseng Ayam (Uk Rata)', 'Tahu Goreng Kecil', 'Tumis Kol Wortel', 'Pisang Ambon'],
  bumilBusui: ['Nasi Putih (Beras Putih (Premium))', 'Tongseng Ayam (Uk Rata)', 'Tahu Goreng Besar', 'Tumis Kol Wortel', 'Pisang Ambon'],
};
const MENU_18 = {
  kecil: ['Nasi Putih (Beras Putih (Premium))', 'Ayam Woku Kuning (Uk Rata)', 'Tahu Goreng Kecil', 'Tumis Kangkung', 'Anggur China'],
  besar: ['Nasi Putih (Beras Putih (Premium))', 'Ayam Woku Kuning (Uk Rata)', 'Tahu Goreng Besar', 'Tumis Kangkung', 'Anggur China'],
  balita: ['Nasi Putih (Beras Putih (Premium))', 'Ayam Woku Kuning (Uk Rata)', 'Tahu Goreng Kecil', 'Labu Siam Kukus', 'Anggur China'],
  bumilBusui: ['Nasi Putih (Beras Putih (Premium))', 'Ayam Woku Kuning (Uk Rata)', 'Tahu Goreng Besar', 'Labu Siam Kukus', 'Anggur China'],
};

const day = (tanggal: string, entries: LaporanEntry[] = NOV_9, menus: LaporanDayData['menus'] = MENU_9): LaporanDayData => ({
  tanggal, batchId: `b-${tanggal}`, entries, menus,
});

describe('tanggal', () => {
  it('menggeser tanggal ke Senin dan membuat 10 hari kerja', () => {
    expect(mondayOf('2026-11-12')).toBe('2026-11-09');
    expect(mondayOf('2026-11-15')).toBe('2026-11-09'); // Minggu ikut minggu sebelumnya
    expect(reportDates('2026-11-09')).toEqual([
      '2026-11-09', '2026-11-10', '2026-11-11', '2026-11-12', '2026-11-13',
      '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20',
    ]);
  });

  it('menulis periode seperti di Word', () => {
    expect(periodHeader(reportDates('2026-11-09'))).toBe('09 November s/d 20 November 2026');
    expect(periodRange(reportDates('2026-11-09'))).toBe('09 November - 20 November 2026');
    expect(periodHeader(reportDates('2026-12-28'))).toBe('28 Desember 2026 s/d 08 Januari 2027');
    expect(formatHariTanggal('2026-11-13')).toBe("Jum'at, 13 November 2026");
  });
});

describe('pickBatch', () => {
  it('mengabaikan backup dan memilih batch paling penuh', () => {
    expect(pickBatch([])).toBeNull();
    expect(pickBatch([{ id: 'a', totalJumlah: 0 }, { id: 'b', totalJumlah: 2835 }, { id: 'c', totalJumlah: 2958, isBackup: true }])?.id).toBe('b');
  });
});

describe('1). Penerima Manfaat dari hari pertama', () => {
  const p = buildPenerimaManfaat(day('2026-11-09'));

  it('Peserta Didik: urutan + nama + kelas dari Word, jumlah siswa dari admin MBG', () => {
    expect(p.pesertaDidik.map((r) => r.nama)).toEqual([
      'TK IT Qurrotaayun', 'TK Al – Mujahid', 'TK Padaraang', 'SPS Cempaka', 'SPS Cempaka 10', 'SDN Pasirbadak',
      'SD Islam Masagi', 'SD IT Qurrotaayun', 'SDN Padaraang', 'SMP Islam Masagi', 'SMP Al – Umanaa', 'MTs Al – Mujahid',
      'Mts Samsul Ulum II', 'SMK Al – Fathonah', 'SMA Al - Umanaa', 'MA Syamsul Ma’arif', 'MA Nurul Aziz',
    ]);
    expect(p.pesertaDidik[0]).toEqual({
      no: 1, nama: 'TK IT Qurrotaayun', alamat: 'Jl. Pelabuhan ii km.12,5', jumlah: 51,
      kelas: [{ kelas: 'A', l: 12, p: 10 }, { kelas: 'B', l: 13, p: 16 }],
    });
    expect(p.pesertaDidik[7]).toMatchObject({ nama: 'SD IT Qurrotaayun', jumlah: 235 });
    expect(p.pesertaDidik[7].kelas.map((k) => k.kelas)).toEqual(['I', 'II', 'III', 'IV', 'V', 'VI']);
  });

  it('PTK: jumlah dan L/P (guru + tendik) dari admin MBG', () => {
    expect(p.ptk[0]).toEqual({ no: 1, nama: 'TK IT Qurrotaayun', kecamatan: 'Kec. Gunungguruh', alamat: 'Jl. Pelabuhan ii km.12,5', jumlah: 6, l: 0, p: 6 });
    expect(p.ptk.find((r) => r.nama === 'SMK Al – Fathonah')).toMatchObject({ jumlah: 38, l: 20, p: 18 });
    expect(p.ptk.find((r) => r.nama === 'SD IT Qurrotaayun')).toMatchObject({ jumlah: 24, l: 6, p: 18 });
  });

  it('Non Peserta Didik: Cempaka 1-13 dengan alamat Word, bumil/busui/balita L-P dari admin MBG', () => {
    expect(p.posyandu).toHaveLength(13);
    expect(p.posyandu[0]).toEqual({ no: 1, nama: 'Posyandu Cempaka 1', alamat: 'Kp. Kebonmanggu RT 001/001', bumil: 0, busui: 8, l: 10, p: 11, total: 29 });
    expect(p.posyandu[3]).toMatchObject({ nama: 'Posyandu Cempaka 4', bumil: 3, busui: 8, l: 22, p: 19, total: 52 });
  });

  it('sekolah yang tidak ada di data hari itu ditulis "-", sekolah baru ditambah di bawah', () => {
    const entries = NOV_9.filter((e) => e.institutionName !== 'TK PADARAANG').concat(sch('SD BARU', 40, 3, [10, 12, 9, 9], [1, 2, 0, 0]));
    const q = buildPenerimaManfaat(day('2026-11-09', entries));
    expect(q.pesertaDidik[2]).toMatchObject({ nama: 'TK Padaraang', jumlah: null });
    expect(q.ptk[2]).toMatchObject({ nama: 'TK Padaraang', jumlah: null, l: null, p: null });
    expect(q.pesertaDidik[17]).toMatchObject({ no: 18, nama: 'SD BARU', jumlah: 40, kelas: [{ kelas: '-', l: 19, p: 21 }] });
    expect(q.ptk[17]).toMatchObject({ nama: 'SD BARU', jumlah: 3, l: 1, p: 2 });
  });

  it('L/P PTK kosong bila admin MBG belum mengisi rinciannya', () => {
    const q = buildPenerimaManfaat(day('2026-11-09', [{ institutionName: 'TK PADARAANG', institutionType: 'sekolah', qtSiswaBalita: 17, qtGuruKader: 3 }]));
    expect(q.ptk[2]).toMatchObject({ jumlah: 3, l: null, p: null });
  });
});

describe('2). Jenis Menu MBG', () => {
  it('jumlah penerima = siswa + guru (sekolah) atau balita + bumil + busui (posyandu), tanpa Organoleptik', () => {
    const m = buildMenuDay(day('2026-11-09'));
    expect(m.hariTanggal).toBe('Senin, 09 November 2026');
    expect(m.sekolah[0]).toEqual({ nama: 'TK IT Qurrotaayun', jumlah: 57 });
    expect(m.sekolah).toHaveLength(17);
    expect(m.posyandu[0]).toEqual({ nama: 'Posyandu Cempaka 1', jumlah: 29 });
    expect(m.posyandu).toHaveLength(13);
    const total = [...m.sekolah, ...m.posyandu].reduce((s, r) => s + r.jumlah, 0);
    expect(total).toBe(2782); // sama dengan Word
  });

  it('sekolah libur tidak ditulis', () => {
    const entries = NOV_9.map((e) => (e.institutionName === 'SMK AL-FATHONAH' ? { ...e, isSekolahLibur: true } : e));
    expect(buildMenuDay(day('2026-11-09', entries)).sekolah.map((r) => r.nama)).not.toContain('SMK Al – Fathonah');
  });

  it('membersihkan nama hidangan', () => {
    expect(cleanMenuItem('Nasi Liwet (Beras Putih (Premium))')).toBe('Nasi Liwet');
    expect(cleanMenuItem('Ayam Serundeng (Uk Rata)')).toBe('Ayam Serundeng');
    expect(cleanMenuItem('Tahu Goreng Kecil')).toBe('Tahu Goreng');
    expect(cleanMenuItem('Tempe Goreng - Ummisari')).toBe('Tempe Goreng');
  });

  it('9 Nov: porsi kecil + balita satu blok, porsi besar + bumil/busui satu blok (seperti Word)', () => {
    expect(buildMenuBlocks(MENU_9)).toEqual([
      { label: 'Balita, TK, SD Kelas 1-3', items: ['Nasi Liwet', 'Telur Ceplok', 'Kering Tempe', 'Buncis Kukus', 'Jeruk'] },
      { label: 'SD Kelas 4-6, SMP, SMA, Bumil/Busui', items: ['Nasi Liwet', 'Telur Ceplok Bumbu Rica', 'Kering Tempe', 'Buncis Kukus', 'Jeruk'] },
    ]);
  });

  it('12 Nov: hanya beda ukuran (Tahu Goreng Kecil/Besar) jadi satu blok untuk semua', () => {
    expect(buildMenuBlocks(MENU_12)).toEqual([
      { label: 'Balita, TK, SD Kelas 1-6, SMP, SMA, Bumil/Busui', items: ['Nasi Putih', 'Tongseng Ayam', 'Tahu Goreng', 'Tumis Kol Wortel', 'Pisang'] },
    ]);
  });

  it('18 Nov: sekolah satu blok, balita + bumil/busui blok kedua (seperti Word)', () => {
    expect(buildMenuBlocks(MENU_18)).toEqual([
      { label: 'TK, SD Kelas 1-6, SMP, SMA', items: ['Nasi Putih', 'Ayam Woku Kuning', 'Tahu Goreng', 'Tumis Kangkung', 'Anggur'] },
      { label: 'Balita, Bumil/Busui', items: ['Nasi Putih', 'Ayam Woku Kuning', 'Tahu Goreng', 'Labu Siam Kukus', 'Anggur'] },
    ]);
  });

  it('buah hanya dipendekkan kalau hidangan terakhir', () => {
    expect(buildMenuBlocks({ besar: ['Nasi Putih', 'Pisang Goreng Keju', 'Buah Naga Merah'] })[0].items).toEqual(['Nasi Putih', 'Pisang Goreng Keju', 'Buah Naga']);
  });

  it('tanpa menu Produksi: blok kosong (ditandai di laporan)', () => {
    expect(buildMenuBlocks(null)).toEqual([]);
    expect(buildMenuDay(day('2026-11-10', NOV_9, null)).menu).toEqual([]);
    expect(MENU_BELUM_DIISI).toMatch(/BELUM DIISI/);
  });
});

describe('4). Dokumentasi', () => {
  it('per tanggal lalu per bagian dengan urutan tetap, nomor foto berurutan per tanggal', () => {
    const docs = buildDokumentasi(['2026-11-09', '2026-11-10', '2026-11-11'], [
      { tanggal: '2026-11-09', section: 'penerima', url: 'p1', order: 1 },
      { tanggal: '2026-11-09', section: 'persiapan', url: 'a2', order: 3 },
      { tanggal: '2026-11-09', section: 'persiapan', url: 'a1', order: 2 },
      { tanggal: '2026-11-11', section: 'menu', url: 'm1', order: 1 },
    ]);
    expect(docs.map((d) => d.tanggal)).toEqual(['2026-11-09', '2026-11-11']);
    expect(docs[0].sections).toEqual([
      { key: 'persiapan', label: 'Persiapan', photos: [{ url: 'a1', caption: 'Foto 1 – Persiapan' }, { url: 'a2', caption: 'Foto 2 – Persiapan' }] },
      { key: 'penerima', label: 'Penerima Manfaat', photos: [{ url: 'p1', caption: 'Foto 3 – Penerima Manfaat' }] },
    ]);
  });
});

describe('laporan lengkap', () => {
  const dates = reportDates('2026-11-09');

  it('Penerima Manfaat dari hari pertama, menu 1 tabel per hari yang ada datanya', () => {
    const days = dates.map((d, i) => (i === 3 ? { tanggal: d, batchId: null, entries: [], menus: null } : day(d, NOV_9, i === 1 ? null : MENU_9)));
    const model = buildLaporanModel(days, []);
    expect(model.periodHeader).toBe('09 November s/d 20 November 2026');
    expect(model.penerima?.tanggal).toBe('2026-11-09');
    expect(model.menuDays.map((m) => m.tanggal)).toHaveLength(9);
    expect(model.menuDays[1].menu).toEqual([]);
    expect(model.tim).toHaveLength(49);
    expect(model.warnings.map((w) => [w.tanggal, w.kind])).toEqual([
      ['2026-11-10', 'tanpa-menu'],
      ['2026-11-12', 'tanpa-data'],
    ]);
    expect(laporanFileName(model, 'docx')).toBe('Laporan MBG 09 November - 20 November 2026.docx');
  });

  it('Senin tanpa data: pakai hari berikutnya yang ada datanya + peringatan', () => {
    const days = dates.map((d, i) => (i === 0 ? { tanggal: d, batchId: null, entries: [], menus: null } : day(d)));
    const model = buildLaporanModel(days, []);
    expect(model.penerima?.tanggal).toBe('2026-11-10');
    expect(laporanWarnings(days)[0]).toMatchObject({ kind: 'hari-pertama-kosong' });
  });
});
