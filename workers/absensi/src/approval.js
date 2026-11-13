// Persetujuan pengajuan & absen luar zona: admin absensi (semua karyawan) atau kepala unit (anggota unitnya).
import {
  getLateOutException, getRequestById, getSilahException, getZoneException, insertNotifications, listActiveEmployeesByRole, reviewRequest,
  reviewLateOutException, reviewSilahException, reviewZoneException, unitHeadOf,
} from "./db.js";
import { AbsensiError, readJson } from "./http.js";
import {
  requestDetailSummary, requestKindTitle, toLateOutExceptionView, toRequestView, toSilahExceptionView, toZoneExceptionView,
} from "./requests.js";

const WIB_OFFSET_MS = 7 * 3600_000;

/** "08:15" WIB. */
export function jamWIB(ms) {
  const d = new Date(ms + WIB_OFFSET_MS);
  return `${String(d.getUTCHours()).padStart(2, "0")}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

/** Penerima notifikasi "perlu persetujuan": semua admin absensi aktif + kepala unit karyawan `uid`. */
export async function approverRecipients(db, uid) {
  const [admins, head] = await Promise.all([listActiveEmployeesByRole(db, "admin_absensi"), unitHeadOf(db, uid)]);
  const seen = new Set();
  return [...admins, ...(head ? [head] : [])].filter((person) => {
    if (person.uid === uid || seen.has(person.uid)) return false;
    seen.add(person.uid);
    return true;
  });
}

/** Admin absensi boleh semua; kepala unit hanya anggota unitnya dan tidak untuk dirinya sendiri. */
export async function canReview(db, reviewer, targetUid) {
  if (reviewer.role === "admin_absensi") return true;
  if (reviewer.uid === targetUid) return false;
  const head = await unitHeadOf(db, targetUid);
  return head?.uid === reviewer.uid;
}

async function parseReview(request) {
  const body = await readJson(request);
  if (body.action !== "approve" && body.action !== "reject") throw new AbsensiError("VALIDATION_ERROR", 400);
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 300) throw new AbsensiError("VALIDATION_ERROR", 400);
  return { approved: body.action === "approve", note };
}

const reviewerLabel = (reviewer) => (reviewer.role === "admin_absensi" ? reviewer.name : `${reviewer.name} (kepala unit)`);

/** Setujui / tolak pengajuan cuti / pergantian shift. */
export async function reviewRequestAs(ctx, reviewer, id) {
  const { approved, note } = await parseReview(ctx.request);
  const existing = await getRequestById(ctx.env.DB, id);
  if (!existing) throw new AbsensiError("NOT_FOUND", 404);
  if (!(await canReview(ctx.env.DB, reviewer, existing.uid))) throw new AbsensiError("FORBIDDEN", 403);

  const now = ctx.deps.now();
  const changed = await reviewRequest(ctx.env.DB, id, {
    status: approved ? "approved" : "rejected",
    reviewedBy: reviewer.uid,
    reviewedAt: now,
    reviewNote: note || null,
  });
  if (changed === 0) throw new AbsensiError("SUDAH_DIPROSES", 409);

  const updated = await getRequestById(ctx.env.DB, id);
  const noteSuffix = note ? ` Catatan: "${note}"` : "";
  await insertNotifications(ctx.env.DB, [{
    recipientUid: updated.uid,
    kind: approved ? "pengajuan_disetujui" : "pengajuan_ditolak",
    title: `${requestKindTitle(updated)} ${approved ? "Disetujui" : "Ditolak"}`,
    body: `${requestDetailSummary(updated)} telah ${approved ? "disetujui" : "ditolak"} oleh ${reviewerLabel(reviewer)}.${noteSuffix}`,
    requestId: updated.id,
    createdAt: now,
  }]);
  return toRequestView(updated);
}

export const zoneKindLabel = (kind) => (kind === "pulang" ? "Clock Out" : "Clock In");

/** Setujui / tolak absen di luar zona. Ditolak = absen itu tidak sah di rekap. */
export async function reviewZoneAs(ctx, reviewer, id) {
  const { approved, note } = await parseReview(ctx.request);
  const existing = await getZoneException(ctx.env.DB, id);
  if (!existing) throw new AbsensiError("NOT_FOUND", 404);
  if (!(await canReview(ctx.env.DB, reviewer, existing.uid))) throw new AbsensiError("FORBIDDEN", 403);

  const now = ctx.deps.now();
  const changed = await reviewZoneException(ctx.env.DB, id, {
    status: approved ? "approved" : "rejected",
    reviewedBy: reviewer.uid,
    reviewedAt: now,
    reviewNote: note || null,
  });
  if (changed === 0) throw new AbsensiError("SUDAH_DIPROSES", 409);

  const updated = await getZoneException(ctx.env.DB, id);
  const noteSuffix = note ? ` Catatan: "${note}"` : "";
  const what = `${zoneKindLabel(updated.kind)} di luar zona (${updated.work_date ?? ""} ${jamWIB(updated.at)})`.replace("( ", "(");
  await insertNotifications(ctx.env.DB, [{
    recipientUid: updated.uid,
    kind: approved ? "pengajuan_disetujui" : "pengajuan_ditolak",
    title: `Absen Luar Zona ${approved ? "Disetujui" : "Ditolak"}`,
    body: `${what} telah ${approved ? "disetujui" : "ditolak"} oleh ${reviewerLabel(reviewer)}.${noteSuffix}`,
    requestId: null,
    createdAt: now,
  }]);
  return toZoneExceptionView(updated);
}

/** Setujui / tolak clock in di hari Silah. Ditolak = hari itu tidak dihitung hadir di rekap. */
export async function reviewSilahAs(ctx, reviewer, id) {
  const { approved, note } = await parseReview(ctx.request);
  const existing = await getSilahException(ctx.env.DB, id);
  if (!existing) throw new AbsensiError("NOT_FOUND", 404);
  if (!(await canReview(ctx.env.DB, reviewer, existing.uid))) throw new AbsensiError("FORBIDDEN", 403);

  const now = ctx.deps.now();
  const changed = await reviewSilahException(ctx.env.DB, id, {
    status: approved ? "approved" : "rejected",
    reviewedBy: reviewer.uid,
    reviewedAt: now,
    reviewNote: note || null,
  });
  if (changed === 0) throw new AbsensiError("SUDAH_DIPROSES", 409);

  const updated = await getSilahException(ctx.env.DB, id);
  const noteSuffix = note ? ` Catatan: "${note}"` : "";
  await insertNotifications(ctx.env.DB, [{
    recipientUid: updated.uid,
    kind: approved ? "pengajuan_disetujui" : "pengajuan_ditolak",
    title: `Masuk di Hari Silah ${approved ? "Disetujui" : "Ditolak"}`,
    body: `Clock in di hari Silah (${updated.work_date} ${jamWIB(updated.at)}) telah ${approved ? "disetujui" : "ditolak"} oleh ${reviewerLabel(reviewer)}.${noteSuffix}`,
    requestId: null,
    createdAt: now,
  }]);
  return toSilahExceptionView(updated);
}

/** Setujui / tolak clock out sesudah ganti hari. Ditolak = shift itu dihitung tidak clock out. */
export async function reviewLateOutAs(ctx, reviewer, id) {
  const { approved, note } = await parseReview(ctx.request);
  const existing = await getLateOutException(ctx.env.DB, id);
  if (!existing) throw new AbsensiError("NOT_FOUND", 404);
  if (!(await canReview(ctx.env.DB, reviewer, existing.uid))) throw new AbsensiError("FORBIDDEN", 403);

  const now = ctx.deps.now();
  const changed = await reviewLateOutException(ctx.env.DB, id, {
    status: approved ? "approved" : "rejected",
    reviewedBy: reviewer.uid,
    reviewedAt: now,
    reviewNote: note || null,
  });
  if (changed === 0) throw new AbsensiError("SUDAH_DIPROSES", 409);

  const updated = await getLateOutException(ctx.env.DB, id);
  const noteSuffix = note ? ` Catatan: "${note}"` : "";
  const akibat = approved ? "" : " Absensi tanggal itu dihitung tidak clock out.";
  await insertNotifications(ctx.env.DB, [{
    recipientUid: updated.uid,
    kind: approved ? "pengajuan_disetujui" : "pengajuan_ditolak",
    title: `Clock Out Terlambat ${approved ? "Disetujui" : "Ditolak"}`,
    body: `Clock out absensi ${updated.work_date} (pukul ${jamWIB(updated.at)} WIB) telah ${approved ? "disetujui" : "ditolak"} oleh ${reviewerLabel(reviewer)}.${akibat}${noteSuffix}`,
    requestId: null,
    createdAt: now,
  }]);
  return toLateOutExceptionView(updated);
}
