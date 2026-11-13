// Endpoint kepala unit: daftar & keputusan pengajuan / absen luar zona / Silah / clock out telat anggota unitnya.
import { reviewLateOutAs, reviewRequestAs, reviewSilahAs, reviewZoneAs, canReview } from "../approval.js";
import {
  countPendingApprovals, getPhoto, listLateOutExceptions, listSilahExceptions, listTeamRequests, listZoneExceptions, unitsHeadedBy,
} from "../db.js";
import { AbsensiError } from "../http.js";
import { toLateOutExceptionView, toRequestView, toSilahExceptionView, toZoneExceptionView } from "../requests.js";
import { requireEmployee } from "../session.js";

const FILTERS = new Set(["pending", "approved", "rejected", "all"]);

async function requireUnitHead(ctx) {
  const employee = await requireEmployee(ctx);
  const units = await unitsHeadedBy(ctx.env.DB, employee.uid);
  if (units.length === 0) throw new AbsensiError("FORBIDDEN", 403);
  return { employee, units };
}

export async function getTimPersetujuan(ctx) {
  const { employee, units } = await requireUnitHead(ctx);
  const status = ctx.url.searchParams.get("status") || "all";
  if (!FILTERS.has(status)) throw new AbsensiError("VALIDATION_ERROR", 400);
  const [requests, zoneExceptions, silahExceptions, lateOutExceptions, pendingCount] = await Promise.all([
    listTeamRequests(ctx.env.DB, employee.uid, { status }),
    listZoneExceptions(ctx.env.DB, { status, teamOf: employee.uid }),
    listSilahExceptions(ctx.env.DB, { status, teamOf: employee.uid }),
    listLateOutExceptions(ctx.env.DB, { status, teamOf: employee.uid }),
    countPendingApprovals(ctx.env.DB, { teamOf: employee.uid }),
  ]);
  return {
    units: units.map((u) => ({ id: u.id, name: u.name })),
    requests: requests.map(toRequestView),
    zoneExceptions: zoneExceptions.map(toZoneExceptionView),
    silahExceptions: silahExceptions.map(toSilahExceptionView),
    lateOutExceptions: lateOutExceptions.map(toLateOutExceptionView),
    pendingCount,
  };
}

export async function reviewTimPengajuan(ctx) {
  const { employee } = await requireUnitHead(ctx);
  return reviewRequestAs(ctx, employee, ctx.params[0]);
}

export async function reviewTimLuarZona(ctx) {
  const { employee } = await requireUnitHead(ctx);
  return reviewZoneAs(ctx, employee, ctx.params[0]);
}

export async function reviewTimSilah(ctx) {
  const { employee } = await requireUnitHead(ctx);
  return reviewSilahAs(ctx, employee, ctx.params[0]);
}

export async function reviewTimLateOut(ctx) {
  const { employee } = await requireUnitHead(ctx);
  return reviewLateOutAs(ctx, employee, ctx.params[0]);
}

/** Selfie absen anggota tim (untuk memeriksa absen luar zona). */
export async function getTimFoto(ctx) {
  const { employee } = await requireUnitHead(ctx);
  const photo = await getPhoto(ctx.env.PHOTOS, ctx.params[0]);
  if (!photo || !(await canReview(ctx.env.DB, employee, photo.uid))) throw new AbsensiError("FOTO_TIDAK_ADA", 404);
  return new Response(photo.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
