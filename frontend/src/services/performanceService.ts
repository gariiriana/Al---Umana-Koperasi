import {
  addDoc, collection, doc, onSnapshot, query, runTransaction,
  serverTimestamp, where,
} from "firebase/firestore";
import { auth, db } from "@/lib/firebase";

export type AdHocTaskStatus = "pending" | "in_progress" | "pending_review" | "revision_required" | "approved";
export type Division = "katering" | "mbg" | "general";

export interface PerformanceActivity {
  id: string; userId: string; userNameSnapshot: string; roleSnapshot: string;
  divisionSnapshot: Division; sourceType: "catering_jobdesk" | "mbg_operation" | "ad_hoc_task";
  sourceId: string; title: string; status: "approved"; xp?: number; occurredAt?: unknown;
}
export interface RoleAssignment {
  id: string; userId: string; role: string; division: Division; effectiveFrom?: unknown;
  effectiveUntil?: unknown; status: "active" | "ended"; changedBy: string; reason?: string;
}
export interface AdHocTask {
  id: string; assigneeId: string; assigneeNameSnapshot: string; roleSnapshot: string;
  divisionSnapshot: Division; title: string; instructions: string; priority: "low" | "normal" | "high";
  deadline?: string; evidenceRequired: boolean; evidenceNote?: string; reviewerNote?: string;
  status: AdHocTaskStatus; createdBy: string; createdAt?: unknown; submittedAt?: unknown; reviewedAt?: unknown;
}

const asMillis = (value: unknown) => value && typeof (value as { toMillis?: unknown }).toMillis === "function"
  ? (value as { toMillis: () => number }).toMillis() : 0;
const newest = <T>(items: T[]) => [...items].sort((a, b) => asMillis((b as { createdAt?: unknown }).createdAt) - asMillis((a as { createdAt?: unknown }).createdAt));
const mapDocs = <T>(snapshot: { docs: Array<{ id: string; data: () => unknown }> }) => newest(snapshot.docs.map((item) => ({ ...item.data() as object, id: item.id } as T)));

export const subscribeMyActivities = (userId: string, onData: (items: PerformanceActivity[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(query(collection(db, "performance_activities"), where("userId", "==", userId)), (s) => onData(mapDocs<PerformanceActivity>(s)), onError);
export const subscribeRoleAssignments = (userId: string, onData: (items: RoleAssignment[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(query(collection(db, "role_assignments"), where("userId", "==", userId)), (s) => onData(mapDocs<RoleAssignment>(s)), onError);
export const subscribeMyAdHocTasks = (userId: string, onData: (items: AdHocTask[]) => void, onError?: (error: Error) => void) =>
  onSnapshot(query(collection(db, "ad_hoc_tasks"), where("assigneeId", "==", userId)), (s) => onData(mapDocs<AdHocTask>(s)), onError);

export async function createAdHocTask(input: Omit<AdHocTask, "id" | "status" | "createdAt" | "submittedAt" | "reviewedAt">): Promise<void> {
  await addDoc(collection(db, "ad_hoc_tasks"), { ...input, status: "pending", createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
}

export async function submitAdHocTask(taskId: string, evidenceNote: string): Promise<void> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error("Sesi login sudah berakhir.");
  if (!evidenceNote.trim()) throw new Error("Tulis keterangan bukti pekerjaan terlebih dahulu.");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "ad_hoc_tasks", taskId); const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Task tidak ditemukan.");
    const task = snap.data() as AdHocTask;
    if (task.assigneeId !== uid) throw new Error("Task ini bukan milik akun Anda.");
    if (!(["pending", "in_progress", "revision_required"] as string[]).includes(task.status)) throw new Error("Task ini tidak dapat dikirim pada status sekarang.");
    tx.update(ref, { status: "pending_review", evidenceNote: evidenceNote.trim(), submittedAt: serverTimestamp(), updatedAt: serverTimestamp() });
  });
}

export async function reviewAdHocTask(taskId: string, approved: boolean, reviewerNote: string): Promise<void> {
  const reviewerId = auth.currentUser?.uid;
  if (!reviewerId) throw new Error("Sesi login sudah berakhir.");
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "ad_hoc_tasks", taskId); const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error("Task tidak ditemukan.");
    const task = snap.data() as AdHocTask;
    if (task.status !== "pending_review") throw new Error("Hanya task yang menunggu review yang bisa diproses.");
    if (task.assigneeId === reviewerId) throw new Error("Task tidak boleh direview oleh pemiliknya sendiri.");
    tx.update(ref, { status: approved ? "approved" : "revision_required", reviewerNote: reviewerNote.trim(), reviewedAt: serverTimestamp(), updatedAt: serverTimestamp() });
    if (approved) {
      tx.set(doc(db, "performance_activities", `task_${taskId}`), {
        userId: task.assigneeId, userNameSnapshot: task.assigneeNameSnapshot, roleSnapshot: task.roleSnapshot,
        divisionSnapshot: task.divisionSnapshot, sourceType: "ad_hoc_task", sourceId: taskId,
        title: task.title, status: "approved", xp: 25, occurredAt: serverTimestamp(), approvedBy: reviewerId,
      });
    }
  });
}

/** Creates one immutable KPI record per approved routine Job Desk. */
export async function recordApprovedJobDesk(input: Omit<PerformanceActivity, "id" | "status" | "occurredAt" | "xp">): Promise<void> {
  await runTransaction(db, async (tx) => {
    const ref = doc(db, "performance_activities", `jobdesk_${input.sourceId}`);
    if ((await tx.get(ref)).exists()) return;
    tx.set(ref, { ...input, status: "approved", xp: 10, occurredAt: serverTimestamp() });
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
