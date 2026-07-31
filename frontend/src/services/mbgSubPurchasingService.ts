// ============================================================================
// MBG Sub Purchasing Service — Task management for sub_purchasing role
// ============================================================================

import {
  collection, doc, addDoc, updateDoc,
  query, where, onSnapshot, orderBy, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgSubPurchasingTask } from '@/types/mbg';

const SUB_PURCHASING_COLLECTION = 'mbg_sub_purchasing_tasks';

/**
 * Subscribe to all sub_purchasing tasks for a specific batch
 */
export function subscribeSubPurchasingTasks(
  batchId: string,
  callback: (tasks: MbgSubPurchasingTask[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, SUB_PURCHASING_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgSubPurchasingTask));
    tasks.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    callback(tasks);
  }, onError);
}

/**
 * Subscribe to tasks assigned to a specific sub_purchasing user
 */
export function subscribeMySubPurchasingTasks(
  assignedTo: string,
  callback: (tasks: MbgSubPurchasingTask[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, SUB_PURCHASING_COLLECTION),
    where('assignedTo', '==', assignedTo),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgSubPurchasingTask)));
  }, onError);
}

export async function addSubPurchasingTask(
  task: Omit<MbgSubPurchasingTask, 'id'>
): Promise<string> {
  const ref = await addDoc(collection(db, SUB_PURCHASING_COLLECTION), task);
  return ref.id;
}

export async function updateSubPurchasingTask(
  id: string,
  updates: Partial<MbgSubPurchasingTask>
): Promise<void> {
  await updateDoc(doc(db, SUB_PURCHASING_COLLECTION, id), {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}
