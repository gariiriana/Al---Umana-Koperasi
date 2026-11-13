// ============================================================================
// Courier Task Service — data kecil untuk halaman "Tugas Saya" (semua kurir).
// Sengaja dibatasi: hanya batch MBG kemarin..besok dan hanya tugas milik kurir
// ini, karena dokumen tugas MBG bisa mendekati 1 MiB (salinan foto sekolah).
// ============================================================================

import { collection, query, where, type Unsubscribe } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { subscriptionManager } from "@/services/subscriptionManager";
import { addDays } from "@/utils/date";
import type { MbgDeliveryTask, MbgPmBatch } from "@/types/mbg";

/** batchId → tanggal untuk batch aktif bertanggal kemarin, hari ini, dan besok. */
export function subscribeRecentMbgBatchDates(
  today: string,
  onData: (dates: Record<string, string>) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  const q = query(
    collection(db, "mbg_pm_batches"),
    where("tanggal", "in", [addDays(today, -1), today, addDays(today, 1)]),
  );
  return subscriptionManager.subscribe(q, (snap) => {
    const dates: Record<string, string> = {};
    for (const docSnap of snap.docs) {
      const batch = docSnap.data() as MbgPmBatch;
      if (batch.isBackup || batch.status === "DRAFT") continue;
      dates[docSnap.id] = batch.tanggal;
    }
    onData(dates);
  }, onError);
}

/** Tugas MBG kurir ini (sebagai petugas maupun kenek) di batch-batch yang diberikan. */
export function subscribeMyMbgTasks(
  uid: string,
  batchIds: string[],
  onData: (tasks: MbgDeliveryTask[]) => void,
  onError?: (error: Error) => void,
): Unsubscribe {
  if (!uid || batchIds.length === 0) {
    onData([]);
    return () => {};
  }
  const byField: Record<"petugasId" | "kenekId", MbgDeliveryTask[] | null> = { petugasId: null, kenekId: null };
  const emit = () => {
    if (!byField.petugasId || !byField.kenekId) return;
    const merged = new Map<string, MbgDeliveryTask>();
    for (const task of [...byField.petugasId, ...byField.kenekId]) merged.set(task.id, task);
    onData([...merged.values()]);
  };
  const listen = (field: "petugasId" | "kenekId") => subscriptionManager.subscribe(
    query(collection(db, "mbg_delivery_tasks"), where("batchId", "in", batchIds), where(field, "==", uid)),
    (snap) => {
      byField[field] = snap.docs.map((d) => ({ id: d.id, ...d.data() } as MbgDeliveryTask));
      emit();
    },
    onError,
  );
  const unsubscribers = [listen("petugasId"), listen("kenekId")];
  return () => unsubscribers.forEach((unsubscribe) => unsubscribe());
}
