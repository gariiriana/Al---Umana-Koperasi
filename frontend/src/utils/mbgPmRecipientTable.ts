import type { MbgPmEntry } from '@/types/mbg';
import {
  getAllDetailedPmEntries,
  type DetailedPmRow,
} from '@/utils/mbgPmFilter';

/**
 * This is the canonical schema for the "Data Penerima Manfaat" table.
 * The production page and every export use these rows so an imported batch
 * cannot show a different recipient, portion, or total in PDF/DOCX.
 */
export const MBG_PM_RECIPIENT_TABLE_COLUMNS = [
  'No',
  'Nama Institusi / Lembaga',
  'Kategori / Jenjang',
  'Porsi Kecil',
  'Porsi Besar',
  'Porsi Balita',
  'Porsi Bumil / Busui',
  'Total Porsi',
  'Rincian / Catatan',
  'Petugas Kurir',
  'Jadwal Pengantaran',
  'Status',
] as const;

export interface MbgPmRecipientTableTotals {
  porsiKecil: number;
  porsiBesar: number;
  porsiBalita: number;
  porsiBumilBusui: number;
  totalPorsi: number;
}

export interface MbgPmRecipientTable {
  rows: DetailedPmRow[];
  totals: MbgPmRecipientTableTotals;
}

type SekolahFallback = { nama: string; murid: number; guru: number };

export function buildMbgPmRecipientTable(
  entries: MbgPmEntry[] = [],
  sekolahList: SekolahFallback[] = []
): MbgPmRecipientTable {
  const rows = getAllDetailedPmEntries(entries, sekolahList);
  const totals = rows.reduce<MbgPmRecipientTableTotals>(
    (sum, row) => {
      // The website keeps a libur row visible, but excludes it from the
      // production total. Exports must follow that same rule.
      if (row.isLibur) return sum;
      sum.porsiKecil += row.porsiKecil;
      sum.porsiBesar += row.porsiBesar;
      sum.porsiBalita += row.porsiBalita;
      sum.porsiBumilBusui += row.porsiBumilBusui;
      sum.totalPorsi += row.totalJumlah;
      return sum;
    },
    { porsiKecil: 0, porsiBesar: 0, porsiBalita: 0, porsiBumilBusui: 0, totalPorsi: 0 }
  );

  return { rows, totals };
}

export function formatMbgPmRecipientValue(value: number): string {
  return value > 0 ? value.toLocaleString('id-ID') : '-';
}

export function formatMbgPmRecipientName(row: DetailedPmRow): string {
  return row.address ? `${row.institutionName}\n${row.address}` : row.institutionName;
}

export function formatMbgPmRecipientPetugas(row: DetailedPmRow): string {
  return row.petugasName && row.petugasName !== '-' && row.petugasName !== 'Belum Ditugaskan'
    ? row.petugasName
    : '-';
}
