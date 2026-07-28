// ============================================================================
// MBG Delivery Service — Kurir task management, proof uploads, PDF
// ============================================================================

import {
  collection, doc, updateDoc, addDoc,
  query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgDeliveryTask, MbgDeliveryStatus } from '@/types/mbg';

const DELIVERY_COLLECTION = 'mbg_delivery_tasks';
const DOCUMENTS_COLLECTION = 'mbg_delivery_documents';

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

export async function compressImageBase64(
  dataUrl: string,
  maxWidth = 800,
  maxHeight = 800,
  quality = 0.75
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
  proofType: 'menu' | 'serah_terima' | 'surat_jalan',
  rawPhotoDataUrl: string,
  taskId?: string,
  extraMeta?: { timestamp?: string; location?: string; description?: string }
): Promise<string> {
  const compressedPhoto = await compressImageBase64(rawPhotoDataUrl, 800, 800, 0.75);

  const entryUpdates: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };

  if (proofType === 'menu') {
    entryUpdates.photoMenuUrl = compressedPhoto;
    if (extraMeta?.description) entryUpdates.photoMenuDesc = extraMeta.description;
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

  // Sync to task if taskId provided
  if (taskId) {
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
 * Update deskripsi foto tanpa mengubah foto itu sendiri
 */
export async function updatePhotoDescription(
  entryId: string,
  proofType: 'menu' | 'serah_terima' | 'surat_jalan',
  description: string
): Promise<void> {
  const fieldMap: Record<string, string> = {
    menu: 'photoMenuDesc',
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

