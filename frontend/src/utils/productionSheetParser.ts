import * as XLSX from 'xlsx';
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
  MbgPmEntry,
  MbgInstitutionType,
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
const COL_PM_COUNT2 = 2; // C: total

// KANDUNGAN GIZI (Cols E - M)
const COL_SECTION_HEADER = 4; // E: Porsi Header / Jenis Porsi / Total / %Pemenuhan
const COL_MENU_NAME = 5; // F: Menu name
const COL_BAHAN_GIZI = 6; // G: Rincian Bahan

// ─── Column Map Interface & Dynamic Resolver ────────────────────────────────
export interface SheetColMap {
  // Gizi
  colSectionHeader: number;
  colMenuName: number;
  colBahanGizi: number;
  colBeratBersih: number;
  colEnergi: number;
  colProtein: number;
  colLemak: number;
  colKarbo: number;
  colSerat: number;
  // Pesanan Bahan Makanan Pokok
  colSupplierBahan: number;
  colBahanOrder: number;
  colHargaBahan: number;
  colBdd: number;
  colBeratKotor: number;
  colTotalGml: number;
  colSpareBahan: number;
  colKebutuhanBahan: number;
  colSatuanBahan: number;
  colHargaTotalBahan: number;
  // Pesanan Bumbu Masak
  colSupplierBumbu: number;
  colMenuBumbu: number;
  colNamaBumbu: number;
  colHargaBumbu: number;
  colKebutuhanBumbu: number;
  colSatuanBumbu: number;
  colHargaTotalBumbu: number;
}

export function resolveSheetColumnIndices(rows: unknown[][]): SheetColMap {
  // Proven default indices from TEMPLATE and daily sheets (e.g. '20072026')
  const map: SheetColMap = {
    colSectionHeader: 4, // E
    colMenuName: 5,       // F
    colBahanGizi: 6,      // G
    colBeratBersih: 7,    // H
    colEnergi: 8,         // I
    colProtein: 9,        // J
    colLemak: 10,         // K
    colKarbo: 11,         // L
    colSerat: 12,         // M

    colSupplierBahan: 13,   // N
    colBahanOrder: 14,      // O: Rincian Bahan
    colHargaBahan: 15,      // P: Harga Bahan
    colBdd: 16,             // Q: %BDD
    colBeratKotor: 17,      // R: Berat Kotor
    colTotalGml: 18,        // S: Total (g/ml)
    colSpareBahan: 19,      // T: Spare %
    colKebutuhanBahan: 20,  // U: Kebutuhan (Per Unit / Jumlah)
    colSatuanBahan: 21,     // V: Satuan
    colHargaTotalBahan: 22, // W: Total Harga Bahan

    colSupplierBumbu: 23,   // X: Supplier Bumbu
    colMenuBumbu: 24,       // Y: Nama Menu
    colNamaBumbu: 25,       // Z: Nama Bumbu
    colHargaBumbu: 26,      // AA: Harga Bumbu
    colKebutuhanBumbu: 27,  // AB: Kebutuhan (Per Unit / Jumlah)
    colSatuanBumbu: 28,     // AC: Satuan
    colHargaTotalBumbu: 29, // AD: Total Harga Bumbu
  };

  // Dynamically detect or refine if headers exist in rows 0..3
  for (let r = 0; r < Math.min(rows.length, 4); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < Math.min(row.length, 35); c++) {
      const cell = str(row[c]).toLowerCase();
      if (!cell) continue;

      // Gizi headers
      if (c >= 4 && c <= 12) {
        if (cell.includes('berat bersih')) map.colBeratBersih = c;
        else if (cell.includes('energi')) map.colEnergi = c;
        else if (cell.includes('protein')) map.colProtein = c;
        else if (cell.includes('lemak')) map.colLemak = c;
        else if (cell.includes('karbohidrat')) map.colKarbo = c;
        else if (cell.includes('serat')) map.colSerat = c;
      }

      // Bahan Makanan headers
      if (c >= 12 && c <= 23) {
        if (cell === 'supplier' && c < 15) map.colSupplierBahan = c;
        else if (cell.includes('rincian') || cell === 'bahan' || cell.includes('rincian bahan')) map.colBahanOrder = c;
        else if (cell.includes('harga bahan') || cell.includes('harga baku')) map.colHargaBahan = c;
        else if (cell.includes('bdd') || cell.includes('%bdd')) map.colBdd = c;
        else if (cell.includes('berat kotor')) map.colBeratKotor = c;
        else if (cell.includes('total (g') || cell.includes('total (g/ml)')) map.colTotalGml = c;
        else if (cell.includes('spare')) map.colSpareBahan = c;
        else if (cell.includes('kebutuhan')) map.colKebutuhanBahan = c;
        else if (cell.includes('satuan') && c >= 19 && c <= 22) map.colSatuanBahan = c;
        else if (cell === 'harga' && c >= 21 && c <= 23) map.colHargaTotalBahan = c;
      }

      // Bumbu headers
      if (c >= 22 && c <= 32) {
        if (cell === 'supplier' && c >= 22) map.colSupplierBumbu = c;
        else if (cell.includes('nama menu') || cell.includes('menu')) map.colMenuBumbu = c;
        else if (cell.includes('nama bumbu') || cell.includes('jenis bumbu')) map.colNamaBumbu = c;
        else if (cell.includes('harga bumbu')) map.colHargaBumbu = c;
        else if (cell.includes('kebutuhan') && c >= 26) map.colKebutuhanBumbu = c;
        else if (cell.includes('satuan') && c >= 27) map.colSatuanBumbu = c;
        else if (cell === 'harga' && c >= 28) map.colHargaTotalBumbu = c;
      }
    }
  }

  return map;
}


// MENU 3B KERINGAN (BUMIL & BALITA) (Cols AM - AV)
const COL_KERING_ITEM = 38; // AM: Nama Item Keringan
const COL_KERING_QTY_PCS = 39; // AN: Qty (Pcs) / PM Count
const COL_KERING_ENERGI = 40; // AO: Energi
const COL_KERING_PROTEIN = 41; // AP: Protein
const COL_KERING_LEMAK = 42; // AQ: Lemak
const COL_KERING_KARBO = 43; // AR: Karbohidrat
const COL_KERING_SERAT = 44; // AS: Serat
const COL_KERING_KEBUTUHAN = 45; // AT: Kebutuhan
const COL_KERING_HARGA_SATUAN = 46; // AU: Harga
const COL_KERING_TOTAL = 47; // AV: Total Biaya

// CATATAN / EVALUASI PRODUKSI
const COL_EVAL_PRODUKSI = 50; // AY: Catatan Evaluasi Dapur

// SEKOLAH YANG DIKIRIM (Cols BI - BK)
const COL_SEKOLAH_NAMA = 60; // BI: Nama Sekolah
const COL_SEKOLAH_MURID = 61; // BJ: Jumlah Murid
const COL_SEKOLAH_GURU = 62; // BK: Jumlah Guru

// ─── Extract Menu List from Column A or F ────────────────────────────────────

function extractMenuList(rows: unknown[][]): string[] {
  const menuNames: string[] = [];
  const seen = new Set<string>();

  // 1. Scan Column A (rows 7-14)
  for (let i = 5; i <= 15 && i < rows.length; i++) {
    const name = str(rows[i]?.[COL_PM_LABEL]);
    if (
      name &&
      !name.toLowerCase().startsWith('pm ') &&
      name.toLowerCase() !== 'ompreng' &&
      name.toLowerCase() !== 'keringan' &&
      !name.toLowerCase().includes('karbohidrat') &&
      !name.toLowerCase().includes('protein') &&
      !name.toLowerCase().includes('sayur') &&
      !name.toLowerCase().includes('buah') &&
      !name.toLowerCase().includes('note') &&
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
  pmCount: number,
  colMap?: SheetColMap
): MbgPortionDailyData {
  const map = colMap || resolveSheetColumnIndices(rows);
  const { portionType, title, startRow, endRow } = range;
  const nutritionItems: MbgPortionNutritionItem[] = [];
  const bahanItems: MbgPortionBahanItem[] = [];
  const bumbuItems: MbgPortionBumbuItem[] = [];
  let currentMenuName = '';

  for (let i = startRow; i < endRow && i < rows.length; i++) {
    const row = rows[i];
    if (!row) continue;

    // Check menu name update in Col F
    const menuCol = str(row[map.colMenuName]);
    if (menuCol && menuCol.toLowerCase() !== 'menu') {
      currentMenuName = menuCol;
    }

    // A. Kandungan Gizi (Col G - M)
    const bahanGizi = str(row[map.colBahanGizi]);
    if (bahanGizi && bahanGizi.toLowerCase() !== 'rincian bahan') {
      const itemMenuName =
        currentMenuName || menuList[nutritionItems.length] || bahanGizi;

      nutritionItems.push({
        menuName: itemMenuName,
        rincianBahan: bahanGizi,
        beratBersih: num(row[map.colBeratBersih]),
        energi: num(row[map.colEnergi]),
        protein: num(row[map.colProtein]),
        lemak: num(row[map.colLemak]),
        karbohidrat: num(row[map.colKarbo]),
        serat: num(row[map.colSerat]),
      });
    }

    // B. Pesanan Bahan Makanan (Cols N - W)
    const bahanOrder = str(row[map.colBahanOrder]);
    if (
      bahanOrder &&
      bahanOrder.toLowerCase() !== 'rincian bahan' &&
      bahanOrder.toLowerCase() !== 'total pembelanjaan'
    ) {
      const bddRaw = num(row[map.colBdd]);
      const bddPercent = bddRaw > 0 && bddRaw <= 1 ? bddRaw * 100 : bddRaw || 100;
      const kebutuhan = num(row[map.colKebutuhanBahan]);
      const hargaBahan = num(row[map.colHargaBahan]);
      const hargaTotal = num(row[map.colHargaTotalBahan]) || (kebutuhan > 0 && hargaBahan > 0 ? kebutuhan * hargaBahan : 0);

      bahanItems.push({
        rincianBahan: bahanOrder,
        hargaBahan,
        bddPercent,
        beratKotor: num(row[map.colBeratKotor]),
        totalGml: num(row[map.colTotalGml]),
        sparePercent: num(row[map.colSpareBahan]) || 2,
        kebutuhan,
        satuan: str(row[map.colSatuanBahan]) || 'kg',
        harga: hargaTotal,
      });
    }

    // C. Pesanan Bumbu (Cols X - AD)
    const bumbuNama = str(row[map.colNamaBumbu]);
    if (
      bumbuNama &&
      bumbuNama.toLowerCase() !== 'jenis bumbu' &&
      bumbuNama.toLowerCase() !== 'nama bumbu' &&
      bumbuNama.toLowerCase() !== 'total pembelanjaan bumbu'
    ) {
      const bumbuMenu = str(row[map.colMenuBumbu]) || currentMenuName || '';
      const kebutuhan = num(row[map.colKebutuhanBumbu]);
      const hargaBumbu = num(row[map.colHargaBumbu]);
      const hargaTotal = num(row[map.colHargaTotalBumbu]) || (kebutuhan > 0 && hargaBumbu > 0 ? kebutuhan * hargaBumbu : 0);

      bumbuItems.push({
        namaMenu: bumbuMenu,
        namaBumbu: bumbuNama,
        hargaBumbu,
        kebutuhan,
        satuan: str(row[map.colSatuanBumbu]) || 'kg',
        harga: hargaTotal,
      });
    }
  }

  // Parse Total Row
  const totalRow = rows[endRow];
  const totalGizi = {
    beratBersih: nutritionItems.reduce((s, it) => s + it.beratBersih, 0),
    energi: num(totalRow?.[map.colEnergi]) || nutritionItems.reduce((s, it) => s + it.energi, 0),
    protein: num(totalRow?.[map.colProtein]) || nutritionItems.reduce((s, it) => s + it.protein, 0),
    lemak: num(totalRow?.[map.colLemak]) || nutritionItems.reduce((s, it) => s + it.lemak, 0),
    karbohidrat: num(totalRow?.[map.colKarbo]) || nutritionItems.reduce((s, it) => s + it.karbohidrat, 0),
    serat: num(totalRow?.[map.colSerat]) || nutritionItems.reduce((s, it) => s + it.serat, 0),
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
    const label = str(row[map.colSectionHeader]).toLowerCase();
    if (!label.includes('pemenuhan')) continue;

    const isMakanSiang = label.includes('makan siang');
    const energiVal = num(row[map.colEnergi]);

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
    num(totalRow?.[map.colHargaTotalBahan]) ||
    bahanItems.reduce((s, b) => s + b.harga, 0);
  const totalBelanjaBumbu =
    num(totalRow?.[map.colHargaTotalBumbu]) ||
    bumbuItems.reduce((s, b) => s + b.harga, 0);

  const hargaBahanPerPorsi = pmCount > 0 ? totalBelanjaBahan / pmCount : 0;
  const hargaBumbuPerPorsi = pmCount > 0 ? totalBelanjaBumbu / pmCount : 0;

  return {
    portionType,
    portionTitle: title,
    pmCount,
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

  // Strategy 1: Explicit headers (if sheet has PORSI KECIL / PORSI BESAR)
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
      ranges.push({ ...currentRange, endRow: i });
      currentRange = null;
    }
  }

  if (ranges.length > 0) {
    return ranges;
  }

  // Strategy 2: Standard MBG Daily Template layout (Column E has Totals at rows 14, 31, 50, etc.)
  const totals: number[] = [];
  for (let i = 0; i < Math.min(rows.length, 80); i++) {
    const val = str(rows[i]?.[COL_SECTION_HEADER]).toUpperCase();
    if (val === 'TOTAL') {
      totals.push(i);
    }
  }

  if (totals.length >= 1) {
    // Block 1 is Porsi Kecil: starts row 2, ends at totals[0]
    ranges.push({
      title: 'PORSI KECIL',
      portionType: 'kecil',
      startRow: 2,
      endRow: totals[0],
    });

    if (totals.length >= 2) {
      // Block 2 is Porsi Besar: starts after %pemenuhan of block 1, ends at totals[1]
      let startBesar = totals[0] + 1;
      while (startBesar < totals[1] && (str(rows[startBesar]?.[COL_SECTION_HEADER]).startsWith('%') || !str(rows[startBesar]?.[COL_BAHAN_GIZI]))) {
        startBesar++;
      }
      ranges.push({
        title: 'PORSI BESAR',
        portionType: 'besar',
        startRow: startBesar,
        endRow: totals[1],
      });

      if (totals.length >= 3) {
        // Block 3 is Ompreng Balita: starts after %pemenuhan of block 2, ends at totals[2]
        let startBalita = totals[1] + 1;
        while (startBalita < totals[2] && (str(rows[startBalita]?.[COL_SECTION_HEADER]).startsWith('%') || !str(rows[startBalita]?.[COL_BAHAN_GIZI]))) {
          startBalita++;
        }
        ranges.push({
          title: 'PORSI BALITA',
          portionType: 'balita',
          startRow: startBalita,
          endRow: totals[2],
        });
      }
    }
  }

  return ranges;
}

// ─── Main Parser ────────────────────────────────────────────────────────────

export function parseProductionSheetRows(
  rows: unknown[][],
  batchId: string,
  tanggal: string,
  sheetDayName: string,
  workbook?: unknown
): Omit<MbgProductionDailyReport, 'id'> {
  if (!rows || rows.length < 10) {
    return createEmptyReport(batchId, tanggal, sheetDayName);
  }

  // 1. Extract PM counts from top-left block
  let pmOmprengKecil = num(rows[0]?.[COL_PM_COUNT1]);
  let pmOmprengBesar = num(rows[1]?.[COL_PM_COUNT1]);
  let pmBalita = num(rows[2]?.[COL_PM_COUNT1]);
  let pmBumil = num(rows[3]?.[COL_PM_COUNT1]);

  for (let r = 0; r < 6; r++) {
    const lbl = str(rows[r]?.[COL_PM_LABEL]).toUpperCase();
    const count = num(rows[r]?.[COL_PM_COUNT1]) || num(rows[r]?.[COL_PM_COUNT2]);
    if (lbl.includes('KECIL') && count > 0) pmOmprengKecil = count;
    if (lbl.includes('BESAR') && count > 0) pmOmprengBesar = count;
    if (lbl.includes('BALITA') && count > 0) pmBalita = count;
    if ((lbl.includes('BUMIL') || lbl.includes('BUSUI')) && count > 0) pmBumil = count;
  }

  // 2. Extract Menu List
  const menuList = extractMenuList(rows);

  // 3. Resolve Sheet Column Map dynamically
  const colMap = resolveSheetColumnIndices(rows);

  // 4. Find and parse portion blocks
  const ranges = findPortionRanges(rows);

  const rangeKecil = ranges.find((r) => r.portionType === 'kecil');
  const rangeBesar = ranges.find((r) => r.portionType === 'besar');
  const rangeBalita = ranges.find((r) => r.portionType === 'balita');
  const rangeBumil = ranges.find((r) => r.portionType === 'bumil_busui');

  const porsiKecil = rangeKecil
    ? parsePortionBlock(rows, rangeKecil, menuList, pmOmprengKecil, colMap)
    : createEmptyPortionData('kecil', 'PORSI KECIL');

  const porsiBesar = rangeBesar
    ? parsePortionBlock(rows, rangeBesar, menuList, pmOmprengBesar, colMap)
    : createEmptyPortionData('besar', 'PORSI BESAR');

  let porsiBalita = rangeBalita
    ? parsePortionBlock(rows, rangeBalita, menuList, pmBalita, colMap)
    : createEmptyPortionData('balita', 'PORSI BALITA');

  let porsiBumilBusui = rangeBumil
    ? parsePortionBlock(rows, rangeBumil, menuList, pmBumil, colMap)
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

  // 4. Parse Menu 3B Keringan (Bumil & Balita) from Col AM (38)
  const bumilKeringanItems: {
    item: string;
    qtyPcs: number;
    qty: number;
    satuan: string;
    energi: number;
    protein: number;
    lemak: number;
    karbo: number;
    serat: number;
    hargaSatuan: number;
    totalHarga: number;
  }[] = [];

  const balitaKeringanItems: {
    item: string;
    qtyPcs: number;
    qty: number;
    satuan: string;
    energi: number;
    protein: number;
    lemak: number;
    karbo: number;
    serat: number;
    hargaSatuan: number;
    totalHarga: number;
  }[] = [];

  let current3bGroup: 'bumil' | 'balita' | null = null;
  for (let r = 2; r < Math.min(rows.length, 35); r++) {
    const row = rows[r] || [];
    const label = str(row[COL_KERING_ITEM]).toUpperCase();

    if (label.includes('BUMIL') && !label.includes('%')) {
      current3bGroup = 'bumil';
      const count = num(row[COL_KERING_QTY_PCS]);
      if (count > 0) pmBumil = count;
      continue;
    } else if (label.includes('BALITA') && !label.includes('%')) {
      current3bGroup = 'balita';
      const count = num(row[COL_KERING_QTY_PCS]);
      if (count > 0) pmBalita = count;
      continue;
    } else if (label === 'TOTAL') {
      current3bGroup = null;
      continue;
    }

    const itemName = str(row[COL_KERING_ITEM]);
    if (itemName && current3bGroup && !itemName.startsWith('%') && itemName.toLowerCase() !== 'item') {
      const qtyPcs = num(row[COL_KERING_QTY_PCS]) || 1;
      const energi = num(row[COL_KERING_ENERGI]);
      const protein = num(row[COL_KERING_PROTEIN]);
      const lemak = num(row[COL_KERING_LEMAK]);
      const karbo = num(row[COL_KERING_KARBO]);
      const serat = num(row[COL_KERING_SERAT]);
      const kebutuhan = num(row[COL_KERING_KEBUTUHAN]) || qtyPcs;
      const hargaSatuan = num(row[COL_KERING_HARGA_SATUAN]);
      const totalHarga = num(row[COL_KERING_TOTAL]) || kebutuhan * hargaSatuan;

      const itemObj = {
        item: itemName,
        qtyPcs,
        qty: kebutuhan,
        satuan: 'pcs',
        energi,
        protein,
        lemak,
        karbo,
        serat,
        hargaSatuan,
        totalHarga,
      };

      if (current3bGroup === 'bumil') {
        bumilKeringanItems.push(itemObj);
      } else {
        balitaKeringanItems.push(itemObj);
      }
    }
  }

  // Populate porsiBumilBusui from Keringan items if empty
  if (porsiBumilBusui.nutritionItems.length === 0 && bumilKeringanItems.length > 0) {
    const totalHargaBumil = bumilKeringanItems.reduce((s, it) => s + it.totalHarga, 0);
    porsiBumilBusui = {
      portionType: 'bumil_busui',
      portionTitle: 'PORSI BUMIL/BUSUI',
      pmCount: pmBumil || 0,
      menuList: ['Paket Sehat 3B Bumil & Busui'],
      nutritionItems: bumilKeringanItems.map((it) => ({
        menuName: 'Paket Sehat 3B Bumil',
        rincianBahan: it.item,
        beratBersih: 0,
        energi: it.energi,
        protein: it.protein,
        lemak: it.lemak,
        karbohidrat: it.karbo,
        serat: it.serat,
      })),
      bahanItems: bumilKeringanItems.map((it) => ({
        rincianBahan: it.item,
        hargaBahan: it.hargaSatuan,
        bddPercent: 100,
        beratKotor: it.qty,
        totalGml: it.qty,
        sparePercent: 0,
        kebutuhan: it.qty,
        satuan: it.satuan,
        harga: it.totalHarga,
      })),
      bumbuItems: [],
      totalGizi: {
        beratBersih: 0,
        energi: bumilKeringanItems.reduce((s, it) => s + it.energi, 0),
        protein: bumilKeringanItems.reduce((s, it) => s + it.protein, 0),
        lemak: bumilKeringanItems.reduce((s, it) => s + it.lemak, 0),
        karbohidrat: bumilKeringanItems.reduce((s, it) => s + it.karbo, 0),
        serat: bumilKeringanItems.reduce((s, it) => s + it.serat, 0),
      },
      akgMetrics: {},
      totalBelanjaBahan: totalHargaBumil,
      hargaBahanPerPorsi: pmBumil > 0 ? totalHargaBumil / pmBumil : 0,
      totalBelanjaBumbu: 0,
      hargaBumbuPerPorsi: 0,
      totalBelanjaOverall: totalHargaBumil,
      hargaPerPorsiOverall: pmBumil > 0 ? totalHargaBumil / pmBumil : 0,
    };
  }

  // Populate porsiBalita from Keringan items if empty
  if (porsiBalita.nutritionItems.length === 0 && balitaKeringanItems.length > 0) {
    const totalHargaBalita = balitaKeringanItems.reduce((s, it) => s + it.totalHarga, 0);
    porsiBalita = {
      portionType: 'balita',
      portionTitle: 'PORSI BALITA',
      pmCount: pmBalita || 0,
      menuList: ['Paket Sehat 3B Balita'],
      nutritionItems: balitaKeringanItems.map((it) => ({
        menuName: 'Paket Sehat 3B Balita',
        rincianBahan: it.item,
        beratBersih: 0,
        energi: it.energi,
        protein: it.protein,
        lemak: it.lemak,
        karbohidrat: it.karbo,
        serat: it.serat,
      })),
      bahanItems: balitaKeringanItems.map((it) => ({
        rincianBahan: it.item,
        hargaBahan: it.hargaSatuan,
        bddPercent: 100,
        beratKotor: it.qty,
        totalGml: it.qty,
        sparePercent: 0,
        kebutuhan: it.qty,
        satuan: it.satuan,
        harga: it.totalHarga,
      })),
      bumbuItems: [],
      totalGizi: {
        beratBersih: 0,
        energi: balitaKeringanItems.reduce((s, it) => s + it.energi, 0),
        protein: balitaKeringanItems.reduce((s, it) => s + it.protein, 0),
        lemak: balitaKeringanItems.reduce((s, it) => s + it.lemak, 0),
        karbohidrat: balitaKeringanItems.reduce((s, it) => s + it.karbo, 0),
        serat: balitaKeringanItems.reduce((s, it) => s + it.serat, 0),
      },
      akgMetrics: {},
      totalBelanjaBahan: totalHargaBalita,
      hargaBahanPerPorsi: pmBalita > 0 ? totalHargaBalita / pmBalita : 0,
      totalBelanjaBumbu: 0,
      hargaBumbuPerPorsi: 0,
      totalBelanjaOverall: totalHargaBalita,
      hargaPerPorsiOverall: pmBalita > 0 ? totalHargaBalita / pmBalita : 0,
    };
  }

  const paketSehat3b = {
    balitaCount: pmBalita || 0,
    bumilBusuiCount: pmBumil || 0,
    keringanItems: [...bumilKeringanItems, ...balitaKeringanItems],
  };

  // 5. Extract Sekolah Yang Dikirim
  const sekolahList: { nama: string; murid: number; guru: number }[] = [];

  // Find "Sekolah Yang Dikirim" header dynamically across columns in rows 0-5
  let colSekolahNama = -1;
  let rowSekolahHeader = -1;
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellVal = str(row[c]).toLowerCase();
      if (cellVal.includes('sekolah') && cellVal.includes('dikirim')) {
        colSekolahNama = c;
        rowSekolahHeader = r;
        break;
      }
    }
    if (colSekolahNama !== -1) break;
  }

  if (colSekolahNama !== -1) {
    const startR = rowSekolahHeader + 2; // skip header and 'Murid'/'Guru' subheader
    for (let r = startR; r < Math.min(rows.length, startR + 40); r++) {
      const row = rows[r] || [];
      const nama = str(row[colSekolahNama]);
      if (nama && !nama.toLowerCase().includes('total') && !nama.toLowerCase().includes('murid')) {
        sekolahList.push({
          nama,
          murid: num(row[colSekolahNama + 1]),
          guru: num(row[colSekolahNama + 2]),
        });
      }
    }
  } else {
    // Fallback: check fixed COL_SEKOLAH_NAMA
    for (let r = 2; r < Math.min(rows.length, 50); r++) {
      const row = rows[r] || [];
      const nama = str(row[COL_SEKOLAH_NAMA]);
      if (nama && nama !== 'Sekolah Yang Dikirim:' && !nama.toLowerCase().includes('murid') && !nama.toLowerCase().includes('total')) {
        sekolahList.push({
          nama,
          murid: num(row[COL_SEKOLAH_MURID]),
          guru: num(row[COL_SEKOLAH_GURU]),
        });
      }
    }
  }

  // Fallback: if not found in current sheet, check workbook 'Penerima Manfaat' sheets
  if (sekolahList.length === 0 && workbook && typeof workbook === 'object' && 'Sheets' in (workbook as Record<string, unknown>)) {
    const wb = workbook as { Sheets: Record<string, unknown> };
    const pmSheetNames = Object.keys(wb.Sheets).filter((name) =>
      name.toLowerCase().includes('penerima manfaat')
    );
    for (const pmName of pmSheetNames) {
      const pmWs = wb.Sheets[pmName];
      const pmRows = XLSX.utils.sheet_to_json(pmWs as XLSX.WorkSheet, { header: 1 }) as unknown[][];
      for (let r = 1; r < Math.min(pmRows.length, 35); r++) {
        const row = pmRows[r] || [];
        const no = row[0];
        const nama = str(row[1]);
        const murid = num(row[2]);
        const guru = num(row[3]);
        if (
          nama &&
          !nama.toLowerCase().includes('total') &&
          !nama.toLowerCase().includes('porsi') &&
          !nama.toLowerCase().includes('paud/tk') &&
          !nama.toLowerCase().includes('sd/mi') &&
          !nama.toLowerCase().includes('smp/mts') &&
          !nama.toLowerCase().includes('sma/ma') &&
          (typeof no === 'number' || (typeof no === 'string' && !isNaN(Number(no))))
        ) {
          sekolahList.push({ nama, murid, guru });
        }
      }
      if (sekolahList.length > 0) break;
    }
  }

  // 6. Extract Production Notes / Catatan Dapur dynamically
  const productionNotes: string[] = [];
  let colNotes = -1;
  let rowNotes = -1;
  for (let r = 0; r < Math.min(rows.length, 15); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const cellVal = str(row[c]).toLowerCase();
      if (cellVal.startsWith('catatan') || cellVal.includes('catatan :') || cellVal.includes('evaluasi produksi')) {
        colNotes = c;
        rowNotes = r;
        break;
      }
    }
    if (colNotes !== -1) break;
  }

  if (colNotes !== -1) {
    for (let r = rowNotes; r < Math.min(rows.length, rowNotes + 15); r++) {
      const note = str(rows[r]?.[colNotes]);
      if (note && !productionNotes.includes(note)) {
        productionNotes.push(note);
      }
    }
  } else {
    // Fallback to COL_EVAL_PRODUKSI
    for (let r = 0; r < Math.min(rows.length, 50); r++) {
      const note = str(rows[r]?.[COL_EVAL_PRODUKSI]);
      if (note && !note.toLowerCase().includes('catatan') && !productionNotes.includes(note)) {
        productionNotes.push(note);
      }
    }
  }

  // 7. Extract PO Rows / Logistik Kedatangan with Real Suppliers
  // First check if there is a dedicated Supplier Table block (e.g., Image 5: Supplier, List Pesanan Bahan, Kedatangan, Jumlah, Item, n, Harga Satuan, Total Harga)
  let dedicatedSupplierCol = -1;
  let dedicatedSupplierRow = -1;
  for (let r = 0; r < Math.min(rows.length, 6); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const val = str(row[c]).toLowerCase();
      const valNext = str(row[c + 1]).toLowerCase();
      if (val === 'supplier' && (valNext.includes('pesanan') || valNext.includes('bahan') || valNext.includes('list'))) {
        dedicatedSupplierCol = c;
        dedicatedSupplierRow = r;
        break;
      }
    }
    if (dedicatedSupplierCol !== -1) break;
  }

  const dedicatedPoRows: MbgPoReportRow[] = [];
  if (dedicatedSupplierCol !== -1) {
    const c = dedicatedSupplierCol;
    let currentSupplier = 'Supplier MBG';
    for (let r = dedicatedSupplierRow + 1; r < Math.min(rows.length, dedicatedSupplierRow + 60); r++) {
      const row = rows[r] || [];
      const suppInRow = str(row[c]);
      if (suppInRow && !suppInRow.toLowerCase().includes('total') && !suppInRow.startsWith('=')) {
        currentSupplier = suppInRow;
      }
      const item = str(row[c + 1]);
      if (!item || item.toLowerCase().includes('total') || item.toLowerCase() === 'list pesanan bahan' || item.startsWith('=')) {
        continue;
      }
      const jamKedatangan = str(row[c + 2]) || '06:00';
      const jumlah = num(row[c + 3]);
      const satuan = str(row[c + 4]) || 'kg';
      // In sheet: col c+6 is Harga Satuan, col c+7 is Total Harga
      const hargaSatuan = num(row[c + 6]);
      const totalHarga = num(row[c + 7]) || (jumlah > 0 && hargaSatuan > 0 ? jumlah * hargaSatuan : 0);

      dedicatedPoRows.push({
        supplier: currentSupplier,
        item,
        jamKedatangan,
        jumlah: Math.round(jumlah * 100) / 100,
        satuan,
        keterangan: 'Sesuai Spesifikasi',
        hargaSatuan: hargaSatuan > 0 ? hargaSatuan : undefined,
        totalHarga: totalHarga > 0 ? totalHarga : undefined,
      });
    }
  }

  const rawPoItems: { supplier: string; item: string; jumlah: number; satuan: string; hargaSatuan: number; harga: number }[] = [];

  for (let r = 2; r < Math.min(rows.length, 60); r++) {
    const row = rows[r] || [];
    const bSup = str(row[colMap.colSupplierBahan]);
    const bName = str(row[colMap.colBahanOrder]);
    if (bName && bName.toLowerCase() !== 'rincian bahan' && bName.toLowerCase() !== 'total pembelanjaan') {
      const hUnit = num(row[colMap.colHargaBahan]);
      const hTotal = num(row[colMap.colHargaTotalBahan]);
      rawPoItems.push({
        supplier: bSup || 'Koperasi Al Umanaa',
        item: bName,
        jumlah: num(row[colMap.colKebutuhanBahan]),
        satuan: str(row[colMap.colSatuanBahan]) || 'kg',
        hargaSatuan: hUnit,
        harga: hTotal,
      });
    }

    const bmSup = str(row[colMap.colSupplierBumbu]);
    const bmName = str(row[colMap.colNamaBumbu]);
    if (bmName && bmName.toLowerCase() !== 'jenis bumbu' && bmName.toLowerCase() !== 'total pembelanjaan bumbu') {
      const hUnit = num(row[colMap.colHargaBumbu]);
      const hTotal = num(row[colMap.colHargaTotalBumbu]);
      rawPoItems.push({
        supplier: bmSup || 'Supplier Bumbu',
        item: bmName,
        jumlah: num(row[colMap.colKebutuhanBumbu]),
        satuan: str(row[colMap.colSatuanBumbu]) || 'kg',
        hargaSatuan: hUnit,
        harga: hTotal,
      });
    }
  }

  for (const it of paketSehat3b.keringanItems) {
    rawPoItems.push({
      supplier: 'Supplier Keringan 3B',
      item: it.item,
      jumlah: it.qty,
      satuan: it.satuan,
      hargaSatuan: it.hargaSatuan || 0,
      harga: it.totalHarga || 0,
    });
  }

  // Consolidate duplicates by supplier + item
  const poMap = new Map<string, MbgPoReportRow>();
  for (const entry of rawPoItems) {
    const key = `${entry.supplier.toLowerCase()}___${entry.item.toLowerCase()}`;
    if (!poMap.has(key)) {
      poMap.set(key, {
        supplier: entry.supplier,
        item: entry.item,
        jamKedatangan: '06:00',
        jumlah: Math.round(entry.jumlah * 100) / 100,
        satuan: entry.satuan,
        keterangan: 'Sesuai Spesifikasi',
        hargaSatuan: entry.hargaSatuan > 0 ? entry.hargaSatuan : undefined,
        totalHarga: entry.harga > 0 ? entry.harga : undefined,
      });
    } else {
      const exist = poMap.get(key)!;
      exist.jumlah = Math.round((exist.jumlah + entry.jumlah) * 100) / 100;
      if (entry.harga > 0) {
        exist.totalHarga = (exist.totalHarga || 0) + entry.harga;
      }
      if (!exist.hargaSatuan && entry.hargaSatuan > 0) {
        exist.hargaSatuan = entry.hargaSatuan;
      }
    }
  }
  const poRows: MbgPoReportRow[] = dedicatedPoRows.length > 0 ? dedicatedPoRows : Array.from(poMap.values());

  // 8. Realisasi Pembelian Rows
  const realisasiPembelianRows: MbgRealisasiPembelianRow[] = (dedicatedPoRows.length > 0 ? dedicatedPoRows : rawPoItems).map((item) => ({
    tanggal: tanggal || '',
    namaBahan: item.item,
    kuantitas: item.jumlah,
    satuan: item.satuan,
    hargaPerUnit: item.hargaSatuan || (item.jumlah > 0 && (item as { harga?: number }).harga ? Math.round((item as { harga?: number }).harga! / item.jumlah) : 0),
    totalHarga: (item as { totalHarga?: number }).totalHarga || (item as { harga?: number }).harga || ((item.jumlah || 0) * (item.hargaSatuan || 0)),
  }));

  const totalPengeluaran =
    dedicatedPoRows.length > 0
      ? dedicatedPoRows.reduce((s, it) => s + (it.totalHarga || 0), 0)
      : (porsiKecil.totalBelanjaOverall +
         porsiBesar.totalBelanjaOverall +
         porsiBalita.totalBelanjaOverall +
         porsiBumilBusui.totalBelanjaOverall ||
         realisasiPembelianRows.reduce((s, r) => s + r.totalHarga, 0));

  // 9. Inspection Form
  const inspectionRows: MbgInspectionFormRow[] = poRows.map((po) => ({
    jenisBahan: po.item,
    banyaknya: po.jumlah,
    satuan: po.satuan,
    isSesuai: true,
    isBaik: true,
    notes: 'Kualitas Segar & Sesuai Spesifikasi',
  }));

  // 10. Food Waste Logs
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
    sekolahList,
    productionNotes,
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
    pmCount: 0,
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
      officerName: 'Ragha Eskha Utama, S.Hum.',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs: [],
    createdBy: '',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

// ─── Penerima Manfaat Sheet Parser ──────────────────────────────────────────

/**
 * Parses the "Penerima Manfaat" worksheet from the MBG master workbook.
 * Maps all 27 schools/institutions (PAUD, SD, SMP, SMA, Balita, Bumil, Busui)
 * into MbgPmEntry objects ready for batch insertion into Firestore.
 */
export function parsePenerimaManfaatSheet(
  ws: XLSX.WorkSheet,
  batchId: string,
  pekanIndex = 1,
  createdBy = 'import_excel'
): Omit<MbgPmEntry, 'id'>[] {
  const rows: unknown[][] = XLSX.utils.sheet_to_json(ws, { header: 1 });
  const entries: Omit<MbgPmEntry, 'id'>[] = [];

  // Determine columns based on pekan:
  // Pekan 1: Col 2 (Jumlah), Col 3 (PIC/Guru), Col 4 (Total)
  // Pekan 2: Col 5, 6, 7
  // Pekan 3: Col 8, 9, 10
  // Pekan 4: Col 11, 12, 13
  const colMurid = 2 + (pekanIndex - 1) * 3;
  const colGuru = colMurid + 1;
  const colTotal = colMurid + 2;

  for (let r = 2; r < Math.min(rows.length, 35); r++) {
    const row = rows[r] || [];
    const no = row[0];
    const name = str(row[1]);
    if (!name || name.toLowerCase().includes('total')) continue;
    if (typeof no !== 'number' && isNaN(Number(no))) continue;

    const murid = num(row[colMurid]) || num(row[2]);
    const guru = num(row[colGuru]) || num(row[3]);
    const total = num(row[colTotal]) || (murid + guru);

    const nameLower = name.toLowerCase();
    let type: MbgInstitutionType = 'sekolah';
    let schoolLevel: 'tk_paud' | 'sd' | 'sma' | undefined = 'sd';
    let qtSiswa = murid;
    let qtBumil = 0;
    let qtBusui = 0;
    let qtBumilBusui = 0;

    if (nameLower.includes('balita')) {
      type = 'posyandu';
      schoolLevel = undefined;
    } else if (nameLower.includes('bumil')) {
      type = 'posyandu';
      qtBumil = murid;
      qtBumilBusui = murid;
      qtSiswa = 0;
      schoolLevel = undefined;
    } else if (nameLower.includes('busui')) {
      type = 'posyandu';
      qtBusui = murid;
      qtBumilBusui = murid;
      qtSiswa = 0;
      schoolLevel = undefined;
    } else if (nameLower.includes('tk') || nameLower.includes('paud') || nameLower.includes('sps')) {
      schoolLevel = 'tk_paud';
    } else if (nameLower.includes('sd') || nameLower.includes('mi ')) {
      schoolLevel = 'sd';
    } else if (
      nameLower.includes('smp') ||
      nameLower.includes('mts') ||
      nameLower.includes('sma') ||
      nameLower.includes('smk') ||
      nameLower.includes('ma ')
    ) {
      schoolLevel = 'sma';
    }

    entries.push({
      batchId,
      institutionName: name,
      institutionType: type,
      schoolLevel,
      qtSiswaBalita: qtSiswa,
      qtBumil: qtBumil || undefined,
      qtBusui: qtBusui || undefined,
      qtBumilBusui,
      qtGuruKader: guru,
      qtPobiaNasi: 0,
      qtPorsiBalita: type === 'posyandu' && nameLower.includes('balita') ? murid : undefined,
      qtPorsiBumilBusui: type === 'posyandu' && (qtBumil > 0 || qtBusui > 0) ? murid : undefined,
      jumlah: total,
      jadwalPengantaran: '06.30-08.30',
      assignedPetugasId: '',
      assignedPetugasName: '',
      menuItems: [],
      menuKeringanItems: [],
      isSekolahLibur: total === 0,
      notes: '',
      sortOrder: entries.length + 1,
      createdBy,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return entries;
}
