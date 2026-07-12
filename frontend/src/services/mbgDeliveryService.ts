// ============================================================================
// MBG Delivery Service — Kurir task management, proof uploads, PDF
// ============================================================================

import {
  collection, doc, updateDoc,
  query, where, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgDeliveryTask, MbgDeliveryStatus } from '@/types/mbg';

const DELIVERY_COLLECTION = 'mbg_delivery_tasks';

export function subscribeKurirTasks(
  petugasId: string,
  callback: (tasks: MbgDeliveryTask[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, DELIVERY_COLLECTION),
    where('petugasId', '==', petugasId)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask)));
  }, onError);
}

export async function updateTaskStatus(
  taskId: string,
  status: MbgDeliveryStatus
): Promise<void> {
  const updates: Partial<MbgDeliveryTask> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  if (status === 'delivered') {
    updates.completedAt = new Date().toISOString();
  }
  await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), updates);
}

export async function setHandoverPhoto(
  taskId: string,
  photoId: string
): Promise<void> {
  await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), {
    handoverPhotoId: photoId,
    handoverAt: new Date().toISOString(),
    status: 'handover_done',
    updatedAt: new Date().toISOString(),
  });
}

export async function addDeliveryPhoto(
  taskId: string,
  currentPhotos: MbgDeliveryTask['deliveryPhotos'],
  newPhoto: { fileId: string; description: string; institutionName: string }
): Promise<void> {
  await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), {
    deliveryPhotos: [...currentPhotos, newPhoto],
    updatedAt: new Date().toISOString(),
  });
}
