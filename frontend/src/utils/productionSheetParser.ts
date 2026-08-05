import type { MbgProductionDailyReport, MbgPortionDailyData, MbgPortionNutritionItem, MbgPortionBahanItem, MbgPortionBumbuItem } from '@/types/mbg';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Safe numeric extractor */
function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** Safe string extractor */
function str(v: unknown): string {
  if (v == null) return '';
  return String(v).trim();
}

/** Check if a row is the "Total" row (col E = "Total") */
function isTotalRow(row: unknown[]): boolean {
  return str(row[4]).toLowerCase() === 'total';
}

/** Check if row has gizi data (col G has a value) */
function hasGiziData(row: unknown[]): boolean {
  return str(row[6]) !== '';
}

/** Check if row has bahan pesanan data (col O has a value) */
function hasBahanData(row: unknown[]): boolean {
  return str(row[14]) !== '' && str(row[14]).toLowerCase() !== 'rincian bahan' && str(row[14]).toLowerCase() !== 'total pembelanjaan';
}

/** Check if row has bumbu data (col AB has a value) */
function hasBumbuData(row: unknown[]): boolean {
  const v = str(row[27]);
  return v !== '' && v.toLowerCase() !== 'jenis bumbu' && v.toLowerCase() !== 'total pembelanjaan bumbu' && v.toLowerCase() !== 'harga bumbu';
}

// ─── Column Indices (0-based) ───────────────────────────────────────────────
// KANDUNGAN GIZI
const COL_MENU_NAME = 5;   // F: Menu name (porsi besar section)
const COL_BAHAN     = 6;   // G: Rincian Bahan
const COL_BERAT     = 7;   // H: Berat Bersih
const COL_ENERGI    = 8;   // I: Energi (kkal)
const COL_PROTEIN   = 9;   // J: Protein (g)
const COL_LEMAK     = 10;  // K: Lemak (g)
const COL_KARBO     = 11;  // L: Karbohidrat (g)
const COL_SERAT     = 12;  // M: Serat (g)

// PESANAN BAHAN MAKANAN
// const COL_SUPPLIER    = 13;  // N: Supplier
const COL_BAHAN_ORDER = 14;  // O: Rincian Bahan (pesanan)
const COL_HARGA_BAHAN = 15;  // P: Harga Bahan
// const COL_HARGA_REAL  = 16;  // Q: Harga Bahan Real
const COL_BDD         = 18;  // S: %BDD
const COL_BERAT_KOTOR = 19;  // T: Berat Kotor
const COL_TOTAL_GML   = 20;  // U: Total (g/ml)
const COL_SPARE       = 22;  // W: Spare 2%
const COL_HARGA       = 23;  // X: Harga
// const COL_HARGA_R2    = 24;  // Y: Harga Real

// BUMBU
const COL_BUMBU_NAMA  = 27;  // AB: Jenis Bumbu
const COL_BUMBU_HARGA = 28;  // AC: Harga Bumbu
const COL_BUMBU_QTY   = 31;  // AF: Jumlah
const COL_BUMBU_TOTAL = 32;  // AG: Harga Total

// AKG %
const COL_AKG_LABEL = 4;   // E: label like "%Pemenuhan..."

// PM COUNTS
const COL_PM_LABEL  = 0;   // A: PM labels
const COL_PM_COUNT1 = 1;   // B: count
// const COL_PM_COUNT2 = 2;   // C: total

// KERINGAN columns (Bumil/Busui & Balita)
const COL_KERING_SUPPLIER = 37; // AL: Supplier keringan
const COL_KERING_ITEM     = 38; // AM: Item name
const COL_KERING_QTY1     = 39; // AN: Qty 1
const COL_KERING_QTY2     = 40; // AO: Qty 2 (or energi for gizi keringan)
const COL_KERING_PROTEIN  = 41; // AP: Protein
const COL_KERING_LEMAK    = 42; // AQ: Lemak
const COL_KERING_KARBO    = 43; // AR: Karbohidrat
const COL_KERING_SERAT    = 44; // AS: Serat
const COL_KERING_NEED     = 45; // AT: Kebutuhan
const COL_KERING_PRICE    = 46; // AU: Harga
const COL_KERING_TOTAL    = 47; // AV: Total

// ─── Menu Name Extraction ───────────────────────────────────────────────────

/** Extract menu list from col A rows 7-11 (1-indexed), which is rows[6]-rows[10] (0-indexed) */
function extractMenuList(rows: unknown[][]): string[] {
  const menuNames: string[] = [];
  // Menu names are in column A, starting from row 7 (index 6)
  for (let i = 6; i <= 11 && i < rows.length; i++) {
    const name = str(rows[i]?.[COL_PM_LABEL]);
    if (name && !name.toLowerCase().startsWith('pm ') && name.toLowerCase() !== 'ompreng' && name.toLowerCase() !== 'keringan') {
      menuNames.push(name);
    }
  }
  return menuNames;
}

// ─── Portion Data Parser ────────────────────────────────────────────────────

function parsePortionBlock(
  rows: unknown[][],
  startRow: number,  // 0-indexed start of gizi data
  endRow: number,    // 0-indexed row of "Total"
  portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui',
  portionTitle: string,
  menuList: string[],
  pmCount: number
): MbgPortionDailyData {
  const nutritionItems: MbgPortionNutritionItem[] = [];
  const bahanItems: MbgPortionBahanItem[] = [];
  const bumbuItems: MbgPortionBumbuItem[] = [];
  let currentMenuName = '';

  // Parse nutrition & bahan rows
  for (let i = startRow; i < endRow && i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Extract nutrition data (col G-M)
    if (hasGiziData(row)) {
      const menuCol = str(row[COL_MENU_NAME]);
      if (menuCol) currentMenuName = menuCol;
      
      // For porsi kecil, menu names are in col A rows 7-11
      // For porsi besar, menu names are in col F
      const menuName = currentMenuName || menuList[nutritionItems.length] || '';

      nutritionItems.push({
        menuName,
        rincianBahan: str(row[COL_BAHAN]),
        beratBersih: num(row[COL_BERAT]),
        energi: num(row[COL_ENERGI]),
        protein: num(row[COL_PROTEIN]),
        lemak: num(row[COL_LEMAK]),
        karbohidrat: num(row[COL_KARBO]),
        serat: num(row[COL_SERAT]),
      });
    }

    // Extract bahan pesanan data (col O-Y)
    if (hasBahanData(row)) {
      bahanItems.push({
        rincianBahan: str(row[COL_BAHAN_ORDER]),
        hargaBahan: num(row[COL_HARGA_BAHAN]),
        bddPercent: num(row[COL_BDD]) * 100, // Convert from decimal 0.5 -> 50%
        beratKotor: num(row[COL_BERAT_KOTOR]),
        totalGml: num(row[COL_TOTAL_GML]),
        sparePercent: 2,
        kebutuhan: num(row[COL_SPARE]),
        satuan: 'kg',
        harga: num(row[COL_HARGA]),
      });
    }

    // Extract bumbu data (col AB-AH)
    if (hasBumbuData(row)) {
      bumbuItems.push({
        namaMenu: currentMenuName || '',
        namaBumbu: str(row[COL_BUMBU_NAMA]),
        hargaBumbu: num(row[COL_BUMBU_HARGA]),
        kebutuhan: num(row[COL_BUMBU_QTY]),
        satuan: 'kg',
        harga: num(row[COL_BUMBU_TOTAL]),
      });
    }
  }

  // Parse Total row
  const totalRow = rows[endRow];
  const totalGizi = {
    beratBersih: 0,
    energi: num(totalRow?.[COL_ENERGI]),
    protein: num(totalRow?.[COL_PROTEIN]),
    lemak: num(totalRow?.[COL_LEMAK]),
    karbohidrat: num(totalRow?.[COL_KARBO]),
    serat: num(totalRow?.[COL_SERAT]),
  };

  // Parse AKG metrics (rows after Total)
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
    const label = str(row[COL_AKG_LABEL]).toLowerCase();
    if (!label.includes('pemenuhan')) continue;

    const isMakanSiang = label.includes('makan siang');
    const energiVal = num(row[COL_ENERGI]);

    // Determine which AKG key this row belongs to
    for (const [keyword, key] of Object.entries(akgMapping)) {
      if (label.includes(keyword)) {
        if (!akgMetrics[key]) akgMetrics[key] = { percentMakanSiang: 0, percentHarian: 0 };
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
  const totalBelanjaBahan = num(totalRow?.[COL_HARGA]);
  const totalBelanjaBumbu = bumbuItems.reduce((s, b) => s + b.harga, 0);
  const hargaBahanPerPorsi = pmCount > 0 ? totalBelanjaBahan / pmCount : 0;
  const hargaBumbuPerPorsi = pmCount > 0 ? totalBelanjaBumbu / pmCount : 0;

  return {
    portionType,
    portionTitle,
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

// ─── Find section boundaries ────────────────────────────────────────────────

function findTotalRow(rows: unknown[][], startFrom: number): number {
  for (let i = startFrom; i < rows.length; i++) {
    if (isTotalRow(rows[i])) return i;
  }
  return -1;
}

// ─── Keringan / Balita / Bumil Parser ───────────────────────────────────────

interface KeringanItem {
  supplier: string;
  item: string;
  qty: number;
  qtyExtra: number;
  energi: number;
  protein: number;
  lemak: number;
  karbohidrat: number;
  serat: number;
  kebutuhan: number;
  harga: number;
  total: number;
}

function parseKeringanItems(rows: unknown[][], startRow: number, endRow: number): KeringanItem[] {
  const items: KeringanItem[] = [];
  for (let i = startRow; i < endRow && i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;
    const itemName = str(row[COL_KERING_ITEM]);
    if (!itemName || itemName.toLowerCase().includes('total') || itemName.toLowerCase().includes('pemenuhan') || itemName.toLowerCase().includes('bumil') || itemName.toLowerCase().includes('busui') || itemName.toLowerCase().includes('balita')) continue;

    items.push({
      supplier: str(row[COL_KERING_SUPPLIER]),
      item: itemName,
      qty: num(row[COL_KERING_QTY1]),
      qtyExtra: num(row[COL_KERING_QTY2]),
      energi: num(row[COL_KERING_QTY2]),
      protein: num(row[COL_KERING_PROTEIN]),
      lemak: num(row[COL_KERING_LEMAK]),
      karbohidrat: num(row[COL_KERING_KARBO]),
      serat: num(row[COL_KERING_SERAT]),
      kebutuhan: num(row[COL_KERING_NEED]),
      harga: num(row[COL_KERING_PRICE]),
      total: num(row[COL_KERING_TOTAL]),
    });
  }
  return items;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseProductionSheetRows(
  rows: unknown[][],
  batchId: string,
  tanggal: string,
  sheetDayName: string
): Omit<MbgProductionDailyReport, 'id'> {
  // If no rows, return empty structure
  if (!rows || rows.length < 15) {
    return createEmptyReport(batchId, tanggal, sheetDayName);
  }

  // ── Extract PM counts from rows 1-4 (0-indexed: 0-3) ──
  const pmOmprengKecil = num(rows[0]?.[COL_PM_COUNT1]);
  const pmOmprengBesar = num(rows[1]?.[COL_PM_COUNT1]);
  // pmTotal available: num(rows[1]?.[COL_PM_COUNT2]) || (pmOmprengKecil + pmOmprengBesar)

  // ── Extract menu list from col A ──
  const menuList = extractMenuList(rows);

  // ── Find "Total" rows to determine section boundaries ──
  // Porsi Kecil: gizi data starts at row 3 (index 2), Total at row 15 (index 14)
  const totalRowKecil = findTotalRow(rows, 10);
  // Porsi Besar: gizi data starts after kecil %AKG rows, Total later
  const totalRowBesar = totalRowKecil > 0 ? findTotalRow(rows, totalRowKecil + 5) : -1;

  // ── Parse PORSI KECIL ──
  const porsiKecil = totalRowKecil > 0
    ? parsePortionBlock(rows, 2, totalRowKecil, 'kecil', 'PORSI KECIL', menuList, pmOmprengKecil)
    : createEmptyPortionData('kecil', 'PORSI KECIL');

  // Assign menu names from col A for porsi kecil (col F is empty for kecil)
  if (porsiKecil.nutritionItems.length > 0) {
    let menuIdx = 0;
    let lastAssigned = '';
    for (const item of porsiKecil.nutritionItems) {
      if (!item.menuName && menuIdx < menuList.length) {
        item.menuName = menuList[menuIdx];
        lastAssigned = menuList[menuIdx];
        menuIdx++;
      } else if (!item.menuName) {
        item.menuName = lastAssigned;
      }
    }
  }

  // ── Parse PORSI BESAR ──
  const besarStartRow = totalRowKecil > 0 ? totalRowKecil + 5 : 19; // After %AKG rows
  // Find the actual start: look for first row with gizi data after kecil section
  let besarDataStart = besarStartRow;
  for (let i = besarStartRow; i < rows.length; i++) {
    if (hasGiziData(rows[i])) {
      besarDataStart = i;
      break;
    }
  }
  
  const porsiBesar = totalRowBesar > 0
    ? parsePortionBlock(rows, besarDataStart, totalRowBesar, 'besar', 'PORSI BESAR', menuList, pmOmprengBesar)
    : createEmptyPortionData('besar', 'PORSI BESAR');

  // ── Parse KERINGAN items for Bumil/Busui & Balita ──
  // These are in columns AM-AV, scattered across various rows
  const keringanBumil = parseKeringanItems(rows, 2, 20);
  const keringanBalita = parseKeringanItems(rows, 14, 30);

  // Build simplified Balita & BumilBusui portion data
  const porsiBalita = createEmptyPortionData('balita', 'PORSI BALITA');
  const porsiBumilBusui = createEmptyPortionData('bumil_busui', 'PORSI BUMIL/BUSUI');

  // Populate balita/bumil nutrition from keringan data
  porsiBalita.nutritionItems = keringanBalita.filter(k => k.energi > 0).map(k => ({
    menuName: k.item,
    rincianBahan: k.item,
    beratBersih: k.qty,
    energi: k.energi,
    protein: k.protein,
    lemak: k.lemak,
    karbohidrat: k.karbohidrat,
    serat: k.serat,
  }));

  porsiBumilBusui.nutritionItems = keringanBumil.filter(k => k.energi > 0).map(k => ({
    menuName: k.item,
    rincianBahan: k.item,
    beratBersih: k.qty,
    energi: k.energi,
    protein: k.protein,
    lemak: k.lemak,
    karbohidrat: k.karbohidrat,
    serat: k.serat,
  }));

  // ── Parse Paket Sehat 3B from keringan section ──
  // Balita count from row 15 col AM-AN area
  let balitaCount = 0;
  let bumilCount = 0;
  for (let i = 0; i < Math.min(rows.length, 20); i++) {
    const label = str(rows[i]?.[COL_KERING_ITEM]).toLowerCase();
    if (label.includes('balita')) {
      balitaCount = num(rows[i]?.[COL_KERING_QTY1]);
    }
    if (label.includes('bumil') || label.includes('busui')) {
      bumilCount = num(rows[i]?.[COL_KERING_QTY1]);
    }
  }

  const paketSehat3b = {
    balitaCount: balitaCount || 0,
    bumilBusuiCount: bumilCount || 0,
    keringanItems: keringanBalita.filter(k => k.kebutuhan > 0).map(k => ({
      item: k.item,
      qtyPcs: k.kebutuhan,
      qty: k.kebutuhan,
      satuan: 'pcs',
      hargaSatuan: k.harga,
      totalHarga: k.total,
    })),
  };

  // ── Build PO rows from bahan items ──
  const allBahan = [...porsiKecil.bahanItems, ...porsiBesar.bahanItems];
  const uniqueBahan = new Map<string, typeof allBahan[0]>();
  for (const b of allBahan) {
    if (!uniqueBahan.has(b.rincianBahan)) {
      uniqueBahan.set(b.rincianBahan, b);
    }
  }

  const poRows = Array.from(uniqueBahan.values()).map(b => ({
    supplier: 'Koperasi Al Umanaa Sejahtera Mandiri',
    item: b.rincianBahan,
    jamKedatangan: '06:00',
    jumlah: Math.ceil(b.kebutuhan),
    satuan: b.satuan,
    keterangan: 'Sesuai',
  }));

  const realisasiPembelianRows = Array.from(uniqueBahan.values()).map(b => ({
    tanggal: tanggal || '',
    namaBahan: b.rincianBahan,
    kuantitas: Math.ceil(b.kebutuhan),
    satuan: b.satuan,
    hargaPerUnit: b.hargaBahan,
    totalHarga: b.harga,
  }));

  const totalPengeluaran = realisasiPembelianRows.reduce((s, r) => s + r.totalHarga, 0);

  const inspectionRows = Array.from(uniqueBahan.values()).map(b => ({
    jenisBahan: b.rincianBahan,
    banyaknya: Math.ceil(b.kebutuhan),
    satuan: b.satuan,
    isSesuai: true,
    isBaik: true,
    notes: 'Sesuai',
  }));

  const wasteLogs = menuList.map((name, idx) => ({
    no: idx + 1,
    namaMakanan: name,
    kuantitas: 0,
    satuan: 'kg',
    dokumentasi: '',
  }));

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
      officerName: '',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs,
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Fallback empty structures ──────────────────────────────────────────────

export function createEmptyPortionData(portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui', portionTitle: string): MbgPortionDailyData {
  return {
    portionType,
    portionTitle,
    menuList: [],
    nutritionItems: [],
    bahanItems: [],
    bumbuItems: [],
    totalGizi: { beratBersih: 0, energi: 0, protein: 0, lemak: 0, karbohidrat: 0, serat: 0 },
    akgMetrics: {},
    totalBelanjaBahan: 0,
    hargaBahanPerPorsi: 0,
    totalBelanjaBumbu: 0,
    hargaBumbuPerPorsi: 0,
    totalBelanjaOverall: 0,
    hargaPerPorsiOverall: 0,
  };
}

function createEmptyReport(batchId: string, tanggal: string, sheetDayName: string): Omit<MbgProductionDailyReport, 'id'> {
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
      dari: '',
      kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
      waktu: tanggal || '',
      noForm: '',
      rows: [],
      officerName: '',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs: [],
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
