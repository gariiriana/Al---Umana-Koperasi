export type ImportTargetOption = 'current_batch' | 'sheet_date';

/**
 * Both imports (Laporan Harian Produksi and Daftar Pesanan Bahan) go into the batch
 * the user has open unless they pick "Sesuai Tanggal pada Nama Tab". Defaulting the
 * bahan import to the tab date sent data into another batch (e.g. 20 Nov while the
 * user was finishing 21 Nov).
 */
export function defaultImportTargetOption(): ImportTargetOption {
  return 'current_batch';
}

/**
 * The batch to show once an import finishes: the one the user had open stays open,
 * even when the data went into another batch. Only with no batch open do we jump to
 * the imported one.
 */
export function batchToShowAfterImport(
  openBatchId: string | null | undefined,
  importedBatchId: string
): string {
  return openBatchId || importedBatchId;
}
