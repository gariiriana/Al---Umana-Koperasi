import { describe, expect, it } from 'vitest';
import { createEmptyReport } from '@/utils/productionSheetParser';
import { generate8PageDailyReportPdf } from '@/utils/dailyReportPdfExporter';

describe('daily report PDF totals', () => {
  it('prints a table total once even when the table spans several pages', async () => {
    const report = { id: 'r1', ...createEmptyReport('b1', '2026-10-05', '05102026') };
    report.porsiBesar = {
      ...report.porsiBesar,
      // Enough rows that the Rincian Bahan table must break across pages
      bahanItems: Array.from({ length: 40 }, (_, i) => ({
        rincianBahan: `Bahan Uji ${i + 1}`, hargaBahan: 10000, bddPercent: 100, beratKotor: 1,
        totalGml: 1000, sparePercent: 0, kebutuhan: 1, satuan: 'kg', harga: 10000,
      })),
      totalBelanjaBahan: 98765432,
    };

    const doc = await generate8PageDailyReportPdf(report, undefined, []);
    const pages = (doc.internal as unknown as { pages: string[][] }).pages
      .slice(1)
      .map((page) => page.join('\n'));

    const pagesWithBahanRows = pages.filter((page) => page.includes('Bahan Uji')).length;
    const totalPrints = pages.reduce((n, page) => n + page.split('98.765.432').length - 1, 0);

    expect(pagesWithBahanRows).toBeGreaterThan(1);
    expect(totalPrints).toBe(1);
  });
});
