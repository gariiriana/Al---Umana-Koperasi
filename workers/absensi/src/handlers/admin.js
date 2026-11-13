// Endpoint admin_absensi: hari ini, rekap, pengajuan, foto, karyawan, area.
import { MAX_TOLERANCE_M, MIN_PASSWORD_LENGTH, REKAP_MAX_DAYS } from "../../shared/constants.js";
import { groupSilahHistory, isSilahOn, normalizeSilahDays, parseSilahDays, silahDaysOn } from "../../shared/silah.js";
import { workDateWIB } from "../../shared/time.js";
import { reviewRequestAs, reviewSilahAs, reviewZoneAs } from "../approval.js";
import {
  approvedRequestsInRange, countPendingApprovals, deletePhoto, getEmployee, getPhoto, getUnit,
  insertEmployee, insertUnit, listAdminRequests, listAreas, listEmployees, listUnits, listSilahExceptions, listZoneExceptions,
  listSilahHistory, rekapShifts, replaceAreas, resetEmployeeDevice, setEmployeeStatus, setEmployeeUnit, setFaceRequired, setSilah,
  todayOverview, updateUnit,
} from "../db.js";
import { AbsensiError, readJson } from "../http.js";
import { DAY_MS, parseIsoDate, toRequestView, toSilahExceptionView, toZoneExceptionView } from "../requests.js";
import { requireEmployee } from "../session.js";
import { toShiftView } from "../shifts.js";

const ROLES = new Set(["absen_karyawan", "admin_absensi"]);
const REQUEST_FILTERS = new Set(["pending", "approved", "rejected", "all"]);
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const invalid = () => new AbsensiError("VALIDATION_ERROR", 400);

const requireAdmin = (ctx) => requireEmployee(ctx, { role: "admin_absensi" });

const employeeView = (row, silahDays = []) => ({
  uid: row.uid,
  name: row.name,
  email: row.email,
  role: row.role,
  status: row.status,
  faceRequired: row.face_required === 1,
  activated: row.activated_at !== null,
  referencePhotoId: row.reference_photo_id,
  unitId: row.unit_id ?? null,
  silahDays,
  createdAt: row.created_at,
});

/** Map uid → hari Silah yang berlaku hari ini (WIB). */
async function currentSilahByUid(ctx, uid) {
  const today = workDateWIB(ctx.deps.now());
  const history = groupSilahHistory(await listSilahHistory(ctx.env.DB, { to: today, uid }));
  return new Map([...history].map(([key, entries]) => [key, silahDaysOn(entries, today)]));
}

async function employeeViewByUid(ctx, uid) {
  const silah = await currentSilahByUid(ctx, uid);
  return employeeView(await getEmployee(ctx.env.DB, uid), silah.get(uid) ?? []);
}

const unitView = (row) => ({
  id: row.id,
  name: row.name,
  headUid: row.head_uid ?? null,
  headName: row.head_name ?? null,
  memberCount: Number(row.member_count ?? 0),
});

const STATE = { terbuka: "masuk", selesai: "pulang", lupa_pulang: "tidak_clock_out" };

export async function getHariIni(ctx) {
  await requireAdmin(ctx);
  const now = ctx.deps.now();
  const date = workDateWIB(now);
  const [overviewRows, approvedToday, silahRows] = await Promise.all([
    todayOverview(ctx.env.DB, date),
    approvedRequestsInRange(ctx.env.DB, { from: date, to: date }),
    listSilahHistory(ctx.env.DB, { to: date }),
  ]);
  const silahHistory = groupSilahHistory(silahRows);

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
      people.get(row.uid).views.push(toShiftView({ ...row, id: row.shift_id }, now));
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
      lateReason: shown?.lateReason ?? null,
      latePhotoId: shown?.latePhotoId ?? null,
      zoneMasuk: shown?.zoneMasuk ?? null,
      zonePulang: shown?.zonePulang ?? null,
      silahMasuk: shown?.silahMasuk ?? null,
      leaveType: leaveByUid.get(uid) ?? null,
      shiftSwap: swapByUid.get(uid) ?? null,
      silah: isSilahOn(silahHistory.get(uid) ?? [], date),
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
  const [rows, requests, silahRows] = await Promise.all([
    rekapShifts(ctx.env.DB, { from, to, uid }),
    approvedRequestsInRange(ctx.env.DB, { from, to, uid }),
    listSilahHistory(ctx.env.DB, { to, uid }),
  ]);
  return {
    rows: rows.map((row) => {
      const view = toShiftView(row, now);
      return {
        shiftId: row.id, uid: row.uid, name: row.name, workDate: row.work_date, masukAt: row.masuk_at,
        pulangAt: view.pulangAt, durationMin: view.durationMin, status: view.status, areaName: row.area_name ?? null,
        masukPhotoId: row.masuk_photo_id, pulangPhotoId: row.pulang_photo_id ?? null,
        lateReason: view.lateReason, latePhotoId: view.latePhotoId,
        zoneMasuk: view.zoneMasuk, zonePulang: view.zonePulang, silahMasuk: view.silahMasuk,
      };
    }),
    requests: requests.map(toRequestView),
    // Riwayat jadwal Silah; layar & export menurunkan hari Silah per tanggal darinya.
    silah: silahRows.map((row) => ({ uid: row.uid, name: row.name, effectiveFrom: row.effective_from, days: parseSilahDays(row.days) })),
    today: workDateWIB(now),
  };
}

export async function listPengajuanAdmin(ctx) {
  await requireAdmin(ctx);
  const status = ctx.url.searchParams.get("status") || "all";
  if (!REQUEST_FILTERS.has(status)) throw invalid();
  const [rows, zoneExceptions, silahExceptions, pendingCount] = await Promise.all([
    listAdminRequests(ctx.env.DB, { status }),
    listZoneExceptions(ctx.env.DB, { status }),
    listSilahExceptions(ctx.env.DB, { status }),
    countPendingApprovals(ctx.env.DB),
  ]);
  return {
    requests: rows.map(toRequestView),
    zoneExceptions: zoneExceptions.map(toZoneExceptionView),
    silahExceptions: silahExceptions.map(toSilahExceptionView),
    pendingCount,
  };
}

export async function reviewPengajuanAdmin(ctx) {
  const admin = await requireAdmin(ctx);
  return reviewRequestAs(ctx, admin, ctx.params[0]);
}

export async function reviewLuarZonaAdmin(ctx) {
  const admin = await requireAdmin(ctx);
  return reviewZoneAs(ctx, admin, ctx.params[0]);
}

export async function reviewSilahAdmin(ctx) {
  const admin = await requireAdmin(ctx);
  return reviewSilahAs(ctx, admin, ctx.params[0]);
}

export async function getFoto(ctx) {
  await requireAdmin(ctx);
  const photo = await getPhoto(ctx.env.PHOTOS, ctx.params[0]);
  if (!photo) throw new AbsensiError("FOTO_TIDAK_ADA", 404);
  return new Response(photo.jpeg, { headers: { "content-type": "image/jpeg", "cache-control": "private, max-age=86400" } });
}

export async function listKaryawan(ctx) {
  await requireAdmin(ctx);
  const [rows, silah] = await Promise.all([listEmployees(ctx.env.DB), currentSilahByUid(ctx)]);
  return { employees: rows.map((row) => employeeView(row, silah.get(row.uid) ?? [])) };
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
  return employeeViewByUid(ctx, uid);
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
    case "set_unit": {
      // Pindah unit = kepala unit yang menyetujui ikut berganti.
      const unitId = body.unitId === null || body.unitId === "" ? null : String(body.unitId ?? "");
      if (unitId !== null && !(await getUnit(ctx.env.DB, unitId))) throw invalid();
      await setEmployeeUnit(ctx.env.DB, uid, unitId);
      break;
    }
    case "set_silah": {
      // Berlaku mulai hari ini (WIB); hari-hari sebelumnya tetap memakai jadwal lama di rekap.
      const days = normalizeSilahDays(body.silahDays);
      if (!days || target.role !== "absen_karyawan") throw invalid();
      await setSilah(ctx.env.DB, { uid, days, effectiveFrom: workDateWIB(ctx.deps.now()), nowMs: ctx.deps.now(), byUid: admin.uid });
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
  return employeeViewByUid(ctx, uid);
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

// ---------------------------------------------------------------------------
// Unit kerja & kepala unit
// ---------------------------------------------------------------------------

export async function getUnits(ctx) {
  await requireAdmin(ctx);
  return { units: (await listUnits(ctx.env.DB)).map(unitView) };
}

async function parseUnitBody(ctx, body) {
  const name = typeof body.name === "string" ? body.name.replace(/\s+/g, " ").trim() : "";
  if (!name || name.length > 60) throw invalid();
  let headUid = null;
  if (body.headUid !== undefined && body.headUid !== null && body.headUid !== "") {
    const head = await getEmployee(ctx.env.DB, String(body.headUid));
    if (!head || head.role !== "absen_karyawan" || head.status !== "aktif") throw invalid();
    headUid = head.uid;
  }
  return { name, headUid };
}

function duplicateName(err) {
  if (/UNIQUE/i.test(String(err?.message))) throw new AbsensiError("UNIT_SUDAH_ADA", 409);
  throw err;
}

export async function createUnit(ctx) {
  const admin = await requireAdmin(ctx);
  const { name, headUid } = await parseUnitBody(ctx, await readJson(ctx.request));
  const id = crypto.randomUUID();
  await insertUnit(ctx.env.DB, { id, name, headUid, nowMs: ctx.deps.now(), byUid: admin.uid }).catch(duplicateName);
  return getUnits(ctx);
}

export async function patchUnit(ctx) {
  const admin = await requireAdmin(ctx);
  const id = ctx.params[0];
  if (!(await getUnit(ctx.env.DB, id))) throw new AbsensiError("NOT_FOUND", 404);
  const { name, headUid } = await parseUnitBody(ctx, await readJson(ctx.request));
  await updateUnit(ctx.env.DB, id, { name, headUid, nowMs: ctx.deps.now(), byUid: admin.uid }).catch(duplicateName);
  return getUnits(ctx);
}
