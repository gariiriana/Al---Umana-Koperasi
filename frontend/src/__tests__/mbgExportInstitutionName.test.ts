import { describe, expect, it } from 'vitest';
import { exportInstitutionName } from '@/lib/mbgExportInstitutionName';

describe('exportInstitutionName', () => {
  it('adds the SPPG name to Organoleptik Dapur', () => {
    expect(exportInstitutionName('Organoleptik Dapur')).toBe('Organoleptik Dapur SPPG Sukabumi Gunungguruh Kebonmanggu');
    expect(exportInstitutionName('  organoleptik dapur ')).toBe('organoleptik dapur SPPG Sukabumi Gunungguruh Kebonmanggu');
  });

  it('does not add it twice', () => {
    const full = 'Organoleptik Dapur SPPG Sukabumi Gunungguruh Kebonmanggu';
    expect(exportInstitutionName(full)).toBe(full);
  });

  it('leaves other institutions alone', () => {
    expect(exportInstitutionName('SPS CEMPAKA')).toBe('SPS CEMPAKA');
    expect(exportInstitutionName('')).toBe('-');
    expect(exportInstitutionName(undefined)).toBe('-');
  });
});
