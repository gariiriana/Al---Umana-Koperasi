/**
 * Recoverable deletion for Firestore documents.
 *
 * A normal Firestore delete cannot be undone.  This module makes every
 * user-facing deletion a two-write atomic operation: snapshot the source in
 * `developer_recycle_bin`, then remove the source document.  If either write
 * is rejected, neither change is committed.
 */
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  writeBatch,
  type DocumentReference,
  type DocumentSnapshot,
  type Unsubscribe,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export const DEVELOPER_RECYCLE_BIN_COLLECTION = "developer_recycle_bin";

export interface RecycleBinRecord {
  id: string;
  sourcePath: string;
  collectionPath: string;
  documentId: string;
  originalData: Record<string, unknown>;
  deletedAt?: unknown;
  deletedBy: string | null;
  deletedByEmail: string | null;
  reason?: string;
}

function recordFor(snapshot: DocumentSnapshot, reason?: string) {
  if (!snapshot.exists()) return null;
  const source = snapshot.ref;
  return {
    sourcePath: source.path,
    collectionPath: source.parent.path,
    documentId: source.id,
    originalData: snapshot.data() as Record<string, unknown>,
    deletedAt: serverTimestamp(),
    deletedBy: auth.currentUser?.uid ?? null,
    deletedByEmail: auth.currentUser?.email ?? null,
    ...(reason ? { reason } : {}),
  };
}

/** Archive one document and remove it from its original location atomically. */
export async function archiveAndDelete(
  source: DocumentReference,
  reason?: string,
): Promise<boolean> {
  if (source.path.startsWith(`${DEVELOPER_RECYCLE_BIN_COLLECTION}/`)) {
    throw new Error("Arsip recycle bin tidak dapat diarsipkan kembali.");
  }
  const snapshot = await getDoc(source);
  const record = recordFor(snapshot, reason);
  if (!record) return false;

  const batch = writeBatch(db);
  batch.set(doc(collection(db, DEVELOPER_RECYCLE_BIN_COLLECTION)), record);
  batch.delete(source);
  await batch.commit();
  return true;
}

/**
 * Archive a known set of loaded snapshots.  Firestore batches are limited to
 * 500 operations; each document needs one archive write and one delete.
 */
export async function archiveSnapshotsAndDelete(
  snapshots: readonly DocumentSnapshot[],
  reason?: string,
): Promise<number> {
  const records = snapshots
    .map((snapshot) => ({ snapshot, record: recordFor(snapshot, reason) }))
    .filter((item): item is { snapshot: DocumentSnapshot; record: NonNullable<ReturnType<typeof recordFor>> } => item.record !== null);

  for (let offset = 0; offset < records.length; offset += 200) {
    const batch = writeBatch(db);
    for (const { snapshot, record } of records.slice(offset, offset + 200)) {
      batch.set(doc(collection(db, DEVELOPER_RECYCLE_BIN_COLLECTION)), record);
      batch.delete(snapshot.ref);
    }
    await batch.commit();
  }
  return records.length;
}

export function subscribeRecycleBin(
  callback: (records: RecycleBinRecord[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  return onSnapshot(
    query(collection(db, DEVELOPER_RECYCLE_BIN_COLLECTION), orderBy("deletedAt", "desc"), limit(250)),
    (snapshot) => callback(snapshot.docs.map((item) => ({ id: item.id, ...item.data() } as RecycleBinRecord))),
    (error) => onError?.(error),
  );
}

/** Restore an archived document. Existing source data is never overwritten by default. */
export async function restoreArchivedDocument(id: string, overwrite = false): Promise<void> {
  const archiveRef = doc(db, DEVELOPER_RECYCLE_BIN_COLLECTION, id);
  const archive = await getDoc(archiveRef);
  if (!archive.exists()) throw new Error("Data arsip sudah tidak tersedia.");

  const data = archive.data() as Omit<RecycleBinRecord, "id">;
  if (!data.sourcePath || !data.originalData || typeof data.originalData !== "object") {
    throw new Error("Format arsip tidak valid dan tidak dapat dipulihkan.");
  }
  const sourceRef = doc(db, data.sourcePath);
  const source = await getDoc(sourceRef);
  if (source.exists() && !overwrite) {
    throw new Error("Lokasi asli sudah berisi data. Pilih pulihkan dengan timpa bila memang diinginkan.");
  }

  const batch = writeBatch(db);
  batch.set(sourceRef, data.originalData);
  batch.delete(archiveRef);
  await batch.commit();
}

/** Permanently destroy an archive record. This is intentionally developer-only by rules. */
export async function permanentlyDeleteArchivedDocument(id: string): Promise<void> {
  await deleteDoc(doc(db, DEVELOPER_RECYCLE_BIN_COLLECTION, id));
}

/** Read-only integrity probe used by the Developer Control Center. */
export async function countRecycleBinRecords(): Promise<number> {
  const snapshot = await getDocs(query(collection(db, DEVELOPER_RECYCLE_BIN_COLLECTION), limit(250)));
  return snapshot.size;
}
