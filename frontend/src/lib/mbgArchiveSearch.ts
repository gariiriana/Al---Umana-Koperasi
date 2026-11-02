import type { MbgPmBatch } from '@/types/mbg';

/**
 * Archive search by school/posyandu or courier name, without reading PM rows. Each row can
 * carry ~230 KB of courier photos, so batches keep their own school names (`institutionNames`).
 */

/** Unique school names of a batch's rows, as stored on the batch. */
export function institutionNamesOf(entries: ReadonlyArray<{ institutionName?: string }>): string[] {
  const names = new Set(entries.map((entry) => (entry.institutionName || '').trim()).filter(Boolean));
  return [...names].sort((a, b) => a.localeCompare(b, 'id'));
}


/** Batches saved before school names were stored on them cannot be searched by school yet. */
export function hasSearchableSchools(batch: Pick<MbgPmBatch, 'institutionNames'>): boolean {
  return Array.isArray(batch.institutionNames);
}

/** Names on the batch that contain the query, or null when nothing matches. */
export function matchArchiveBatch(
  batch: Pick<MbgPmBatch, 'institutionNames' | 'petugasList'>,
  query: string,
): { institutions: string[]; couriers: string[] } | null {
  const q = query.trim().toLowerCase();
  const contains = (name: string) => name.toLowerCase().includes(q);
  const institutions = (batch.institutionNames || []).filter(contains);
  const couriers = (batch.petugasList || []).filter(contains);
  return institutions.length || couriers.length ? { institutions, couriers } : null;
}
