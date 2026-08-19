// ============================================================================
// MBG Delivery Service — Kurir task management, proof uploads, PDF
// ============================================================================

import {
  collection, doc, updateDoc, addDoc, getDocs,
  query, where, orderBy, onSnapshot, type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgDeliveryTask, MbgDeliveryStatus } from '@/types/mbg';

const DELIVERY_COLLECTION = 'mbg_delivery_tasks';
const DOCUMENTS_COLLECTION = 'mbg_delivery_documents';

export function subscribeKurirTasks(
  batchId: string,
  userUid: string,
  userEmail: string,
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

    // If no user identity specified, return all batch tasks (for admin preview)
    if (!userUid && !userEmail && !userDisplayName) {
      callback(list);
      return;
    }

    const uidLower = (userUid || '').toLowerCase().trim();
    const emailLower = (userEmail || '').toLowerCase().trim();
    const emailHandle = emailLower ? emailLower.split('@')[0] : '';
    const nameLower = (userDisplayName || '').toLowerCase().trim();
    const nameTokens = Array.from(
      new Set([
        ...nameLower.split(/[\s,+/&|()_\-.]+/).filter((t) => t.length >= 2),
        ...emailHandle.split(/[\s,+/&|()_\-.]+/).filter((t) => t.length >= 2),
      ])
    );

    // Scoring-based matching: higher score = better match
    const matchScore = (tName: string, tId: string): number => {
      if (!tName && !tId) return 0;
      const targetName = (tName || '').toLowerCase().trim();
      const targetId = (tId || '').toLowerCase().trim();

      // Exact UID match = highest priority
      if (uidLower && (targetId === uidLower || targetId.includes(uidLower))) return 100;

      // Exact full name match
      if (nameLower && targetName === nameLower) return 90;

      // Name contains or is contained (partial match)
      if (nameLower && (targetName.includes(nameLower) || nameLower.includes(targetName))) return 80;

      // Email handle match
      if (emailHandle && (targetName.includes(emailHandle) || targetId.includes(emailHandle) || emailHandle.includes(targetName))) return 75;

      // Token-level match (individual name words e.g. "Dwi" in "Dwi & Wandi", "Andi" in "Andi & Dede")
      const targetTokens = targetName.split(/[\s,+/&|()_\-.]+/).filter((t) => t.length >= 2);
      const hasTokenMatch = nameTokens.some((tok) =>
        targetTokens.some((tTok) => tTok === tok || (tok.length >= 3 && (tTok.includes(tok) || tok.includes(tTok))))
      );
      if (hasTokenMatch) return 70;

      if (nameTokens.some((tok) => targetName.includes(tok) || targetId.includes(tok))) return 60;

      return 0;
    };

    const scored = list.map((t) => {
      const kurirScore = matchScore(t.petugasName, t.petugasId);
      const kenekScore = matchScore(t.kenekName || '', t.kenekId || '');
      return { task: t, score: Math.max(kurirScore, kenekScore) };
    });

    const filtered = scored
      .filter((s) => s.score > 0)
      .sort((a, b) => b.score - a.score)
      .map((s) => s.task);

    // If user specified identity but nothing matched, and there are tasks in batch
    if (filtered.length === 0 && list.length > 0) {
      console.warn(
        `[subscribeKurirTasks] No direct match for user (uid=${uidLower}, name=${nameLower}, email=${emailHandle}) in ${list.length} tasks:`,
        list.map((t) => ({ petugasName: t.petugasName, petugasId: t.petugasId, kenekName: t.kenekName }))
      );

      // Fallback: broad word-level / token matching
      const fallbackMatches = list.filter((t) => {
        const pName = (t.petugasName || '').toLowerCase();
        const pId = (t.petugasId || '').toLowerCase();
        const kName = (t.kenekName || '').toLowerCase();
        const allText = `${pName} ${pId} ${kName}`;
        return nameTokens.some((tok) => allText.includes(tok));
      });

      if (fallbackMatches.length > 0) {
        console.log(`[subscribeKurirTasks] Fallback matched ${fallbackMatches.length} tasks`);
        callback(fallbackMatches);
        return;
      }
    }

    callback(filtered);
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
  if (!taskId || taskId.startsWith('virt-task-')) return;
  try {
    await updateDoc(doc(db, DELIVERY_COLLECTION, taskId), {
      deliveryPhotos: [...(currentPhotos || []), newPhoto],
      updatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Failed adding photo to delivery task:', err);
  }
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

