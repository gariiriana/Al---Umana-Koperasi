import type {
  MbgProductionDailyReport,
  MbgPortionDailyData,
  MbgPortionNutritionItem,
  MbgPortionBahanItem,
  MbgPortionBumbuItem,
  MbgPoReportRow,
  MbgRealisasiPembelianRow,
  MbgInspectionFormRow,
  MbgWasteLogRow,
} from '@/types/mbg';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safe numeric extractor */
function num(v: unknown): number {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const cleaned = String(v).replace(/[^0-9.-]+/g, '');
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

/** Safe string extractor */
function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

// ─── Column Indices (0-based) based on TEMPLATE Worksheet ────────────────────
// PM COUNTS (Header block rows 1-4)
const COL_PM_LABEL = 0; // A: PM labels
const COL_PM_COUNT1 = 1; // B: count
// const COL_PM_COUNT2 = 2; // C: total

// KANDUNGAN GIZI (Cols E - M)
const COL_SECTION_HEADER = 4; // E: Porsi Header / Jenis Menu / Total / %Pemenuhan
const COL_MENU_NAME = 5; // F: Menu name
const COL_BAHAN_GIZI = 6; // G: Rincian Bahan
const COL_BERAT_BERSIH = 7; // H: Berat Bersih (g)
const COL_ENERGI = 8; // I: Energi (kkal)
const COL_PROTEIN = 9; // J: Protein (g)
const COL_LEMAK = 10; // K: Lemak (g)
const COL_KARBO = 11; // L: Karbohidrat (g)
const COL_SERAT = 12; // M: Serat (g)

// PESANAN BAHAN MAKANAN (Cols N - W)
// const COL_SUPPLIER_BAHAN = 13; // N: Supplier
const COL_BAHAN_ORDER = 14; // O: Rincian Bahan (pesanan)
const COL_HARGA_BAHAN = 15; // P: Harga Bahan per unit
const COL_BDD = 16; // Q: %BDD (e.g. 1.0, 0.89, 0.85)
const COL_BERAT_KOTOR = 17; // R: Berat Kotor
const COL_TOTAL_GML = 18; // S: Total (g/ml)
// const COL_SPARE_VAL = 19; // T: Spare % (Total g/ml + 2%)
const COL_KEBUTUHAN_BAHAN = 20; // U: Kebutuhan (Per Unit)
const COL_SATUAN_BAHAN = 21; // V: Satuan (kg, liter, lonjor, pcs)
const COL_HARGA_TOTAL_BAHAN = 22; // W: Total Harga Bahan

// PESANAN BUMBU (Cols X - AD)
// const COL_BUMBU_SUPPLIER = 23; // X: Supplier Bumbu
const COL_BUMBU_MENU = 24; // Y: Nama Menu
const COL_BUMBU_NAMA = 25; // Z: Nama Bumbu
const COL_BUMBU_HARGA_SATUAN = 26; // AA: Harga Bumbu
const COL_BUMBU_KEBUTUHAN = 27; // AB: Kebutuhan (Per Unit)
const COL_BUMBU_SATUAN = 28; // AC: Satuan (kg, ikat, pcs)
const COL_BUMBU_TOTAL_HARGA = 29; // AD: Total Harga Bumbu

// MENU 3B KERINGAN (Cols AG - AQ)
const COL_KERING_ITEM = 32; // AG: Nama Item Keringan
const COL_KERING_QTY_PCS = 33; // AH: Qty (Pcs) / PM Count
// const COL_KERING_BERAT = 34; // AI: Berat
// const COL_KERING_ENERGI = 35; // AJ: Energi
// const COL_KERING_PROTEIN = 36; // AK: Protein
// const COL_KERING_LEMAK = 37; // AL: Lemak
// const COL_KERING_KARBO = 38; // AM: Karbohidrat
// const COL_KERING_SERAT = 39; // AN: Serat
const COL_KERING_KEBUTUHAN = 40; // AO: Kebutuhan
const COL_KERING_HARGA_SATUAN = 41; // AP: Harga
const COL_KERING_TOTAL = 42; // AQ: Total Biaya

// REKAP LOGISTIK / PO SUPPLIER KEDATANGAN (Cols BE - BJ)
const COL_PO_SUPPLIER = 56; // BE: Supplier
const COL_PO_ITEM = 57; // BF: List Pesanan Bahan
const COL_PO_JAM = 58; // BG: Jam Kedatangan
const COL_PO_QTY = 59; // BH: Jumlah
const COL_PO_SATUAN = 60; // BI: Item / Satuan
const COL_PO_KET = 61; // BJ: Keterangan

// ─── Extract Menu List from Column A or F ────────────────────────────────────

function extractMenuList(rows: unknown[][]): string[] {
  const menuNames: string[] = [];
  const seen = new Set<string>();

  // 1. Scan Column A (rows 7-12)
  for (let i = 6; i <= 14 && i < rows.length; i++) {
    const name = str(rows[i]?.[COL_PM_LABEL]);
    if (
      name &&
      !name.toLowerCase().startsWith('pm ') &&
      name.toLowerCase() !== 'ompreng' &&
      name.toLowerCase() !== 'keringan' &&
      !seen.has(name)
    ) {
      menuNames.push(name);
      seen.add(name);
    }
  }

  // 2. Scan Column F across rows if Column A didn't give menus
  if (menuNames.length === 0) {
    for (let i = 2; i < Math.min(rows.length, 50); i++) {
      const name = str(rows[i]?.[COL_MENU_NAME]);
      if (
        name &&
        name.toLowerCase() !== 'menu' &&
        name.toLowerCase() !== 'nama menu' &&
        !seen.has(name)
      ) {
        menuNames.push(name);
        seen.add(name);
      }
    }
  }

  return menuNames;
}

// ─── Portion Data Parser ────────────────────────────────────────────────────

interface RawBlockRange {
  title: string;
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui';
  startRow: number;
  endRow: number;
}

function parsePortionBlock(
  rows: unknown[][],
  range: RawBlockRange,
  menuList: string[],
  pmCount: number
): MbgPortionDailyData {
  const { portionType, title, startRow, endRow } = range;
  const nutritionItems: MbgPortionNutritionItem[] = [];
  const bahanItems: MbgPortionBahanItem[] = [];
  const bumbuItems: MbgPortionBumbuItem[] = [];
  let currentMenuName = '';

  for (let i = startRow; i < endRow && i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Check menu name update in Col F
    const menuCol = str(row[COL_MENU_NAME]);
    if (menuCol && menuCol.toLowerCase() !== 'menu') {
      currentMenuName = menuCol;
    }

    // A. Kandungan Gizi (Col G - M)
    const bahanGizi = str(row[COL_BAHAN_GIZI]);
    if (bahanGizi && bahanGizi.toLowerCase() !== 'rincian bahan') {
      const itemMenuName =
        currentMenuName || menuList[nutritionItems.length] || bahanGizi;

      nutritionItems.push({
        menuName: itemMenuName,
        rincianBahan: bahanGizi,
        beratBersih: num(row[COL_BERAT_BERSIH]),
        energi: num(row[COL_ENERGI]),
        protein: num(row[COL_PROTEIN]),
        lemak: num(row[COL_LEMAK]),
        karbohidrat: num(row[COL_KARBO]),
        serat: num(row[COL_SERAT]),
      });
    }

    // B. Pesanan Bahan Makanan (Col O - W)
    const bahanOrder = str(row[COL_BAHAN_ORDER]);
    if (
      bahanOrder &&
      bahanOrder.toLowerCase() !== 'rincian bahan' &&
      bahanOrder.toLowerCase() !== 'total pembelanjaan'
    ) {
      const bddRaw = num(row[COL_BDD]);
      // If BDD is decimal e.g. 0.89 -> convert to 89, if already 89 or 1 -> handle properly
      const bddPercent = bddRaw > 0 && bddRaw <= 1 ? bddRaw * 100 : bddRaw || 100;

      bahanItems.push({
        rincianBahan: bahanOrder,
        hargaBahan: num(row[COL_HARGA_BAHAN]),
        bddPercent,
        beratKotor: num(row[COL_BERAT_KOTOR]),
        totalGml: num(row[COL_TOTAL_GML]),
        sparePercent: 2,
        kebutuhan: num(row[COL_KEBUTUHAN_BAHAN]),
        satuan: str(row[COL_SATUAN_BAHAN]) || 'kg',
        harga: num(row[COL_HARGA_TOTAL_BAHAN]),
      });
    }

    // C. Pesanan Bumbu (Col Z - AD)
    const bumbuNama = str(row[COL_BUMBU_NAMA]);
    if (
      bumbuNama &&
      bumbuNama.toLowerCase() !== 'nama bumbu' &&
      bumbuNama.toLowerCase() !== 'jenis bumbu' &&
      bumbuNama.toLowerCase() !== 'total pembelanjaan bumbu'
    ) {
      const bumbuMenu = str(row[COL_BUMBU_MENU]) || currentMenuName || '';
      bumbuItems.push({
        namaMenu: bumbuMenu,
        namaBumbu: bumbuNama,
        hargaBumbu: num(row[COL_BUMBU_HARGA_SATUAN]),
        kebutuhan: num(row[COL_BUMBU_KEBUTUHAN]),
        satuan: str(row[COL_BUMBU_SATUAN]) || 'kg',
        harga: num(row[COL_BUMBU_TOTAL_HARGA]),
      });
    }
  }

  // Parse Total Row
  const totalRow = rows[endRow];
  const totalGizi = {
    beratBersih: nutritionItems.reduce((s, it) => s + it.beratBersih, 0),
    energi: num(totalRow?.[COL_ENERGI]) || nutritionItems.reduce((s, it) => s + it.energi, 0),
    protein: num(totalRow?.[COL_PROTEIN]) || nutritionItems.reduce((s, it) => s + it.protein, 0),
    lemak: num(totalRow?.[COL_LEMAK]) || nutritionItems.reduce((s, it) => s + it.lemak, 0),
    karbohidrat: num(totalRow?.[COL_KARBO]) || nutritionItems.reduce((s, it) => s + it.karbohidrat, 0),
    serat: num(totalRow?.[COL_SERAT]) || nutritionItems.reduce((s, it) => s + it.serat, 0),
  };

  // Parse AKG Metrics (rows directly below Total)
  const akgMetrics: Record<string, { percentMakanSiang: number; percentHarian: number }> = {};
  const akgMapping: Record<string, string> = {
    'paud': 'paud',
    'tk': 'paud',
    'sd/mi kelas 1-3': 'sd_kecil',
    'sd/mi (kelas 1-3': 'sd_kecil',
    'sd/mi kelas 4-6': 'sd_besar',
    'smp': 'smp',
    'sma': 'sma',
    'balita': 'balita',
    'bumil': 'bumil',
    'busui': 'busui',
  };

  for (let i = endRow + 1; i < endRow + 8 && i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const label = str(row[COL_SECTION_HEADER]).toLowerCase();
    if (!label.includes('pemenuhan')) continue;

    const isMakanSiang = label.includes('makan siang');
    const energiVal = num(row[COL_ENERGI]);

    for (const [keyword, key] of Object.entries(akgMapping)) {
      if (label.includes(keyword)) {
        if (!akgMetrics[key]) {
          akgMetrics[key] = { percentMakanSiang: 0, percentHarian: 0 };
        }
        if (isMakanSiang) {
          akgMetrics[key].percentMakanSiang = energiVal;
        } else {
          akgMetrics[key].percentHarian = energiVal;
        }
        break;
      }
    }
  }

  // Calculate totals
  const totalBelanjaBahan =
    num(totalRow?.[COL_HARGA_TOTAL_BAHAN]) ||
    bahanItems.reduce((s, b) => s + b.harga, 0);
  const totalBelanjaBumbu =
    num(totalRow?.[COL_BUMBU_TOTAL_HARGA]) ||
    bumbuItems.reduce((s, b) => s + b.harga, 0);

  const hargaBahanPerPorsi = pmCount > 0 ? totalBelanjaBahan / pmCount : 0;
  const hargaBumbuPerPorsi = pmCount > 0 ? totalBelanjaBumbu / pmCount : 0;

  return {
    portionType,
    portionTitle: title,
    menuList,
    nutritionItems,
    bahanItems,
    bumbuItems,
    totalGizi,
    akgMetrics,
    totalBelanjaBahan,
    hargaBahanPerPorsi,
    totalBelanjaBumbu,
    hargaBumbuPerPorsi,
    totalBelanjaOverall: totalBelanjaBahan + totalBelanjaBumbu,
    hargaPerPorsiOverall: hargaBahanPerPorsi + hargaBumbuPerPorsi,
  };
}

// ─── Find Portion Sections Dynamically ──────────────────────────────────────

function findPortionRanges(rows: unknown[][]): RawBlockRange[] {
  const ranges: RawBlockRange[] = [];
  let currentRange: { title: string; portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui'; startRow: number } | null = null;

  for (let i = 0; i < rows.length; i++) {
    const headerCell = str(rows[i]?.[COL_SECTION_HEADER]).toUpperCase();

    if (headerCell.includes('PORSI KECIL')) {
      currentRange = { title: 'PORSI KECIL', portionType: 'kecil', startRow: i };
    } else if (headerCell.includes('PORSI BESAR')) {
      currentRange = { title: 'PORSI BESAR', portionType: 'besar', startRow: i };
    } else if (headerCell.includes('PORSI BALITA')) {
      currentRange = { title: 'PORSI BALITA', portionType: 'balita', startRow: i };
    } else if (headerCell.includes('PORSI BUMIL') || headerCell.includes('PORSI BUSUI')) {
      currentRange = { title: 'PORSI BUMIL/BUSUI', portionType: 'bumil_busui', startRow: i };
    } else if (headerCell === 'TOTAL' && currentRange) {
      ranges.push({
        ...currentRange,
        endRow: i,
      });
      currentRange = null;
    }
  }

  return ranges;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseProductionSheetRows(
  rows: unknown[][],
  batchId: string,
  tanggal: string,
  sheetDayName: string
): Omit<MbgProductionDailyReport, 'id'> {
  if (!rows || rows.length < 10) {
    return createEmptyReport(batchId, tanggal, sheetDayName);
  }

  // 1. Extract PM counts from top-left block
  const pmOmprengKecil = num(rows[0]?.[COL_PM_COUNT1]);
  const pmOmprengBesar = num(rows[1]?.[COL_PM_COUNT1]);
  const pmBalita = num(rows[2]?.[COL_PM_COUNT1]);
  const pmBumil = num(rows[3]?.[COL_PM_COUNT1]);

  // 2. Extract Menu List
  const menuList = extractMenuList(rows);

  // 3. Find and parse 4 portion blocks
  const ranges = findPortionRanges(rows);

  const rangeKecil = ranges.find((r) => r.portionType === 'kecil');
  const rangeBesar = ranges.find((r) => r.portionType === 'besar');
  const rangeBalita = ranges.find((r) => r.portionType === 'balita');
  const rangeBumil = ranges.find((r) => r.portionType === 'bumil_busui');

  const porsiKecil = rangeKecil
    ? parsePortionBlock(rows, rangeKecil, menuList, pmOmprengKecil)
    : createEmptyPortionData('kecil', 'PORSI KECIL');

  const porsiBesar = rangeBesar
    ? parsePortionBlock(rows, rangeBesar, menuList, pmOmprengBesar)
    : createEmptyPortionData('besar', 'PORSI BESAR');

  const porsiBalita = rangeBalita
    ? parsePortionBlock(rows, rangeBalita, menuList, pmBalita)
    : createEmptyPortionData('balita', 'PORSI BALITA');

  const porsiBumilBusui = rangeBumil
    ? parsePortionBlock(rows, rangeBumil, menuList, pmBumil)
    : createEmptyPortionData('bumil_busui', 'PORSI BUMIL/BUSUI');

  // Fill in menu names for porsi kecil if col F was blank
  if (porsiKecil.nutritionItems.length > 0 && menuList.length > 0) {
    let menuIdx = 0;
    let lastAssigned = menuList[0];
    for (const item of porsiKecil.nutritionItems) {
      if (!item.menuName || item.menuName === item.rincianBahan) {
        item.menuName = menuList[menuIdx] || lastAssigned;
        lastAssigned = item.menuName;
        if (menuIdx < menuList.length - 1) menuIdx++;
      }
    }
  }

  // 4. Parse Menu 3B Keringan (Col AG - AQ)
  const keringanItems: {
    item: string;
    qtyPcs: number;
    qty: number;
    satuan: string;
    hargaSatuan?: number;
    totalHarga?: number;
  }[] = [];

  for (let i = 2; i < Math.min(rows.length, 35); i++) {
    const itemName = str(rows[i]?.[COL_KERING_ITEM]);
    if (
      itemName &&
      itemName.toLowerCase() !== 'list bahan keringan' &&
      itemName.toLowerCase() !== 'item' &&
      itemName.toLowerCase() !== 'total' &&
      !itemName.toLowerCase().includes('bumil') &&
      !itemName.toLowerCase().includes('balita')
    ) {
      const qtyPcs = num(rows[i]?.[COL_KERING_KEBUTUHAN]) || num(rows[i]?.[COL_KERING_QTY_PCS]) || 1;
      const hargaSatuan = num(rows[i]?.[COL_KERING_HARGA_SATUAN]);
      const totalHarga = num(rows[i]?.[COL_KERING_TOTAL]) || qtyPcs * hargaSatuan;

      keringanItems.push({
        item: itemName,
        qtyPcs,
        qty: qtyPcs,
        satuan: 'pcs',
        hargaSatuan,
        totalHarga,
      });
    }
  }

  const paketSehat3b = {
    balitaCount: pmBalita || 0,
    bumilBusuiCount: pmBumil || 0,
    keringanItems,
  };

  // 5. Parse PO Rows / Logistik Kedatangan (Col BE - BJ)
  const poRows: MbgPoReportRow[] = [];
  for (let i = 1; i < Math.min(rows.length, 50); i++) {
    const supplier = str(rows[i]?.[COL_PO_SUPPLIER]);
    const item = str(rows[i]?.[COL_PO_ITEM]);
    if (
      supplier &&
      item &&
      item.toLowerCase() !== 'list pesanan bahan' &&
      supplier.toLowerCase() !== 'supplier'
    ) {
      poRows.push({
        supplier,
        item,
        jamKedatangan: str(rows[i]?.[COL_PO_JAM]) || '06:00',
        jumlah: num(rows[i]?.[COL_PO_QTY]),
        satuan: str(rows[i]?.[COL_PO_SATUAN]) || 'kg',
        keterangan: str(rows[i]?.[COL_PO_KET]) || 'Sesuai',
      });
    }
  }

  // Fallback: If Col BE-BJ was empty, aggregate all bahan items from porsi kecil & besar
  if (poRows.length === 0) {
    const allBahan = [
      ...porsiKecil.bahanItems,
      ...porsiBesar.bahanItems,
      ...porsiBalita.bahanItems,
      ...porsiBumilBusui.bahanItems,
    ];
    const uniqueBahan = new Map<string, { bahan: string; qty: number; satuan: string; harga: number; total: number }>();

    for (const b of allBahan) {
      if (!uniqueBahan.has(b.rincianBahan)) {
        uniqueBahan.set(b.rincianBahan, {
          bahan: b.rincianBahan,
          qty: b.kebutuhan,
          satuan: b.satuan,
          harga: b.hargaBahan,
          total: b.harga,
        });
      } else {
        const exist = uniqueBahan.get(b.rincianBahan)!;
        exist.qty += b.kebutuhan;
        exist.total += b.harga;
      }
    }

    for (const item of uniqueBahan.values()) {
      poRows.push({
        supplier: 'Koperasi Al Umanaa Sejahtera Mandiri',
        item: item.bahan,
        jamKedatangan: '06:00',
        jumlah: Math.round(item.qty * 10) / 10,
        satuan: item.satuan,
        keterangan: 'Sesuai',
      });
    }
  }

  // 6. Realisasi Pembelian Rows
  const realisasiPembelianRows: MbgRealisasiPembelianRow[] = poRows.map((po) => {
    // Find matching bahan price if available
    const matchedBahan = [
      ...porsiKecil.bahanItems,
      ...porsiBesar.bahanItems,
    ].find((b) => b.rincianBahan.toLowerCase() === po.item.toLowerCase());

    const hargaPerUnit = matchedBahan ? matchedBahan.hargaBahan : 0;
    const totalHarga = hargaPerUnit > 0 ? po.jumlah * hargaPerUnit : matchedBahan ? matchedBahan.harga : 0;

    return {
      tanggal: tanggal || '',
      namaBahan: po.item,
      kuantitas: po.jumlah,
      satuan: po.satuan,
      hargaPerUnit,
      totalHarga,
    };
  });

  const totalPengeluaran =
    porsiKecil.totalBelanjaOverall +
    porsiBesar.totalBelanjaOverall +
    porsiBalita.totalBelanjaOverall +
    porsiBumilBusui.totalBelanjaOverall ||
    realisasiPembelianRows.reduce((s, r) => s + r.totalHarga, 0);

  // 7. Inspection Form
  const inspectionRows: MbgInspectionFormRow[] = poRows.map((po) => ({
    jenisBahan: po.item,
    banyaknya: po.jumlah,
    satuan: po.satuan,
    isSesuai: true,
    isBaik: true,
    notes: 'Kualitas Segar & Sesuai Spesifikasi',
  }));

  // 8. Food Waste Logs
  const wasteLogs: MbgWasteLogRow[] = (menuList.length > 0 ? menuList : ['Nasi Putih', 'Lauk Hewani', 'Lauk Nabati', 'Sayuran', 'Buah']).map(
    (name, idx) => ({
      no: idx + 1,
      namaMakanan: name,
      kuantitas: 0,
      satuan: 'kg',
      dokumentasi: '',
    })
  );

  return {
    batchId,
    tanggal,
    sheetDayName,
    porsiKecil,
    porsiBesar,
    porsiBalita,
    porsiBumilBusui,
    paketSehat3b,
    poRows,
    realisasiPembelianRows,
    totalPengeluaran,
    totalAnggaran: totalPengeluaran,
    selisih: 0,
    inspectionForm: {
      dari: 'Koperasi Al Umanaa Sejahtera Mandiri',
      kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
      waktu: tanggal || '',
      noForm: '',
      rows: inspectionRows,
      officerName: 'Gari Iriana',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs,
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Fallback empty structures ──────────────────────────────────────────────

export function createEmptyPortionData(
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui',
  portionTitle: string
): MbgPortionDailyData {
  return {
    portionType,
    portionTitle,
    menuList: [],
    nutritionItems: [],
    bahanItems: [],
    bumbuItems: [],
    totalGizi: {
      beratBersih: 0,
      energi: 0,
      protein: 0,
      lemak: 0,
      karbohidrat: 0,
      serat: 0,
    },
    akgMetrics: {},
    totalBelanjaBahan: 0,
    hargaBahanPerPorsi: 0,
    totalBelanjaBumbu: 0,
    hargaBumbuPerPorsi: 0,
    totalBelanjaOverall: 0,
    hargaPerPorsiOverall: 0,
  };
}

function createEmptyReport(
  batchId: string,
  tanggal: string,
  sheetDayName: string
): Omit<MbgProductionDailyReport, 'id'> {
  return {
    batchId,
    tanggal,
    sheetDayName,
    porsiKecil: createEmptyPortionData('kecil', 'PORSI KECIL'),
    porsiBesar: createEmptyPortionData('besar', 'PORSI BESAR'),
    porsiBalita: createEmptyPortionData('balita', 'PORSI BALITA'),
    porsiBumilBusui: createEmptyPortionData('bumil_busui', 'PORSI BUMIL/BUSUI'),
    paketSehat3b: { balitaCount: 0, bumilBusuiCount: 0, keringanItems: [] },
    poRows: [],
    realisasiPembelianRows: [],
    totalPengeluaran: 0,
    totalAnggaran: 0,
    selisih: 0,
    inspectionForm: {
      dari: 'Koperasi Al Umanaa Sejahtera Mandiri',
      kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
      waktu: tanggal || '',
      noForm: '',
      rows: [],
      officerName: 'Gari Iriana',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs: [],
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
