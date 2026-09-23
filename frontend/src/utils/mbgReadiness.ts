import type { MbgDeliveryStatus, MbgDeliveryTask, MbgPmBatch, MbgProductionCookingStatus } from '@/types/mbg';

export const MBG_PRODUCTION_COOKING_LABELS: Record<MbgProductionCookingStatus, string> = {
  not_started: 'Belum dimasak',
  cooking: 'Sedang dimasak',
  cooked: 'Selesai dimasak',
};

/** Planning/export/distribution status never proves that the food was cooked. */
export function isMbgBatchCooked(batch: Pick<MbgPmBatch, 'productionCookingStatus'> | null | undefined): boolean {
  return batch?.productionCookingStatus === 'cooked';
}

export function canAdvanceMbgCooking(current: MbgProductionCookingStatus | undefined, next: MbgProductionCookingStatus): boolean {
  return ((current || 'not_started') === 'not_started' && next === 'cooking') ||
    (current === 'cooking' && next === 'cooked');
}

export function canAdvanceMbgDelivery(
  task: Pick<MbgDeliveryTask, 'status' | 'handoverPhotoId' | 'handoverAt'>,
  next: MbgDeliveryStatus,
): boolean {
  if (next === 'handover_done') return task.status === 'waiting';
  const hasHandover = Boolean(task.handoverPhotoId?.trim() && task.handoverAt?.trim());
  if (next === 'delivering') return task.status === 'handover_done' && hasHandover;
  if (next === 'delivered') return task.status === 'delivering' && hasHandover;
  return false;
}
