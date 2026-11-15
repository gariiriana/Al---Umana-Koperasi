/**
 * Imports on the Produksi MBG page (Laporan Harian Produksi and Daftar Pesanan Bahan)
 * always write into the batch the user has selected. The tab date is only used to
 * warn when the chosen tab looks like it belongs to another day.
 */

/** Reads a date from a spreadsheet tab name (DDMMYYYY, YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, DDMMYY). */
export function parseSheetNameToDate(sheetName: string): string | null {
  if (!sheetName) return null;
  const clean = sheetName.trim();

  // DDMMYYYY, e.g. 04092026
  const ddmmyyyy = clean.match(/^(\d{2})(\d{2})(\d{4})$/);
  if (ddmmyyyy) {
    const [, d, m, y] = ddmmyyyy;
    return `${y}-${m}-${d}`;
  }

  // YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean;

  // DD-MM-YYYY or DD/MM/YYYY
  const ddmmyyyySep = clean.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (ddmmyyyySep) {
    const [, d, m, y] = ddmmyyyySep;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
  }

  // DDMMYY, e.g. 040926
  const ddmmyy = clean.match(/^(\d{2})(\d{2})(\d{2})$/);
  if (ddmmyy) {
    const [, d, m, y] = ddmmyy;
    return `20${y}-${m}-${d}`;
  }

  return null;
}

/**
 * The tab's date when it differs from the selected batch (the user should confirm
 * before importing), or null when it matches or the tab name carries no date.
 */
export function sheetDateMismatch(sheetName: string, batchTanggal: string): string | null {
  const sheetDate = parseSheetNameToDate(sheetName);
  return sheetDate && sheetDate !== batchTanggal ? sheetDate : null;
}
