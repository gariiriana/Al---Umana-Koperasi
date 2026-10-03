// ============================================================================
// MBG Delivery Service — Kurir task management, proof uploads, PDF
// ============================================================================

import {
  collection, doc, updateDoc, addDoc, getDocs, runTransaction, arrayUnion,
  query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { hasCompleteMbgProof, isMbgTaskAssignedTo } from '@/lib/mbgCourierAssignment';
import type { MbgDeliveryTask, MbgDeliveryStatus, MbgPmEntry } from '@/types/mbg';

const DELIVERY_COLLECTION = 'mbg_delivery_tasks';
const DOCUMENTS_COLLECTION = 'mbg_delivery_documents';

export function subscribeKurirTasks(
  batchId: string,
  userUid: string,
  _userEmail: string,
  userDisplayName: string,
  callback: (tasks: MbgDeliveryTask[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, DELIVERY_COLLECTION),
    where('batchId', '==', batchId)
  );
  return onSnapshot(q, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask));

    // UIDs are case-sensitive and authoritative. Names are used only for supervisor previews.
    const selectedName = userDisplayName.trim().toLocaleLowerCase();
    const filtered = userUid
      ? list.filter((task) => isMbgTaskAssignedTo(task, userUid))
      : list.filter((task) => !selectedName ||
          task.petugasName.trim().toLocaleLowerCase() === selectedName ||
          task.kenekName?.trim().toLocaleLowerCase() === selectedName);

    callback(filtered);
  }, onError);
}

export async function updateTaskStatus(
  taskId: string,
  status: MbgDeliveryStatus
): Promise<void> {
  if (status === 'delivered') throw new Error('Gunakan penyelesaian pengiriman untuk memvalidasi seluruh bukti.');
  const updates: Partial<MbgDeliveryTask> = {
    status,
    updatedAt: new Date().toISOString(),
  };
  await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), updates);
}

/** Validate fresh task, batch and per-school evidence before committing completion. */
export async function completeTaskAndBatch(task: MbgDeliveryTask): Promise<void> {
  const taskRef = doc(db, DELIVERY_COLLECTION, task.id);
  await runTransaction(db, async (transaction) => {
    const taskSnapshot = await transaction.get(taskRef);
    if (!taskSnapshot.exists()) throw new Error('Tugas pengiriman tidak ditemukan.');
    const currentTask = taskSnapshot.data() as MbgDeliveryTask;
    if (currentTask.status === 'delivered') return;
    if (currentTask.status !== 'delivering') throw new Error('Mulai pengantaran sebelum menyelesaikan tugas.');
    const batchSnapshot = await transaction.get(doc(db, 'mbg_pm_batches', currentTask.batchId));
    if (!batchSnapshot.exists() || batchSnapshot.data().productionCookingStatus !== 'cooked') {
      throw new Error('Produksi harus selesai sebelum pengiriman diselesaikan.');
    }
    if (!currentTask.entryIds?.length) throw new Error('Tugas belum memiliki tujuan pengiriman.');
    const entries = await Promise.all(currentTask.entryIds.map((id) =>
      transaction.get(doc(db, 'mbg_pm_entries', id))));
    let activeCount = 0;
    for (const snapshot of entries) {
      if (!snapshot.exists()) throw new Error('Tujuan pengiriman tidak ditemukan.');
      const entry = snapshot.data() as MbgPmEntry;
      if (entry.batchId !== currentTask.batchId || entry.assignedPetugasId !== currentTask.petugasId) {
        throw new Error('Penugasan telah berubah. Muat ulang tugas pengiriman.');
      }
      if (!entry.isSekolahLibur) {
        activeCount++;
        if (!hasCompleteMbgProof(entry)) throw new Error('Lengkapi empat foto bukti di setiap tujuan sebelum menyelesaikan pengiriman.');
      }
    }
    if (!activeCount) throw new Error('Tidak ada tujuan aktif untuk diselesaikan.');
    transaction.update(taskRef, { status: 'delivered', completedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  });

  // Read all tasks, including those of other couriers, before promoting the shared batch.
  const taskSnapshot = await getDocs(query(collection(db, DELIVERY_COLLECTION), where('batchId', '==', task.batchId)));
  const activeTasks = taskSnapshot.docs.filter((item) => item.data().entryIds?.length > 0);
  if (activeTasks.length && activeTasks.every((item) => item.data().status === 'delivered')) {
    await updateDoc(doc(db, 'mbg_pm_batches', task.batchId), { status: 'DELIVERED', updatedAt: new Date().toISOString() });
  }
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
  _currentPhotos: MbgDeliveryTask['deliveryPhotos'],
  newPhoto: { fileId: string; description: string; institutionName: string }
): Promise<void> {
  if (!taskId || taskId.startsWith('virt-task-')) return;
  await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), {
    deliveryPhotos: arrayUnion(newPhoto),
    updatedAt: new Date().toISOString(),
  });
}

export async function compressImageBase64(
  dataUrl: string,
  maxWidth = 640,
  maxHeight = 640,
  quality = 0.65
): Promise<string> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      let { width, height } = img;
      if (width > maxWidth || height > maxHeight) {
        if (width / height > maxWidth / maxHeight) {
          height = Math.round((height * maxWidth) / width);
          width = maxWidth;
        } else {
          width = Math.round((width * maxHeight) / height);
          height = maxHeight;
        }
      }
      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      } else {
        resolve(dataUrl);
      }
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

/**
 * Update delivery proof foto (menu, serah terima, atau surat jalan) untuk 1 sekolah/entry
 */
export async function updateSchoolDeliveryProof(
  entryId: string,
  institutionName: string,
  proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan',
  rawPhotoDataUrl: string,
  taskId?: string,
  extraMeta?: { timestamp?: string; location?: string; description?: string }
): Promise<string> {
  const compressedPhoto = await compressImageBase64(rawPhotoDataUrl, 640, 640, 0.65);

  const entryUpdates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (proofType === 'menu') {
    entryUpdates.photoMenuUrl = compressedPhoto;
    if (extraMeta?.description) entryUpdates.photoMenuDesc = extraMeta.description;
  } else if (proofType === 'penerima') {
    entryUpdates.photoPenerimaUrl = compressedPhoto;
    if (extraMeta?.description) entryUpdates.photoPenerimaDesc = extraMeta.description;
    if (extraMeta?.timestamp) entryUpdates.photoPenerimaTimestamp = extraMeta.timestamp;
    if (extraMeta?.location) entryUpdates.photoPenerimaLocation = extraMeta.location;
  } else if (proofType === 'serah_terima') {
    entryUpdates.photoSerahTerimaUrl = compressedPhoto;
    if (extraMeta?.description) entryUpdates.photoSerahTerimaDesc = extraMeta.description;
    if (extraMeta?.timestamp) entryUpdates.photoSerahTerimaTimestamp = extraMeta.timestamp;
    if (extraMeta?.location) entryUpdates.photoSerahTerimaLocation = extraMeta.location;
  } else if (proofType === 'surat_jalan') {
    entryUpdates.photoSuratJalanUrl = compressedPhoto;
    if (extraMeta?.description) entryUpdates.photoSuratJalanDesc = extraMeta.description;
  }

  // Update Firestore mbg_pm_entries
  await updateDoc(doc(db, 'mbg_pm_entries', entryId), entryUpdates);

  // Sync to task if taskId provided and is a real Firestore document
  if (taskId && !taskId.startsWith('virt-task-')) {
    const taskRef = doc(db, DELIVERY_COLLECTION, taskId);
    const proofKey = `schoolProofs.${entryId}`;
    const taskUpdates: Record<string, unknown> = {
      [`${proofKey}.institutionName`]: institutionName,
      [`${proofKey}.updatedAt`]: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (proofType === 'menu') {
      taskUpdates[`${proofKey}.photoMenuUrl`] = compressedPhoto;
      if (extraMeta?.description) taskUpdates[`${proofKey}.photoMenuDesc`] = extraMeta.description;
    } else if (proofType === 'penerima') {
      taskUpdates[`${proofKey}.photoPenerimaUrl`] = compressedPhoto;
      if (extraMeta?.description) taskUpdates[`${proofKey}.photoPenerimaDesc`] = extraMeta.description;
      if (extraMeta?.timestamp) taskUpdates[`${proofKey}.photoPenerimaTimestamp`] = extraMeta.timestamp;
      if (extraMeta?.location) taskUpdates[`${proofKey}.photoPenerimaLocation`] = extraMeta.location;
    } else if (proofType === 'serah_terima') {
      taskUpdates[`${proofKey}.photoSerahTerimaUrl`] = compressedPhoto;
      if (extraMeta?.description) taskUpdates[`${proofKey}.photoSerahTerimaDesc`] = extraMeta.description;
      if (extraMeta?.timestamp) taskUpdates[`${proofKey}.photoSerahTerimaTimestamp`] = extraMeta.timestamp;
      if (extraMeta?.location) taskUpdates[`${proofKey}.photoSerahTerimaLocation`] = extraMeta.location;
    } else if (proofType === 'surat_jalan') {
      taskUpdates[`${proofKey}.photoSuratJalanUrl`] = compressedPhoto;
      if (extraMeta?.description) taskUpdates[`${proofKey}.photoSuratJalanDesc`] = extraMeta.description;
    }

    try {
      await updateDoc(taskRef, taskUpdates);
    } catch (err) {
      console.warn('Failed syncing to delivery task:', err);
    }
  }

  return compressedPhoto;
}

/**
 * Delete / Reset delivery proof foto untuk 1 sekolah/entry
 */
export async function deleteSchoolDeliveryProof(
  entryId: string,
  proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan',
  taskId?: string
): Promise<void> {
  const fieldMap: Record<string, string> = {
    menu: 'photoMenuUrl',
    penerima: 'photoPenerimaUrl',
    serah_terima: 'photoSerahTerimaUrl',
    surat_jalan: 'photoSuratJalanUrl',
  };
  const descMap: Record<string, string> = {
    menu: 'photoMenuDesc',
    penerima: 'photoPenerimaDesc',
    serah_terima: 'photoSerahTerimaDesc',
    surat_jalan: 'photoSuratJalanDesc',
  };

  await updateDoc(doc(db, 'mbg_pm_entries', entryId), {
    [fieldMap[proofType]]: null,
    [descMap[proofType]]: null,
    updatedAt: new Date().toISOString(),
  });

  if (taskId && !taskId.startsWith('virt-task-')) {
    const proofKey = `schoolProofs.${entryId}`;
    try {
      await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), {
        [`${proofKey}.${fieldMap[proofType]}`]: null,
        [`${proofKey}.${descMap[proofType]}`]: null,
        updatedAt: new Date().toISOString(),
      });
    } catch (err) {
      console.warn('Failed syncing photo deletion to delivery task:', err);
    }
  }
}

/**
 * Update deskripsi foto tanpa mengubah foto itu sendiri
 */
export async function updatePhotoDescription(
  entryId: string,
  proofType: 'menu' | 'penerima' | 'serah_terima' | 'surat_jalan',
  description: string
): Promise<void> {
  const fieldMap: Record<string, string> = {
    menu: 'photoMenuDesc',
    penerima: 'photoPenerimaDesc',
    serah_terima: 'photoSerahTerimaDesc',
    surat_jalan: 'photoSuratJalanDesc',
  };
  await updateDoc(doc(db, 'mbg_pm_entries', entryId), {
    [fieldMap[proofType]]: description,
    updatedAt: new Date().toISOString(),
  });
}

// ─── Arsip Dokumen ───

export interface MbgDeliveryDocument {
  id: string;
  batchId: string;
  tanggalBatch: string;
  petugasName: string;
  petugasId: string;
  documentType: 'delivery_report';
  fileName: string;
  totalInstitusi: number;
  totalPorsi: number;
  completedCount: number;
  createdAt: string;
  createdBy: string;
}

export async function saveDeliveryDocument(
  data: Omit<MbgDeliveryDocument, 'id'>
): Promise<string> {
  const docRef = await addDoc(collection(db, DOCUMENTS_COLLECTION), data);
  return docRef.id;
}

export async function upsertDeliveryDocument(
  data: Omit<MbgDeliveryDocument, 'id'>
): Promise<string> {
  try {
    const colRef = collection(db, DOCUMENTS_COLLECTION);
    const q = query(
      colRef,
      where('batchId', '==', data.batchId),
      where('petugasName', '==', data.petugasName)
    );
    const snap = await getDocs(q);
    if (!snap.empty) {
      const existingDoc = snap.docs[0];
      await updateDoc(doc(db, DOCUMENTS_COLLECTION, existingDoc.id), {
        ...data,
        updatedAt: new Date().toISOString(),
      });
      return existingDoc.id;
    } else {
      const docRef = await addDoc(colRef, data);
      return docRef.id;
    }
  } catch (err) {
    console.error('Error upserting delivery document:', err);
    return saveDeliveryDocument(data);
  }
}

export function subscribeDeliveryDocuments(
  petugasId: string,
  callback: (docs: MbgDeliveryDocument[]) => void
): Unsubscribe {
  const q = query(
    collection(db, DOCUMENTS_COLLECTION),
    where('petugasId', '==', petugasId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryDocument)));
  });
}

export function subscribeBatchDeliveryDocuments(
  batchId: string,
  callback: (docs: MbgDeliveryDocument[]) => void
): Unsubscribe {
  const q = query(
    collection(db, DOCUMENTS_COLLECTION),
    where('batchId', '==', batchId),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryDocument)));
  });
}

export function subscribeAllDeliveryDocuments(
  callback: (docs: MbgDeliveryDocument[]) => void
): Unsubscribe {
  const q = query(
    collection(db, DOCUMENTS_COLLECTION),
    orderBy('createdAt', 'desc')
  );
  return onSnapshot(q, (snap) => {
    callback(snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryDocument)));
  });
}

