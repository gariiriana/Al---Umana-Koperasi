import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parsePenerimaManfaatSheet, parseProductionSheetRows } from '../utils/productionSheetParser';

describe('productionSheetParser - Dynamic Menu & Fruit Parsing', () => {
  it('correctly detects fruit as "Jeruk" and does not overwrite it with "Nasi"', () => {
    // Construct mock sheet rows simulating an imported daily production sheet
    const rows: unknown[][] = [];

    // Rows 0-4: PM counts
    rows[0] = ['PM KECIL', 500, 500];
    rows[1] = ['PM BESAR', 600, 600];
    rows[2] = ['PM BALITA', 50, 50];
    rows[3] = ['PM BUMIL', 20, 20];
    rows[4] = ['', '', ''];

    // Rows 5-9: Column A menu summary with categories
    rows[5] = ['Karbohidrat : Nasi Putih'];
    rows[6] = ['Protein Hewani : Ayam Crispy'];
    rows[7] = ['Protein Nabati : Tempe Goreng'];
    rows[8] = ['Sayur : Sayur Sop'];
    rows[9] = ['Buah : Jeruk'];

    // Row 1: Headers for Gizi table (Cols 4..12: E..M)
    // E=4 (Section/Jenis Menu), F=5 (Menu), G=6 (Rincian Bahan), H=7 (Berat), I=8 (Energi), J=9 (Protein), K=10 (Lemak), L=11 (Karbo), M=12 (Serat)
    const headerRow: unknown[] = [];
    headerRow[4] = 'PORSI KECIL';
    headerRow[5] = 'Menu';
    headerRow[6] = 'Rincian Bahan';
    headerRow[7] = 'Berat Bersih';
    headerRow[8] = 'Energi';
    headerRow[9] = 'Protein';
    headerRow[10] = 'Lemak';
    headerRow[11] = 'Karbohidrat';
    headerRow[12] = 'Serat';
    rows[2] = headerRow;

    // Row 3: Karbohidrat - Nasi Putih
    const r3: unknown[] = [];
    r3[4] = 'Karbohidrat';
    r3[5] = 'Nasi Putih';
    r3[6] = 'Beras Giling';
    r3[7] = 100;
    r3[8] = 360;
    r3[9] = 6.8;
    r3[10] = 0.7;
    r3[11] = 78.9;
    r3[12] = 0.2;
    rows[3] = r3;

    // Row 4: Protein Hewani - Ayam Crispy
    const r4: unknown[] = [];
    r4[4] = 'Protein Hewani';
    r4[5] = 'Ayam Crispy';
    r4[6] = 'Daging Ayam';
    r4[7] = 50;
    r4[8] = 150;
    r4[9] = 18;
    r4[10] = 7.5;
    r4[11] = 2;
    r4[12] = 0;
    rows[4] = r4;

    // Row 5: Sayur - Sayur Sop (ingredient 1: Wortel)
    const r5: unknown[] = [];
    r5[4] = 'Sayur';
    r5[5] = 'Sayur Sop';
    r5[6] = 'Wortel';
    r5[7] = 30;
    r5[8] = 12;
    r5[9] = 0.3;
    r5[10] = 0.1;
    r5[11] = 2.4;
    r5[12] = 1.0;
    rows[5] = r5;

    // Row 6: Sayur - (merged/blank in Col F, ingredient 2: Kol)
    const r6: unknown[] = [];
    r6[4] = '';
    r6[5] = '';
    r6[6] = 'Kol';
    r6[7] = 20;
    r6[8] = 8;
    r6[9] = 0.4;
    r6[10] = 0.1;
    r6[11] = 1.6;
    r6[12] = 0.8;
    rows[6] = r6;

    // Row 7: Buah - Jeruk (Menu: Jeruk, Rincian: Jeruk)
    const r7: unknown[] = [];
    r7[4] = 'Buah';
    r7[5] = 'Jeruk';
    r7[6] = 'Jeruk';
    r7[7] = 100;
    r7[8] = 47;
    r7[9] = 0.9;
    r7[10] = 0.1;
    r7[11] = 11.8;
    r7[12] = 2.4;
    rows[7] = r7;

    // Row 8: Total Porsi Kecil
    const rTotal: unknown[] = [];
    rTotal[4] = 'TOTAL';
    rows[8] = rTotal;

    const report = parseProductionSheetRows(rows, 'batch-1', '2026-11-27', 'HARI 1');

    expect(report).toBeDefined();
    expect(report.porsiKecil).toBeDefined();
    const gizi = report.porsiKecil.nutritionItems;
    expect(gizi.length).toBe(5);

    // 1. Nasi Putih
    expect(gizi[0].menuName).toBe('Nasi Putih');
    expect(gizi[0].rincianBahan).toBe('Beras Giling');

    // 2. Ayam Crispy
    expect(gizi[1].menuName).toBe('Ayam Crispy');
    expect(gizi[1].rincianBahan).toBe('Daging Ayam');

    // 3. Sayur Sop (Wortel)
    expect(gizi[2].menuName).toBe('Sayur Sop');
    expect(gizi[2].rincianBahan).toBe('Wortel');

    // 4. Sayur Sop (Kol - inherited from merged dish)
    expect(gizi[3].menuName).toBe('Sayur Sop');
    expect(gizi[3].rincianBahan).toBe('Kol');

    // 5. Buah - JERUK: MUST BE 'Jeruk', NEVER 'Nasi Putih' or 'Sayur Sop'
    expect(gizi[4].menuName).toBe('Jeruk');
    expect(gizi[4].rincianBahan).toBe('Jeruk');
    expect(gizi[4].jenisMenu).toBe('Buah');
  });

  it('correctly handles different fruits like Pisang Ambon when Col F is empty', () => {
    const rows: unknown[][] = [];
    rows[0] = ['PM KECIL', 300];
    rows[1] = ['PM BESAR', 300];

    const headerRow: unknown[] = [];
    headerRow[4] = 'PORSI KECIL';
    headerRow[5] = 'Menu';
    headerRow[6] = 'Rincian Bahan';
    rows[2] = headerRow;

    // Row 3: Karbohidrat - Kentang Rebus
    const r3: unknown[] = [];
    r3[4] = 'Karbohidrat';
    r3[5] = 'Kentang Rebus';
    r3[6] = 'Kentang';
    rows[3] = r3;

    // Row 4: Buah - Col F is blank, Col G has Pisang Ambon
    const r4: unknown[] = [];
    r4[4] = 'Buah';
    r4[5] = '';
    r4[6] = 'Pisang Ambon';
    rows[4] = r4;

    const rTotal: unknown[] = [];
    rTotal[4] = 'TOTAL';
    rows[5] = rTotal;

    // Pad rows so rows.length >= 10
    for (let i = 6; i < 12; i++) {
      rows[i] = [];
    }

    const report = parseProductionSheetRows(rows, 'batch-2', '2026-11-28', 'HARI 2');
    const gizi = report.porsiKecil.nutritionItems;

    expect(gizi.length).toBe(2);
    expect(gizi[0].menuName).toBe('Kentang Rebus');
    // Fruit row must use the ingredient name "Pisang Ambon" and NOT leak "Kentang Rebus"
    expect(gizi[1].menuName).toBe('Pisang Ambon');
    expect(gizi[1].rincianBahan).toBe('Pisang Ambon');
    expect(gizi[1].jenisMenu).toBe('Buah');
  });

  it('correctly parses Porsi Besar with Semangka and custom supplier from Excel', () => {
    const rows: unknown[][] = [];
    rows[0] = ['PM KECIL', 200];
    rows[1] = ['PM BESAR', 400];

    // Block 1: Porsi Kecil
    rows[2] = ['', '', '', '', 'PORSI KECIL', 'Menu', 'Rincian Bahan'];
    rows[3] = ['', '', '', '', 'Karbohidrat', 'Nasi', 'Beras'];
    rows[4] = ['', '', '', '', 'TOTAL'];

    // Block 2: Porsi Besar
    rows[5] = ['', '', '', '', 'PORSI BESAR', 'Menu', 'Rincian Bahan'];
    rows[6] = ['', '', '', '', 'Karbohidrat', 'Nasi Merah', 'Beras Merah'];
    rows[7] = ['', '', '', '', 'Protein Hewani', 'Ikan Tongkol Balado', 'Ikan Tongkol'];
    rows[8] = ['', '', '', '', 'Buah', 'Semangka Merah', 'Semangka Merah'];
    rows[9] = ['', '', '', '', 'TOTAL'];

    // Dedicated Supplier Table
    rows[0][10] = 'Supplier';
    rows[0][11] = 'List Pesanan Bahan';
    rows[0][13] = 'Jumlah';
    rows[0][14] = 'Satuan';
    rows[0][17] = 'Total Harga';

    rows[1][10] = 'Toko Buah Berkah Abadi';
    rows[1][11] = 'Semangka Merah';
    rows[1][13] = 50;
    rows[1][14] = 'kg';
    rows[1][17] = 500000;

    for (let i = 10; i < 15; i++) {
      rows[i] = [];
    }

    const report = parseProductionSheetRows(rows, 'batch-3', '2026-11-29', 'HARI 3');
    expect(report.porsiBesar).toBeDefined();
    const besarGizi = report.porsiBesar.nutritionItems;
    expect(besarGizi.length).toBe(3);
    expect(besarGizi[0].menuName).toBe('Nasi Merah');
    expect(besarGizi[1].menuName).toBe('Ikan Tongkol Balado');
    expect(besarGizi[2].menuName).toBe('Semangka Merah');
    expect(besarGizi[2].jenisMenu).toBe('Buah');

    // Supplier verification: must be read directly as 'Toko Buah Berkah Abadi'
    expect(report.poRows).toBeDefined();
    expect(report.poRows.length).toBeGreaterThan(0);
    const semangkaPo = report.poRows.find((p) => p.item === 'Semangka Merah');
    expect(semangkaPo).toBeDefined();
    expect(semangkaPo?.supplier).toBe('Toko Buah Berkah Abadi');
    expect(semangkaPo?.totalHarga).toBe(500000);
    expect(semangkaPo?.hargaSatuan).toBe(0); // Harga satuan not detected, as requested
  });
});

describe('productionSheetParser - Penerima Manfaat import fidelity', () => {
  it('imports every institution and preserves zero values in the selected week', () => {
    const rows: unknown[][] = [
      ['No', 'Nama', 'Pekan 1', '', '', 'Pekan 2'],
      ['', '', 'Murid', 'Guru', 'Total', 'Murid', 'Guru', 'Total'],
    ];
    for (let index = 1; index <= 40; index += 1) {
      rows.push([index, `SD Contoh ${index}`, 100, 5, 105, 0, 0, 0]);
    }
    const sheet = XLSX.utils.aoa_to_sheet(rows);

    const weekTwo = parsePenerimaManfaatSheet(sheet, 'batch-1', 2);

    expect(weekTwo).toHaveLength(40);
    expect(weekTwo[0]).toMatchObject({
      institutionName: 'SD Contoh 1',
      qtSiswaBalita: 0,
      qtGuruKader: 0,
      jumlah: 0,
      isSekolahLibur: true,
    });
    expect(weekTwo[39].institutionName).toBe('SD Contoh 40');
  });

  it('uses the source total exactly, including an explicit zero', () => {
    const sheet = XLSX.utils.aoa_to_sheet([
      ['No', 'Nama', 'Pekan 1'],
      ['', '', 'Murid', 'Guru', 'Total'],
      [1, 'SD Uji', 100, 5, 0],
    ]);

    const [entry] = parsePenerimaManfaatSheet(sheet, 'batch-1', 1);
    expect(entry).toMatchObject({ qtSiswaBalita: 100, qtGuruKader: 5, jumlah: 0 });
  });
});
