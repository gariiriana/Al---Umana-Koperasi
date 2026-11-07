import type { MbgPmBatch } from '@/types/mbg';

export interface CopySourceOptions {
  /** Batch aktif bertanggal sebelum tanggal tujuan, terbaru dulu. */
  before: MbgPmBatch[];
  /** Batch aktif bertanggal setelah tanggal tujuan (mis. salah ketik tahun), terdekat dulu. */
  after: MbgPmBatch[];
  /** Sumber bawaan: batch terakhir sebelum tanggal tujuan yang punya porsi. */
  defaultId: string;
}

/**
 * Pilihan sumber "Salin dari Batch Sebelumnya" untuk tanggal tujuan `tanggal` (YYYY-MM-DD).
 * Dulu sumber bawaan adalah batch bertanggal paling besar, sehingga batch salah ketik
 * seperti 2030-10-23 terpilih alih-alih batch kemarin.
 */
export function copySourceOptions(batches: MbgPmBatch[], tanggal: string): CopySourceOptions {
  const active = batches.filter((b) => !b.isBackup && b.tanggal && b.tanggal !== tanggal);
  const before = active
    .filter((b) => b.tanggal < tanggal)
    .sort((a, b) => b.tanggal.localeCompare(a.tanggal));
  const after = active
    .filter((b) => b.tanggal > tanggal)
    .sort((a, b) => a.tanggal.localeCompare(b.tanggal));
  const hasPorsi = (b: MbgPmBatch) => (b.totalJumlah ?? 0) > 0;
  const best = before.find(hasPorsi) ?? before[0] ?? after.find(hasPorsi) ?? after[0];
  return { before, after, defaultId: best?.id ?? '' };
}
