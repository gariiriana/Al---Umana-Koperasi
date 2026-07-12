// ============================================================================
// MBG Distribution Service — QC Checks + Kurir Assignment
// ============================================================================

import {
  collection, doc, addDoc, updateDoc,
  query, where, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgQcCheck, MbgDeliveryTask } from '@/types/mbg';

const QC_COLLECTION = 'mbg_qc_checks';
const DELIVERY_COLLECTION = 'mbg_delivery_tasks';

// ---- QC Checks ----

export function subscribeQcChecks(
  batchId: string,
  callback: (checks: MbgQcCheck[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, QC_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgQcCheck)));
  }, onError);
}

export async function addQcCheck(check: Omit<MbgQcCheck, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, QC_COLLECTION), check);
  return ref.id;
}

export async function updateQcCheck(id: string, updates: Partial<MbgQcCheck>): Promise<void> {
  await updateDoc(doc(db, QC_COLLECTION, id), { ...updates, updatedAt: new Date().toISOString() });
}

// ---- Delivery Tasks ----

export function subscribeDeliveryTasks(
  batchId: string,
  callback: (tasks: MbgDeliveryTask[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, DELIVERY_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const tasks = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask));
    tasks.sort((a, b) => (a.petugasName || '').localeCompare(b.petugasName || ''));
    callback(tasks);
  }, onError);
}

export function subscribeMyDeliveryTasks(
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

export async function addDeliveryTask(task: Omit<MbgDeliveryTask, 'id'>): Promise<string> {
  const ref = await addDoc(collection(db, DELIVERY_COLLECTION), task);
  return ref.id;
}

export async function updateDeliveryTask(id: string, updates: Partial<MbgDeliveryTask>): Promise<void> {
  await updateDoc(doc(db, DELIVERY_COLLECTION, id), { ...updates, updatedAt: new Date().toISOString() });
}
