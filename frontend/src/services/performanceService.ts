import {
  addDoc, collection, doc, onSnapshot, query, runTransaction,
  serverTimestamp, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";
import { deadlineMillis } from "@/utils/taskKpi";

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
  /** Foto bukti (opsional), data URL JPEG terkompresi */
  evidencePhoto?: string;
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
}

/** Submit selesai (final). Tetap bisa dilakukan setelah deadline — statusnya jadi Terlambat. */
export async function submitAdHocTask(taskId: string, evidenceNote: string, evidencePhoto?: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesi login sudah berakhir.");
  if (!evidenceNote.trim()) throw new Error("Keterangan pekerjaan wajib diisi.");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "ad_hoc_tasks", taskId); const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Task tidak ditemukan.");
    const task = snap.data() as AdHocTask;
    if (task.assigneeId !== uid) throw new Error("Task ini bukan milik akun Anda.");
    if (task.submittedAt) throw new Error("Task ini sudah disubmit.");
    tx.update(ref, {
      status: "submitted", evidenceNote: evidenceNote.trim(),
      ...(evidencePhoto ? { evidencePhoto } : {}),
      submittedAt: serverTimestamp(), updatedAt: serverTimestamp(),
    });
  });
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
