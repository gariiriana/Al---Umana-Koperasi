// Endpoint untuk akun absensi sendiri: profil, aktivasi, clock in/out, riwayat.
import { CHALLENGE_TTL_MS } from "../../shared/constants.js";
import { checkLocation } from "../../shared/geo.js";
import {
  activateEmployee, consumeChallenge, createChallenge, getEmployee, insertPasskey, insertPhoto,
  listAreas, listPasskeys, recentShifts, shiftsForMonth,
} from "../db.js";
import { AbsensiError, decodeJpeg, readJson } from "../http.js";
import { requireEmployee } from "../session.js";
import { shiftStatus, toShiftView } from "../shifts.js";

const BULAN = /^\d{4}-(0[1-9]|1[0-2])$/;
const DESCRIPTOR_LENGTH = 128;

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

export async function meView(ctx, employee) {
  const now = ctx.deps.now();
  const faceRequired = employee.face_required === 1;
  return {
    uid: employee.uid,
    name: employee.name,
    email: employee.email,
    role: employee.role,
    faceRequired,
    activated: employee.activated_at !== null,
    status: shiftStatus(await recentShifts(ctx.env.DB, employee.uid), now),
    areas: await listAreas(ctx.env.DB, { activeOnly: true }),
    faceDescriptor: faceRequired && employee.face_descriptor ? JSON.parse(employee.face_descriptor) : null,
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
  await insertPhoto(ctx.env.PHOTOS, { id: photoId, uid: employee.uid, kind: "acuan", jpeg, createdAt: now });
  await insertPasskey(ctx.env.DB, { ...credential, uid: employee.uid, createdAt: now });
  await activateEmployee(ctx.env.DB, employee.uid, { faceDescriptor: descriptor, referencePhotoId: photoId, consentAt: now, activatedAt: now });
  return meView(ctx, await getEmployee(ctx.env.DB, employee.uid));
}

export async function getRiwayat(ctx) {
  const employee = await requireEmployee(ctx);
  const bulan = ctx.url.searchParams.get("bulan") || "";
  if (!BULAN.test(bulan)) throw new AbsensiError("VALIDATION_ERROR", 400);
  const now = ctx.deps.now();
  const rows = await shiftsForMonth(ctx.env.DB, employee.uid, bulan);
  return { rows: rows.map((row) => toShiftView(row, now)) };
}
