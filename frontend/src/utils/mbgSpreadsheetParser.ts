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
  const lowerName = name.toLowerCase();
  return (
    lowerName.includes('posyandu') ||
    lowerName.startsWith('balita') ||
    lowerName.startsWith('bumil') ||
    lowerName.startsWith('busui') ||
    (lowerName.includes('cempaka') && (lowerName.includes('balita') || lowerName.includes('bumil') || lowerName.includes('busui'))) ||
    lowerName.includes('paket 3b') ||
    lowerName.includes('paket3b') ||
    (lowerName.includes('balita') && !lowerName.includes('tk') && !lowerName.includes('sps') && !lowerName.includes('sd') && !lowerName.includes('smp')) ||
    (lowerName.includes('bumil') && !lowerName.includes('sd') && !lowerName.includes('smp')) ||
    (lowerName.includes('busui') && !lowerName.includes('sd') && !lowerName.includes('smp'))
  );
}

/**
 * Core dynamic parser: Converts raw rows (2D array) into MbgPmEntry objects
 * Handles header detection, dynamic column mapping, strict summary/total filtering,
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

  // Deteksi posisi header secara dinamis (mencari baris judul kolom)
  let nameColIdx = -1;
  let porsiBesarColIdx = -1;
  let porsiKecilColIdx = -1;
  let guruColIdx = -1;
  let tendikColIdx = -1;
  let startRow = 0;

  for (let r = 0; r < Math.min(rows.length, 10); r++) {
    const row = rows[r] || [];
    for (let c = 0; c < row.length; c++) {
      const strVal = String(row[c] || '').toLowerCase().trim();
      if (['sekolah', 'nama sekolah', 'lembaga', 'sasaran', 'institusi', 'nama lembaga'].includes(strVal)) {
        nameColIdx = c;
        startRow = r + 1;
      }
      if (strVal.includes('porsi besar')) {
        porsiBesarColIdx = c;
      }
      if (strVal.includes('porsi kecil')) {
        porsiKecilColIdx = c;
      }
      if (strVal.startsWith('guru') || strVal.includes('pic')) {
        guruColIdx = c;
      }
      if (strVal.startsWith('tendik') || strVal.includes('tenaga pendidik')) {
        tendikColIdx = c;
      }
    }
    if (nameColIdx !== -1) break;
  }

  const parsedEntries: Omit<MbgPmEntry, 'id'>[] = [];
  const seenNames = new Set<string>();

  for (let i = startRow; i < rows.length; i++) {
    const cols = rows[i] || [];
    if (!cols || cols.length === 0) continue;

    // Tentukan kolom nama dan offset kolom
    let colOffset = 0;
    let rawInst: unknown = undefined;

    if (nameColIdx !== -1) {
      rawInst = cols[nameColIdx];
      colOffset = nameColIdx;
    } else {
      // Auto-detect jika kolom 0 adalah nomor urut (1, 2, 3...)
      const firstVal = cols[0];
      const secondVal = cols[1];
      if (
        (typeof firstVal === 'number' || (typeof firstVal === 'string' && !isNaN(Number(firstVal)) && firstVal.trim() !== '')) &&
        secondVal !== undefined && secondVal !== null && String(secondVal).trim() !== ''
      ) {
        rawInst = secondVal;
        colOffset = 1;
      } else {
        rawInst = firstVal;
        colOffset = 0;
      }
    }

    if (rawInst === undefined || rawInst === null) continue;
    const instName = String(rawInst).trim();
    if (!instName || instName === '-' || instName === '—') continue;

    // Abaikan jika baris nama berupa angka semata (bukan nama sekolah)
    if (!isNaN(Number(instName))) continue;

    const firstColUpper = instName.toUpperCase();
    // Filter ketat seluruh baris header & baris total/rekapitulasi dari Excel agar tidak masuk sebagai sekolah
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
      firstColUpper.includes('PERIODE') ||
      firstColUpper.includes('TOTAL') ||
      firstColUpper.includes('JUMLAH') ||
      firstColUpper.includes('SUBTOTAL') ||
      firstColUpper.includes('SUB TOTAL') ||
      firstColUpper.includes('GRAND')
    ) {
      continue;
    }

    // Hindari duplikasi nama institusi di dalam file/sheet yang sama
    const nameKey = instName.toLowerCase();
    if (seenNames.has(nameKey)) continue;
    seenNames.add(nameKey);

    const isPosyandu = detectIsPosyandu(instName);
    const lowerName = instName.toLowerCase();
    const instType: MbgInstitutionType = isPosyandu ? 'posyandu' : 'sekolah';

    // Ekstraksi data murni dari baris sheet:
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

    // Format A: Tabel sederhana (No, Nama, Siswa/Murid, Guru, Total) <= 6 kolom
    const isSimpleFormat = cols.length <= colOffset + 5 && cols.length >= colOffset + 3;

    if (isSimpleFormat) {
      const murid = parseCellToNumber(cols[colOffset + 1]);
      const guru = parseCellToNumber(cols[colOffset + 2]);
      if (isPosyandu) {
        if (lowerName.includes('bumil')) {
          qtBumil = murid;
          qtBumilBusui = murid;
        } else if (lowerName.includes('busui')) {
          qtBusui = murid;
          qtBumilBusui = murid;
        } else {
          qtSiswaBalita = murid;
          qtPorsiKecilL = Math.floor(murid / 2);
          qtPorsiKecilP = murid - qtPorsiKecilL;
        }
        guruP = guru;
        qtGuruKader = guru;
      } else {
        qtSiswaBalita = murid;
        qtPorsiBesarL = Math.floor(murid / 2);
        qtPorsiBesarP = murid - qtPorsiBesarL;
        guruP = guru;
        qtGuruKader = guru;
      }
    } else {
      // Format B: Tabel Rekapitulasi Lengkap
      const pkL_idx = porsiKecilColIdx !== -1 ? porsiKecilColIdx : colOffset + 1;
      const pkP_idx = pkL_idx + 1;
      const pbL_idx = porsiBesarColIdx !== -1 ? porsiBesarColIdx : colOffset + 3;
      const pbP_idx = pbL_idx + 1;

      qtPorsiKecilL = parseCellToNumber(cols[pkL_idx]);
      qtPorsiKecilP = parseCellToNumber(cols[pkP_idx]);
      qtPorsiBesarL = parseCellToNumber(cols[pbL_idx]);
      qtPorsiBesarP = parseCellToNumber(cols[pbP_idx]);

      const gL_idx = guruColIdx !== -1 ? guruColIdx : colOffset + 8;
      const gP_idx = gL_idx + 1;
      const tL_idx = tendikColIdx !== -1 ? tendikColIdx : colOffset + 10;
      const tP_idx = tL_idx + 1;

      guruL = parseCellToNumber(cols[gL_idx]);
      guruP = parseCellToNumber(cols[gP_idx]);
      tendikL = parseCellToNumber(cols[tL_idx]);
      tendikP = parseCellToNumber(cols[tP_idx]);

      // Fallback jika format kolom tanpa subtotal L/P
      if (guruL === 0 && guruP === 0 && tendikL === 0 && tendikP === 0 && cols.length >= colOffset + 6 && cols.length < colOffset + 10) {
        guruL = parseCellToNumber(cols[colOffset + 5]);
        guruP = parseCellToNumber(cols[colOffset + 6]);
        tendikL = parseCellToNumber(cols[colOffset + 7]);
      }

      qtGuruKader = guruL + guruP + tendikL + tendikP || parseCellToNumber(cols[colOffset + 12]);
      qtSiswaBalita = qtPorsiKecilL + qtPorsiKecilP + qtPorsiBesarL + qtPorsiBesarP || parseCellToNumber(cols[colOffset + 7]);

      if (isPosyandu) {
        if (lowerName.includes('bumil')) {
          const val = parseCellToNumber(cols[colOffset + 4]) || parseCellToNumber(cols[colOffset + 6]) || qtSiswaBalita || parseCellToNumber(cols[colOffset + 13]);
          qtBumil = val;
          qtBumilBusui = val;
          qtSiswaBalita = 0;
          qtPorsiBesarP = 0;
          qtPorsiBesarL = 0;
          qtPorsiKecilP = 0;
          qtPorsiKecilL = 0;
        } else if (lowerName.includes('busui')) {
          const val = parseCellToNumber(cols[colOffset + 4]) || parseCellToNumber(cols[colOffset + 6]) || qtSiswaBalita || parseCellToNumber(cols[colOffset + 13]);
          qtBusui = val;
          qtBumilBusui = val;
          qtSiswaBalita = 0;
          qtPorsiBesarP = 0;
          qtPorsiBesarL = 0;
          qtPorsiKecilP = 0;
          qtPorsiKecilL = 0;
        } else {
          qtPorsiKecilL = qtPorsiKecilL || qtPorsiBesarL;
          qtPorsiKecilP = qtPorsiKecilP || qtPorsiBesarP;
          qtPorsiBesarL = 0;
          qtPorsiBesarP = 0;
          qtSiswaBalita = qtPorsiKecilL + qtPorsiKecilP || qtSiswaBalita;
        }
      }
    }

    // Jumlah dihitung murni dari hasil penjumlahan komponen
    const jumlah = qtSiswaBalita + qtBumilBusui + qtGuruKader;

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
      qtPorsiBesar: !isPosyandu ? (qtPorsiBesarL + qtPorsiBesarP + qtGuruKader) : qtGuruKader,
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
      isSekolahLibur: false,
      sortOrder: parsedEntries.length,
      notes: '',
      menuItems: [...menuItems],
      menuKeringanItems: [...menuKeringanItems],
      createdBy: userUid || 'system',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
  }

  return parsedEntries;
}
