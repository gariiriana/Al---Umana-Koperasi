// Endpoint kepala unit: daftar & keputusan pengajuan / absen luar zona anggota unitnya.
import { reviewRequestAs, reviewZoneAs, canReview } from "../approval.js";
import { countPendingApprovals, getPhoto, listTeamRequests, listZoneExceptions, unitsHeadedBy } from "../db.js";
import { AbsensiError } from "../http.js";
import { toRequestView, toZoneExceptionView } from "../requests.js";
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
  const [requests, zoneExceptions, pendingCount] = await Promise.all([
    listTeamRequests(ctx.env.DB, employee.uid, { status }),
    listZoneExceptions(ctx.env.DB, { status, teamOf: employee.uid }),
    countPendingApprovals(ctx.env.DB, { teamOf: employee.uid }),
  ]);
  return {
    units: units.map((u) => ({ id: u.id, name: u.name })),
    requests: requests.map(toRequestView),
    zoneExceptions: zoneExceptions.map(toZoneExceptionView),
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

/** Selfie absen anggota tim (untuk memeriksa absen luar zona). */
export async function getTimFoto(ctx) {
  const { employee } = await requireUnitHead(ctx);
  const photo = await getPhoto(ctx.env.PHOTOS, ctx.params[0]);
  if (!photo || !(await canReview(ctx.env.DB, employee, photo.uid))) throw new AbsensiError("FOTO_TIDAK_ADA", 404);
  return new Response(photo.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}
