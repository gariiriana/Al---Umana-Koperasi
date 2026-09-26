// ============================================================================
// MBG Bahan Service — Dokumentasi Foto Bahan & Formulir Cek List Bahan Makanan
// Provides Firestore CRUD, de-duplication, and real-time synchronization
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  getDocs,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { archiveAndDelete, archiveSnapshotsAndDelete } from '@/services/developerRecycleBinService';
import type {
  MbgBahanDocumentation,
  MbgBahanChecklistForm,
  MbgInspectionFormRow,
  MbgProductionDailyReport,
} from '@/types/mbg';

export const BAHAN_DOCS_COLLECTION = 'mbg_bahan_documentation';
export const BAHAN_CHECKLIST_COLLECTION = 'mbg_inspection_forms';
const DAILY_REPORTS_COLLECTION = 'mbg_daily_reports';

function cleanUndefinedDeep<T>(obj: T): T {
  if (obj === undefined) return null as unknown as T;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefinedDeep) as unknown as T;
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    if (value !== undefined) {
      result[key] = cleanUndefinedDeep(value);
    }
  }
  return result as T;
}

// ============================================================================
// 1. DOKUMENTASI FOTO BAHAN (DISTRIBUSI MBG)
// ============================================================================

export function subscribeBahanDocumentation(
  batchId: string,
  callback: (docData: MbgBahanDocumentation | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, BAHAN_DOCS_COLLECTION),
    where('batchId', '==', batchId)
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const docs = [...snap.docs].sort((a, b) => {
        const aTime = String(a.data().updatedAt || a.data().createdAt || '');
        const bTime = String(b.data().updatedAt || b.data().createdAt || '');
        return bTime.localeCompare(aTime);
      });
      callback({ id: docs[0].id, ...docs[0].data() } as MbgBahanDocumentation);
    }
  }, onError);
}

export function subscribeAllBahanDocumentation(
  callback: (list: MbgBahanDocumentation[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = collection(db, BAHAN_DOCS_COLLECTION);
  return onSnapshot(q, (snap) => {
    const list: MbgBahanDocumentation[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as MbgBahanDocumentation);
    });
    list.sort((a, b) => {
      const dateA = a.tanggal || a.createdAt || '';
      const dateB = b.tanggal || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
    callback(list);
  }, onError);
}

/**
 * Save or update Bahan Documentation.
 * Always resolves to a single unique document per batch to eliminate duplicate entries.
 */
export async function saveBahanDocumentation(
  docData: Omit<MbgBahanDocumentation, 'id'>,
  existingId?: string | null
): Promise<string> {
  const cleaned = cleanUndefinedDeep(docData);
  const now = new Date().toISOString();

  const existingQuery = query(
    collection(db, BAHAN_DOCS_COLLECTION),
    where('batchId', '==', docData.batchId)
  );
  const snap = await getDocs(existingQuery);

  if (snap.empty) {
    if (existingId) {
      await updateDoc(doc(db, BAHAN_DOCS_COLLECTION, existingId), {
        ...cleaned,
        updatedAt: now,
      });
      return existingId;
    }
    const ref = await addDoc(collection(db, BAHAN_DOCS_COLLECTION), {
      ...cleaned,
      createdAt: now,
      updatedAt: now,
    });
    return ref.id;
  }

  // If one or more existing documents are found for this batch, update primary and purge duplicates
  const docs = [...snap.docs].sort((a, b) => {
    const aTime = String(a.data().updatedAt || a.data().createdAt || '');
    const bTime = String(b.data().updatedAt || b.data().createdAt || '');
    return bTime.localeCompare(aTime);
  });

  const primary = existingId
    ? docs.find((d) => d.id === existingId) || docs[0]
    : docs[0];

  const duplicates = docs.filter((d) => d.id !== primary.id);
  if (duplicates.length > 0) {
    await archiveSnapshotsAndDelete(duplicates, 'Arsip dokumentasi bahan duplikat dibersihkan');
  }

  const batch = writeBatch(db);
  batch.update(primary.ref, {
    ...cleaned,
    updatedAt: now,
  });
  await batch.commit();

  return primary.id;
}

export async function deleteBahanDocumentation(id: string): Promise<void> {
  await archiveAndDelete(doc(db, BAHAN_DOCS_COLLECTION, id), 'Arsip dokumentasi bahan dihapus');
}

// ============================================================================
// 2. FORMULIR CEK LIST BAHAN MAKANAN (STANDAR BADAN GIZI NASIONAL)
// ============================================================================

export function subscribeBahanChecklist(
  batchId: string,
  callback: (form: MbgBahanChecklistForm | null) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(
    collection(db, BAHAN_CHECKLIST_COLLECTION),
    where('batchId', '==', batchId)
  );

  return onSnapshot(q, (snap) => {
    if (snap.empty) {
      callback(null);
    } else {
      const docs = [...snap.docs].sort((a, b) => {
        const aTime = String(a.data().updatedAt || a.data().createdAt || '');
        const bTime = String(b.data().updatedAt || b.data().createdAt || '');
        return bTime.localeCompare(aTime);
      });
      callback({ id: docs[0].id, ...docs[0].data() } as MbgBahanChecklistForm);
    }
  }, onError);
}

export function subscribeAllBahanChecklist(
  callback: (list: MbgBahanChecklistForm[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = collection(db, BAHAN_CHECKLIST_COLLECTION);
  return onSnapshot(q, (snap) => {
    const list: MbgBahanChecklistForm[] = [];
    snap.forEach((d) => {
      list.push({ id: d.id, ...d.data() } as MbgBahanChecklistForm);
    });
    list.sort((a, b) => {
      const dateA = a.tanggal || a.createdAt || '';
      const dateB = b.tanggal || b.createdAt || '';
      return dateB.localeCompare(dateA);
    });
    callback(list);
  }, onError);
}

/**
 * Save or update Bahan Checklist Form (Badan Gizi Nasional Standard).
 * Also synchronizes the inspection form back to mbg_daily_reports if present.
 */
export async function saveBahanChecklist(
  formData: Omit<MbgBahanChecklistForm, 'id'>,
  existingId?: string | null
): Promise<string> {
  const cleaned = cleanUndefinedDeep(formData);
  const now = new Date().toISOString();

  const existingQuery = query(
    collection(db, BAHAN_CHECKLIST_COLLECTION),
    where('batchId', '==', formData.batchId)
  );
  const snap = await getDocs(existingQuery);

  let formId = existingId || '';

  if (snap.empty) {
    if (existingId) {
      await updateDoc(doc(db, BAHAN_CHECKLIST_COLLECTION, existingId), {
        ...cleaned,
        updatedAt: now,
      });
      formId = existingId;
    } else {
      const ref = await addDoc(collection(db, BAHAN_CHECKLIST_COLLECTION), {
        ...cleaned,
        createdAt: now,
        updatedAt: now,
      });
      formId = ref.id;
    }
  } else {
    const docs = [...snap.docs].sort((a, b) => {
      const aTime = String(a.data().updatedAt || a.data().createdAt || '');
      const bTime = String(b.data().updatedAt || b.data().createdAt || '');
      return bTime.localeCompare(aTime);
    });

    const primary = existingId
      ? docs.find((d) => d.id === existingId) || docs[0]
      : docs[0];

    const duplicates = docs.filter((d) => d.id !== primary.id);
    if (duplicates.length > 0) {
      await archiveSnapshotsAndDelete(duplicates, 'Form cek list bahan duplikat dibersihkan');
    }

    await updateDoc(primary.ref, {
      ...cleaned,
      updatedAt: now,
    });
    formId = primary.id;
  }

  // Bidirectional synchronization: update mbg_daily_reports if it exists for this batch
  try {
    const dailySnap = await getDocs(query(
      collection(db, DAILY_REPORTS_COLLECTION),
      where('batchId', '==', formData.batchId)
    ));
    if (!dailySnap.empty) {
      const dailyDoc = dailySnap.docs[0];
      await updateDoc(dailyDoc.ref, {
        inspectionForm: {
          dari: formData.dari,
          kepada: formData.kepada,
          waktu: formData.waktu,
          noForm: formData.noForm,
          rows: formData.rows,
          officerName: formData.officerName,
          officerTitle: formData.officerTitle,
        },
        updatedAt: now,
      });
    }
  } catch (err) {
    console.warn('[mbgBahanService] Sync to dailyReport inspectionForm warning:', err);
  }

  return formId;
}

export async function deleteBahanChecklist(id: string): Promise<void> {
  await archiveAndDelete(doc(db, BAHAN_CHECKLIST_COLLECTION, id), 'Form cek list bahan dihapus');
}

/**
 * Helper to extract ingredients list from a Daily Report or Batch data
 */
export function extractIngredientsFromDailyReport(
  report?: MbgProductionDailyReport | null
): MbgInspectionFormRow[] {
  if (!report) return [];

  // 1. If inspectionForm rows already populated
  if (report.inspectionForm?.rows && report.inspectionForm.rows.length > 0) {
    return report.inspectionForm.rows.map((r) => ({
      jenisBahan: r.jenisBahan || '',
      banyaknya: Number(r.banyaknya) || 0,
      satuan: r.satuan || 'kg',
      isSesuai: r.isSesuai ?? null,
      isBaik: r.isBaik ?? null,
      notes: r.notes || '',
    }));
  }

  // 2. Fallback from realisasiPembelianRows
  if (report.realisasiPembelianRows && report.realisasiPembelianRows.length > 0) {
    return report.realisasiPembelianRows.map((rp) => ({
      jenisBahan: rp.namaBahan || '',
      banyaknya: Number(rp.kuantitas) || 0,
      satuan: rp.satuan || 'kg',
      isSesuai: null,
      isBaik: null,
      notes: '',
    }));
  }

  // 3. Fallback from poRows
  if (report.poRows && report.poRows.length > 0) {
    return report.poRows.map((po) => ({
      jenisBahan: po.item || '',
      banyaknya: Number(po.jumlah) || 0,
      satuan: po.satuan || 'kg',
      isSesuai: null,
      isBaik: null,
      notes: po.keterangan || '',
    }));
  }

  return [];
}
