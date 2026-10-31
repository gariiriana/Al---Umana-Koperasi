// ============================================================================
// MBG Bahan Service — Dokumentasi Foto Bahan & Formulir Cek List Bahan Makanan
// Provides Firestore CRUD, de-duplication, and real-time synchronization
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  getDoc,
  updateDoc,
  query,
  where,
  getDocs,
  writeBatch,
  type Unsubscribe,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { subscriptionManager } from './subscriptionManager';
import { archiveAndDelete, archiveSnapshotsAndDelete, stageArchiveAndDelete } from '@/services/developerRecycleBinService';
import type {
  MbgBahanDocumentation,
  MbgBahanPhotoItem,
  MbgBahanChecklistForm,
  MbgInspectionFormRow,
  MbgProductionDailyReport,
  MbgPortionDailyData,
} from '@/types/mbg';

export const BAHAN_DOCS_COLLECTION = 'mbg_bahan_documentation';
export const BAHAN_PHOTOS_COLLECTION = 'mbg_bahan_photos';
export const BAHAN_CHECKLIST_COLLECTION = 'mbg_inspection_forms';
const DAILY_REPORTS_COLLECTION = 'mbg_daily_reports';

// Firestore menolak dokumen > 1 MiB. Satu foto disimpan per dokumen, jadi
// batas ini hanya berlaku untuk satu foto, bukan untuk seluruh batch.
const MAX_PHOTO_CHARS = 900_000;

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

  return subscriptionManager.subscribe(q, (snap) => {
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
  const q = query(collection(db, BAHAN_DOCS_COLLECTION));
  return subscriptionManager.subscribe(q, (snap) => {
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

/** ID dokumen foto: satu per bahan per batch, aman dipakai sebagai ID Firestore. */
export function bahanPhotoDocId(batchId: string, itemId: string): string {
  return `${batchId}_${itemId.replace(/[^A-Za-z0-9_-]/g, '-')}`;
}

/** Peta ID dokumen foto → dataUrl untuk satu batch. */
export type BahanPhotoMap = Record<string, string>;

export function subscribeBahanPhotos(
  batchId: string,
  callback: (photos: BahanPhotoMap) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  const q = query(collection(db, BAHAN_PHOTOS_COLLECTION), where('batchId', '==', batchId));
  return subscriptionManager.subscribe(q, (snap) => {
    const photos: BahanPhotoMap = {};
    snap.forEach((d) => {
      photos[d.id] = String(d.data().photoUrl || '');
    });
    callback(photos);
  }, onError);
}

/** Pasang foto dari koleksi mbg_bahan_photos ke item; foto inline arsip lama tetap dipakai. */
export function attachBahanPhotos(items: MbgBahanPhotoItem[], photos: BahanPhotoMap): MbgBahanPhotoItem[] {
  return items.map((item) => {
    const photoUrl = item.photoId ? photos[item.photoId] : undefined;
    return photoUrl ? { ...item, photoUrl } : item;
  });
}

/** Muat foto sebuah arsip agar bisa diekspor ke PDF/Word. */
export async function withBahanPhotos<T extends Pick<MbgBahanDocumentation, 'batchId' | 'items'>>(docData: T): Promise<T> {
  if (!(docData.items || []).some((i) => i.photoId)) return docData;
  const snap = await getDocs(query(collection(db, BAHAN_PHOTOS_COLLECTION), where('batchId', '==', docData.batchId)));
  const photos: BahanPhotoMap = {};
  snap.forEach((d) => {
    photos[d.id] = String(d.data().photoUrl || '');
  });
  return { ...docData, items: attachBahanPhotos(docData.items || [], photos) };
}

/** Kegagalan simpan yang terdeteksi sebelum data dikirim ke server. */
export class BahanSaveError extends Error {}

/** Pesan yang bisa dipahami petugas untuk kegagalan simpan dokumentasi bahan. */
export function describeBahanSaveError(err: unknown): string {
  if (err instanceof BahanSaveError) return err.message;
  const code = (err as { code?: string } | null)?.code || '';
  const message = (err as { message?: string } | null)?.message || '';
  if (code === 'permission-denied') {
    return 'Akun ini tidak punya izin menyimpan dokumentasi bahan. Hubungi admin.';
  }
  if (code === 'unauthenticated') {
    return 'Sesi login sudah berakhir. Silakan logout lalu login ulang.';
  }
  if (code === 'resource-exhausted') {
    return 'Kuota harian database sedang habis. Coba simpan lagi setelah pukul 14.00 WIB.';
  }
  if (code === 'unavailable' || code === 'deadline-exceeded') {
    return 'Koneksi internet terputus. Periksa sinyal lalu klik Simpan lagi.';
  }
  if (code === 'invalid-argument' || /maximum (allowed )?size|exceeds|too large/i.test(message)) {
    return 'Data foto terlalu besar untuk disimpan. Ambil ulang foto bahan terakhir lalu simpan lagi.';
  }
  return `Gagal menyimpan dokumentasi bahan (${code || message || 'kesalahan tidak dikenal'}).`;
}

/**
 * Save or update Bahan Documentation.
 * Always resolves to a single unique document per batch to eliminate duplicate entries.
 * Foto disimpan satu per dokumen di mbg_bahan_photos (bersamaan, dalam satu batch tulis),
 * sehingga dokumen arsip tetap kecil berapa pun jumlah bahannya.
 */
export async function saveBahanDocumentation(
  docData: Omit<MbgBahanDocumentation, 'id'>,
  existingId?: string | null
): Promise<string> {
  const now = new Date().toISOString();
  const { batchId } = docData;

  const tooLarge = (docData.items || []).find((i) => (i.photoUrl?.length || 0) > MAX_PHOTO_CHARS);
  if (tooLarge) {
    throw new BahanSaveError(`Foto "${tooLarge.namaBahan || 'bahan'}" terlalu besar. Ambil ulang foto tersebut lalu simpan lagi.`);
  }

  const [snap, photoSnap] = await Promise.all([
    getDocs(query(collection(db, BAHAN_DOCS_COLLECTION), where('batchId', '==', batchId))),
    getDocs(query(collection(db, BAHAN_PHOTOS_COLLECTION), where('batchId', '==', batchId))),
  ]);
  const storedPhotos = new Map(photoSnap.docs.map((d) => [d.id, String(d.data().photoUrl || '')]));

  const batch = writeBatch(db);
  const keptPhotoIds = new Set<string>();
  const items = (docData.items || []).map((original, idx) => {
    const { photoUrl } = original;
    const item = { ...original };
    delete item.photoUrl;
    delete item.photoId;
    if (!photoUrl) return item;
    let photoId = bahanPhotoDocId(batchId, item.id);
    if (keptPhotoIds.has(photoId)) photoId = bahanPhotoDocId(batchId, `${item.id}-${idx}`);
    keptPhotoIds.add(photoId);
    if (storedPhotos.get(photoId) !== photoUrl) {
      batch.set(doc(db, BAHAN_PHOTOS_COLLECTION, photoId), {
        batchId,
        itemId: item.id,
        photoUrl,
        updatedAt: now,
        createdBy: docData.createdBy,
      });
    }
    return { ...item, photoId };
  });
  for (const photoId of storedPhotos.keys()) {
    if (!keptPhotoIds.has(photoId)) batch.delete(doc(db, BAHAN_PHOTOS_COLLECTION, photoId));
  }

  const cleaned = cleanUndefinedDeep({ ...docData, items });

  let primaryId: string;
  if (snap.empty) {
    if (existingId) {
      batch.update(doc(db, BAHAN_DOCS_COLLECTION, existingId), { ...cleaned, updatedAt: now });
      primaryId = existingId;
    } else {
      const ref = doc(collection(db, BAHAN_DOCS_COLLECTION));
      batch.set(ref, { ...cleaned, createdAt: now, updatedAt: now });
      primaryId = ref.id;
    }
  } else {
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

    batch.update(primary.ref, { ...cleaned, updatedAt: now });
    primaryId = primary.id;
  }

  await batch.commit();
  return primaryId;
}

/** Hapus arsip beserta fotonya (keduanya masuk recycle bin Developer). */
export async function deleteBahanDocumentation(id: string): Promise<void> {
  const source = await getDoc(doc(db, BAHAN_DOCS_COLLECTION, id));
  if (!source.exists()) return;
  const batchId = String(source.data().batchId || '');
  const [siblings, photoSnap] = batchId
    ? await Promise.all([
        getDocs(query(collection(db, BAHAN_DOCS_COLLECTION), where('batchId', '==', batchId))),
        getDocs(query(collection(db, BAHAN_PHOTOS_COLLECTION), where('batchId', '==', batchId))),
      ])
    : [null, null];
  // Foto dipakai bersama per batch; biarkan bila masih ada arsip lain untuk batch ini.
  const photosStillUsed = siblings?.docs.some((d) => d.id !== id) ?? false;
  const photos = photosStillUsed || !photoSnap ? [] : photoSnap.docs;
  if (photos.length === 0) {
    await archiveAndDelete(source.ref, 'Arsip dokumentasi bahan dihapus');
    return;
  }
  const batch = writeBatch(db);
  await stageArchiveAndDelete(batch, [source, ...photos], 'Arsip dokumentasi bahan dihapus');
  await batch.commit();
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

  return subscriptionManager.subscribe(q, (snap) => {
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
  const q = query(collection(db, BAHAN_CHECKLIST_COLLECTION));
  return subscriptionManager.subscribe(q, (snap) => {
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

  // A sync failure must reach the caller so the UI never claims synchronization succeeded.
  const dailySnap = await getDocs(query(
    collection(db, DAILY_REPORTS_COLLECTION),
    where('batchId', '==', formData.batchId)
  ));
  if (!dailySnap.empty) {
    const dailyDoc = dailySnap.docs[0];
    await updateDoc(dailyDoc.ref, {
      inspectionForm: {
        dari: formData.dari, kepada: formData.kepada, waktu: formData.waktu,
        noForm: formData.noForm, rows: formData.rows,
        officerName: formData.officerName, officerTitle: formData.officerTitle,
      },
      updatedAt: now,
    });
  }

  return formId;
}

export async function deleteBahanChecklist(id: string): Promise<void> {
  await archiveAndDelete(doc(db, BAHAN_CHECKLIST_COLLECTION, id), 'Form cek list bahan dihapus');
}

/**
 * Daftar bahan untuk Cek List Bahan & Dokumentasi Bahan dari laporan Produksi MBG.
 * Sumber utama: Daftar Pesanan Bahan (poRows hasil Import Daftar Pesanan Bahan),
 * karena yang dicek adalah barang yang dibeli/datang. Bila belum di-import,
 * gunakan rincian bahan per porsi dari import laporan harian produksi.
 * Nilai diambil apa adanya; kolom kosong tetap kosong.
 */
export function extractIngredientsFromDailyReport(
  report?: MbgProductionDailyReport | null
): MbgInspectionFormRow[] {
  if (!report) return [];

  // 1. Daftar Pesanan Bahan (Tab 5: poRows)
  const poRows = (report.poRows || []).filter((po) => po.item && po.item.trim());
  if (poRows.length > 0) {
    return poRows.map((po) => ({
      jenisBahan: po.item.trim(),
      banyaknya: Number(po.jumlah) || 0,
      satuan: po.satuan || '',
      isSesuai: null,
      isBaik: null,
      notes: po.keterangan || '',
    }));
  }

  // 2. Cadangan: rincian bahan per porsi dari import laporan harian produksi
  const rows: MbgInspectionFormRow[] = [];
  const portionConfigs: Array<{
    name: string;
    portionData?: MbgPortionDailyData;
  }> = [
    { name: 'Porsi Kecil', portionData: report.porsiKecil },
    { name: 'Porsi Besar', portionData: report.porsiBesar },
    { name: 'Porsi Balita', portionData: report.porsiBalita },
    { name: 'Porsi Bumil/Busui', portionData: report.porsiBumilBusui },
  ];

  for (const { name, portionData } of portionConfigs) {
    if (portionData && portionData.bahanItems && portionData.bahanItems.length > 0) {
      for (const item of portionData.bahanItems) {
        if (!item.rincianBahan || !item.rincianBahan.trim()) continue;
        rows.push({
          jenisBahan: item.rincianBahan.trim(),
          banyaknya: Number(item.kebutuhan) || 0,
          satuan: item.satuan || '',
          isSesuai: null,
          isBaik: null,
          notes: name,
        });
      }
    }
  }

  return rows;
}
