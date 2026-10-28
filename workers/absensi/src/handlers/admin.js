// Endpoint admin_absensi: hari ini, rekap, pengajuan, foto, karyawan, area.
import { MAX_TOLERANCE_M, MIN_PASSWORD_LENGTH, REKAP_MAX_DAYS } from "../../shared/constants.js";
import { workDateWIB } from "../../shared/time.js";
import {
  approvedRequestsInRange, countPendingRequests, deletePhoto, getEmployee, getPhoto, getRequestById,
  insertEmployee, insertNotifications, listAdminRequests, listAreas, listEmployees, rekapShifts,
  replaceAreas, resetEmployeeDevice, reviewRequest, setEmployeeStatus, setFaceRequired, todayOverview,
} from "../db.js";
import { AbsensiError, readJson } from "../http.js";
import { DAY_MS, parseIsoDate, requestDetailSummary, requestKindTitle, toRequestView } from "../requests.js";
import { requireEmployee } from "../session.js";
import { toShiftView } from "../shifts.js";

const ROLES = new Set(["absen_karyawan", "admin_absensi"]);
const REQUEST_FILTERS = new Set(["pending", "approved", "rejected", "all"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = () => new AbsensiError("VALIDATION_ERROR", 400);

const requireAdmin = (ctx) => requireEmployee(ctx, { role: "admin_absensi" });

const employeeView = (row) => ({
  uid: row.uid,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  faceRequired: row.face_required === 1,
  activated: row.activated_at !== null,
  referencePhotoId: row.reference_photo_id,
  createdAt: row.created_at,
});

const STATE = { terbuka: "masuk", selesai: "pulang", lupa_pulang: "tidak_clock_out" };

export async function getHariIni(ctx) {
  await requireAdmin(ctx);
  const now = ctx.deps.now();
  const date = workDateWIB(now);
  const [overviewRows, approvedToday] = await Promise.all([
    todayOverview(ctx.env.DB, date),
    approvedRequestsInRange(ctx.env.DB, { from: date, to: date }),
  ]);

  const leaveByUid = new Map();
  const swapByUid = new Map();
  for (const req of approvedToday) {
    if (req.kind === "cuti" && !leaveByUid.has(req.uid)) {
      leaveByUid.set(req.uid, req.leave_type ?? "cuti");
    } else if (req.kind === "pergantian_shift" && !swapByUid.has(req.uid)) {
      swapByUid.set(req.uid, {
        fromShift: req.from_shift,
        toShift: req.to_shift,
        partnerName: req.partner_name ?? null,
      });
    }
  }

  const people = new Map();
  for (const row of overviewRows) {
    if (!people.has(row.uid)) people.set(row.uid, { uid: row.uid, name: row.name, views: [] });
    if (row.shift_id) {
      people.get(row.uid).views.push(toShiftView({
        id: row.shift_id, work_date: row.work_date, masuk_at: row.masuk_at, pulang_at: row.pulang_at, status: row.status,
      }, now));
    }
  }

  const rows = [...people.values()].map(({ uid, name, views }) => {
    // Shift hari ini menang; shift malam dari kemarin yang masih berjalan dihitung "masuk".
    const shown = views.find((v) => v.workDate === date) ?? views.find((v) => v.status === "terbuka") ?? null;
    return {
      uid,
      name,
      masukAt: shown?.masukAt ?? null,
      pulangAt: shown?.pulangAt ?? null,
      state: shown ? STATE[shown.status] : "belum",
      leaveType: leaveByUid.get(uid) ?? null,
      shiftSwap: swapByUid.get(uid) ?? null,
    };
  });
  return { date, rows };
}

export async function getRekap(ctx) {
  await requireAdmin(ctx);
  const params = ctx.url.searchParams;
  const from = parseIsoDate(params.get("from"));
  const to = parseIsoDate(params.get("to"));
  const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS + 1;
  if (days < 1 || days > REKAP_MAX_DAYS) throw invalid();
  const uid = params.get("uid") || undefined;
  const now = ctx.deps.now();
  const [rows, requests] = await Promise.all([
    rekapShifts(ctx.env.DB, { from, to, uid }),
    approvedRequestsInRange(ctx.env.DB, { from, to, uid }),
  ]);
  return {
    rows: rows.map((row) => {
      const view = toShiftView(row, now);
      return {
        shiftId: row.id, uid: row.uid, name: row.name, workDate: row.work_date, masukAt: row.masuk_at,
        pulangAt: view.pulangAt, durationMin: view.durationMin, status: view.status, areaName: row.area_name ?? null,
        masukPhotoId: row.masuk_photo_id, pulangPhotoId: row.pulang_photo_id ?? null,
      };
    }),
    requests: requests.map(toRequestView),
  };
}

export async function listPengajuanAdmin(ctx) {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get("status") || "all";
  if (!REQUEST_FILTERS.has(status)) throw invalid();
  const [rows, pendingCount] = await Promise.all([
    listAdminRequests(ctx.env.DB, { status }),
    countPendingRequests(ctx.env.DB),
  ]);
  return {
    requests: rows.map(toRequestView),
    pendingCount,
  };
}

export async function reviewPengajuanAdmin(ctx) {
  const admin = await requireAdmin(ctx);
  const id = ctx.params[0];
  const body = await readJson(ctx.request);
  if (body.action !== "approve" && body.action !== "reject") throw invalid();
  const note = typeof body.note === "string" ? body.note.trim() : "";
  if (note.length > 300) throw invalid();

  const existing = await getRequestById(ctx.env.DB, id);
  if (!existing) throw new AbsensiError("NOT_FOUND", 404);

  const now = ctx.deps.now();
  const nextStatus = body.action === "approve" ? "approved" : "rejected";
  const changed = await reviewRequest(ctx.env.DB, id, {
    status: nextStatus,
    reviewedBy: admin.uid,
    reviewedAt: now,
    reviewNote: note || null,
  });
  if (changed === 0) throw new AbsensiError("SUDAH_DIPROSES", 409);

  const updated = await getRequestById(ctx.env.DB, id);
  const approved = nextStatus === "approved";
  const kindTitle = requestKindTitle(updated);
  const detail = requestDetailSummary(updated);
  const noteSuffix = note ? ` Catatan admin: "${note}"` : "";

  await insertNotifications(ctx.env.DB, [{
    recipientUid: updated.uid,
    kind: approved ? "pengajuan_disetujui" : "pengajuan_ditolak",
    title: `${kindTitle} ${approved ? "Disetujui" : "Ditolak"}`,
    body: `${detail} telah ${approved ? "disetujui" : "ditolak"} oleh ${admin.name}.${noteSuffix}`,
    requestId: updated.id,
    createdAt: now,
  }]);

  return toRequestView(updated);
}

export async function getFoto(ctx) {
  await requireAdmin(ctx);
  const photo = await getPhoto(ctx.env.PHOTOS, ctx.params[0]);
  if (!photo) throw new AbsensiError("FOTO_TIDAK_ADA", 404);
  return new Response(photo.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}

export async function listKaryawan(ctx) {
  await requireAdmin(ctx);
  return { employees: (await listEmployees(ctx.env.DB)).map(employeeView) };
}

export async function createKaryawan(ctx) {
  const admin = await requireAdmin(ctx);
  const body = await readJson(ctx.request);
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  const valid = name.length >= 1 && name.length <= 100 && EMAIL.test(email)
    && typeof body.password === "string" && body.password.length >= MIN_PASSWORD_LENGTH
    && ROLES.has(body.role) && typeof body.faceRequired === "boolean";
  if (!valid) throw invalid();

  const { identity } = ctx.deps;
  const uid = await identity.createAuthUser({ email, password: body.password, displayName: name });
  try {
    await identity.setClaims(uid, { absensi_role: body.role });
    await insertEmployee(ctx.env.DB, { uid, name, email, role: body.role, faceRequired: body.faceRequired, createdAt: ctx.deps.now(), createdBy: admin.uid });
  } catch (err) {
    // Jangan tinggalkan akun Auth aktif yang tidak tercatat sebagai karyawan.
    await identity.setAuthDisabled(uid, true).catch(() => {});
    throw err;
  }
  return employeeView(await getEmployee(ctx.env.DB, uid));
}

export async function patchKaryawan(ctx) {
  const admin = await requireAdmin(ctx);
  const body = await readJson(ctx.request);
  const uid = ctx.params[0];
  const target = await getEmployee(ctx.env.DB, uid);
  if (!target) throw new AbsensiError("NOT_FOUND", 404);
  const { identity } = ctx.deps;

  switch (body.action) {
    case "nonaktifkan":
      if (uid === admin.uid) throw new AbsensiError("TIDAK_BISA_DIRI_SENDIRI", 400);
      await setEmployeeStatus(ctx.env.DB, uid, "nonaktif");
      await identity.setAuthDisabled(uid, true);
      break;
    case "aktifkan":
      await setEmployeeStatus(ctx.env.DB, uid, "aktif");
      await identity.setAuthDisabled(uid, false);
      break;
    case "reset_perangkat": {
      const { referencePhotoId } = await resetEmployeeDevice(ctx.env.DB, uid);
      if (referencePhotoId) await deletePhoto(ctx.env.PHOTOS, referencePhotoId);
      break;
    }
    case "set_face_required":
      if (typeof body.faceRequired !== "boolean") throw invalid();
      await setFaceRequired(ctx.env.DB, uid, body.faceRequired);
      // Jika cek wajah baru dinyalakan untuk karyawan yang dulu aktivasi tanpa deskriptor wajah,
      // reset aktivasi agar karyawan merekam wajah acuan saat masuk berikutnya.
      if (body.faceRequired && target.activated_at !== null && !target.face_descriptor) {
        const { referencePhotoId } = await resetEmployeeDevice(ctx.env.DB, uid);
        if (referencePhotoId) await deletePhoto(ctx.env.PHOTOS, referencePhotoId);
      }
      break;
    default:
      throw invalid();
  }
  return employeeView(await getEmployee(ctx.env.DB, uid));
}

export async function getArea(ctx) {
  await requireAdmin(ctx);
  return { areas: await listAreas(ctx.env.DB) };
}

function parseArea(area) {
  const name = typeof area?.name === "string" ? area.name.trim() : "";
  const polygon = Array.isArray(area?.polygon) ? area.polygon : [];
  const pointsOk = polygon.length >= 3 && polygon.length <= 50 && polygon.every((p) =>
    Number.isFinite(p?.lat) && Number.isFinite(p?.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180);
  const toleranceOk = Number.isFinite(area?.toleranceM) && area.toleranceM >= 0 && area.toleranceM <= MAX_TOLERANCE_M;
  if (!name || name.length > 100 || !pointsOk || !toleranceOk) throw invalid();
  return {
    id: typeof area.id === "string" && area.id ? area.id : undefined,
    name,
    polygon: polygon.map(({ lat, lng }) => ({ lat, lng })),
    toleranceM: area.toleranceM,
    active: area.active !== false,
  };
}

export async function putArea(ctx) {
  const admin = await requireAdmin(ctx);
  const body = await readJson(ctx.request);
  if (!Array.isArray(body.areas) || body.areas.length > 20) throw invalid();
  await replaceAreas(ctx.env.DB, body.areas.map(parseArea), admin.uid, ctx.deps.now());
  return { areas: await listAreas(ctx.env.DB) };
}
