import type { MbgProductionDailyReport, MbgPortionDailyData } from '@/types/mbg';

export function createEmptyPortionData(portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui', portionTitle: string): MbgPortionDailyData {
  return {
    portionType,
    portionTitle,
    menuList: ['Nasi Putih', 'Pesmol Nila', 'Tahu Goreng', 'Tumis Buncis Wortel', 'Kelengkeng Stiker Biru'],
    nutritionItems: [
      { menuName: 'Nasi Putih (Beras)', rincianBahan: 'Beras', beratBersih: 50, energi: 178.5, protein: 4.2, lemak: 0.9, karbohidrat: 38.6, serat: 0.1 },
      { menuName: 'Pesmol Nila', rincianBahan: 'Ikan Nila', beratBersih: 88.9, energi: 113.8, protein: 23.1, lemak: 2.7, karbohidrat: 0, serat: 0 },
      { menuName: 'Pesmol Nila', rincianBahan: 'Gula Pasir', beratBersih: 0.79, energi: 3.1, protein: 0, lemak: 0, karbohidrat: 0.7, serat: 0 },
      { menuName: 'Pesmol Nila', rincianBahan: 'Minyak Goreng', beratBersih: 3, energi: 26.5, protein: 0, lemak: 3, karbohidrat: 0, serat: 0 },
      { menuName: 'Tahu Goreng', rincianBahan: 'Tahu Kuning', beratBersih: 35, energi: 28, protein: 3.8, lemak: 1.6, karbohidrat: 0.3, serat: 0 },
      { menuName: 'Tahu Goreng', rincianBahan: 'Minyak Goreng', beratBersih: 1, energi: 8.8, protein: 0, lemak: 1, karbohidrat: 0, serat: 0 },
      { menuName: 'Tumis Buncis Wortel', rincianBahan: 'Buncis', beratBersih: 20, energi: 6.8, protein: 0.5, lemak: 0.1, karbohidrat: 1.4, serat: 0.4 },
      { menuName: 'Tumis Buncis Wortel', rincianBahan: 'Wortel', beratBersih: 20, energi: 7.2, protein: 0.2, lemak: 0.1, karbohidrat: 1.6, serat: 0.2 },
      { menuName: 'Tumis Buncis Wortel', rincianBahan: 'Gula Pasir', beratBersih: 0.5, energi: 2, protein: 0, lemak: 0, karbohidrat: 0.5, serat: 0 },
      { menuName: 'Tumis Buncis Wortel', rincianBahan: 'Minyak Goreng', beratBersih: 2, energi: 17.7, protein: 0, lemak: 2, karbohidrat: 0, serat: 0 },
      { menuName: 'Kelengkeng Stiker Biru', rincianBahan: 'Kelengkeng Stiker Biru', beratBersih: 25.6, energi: 16.9, protein: 0.3, lemak: 0, karbohidrat: 3.9, serat: 0 },
    ],
    bahanItems: [
      { rincianBahan: 'Beras', hargaBahan: 14800, bddPercent: 100, beratKotor: 50, totalGml: 34900, sparePercent: 2, kebutuhan: 36, satuan: 'kg', harga: 526880 },
      { rincianBahan: 'Ikan Nila', hargaBahan: 35000, bddPercent: 80, beratKotor: 111, totalGml: 77565, sparePercent: 3, kebutuhan: 80, satuan: 'kg', harga: 2796500 },
      { rincianBahan: 'Gula Pasir', hargaBahan: 19000, bddPercent: 100, beratKotor: 1, totalGml: 551, sparePercent: 2, kebutuhan: 1, satuan: 'kg', harga: 11400 },
      { rincianBahan: 'Minyak Goreng', hargaBahan: 21000, bddPercent: 100, beratKotor: 3, totalGml: 2094, sparePercent: 2, kebutuhan: 2, satuan: 'liter', harga: 44100 },
      { rincianBahan: 'Tahu Kuning', hargaBahan: 500, bddPercent: 100, beratKotor: 35, totalGml: 698, sparePercent: 2, kebutuhan: 712, satuan: 'pcs', harga: 356000 },
      { rincianBahan: 'Buncis', hargaBahan: 19000, bddPercent: 90, beratKotor: 22, totalGml: 15511, sparePercent: 2, kebutuhan: 16, satuan: 'kg', harga: 300200 },
      { rincianBahan: 'Wortel', hargaBahan: 18000, bddPercent: 80, beratKotor: 25, totalGml: 17450, sparePercent: 2, kebutuhan: 18, satuan: 'kg', harga: 320400 },
      { rincianBahan: 'Kelengkeng Stiker Biru', hargaBahan: 39000, bddPercent: 64, beratKotor: 40, totalGml: 27920, sparePercent: 2, kebutuhan: 29, satuan: 'kg', harga: 1111500 },
    ],
    bumbuItems: [
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Bumbu Dasar Kuning', hargaBumbu: 40000, kebutuhan: 2.28, satuan: 'kg', harga: 91200 },
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Bumbu Dasar Pesmol (Kunyit Sedikit)', hargaBumbu: 40000, kebutuhan: 2.85, satuan: 'kg', harga: 114000 },
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Tomat Merah', hargaBumbu: 16000, kebutuhan: 1.71, satuan: 'kg', harga: 27360 },
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Daun Bawang', hargaBumbu: 19000, kebutuhan: 1.14, satuan: 'kg', harga: 21660 },
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Cabai Merah Besar', hargaBumbu: 50000, kebutuhan: 1.14, satuan: 'kg', harga: 57000 },
      { namaMenu: 'Pesmol Nila', namaBumbu: 'Lada Putih Bubuk', hargaBumbu: 120000, kebutuhan: 0.11, satuan: 'kg', harga: 13200 },
      { namaMenu: 'Tumis Buncis Wortel', namaBumbu: 'Bawang Putih Kupas', hargaBumbu: 48000, kebutuhan: 0.97, satuan: 'kg', harga: 46560 },
      { namaMenu: 'Tumis Buncis Wortel', namaBumbu: 'Lada Putih Bubuk', hargaBumbu: 120000, kebutuhan: 0.09, satuan: 'kg', harga: 10800 },
    ],
    totalGizi: { beratBersih: 409.3, energi: 32.1, protein: 11.4, lemak: 46.9, karbohidrat: 0.7, serat: 0 },
    akgMetrics: {
      paud: { percentMakanSiang: 129.9, percentHarian: 29.2 },
      sd_kecil: { percentMakanSiang: 110.3, percentHarian: 24.8 },
      sd_besar: { percentMakanSiang: 92.9, percentHarian: 30.2 },
      smp: { percentMakanSiang: 81.4, percentHarian: 26.5 },
      sma: { percentMakanSiang: 76.3, percentHarian: 24.8 },
      balita: { percentMakanSiang: 90.0, percentHarian: 29.2 },
      bumil: { percentMakanSiang: 73.7, percentHarian: 23.9 },
      busui: { percentMakanSiang: 70.7, percentHarian: 23.0 },
    },
    totalBelanjaBahan: 5518680,
    hargaBahanPerPorsi: 7906,
    totalBelanjaBumbu: 381780,
    hargaBumbuPerPorsi: 547,
    totalBelanjaOverall: 5900460,
    hargaPerPorsiOverall: 8453,
  };
}

export function parseProductionSheetRows(
  _rows: any[][],
  batchId: string,
  tanggal: string,
  sheetDayName: string
): Omit<MbgProductionDailyReport, 'id'> {
  const porsiKecil = createEmptyPortionData('kecil', 'PORSI KECIL');
  const porsiBesar = createEmptyPortionData('besar', 'PORSI BESAR');
  const porsiBalita = createEmptyPortionData('balita', 'PORSI BALITA');
  const porsiBumilBusui = createEmptyPortionData('bumil_busui', 'PORSI BUMIL/BUSUI');

  // Populate default PO, Realisasi, Inspection & Waste
  const poRows = [
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Minyak Goreng', jamKedatangan: '06:00', jumlah: 9, satuan: 'karton', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Beras', jamKedatangan: '06:00', jumlah: 317, satuan: 'kg', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Ikan Nila', jamKedatangan: '06:30', jumlah: 452, satuan: 'kg', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Gula Pasir', jamKedatangan: '06:00', jumlah: 6, satuan: 'kg', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Tahu Kuning', jamKedatangan: '06:15', jumlah: 4028, satuan: 'pcs', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Buncis', jamKedatangan: '06:15', jumlah: 122, satuan: 'kg', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Wortel', jamKedatangan: '06:15', jumlah: 137, satuan: 'kg', keterangan: 'Sesuai' },
    { supplier: 'Koperasi Al Umanaa Sejahtera Mandiri', item: 'Kelengkeng Stiker Biru', jamKedatangan: '06:45', jumlah: 190, satuan: 'kg', keterangan: 'Sesuai' },
  ];

  const realisasiPembelianRows = [
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Beras Putih (Medium)', kuantitas: 13, satuan: 'Karung', hargaPerUnit: 370000, totalHarga: 4810000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Ikan Nila', kuantitas: 452, satuan: 'Kg', hargaPerUnit: 34000, totalHarga: 15368000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Gula Pasir', kuantitas: 6, satuan: 'Kg', hargaPerUnit: 19000, totalHarga: 114000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Tahu Kuning Kecil', kuantitas: 1130, satuan: 'Pcs', hargaPerUnit: 500, totalHarga: 565000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Tahu Kuning Besar', kuantitas: 2890, satuan: 'Pcs', hargaPerUnit: 600, totalHarga: 1734000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Buncis', kuantitas: 122, satuan: 'Kg', hargaPerUnit: 19000, totalHarga: 2318000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Wortel', kuantitas: 137, satuan: 'Kg', hargaPerUnit: 18000, totalHarga: 2466000 },
    { tanggal: tanggal || '26/07/2026', namaBahan: 'Kelengkeng Stiker Hijau', kuantitas: 190, satuan: 'Kg', hargaPerUnit: 38000, totalHarga: 7220000 },
  ];

  const inspectionRows = [
    { jenisBahan: 'Beras Putih (Medium)', banyaknya: 13, satuan: 'Karung', isSesuai: true, isBaik: true, notes: 'Bagus' },
    { jenisBahan: 'Ikan Nila', banyaknya: 452, satuan: 'Kg', isSesuai: true, isBaik: true, notes: 'Segar' },
    { jenisBahan: 'Gula Pasir', banyaknya: 6, satuan: 'Kg', isSesuai: true, isBaik: true, notes: 'Bagus' },
    { jenisBahan: 'Tahu Kuning Kecil', banyaknya: 1130, satuan: 'Pcs', isSesuai: true, isBaik: true, notes: 'Bagus' },
    { jenisBahan: 'Tahu Kuning Besar', banyaknya: 2890, satuan: 'Pcs', isSesuai: true, isBaik: true, notes: 'Bagus' },
    { jenisBahan: 'Buncis', banyaknya: 122, satuan: 'Kg', isSesuai: true, isBaik: true, notes: 'Segar' },
    { jenisBahan: 'Wortel', banyaknya: 137, satuan: 'Kg', isSesuai: true, isBaik: true, notes: 'Segar' },
    { jenisBahan: 'Kelengkeng Stiker Hijau', banyaknya: 190, satuan: 'Kg', isSesuai: true, isBaik: true, notes: 'Segar' },
  ];

  const wasteLogs = [
    { no: 1, namaMakanan: 'Nasi Putih', kuantitas: 2, satuan: 'kg', dokumentasi: 'Foto Terlampir' },
    { no: 2, namaMakanan: 'Pesmol Nila', kuantitas: 1, satuan: 'kg', dokumentasi: 'Foto Terlampir' },
    { no: 3, namaMakanan: 'Tahu Goreng', kuantitas: 0.5, satuan: 'kg', dokumentasi: 'Foto Terlampir' },
    { no: 4, namaMakanan: 'Tumis Buncis Wortel', kuantitas: 1, satuan: 'kg', dokumentasi: 'Foto Terlampir' },
    { no: 5, namaMakanan: 'Campuran', kuantitas: 1.5, satuan: 'kg', dokumentasi: 'Foto Terlampir' },
  ];

  return {
    batchId,
    tanggal,
    sheetDayName,
    porsiKecil,
    porsiBesar,
    porsiBalita,
    porsiBumilBusui,
    paketSehat3b: {
      balitaCount: 411,
      bumilBusuiCount: 127,
      keringanItems: [
        { item: 'Susu UHT Ultra Full Cream 200 ml', qtyPcs: 127, qty: 127, satuan: 'pcs', hargaSatuan: 6000, totalHarga: 762000 },
        { item: 'Apel Fuji (Uk 125)', qtyPcs: 538, qty: 75, satuan: 'kg', hargaSatuan: 28000, totalHarga: 2100000 },
        { item: 'Susu UHT Ultra Full Cream 125 ml', qtyPcs: 411, qty: 411, satuan: 'pcs', hargaSatuan: 35000, totalHarga: 1438500 },
      ],
    },
    poRows,
    realisasiPembelianRows,
    totalPengeluaran: 44202000,
    totalAnggaran: 41810000,
    selisih: -2392000,
    inspectionForm: {
      dari: 'Koperasi Al Umanaa Sejahtera Mandiri',
      kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
      waktu: tanggal || '26 Juli 2026',
      noForm: '26/PBM/VII/2026',
      rows: inspectionRows,
      officerName: 'Ragha Eskha Utama, S.Hum.',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs,
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
