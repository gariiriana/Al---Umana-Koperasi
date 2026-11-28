// Endpoint kepala unit (halaman Tim):
// - persetujuan pengajuan / absen luar zona / Silah / clock out telat anggota unit yang dikepalainya,
// - Hari Ini, Rekap (+ export di HP), foto absen, dan jadwal Silah anggota timnya.
// "Tim" = anggota unit yang dikepalai. Karyawan dengan view_all_units (diatur admin) melihat semua unit,
// tetapi persetujuan tetap hanya untuk unit yang dikepalainya.
import { reviewLateOutAs, reviewRequestAs, reviewSilahAs, reviewZoneAs } from "../approval.js";
import {
  countPendingApprovals, getEmployee, getPhoto, listEmployees, listLateOutExceptions, listSilahExceptions, listTeamRequests,
  listZoneExceptions, unitsHeadedBy,
} from "../db.js";
import { AbsensiError, readJson } from "../http.js";
import { toLateOutExceptionView, toRequestView, toSilahExceptionView, toZoneExceptionView } from "../requests.js";
import { requireEmployee } from "../session.js";
import { applySilah, hariIniFor, karyawanFor, rekapFor } from "./admin.js";

const FILTERS = new Set(["pending", "approved", "rejected", "all"]);

async function requireUnitHead(ctx) {
  const employee = await requireEmployee(ctx);
  const units = await unitsHeadedBy(ctx.env.DB, employee.uid);
  if (units.length === 0) throw new AbsensiError("FORBIDDEN", 403);
  return { employee, units };
}

/**
 * Siapa yang boleh dilihat dari halaman Tim. `allows(uid)` true untuk anggota unit yang dikepalai
 * (atau semua karyawan bila view_all_units). Bukan kepala unit dan tanpa view_all_units = FORBIDDEN.
 */
export async function teamScope(ctx) {
  const employee = await requireEmployee(ctx);
  const viewAll = employee.view_all_units === 1;
  const units = await unitsHeadedBy(ctx.env.DB, employee.uid);
  if (!viewAll && units.length === 0) throw new AbsensiError("FORBIDDEN", 403);
  if (viewAll) return { employee, units, viewAll, allows: () => true };
  const unitIds = new Set(units.map((u) => u.id));
  const members = new Set((await listEmployees(ctx.env.DB)).filter((e) => unitIds.has(e.unit_id)).map((e) => e.uid));
  return { employee, units, viewAll, allows: (uid) => members.has(uid) };
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

/** Foto absen (selfie, foto bukti telat, foto acuan) anggota tim. */
export async function getTimFoto(ctx) {
  const { allows } = await teamScope(ctx);
  const photo = await getPhoto(ctx.env.PHOTOS, ctx.params[0]);
  if (!photo || !allows(photo.uid)) throw new AbsensiError("FOTO_TIDAK_ADA", 404);
  return new Response(photo.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}

export async function getTimHariIni(ctx) {
  const { allows } = await teamScope(ctx);
  return hariIniFor(ctx, allows);
}

export async function getTimRekap(ctx) {
  const { allows } = await teamScope(ctx);
  return rekapFor(ctx, allows);
}

export async function listTimKaryawan(ctx) {
  const { allows } = await teamScope(ctx);
  return karyawanFor(ctx, allows);
}

/** Kepala unit hanya boleh mengatur jadwal Silah anggota timnya, bukan dirinya sendiri. */
export async function patchTimKaryawan(ctx) {
  const { employee, allows } = await teamScope(ctx);
  const body = await readJson(ctx.request);
  const uid = ctx.params[0];
  if (body.action !== "set_silah") throw new AbsensiError("VALIDATION_ERROR", 400);
  const target = await getEmployee(ctx.env.DB, uid);
  if (!target || !allows(uid)) throw new AbsensiError("NOT_FOUND", 404);
  if (uid === employee.uid) throw new AbsensiError("SILAH_DIRI_SENDIRI", 400);
  return applySilah(ctx, target, body.silahDays, employee.uid);
}
