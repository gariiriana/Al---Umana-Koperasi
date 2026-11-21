/**
 * Data Laporan 2 Minggu: batch admin MBG + entri + menu Produksi MBG per tanggal (dibaca lewat REST
 * `select`, jadi foto base64 di entri tidak ikut terunduh) dan foto dokumentasi (`mbg_laporan_photos`).
 */
import { addDoc, collection, deleteDoc, doc, getDocs, onSnapshot, query, where } from 'firebase/firestore';
import { auth, db } from '@/lib/firebase';
import { firebaseConfig, useEmulators } from '@/lib/firebaseConfig';
import { compressBase64Image } from '@/utils/imageCompressor';
import { runEqualityQuerySelect } from '@/utils/firestoreRest';
import {
  isPhotoSection,
  pickBatch,
  type LaporanDayData,
  type LaporanEntry,
  type PhotoSectionKey,
  type PortionMenus,
} from '@/lib/laporan2Minggu';

export const LAPORAN_PHOTOS_COLLECTION = 'mbg_laporan_photos';
/** Dokumen Firestore maksimal ±1 MB; sama dengan batas foto bahan. */
export const MAX_PHOTO_CHARS = 900_000;

export interface LaporanPhoto {
  id: string;
  tanggal: string;
  section: PhotoSectionKey;
  url: string;
  order: number;
  createdBy: string;
  createdAt: string;
}

const ENTRY_FIELDS = [
  'institutionName', 'institutionType', 'qtSiswaBalita', 'qtBumil', 'qtBusui', 'qtBumilBusui', 'qtGuruKader',
  'qtGuruL', 'qtGuruP', 'qtTendikL', 'qtTendikP', 'qtPorsiKecilL', 'qtPorsiKecilP', 'qtPorsiBesarL', 'qtPorsiBesarP',
  'jumlah', 'isSekolahLibur', 'sortOrder',
] as const;
const PORTIONS = { kecil: 'porsiKecil', besar: 'porsiBesar', balita: 'porsiBalita', bumilBusui: 'porsiBumilBusui' } as const;
const MENU_FIELDS = [
  'updatedAt',
  ...Object.values(PORTIONS).flatMap((p) => [`${p}.nutritionItems`, `${p}.menuList`]),
];

/** Dokumen yang `field == value`, hanya field yang diminta. REST bila bisa, SDK bila tidak. */
async function selectWhere(collectionId: string, field: string, value: string, selectFields: readonly string[]) {
  const user = auth.currentUser;
  const projectId = firebaseConfig.projectId;
  if (!useEmulators && projectId && typeof user?.getIdToken === 'function' && typeof fetch === 'function') {
    try {
      return await runEqualityQuerySelect({ projectId, idToken: await user.getIdToken(), collectionId, field, value, selectFields });
    } catch (err) {
      console.warn(`Baca ringan ${collectionId} gagal, pakai SDK:`, err);
    }
  }
  const snap = await getDocs(query(collection(db, collectionId), where(field, '==', value)));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Record<string, unknown>);
}

type PortionDoc = { nutritionItems?: { menuName?: unknown }[]; menuList?: unknown[] } | undefined;

/** Nama hidangan per porsi: dari tabel gizi (per porsi, paling akurat), kalau kosong dari daftar menu. */
function portionDishes(portion: PortionDoc): string[] {
  const fromNutrition = (portion?.nutritionItems || []).map((i) => i?.menuName).filter((x): x is string => typeof x === 'string' && x.trim() !== '');
  const list = fromNutrition.length > 0 ? fromNutrition : (portion?.menuList || []).filter((x): x is string => typeof x === 'string');
  return [...new Set(list)];
}

export function menusFromReport(report: Record<string, unknown> | undefined): PortionMenus | null {
  if (!report) return null;
  const menus: PortionMenus = {};
  let any = false;
  for (const [key, field] of Object.entries(PORTIONS) as [keyof PortionMenus, string][]) {
    const dishes = portionDishes(report[field] as PortionDoc);
    if (dishes.length > 0) {
      menus[key] = dishes;
      any = true;
    }
  }
  return any ? menus : null;
}

async function loadDay(tanggal: string): Promise<LaporanDayData> {
  const batches = await selectWhere('mbg_pm_batches', 'tanggal', tanggal, ['tanggal', 'isBackup', 'totalJumlah']);
  const batch = pickBatch(batches as { id: string; isBackup?: boolean; totalJumlah?: number }[]);
  if (!batch) return { tanggal, batchId: null, entries: [], menus: null };
  const [entries, reports] = await Promise.all([
    selectWhere('mbg_pm_entries', 'batchId', batch.id, ENTRY_FIELDS),
    selectWhere('mbg_daily_reports', 'batchId', batch.id, MENU_FIELDS),
  ]);
  // Kalau Produksi menyimpan lebih dari sekali, pakai yang terakhir diperbarui.
  const latest = [...reports].sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))[0];
  return { tanggal, batchId: batch.id, entries: entries as unknown as LaporanEntry[], menus: menusFromReport(latest) };
}

/** Data 10 hari laporan, urut sesuai `dates`. */
export function loadLaporanDays(dates: string[]): Promise<LaporanDayData[]> {
  return Promise.all(dates.map(loadDay));
}

/** Foto dokumentasi untuk tanggal-tanggal laporan (maks. 30 tanggal per query `in`). */
export function subscribeLaporanPhotos(
  dates: string[],
  onChange: (photos: LaporanPhoto[]) => void,
  onError?: (err: unknown) => void,
): () => void {
  if (dates.length === 0) {
    onChange([]);
    return () => {};
  }
  const q = query(collection(db, LAPORAN_PHOTOS_COLLECTION), where('tanggal', 'in', dates));
  return onSnapshot(
    q,
    (snap) => {
      const photos = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<LaporanPhoto, 'id'>) }))
        // Foto lama tanpa bagian (versi arsip) masuk ke "Penerima Manfaat".
        .map((p) => (isPhotoSection(p.section) ? p : { ...p, section: 'penerima' as const }));
      photos.sort((a, b) => a.tanggal.localeCompare(b.tanggal) || a.order - b.order);
      onChange(photos);
    },
    (err) => {
      console.error('Gagal memuat foto laporan:', err);
      onError?.(err);
    },
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export interface AddPhotosResult {
  added: number;
  /** Nama file yang dilewati: bukan foto, atau tetap terlalu besar setelah dikecilkan. */
  rejected: string[];
}

/** Kecilkan lalu simpan foto satu per satu; `onProgress(selesai, total)` untuk indikator di layar. */
export async function addLaporanPhotos(
  tanggal: string,
  section: PhotoSectionKey,
  files: File[],
  createdBy: string,
  onProgress?: (done: number, total: number) => void,
): Promise<AddPhotosResult> {
  let added = 0;
  const rejected: string[] = [];
  const base = Date.now();
  for (const [i, file] of files.entries()) {
    try {
      if (!file.type.startsWith('image/')) {
        rejected.push(file.name);
        continue;
      }
      const url = await compressBase64Image(await readAsDataUrl(file), 1280, 1280, 0.7);
      if (!url.startsWith('data:image/') || url.length > MAX_PHOTO_CHARS) {
        rejected.push(file.name);
        continue;
      }
      await addDoc(collection(db, LAPORAN_PHOTOS_COLLECTION), {
        tanggal,
        section,
        url,
        order: base + i,
        createdBy,
        createdAt: new Date().toISOString(),
      });
      added++;
    } finally {
      onProgress?.(i + 1, files.length);
    }
  }
  return { added, rejected };
}

export function deleteLaporanPhoto(id: string): Promise<void> {
  return deleteDoc(doc(db, LAPORAN_PHOTOS_COLLECTION, id));
}
