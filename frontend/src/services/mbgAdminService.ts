// ============================================================================
// MBG Admin Service — CRUD for PM Data (Batches & Entries)
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  onSnapshot,
  writeBatch,
  getDocs,
  deleteField,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgPmBatch, MbgPmEntry, MbgBatchStatus } from '@/types/mbg';

const BATCHES_COLLECTION = 'mbg_pm_batches';
const ENTRIES_COLLECTION = 'mbg_pm_entries';

// ---- Batch Operations ----

export function subscribeBatches(
  callback: (batches: MbgPmBatch[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, BATCHES_COLLECTION),
    orderBy('tanggal', 'desc')
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const batches = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmBatch[];
      callback(batches);
    },
    (error) => onError?.(error)
  );
}

export async function createBatch(
  tanggal: string,
  createdBy: string
): Promise<string> {
  const batch: Omit<MbgPmBatch, 'id'> = {
    tanggal,
    status: 'DRAFT',
    totalSiswaBalita: 0,
    totalBumilBusui: 0,
    totalGuruKader: 0,
    totalPobiaNasi: 0,
    totalJumlah: 0,
    petugasList: [],
    batchNotes: '',
    createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  const docRef = await addDoc(collection(db, BATCHES_COLLECTION), batch);
  return docRef.id;
}

export async function updateBatch(
  batchId: string,
  updates: Partial<MbgPmBatch>
): Promise<void> {
  const ref = doc(db, BATCHES_COLLECTION, batchId);
  await updateDoc(ref, {
    ...updates,
    updatedAt: new Date().toISOString(),
  });
}

export async function updateBatchStatus(
  batchId: string,
  status: MbgBatchStatus
): Promise<void> {
  await updateBatch(batchId, { status });
}

export async function deleteBatch(batchId: string): Promise<void> {
  // Delete all entries in this batch first
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  const snapshot = await getDocs(q);
  const batch = writeBatch(db);
  snapshot.docs.forEach((d) => batch.delete(d.ref));
  batch.delete(doc(db, BATCHES_COLLECTION, batchId));
  await batch.commit();
}

// ---- PM Entry Operations ----

export function subscribeEntries(
  batchId: string,
  callback: (entries: MbgPmEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmEntry[];
      entries.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      callback(entries);
    },
    (error) => onError?.(error)
  );
}

export function subscribeAllEntries(
  callback: (entries: MbgPmEntry[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, ENTRIES_COLLECTION)
  );
  return onSnapshot(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmEntry[];
      entries.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      callback(entries);
    },
    (error) => onError?.(error)
  );
}

export async function addEntry(
  entry: Omit<MbgPmEntry, 'id'>
): Promise<string> {
  const cleanEntry: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(entry)) {
    if (val !== undefined) {
      cleanEntry[key] = val;
    }
  }

  const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), {
    ...cleanEntry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  });
  return docRef.id;
}

export async function updateEntry(
  entryId: string,
  updates: Partial<MbgPmEntry>
): Promise<void> {
  const ref = doc(db, ENTRIES_COLLECTION, entryId);
  const scrubbed: Record<string, unknown> = {};
  for (const [key, val] of Object.entries(updates)) {
    if (val === undefined) {
      scrubbed[key] = deleteField();
    } else {
      scrubbed[key] = val;
    }
  }

  await updateDoc(ref, {
    ...scrubbed,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await deleteDoc(doc(db, ENTRIES_COLLECTION, entryId));
}

// ---- Bulk Operations ----

export async function addMultipleEntries(
  entries: Omit<MbgPmEntry, 'id'>[]
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  entries.forEach((entry) => {
    const ref = doc(collection(db, ENTRIES_COLLECTION));
    batch.set(ref, {
      ...entry,
      createdAt: now,
      updatedAt: now,
    });
  });
  await batch.commit();
}

/**
 * Recalculates batch totals from all its entries and updates the batch document.
 */
export async function recalculateBatchTotals(batchId: string): Promise<void> {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  const snapshot = await getDocs(q);
  const entries = snapshot.docs.map((d) => d.data() as MbgPmEntry);

  let totalSiswaBalita = 0;
  let totalBumilBusui = 0;
  let totalGuruKader = 0;
  let totalPobiaNasi = 0;
  let totalJumlah = 0;
  const petugasSet = new Set<string>();

  entries.forEach((e) => {
    if (!e.isSekolahLibur) {
      totalSiswaBalita += e.qtSiswaBalita || 0;
      totalBumilBusui += e.qtBumilBusui || 0;
      totalGuruKader += e.qtGuruKader || 0;
      totalPobiaNasi += e.qtPobiaNasi || 0;
      totalJumlah += e.jumlah || 0;
    }
    if (e.assignedPetugasName) {
      petugasSet.add(e.assignedPetugasName);
    }
  });

  await updateBatch(batchId, {
    totalSiswaBalita,
    totalBumilBusui,
    totalGuruKader,
    totalPobiaNasi,
    totalJumlah,
    petugasList: Array.from(petugasSet),
  });
}

/**
 * Copy entries from a previous batch (for "salin data kemarin" feature).
 */
export async function copyFromBatch(
  sourceBatchId: string,
  targetBatchId: string,
  createdBy: string
): Promise<void> {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', sourceBatchId)
  );
  const snapshot = await getDocs(q);
  const now = new Date().toISOString();
  const batch = writeBatch(db);

  snapshot.docs.forEach((d) => {
    const data = d.data() as MbgPmEntry;
    const ref = doc(collection(db, ENTRIES_COLLECTION));
    batch.set(ref, {
      ...data,
      batchId: targetBatchId,
      isSekolahLibur: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    });
  });

  await batch.commit();
}
