// Endpoint untuk akun absensi sendiri: profil, aktivasi, clock in/out, riwayat, pengajuan, notifikasi.
import { CHALLENGE_TTL_MS, FACE_MATCH_THRESHOLD, LATE_REASON_MAX, LATE_REASON_MIN, MAX_LATE_PHOTO_BYTES } from "../../shared/constants.js";
import { checkLocation } from "../../shared/geo.js";
import { groupSilahHistory, isSilahOn } from "../../shared/silah.js";
import { isLateClockIn, workDateWIB } from "../../shared/time.js";
import {
  activateEmployee, closeShift, consumeChallenge, countPendingApprovals, countUnreadNotifications, createChallenge,
  deletePhoto, deleteShiftsForReset, getEmployee, getRequestById, getUnit, insertNotifications, insertPasskey, insertPhoto,
  insertRequest, insertShift, insertZoneException, listActiveEmployeesByRole, listAreas, listEmployeeRequests, listSilahHistory,
  listNotifications, listPasskeys, markAllNotificationsRead, markNotificationRead, recentShifts, requestsForMonth,
  resetShiftPulangForSimulasi, shiftsForMonth, unitsHeadedBy,
} from "../db.js";
import { approverRecipients, jamWIB, zoneKindLabel } from "../approval.js";
import { AbsensiError, decodeJpeg, readJson } from "../http.js";
import { DAY_MS, LEAVE_LABEL, parseIsoDate, requestDetailSummary, requestKindTitle, toNotificationView, toRequestView } from "../requests.js";
import { requireEmployee } from "../session.js";
import { decideAbsen, shiftStatus, toShiftView } from "../shifts.js";

const KINDS = new Set(["masuk", "pulang"]);
const REQUEST_KINDS = new Set(["cuti", "pergantian_shift"]);
const LEAVE_TYPES = new Set(["cuti", "sakit", "izin"]);

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DESCRIPTOR_LENGTH = 128;
const ABSEN_BODY_MAX_CHARS = 1_000_000;
const MAX_LEAVE_DAYS = 120;

function randomNonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return { bytes, nonce: Buffer.from(bytes).toString("base64url") };
}

function parseLocation(location) {
  const { lat, lng, accuracy } = location || {};
  const valid = [lat, lng, accuracy].every(Number.isFinite) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
  if (!valid) throw new AbsensiError("VALIDATION_ERROR", 400);
  return { lat, lng, accuracy };
}

/** Lokasi harus di dalam salah satu area aktif; selain itu 422 dengan kode dari shared/geo. */
async function requireInsideArea(ctx, location) {
  const result = checkLocation(location, await listAreas(ctx.env.DB, { activeOnly: true }));
  if (!result.ok) throw new AbsensiError(result.code, 422, { distanceM: result.distanceM });
  return result;
}

/**
 * Lokasi clock in/out. Di luar zona hanya boleh kalau ada alasan; absen itu lalu menunggu
 * persetujuan kepala unit / admin absensi. GPS lemah atau belum ada area tetap ditolak.
 */
async function absenLocation(ctx, location, outsideReason) {
  const result = checkLocation(location, await listAreas(ctx.env.DB, { activeOnly: true }));
  if (result.ok) return { areaId: result.areaId, outside: null };
  if (result.code === "DI_LUAR_AREA" && outsideReason) {
    return { areaId: null, outside: { distanceM: result.distanceM ?? null } };
  }
  throw new AbsensiError(result.code, 422, { distanceM: result.distanceM });
}

/** Hari ini (WIB) jadwal Silah karyawan ini. */
async function isSilahToday(ctx, employee, now) {
  if (employee.role !== "absen_karyawan") return false;
  const today = workDateWIB(now);
  const history = groupSilahHistory(await listSilahHistory(ctx.env.DB, { to: today, uid: employee.uid }));
  return isSilahOn(history.get(employee.uid) ?? [], today);
}

/** Clock in di hari Silah ditolak; karyawan diminta menghubungi admin untuk mengubah jadwal Silah. Clock out tetap boleh. */
async function rejectClockInOnSilah(ctx, employee, kind, now) {
  if (kind === "masuk" && (await isSilahToday(ctx, employee, now))) throw new AbsensiError("HARI_SILAH", 409);
}

export async function meView(ctx, employee) {
  const now = ctx.deps.now();
  const faceRequired = employee.face_required === 1;
  const isAdmin = employee.role === "admin_absensi";
  const [shifts, areas, unreadNotifications, headOf, unit, silahToday] = await Promise.all([
    recentShifts(ctx.env.DB, employee.uid),
    listAreas(ctx.env.DB, { activeOnly: true }),
    countUnreadNotifications(ctx.env.DB, employee.uid),
    unitsHeadedBy(ctx.env.DB, employee.uid),
    employee.unit_id ? getUnit(ctx.env.DB, employee.unit_id) : Promise.resolve(null),
    isSilahToday(ctx, employee, now),
  ]);
  const [pendingRequests, teamPending] = await Promise.all([
    isAdmin ? countPendingApprovals(ctx.env.DB) : Promise.resolve(0),
    headOf.length > 0 ? countPendingApprovals(ctx.env.DB, { teamOf: employee.uid }) : Promise.resolve(0),
  ]);
  return {
    uid: employee.uid,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    faceRequired,
    activated: employee.activated_at !== null,
    status: shiftStatus(shifts, now),
    areas,
    faceDescriptor: faceRequired && employee.face_descriptor ? JSON.parse(employee.face_descriptor) : null,
    unreadNotifications,
    pendingRequests,
    unit: unit ? { id: unit.id, name: unit.name } : null,
    headOf: headOf.map((u) => ({ id: u.id, name: u.name })),
    teamPending,
    silahToday,
  };
}

export async function getMe(ctx) {
  return meView(ctx, await requireEmployee(ctx));
}

export async function activateOptions(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  if (employee.activated_at !== null) throw new AbsensiError("SUDAH_AKTIVASI", 409);
  const { bytes, nonce } = randomNonce();
  const challengeId = await createChallenge(ctx.env.DB, {
    uid: employee.uid, purpose: "activate", kind: null, nonce, expiresAt: ctx.deps.now() + CHALLENGE_TTL_MS,
  });
  const optionsJSON = await ctx.deps.webauthn.registrationOptions({
    rpId: ctx.env.RP_ID,
    userId: employee.uid,
    userName: employee.email,
    userDisplayName: employee.name,
    excludeIds: (await listPasskeys(ctx.env.DB, employee.uid)).map((p) => p.credential_id),
    challenge: bytes,
  });
  return { challengeId, optionsJSON };
}

export async function activate(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  const body = await readJson(ctx.request);
  if (employee.activated_at !== null) throw new AbsensiError("SUDAH_AKTIVASI", 409);
  if (body.consent !== true) throw new AbsensiError("VALIDATION_ERROR", 400);

  const now = ctx.deps.now();
  const challenge = await consumeChallenge(ctx.env.DB, String(body.challengeId || ""), employee.uid, "activate", now);
  if (!challenge) throw new AbsensiError("CHALLENGE_INVALID", 400);

  await requireInsideArea(ctx, parseLocation(body.location));
  const jpeg = decodeJpeg(body.reference?.jpegBase64);

  let descriptor = null;
  if (employee.face_required === 1) {
    descriptor = body.reference?.descriptor;
    const valid = Array.isArray(descriptor) && descriptor.length === DESCRIPTOR_LENGTH && descriptor.every(Number.isFinite);
    if (!valid) throw new AbsensiError("DESKRIPTOR_TIDAK_VALID", 400);
  }

  const credential = await ctx.deps.webauthn.verifyRegistration({
    response: body.registration, expectedChallenge: challenge.nonce, origin: ctx.env.EXPECTED_ORIGIN, rpId: ctx.env.RP_ID,
  });
  if (!credential) throw new AbsensiError("PASSKEY_TIDAK_VALID", 400);

  const photoId = crypto.randomUUID();
  try {
    await insertPasskey(ctx.env.DB, { ...credential, uid: employee.uid, createdAt: now });
  } catch (err) {
    if (/UNIQUE/i.test(String(err?.message))) throw new AbsensiError("PASSKEY_TIDAK_VALID", 400);
    throw err;
  }
  await insertPhoto(ctx.env.PHOTOS, { id: photoId, uid: employee.uid, kind: "acuan", jpeg, createdAt: now });
  await activateEmployee(ctx.env.DB, employee.uid, { faceDescriptor: descriptor, referencePhotoId: photoId, consentAt: now, activatedAt: now });
  return meView(ctx, await getEmployee(ctx.env.DB, employee.uid));
}

async function requireActivatedEmployee(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  if (employee.activated_at === null) throw new AbsensiError("BELUM_AKTIVASI", 409);
  return employee;
}

function parseKind(body) {
  if (!KINDS.has(body.kind)) throw new AbsensiError("VALIDATION_ERROR", 400);
  return body.kind;
}

/**
 * Alasan clock in lewat 08:00. Opsional di server supaya aplikasi versi lama (belum klik "Perbarui")
 * tetap bisa absen; aplikasi baru mewajibkannya lewat pop-up.
 */
function parseLateReason(body) {
  if (body.lateReason === undefined || body.lateReason === null) return null;
  if (typeof body.lateReason !== "string") throw new AbsensiError("VALIDATION_ERROR", 400);
  const reason = body.lateReason.replace(/\s+/g, " ").trim();
  if (reason.length > LATE_REASON_MAX) throw new AbsensiError("VALIDATION_ERROR", 400);
  return reason || null;
}

/** Alasan absen di luar zona (3–300 karakter). Tanpa alasan, absen di luar zona tetap ditolak seperti dulu. */
function parseOutsideReason(body) {
  if (body.outsideReason === undefined || body.outsideReason === null) return null;
  if (typeof body.outsideReason !== "string") throw new AbsensiError("VALIDATION_ERROR", 400);
  const reason = body.outsideReason.replace(/\s+/g, " ").trim();
  if (reason.length < LATE_REASON_MIN || reason.length > LATE_REASON_MAX) throw new AbsensiError("VALIDATION_ERROR", 400);
  return reason;
}

/** Foto bukti alasan terlambat (opsional di server, sama seperti alasannya). Dicek sebelum challenge terpakai. */
function parseLatePhoto(body) {
  if (body.latePhotoBase64 === undefined || body.latePhotoBase64 === null) return null;
  return decodeJpeg(body.latePhotoBase64, { maxBytes: MAX_LATE_PHOTO_BYTES, code: "FOTO_ALASAN_TIDAK_VALID" });
}

async function currentDecision(ctx, employee, kind, now) {
  const decision = decideAbsen(kind, shiftStatus(await recentShifts(ctx.env.DB, employee.uid), now), now);
  if (!decision.ok) throw new AbsensiError(decision.code, 409);
  return decision;
}

export async function absenOptions(ctx) {
  const employee = await requireActivatedEmployee(ctx);
  const kind = parseKind(await readJson(ctx.request));
  const now = ctx.deps.now();
  await rejectClockInOnSilah(ctx, employee, kind, now);
  await currentDecision(ctx, employee, kind, now);
  const { nonce } = randomNonce();
  const challengeId = await createChallenge(ctx.env.DB, {
    uid: employee.uid, purpose: "absen", kind, nonce, expiresAt: now + CHALLENGE_TTL_MS,
  });
  // rpId + allowCredentials hanya untuk aplikasi versi lama (belum "Perbarui") yang masih minta sidik jari.
  const passkeys = await listPasskeys(ctx.env.DB, employee.uid);
  return {
    challengeId,
    nonce,
    rpId: ctx.env.RP_ID,
    allowCredentials: passkeys.map((p) => ({ id: p.credential_id, transports: JSON.parse(p.transports || "[]") })),
  };
}

/**
 * Clock in / clock out. Urutan cek mengikuti spec bagian 6; waktu selalu dari server.
 * Tanpa sidik jari/Face ID (passkey) sejak 2026-11-12: identitas = login + challenge sekali pakai + selfie/cek wajah
 * + lokasi. `authentication` dari aplikasi versi lama diabaikan.
 */
export async function absen(ctx) {
  const employee = await requireActivatedEmployee(ctx);
  // Selfie (≤200 KB) + foto alasan (≤300 KB) dalam base64.
  const body = await readJson(ctx.request, ABSEN_BODY_MAX_CHARS);
  const kind = parseKind(body);
  const lateReason = kind === "masuk" ? parseLateReason(body) : null;
  const latePhoto = kind === "masuk" ? parseLatePhoto(body) : null;
  const outsideReason = parseOutsideReason(body);
  const now = ctx.deps.now();
  const { env } = ctx;
  await rejectClockInOnSilah(ctx, employee, kind, now);

  const challenge = await consumeChallenge(env.DB, String(body.challengeId || ""), employee.uid, "absen", now);
  if (!challenge || challenge.kind !== kind) throw new AbsensiError("CHALLENGE_INVALID", 400);

  const location = parseLocation(body.location);
  const jpeg = decodeJpeg(body.selfieBase64);

  const area = await absenLocation(ctx, location, outsideReason);
  const country = ctx.deps.country(ctx.request);
  if (env.ENFORCE_COUNTRY && country && country !== env.ENFORCE_COUNTRY) throw new AbsensiError("NEGARA_TIDAK_VALID", 422);

  const faceDistance = Number.isFinite(body.faceDistance) ? body.faceDistance : null;
  const needFace = employee.face_required === 1 && Boolean(employee.face_descriptor);
  if (needFace && !(faceDistance !== null && faceDistance >= 0 && faceDistance < FACE_MATCH_THRESHOLD)) {
    throw new AbsensiError("WAJAH_TIDAK_COCOK", 422);
  }

  const decision = await currentDecision(ctx, employee, kind, now);
  const photoId = crypto.randomUUID();
  const fields = { ...location, areaId: area.areaId, faceDistance, photoId };
  // Alasan & foto alasan hanya disimpan kalau menurut jam server clock in-nya memang lewat 08:00.
  const late = decision.action === "insert" && isLateClockIn(now);
  const latePhotoId = late && latePhoto ? crypto.randomUUID() : null;
  const shiftId = decision.action === "insert" ? crypto.randomUUID() : decision.shiftId;
  if (decision.action === "insert") {
    try {
      await insertShift(env.DB, {
        id: shiftId, uid: employee.uid, workDate: decision.workDate, masukAt: now, ...fields,
        lateReason: late ? lateReason : null,
        latePhotoId,
      });
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw new AbsensiError("SUDAH_CLOCK_IN_HARI_INI", 409);
      throw err;
    }
  } else if ((await closeShift(env.DB, decision.shiftId, { pulangAt: now, ...fields })) === 0) {
    throw new AbsensiError("BELUM_CLOCK_IN", 409);
  }
  await insertPhoto(env.PHOTOS, { id: photoId, uid: employee.uid, kind: "selfie", jpeg, createdAt: now });
  if (latePhotoId) {
    // kind "selfie" = foto absen dengan retensi 90 hari (cron purgeSelfies).
    await insertPhoto(env.PHOTOS, { id: latePhotoId, uid: employee.uid, kind: "selfie", jpeg: latePhoto, createdAt: now });
  }
  if (area.outside) {
    await recordOutsideZone(ctx, employee, {
      shiftId, kind, now, location, photoId, reason: outsideReason, distanceM: area.outside.distanceM,
    });
  }

  return { serverTime: now, status: shiftStatus(await recentShifts(env.DB, employee.uid), now) };
}

/** Simpan absen luar zona (status menunggu) dan kabari kepala unit + admin absensi. */
async function recordOutsideZone(ctx, employee, { shiftId, kind, now, location, photoId, reason, distanceM }) {
  const { DB } = ctx.env;
  await insertZoneException(DB, {
    id: crypto.randomUUID(), shiftId, uid: employee.uid, kind, at: now, ...location, distanceM, reason, photoId, createdAt: now,
  });
  const jarak = distanceM === null ? "" : ` sekitar ${Math.round(distanceM)} m dari zona`;
  const recipients = await approverRecipients(DB, employee.uid);
  await insertNotifications(DB, recipients.map((person) => ({
    recipientUid: person.uid,
    kind: "pengajuan_baru",
    title: "Absen Luar Zona Perlu Persetujuan",
    body: `${employee.name} ${zoneKindLabel(kind).toLowerCase()} pukul ${jamWIB(now)} WIB di luar zona${jarak}: "${reason}"`,
    requestId: null,
    createdAt: now,
  })));
}

export async function getRiwayat(ctx) {
  const employee = await requireEmployee(ctx);
  const bulan = ctx.url.searchParams.get("bulan") || "";
  if (!BULAN.test(bulan)) throw new AbsensiError("VALIDATION_ERROR", 400);
  const now = ctx.deps.now();
  const [rows, requests] = await Promise.all([
    shiftsForMonth(ctx.env.DB, employee.uid, bulan),
    requestsForMonth(ctx.env.DB, employee.uid, bulan),
  ]);
  return {
    rows: rows.map((row) => toShiftView(row, now)),
    requests: requests.map(toRequestView),
  };
}

export async function getRekan(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  const coworkers = (await listActiveEmployeesByRole(ctx.env.DB, "absen_karyawan"))
    .filter((row) => row.uid !== employee.uid)
    .map((row) => ({ uid: row.uid, name: row.name }));
  return { coworkers };
}

export async function listPengajuan(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  const rows = await listEmployeeRequests(ctx.env.DB, employee.uid);
  return { requests: rows.map(toRequestView) };
}

export async function createPengajuan(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  const body = await readJson(ctx.request);
  if (!REQUEST_KINDS.has(body.kind)) throw new AbsensiError("VALIDATION_ERROR", 400);

  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (reason.length < 2 || reason.length > 500) throw new AbsensiError("VALIDATION_ERROR", 400);

  let leaveType = null;
  let leaveSubtype = null;
  let attachmentName = null;
  let startDate;
  let endDate;
  let fromShift = null;
  let toShift = null;
  let partnerUid = null;
  let partnerName = null;

  if (body.partnerUid) {
    const partner = await getEmployee(ctx.env.DB, String(body.partnerUid));
    if (!partner || partner.role !== "absen_karyawan" || partner.status !== "aktif" || partner.uid === employee.uid) {
      throw new AbsensiError("VALIDATION_ERROR", 400);
    }
    partnerUid = partner.uid;
    partnerName = partner.name;
  }

  if (body.kind === "cuti") {
    if (!LEAVE_TYPES.has(body.leaveType)) throw new AbsensiError("VALIDATION_ERROR", 400);
    leaveType = body.leaveType;
    if (typeof body.leaveSubtype === "string" && body.leaveSubtype.trim().length > 0) {
      leaveSubtype = body.leaveSubtype.trim().slice(0, 150);
    }
    if (typeof body.attachmentName === "string" && body.attachmentName.trim().length > 0) {
      attachmentName = body.attachmentName.trim().slice(0, 200);
    }
    startDate = parseIsoDate(body.startDate);
    endDate = parseIsoDate(body.endDate ?? body.startDate);
    const spanDays = (Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS + 1;
    if (spanDays < 1 || spanDays > MAX_LEAVE_DAYS) throw new AbsensiError("VALIDATION_ERROR", 400);
  } else {
    startDate = parseIsoDate(body.date ?? body.startDate);
    endDate = startDate;
    fromShift = typeof body.fromShift === "string" ? body.fromShift.trim() : "";
    toShift = typeof body.toShift === "string" ? body.toShift.trim() : "";
    if (!fromShift || fromShift.length > 100 || !toShift || toShift.length > 100 || fromShift === toShift) {
      throw new AbsensiError("VALIDATION_ERROR", 400);
    }
  }

  const now = ctx.deps.now();
  const id = crypto.randomUUID();
  await insertRequest(ctx.env.DB, {
    id, uid: employee.uid, kind: body.kind, leaveType, leaveSubtype, startDate, endDate,
    fromShift, toShift, partnerUid, partnerName, attachmentName, reason, createdAt: now,
  });

  const saved = await getRequestById(ctx.env.DB, id);
  // Admin absensi + kepala unit karyawan ini yang bisa menyetujui.
  const approvers = await approverRecipients(ctx.env.DB, employee.uid);
  const title = `${requestKindTitle(saved)} Baru`;
  const detail = requestDetailSummary(saved);
  await insertNotifications(ctx.env.DB, approvers.map((approver) => ({
    recipientUid: approver.uid,
    kind: "pengajuan_baru",
    title,
    body: `${employee.name} mengajukan ${LEAVE_LABEL[leaveType] ? detail : `pergantian shift (${detail})`} — "${reason}"`,
    requestId: id,
    createdAt: now,
  })));

  return toRequestView(saved);
}

export async function getNotifikasi(ctx) {
  const employee = await requireEmployee(ctx);
  const [unreadCount, rows] = await Promise.all([
    countUnreadNotifications(ctx.env.DB, employee.uid),
    listNotifications(ctx.env.DB, employee.uid, 50),
  ]);
  return {
    unreadCount,
    notifications: rows.map(toNotificationView),
  };
}

export async function bacaNotifikasi(ctx) {
  const employee = await requireEmployee(ctx);
  const body = await readJson(ctx.request).catch(() => ({}));
  const now = ctx.deps.now();
  if (typeof body?.id === "string" && body.id.trim()) {
    await markNotificationRead(ctx.env.DB, employee.uid, body.id.trim(), now);
  } else {
    await markAllNotificationsRead(ctx.env.DB, employee.uid, now);
  }
  const unreadCount = await countUnreadNotifications(ctx.env.DB, employee.uid);
  return { unreadCount };
}

const SIMULATION_EMAIL = "gariiriana14@gmail.com";

export function isSimulationAccount(employee) {
  return String(employee?.email || "").trim().toLowerCase() === SIMULATION_EMAIL;
}

/**
 * Reset data Clock In / Clock Out khusus untuk akun simulasi/testing (gariiriana14@gmail.com).
 * Body opsional: `{ target?: "masuk" | "pulang" | "all" }`.
 */
export async function resetSimulasi(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  if (!isSimulationAccount(employee)) throw new AbsensiError("FORBIDDEN", 403);
  const body = await readJson(ctx.request).catch(() => ({}));
  const target = body?.target === "pulang" ? "pulang" : "all";
  const now = ctx.deps.now();
  const workDate = workDateWIB(now);

  const result = target === "pulang"
    ? await resetShiftPulangForSimulasi(ctx.env.DB, employee.uid, workDate)
    : await deleteShiftsForReset(ctx.env.DB, employee.uid, workDate);

  for (const photoId of result.photoIds) {
    await deletePhoto(ctx.env.PHOTOS, photoId);
  }

  return {
    deletedCount: result.deletedCount,
    status: shiftStatus(await recentShifts(ctx.env.DB, employee.uid), now),
  };
}
