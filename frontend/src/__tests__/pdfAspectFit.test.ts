import { describe, it, expect } from 'vitest';
import { calculateFitDimensions, formatInstitutionBreakdown } from '@/utils/mbgDeliveryReportPdfExporter';
import type { MbgPmEntry } from '@/types/mbg';

describe('PDF Photo Aspect Ratio & Fit Calculations', () => {
  it('correctly fits landscape (wide) image inside bounding box without stretching', () => {
    // 1600x900 (16:9) inside 43mm x 30mm box
    const fit = calculateFitDimensions(1600, 900, 10, 20, 43, 30);

    // imgRatio = 16/9 = 1.777. boxRatio = 43/30 = 1.433.
    // img is wider -> renderW should be exactly boxW (43)
    expect(fit.w).toBeCloseTo(43, 2);
    // renderH should be 43 / (16/9) = 24.1875mm (< 30mm)
    expect(fit.h).toBeCloseTo(24.1875, 2);
    // x should stay at boxX (10)
    expect(fit.x).toBeCloseTo(10, 2);
    // y should be centered: 20 + (30 - 24.1875) / 2 = 22.90625
    expect(fit.y).toBeCloseTo(22.90625, 2);
  });

  it('correctly fits portrait (tall) image inside bounding box without flattening', () => {
    // 900x1600 (9:16) inside 43mm x 30mm box
    const fit = calculateFitDimensions(900, 1600, 10, 20, 43, 30);

    // img is taller -> renderH should be exactly boxH (30)
    expect(fit.h).toBeCloseTo(30, 2);
    // renderW should be 30 * (9/16) = 16.875mm (< 43mm)
    expect(fit.w).toBeCloseTo(16.875, 2);
    // x should be centered: 10 + (43 - 16.875) / 2 = 23.0625
    expect(fit.x).toBeCloseTo(23.0625, 2);
    // y should stay at boxY (20)
    expect(fit.y).toBeCloseTo(20, 2);
  });

  it('handles square (1:1) image correctly', () => {
    // 1000x1000 inside 43mm x 30mm box
    const fit = calculateFitDimensions(1000, 1000, 0, 0, 43, 30);

    expect(fit.h).toBeCloseTo(30, 2);
    expect(fit.w).toBeCloseTo(30, 2);
    expect(fit.x).toBeCloseTo(6.5, 2); // (43 - 30) / 2
    expect(fit.y).toBeCloseTo(0, 2);
  });

  it('handles invalid or zero dimensions gracefully without NaN or infinite values', () => {
    const fit = calculateFitDimensions(0, 0, 10, 20, 43, 30);
    expect(fit.x).toBe(10);
    expect(fit.y).toBe(20);
    expect(fit.w).toBe(43);
    expect(fit.h).toBe(30);
  });

  it('correctly formats institution breakdowns into combined Sekolah and Posyandu strings', () => {
    const entriesMix: MbgPmEntry[] = [
      { id: '1', institutionName: 'SDN 1 Cibadak', institutionType: 'sekolah' } as MbgPmEntry,
      { id: '2', institutionName: 'SMPN 2 Sukabumi', institutionType: 'sekolah' } as MbgPmEntry,
      { id: '3', institutionName: 'CEMPAKA 6', institutionType: 'posyandu' } as MbgPmEntry,
      { id: '4', institutionName: 'CEMPAKA 7', institutionType: 'posyandu' } as MbgPmEntry,
    ];
    expect(formatInstitutionBreakdown(entriesMix)).toBe('2 Sekolah, 2 Posyandu');

    const onlySchools: MbgPmEntry[] = [
      { id: '1', institutionName: 'SDN 1 Cibadak', institutionType: 'sekolah' } as MbgPmEntry,
      { id: '2', institutionName: 'SMPN 2 Sukabumi', institutionType: 'sekolah' } as MbgPmEntry,
    ];
    expect(formatInstitutionBreakdown(onlySchools)).toBe('2 Sekolah');

    const onlyPosyandu: MbgPmEntry[] = [
      { id: '1', institutionName: 'CEMPAKA 6', institutionType: 'posyandu' } as MbgPmEntry,
      { id: '2', institutionName: 'CEMPAKA 7', institutionType: 'posyandu' } as MbgPmEntry,
    ];
    expect(formatInstitutionBreakdown(onlyPosyandu)).toBe('2 Posyandu');
  });
});
