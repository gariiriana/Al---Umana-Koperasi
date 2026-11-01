// ============================================================================
// Baca link Google Sheets untuk modal Import di Produksi MBG
// (Laporan Harian & Daftar Pesanan Bahan). Selalu mengunduh salinan terbaru,
// dan kalau gagal, melempar Error dengan pesan yang bisa langsung dibaca
// pengguna.
// ============================================================================

import * as XLSX from 'xlsx';

export const SHEETS_NOT_SHARED_MESSAGE =
  'Spreadsheet tidak bisa dibaca karena belum dibagikan publik. Buka Google Sheets → Share/Bagikan → Akses umum: "Anyone with the link" (Siapa saja yang memiliki link) sebagai Viewer, lalu klik Baca Link lagi. Atau download sebagai .xlsx lalu pakai opsi Upload File Excel.';

export async function readSheetsLink(
  inputUrl: string,
  fetchFn: typeof fetch = fetch
): Promise<{ wb: XLSX.WorkBook; sourceLabel: string }> {
  let fetchUrl = inputUrl;
  let sourceLabel = inputUrl;

  const match = inputUrl.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (match && match[1]) {
    const spreadsheetId = match[1];
    // Parameter waktu mencegah browser memakai salinan spreadsheet lama dari cache
    fetchUrl = `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=xlsx&t=${Date.now()}`;
    sourceLabel = `Google Sheets ID ${spreadsheetId}`;
  } else if (inputUrl.includes('docs.google.com')) {
    throw new Error('Link Google Sheets tidak valid. Gunakan link dengan format https://docs.google.com/spreadsheets/d/<ID>/edit');
  }

  let res: Response;
  try {
    res = await fetchFn(fetchUrl, { cache: 'no-store' });
  } catch {
    // Spreadsheet privat dialihkan Google ke halaman login, dan browser
    // memblokir pengalihan itu (CORS) sehingga fetch hanya melempar "Failed to fetch".
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new Error('Tidak ada koneksi internet. Sambungkan internet lalu klik Baca Link lagi.');
    }
    throw new Error(SHEETS_NOT_SHARED_MESSAGE);
  }

  if (res.status === 404) {
    throw new Error('Spreadsheet tidak ditemukan (404). Periksa lagi link-nya, pastikan ter-copy utuh.');
  }
  if (res.status === 401 || res.status === 403) {
    throw new Error(SHEETS_NOT_SHARED_MESSAGE);
  }
  if (!res.ok) {
    throw new Error(`Gagal mengunduh Google Sheets. Status: ${res.status}. Coba lagi beberapa saat, atau download sebagai .xlsx lalu pakai opsi Upload File Excel.`);
  }
  // Spreadsheet privat dibalas halaman login (HTML), bukan file Excel
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('text/html')) {
    throw new Error(SHEETS_NOT_SHARED_MESSAGE);
  }

  const wb = XLSX.read(await res.arrayBuffer(), { type: 'array' });
  if (!wb.SheetNames.length) {
    throw new Error('Spreadsheet terbaca tetapi tidak memiliki sheet/tab.');
  }
  return { wb, sourceLabel };
}
