/**
 * Notifikasi per alur kerja (job desk katering, task Super Admin, MBG).
 *
 * Semua fungsi di sini fire-and-forget: kegagalan menulis notifikasi tidak
 * pernah membatalkan aksi user. Penerima berupa uid atau nama role; role
 * kanonik job desk (produksi_1, distribusi_1, produksi_2, distribusi_2) dan
 * role MBG diperluas ke alias-aliasnya oleh Worker push.
 */

import { getDocFromCache, doc } from "firebase/firestore";
import { db } from "@/lib/firebase";
import { notifyQuietly, type NotificationType } from "./notificationWriter";
import type { MbgBatchStatus, MbgProductionCookingStatus } from "@/types/mbg";

let actorRole = "system";

/** Dipanggil saat profil login dimuat, supaya notifikasi mencatat role pengirim. */
export function setNotificationActorRole(role: string | undefined): void {
  actorRole = role || "system";
}

function send(recipients: Array<string | null | undefined>, type: NotificationType, title: string, message: string, link?: string): void {
  notifyQuietly(recipients, { type, title, titleEn: title, message, messageEn: message, actorRole, link });
}

/** "2026-10-10" → "Sab, 10 Okt" (zona waktu lokal). */
export function formatTanggal(tanggal: string | undefined): string {
  if (!tanggal) return "";
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(tanggal);
  if (!match) return tanggal;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return date.toLocaleDateString("id-ID", { weekday: "short", day: "numeric", month: "short" });
}

// ---------------------------------------------------------------------------
// Job desk katering
// ---------------------------------------------------------------------------

/** Role job desk lama/alias → role kanonik (sama dengan canonicalJobDeskRole di rules). */
export function canonicalJobDeskRole(role: string): string {
  const map: Record<string, string> = {
    MBG2: "produksi_1",
    mbg2: "produksi_1",
    tim_produksi: "produksi_1",
    produksi_mbg_2: "produksi_1",
    distribusi: "distribusi_1",
    distribusi_mbg: "distribusi_1",
    produksi_mbg: "produksi_2",
    distribusi_mbg_2: "distribusi_2",
  };
  return map[role] ?? role;
}

export interface AssignedJobDesk {
  assignedRole: string;
  tanggal: string;
  kegiatan: string;
}

/** MO menyimpan job desk baru → satu notifikasi per role penerima. */
export function notifyJobDesksAssigned(jobDesks: AssignedJobDesk[]): void {
  const byRole = new Map<string, AssignedJobDesk[]>();
  for (const jd of jobDesks) {
    const role = canonicalJobDeskRole(jd.assignedRole);
    byRole.set(role, [...(byRole.get(role) ?? []), jd]);
  }
  for (const [role, list] of byRole) {
    const dates = [...new Set(list.map((jd) => formatTanggal(jd.tanggal)).filter(Boolean))];
    const first = list[0].kegiatan.trim();
    const title = list.length === 1 ? "Job desk baru dari MO" : `${list.length} job desk baru dari MO`;
    const detail = list.length === 1 ? first : `${first} dan ${list.length - 1} lainnya`;
    send([role], "jobdesk", title, `${detail}${dates.length ? ` · ${dates.join(", ")}` : ""}`, "/katering/jobdesk");
  }
}

export interface JobDeskContext {
  kegiatan: string;
  pic?: string;
  tanggal?: string;
  assignedRole?: string;
}

/** PIC mengirim status job desk → MO & CO-MO. */
export function notifyJobDeskSubmitted(context: JobDeskContext, complete: boolean, reason?: string): void {
  const who = context.pic ? `${context.pic} ` : "";
  const status = complete ? "Selesai" : `Tidak selesai${reason ? `: ${reason}` : ""}`;
  send(["mo_katering", "co_mo_katering"], "jobdesk", `${who}mengirim job desk`.trim(),
    `${context.kegiatan}${context.tanggal ? ` (${formatTanggal(context.tanggal)})` : ""} — ${status}`);
}

/** CO-MO menyetujui / menolak → PIC & MO. */
export function notifyJobDeskReviewed(context: JobDeskContext, approved: boolean, remark?: string): void {
  const recipients = [context.assignedRole ? canonicalJobDeskRole(context.assignedRole) : null, "mo_katering"];
  send(recipients, "jobdesk", approved ? "Job desk disetujui CO-MO" : "Job desk ditolak CO-MO",
    `${context.kegiatan}${approved ? "" : ` — ${remark || "perlu diperbaiki"}`}`, "/katering/jobdesk");
}

// ---------------------------------------------------------------------------
// Task Super Admin (KPI)
// ---------------------------------------------------------------------------

export function notifyTaskAssigned(assigneeId: string, title: string, deadline?: string): void {
  const due = deadline ? new Date(deadline) : null;
  const dueText = due && !Number.isNaN(due.getTime())
    ? ` · deadline ${due.toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`
    : "";
  send([assigneeId], "task", "Task baru dari Super Admin", `${title}${dueText}`, "/performance");
}

export function notifyTaskSubmitted(title: string, assigneeName?: string): void {
  send(["super_admin"], "task", `${assigneeName || "Petugas"} mengirim task`, title, "/super-admin/control-center");
}

// ---------------------------------------------------------------------------
// MBG
// ---------------------------------------------------------------------------

/** Tanggal batch dari cache lokal (halaman MBG selalu berlangganan batch) — tanpa biaya read. */
async function batchLabel(batchId: string): Promise<string> {
  try {
    const snap = await getDocFromCache(doc(db, "mbg_pm_batches", batchId));
    const tanggal = snap.data()?.tanggal as string | undefined;
    return tanggal ? `MBG ${formatTanggal(tanggal)}` : "MBG";
  } catch {
    return "MBG";
  }
}

const BATCH_STATUS_NOTIFICATIONS: Partial<Record<MbgBatchStatus, { to: string[]; title: string; message: string; link?: string }>> = {
  PM_SUBMITTED: { to: ["produksi_mbg"], title: "Data PM masuk", message: "Admin MBG mengirim data PM. Silakan hitung gizi & menu.", link: "/mbg/production" },
  NUTRITION_DONE: { to: ["admin_mbg"], title: "Perhitungan gizi selesai", message: "Tim produksi selesai menghitung gizi.", link: "/mbg/admin" },
  PURCHASING: { to: ["admin_mbg"], title: "Belanja bahan dimulai", message: "Pembelian bahan sedang diproses." },
  PURCHASED: { to: ["admin_mbg", "distribusi_mbg"], title: "Bahan sudah dibeli", message: "Bahan siap dicek (QC).", link: "/mbg/distribution" },
  QC_PENDING: { to: ["distribusi_mbg"], title: "Bahan menunggu QC", message: "Silakan cek kualitas bahan yang masuk.", link: "/mbg/distribution" },
  QC_PASSED: { to: ["produksi_mbg", "admin_mbg"], title: "QC bahan lolos", message: "Bahan siap dimasak.", link: "/mbg/production" },
  QC_FAILED: { to: ["admin_mbg", "produksi_mbg"], title: "QC bahan gagal", message: "Ada bahan yang ditolak saat QC." },
  COOKING: { to: ["admin_mbg", "distribusi_mbg"], title: "Mulai memasak", message: "Tim produksi mulai memasak." },
  COOKED: { to: ["distribusi_mbg", "kurir_mbg", "admin_mbg"], title: "Masakan siap diantar", message: "Produksi selesai memasak, siap distribusi.", link: "/mbg/distribution" },
  DELIVERED: { to: ["admin_mbg", "distribusi_mbg"], title: "Pengiriman selesai", message: "Semua kurir sudah menyelesaikan pengiriman." },
};

export function notifyMbgBatchStatus(batchId: string, status: MbgBatchStatus): void {
  const rule = BATCH_STATUS_NOTIFICATIONS[status];
  if (!rule) return;
  void batchLabel(batchId).then((label) => send(rule.to, "mbg", `${label}: ${rule.title}`, rule.message, rule.link));
}

export function notifyMbgCooking(batchId: string, status: MbgProductionCookingStatus): void {
  if (status === "not_started") return;
  void batchLabel(batchId).then((label) => {
    if (status === "cooking") {
      send(["admin_mbg", "distribusi_mbg"], "mbg", `${label}: Mulai memasak`, "Tim produksi mulai memasak.");
    } else {
      send(["distribusi_mbg", "kurir_mbg", "admin_mbg"], "mbg", `${label}: Masakan siap diantar`,
        "Produksi selesai memasak, siap distribusi.", "/mbg/delivery");
    }
  });
}

export interface CourierAssignment {
  courierId?: string;
  assistantId?: string;
  destinations: number;
  portions: number;
}

/** Distribusi mengirim tugas pengantaran → masing-masing kurir & kenek (uid). */
export function notifyMbgCourierTasks(batchId: string, assignments: CourierAssignment[]): void {
  void batchLabel(batchId).then((label) => {
    for (const a of assignments) {
      send([a.courierId, a.assistantId], "delivery", `${label}: Tugas pengantaran`,
        `${a.destinations} tujuan · ${a.portions.toLocaleString("id-ID")} porsi. Buka menu Pengantaran.`, "/mbg/delivery");
    }
  });
}

export function notifyMbgDeliveryProgress(batchId: string, courierName: string, finished: boolean): void {
  void batchLabel(batchId).then((label) => {
    send(finished ? ["admin_mbg", "distribusi_mbg"] : ["distribusi_mbg"], "delivery",
      `${label}: ${finished ? "Kurir selesai mengantar" : "Kurir mulai mengantar"}`, courierName || "Kurir MBG");
  });
}
