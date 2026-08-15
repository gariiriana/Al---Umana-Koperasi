// ============================================================================
// Catering Job Desk Service — Firestore CRUD operations (Excel Form Layout)
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
  serverTimestamp,
  getDocs,
  Timestamp,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import type {
  CateringJobDesk,
  JobDeskAssignableRole,
  JobDeskDivision,
  JobDeskStatus,
  PicShortName,
} from "@/types/cateringJobDesk";
import {
  PIC_NAME_TO_ROLE,
  ROLE_TO_PIC_NAME,
  generateKeyId,
  getHariFromDate,
} from "@/types/cateringJobDesk";

const COLLECTION = "catering_jobdesks";

/** Convert Firestore doc data to typed CateringJobDesk. */
function docToJobDesk(id: string, data: Record<string, unknown>): CateringJobDesk {
  const ts = (field: unknown): string => {
    if (!field) return "";
    if (field instanceof Timestamp) return field.toDate().toISOString();
    if (typeof field === "string") return field;
    return "";
  };

  const assignedRole = (data.assignedRole as JobDeskAssignableRole) || "produksi_1";
  const pic = (data.pic as PicShortName) || ROLE_TO_PIC_NAME[assignedRole] || "Joko";
  const kegiatan = (data.kegiatan as string) || (data.title as string) || "";
  const keterangan = (data.keterangan as string) || (data.description as string) || "";
  const tanggal = (data.tanggal as string) || "";
  const hari = (data.hari as string) || (tanggal ? getHariFromDate(tanggal) : "");
  const startTime = (data.startTime as string) || "";

  // Auto detect division: fallback to 'mbg' if mbg fields exist, otherwise 'katering'
  const division: JobDeskDivision =
    (data.division as JobDeskDivision) ||
    (data.mbgBatchId || data.mbgInstitutionName || kegiatan.toLowerCase().includes("mbg")
      ? "mbg"
      : "katering");

  const defaultKeyPrefix = division === "mbg" ? "MBG" : "CAT";
  const keyId = (data.keyId as string) || `${defaultKeyPrefix}-${id.slice(0, 8).toUpperCase()}`;

  return {
    id,
    division,
    hari,
    tanggal,
    startTime,
    pic,
    kegiatan,
    keterangan,
    keyId,
    orderId: (data.orderId as string) || "",
    orderLabel: (data.orderLabel as string) || "",
    mbgBatchId: (data.mbgBatchId as string) || undefined,
    mbgInstitutionName: (data.mbgInstitutionName as string) || undefined,
    mbgPortionCount: typeof data.mbgPortionCount === "number" ? data.mbgPortionCount : undefined,
    mbgMenuType: (data.mbgMenuType as string) || undefined,
    assignedRole,
    assignedBy: (data.assignedBy as string) || "",
    title: kegiatan,
    description: keterangan,
    status: (data.status as CateringJobDesk["status"]) || "pending",
    incompleteReason: (data.incompleteReason as string) || undefined,
    submittedAt: ts(data.submittedAt) || undefined,
    submittedBy: (data.submittedBy as string) || undefined,
    reviewStatus: (data.reviewStatus as CateringJobDesk["reviewStatus"]) || "not_submitted",
    reviewedBy: (data.reviewedBy as string) || undefined,
    reviewedAt: ts(data.reviewedAt) || undefined,
    rejectionRemark: (data.rejectionRemark as string) || undefined,
    createdAt: ts(data.createdAt),
    updatedAt: ts(data.updatedAt),
  };
}

// ---------------------------------------------------------------------------
// MO Operations
// ---------------------------------------------------------------------------

export interface CreateJobDeskInput {
  division?: JobDeskDivision;
  hari?: string;
  tanggal: string;
  startTime: string;
  pic: PicShortName | string;
  kegiatan: string;
  keterangan: string;
  keyId?: string;
  orderId?: string;
  orderLabel?: string;
  mbgBatchId?: string;
  mbgInstitutionName?: string;
  mbgPortionCount?: number;
  mbgMenuType?: string;
  assignedRole?: JobDeskAssignableRole;
  assignedByUid: string;
}

/** Create a new job desk with excel form layout columns. */
export async function createJobDesk(input: CreateJobDeskInput): Promise<string> {
  const role: JobDeskAssignableRole =
    input.assignedRole ||
    (PIC_NAME_TO_ROLE[input.pic as PicShortName] || "produksi_1");
  const calculatedHari = input.hari || getHariFromDate(input.tanggal);
  const division = input.division || (input.mbgBatchId || input.mbgInstitutionName ? "mbg" : "katering");
  const keyPrefix = division === "mbg" ? "MBG" : "CAT";
  const calculatedKeyId =
    input.keyId ||
    generateKeyId(input.tanggal, Math.floor(Math.random() * 900) + 100, keyPrefix);

  const docRef = await addDoc(collection(db, COLLECTION), {
    division,
    hari: calculatedHari,
    tanggal: input.tanggal,
    startTime: input.startTime,
    pic: input.pic,
    kegiatan: input.kegiatan,
    keterangan: input.keterangan,
    keyId: calculatedKeyId,
    orderId: input.orderId || "",
    orderLabel: input.orderLabel || "",
    mbgBatchId: input.mbgBatchId || null,
    mbgInstitutionName: input.mbgInstitutionName || null,
    mbgPortionCount: typeof input.mbgPortionCount === "number" ? input.mbgPortionCount : null,
    mbgMenuType: input.mbgMenuType || null,
    assignedRole: role,
    assignedBy: input.assignedByUid,
    title: input.kegiatan,
    description: input.keterangan,
    status: "pending",
    reviewStatus: "not_submitted",
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
  return docRef.id;
}

/** Batch create multiple job desk entries (e.g. bulk excel upload/input). */
export async function batchCreateJobDesks(
  inputs: CreateJobDeskInput[]
): Promise<number> {
  const batch = writeBatch(db);
  const collRef = collection(db, COLLECTION);

  inputs.forEach((input, index) => {
    const role: JobDeskAssignableRole =
      input.assignedRole ||
      (PIC_NAME_TO_ROLE[input.pic as PicShortName] || "produksi_1");
    const calculatedHari = input.hari || getHariFromDate(input.tanggal);
    const division = input.division || (input.mbgBatchId || input.mbgInstitutionName ? "mbg" : "katering");
    const keyPrefix = division === "mbg" ? "MBG" : "CAT";
    const calculatedKeyId =
      input.keyId || generateKeyId(input.tanggal, index + 1, keyPrefix);

    const newDoc = doc(collRef);
    batch.set(newDoc, {
      division,
      hari: calculatedHari,
      tanggal: input.tanggal,
      startTime: input.startTime,
      pic: input.pic,
      kegiatan: input.kegiatan,
      keterangan: input.keterangan,
      keyId: calculatedKeyId,
      orderId: input.orderId || "",
      orderLabel: input.orderLabel || "",
      mbgBatchId: input.mbgBatchId || null,
      mbgInstitutionName: input.mbgInstitutionName || null,
      mbgPortionCount: typeof input.mbgPortionCount === "number" ? input.mbgPortionCount : null,
      mbgMenuType: input.mbgMenuType || null,
      assignedRole: role,
      assignedBy: input.assignedByUid,
      title: input.kegiatan,
      description: input.keterangan,
      status: "pending",
      reviewStatus: "not_submitted",
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  });

  await batch.commit();
  return inputs.length;
}

/** Delete a job desk (MO only). */
export async function deleteJobDesk(jobDeskId: string): Promise<void> {
  await deleteDoc(doc(db, COLLECTION, jobDeskId));
}

/** Update an existing job desk's details (MO only). */
export async function updateJobDesk(
  jobDeskId: string,
  data: Partial<CreateJobDeskInput>
): Promise<void> {
  const updateData: Record<string, unknown> = {
    ...data,
    updatedAt: serverTimestamp(),
  };
  if (data.kegiatan) updateData.title = data.kegiatan;
  if (data.keterangan) updateData.description = data.keterangan;
  if (data.pic && !data.assignedRole) {
    updateData.assignedRole = PIC_NAME_TO_ROLE[data.pic as PicShortName] || "produksi_1";
  }
  await updateDoc(doc(db, COLLECTION, jobDeskId), updateData);
}

// ---------------------------------------------------------------------------
// Operational Role Operations
// ---------------------------------------------------------------------------

/** Submit the status of a job desk (complete or incomplete with reason). */
export async function submitJobDeskStatus(
  jobDeskId: string,
  status: JobDeskStatus,
  submittedByUid: string,
  incompleteReason?: string
): Promise<void> {
  const updateData: Record<string, unknown> = {
    status,
    submittedBy: submittedByUid,
    submittedAt: serverTimestamp(),
    reviewStatus: "pending_review",
    updatedAt: serverTimestamp(),
  };

  if (status === "incomplete" && incompleteReason) {
    updateData.incompleteReason = incompleteReason;
  } else {
    updateData.incompleteReason = null;
  }

  await updateDoc(doc(db, COLLECTION, jobDeskId), updateData);
}

// ---------------------------------------------------------------------------
// CO_MO Operations
// ---------------------------------------------------------------------------

/** Approve a submitted job desk. */
export async function approveJobDesk(
  jobDeskId: string,
  reviewedByUid: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, jobDeskId), {
    reviewStatus: "approved",
    reviewedBy: reviewedByUid,
    reviewedAt: serverTimestamp(),
    rejectionRemark: null,
    updatedAt: serverTimestamp(),
  });
}

/** Reject a submitted job desk with remark. */
export async function rejectJobDesk(
  jobDeskId: string,
  reviewedByUid: string,
  remark: string
): Promise<void> {
  await updateDoc(doc(db, COLLECTION, jobDeskId), {
    reviewStatus: "rejected",
    reviewedBy: reviewedByUid,
    reviewedAt: serverTimestamp(),
    rejectionRemark: remark,
    // Reset status so the operational role can fix & re-submit
    status: "pending",
    submittedAt: null,
    submittedBy: null,
    updatedAt: serverTimestamp(),
  });
}

// ---------------------------------------------------------------------------
// Real-time Subscriptions
// ---------------------------------------------------------------------------

/** Subscribe to all job desks (for CO_MO and MO overview), optionally filtered by division. */
export function subscribeAllJobDesks(
  onData: (jobDesks: CateringJobDesk[]) => void,
  onError?: (error: Error) => void,
  division?: JobDeskDivision
): () => void {
  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      let results = snapshot.docs.map((d) =>
        docToJobDesk(d.id, d.data() as Record<string, unknown>)
      );
      if (division) {
        results = results.filter((jd) => jd.division === division);
      }
      onData(results);
    },
    (error) => {
      console.error("subscribeAllJobDesks error:", error);
      onError?.(error);
    }
  );
}

/** Subscribe to all job desks for a specific order. */
export function subscribeJobDesksByOrder(
  orderId: string,
  onData: (jobDesks: CateringJobDesk[]) => void,
  onError?: (error: Error) => void
): () => void {
  const q = query(
    collection(db, COLLECTION),
    where("orderId", "==", orderId),
    orderBy("createdAt", "asc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const results = snapshot.docs.map((d) =>
        docToJobDesk(d.id, d.data() as Record<string, unknown>)
      );
      onData(results);
    },
    (error) => {
      console.error("subscribeJobDesksByOrder error:", error);
      onError?.(error);
    }
  );
}

/** Subscribe to job desks assigned to a specific role or PIC name (handles aliases, MBG2, and dual-scope Dstribusi2@alumana.id). */
export function subscribeJobDesksByRole(
  role: JobDeskAssignableRole,
  onData: (jobDesks: CateringJobDesk[]) => void,
  onError?: (error: Error) => void,
  userEmail?: string
): () => void {
  const emailLower = (userEmail || "").toLowerCase();
  const isJoko =
    emailLower.includes("produksimbg2") ||
    emailLower.includes("produksimbg") ||
    emailLower.includes("joko") ||
    role === "produksi_1";

  const picName = isJoko ? "Joko" : (ROLE_TO_PIC_NAME[role] || "Joko");
  const isDualDistribusi =
    !isJoko &&
    (role === "distribusi_2" ||
      role === "distribusi_mbg_2" ||
      emailLower === "dstribusi2@alumana.id" ||
      emailLower.startsWith("wandi"));

  const q = query(
    collection(db, COLLECTION),
    orderBy("createdAt", "desc")
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const results = snapshot.docs
        .map((d) => docToJobDesk(d.id, d.data() as Record<string, unknown>))
        .filter((jd) => {
          // Joko: match Joko tasks
          if (isJoko) {
            if (jd.pic === "Joko" || jd.assignedRole === "produksi_1" || jd.pic?.toLowerCase().includes("joko")) return true;
            return false;
          }

          // Dual-Scope Distribusi 2 (Wandi / Dstribusi2@alumana.id): matches both katering & mbg distribusi
          if (isDualDistribusi) {
            if (jd.assignedRole === "distribusi_2" || jd.assignedRole === "distribusi_mbg_2") return true;
            if (jd.pic === "Wandi" || jd.pic === "Distribusi2" || jd.pic?.toLowerCase().includes("distribusi")) return true;
            return false;
          }

          if (role === "MBG2") {
            return jd.assignedRole === "MBG2" || jd.pic === "MBG2" || jd.pic?.toLowerCase().includes("mbg 2");
          }

          if (jd.assignedRole === role) return true;
          if (jd.pic === picName) return true;
          if (role === "distribusi_1" && jd.pic === "Dwi") return true;
          if (role === "produksi_2" && jd.pic === "Shifa") return true;
          return false;
        });
      onData(results);
    },
    (error) => {
      console.error("subscribeJobDesksByRole error:", error);
      onError?.(error);
    }
  );
}

/** One-time fetch of all job desks for a specific order. */
export async function getJobDesksByOrder(orderId: string): Promise<CateringJobDesk[]> {
  const q = query(
    collection(db, COLLECTION),
    where("orderId", "==", orderId),
    orderBy("createdAt", "asc")
  );
  const snapshot = await getDocs(q);
  return snapshot.docs.map((d) =>
    docToJobDesk(d.id, d.data() as Record<string, unknown>)
  );
}
