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
  MbgPmBatch,
  MbgPmEntry,
  MbgDayMenu,
} from '@/types/mbg';
import { getMenuForDate } from '@/services/mbgAdminService';
import { DEFAULT_WEEKLY_SCHEDULE } from '@/constants/mbgConstants';
import standarResepData from '@/constants/standarResep.json';
import tkpiData from '@/constants/tkpiDatabase.json';

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
const COL_BERAT_BERSIH = 7; // H: Berat Bersih (g)
const COL_ENERGI = 8; // I: Energi (kkal)
const COL_PROTEIN = 9; // J: Protein (g)
const COL_LEMAK = 10; // K: Lemak (g)
const COL_KARBO = 11; // L: Karbohidrat (g)
const COL_SERAT = 12; // M: Serat (g)

// PESANAN BAHAN MAKANAN (Cols N - Z)
const COL_SUPPLIER_BAHAN = 13; // N: Supplier
const COL_BAHAN_ORDER = 14; // O: Rincian Bahan (pesanan)
const COL_HARGA_BAHAN = 15; // P: Harga Bahan per unit
const COL_SATUAN_BAHAN = 17; // R: Satuan
const COL_BDD = 18; // S: %BDD (e.g. 1.0, 0.89, 0.85)
const COL_BERAT_KOTOR = 19; // T: Berat Kotor
const COL_TOTAL_GML = 20; // U: Total (g/ml)
const COL_KEBUTUHAN_BAHAN = 21; // V: Kebutuhan (Per Unit / Kg)
const COL_HARGA_TOTAL_BAHAN = 23; // X: Total Harga Bahan

// PESANAN BUMBU (Cols AA - AH)
const COL_BUMBU_SUPPLIER = 26; // AA: Supplier Bumbu
const COL_BUMBU_NAMA = 27; // AB: Jenis Bumbu
const COL_BUMBU_HARGA_SATUAN = 28; // AC: Harga Bumbu
const COL_BUMBU_SATUAN = 30; // AE: Satuan (kg, ikat, pcs)
const COL_BUMBU_KEBUTUHAN = 31; // AF: Kebutuhan (Jumlah)
const COL_BUMBU_TOTAL_HARGA = 32; // AG: Total Harga Bumbu

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

    // B. Pesanan Bahan Makanan (Col O - X)
    const bahanOrder = str(row[COL_BAHAN_ORDER]);
    if (
      bahanOrder &&
      bahanOrder.toLowerCase() !== 'rincian bahan' &&
      bahanOrder.toLowerCase() !== 'total pembelanjaan'
    ) {
      const bddRaw = num(row[COL_BDD]);
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

    // C. Pesanan Bumbu (Col AB - AG)
    const bumbuNama = str(row[COL_BUMBU_NAMA]);
    if (
      bumbuNama &&
      bumbuNama.toLowerCase() !== 'jenis bumbu' &&
      bumbuNama.toLowerCase() !== 'nama bumbu' &&
      bumbuNama.toLowerCase() !== 'total pembelanjaan bumbu'
    ) {
      const bumbuMenu = currentMenuName || '';
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

  // 3. Find and parse portion blocks
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

  let porsiBalita = rangeBalita
    ? parsePortionBlock(rows, rangeBalita, menuList, pmBalita)
    : createEmptyPortionData('balita', 'PORSI BALITA');

  let porsiBumilBusui = rangeBumil
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
  const rawPoItems: { supplier: string; item: string; jumlah: number; satuan: string; harga: number }[] = [];

  for (let r = 2; r < Math.min(rows.length, 60); r++) {
    const row = rows[r] || [];
    const bSup = str(row[COL_SUPPLIER_BAHAN]);
    const bName = str(row[COL_BAHAN_ORDER]);
    if (bName && bName.toLowerCase() !== 'rincian bahan' && bName.toLowerCase() !== 'total pembelanjaan') {
      rawPoItems.push({
        supplier: bSup || 'Koperasi Al Umanaa',
        item: bName,
        jumlah: num(row[COL_KEBUTUHAN_BAHAN]),
        satuan: str(row[COL_SATUAN_BAHAN]) || 'kg',
        harga: num(row[COL_HARGA_TOTAL_BAHAN]),
      });
    }

    const bmSup = str(row[COL_BUMBU_SUPPLIER]);
    const bmName = str(row[COL_BUMBU_NAMA]);
    if (bmName && bmName.toLowerCase() !== 'jenis bumbu' && bmName.toLowerCase() !== 'total pembelanjaan bumbu') {
      rawPoItems.push({
        supplier: bmSup || 'Supplier Bumbu',
        item: bmName,
        jumlah: num(row[COL_BUMBU_KEBUTUHAN]),
        satuan: str(row[COL_BUMBU_SATUAN]) || 'kg',
        harga: num(row[COL_BUMBU_TOTAL_HARGA]),
      });
    }
  }

  for (const it of paketSehat3b.keringanItems) {
    rawPoItems.push({
      supplier: 'Supplier Keringan 3B',
      item: it.item,
      jumlah: it.qty,
      satuan: it.satuan,
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
      });
    } else {
      const exist = poMap.get(key)!;
      exist.jumlah = Math.round((exist.jumlah + entry.jumlah) * 100) / 100;
    }
  }
  const poRows: MbgPoReportRow[] = Array.from(poMap.values());

  // 8. Realisasi Pembelian Rows
  const realisasiPembelianRows: MbgRealisasiPembelianRow[] = rawPoItems.map((item) => ({
    tanggal: tanggal || '',
    namaBahan: item.item,
    kuantitas: item.jumlah,
    satuan: item.satuan,
    hargaPerUnit: item.jumlah > 0 ? Math.round(item.harga / item.jumlah) : 0,
    totalHarga: item.harga,
  }));

  const totalPengeluaran =
    porsiKecil.totalBelanjaOverall +
    porsiBesar.totalBelanjaOverall +
    porsiBalita.totalBelanjaOverall +
    porsiBumilBusui.totalBelanjaOverall ||
    realisasiPembelianRows.reduce((s, r) => s + r.totalHarga, 0);

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

/**
 * Automatically synthesizes a complete 8-page operational daily report from
 * batch demographics, entries, standard recipes, and TKPI database.
 */
export function generateDailyReportFromBatchData(
  batch: MbgPmBatch,
  entries: MbgPmEntry[],
  weeklySchedule?: MbgDayMenu[],
  customRecipes?: unknown[]
): MbgProductionDailyReport {
  const tanggal = batch.tanggal || new Date().toISOString().split('T')[0];
  const { dayMenu, menuItems } = getMenuForDate(tanggal, weeklySchedule || DEFAULT_WEEKLY_SCHEDULE);
  const dayName = dayMenu?.dayName ? dayMenu.dayName.toUpperCase() : 'HARI OPERASIONAL';

  // 1. Calculate Demographics
  let countKecil = 0;
  let countBesar = 0;
  let countBalita = 0;
  let countBumilBusui = 0;

  entries.forEach((e) => {
    if (e.isSekolahLibur) return;
    if (e.institutionType === 'sekolah') {
      if (e.schoolLevel === 'tk_paud') {
        countKecil += e.jumlah || 0;
      } else if (e.schoolLevel === 'sd') {
        countKecil += e.qtPorsiKecil || Math.ceil((e.jumlah || 0) / 2);
        countBesar += e.qtPorsiBesar || Math.floor((e.jumlah || 0) / 2);
      } else {
        countBesar += e.jumlah || 0;
      }
    } else {
      countBalita += e.qtPorsiBalita || e.qtSiswaBalita || 0;
      const bCount = (e.qtBumil || 0) + (e.qtBusui || 0) + (e.qtBumilBusui || 0);
      countBumilBusui += bCount;
    }
  });

  const totalPorsi = countKecil + countBesar + countBalita + countBumilBusui || batch.totalJumlah || 2957;
  if (countKecil === 0 && countBesar === 0) {
    countKecil = Math.round(totalPorsi * 0.45);
    countBesar = Math.round(totalPorsi * 0.50);
    countBalita = Math.round(totalPorsi * 0.03);
    countBumilBusui = totalPorsi - (countKecil + countBesar + countBalita);
  }

  interface RecipeItem {
    namaMenu: string;
    mainBahan: string;
    ingredients?: { bahan: string; kebutuhan: number; satuan: string }[];
  }
  const allRecipes = [...(standarResepData as RecipeItem[]), ...((customRecipes as RecipeItem[]) || [])];

  interface TkpiItem {
    nama: string;
    energi?: number;
    protein?: number;
    lemak?: number;
    kh?: number;
    serat?: number;
  }
  const findTkpi = (name: string): TkpiItem => {
    const q = name.toLowerCase().trim();
    let match = (tkpiData as TkpiItem[]).find((t) => t.nama.toLowerCase().trim() === q);
    if (!match) {
      match = (tkpiData as TkpiItem[]).find((t) => t.nama.toLowerCase().includes(q) || q.includes(t.nama.toLowerCase()));
    }
    return match || { nama: name, energi: 150, protein: 7, lemak: 4, kh: 20, serat: 1.5 };
  };

  const buildPortion = (
    portionType: 'kecil' | 'besar' | 'balita' | 'bumil_busui',
    portionTitle: string,
    porsiCount: number,
    portionScale: number,
    akgConfig: { key1: string; key2: string }
  ): MbgPortionDailyData => {
    const nutritionItems: MbgPortionNutritionItem[] = [];
    const bahanItems: MbgPortionBahanItem[] = [];
    const bumbuItems: MbgPortionBumbuItem[] = [];

    let totalBerat = 0;
    let totalEnergi = 0;
    let totalProtein = 0;
    let totalLemak = 0;
    let totalKh = 0;
    let totalSerat = 0;

    const activeMenus = menuItems && menuItems.length > 0
      ? menuItems
      : ['Nasi Putih', 'Ayam Goreng Lengkuas', 'Sayur Sop Wortel Buncis', 'Tempe Goreng', 'Pisang Barangan'];

    activeMenus.forEach((menuName) => {
      const qMenu = menuName.toLowerCase().trim();
      const rec = allRecipes.find((r) => r.namaMenu.toLowerCase().trim().includes(qMenu) || qMenu.includes(r.namaMenu.toLowerCase().trim())) || allRecipes[0];
      const mainBahan = rec?.mainBahan || menuName;
      const tkpi = findTkpi(mainBahan);

      const basePortionWeight = portionType === 'kecil' ? 80 : portionType === 'besar' ? 120 : portionType === 'balita' ? 55 : 125;
      const beratBersih = Math.round(basePortionWeight * portionScale);
      const energi = Math.round((beratBersih / 100) * (tkpi.energi || 150));
      const protein = Math.round((beratBersih / 100) * (tkpi.protein || 5) * 10) / 10;
      const lemak = Math.round((beratBersih / 100) * (tkpi.lemak || 3) * 10) / 10;
      const karbo = Math.round((beratBersih / 100) * (tkpi.kh || 20) * 10) / 10;
      const serat = Math.round((beratBersih / 100) * (tkpi.serat || 1) * 10) / 10;

      totalBerat += beratBersih;
      totalEnergi += energi;
      totalProtein += protein;
      totalLemak += lemak;
      totalKh += karbo;
      totalSerat += serat;

      nutritionItems.push({
        menuName,
        rincianBahan: mainBahan,
        beratBersih,
        energi,
        protein,
        lemak,
        karbohidrat: karbo,
        serat,
      });

      const isBeras = mainBahan.toLowerCase().includes('beras') || mainBahan.toLowerCase().includes('nasi');
      const isAyam = mainBahan.toLowerCase().includes('ayam');
      const isDaging = mainBahan.toLowerCase().includes('sapi') || mainBahan.toLowerCase().includes('daging');
      const isSayur = mainBahan.toLowerCase().includes('wortel') || mainBahan.toLowerCase().includes('buncis') || mainBahan.toLowerCase().includes('sayur');
      const hargaBahan = isBeras ? 15000 : isAyam ? 38000 : isDaging ? 125000 : isSayur ? 14000 : 18000;
      const bdd = isBeras ? 100 : isAyam ? 89 : isDaging ? 100 : isSayur ? 88 : 80;
      const kebutuhanKg = Math.round(((beratBersih * porsiCount) / 1000 / (bdd / 100)) * 1.02 * 10) / 10;
      const totalHarga = Math.round(kebutuhanKg * hargaBahan);

      bahanItems.push({
        rincianBahan: mainBahan,
        hargaBahan,
        bddPercent: bdd,
        beratKotor: Math.round(beratBersih / (bdd / 100)),
        totalGml: beratBersih * porsiCount,
        sparePercent: 2,
        kebutuhan: kebutuhanKg,
        satuan: 'kg',
        harga: totalHarga,
      });
    });

    const standardBumbu = [
      { nama: 'Bawang Merah Brebes', harga: 35000, ratio: 0.005, satuan: 'kg' },
      { nama: 'Bawang Putih Honan', harga: 40000, ratio: 0.004, satuan: 'kg' },
      { nama: 'Minyak Goreng Sawit', harga: 16500, ratio: 0.008, satuan: 'liter' },
      { nama: 'Garam Beryodium', harga: 8000, ratio: 0.002, satuan: 'kg' },
      { nama: 'Lengkuas, Kunyit & Rempah', harga: 20000, ratio: 0.004, satuan: 'kg' },
    ];

    standardBumbu.forEach((b) => {
      const keb = Math.round(porsiCount * b.ratio * 10) / 10;
      bumbuItems.push({
        namaMenu: activeMenus[0] || 'Menu Utama',
        namaBumbu: b.nama,
        hargaBumbu: b.harga,
        kebutuhan: keb,
        satuan: b.satuan,
        harga: Math.round(keb * b.harga),
      });
    });

    const totalBelanjaBahan = bahanItems.reduce((s, b) => s + b.harga, 0);
    const hargaBahanPerPorsi = Math.round(totalBelanjaBahan / (porsiCount || 1));
    const totalBelanjaBumbu = bumbuItems.reduce((s, b) => s + b.harga, 0);
    const hargaBumbuPerPorsi = Math.round(totalBelanjaBumbu / (porsiCount || 1));
    const totalBelanjaOverall = totalBelanjaBahan + totalBelanjaBumbu;
    const hargaPerPorsiOverall = hargaBahanPerPorsi + hargaBumbuPerPorsi;

    const targetKcal = portionType === 'kecil' ? 550 : portionType === 'besar' ? 700 : portionType === 'balita' ? 350 : 800;
    const lunchTargetKcal = targetKcal * 0.33;
    const akgMetrics: Record<string, { percentMakanSiang: number; percentHarian: number }> = {
      [akgConfig.key1]: {
        percentMakanSiang: Math.round((totalEnergi / lunchTargetKcal) * 100),
        percentHarian: Math.round((totalEnergi / targetKcal) * 100),
      },
      [akgConfig.key2]: {
        percentMakanSiang: Math.round((totalEnergi / (lunchTargetKcal * 1.1)) * 100),
        percentHarian: Math.round((totalEnergi / (targetKcal * 1.1)) * 100),
      },
    };

    return {
      portionType,
      portionTitle,
      pmCount: porsiCount,
      menuList: activeMenus,
      nutritionItems,
      bahanItems,
      bumbuItems,
      totalGizi: {
        beratBersih: totalBerat,
        energi: totalEnergi,
        protein: Math.round(totalProtein * 10) / 10,
        lemak: Math.round(totalLemak * 10) / 10,
        karbohidrat: Math.round(totalKh * 10) / 10,
        serat: Math.round(totalSerat * 10) / 10,
      },
      akgMetrics,
      totalBelanjaBahan,
      hargaBahanPerPorsi,
      totalBelanjaBumbu,
      hargaBumbuPerPorsi,
      totalBelanjaOverall,
      hargaPerPorsiOverall,
    };
  };

  const porsiKecil = buildPortion('kecil', 'REALISASI MENU — PORSI KECIL', countKecil, 1.0, {
    key1: 'paud', key2: 'sd_kecil'
  });

  const porsiBesar = buildPortion('besar', 'REALISASI MENU — PORSI BESAR', countBesar, 1.35, {
    key1: 'sd_besar', key2: 'smp'
  });

  const porsiBalita = buildPortion('balita', 'REALISASI MENU — PORSI BALITA', countBalita, 0.75, {
    key1: 'balita', key2: 'balita'
  });

  const porsiBumilBusui = buildPortion('bumil_busui', 'REALISASI MENU — PORSI BUMIL/BUSUI', countBumilBusui, 1.45, {
    key1: 'bumil', key2: 'busui'
  });

  // Paket Sehat 3B
  const paketSehat3b = {
    balitaCount: countBalita,
    bumilBusuiCount: countBumilBusui,
    keringanItems: [
      { item: 'Biskuit MP-ASI / Tambahan Balita', qtyPcs: countBalita, qty: countBalita, satuan: 'pcs', hargaSatuan: 6000, totalHarga: countBalita * 6000 },
      { item: 'Susu Formula / UHT Ibu Hamil & Menyusui', qtyPcs: countBumilBusui, qty: countBumilBusui, satuan: 'kotak', hargaSatuan: 12000, totalHarga: countBumilBusui * 12000 },
      { item: 'Telur Ayam Segar Tambahan Gizi', qtyPcs: (countBalita + countBumilBusui) * 2, qty: (countBalita + countBumilBusui) * 2, satuan: 'butir', hargaSatuan: 2500, totalHarga: (countBalita + countBumilBusui) * 2 * 2500 },
      { item: 'Kacang Hijau Kupas Berkualitas', qtyPcs: Math.ceil((countBalita + countBumilBusui) * 0.1), qty: Math.ceil((countBalita + countBumilBusui) * 0.1), satuan: 'kg', hargaSatuan: 28000, totalHarga: Math.ceil((countBalita + countBumilBusui) * 0.1) * 28000 },
    ],
  };

  // PO & Realisasi Pembelian
  const poRows: MbgPoReportRow[] = [
    { supplier: 'Toko Beras Sejahtera Sukabumi', item: 'Beras Premium IR64 (Karung 50kg)', jamKedatangan: '05:00', jumlah: Math.round(totalPorsi * 0.085), satuan: 'kg', keterangan: 'Kualitas pulen & bersih' },
    { supplier: 'Mitra Peternak Unggas Berkah', item: 'Daging Ayam Karkas Segar / Olahan', jamKedatangan: '05:30', jumlah: Math.round(totalPorsi * 0.065), satuan: 'kg', keterangan: 'RPA higienis, sertifikasi Halal' },
    { supplier: 'Sentra Pengrajin Tahu & Tempe', item: 'Tahu & Tempe Kedelai Segar', jamKedatangan: '05:45', jumlah: Math.round(totalPorsi * 0.04), satuan: 'kg', keterangan: 'Olahan kedelai hari H' },
    { supplier: 'Kelompok Tani Sayur Segar Sukabumi', item: 'Sayuran Segar (Wortel, Buncis, Sayur Sop)', jamKedatangan: '05:00', jumlah: Math.round(totalPorsi * 0.05), satuan: 'kg', keterangan: 'Sayur panen segar grade A' },
    { supplier: 'Toko Rempah Al-Umanaa Mandiri', item: 'Bumbu Dapur Lengkap & Minyak Goreng', jamKedatangan: '06:00', jumlah: Math.round(totalPorsi * 0.025), satuan: 'kg/L', keterangan: 'Kemasan pabrikan bersegel' },
    { supplier: 'Mitra Kebun Buah Lokal', item: 'Buah Segar (Pisang Barangan / Buah Musiman)', jamKedatangan: '06:30', jumlah: Math.round(totalPorsi * 0.075), satuan: 'kg', keterangan: 'Tingkat kematangan optimal' },
    { supplier: 'Gudang Logistik SPPG Al-Umanaa', item: 'Paket Keringan 3B (Susu, Biskuit, Telur)', jamKedatangan: '07:00', jumlah: countBalita + countBumilBusui, satuan: 'paket', keterangan: 'Distribusi khusus sasaran 3B' },
  ];

  const realisasiPembelianRows: MbgRealisasiPembelianRow[] = poRows.map((po) => {
    let hargaPerUnit = 15000;
    if (po.item.includes('Ayam')) hargaPerUnit = 38000;
    if (po.item.includes('Tahu')) hargaPerUnit = 12000;
    if (po.item.includes('Sayur')) hargaPerUnit = 14000;
    if (po.item.includes('Bumbu')) hargaPerUnit = 22000;
    if (po.item.includes('Buah')) hargaPerUnit = 18000;
    if (po.item.includes('Paket Keringan')) hargaPerUnit = 25000;

    return {
      tanggal,
      namaBahan: po.item,
      kuantitas: po.jumlah,
      satuan: po.satuan,
      hargaPerUnit,
      totalHarga: po.jumlah * hargaPerUnit,
    };
  });

  const totalPengeluaran = realisasiPembelianRows.reduce((s, r) => s + r.totalHarga, 0);
  const totalAnggaran = Math.round(totalPengeluaran * 1.05);
  const selisih = totalAnggaran - totalPengeluaran;

  const inspectionRows: MbgInspectionFormRow[] = poRows.map((po) => ({
    jenisBahan: po.item,
    banyaknya: po.jumlah,
    satuan: po.satuan,
    isSesuai: true,
    isBaik: true,
    notes: 'Kondisi segar, kemasan baik, lolos uji QC',
  }));

  const wasteLogs: MbgWasteLogRow[] = [
    { no: 1, namaMakanan: 'Kulit Bawang & Akar Bumbu', kuantitas: Math.round(totalPorsi * 0.001 * 10) / 10, satuan: 'kg', dokumentasi: 'Kompos Organik SPPG' },
    { no: 2, namaMakanan: 'Batang & Daun Tua Sayuran', kuantitas: Math.round(totalPorsi * 0.002 * 10) / 10, satuan: 'kg', dokumentasi: 'Pakan Ternak Mitra' },
    { no: 3, namaMakanan: 'Tulang & Potongan Lemak Ayam', kuantitas: Math.round(totalPorsi * 0.002 * 10) / 10, satuan: 'kg', dokumentasi: 'Pengolahan Kaldu / Limbah' },
    { no: 4, namaMakanan: 'Kulit Buah (Pisang)', kuantitas: Math.round(totalPorsi * 0.002 * 10) / 10, satuan: 'kg', dokumentasi: 'Kompos Organik' },
    { no: 5, namaMakanan: 'Air Bilasan & Cucian Beras', kuantitas: 25, satuan: 'liter', dokumentasi: 'Penyiraman Kebun Edukasi' },
  ];

  return {
    id: `auto_${batch.id}`,
    batchId: batch.id,
    tanggal,
    sheetDayName: dayName,
    porsiKecil,
    porsiBesar,
    porsiBalita,
    porsiBumilBusui,
    paketSehat3b,
    poRows,
    realisasiPembelianRows,
    totalPengeluaran,
    totalAnggaran,
    selisih,
    inspectionForm: {
      dari: 'Koperasi Al Umanaa Sejahtera Mandiri',
      kepada: 'SPPG Sukabumi Gunungguruh Kebonmanggu',
      waktu: tanggal,
      noForm: `26/PBM/VII/${tanggal.split('-')[0] || '2026'}`,
      rows: inspectionRows,
      officerName: 'Ragha Eskha Utama, S.Hum.',
      officerTitle: 'Kepala Satuan Pelayanan Pemenuhan Gizi',
    },
    wasteLogs,
    createdBy: 'system_auto',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
