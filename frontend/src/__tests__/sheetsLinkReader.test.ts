import { afterEach, describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';
import { readSheetsLink, SHEETS_NOT_SHARED_MESSAGE } from '@/utils/sheetsLinkReader';

const SHEET_ID = '1tJ2dTtw9YMiUDETwGRiHJjn6bjYEsc0thxl5OuMLyas';
const LINK = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/edit?gid=0#gid=0`;

function fakeResponse(status: number, contentType: string, body: ArrayBuffer = new ArrayBuffer(0)) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': contentType }),
    arrayBuffer: async () => body,
  } as unknown as Response;
}

function xlsxResponse() {
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Bahan'], ['Beras'], ['Telur']]), '01112026');
  const body = XLSX.write(wb, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer;
  return fakeResponse(200, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', body);
}

describe('Baca Link Google Sheets (modal Import di Produksi MBG)', () => {
  afterEach(() => vi.restoreAllMocks());

  it('mengunduh export xlsx terbaru lalu mengembalikan workbook', async () => {
    const fetchFn = vi.fn().mockResolvedValue(xlsxResponse());

    const { wb, sourceLabel } = await readSheetsLink(LINK, fetchFn);

    expect(wb.SheetNames).toEqual(['01112026']);
    expect(sourceLabel).toBe(`Google Sheets ID ${SHEET_ID}`);
    const [url, init] = fetchFn.mock.calls[0];
    expect(url).toMatch(new RegExp(`^https://docs\\.google\\.com/spreadsheets/d/${SHEET_ID}/export\\?format=xlsx&t=\\d+$`));
    expect(init).toEqual({ cache: 'no-store' });
  });

  it('sheet privat (diblokir CORS, fetch melempar "Failed to fetch") → pesan cara share', async () => {
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(readSheetsLink(LINK, fetchFn)).rejects.toThrow(SHEETS_NOT_SHARED_MESSAGE);
  });

  it('perangkat offline → minta sambungkan internet, bukan soal share', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false);
    const fetchFn = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));

    await expect(readSheetsLink(LINK, fetchFn)).rejects.toThrow(/koneksi internet/i);
  });

  it('dibalas halaman login Google (HTML) → pesan cara share', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(200, 'text/html; charset=utf-8'));

    await expect(readSheetsLink(LINK, fetchFn)).rejects.toThrow(SHEETS_NOT_SHARED_MESSAGE);
  });

  it('404 → link tidak ditemukan (mis. ID terpotong saat di-copy)', async () => {
    const fetchFn = vi.fn().mockResolvedValue(fakeResponse(404, 'text/html; charset=utf-8'));

    await expect(readSheetsLink(LINK, fetchFn)).rejects.toThrow(/tidak ditemukan/i);
  });

  it('link docs.google.com yang bukan spreadsheet ditolak tanpa mengunduh', async () => {
    const fetchFn = vi.fn();

    await expect(readSheetsLink('https://docs.google.com/document/d/abc/edit', fetchFn)).rejects.toThrow(/tidak valid/i);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});
