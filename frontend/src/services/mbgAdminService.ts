// ============================================================================
// MBG Admin Service — CRUD for PM Data (Batches & Entries)
// ============================================================================

import {
  collection,
  doc,
  addDoc,
  updateDoc,
  query,
  where,
  onSnapshot,
  writeBatch,
  runTransaction,
  getDoc,
  getDocs,
  deleteField,
  deleteDoc,
  type Unsubscribe,
} from 'firebase/firestore';
import { setDoc } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { subscriptionManager } from './subscriptionManager';
import { notifyMbgBatchStatus, notifyMbgCooking } from './flowNotifications';
import type { MbgPmBatch, MbgPmEntry, MbgBatchStatus, MbgDayMenu, MbgProductionCookingStatus } from '@/types/mbg';
import { MBG_MASTER_INSTITUTIONS, DEFAULT_WEEKLY_SCHEDULE } from '@/constants/mbgConstants';
import { archiveAndDelete, archiveSnapshotsAndDelete, stageArchiveAndDelete } from '@/services/developerRecycleBinService';

const BATCHES_COLLECTION = 'mbg_pm_batches';
const ENTRIES_COLLECTION = 'mbg_pm_entries';
/** One document per date pointing at that date's active batch; serializes batch creation. */
const BATCH_DATE_LOCKS_COLLECTION = 'mbg_pm_batch_date_locks';

export function parseCategoryItems(input?: string | string[]): string[] {
  if (Array.isArray(input)) {
    return input.map((s) => s.trim()).filter(Boolean);
  }
  if (typeof input === 'string') {
    return input.split(',').map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

export function getMenuForDate(dateStr: string, scheduleDays?: MbgDayMenu[]) {
  const days = (Array.isArray(scheduleDays) && scheduleDays.length > 0)
    ? scheduleDays
    : DEFAULT_WEEKLY_SCHEDULE;
  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      dayOfWeek = dateObj.getDay();
    }
  }

  const found = days?.find((d) => d.dayOfWeek === dayOfWeek) || days?.[0] || DEFAULT_WEEKLY_SCHEDULE[0];

  const hewaniList = parseCategoryItems(found?.hewaniItems || found?.hewani);
  const sayurList = parseCategoryItems(found?.sayurItems || found?.sayur);
  const buahList = parseCategoryItems(found?.buahItems || found?.buah);
  const nabatiList = parseCategoryItems(found?.nabatiItems || found?.nabati);
  const karboList = parseCategoryItems(found?.karbohidratItems || found?.karbohidrat);
  const keringanList = parseCategoryItems(found?.menuKeringanItems || found?.menuKeringan);

  const menuItems = [...hewaniList, ...sayurList, ...buahList, ...nabatiList, ...karboList];
  const menuKeringanItems = keringanList.length > 0 ? keringanList : (found?.menuKeringan ? [found.menuKeringan] : []);

  return { dayMenu: found || DEFAULT_WEEKLY_SCHEDULE[0], menuItems, menuKeringanItems };
}

export type MbgPortionClassification =
  | 'porsi_besar'
  | 'porsi_kecil'
  | 'bumil_busui'
  | 'balita'
  | 'alergi';

export function getScheduleDocRef(portion: MbgPortionClassification = 'porsi_besar') {
  return doc(db, 'mbg_weekly_schedules', portion);
}

export function subscribeWeeklySchedule(
  callback: (days: MbgDayMenu[]) => void,
  portion: MbgPortionClassification = 'porsi_besar',
  onError?: (error: Error) => void
): Unsubscribe {
  const docRef = getScheduleDocRef(portion);
  return onSnapshot(
    docRef,
    (snapshot) => {
      if (snapshot.exists() && snapshot.data().days) {
        callback(snapshot.data().days as MbgDayMenu[]);
      } else {
        setDoc(docRef, {
          id: portion,
          portionClassification: portion,
          title: `Master Jadwal Menu Mingguan MBG (${portion})`,
          days: DEFAULT_WEEKLY_SCHEDULE,
          updatedAt: new Date().toISOString(),
          updatedBy: 'system',
        }).catch(console.error);
        callback(DEFAULT_WEEKLY_SCHEDULE as MbgDayMenu[]);
      }
    },
    (error) => onError?.(error)
  );
}

export async function saveWeeklySchedule(
  days: MbgDayMenu[],
  updatedBy: string,
  portion: MbgPortionClassification = 'porsi_besar'
): Promise<void> {
  const docRef = getScheduleDocRef(portion);
  await setDoc(
    docRef,
    {
      id: portion,
      portionClassification: portion,
      title: `Master Jadwal Menu Mingguan MBG (${portion})`,
      days,
      updatedAt: new Date().toISOString(),
      updatedBy,
    },
    { merge: true }
  );
}

// ---- Batch Operations ----

export function subscribeBatches(
  callback: (batches: MbgPmBatch[]) => void,
  onError?: (error: Error) => void,
  includeBackup = false
): Unsubscribe {
  const q = query(collection(db, BATCHES_COLLECTION));
  return subscriptionManager.subscribe(
    q,
    (snapshot) => {
      const batches = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmBatch[];
      const filtered = includeBackup ? batches : batches.filter((b) => !b.isBackup);
      filtered.sort((a, b) => (b.tanggal || '').localeCompare(a.tanggal || ''));
      callback(filtered);
    },
    (error) => {
      console.error("subscribeBatches error:", error);
      onError?.(error);
    }
  );
}

async function findActiveBatchIdByDate(tanggal: string, excludeBatchId?: string): Promise<string | null> {
  const snap = await getDocs(query(collection(db, BATCHES_COLLECTION), where('tanggal', '==', tanggal)));
  const active = snap.docs.find((d) => d.id !== excludeBatchId && !(d.data() as MbgPmBatch).isBackup);
  return active ? active.id : null;
}

// Creations in flight in this tab, keyed by date. The Admin page re-subscribes
// (and re-runs its auto-create) several times while loading; those calls must
// share one creation instead of each adding a batch.
const pendingBatchCreations = new Map<string, Promise<string>>();

/**
 * Returns the active batch for `tanggal`, creating it if none exists. There is
 * at most one active (non-backup) batch per date, also across users and tabs.
 */
export function createBatch(
  tanggal: string,
  createdBy: string,
  autoPopulate = false,
  scheduleDays?: MbgDayMenu[]
): Promise<string> {
  const pending = pendingBatchCreations.get(tanggal);
  if (pending) return pending;
  const creation = createBatchOnce(tanggal, createdBy, autoPopulate, scheduleDays).finally(() => {
    pendingBatchCreations.delete(tanggal);
  });
  pendingBatchCreations.set(tanggal, creation);
  return creation;
}

async function createBatchOnce(
  tanggal: string,
  createdBy: string,
  autoPopulate: boolean,
  scheduleDays?: MbgDayMenu[]
): Promise<string> {
  const existingId = await findActiveBatchIdByDate(tanggal);
  if (existingId) return existingId;

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

  // Another user/tab may be creating the same date right now. Both sides go
  // through the date's lock document in a transaction, so the loser re-reads
  // the lock and gets the winner's batch instead of adding a second one.
  const lockRef = doc(db, BATCH_DATE_LOCKS_COLLECTION, tanggal.replace(/\//g, '-'));
  const { batchId, created } = await runTransaction(db, async (tx) => {
    const lock = await tx.get(lockRef);
    const lockedBatchId = lock.exists() ? (lock.data().batchId as string | undefined) : undefined;
    if (lockedBatchId) {
      const locked = await tx.get(doc(db, BATCHES_COLLECTION, lockedBatchId));
      if (locked.exists() && !(locked.data() as MbgPmBatch).isBackup) {
        return { batchId: lockedBatchId, created: false };
      }
    }
    const newRef = doc(collection(db, BATCHES_COLLECTION));
    tx.set(newRef, batch);
    tx.set(lockRef, { tanggal, batchId: newRef.id, updatedAt: batch.createdAt });
    return { batchId: newRef.id, created: true };
  });

  if (created && autoPopulate) {
    await bulkAddEntriesFromMaster(batchId, createdBy, tanggal, scheduleDays);
    await recalculateBatchTotals(batchId);
  }

  return batchId;
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
  notifyMbgBatchStatus(batchId, status);
}

/** Confirm cooking in a transaction so stale tabs cannot move a batch backwards. */
export async function updateBatchCookingStatus(batchId: string, status: MbgProductionCookingStatus): Promise<void> {
  const actorId = auth.currentUser?.uid;
  if (!actorId) throw new Error('Silakan masuk kembali sebelum memperbarui status masak.');
  const cookingUpdates = {
    productionCookingStatus: status,
    productionCookingUpdatedBy: actorId,
    productionCookingUpdatedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  // Pure direct write: INSTANT (< 100ms), 0 reads, no 429 quota delays
  const ref = doc(db, BATCHES_COLLECTION, batchId);
  await updateDoc(ref, cookingUpdates);
  notifyMbgCooking(batchId, status);
}

export async function deleteBatch(batchId: string): Promise<void> {
  // Archive first. The archive write and source removal are one atomic commit.
  await archiveAndDelete(doc(db, BATCHES_COLLECTION, batchId), 'Batch MBG dihapus beserta data terkait');

  // 2. Clean up all associated collections (entries, reports, cooking sessions, delivery tasks, etc.) concurrently
  const collectionsWithBatchId = [
    ENTRIES_COLLECTION,
    'mbg_daily_reports',
    'mbg_cooking_sessions',
    'mbg_delivery_tasks',
    'mbg_qc_checks',
    'mbg_purchase_orders',
    'mbg_delivery_documents',
    'mbg_recipe_adjustments',
  ];

  await Promise.allSettled(
    collectionsWithBatchId.map(async (col) => {
      try {
        const q = query(
          collection(db, col),
          where('batchId', '==', batchId)
        );
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          await archiveSnapshotsAndDelete(snapshot.docs, `Data terkait batch ${batchId} dihapus`);
        }
      } catch (e) {
        console.warn(`Could not clear related batch items in ${col}:`, e);
      }
    })
  );
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
  return subscriptionManager.subscribe(
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

export async function getBatchEntries(batchId: string): Promise<MbgPmEntry[]> {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  const snap = await getDocs(q);
  const entries = snap.docs.map((d) => ({
    id: d.id,
    ...d.data(),
  })) as MbgPmEntry[];
  entries.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  return entries;
}

export function subscribeAllEntries(
  callback: (entries: MbgPmEntry[]) => void,
  onError?: (error: Error) => void,
  includeBackup = false
): Unsubscribe {
  const q = query(collection(db, ENTRIES_COLLECTION));
  return subscriptionManager.subscribe(
    q,
    (snapshot) => {
      const entries = snapshot.docs.map((d) => ({
        id: d.id,
        ...d.data(),
      })) as MbgPmEntry[];
      const filtered = includeBackup ? entries : entries.filter((e) => !e.isBackup);
      filtered.sort((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
      callback(filtered);
    },
    (error) => onError?.(error)
  );
}

function cleanUndefined<T>(obj: T): T {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) {
    return obj.map(cleanUndefined) as unknown as T;
  }
  if (typeof obj === 'object') {
    const newObj: Record<string, unknown> = {};
    for (const key of Object.keys(obj)) {
      const val = (obj as Record<string, unknown>)[key];
      if (val !== undefined) {
        newObj[key] = cleanUndefined(val);
      }
    }
    return newObj as unknown as T;
  }
  return obj;
}

export async function addEntry(
  entry: Omit<MbgPmEntry, 'id'>
): Promise<string> {
  const docRef = await addDoc(collection(db, ENTRIES_COLLECTION), cleanUndefined({
    ...entry,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }));
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
      scrubbed[key] = cleanUndefined(val);
    }
  }

  await updateDoc(ref, {
    ...scrubbed,
    updatedAt: new Date().toISOString(),
  });
}

export async function deleteEntry(entryId: string): Promise<void> {
  await archiveAndDelete(doc(db, ENTRIES_COLLECTION, entryId), 'Entri PM MBG dihapus');
}

// ---- Bulk Operations ----

export async function addMultipleEntries(
  entries: Omit<MbgPmEntry, 'id'>[]
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();
  entries.forEach((entry) => {
    const ref = doc(collection(db, ENTRIES_COLLECTION));
    batch.set(ref, cleanUndefined({
      ...entry,
      createdAt: now,
      updatedAt: now,
    }));
  });
  await batch.commit();
}

export async function clearBatchEntries(batchId: string): Promise<void> {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return;
  await archiveSnapshotsAndDelete(snapshot.docs, `Entri batch ${batchId} dikosongkan`);
}

/**
 * Replaces all PM entries for a batch in one Firestore commit. Importing is
 * therefore all-or-nothing: a failed write cannot leave the batch empty or
 * mixed with records from an older workbook. An import is always a draft;
 * only the explicit Admin MBG submit action may advance it to PM_SUBMITTED.
 */
export async function replaceBatchEntries(
  batchId: string,
  entries: Omit<MbgPmEntry, 'id'>[],
  options: { preserveBatchStatus?: boolean } = {}
): Promise<void> {
  const existingSnapshot = await getDocs(query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  ));

  // Firestore allows at most 500 writes in a batch: each old row costs an
  // archive write plus a delete, each new row one write, plus the batch doc.
  // Refuse before changing anything instead of performing a partial replacement.
  const writeCount = existingSnapshot.size * 2 + entries.length + 1;
  if (writeCount > 500) {
    throw new Error(`Import terlalu besar (${entries.length} baris baru, ${existingSnapshot.size} baris lama). Maksimal 500 perubahan per batch.`);
  }

  const now = new Date().toISOString();
  const writes = writeBatch(db);

  // Archiving the old rows and writing the new ones share one commit, so a
  // failure leaves the old rows untouched instead of an empty batch.
  await stageArchiveAndDelete(writes, existingSnapshot.docs, `Entri batch ${batchId} diganti dari impor`);

  let totalSiswaBalita = 0;
  let totalBumilBusui = 0;
  let totalGuruKader = 0;
  let totalPobiaNasi = 0;
  let totalJumlah = 0;
  const petugasSet = new Set<string>();

  entries.forEach((entry) => {
    writes.set(doc(collection(db, ENTRIES_COLLECTION)), cleanUndefined({
      ...entry,
      batchId,
      createdAt: now,
      updatedAt: now,
    }));

    if (!entry.isSekolahLibur) {
      totalSiswaBalita += entry.qtSiswaBalita || 0;
      totalBumilBusui += entry.qtBumilBusui || 0;
      totalGuruKader += entry.qtGuruKader || 0;
      totalPobiaNasi += entry.qtPobiaNasi || 0;
      totalJumlah += entry.jumlah || 0;
    }
    if (entry.assignedPetugasName) petugasSet.add(entry.assignedPetugasName);
  });

  writes.update(doc(db, BATCHES_COLLECTION, batchId), {
    totalSiswaBalita,
    totalBumilBusui,
    totalGuruKader,
    totalPobiaNasi,
    totalJumlah,
    totalInstitusi: entries.length,
    petugasList: Array.from(petugasSet),
    // Admin imports are review-only and reopen the batch as DRAFT. Production
    // imports may enrich an already-submitted batch, so must retain its state.
    ...(options.preserveBatchStatus ? {} : { status: 'DRAFT' as MbgBatchStatus }),
    updatedAt: now,
  });
  await writes.commit();
}

export async function cleanDuplicateBatchEntries(batchId: string): Promise<number> {
  const q = query(
    collection(db, ENTRIES_COLLECTION),
    where('batchId', '==', batchId)
  );
  const snapshot = await getDocs(q);
  if (snapshot.empty) return 0;

  const seen = new Set<string>();
  const toDeleteDocs: typeof snapshot.docs = [];

  snapshot.docs.forEach((d) => {
    const data = d.data() as MbgPmEntry;
    const key = (data.institutionName || '').toLowerCase().trim();
    if (seen.has(key)) {
      toDeleteDocs.push(d);
    } else {
      seen.add(key);
    }
  });

  if (toDeleteDocs.length > 0) {
    try {
      await archiveSnapshotsAndDelete(toDeleteDocs, 'Entri duplikat MBG dibersihkan');
    } catch (archiveErr) {
      console.warn('[cleanDuplicateBatchEntries] Archive failed, performing direct delete:', archiveErr);
      for (const d of toDeleteDocs) {
        await deleteDoc(d.ref);
      }
    }
    await recalculateBatchTotals(batchId);
  }

  return toDeleteDocs.length;
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
    totalInstitusi: entries.length,
    petugasList: Array.from(petugasSet),
  });
}

/**
 * Pindahkan batch dan seluruh data PM di dalamnya ke Arsip Backup.
 * Data di arsip backup akan disembunyikan dari seluruh divisi operasional (Produksi, Distribusi, Kurir, Purchasing).
 */
export async function moveBatchToBackup(batchId: string, backedUpBy?: string): Promise<void> {
  const batchRef = doc(db, BATCHES_COLLECTION, batchId);
  const now = new Date().toISOString();
  await updateDoc(batchRef, {
    isBackup: true,
    backedUpAt: now,
    backedUpBy: backedUpBy || 'admin',
  });

  // Flag semua entry di dalam batch ini sebagai backup
  const q = query(collection(db, ENTRIES_COLLECTION), where('batchId', '==', batchId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const wb = writeBatch(db);
    snap.docs.forEach((d) => {
      wb.update(d.ref, { isBackup: true, backedUpAt: now });
    });
    await wb.commit();
  }
}

/**
 * Pulihkan batch dari Arsip Backup kembali ke Arsip Aktif utama.
 * Data PM akan kembali terlihat oleh divisi operasional terkait.
 */
export async function restoreBatchFromBackup(batchId: string): Promise<void> {
  const batchRef = doc(db, BATCHES_COLLECTION, batchId);
  const batchSnap = await getDoc(batchRef);
  if (!batchSnap.exists()) {
    throw new Error('Batch sudah tidak ada.');
  }
  const { tanggal } = batchSnap.data() as MbgPmBatch;

  // Satu tanggal hanya boleh punya satu batch aktif. Batch aktif yang masih
  // kosong (biasanya dibuat otomatis setelah batch ini dipindah ke backup)
  // digantikan; batch aktif yang sudah berisi data tidak disentuh.
  const activeId = await findActiveBatchIdByDate(tanggal, batchId);
  if (activeId) {
    const activeSnap = await getDoc(doc(db, BATCHES_COLLECTION, activeId));
    const activeEntries = await getBatchEntries(activeId);
    if ((activeSnap.data() as MbgPmBatch | undefined)?.status !== 'DRAFT' || activeEntries.length > 0) {
      throw new Error(`Tanggal ${tanggal} sudah punya batch aktif berisi data. Pindahkan batch tersebut ke Arsip Backup dulu sebelum memulihkan.`);
    }
    await deleteBatch(activeId);
  }

  await updateDoc(batchRef, {
    isBackup: false,
    restoredAt: new Date().toISOString(),
  });

  // Pulihkan semua entry di dalam batch ini
  const q = query(collection(db, ENTRIES_COLLECTION), where('batchId', '==', batchId));
  const snap = await getDocs(q);
  if (!snap.empty) {
    const wb = writeBatch(db);
    snap.docs.forEach((d) => {
      wb.update(d.ref, { isBackup: false });
    });
    await wb.commit();
  }
}

/**
 * Pindahkan beberapa batch sekaligus ke Arsip Backup.
 */
export async function moveMultipleBatchesToBackup(
  batchIds: string[],
  backedUpBy?: string
): Promise<void> {
  await Promise.all(batchIds.map((id) => moveBatchToBackup(id, backedUpBy)));
}

/**
 * Pulihkan beberapa batch sekaligus dari Arsip Backup. Dijalankan berurutan agar
 * dua batch backup bertanggal sama tidak sama-sama lolos menjadi batch aktif.
 * Mengembalikan batch yang gagal dipulihkan beserta alasannya.
 */
export async function restoreMultipleBatchesFromBackup(
  batchIds: string[]
): Promise<{ batchId: string; message: string }[]> {
  const failed: { batchId: string; message: string }[] = [];
  for (const batchId of batchIds) {
    try {
      await restoreBatchFromBackup(batchId);
    } catch (err) {
      failed.push({ batchId, message: err instanceof Error ? err.message : String(err) });
    }
  }
  return failed;
}

/**
 * Hapus beberapa batch sekaligus beserta seluruh data di dalamnya.
 */
export async function deleteMultipleBatches(
  batchIds: string[]
): Promise<void> {
  await Promise.all(batchIds.map((id) => deleteBatch(id)));
}

/**
 * Data PM yang boleh disalin dari sebuah batch: batch sumber harus aktif (bukan
 * Arsip Backup) dan entri yang ditandai backup dilewati. Melempar error bila kosong.
 */
export async function getCopyableEntries(sourceBatchId: string): Promise<MbgPmEntry[]> {
  const sourceBatch = await getDoc(doc(db, BATCHES_COLLECTION, sourceBatchId));
  if (!sourceBatch.exists() || (sourceBatch.data() as MbgPmBatch).isBackup) {
    throw new Error('Batch sumber sudah dihapus atau dipindah ke Arsip Backup. Pilih batch aktif lain.');
  }
  const entries = (await getBatchEntries(sourceBatchId)).filter((entry) => !entry.isBackup);
  if (entries.length === 0) {
    throw new Error('Batch sumber tidak memiliki data penerima manfaat (0 porsi). Silakan gunakan opsi "Isi Otomatis 27 Institusi Master" atau pilih batch lain.');
  }
  return entries;
}

/**
 * Copy entries from a previous batch (for "salin data kemarin" feature).
 */
export async function copyFromBatch(
  sourceBatchId: string,
  targetBatchId: string,
  createdBy: string,
  targetDate?: string,
  scheduleDays?: MbgDayMenu[]
): Promise<void> {
  const sourceEntries = await getCopyableEntries(sourceBatchId);
  // createBatch mengembalikan batch yang sudah ada bila tanggalnya sudah terisi;
  // menyalin ke batch berisi akan membuat data institusi dobel.
  if ((await getBatchEntries(targetBatchId)).length > 0) {
    throw new Error('Batch tujuan sudah berisi data PM. Penyalinan dibatalkan agar data tidak dobel.');
  }

  // Calculate new menu for targetDate if provided
  let newMenuItems: string[] | undefined;
  let newMenuKeringanItems: string[] | undefined;
  if (targetDate) {
    const res = getMenuForDate(targetDate, scheduleDays);
    newMenuItems = res.menuItems;
    newMenuKeringanItems = res.menuKeringanItems;
  }

  const now = new Date().toISOString();
  const batch = writeBatch(db);

  sourceEntries.forEach((data) => {
    const ref = doc(collection(db, ENTRIES_COLLECTION));
    // `id` milik dokumen sumber tidak ikut disimpan
    const { id: _sourceId, ...rest } = data;
    void _sourceId;
    batch.set(ref, cleanUndefined({
      ...rest,
      batchId: targetBatchId,
      menuItems: (newMenuItems && newMenuItems.length > 0) ? [...newMenuItems] : (data.menuItems || []),
      menuKeringanItems: (newMenuKeringanItems && newMenuKeringanItems.length > 0) ? [...newMenuKeringanItems] : (data.menuKeringanItems || []),
      isSekolahLibur: false,
      // Status arsip dan bukti pengiriman tanggal sumber tidak ikut ke batch baru
      isBackup: undefined,
      backedUpAt: undefined,
      photoMenuUrl: undefined,
      photoMenuDesc: undefined,
      photoSerahTerimaUrl: undefined,
      photoSerahTerimaDesc: undefined,
      photoPenerimaUrl: undefined,
      photoPenerimaDesc: undefined,
      photoSuratJalanUrl: undefined,
      photoSuratJalanDesc: undefined,
      photoMenuTimestamp: undefined,
      photoSerahTerimaTimestamp: undefined,
      photoPenerimaTimestamp: undefined,
      photoSerahTerimaLocation: undefined,
      photoPenerimaLocation: undefined,
      createdBy,
      createdAt: now,
      updatedAt: now,
    }));
  });

  await batch.commit();
  await recalculateBatchTotals(targetBatchId);
}

/**
 * Bulk add all 27 preset master institutions into a batch in 1 click.
 */
export async function bulkAddEntriesFromMaster(
  batchId: string,
  createdBy: string,
  dateStr?: string,
  scheduleDays?: MbgDayMenu[]
): Promise<void> {
  const batch = writeBatch(db);
  const now = new Date().toISOString();

  let menuItems: string[] = [];
  let menuKeringanItems: string[] = [];

  if (dateStr) {
    const res = getMenuForDate(dateStr, scheduleDays);
    menuItems = res.menuItems;
    menuKeringanItems = res.menuKeringanItems;
  }

  MBG_MASTER_INSTITUTIONS.forEach((item, idx) => {
    const ref = doc(collection(db, ENTRIES_COLLECTION));
    const jumlah = (item.qtSiswaBalita || 0) + (item.qtBumilBusui || 0) + (item.qtGuruKader || 0);
    const entryData: Omit<MbgPmEntry, 'id'> = {
      batchId,
      institutionName: item.institutionName,
      institutionType: item.institutionType,
      schoolLevel: item.schoolLevel,
      qtSiswaBalita: item.qtSiswaBalita,
      qtBumilBusui: item.qtBumilBusui,
      qtBumil: item.qtBumil || 0,
      qtBusui: item.qtBusui || 0,
      qtGuruKader: item.qtGuruKader,
      qtPobiaNasi: item.qtPobiaNasi || 0,
      qtAlergi: item.qtAlergi || 0,
      qtTidakAlergi: item.qtTidakAlergi ?? (jumlah - (item.qtAlergi || 0)),
      keteranganAlergi: item.keteranganAlergi || '',
      qtPorsiBalita: item.qtPorsiBalita || 0,
      qtPorsiKecil: item.qtPorsiKecil || 0,
      qtPorsiBesar: item.qtPorsiBesar || 0,
      qtPorsiBumilBusui: item.qtPorsiBumilBusui || 0,
      qtPorsiKecilL: item.qtPorsiKecilL || 0,
      qtPorsiKecilP: item.qtPorsiKecilP || 0,
      qtPorsiBesarL: item.qtPorsiBesarL || 0,
      qtPorsiBesarP: item.qtPorsiBesarP || 0,
      qtGuruL: item.qtGuruL || 0,
      qtGuruP: item.qtGuruP || 0,
      qtTendikL: item.qtTendikL || 0,
      qtTendikP: item.qtTendikP || 0,
      jumlah,
      jadwalPengantaran: item.jadwalPengantaran || '06.00-08.30',
      assignedPetugasId: '',
      assignedPetugasName: '',
      menuItems: [...menuItems],
      menuKeringanItems: [...menuKeringanItems],
      isSekolahLibur: false,
      notes: '',
      sortOrder: idx + 1,
      createdBy,
      createdAt: now,
      updatedAt: now,
    };
    batch.set(ref, cleanUndefined(entryData));
  });

  await batch.commit();
}
