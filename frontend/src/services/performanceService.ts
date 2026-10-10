import {
  Bytes, addDoc, collection, deleteField, doc, getDoc, onSnapshot, query, runTransaction,
  serverTimestamp, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deadlineMillis } from "@/utils/taskKpi";
import { EVIDENCE_ORIGINAL_MAX_BYTES, splitIntoChunks } from "@/utils/evidencePhoto";
import { notifyTaskAssigned, notifyTaskSubmitted } from "./flowNotifications";

export type Division = "katering" | "mbg" | "general";

export interface RoleAssignment {
  id: string; userId: string; role: string; division: Division; effectiveFrom?: unknown;
  effectiveUntil?: unknown; status: "active" | "ended"; changedBy: string; reason?: string;
}

/**
 * Task dari Super Admin — satu-satunya sumber KPI.
 * Submit bersifat final (tanpa review/revisi); `submittedAt` diisi jam server.
 * Status lama (pending_review/approved/revision_required) tetap terbaca: yang
 * menentukan sudah submit atau belum adalah `submittedAt`.
 */
export interface AdHocTask {
  id: string; assigneeId: string; assigneeNameSnapshot: string; roleSnapshot: string;
  divisionSnapshot: Division; title: string; instructions: string;
  /** Deadline lokal WIB "YYYY-MM-DDTHH:mm" */
  deadline?: string;
  evidenceNote?: string;
  /** Pratinjau foto bukti (opsional), data URL JPEG kecil untuk daftar & panel */
  evidencePhoto?: string;
  /** Foto asli (≤ 10 MB) disimpan terpotong di sub-koleksi evidence_chunks */
  evidencePhotoChunks?: number;
  evidencePhotoBytes?: number;
  evidencePhotoType?: string;
  evidencePhotoName?: string;
  status: string; createdBy: string; createdAt?: unknown; submittedAt?: unknown;
}

const asMillis = (value: unknown) => value && typeof (value as { toMillis?: unknown }).toMillis === "function"
  ? (value as { toMillis: () => number }).toMillis() : 0;
const newest = <T>(items: T[]) => [...items].sort((a, b) => asMillis((b as { createdAt?: unknown }).createdAt) - asMillis((a as { createdAt?: unknown }).createdAt));
const mapDocs = <T>(snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => newest(snapshot.docs.map((item) => ({ ...item.data() as object, id: item.id } as T)));

export const subscribeRoleAssignments = (userId: string, onData: (items: RoleAssignment[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(query(collection(db, "role_assignments"), where("userId", "==", userId)), (s) => onData(mapDocs<RoleAssignment>(s)), onError);
export const subscribeMyAdHocTasks = (userId: string, onData: (items: AdHocTask[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(query(collection(db, "ad_hoc_tasks"), where("assigneeId", "==", userId)), (s) => onData(mapDocs<AdHocTask>(s)), onError);
export const subscribeAllAdHocTasks = (onData: (items: AdHocTask[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(collection(db, "ad_hoc_tasks"), (s) => onData(mapDocs<AdHocTask>(s)), onError);

export async function createAdHocTask(input: Pick<AdHocTask, "assigneeId" | "assigneeNameSnapshot" | "roleSnapshot" | "divisionSnapshot" | "title" | "instructions" | "deadline" | "createdBy">): Promise<void> {
  if (!input.deadline || !/T\d{2}:\d{2}$/.test(input.deadline) || Number.isNaN(deadlineMillis(input.deadline))) {
    throw new Error("Deadline wajib diisi lengkap (tanggal dan jam).");
  }
  await addDoc(collection(db, "ad_hoc_tasks"), { ...input, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
  notifyTaskAssigned(input.assigneeId, input.title, input.deadline);
}

/** Foto asli yang sudah diunggah ke evidence_chunks. */
export interface EvidenceOriginal {
  chunks: number;
  bytes: number;
  type: string;
  name: string;
}

/**
 * Unggah foto asli ke Firestore, terpotong per EVIDENCE_CHUNK_BYTES (dokumen Firestore
 * maks 1 MB). Hanya pemilik task sebelum submit (dijaga rules). Butuh koneksi.
 */
export async function uploadEvidenceOriginal(taskId: string, file: File, onProgress?: (fraction: number) => void): Promise<EvidenceOriginal> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesi login sudah berakhir.");
  if (file.size > EVIDENCE_ORIGINAL_MAX_BYTES) throw new Error("Foto maksimal 10 MB.");
  const parts = splitIntoChunks(new Uint8Array(await file.arrayBuffer()));
  for (let i = 0; i < parts.length; i++) {
    await setDoc(doc(db, "ad_hoc_tasks", taskId, "evidence_chunks", String(i)), {
      index: i, total: parts.length, data: Bytes.fromUint8Array(parts[i]), uploadedBy: uid, createdAt: serverTimestamp(),
    });
    onProgress?.((i + 1) / parts.length);
  }
  return { chunks: parts.length, bytes: file.size, type: file.type || "image/jpeg", name: file.name || "foto-bukti.jpg" };
}

/** Gabungkan kembali foto asli dari evidence_chunks. */
export async function loadEvidenceOriginal(task: Pick<AdHocTask, "id" | "evidencePhotoChunks" | "evidencePhotoType">): Promise<Blob> {
  const total = task.evidencePhotoChunks ?? 0;
  if (total <= 0) throw new Error("Task ini tidak punya foto asli.");
  const snaps = await Promise.all(Array.from({ length: total }, (_, i) => getDoc(doc(db, "ad_hoc_tasks", task.id, "evidence_chunks", String(i)))));
  const parts = snaps.map((s, i) => {
    const data = s.exists() ? s.get("data") : null;
    if (!(data instanceof Bytes)) throw new Error(`Bagian foto ${i + 1} dari ${total} tidak ditemukan.`);
    return data.toUint8Array();
  });
  return new Blob(parts as BlobPart[], { type: task.evidencePhotoType || "image/jpeg" });
}

/** Submit selesai (final). Tetap bisa dilakukan setelah deadline — statusnya jadi Terlambat. */
export async function submitAdHocTask(taskId: string, evidenceNote: string, evidencePhoto?: string, original?: EvidenceOriginal): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesi login sudah berakhir.");
  if (!evidenceNote.trim()) throw new Error("Keterangan pekerjaan wajib diisi.");
  const submitted = await runTransaction(db, async (tx) => {
    const ref = doc(db, "ad_hoc_tasks", taskId); const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Task tidak ditemukan.");
    const task = snap.data() as AdHocTask;
    if (task.assigneeId !== uid) throw new Error("Task ini bukan milik akun Anda.");
    if (task.submittedAt) throw new Error("Task ini sudah disubmit.");
    tx.update(ref, {
      status: "submitted", evidenceNote: evidenceNote.trim(),
      ...(evidencePhoto ? { evidencePhoto } : {}),
      ...(original ? {
        evidencePhotoChunks: original.chunks, evidencePhotoBytes: original.bytes,
        evidencePhotoType: original.type, evidencePhotoName: original.name,
      } : {}),
      submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
    return task;
  });
  notifyTaskSubmitted(submitted.title, submitted.assigneeNameSnapshot);
}

/** Super Admin: atur atas nama siapa akun ini (kosong = hapus). */
export async function setAccountHolderName(userId: string, holderName: string): Promise<void> {
  const name = holderName.trim().replace(/\s+/g, " ");
  if (name.length > 60) throw new Error("Nama maksimal 60 karakter.");
  await updateDoc(doc(db, "users", userId), { holderName: name ? name : deleteField(), updatedAt: serverTimestamp() });
}

export async function changeUserRole(input: { userId: string; role: string; division: Division; changedBy: string; reason?: string }): Promise<void> {
  if (input.userId === input.changedBy) throw new Error("Super Admin tidak dapat mengubah role akunnya sendiri.");
  await runTransaction(db, async (tx) => {
    const userRef = doc(db, "users", input.userId); const user = await tx.get(userRef);
    if (!user.exists()) throw new Error("Akun personel tidak ditemukan.");
    const prior = user.data() as { role?: string; currentRoleAssignmentId?: string };
    const nextRef = doc(collection(db, "role_assignments"));
    if (prior.currentRoleAssignmentId) tx.update(doc(db, "role_assignments", prior.currentRoleAssignmentId), { status: "ended", effectiveUntil: serverTimestamp() });
    else if (prior.role) tx.set(doc(db, "role_assignments", `initial_${input.userId}`), { userId: input.userId, role: prior.role, division: input.division, status: "ended", changedBy: input.changedBy, reason: "Riwayat awal sebelum Control Center", effectiveFrom: serverTimestamp(), effectiveUntil: serverTimestamp() }, { merge: true });
    tx.set(nextRef, { ...input, status: "active", effectiveFrom: serverTimestamp() });
    tx.update(userRef, { role: input.role, currentRoleAssignmentId: nextRef.id, updatedAt: serverTimestamp() });
  });
}
