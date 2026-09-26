// ============================================================================
// MBG Spreadsheet & Excel Parser Utilities
// Provides pure dynamic parsing for Beneficiary (Penerima Manfaat) data
// Supports both Google Sheets public links and local Excel (.xlsx, .xls, .csv)
// ============================================================================

import * as XLSX from 'xlsx';
import type { MbgPmEntry, MbgInstitutionType, MbgDayMenu } from '@/types/mbg';
import { getMenuForDate } from '@/services/mbgAdminService';

/**
 * Extract Google Spreadsheet ID from various URL formats:
 * - https://docs.google.com/spreadsheets/d/1uvsEHj7p11l0tZZqWB_t9khlzUpNZM5okGyVswH4_8U/edit...
 * - https://docs.google.com/spreadsheets/d/e/2PACX-.../pubhtml
 */
export function extractSpreadsheetId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // If published link with /d/e/2PACX-...
  const pubMatch = trimmed.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch && pubMatch[1]) {
    return pubMatch[1];
  }

  // Standard Google Sheets link: /d/1uvsEHj7... where ID is > 20 chars
  const stdMatch = trimmed.match(/\/d\/([a-zA-Z0-9-_]{20,})/);
  if (stdMatch && stdMatch[1]) {
    return stdMatch[1];
  }

  // Google Drive link: /file/d/1uvs...
  const driveMatch = trimmed.match(/\/file\/d\/([a-zA-Z0-9-_]+)/);
  if (driveMatch && driveMatch[1]) {
    return driveMatch[1];
  }

  // Generic /d/{id} where id is not "e"
  const match = trimmed.match(/\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1] && match[1] !== 'e') {
    return match[1];
  }

  // Raw ID passed
  if (/^[a-zA-Z0-9-_]{25,65}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Construct public export URL for Google Sheets or return the URL directly if already an export link
 */
export function getSpreadsheetExportUrl(url: string): string {
  if (!url) return '';
  const trimmed = url.trim();

  // If it's already an export link or direct file link, keep it
  if (trimmed.includes('/export?format=') || trimmed.includes('/pub?output=')) {
    return trimmed;
  }

  // 1. Check for Google Sheets "Publish to the web" (Publikasikan ke web):
  // Format: https://docs.google.com/spreadsheets/d/e/2PACX-1v.../pubhtml or /pub
  const pubMatch = trimmed.match(/\/d\/e\/([a-zA-Z0-9-_]+)/);
  if (pubMatch && pubMatch[1]) {
    return `https://docs.google.com/spreadsheets/d/e/${pubMatch[1]}/pub?output=xlsx`;
  }

  // 2. Check for standard Google Sheets edit or view link:
  const spreadsheetId = extractSpreadsheetId(trimmed);
  if (spreadsheetId) {
    return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx`;
  }

  return trimmed;
}

/**
 * Fetch and parse a Google Spreadsheet into an XLSX Workbook object with robust fallbacks
 */
export async function fetchGoogleSpreadsheetWorkbook(url: string): Promise<XLSX.WorkBook> {
  const exportUrl = getSpreadsheetExportUrl(url);
  console.log('[MBG Spreadsheet] Fetching URL:', exportUrl);

  let response: Response;
  try {
    response = await fetch(exportUrl);
  } catch (netErr: unknown) {
    console.error('[MBG Spreadsheet] Network error:', netErr);
    throw new Error(
      'Gagal terhubung ke Google Sheets (Network/CORS error). ' +
      'Pastikan spreadsheet memiliki akses "Anyone with the link / Siapa saja yang memiliki link" sebagai Viewer, atau gunakan opsi upload file Excel langsung.'
    );
  }

  // Fallback 1: If published sheet xlsx failed (e.g. 404), try pub?output=csv
  if (!response.ok && exportUrl.includes('/pub?output=xlsx')) {
    const csvUrl = exportUrl.replace('output=xlsx', 'output=csv');
    console.log('[MBG Spreadsheet] Trying fallback CSV format:', csvUrl);
    try {
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const text = await csvRes.text();
        return XLSX.read(text, { type: 'string' });
      }
    } catch {
      // Continue to error reporting
    }
  }

  // Fallback 2: If standard export xlsx failed, try export?format=csv
  if (!response.ok && exportUrl.includes('/export?format=xlsx')) {
    const csvUrl = exportUrl.replace('format=xlsx', 'format=csv');
    console.log('[MBG Spreadsheet] Trying fallback CSV format:', csvUrl);
    try {
      const csvRes = await fetch(csvUrl);
      if (csvRes.ok) {
        const text = await csvRes.text();
        return XLSX.read(text, { type: 'string' });
      }
    } catch {
      // Continue to error reporting
    }
  }

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(
        `Gagal mengunduh spreadsheet (Status: 404 Not Found).\n` +
        `Penyebab:\n` +
        `• Link Google Sheets tidak valid atau spreadsheet belum diset publik ("Siapa saja yang memiliki link / Anyone with the link").\n` +
        `• URL target: ${exportUrl}`
      );
    }
    throw new Error(
      `Gagal mengunduh spreadsheet (Status: ${response.status}). ` +
      `Pastikan spreadsheet diset publik ("Anyone with the link / Siapa saja yang memiliki link") sebagai Viewer.`
    );
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    const text = await response.text();
    // Check if Google redirected to a private login page
    if (text.includes('accounts.google.com') || text.includes('ServiceLogin') || text.includes('Sign in')) {
      throw new Error(
        'Spreadsheet ini terkunci / privat (memerlukan login Akun Google). ' +
        'Silakan buka Google Sheets > Bagikan (Share) > Ubah Akses Umum menjadi "Siapa saja yang memiliki link" (Anyone with the link) dengan akses Viewer.'
      );
    }
    return XLSX.read(text, { type: 'string' });
  }

  const arrayBuffer = await response.arrayBuffer();
  return XLSX.read(arrayBuffer, { type: 'array' });
}

/**
 * Parse uploaded file (ArrayBuffer) into an XLSX Workbook object
 */
export async function parseFileToWorkbook(file: File): Promise<XLSX.WorkBook> {
  const arrayBuffer = await file.arrayBuffer();
  return XLSX.read(arrayBuffer, { type: 'array' });
}

/**
 * Helper to safely convert any cell value into an integer number
 */
export function parseCellToNumber(val: unknown): number {
  if (val === null || val === undefined) return 0;
  if (typeof val === 'number') return isNaN(val) ? 0 : Math.round(val);
  if (typeof val === 'string') {
    const cleaned = val.replace(/[^0-9.-]/g, '');
    return parseInt(cleaned, 10) || 0;
  }
  return 0;
}

/**
 * Filter out internal/hidden or auxiliary sheets (e.g. AKG, Siklus) from available sheets list
 */
export function getVisibleSheetNames(wb: XLSX.WorkBook): string[] {
  const sheetsMeta = wb.Workbook?.Sheets || [];
  return wb.SheetNames.filter((name, idx) => {
    const lower = name.toLowerCase().trim();
    if (lower.includes('akg') || lower.includes('siklus menu')) {
      return false;
    }
    const meta = sheetsMeta[idx];
    if (meta && (meta.Hidden === 1 || meta.Hidden === 2)) {
      return false;
    }
    const ws = wb.Sheets[name];
    if (!ws || !ws['!ref']) return false;
    return true;
  });
}

/**
 * Determine if an institution name indicates a Posyandu / Balita / Bumil / Busui group
 */
export function detectIsPosyandu(name: string): boolean {
  const lowerName = name.toLowerCase().trim();
  if (
    lowerName.startsWith('sps') ||
    lowerName.startsWith('tk') ||
    lowerName.startsWith('paud') ||
    lowerName.startsWith('sd') ||
    lowerName.startsWith('min') ||
    lowerName.startsWith('smp') ||
    lowerName.startsWith('sma') ||
    lowerName.startsWith('smk') ||
    lowerName.startsWith('mts') ||
    lowerName.startsWith('ma ')
  ) {
    return false;
  }
  return (
    lowerName.includes('posyandu') ||
    lowerName.startsWith('balita') ||
    lowerName.startsWith('bumil') ||
    lowerName.startsWith('busui') ||
    (lowerName.includes('cempaka') && (lowerName.includes('balita') || lowerName.includes('bumil') || lowerName.includes('busui') || /^cempaka\s*\d+/i.test(lowerName) || /^posyandu\s*cempaka/i.test(lowerName))) ||
    /^(cempaka|mawar|melati|anggrek|dahlia|flamboyan|kenanga|teratai|kamboja|matahari|tulip|bougenville|asoka|kemuning)\s*\d*/i.test(lowerName) ||
    lowerName.includes('paket 3b') ||
    lowerName.includes('paket3b')
  );
}

/**
 * Intelligent sheet auto-detection:
 * Matches target batch date (e.g. '14 Sep', '20 Juli'), or 'rekap', 'penerima manfaat', 'base data'.
 */
export function detectPreferredSheet(
  sheetNames: string[],
  targetDate?: string,
  weeklySchedule?: MbgDayMenu[]
): string {
  if (!sheetNames || sheetNames.length === 0) return '';

  const cleanSheets = sheetNames.filter((s) => !s.toLowerCase().includes('siklus') && !s.toLowerCase().includes('akg'));
  if (cleanSheets.length === 0) return sheetNames[0];

  // 1. Try matching target date (e.g., '2026-09-14' -> day '14', month 'Sep')
  if (targetDate) {
    const parts = targetDate.split('-');
    if (parts.length === 3) {
      const dayNum = parseInt(parts[2], 10);
      const monthNum = parseInt(parts[1], 10);
      const monthNamesIndo = ['jan', 'feb', 'mar', 'apr', 'mei', 'jun', 'jul', 'agu', 'sep', 'okt', 'nov', 'des'];
      const monthFullIndo = ['januari', 'februari', 'maret', 'april', 'mei', 'juni', 'juli', 'agustus', 'september', 'oktober', 'november', 'desember'];
      const mShort = monthNamesIndo[monthNum - 1] || '';
      const mFull = monthFullIndo[monthNum - 1] || '';

      const matchedDateSheet = cleanSheets.find((name) => {
        const l = name.toLowerCase().trim();
        // Check "14 Sep" or "14 September" or "09-14" or "14-09"
        const hasDay = new RegExp(`\\b0?${dayNum}\\b`).test(l);
        const hasMonth = l.includes(mShort) || l.includes(mFull);
        return hasDay && hasMonth;
      });
      if (matchedDateSheet) return matchedDateSheet;
    }

    if (weeklySchedule && weeklySchedule.length > 0) {
      const dayName = getMenuForDate(targetDate, weeklySchedule).dayMenu.dayName.toLowerCase();
      if (dayName) {
        const matchedDay = cleanSheets.find((name) => name.toLowerCase().includes(dayName));
        if (matchedDay) return matchedDay;
      }
    }
  }

  // 2. Prefer sheets named 'auto rekap' or 'rekapitulasi' or 'rekap pm' or 'penerima manfaat' or 'data pm'
  const rekapSheet = cleanSheets.find((name) => {
    const l = name.toLowerCase().trim();
    return (
      l.includes('auto rekap') ||
      l.includes('penerima manfaat') ||
      l.includes('rekapitulasi') ||
      l.includes('rekap pm') ||
      l.includes('data pm') ||
      l.includes('sasaran')
    );
  });
  if (rekapSheet) return rekapSheet;

  // 3. Prefer 'BASE DATA'
  const baseSheet = cleanSheets.find((name) => name.toLowerCase().includes('base data'));
  if (baseSheet) return baseSheet;

  return cleanSheets[0];
}

/**
 * Core dynamic parser: Converts raw rows (2D array) into MbgPmEntry objects
 * Handles multi-row header detection, dynamic column mapping, strict summary/total filtering,
 * and accurate mathematical calculation of portions.
 */
export function parsePmRowsToEntries(
  rows: Array<Array<string | number | undefined | null>>,
  batchId: string,
  userUid: string,
  weeklySchedule: MbgDayMenu[],
  batchTanggal?: string
): Omit<MbgPmEntry, 'id'>[] {
  if (!rows || rows.length < 1) return [];

  const { menuItems, menuKeringanItems } = batchTanggal
    ? getMenuForDate(batchTanggal, weeklySchedule)
    : { menuItems: [], menuKeringanItems: [] };

  // Special handling for Posyandu sheet format (e.g., sheet '3B')
  const isSheet3B = (
    rows[0] &&
    String(rows[0][0] || '').toLowerCase().includes('posyandu') &&
    rows[1] &&
    String(rows[1][1] || '').toLowerCase().includes('balita')
  );

  if (isSheet3B) {
    const rawTitle = String(rows[0][0] || '').replace(/\s+/g, ' ').trim();
    const titleFormatted = rawTitle.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
    const parsed3B: Omit<MbgPmEntry, 'id'>[] = [];
    for (let r = 3; r < rows.length; r++) {
      const row = rows[r] || [];
      const col0 = String(row[0] || '').trim();
      if (!col0) continue;
      if (col0.toUpperCase().includes('TOTAL') || col0.toUpperCase().includes('JUMLAH')) break;

      const instName = !isNaN(Number(col0)) ? `${titleFormatted} ${col0}` : col0;
      const balitaTotal = parseCellToNumber(row[1]);
      const balitaL = parseCellToNumber(row[2]);
      const balitaP = parseCellToNumber(row[3]);
      const pobiaBalita = parseCellToNumber(row[4]);
      const pobiaBumil = parseCellToNumber(row[5]);
      const bumil = parseCellToNumber(row[6]);
      const busui = parseCellToNumber(row[7]);
      const kader = parseCellToNumber(row[8]);
      const jumlah = parseCellToNumber(row[9]) || (balitaTotal + bumil + busui + kader);
 
      parsed3B.push({
        batchId,
        institutionName: instName,
        institutionType: 'posyandu',
        qtSiswaBalita: balitaTotal,
        qtBumilBusui: bumil + busui,
        qtBumil: bumil !== undefined ? bumil : 0,
        qtBusui: busui !== undefined ? busui : 0,
        qtGuruKader: kader,
        qtPobiaNasi: pobiaBalita + pobiaBumil,
        qtPorsiBalita: balitaTotal,
        qtPorsiKecil: balitaTotal,
        qtPorsiBesar: kader,
        qtPorsiBumilBusui: bumil + busui,
        qtPorsiKecilL: balitaL || undefined,
        qtPorsiKecilP: balitaP || undefined,
        jumlah,
        jadwalPengantaran: '06.00-08.30',
        assignedPetugasId: '',
        assignedPetugasName: '',
        isSekolahLibur: jumlah === 0,
        sortOrder: parsed3B.length,
        notes: '',
        menuItems: [...menuItems],
        menuKeringanItems: [...menuKeringanItems],
        createdBy: userUid || 'system',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    return parsed3B;
  }

  // Deteksi posisi header secara dinamis (mencari baris judul kolom hingga baris 60)
  let nameColIdx = -1;
  let porsiBesarColIdx = -1;
  let porsiKecilColIdx = -1;
  let guruColIdx = -1;
  let tendikColIdx = -1;
  let muridColIdx = -1;
  let totalColIdx = -1;
  let headerEndRow = -1;

  for (let r = 0; r < Math.min(rows.length, 60); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const strVal = String(row[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (
        ['sekolah', 'nama sekolah', 'lembaga', 'sasaran', 'institusi', 'nama lembaga', 'nama instansi', 'penerima manfaat', 'nama penerima manfaat'].includes(strVal) &&
        nameColIdx === -1
      ) {
        nameColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if (strVal.includes('porsi kecil') && porsiKecilColIdx === -1) {
        porsiKecilColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if (strVal.includes('porsi besar') && porsiBesarColIdx === -1) {
        porsiBesarColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if ((strVal.startsWith('guru') || strVal.includes('pic')) && guruColIdx === -1) {
        guruColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if ((strVal.startsWith('tendik') || strVal.includes('tenaga pendidik')) && tendikColIdx === -1) {
        tendikColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if ((strVal === 'murid' || strVal === 'siswa' || strVal === 'jumlah murid' || strVal === 'jumlah siswa') && muridColIdx === -1) {
        muridColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
      if (
        strVal.includes('total keseluruhan') ||
        strVal.includes('total\nkeseluruhan') ||
        strVal === 'total porsi' ||
        strVal === 'grand total'
      ) {
        totalColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      } else if ((strVal === 'total' || strVal === 'jumlah') && totalColIdx === -1 && c > 0) {
        totalColIdx = c;
        if (r > headerEndRow) headerEndRow = r;
      }
    }
  }

  // Periksa baris sub-header berikutnya (misal berisi baris jenis kelamin L, P)
  for (let r = 0; r <= headerEndRow + 1 && r < rows.length; r++) {
    const row = rows[r] || [];
    const hasGenderHeader = row.some((cell) => {
      const v = String(cell || '').trim().toUpperCase();
      return v === 'L' || v === 'P';
    });
    if (hasGenderHeader) {
      if (r > headerEndRow) headerEndRow = r;
    }
  }

  const startRow = headerEndRow !== -1 ? headerEndRow + 1 : 1;
  const colOffset = nameColIdx !== -1 ? nameColIdx : 0;

  const parsedEntries: Omit<MbgPmEntry, 'id'>[] = [];
  let totalRowIdx = -1;

  for (let i = startRow; i < rows.length; i++) {
    const cols = rows[i] || [];
    if (!cols || cols.length === 0) continue;

    // Tentukan kolom nama
    let rawInst: unknown = undefined;
    let actualColOffset = colOffset;

    if (nameColIdx !== -1) {
      rawInst = cols[nameColIdx];
    } else {
      const firstVal = cols[0];
      const secondVal = cols[1];
      if (
        (typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(Number(firstVal)) && firstVal.trim() !== '')) &&
        secondVal !== undefined && secondVal !== null && String(secondVal).trim() !== ''
      ) {
        rawInst = secondVal;
        actualColOffset = 1;
      } else {
        rawInst = firstVal;
        actualColOffset = 0;
      }
    }

    if (rawInst === undefined || rawInst === null) continue;
    const instName = String(rawInst).trim();
    if (!instName || instName === '-' || instName === '—') continue;

    // Abaikan jika baris nama berupa angka semata (bukan nama sekolah)
    if (!isNaN(Number(instName))) continue;

    const firstColUpper = instName.toUpperCase();

    // Catat baris TOTAL pertama (pemisah tabel utama dengan breakdown sekunder Posyandu jika ada)
    if (
      firstColUpper === 'TOTAL' ||
      firstColUpper === 'JUMLAH' ||
      firstColUpper.startsWith('TOTAL ') ||
      firstColUpper.startsWith('JUMLAH ') ||
      firstColUpper === 'SUBTOTAL' ||
      firstColUpper === 'GRAND TOTAL'
    ) {
      totalRowIdx = i;
      break;
    }

    // Filter ketat baris header berulang
    if (
      firstColUpper === 'NO' ||
      firstColUpper === 'NO.' ||
      firstColUpper === 'SEKOLAH' ||
      firstColUpper === 'NAMA' ||
      firstColUpper === 'NAMA SEKOLAH' ||
      firstColUpper === 'SASARAN' ||
      firstColUpper === 'INSTITUSI' ||
      firstColUpper === 'LEMBAGA' ||
      firstColUpper === 'L' ||
      firstColUpper === 'P' ||
      firstColUpper === 'L/P' ||
      firstColUpper.includes('REKAP') ||
      firstColUpper.includes('PERIODE')
    ) {
      continue;
    }

    const isPosyandu = detectIsPosyandu(instName);
    const lowerName = instName.toLowerCase();
    const instType: MbgInstitutionType = isPosyandu ? 'posyandu' : 'sekolah';

    // Ekstraksi data porsi & jumlah
    let qtPorsiKecilL = 0;
    let qtPorsiKecilP = 0;
    let qtPorsiBesarL = 0;
    let qtPorsiBesarP = 0;
    let guruL = 0;
    let guruP = 0;
    let tendikL = 0;
    let tendikP = 0;
    let qtSiswaBalita = 0;
    let qtBumil = 0;
    let qtBusui = 0;
    let qtBumilBusui = 0;
    let qtGuruKader = 0;

    const hasExplicitPortionColumns = porsiKecilColIdx !== -1 || porsiBesarColIdx !== -1;
    const hasSimpleCountColumns = muridColIdx !== -1 && !hasExplicitPortionColumns;
    const isSimpleFormat = hasSimpleCountColumns || (cols.length <= actualColOffset + 5 && cols.length >= actualColOffset + 3 && !hasExplicitPortionColumns);

    if (isSimpleFormat) {
      const murid = parseCellToNumber(cols[muridColIdx !== -1 ? muridColIdx : actualColOffset + 1]);
      const guru = parseCellToNumber(cols[guruColIdx !== -1 ? guruColIdx : actualColOffset + 2]);
      if (isPosyandu) {
        if (lowerName.includes('bumil')) {
          qtBumil = murid;
          qtBumilBusui = murid;
        } else if (lowerName.includes('busui')) {
          qtBusui = murid;
          qtBumilBusui = murid;
        } else {
          qtSiswaBalita = murid;
          // The source only provides one total, not a gender split. Preserve
          // that total and leave L/P empty instead of fabricating a 50:50 split.
          qtPorsiKecilL = 0;
          qtPorsiKecilP = 0;
        }
        guruP = guru;
        qtGuruKader = guru;
      } else {
        qtSiswaBalita = murid;
        guruP = guru;
        qtGuruKader = guru;
      }
    } else {
      // Format B: Tabel Rekapitulasi Lengkap
      const pkL_idx = porsiKecilColIdx !== -1 ? porsiKecilColIdx : actualColOffset + 1;
      const pkP_idx = pkL_idx + 1;
      const pbL_idx = porsiBesarColIdx !== -1 ? porsiBesarColIdx : actualColOffset + 3;
      const pbP_idx = pbL_idx + 1;

      qtPorsiKecilL = parseCellToNumber(cols[pkL_idx]);
      qtPorsiKecilP = parseCellToNumber(cols[pkP_idx]);
      qtPorsiBesarL = parseCellToNumber(cols[pbL_idx]);
      qtPorsiBesarP = parseCellToNumber(cols[pbP_idx]);

      const gL_idx = guruColIdx !== -1 ? guruColIdx : actualColOffset + 8;
      const gP_idx = gL_idx + 1;
      const tL_idx = tendikColIdx !== -1 ? tendikColIdx : actualColOffset + 10;
      const tP_idx = tL_idx + 1;

      guruL = parseCellToNumber(cols[gL_idx]);
      guruP = parseCellToNumber(cols[gP_idx]);
      tendikL = parseCellToNumber(cols[tL_idx]);
      tendikP = parseCellToNumber(cols[tP_idx]);

      // Fallback jika format kolom tanpa subtotal L/P
      if (guruL === 0 && guruP === 0 && tendikL === 0 && tendikP === 0 && cols.length >= actualColOffset + 6 && cols.length < actualColOffset + 10) {
        guruL = parseCellToNumber(cols[actualColOffset + 5]);
        guruP = parseCellToNumber(cols[actualColOffset + 6]);
        tendikL = parseCellToNumber(cols[actualColOffset + 7]);
      }

      qtGuruKader = guruL + guruP + tendikL + tendikP;
      if (qtGuruKader === 0 && cols[actualColOffset + 12] !== undefined) {
        qtGuruKader = parseCellToNumber(cols[actualColOffset + 12]);
      }

      if (isPosyandu) {
        if (lowerName.includes('bumil')) {
          const val = parseCellToNumber(cols[actualColOffset + 4]) || parseCellToNumber(cols[actualColOffset + 7]) || parseCellToNumber(cols[actualColOffset + 13]);
          qtBumil = val;
          qtBumilBusui = val;
          qtSiswaBalita = 0;
          qtPorsiBesarP = 0;
          qtPorsiBesarL = 0;
          qtPorsiKecilP = 0;
          qtPorsiKecilL = 0;
        } else if (lowerName.includes('busui')) {
          const val = parseCellToNumber(cols[actualColOffset + 4]) || parseCellToNumber(cols[actualColOffset + 7]) || parseCellToNumber(cols[actualColOffset + 13]);
          qtBusui = val;
          qtBumilBusui = val;
          qtSiswaBalita = 0;
          qtPorsiBesarP = 0;
          qtPorsiBesarL = 0;
          qtPorsiKecilP = 0;
          qtPorsiKecilL = 0;
        } else {
          // Balita
          const val = (qtPorsiKecilL + qtPorsiKecilP) || parseCellToNumber(cols[actualColOffset + 7]) || parseCellToNumber(cols[actualColOffset + 13]);
          qtSiswaBalita = val;
          qtPorsiKecilL = qtPorsiKecilL || qtPorsiBesarL;
          qtPorsiKecilP = qtPorsiKecilP || qtPorsiBesarP;
          qtPorsiBesarL = 0;
          qtPorsiBesarP = 0;
        }
      } else {
        qtSiswaBalita = qtPorsiKecilL + qtPorsiKecilP + qtPorsiBesarL + qtPorsiBesarP;
        if (qtSiswaBalita === 0 && cols[actualColOffset + 7] !== undefined) {
          qtSiswaBalita = parseCellToNumber(cols[actualColOffset + 7]);
        }
      }
    }

    // Nilai total eksplisit dari sheet adalah sumber kebenaran (authoritative)
    const totIdx = totalColIdx !== -1 ? totalColIdx : actualColOffset + 13;
    const rawTotal = cols[totIdx];
    const hasSourceTotal = rawTotal !== undefined && rawTotal !== null && String(rawTotal).trim() !== '';
    const jumlah = hasSourceTotal
      ? parseCellToNumber(rawTotal)
      : qtSiswaBalita + qtBumilBusui + qtGuruKader;

    parsedEntries.push({
      batchId,
      institutionName: instName,
      institutionType: instType,
      qtSiswaBalita,
      qtBumilBusui,
      qtBumil: qtBumil || undefined,
      qtBusui: qtBusui || undefined,
      qtGuruKader,
      qtPobiaNasi: 0,
      qtPorsiBalita: isPosyandu && !lowerName.includes('bumil') && !lowerName.includes('busui') ? qtSiswaBalita : 0,
      qtPorsiKecil: !isPosyandu ? (qtPorsiKecilL + qtPorsiKecilP) : 0,
      qtPorsiBesar: !isPosyandu
        ? (hasExplicitPortionColumns ? qtPorsiBesarL + qtPorsiBesarP + qtGuruKader : 0)
        : qtGuruKader,
      qtPorsiBumilBusui: isPosyandu && (qtBumil > 0 || qtBusui > 0) ? qtBumilBusui : 0,
      qtPorsiKecilL: qtPorsiKecilL || undefined,
      qtPorsiKecilP: qtPorsiKecilP || undefined,
      qtPorsiBesarL: qtPorsiBesarL || undefined,
      qtPorsiBesarP: qtPorsiBesarP || undefined,
      qtGuruL: guruL || undefined,
      qtGuruP: guruP || undefined,
      qtTendikL: tendikL || undefined,
      qtTendikP: tendikP || undefined,
      jumlah,
      jadwalPengantaran: '06.00-08.30',
      assignedPetugasId: '',
      assignedPetugasName: '',
      isSekolahLibur: hasSourceTotal && jumlah === 0,
      sortOrder: parsedEntries.length,
      notes: '',
      menuItems: [...menuItems],
      menuKeringanItems: [...menuKeringanItems],
      createdBy: userUid || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  // Periksa apakah terdapat tabel breakdown Posyandu sekunder di bawah baris TOTAL pertama (misal Cempaka 1 s/d 13)
  let secondaryEntries: Omit<MbgPmEntry, 'id'>[] = [];
  if (totalRowIdx !== -1 && totalRowIdx + 1 < rows.length) {
    secondaryEntries = parseSecondaryPosyanduTable(
      rows,
      totalRowIdx + 1,
      batchId,
      userUid,
      menuItems,
      menuKeringanItems
    );
  }

  // Jika tabel breakdown Posyandu sekunder terdeteksi (seperti CEMPAKA 1-13):
  // Gantikan baris rekapitulasi agregat umum (seperti "Balita Cempaka", "Bumil Cempaka", "Busui Cempaka")
  // dari tabel utama agar porsi tidak terhitung ganda dan setiap posyandu muncul secara terperinci.
  let resultEntries = parsedEntries;
  if (secondaryEntries.length > 0) {
    resultEntries = parsedEntries.filter((entry) => {
      const lower = entry.institutionName.toLowerCase().trim();
      const isAggregateSummary =
        lower.startsWith('balita ') ||
        lower.startsWith('bumil ') ||
        lower.startsWith('busui ') ||
        lower === 'posyandu' ||
        lower.startsWith('rekap posyandu') ||
        lower.startsWith('total posyandu');
      return !isAggregateSummary;
    });

    resultEntries = [...resultEntries, ...secondaryEntries];
  }

  return resultEntries.map((e, idx) => ({ ...e, sortOrder: idx }));
}

/**
 * Dynamic parser for secondary Posyandu breakdown tables located beneath the primary table.
 * Common in MBG reports where schools are in Table 1, and Posyandu stations (e.g. CEMPAKA 1..13)
 * are detailed below the primary TOTAL row.
 */
function parseSecondaryPosyanduTable(
  rows: Array<Array<string | number | undefined | null>>,
  startIndex: number,
  batchId: string,
  userUid: string,
  menuItems: string[],
  menuKeringanItems: string[]
): Omit<MbgPmEntry, 'id'>[] {
  if (startIndex >= rows.length) return [];

  const secondaryEntries: Omit<MbgPmEntry, 'id'>[] = [];

  let firstDataRowIdx = -1;
  let balitaLCol = -1;
  let balitaPCol = -1;
  let bumilCol = -1;
  let busuiCol = -1;
  let kaderCol = -1;
  let jumlahCol = -1;

  // 1. Scan rows after the first TOTAL to locate the secondary header or first institution row
  for (let r = startIndex; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row || row.length === 0) continue;

    let hasBalitaHeader = false;
    let hasBumilHeader = false;

    for (let c = 0; c < row.length; c++) {
      const cellStr = String(row[c] || '').toLowerCase().replace(/\s+/g, ' ').trim();
      if (!cellStr) continue;

      if (cellStr.includes('balita')) {
        hasBalitaHeader = true;
      }
      if (cellStr.includes('bumil') || cellStr.includes('busui')) {
        hasBumilHeader = true;
      }
      if (cellStr === 'jumlah' || cellStr === 'total' || cellStr.includes('jumlah')) {
        jumlahCol = c;
      }
    }

    if (hasBalitaHeader || hasBumilHeader) {
      const subRow = rows[r + 1] || [];
      for (let c = 0; c < Math.max(row.length, subRow.length); c++) {
        const topCell = String(row[c] || '').toLowerCase().trim();
        const subCell = String(subRow[c] || '').toLowerCase().trim();

        if (topCell.includes('balita') || subCell.includes('balita')) {
          if (subCell === 'l') balitaLCol = c;
          else if (subCell === 'p') balitaPCol = c;
          else if (balitaLCol === -1) {
            balitaLCol = c;
            balitaPCol = c + 1;
          }
        } else if (subCell === 'l' && balitaLCol !== -1 && balitaPCol === -1) {
          balitaPCol = c;
        }

        if (topCell.includes('bumil/busui') || subCell.includes('bumil/busui')) {
          bumilCol = c;
          busuiCol = c + 1;
        } else if (topCell.includes('bumil') || subCell.includes('bumil')) {
          bumilCol = c;
        } else if (topCell.includes('busui') || subCell.includes('busui')) {
          busuiCol = c;
        }

        if (topCell.includes('kader') || subCell.includes('kader')) {
          kaderCol = c;
        }

        if (topCell === 'jumlah' || subCell === 'jumlah') {
          jumlahCol = c;
        }
      }

      const hasSubHeader = subRow.some((c) => {
        const s = String(c || '').trim().toUpperCase();
        return s === 'L' || s === 'P';
      });
      firstDataRowIdx = hasSubHeader ? r + 2 : r + 1;
      break;
    }

    // Check if row directly begins with a posyandu name (e.g. 'CEMPAKA 1' or 'Posyandu Cempaka 1')
    const col0Str = String(row[0] || '').trim();
    const col1Str = String(row[1] || '').trim();
    const isInst = (s: string) =>
      Boolean(s && isNaN(Number(s)) && (detectIsPosyandu(s) || /^cempaka\s*\d+/i.test(s)));

    if (isInst(col0Str) || (!isNaN(Number(col0Str)) && isInst(col1Str))) {
      firstDataRowIdx = r;
      break;
    }
  }

  if (firstDataRowIdx === -1 || firstDataRowIdx >= rows.length) return [];

  // 2. Iterate through secondary table data rows
  for (let r = firstDataRowIdx; r < rows.length; r++) {
    const row = rows[r] || [];
    if (!row || row.length === 0) continue;

    const col0Str = String(row[0] || '').trim();
    const col1Str = String(row[1] || '').trim();
    const upper0 = col0Str.toUpperCase();

    // Secondary table TOTAL stops parsing
    if (
      upper0 === 'TOTAL' ||
      upper0 === 'JUMLAH' ||
      upper0.startsWith('TOTAL ') ||
      upper0.startsWith('JUMLAH ') ||
      upper0 === 'GRAND TOTAL'
    ) {
      break;
    }

    // Skip repeated headers
    if (
      upper0 === 'NO' ||
      upper0 === 'NO.' ||
      upper0 === 'BALITA' ||
      upper0 === 'BUMIL' ||
      upper0 === 'BUSUI' ||
      upper0 === 'L' ||
      upper0 === 'P' ||
      upper0.includes('REKAP') ||
      upper0.includes('PERIODE')
    ) {
      continue;
    }

    let instName = '';
    let dataOffset = 0;

    if (col0Str && isNaN(Number(col0Str))) {
      instName = col0Str;
      dataOffset = 0;
    } else if (col0Str && !isNaN(Number(col0Str)) && col1Str && isNaN(Number(col1Str))) {
      instName = col1Str;
      dataOffset = 1;
    } else {
      continue;
    }

    if (!instName || instName === '-' || instName === '—') continue;

    let balitaL = 0;
    let balitaP = 0;
    let bumil = 0;
    let busui = 0;
    let kader = 0;
    let sourceJumlah = 0;

    if (balitaLCol !== -1 && balitaPCol !== -1) {
      balitaL = parseCellToNumber(row[balitaLCol]);
      balitaP = parseCellToNumber(row[balitaPCol]);
    } else {
      balitaL = parseCellToNumber(row[dataOffset + 1]);
      balitaP = parseCellToNumber(row[dataOffset + 2]);
    }

    if (bumilCol !== -1) {
      bumil = parseCellToNumber(row[bumilCol]);
    } else {
      bumil = parseCellToNumber(row[dataOffset + 3]);
    }

    if (busuiCol !== -1) {
      busui = parseCellToNumber(row[busuiCol]);
    } else {
      busui = parseCellToNumber(row[dataOffset + 4]);
    }

    if (kaderCol !== -1) {
      kader = parseCellToNumber(row[kaderCol]);
    }

    if (jumlahCol !== -1) {
      sourceJumlah = parseCellToNumber(row[jumlahCol]);
    }

    // Fallback: search for rightmost numeric cell as sourceJumlah
    if (sourceJumlah === 0) {
      for (let c = row.length - 1; c > dataOffset + 4; c--) {
        const val = parseCellToNumber(row[c]);
        if (val > 0) {
          sourceJumlah = val;
          break;
        }
      }
    }

    const balitaTotal = balitaL + balitaP;
    const bumilBusuiTotal = bumil + busui;
    const calcJml = balitaTotal + bumilBusuiTotal + kader;
    const jumlah = sourceJumlah > 0 ? sourceJumlah : calcJml;

    if (jumlah === 0 && balitaTotal === 0 && bumilBusuiTotal === 0) {
      continue;
    }

    secondaryEntries.push({
      batchId,
      institutionName: instName,
      institutionType: 'posyandu',
      qtSiswaBalita: balitaTotal,
      qtBumilBusui: bumilBusuiTotal,
      qtBumil: bumil || undefined,
      qtBusui: busui || undefined,
      qtGuruKader: kader,
      qtPobiaNasi: 0,
      qtPorsiBalita: balitaTotal,
      qtPorsiKecil: balitaTotal,
      qtPorsiBesar: kader,
      qtPorsiBumilBusui: bumilBusuiTotal,
      qtPorsiKecilL: balitaL || undefined,
      qtPorsiKecilP: balitaP || undefined,
      jumlah,
      jadwalPengantaran: '06.00-08.30',
      assignedPetugasId: '',
      assignedPetugasName: '',
      isSekolahLibur: jumlah === 0,
      sortOrder: secondaryEntries.length,
      notes: '',
      menuItems: [...menuItems],
      menuKeringanItems: [...menuKeringanItems],
      createdBy: userUid || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return secondaryEntries;
}
