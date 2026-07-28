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
import { setDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { MbgPmBatch, MbgPmEntry, MbgBatchStatus, MbgDayMenu } from '@/types/mbg';
import { MBG_MASTER_INSTITUTIONS, DEFAULT_WEEKLY_SCHEDULE } from '@/constants/mbgConstants';

const BATCHES_COLLECTION = 'mbg_pm_batches';
const ENTRIES_COLLECTION = 'mbg_pm_entries';
const SCHEDULE_DOC_REF = doc(db, 'mbg_settings', 'weekly_schedule');

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
  const days = scheduleDays || DEFAULT_WEEKLY_SCHEDULE;
  let dayOfWeek = 1;
  if (dateStr) {
    const parts = dateStr.split('-').map(Number);
    if (parts.length === 3) {
      const dateObj = new Date(parts[0], parts[1] - 1, parts[2]);
      dayOfWeek = dateObj.getDay();
    }
  }

  const found = days.find((d) => d.dayOfWeek === dayOfWeek) || days[0];

  const hewaniList = parseCategoryItems(found.hewaniItems || found.hewani);
  const sayurList = parseCategoryItems(found.sayurItems || found.sayur);
  const buahList = parseCategoryItems(found.buahItems || found.buah);
  const nabatiList = parseCategoryItems(found.nabatiItems || found.nabati);
  const karboList = parseCategoryItems(found.karbohidratItems || found.karbohidrat);
  const keringanList = parseCategoryItems(found.menuKeringanItems || found.menuKeringan);

  const menuItems = [...hewaniList, ...sayurList, ...buahList, ...nabatiList, ...karboList];
  const menuKeringanItems = keringanList.length > 0 ? keringanList : (found.menuKeringan ? [found.menuKeringan] : []);

  return { dayMenu: found, menuItems, menuKeringanItems };
}

export function subscribeWeeklySchedule(
  callback: (days: MbgDayMenu[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    SCHEDULE_DOC_REF,
    (snapshot) => {
      if (snapshot.exists() && snapshot.data().days) {
        callback(snapshot.data().days as MbgDayMenu[]);
      } else {
        setDoc(SCHEDULE_DOC_REF, {
          id: 'weekly_schedule',
          title: 'Master Jadwal Menu Mingguan MBG',
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
  updatedBy: string
): Promise<void> {
  await setDoc(
    SCHEDULE_DOC_REF,
    {
      id: 'weekly_schedule',
      title: 'Master Jadwal Menu Mingguan MBG',
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
  createdBy: string,
  autoPopulate = true,
  scheduleDays?: MbgDayMenu[]
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

  if (autoPopulate) {
    await bulkAddEntriesFromMaster(docRef.id, createdBy, tanggal, scheduleDays);
    await recalculateBatchTotals(docRef.id);
  }

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
    batch.set(ref, cleanUndefined({
      ...entry,
      createdAt: now,
      updatedAt: now,
    }));
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
    batch.set(ref, cleanUndefined({
      ...data,
      batchId: targetBatchId,
      isSekolahLibur: false,
      createdBy,
      createdAt: now,
      updatedAt: now,
    }));
  });

  await batch.commit();
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

/**
 * Delete all MBG operational data across all MBG roles
 * (admin_mbg, produksi_mbg, distribusi_mbg, purchasing_mbg, kurir_mbg)
 */
export async function deleteAllMbgData(): Promise<void> {
  const collectionsToClear = [
    'mbg_pm_batches',
    'mbg_pm_entries',
    'mbg_cooking_sessions',
    'mbg_custom_recipes',
    'mbg_recipe_adjustments',
    'mbg_custom_tkpi',
    'mbg_qc_checks',
    'mbg_delivery_tasks',
    'mbg_purchase_orders',
    'mbg_delivery_documents',
  ];

  for (const colName of collectionsToClear) {
    const snap = await getDocs(collection(db, colName));
    if (!snap.empty) {
      const docs = snap.docs;
      const CHUNK_SIZE = 400;
      for (let i = 0; i < docs.length; i += CHUNK_SIZE) {
        const chunk = docs.slice(i, i + CHUNK_SIZE);
        const b = writeBatch(db);
        chunk.forEach((d) => b.delete(d.ref));
        await b.commit();
      }
    }
  }
}

