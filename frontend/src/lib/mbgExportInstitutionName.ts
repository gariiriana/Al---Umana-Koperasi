/** Nama SPPG yang ditulis di belakang baris Organoleptik Dapur pada hasil export distribusi MBG. */
export const SPPG_NAME = 'SPPG Sukabumi Gunungguruh Kebonmanggu';

/**
 * Nama institusi untuk export (PDF/Word) distribusi MBG. "Organoleptik Dapur" adalah sampel
 * dapur sendiri, jadi diberi nama SPPG supaya jelas dapur mana; institusi lain tidak berubah.
 */
export function exportInstitutionName(name: string | undefined | null): string {
  const trimmed = (name ?? '').trim();
  if (!trimmed) return '-';
  if (/^organoleptik dapur$/i.test(trimmed)) return `${trimmed} ${SPPG_NAME}`;
  return trimmed;
}
