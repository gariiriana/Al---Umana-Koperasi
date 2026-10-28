// Endpoint untuk akun absensi sendiri: profil, aktivasi, clock in/out, riwayat.
import { payloadChallenge, sha256Hex } from "../../shared/binding.js";
import { CHALLENGE_TTL_MS, FACE_MATCH_THRESHOLD } from "../../shared/constants.js";
import { checkLocation } from "../../shared/geo.js";
import {
  activateEmployee, closeShift, consumeChallenge, createChallenge, getEmployee, insertPasskey, insertPhoto,
  insertShift, listAreas, listPasskeys, recentShifts, shiftsForMonth, updatePasskeyCounter,
} from "../db.js";
import { AbsensiError, decodeJpeg, readJson } from "../http.js";
import { requireEmployee } from "../session.js";
import { decideAbsen, shiftStatus, toShiftView } from "../shifts.js";

const KINDS = new Set(["masuk", "pulang"]);

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

async function currentDecision(ctx, employee, kind, now) {
  const decision = decideAbsen(kind, shiftStatus(await recentShifts(ctx.env.DB, employee.uid), now), now);
  if (!decision.ok) throw new AbsensiError(decision.code, 409);
  return decision;
}

function signedChallenge(authentication) {
  try {
    return JSON.parse(Buffer.from(authentication.response.clientDataJSON, "base64url").toString()).challenge;
  } catch {
    return null;
  }
}

export async function absenOptions(ctx) {
  const employee = await requireActivatedEmployee(ctx);
  const kind = parseKind(await readJson(ctx.request));
  const now = ctx.deps.now();
  await currentDecision(ctx, employee, kind, now);
  const { nonce } = randomNonce();
  const challengeId = await createChallenge(ctx.env.DB, {
    uid: employee.uid, purpose: "absen", kind, nonce, expiresAt: now + CHALLENGE_TTL_MS,
  });
  const passkeys = await listPasskeys(ctx.env.DB, employee.uid);
  return {
    challengeId,
    nonce,
    rpId: ctx.env.RP_ID,
    allowCredentials: passkeys.map((p) => ({ id: p.credential_id, transports: JSON.parse(p.transports || "[]") })),
  };
}

/** Clock in / clock out. Urutan cek mengikuti spec bagian 6; waktu selalu dari server. */
export async function absen(ctx) {
  const employee = await requireActivatedEmployee(ctx);
  const body = await readJson(ctx.request);
  const kind = parseKind(body);
  const now = ctx.deps.now();
  const { env } = ctx;

  const challenge = await consumeChallenge(env.DB, String(body.challengeId || ""), employee.uid, "absen", now);
  if (!challenge || challenge.kind !== kind) throw new AbsensiError("CHALLENGE_INVALID", 400);

  const location = parseLocation(body.location);
  const jpeg = decodeJpeg(body.selfieBase64);
  const expectedChallenge = await payloadChallenge({ nonce: challenge.nonce, kind, ...location, selfieSha256Hex: await sha256Hex(jpeg) });
  if (signedChallenge(body.authentication) !== expectedChallenge) throw new AbsensiError("PAYLOAD_TIDAK_COCOK", 400);

  const passkey = (await listPasskeys(env.DB, employee.uid)).find((p) => p.credential_id === body.authentication?.id);
  if (!passkey) throw new AbsensiError("PASSKEY_TIDAK_DIKENAL", 400);
  const verified = await ctx.deps.webauthn.verifyAuthentication({
    response: body.authentication,
    expectedChallenge,
    origin: env.EXPECTED_ORIGIN,
    rpId: env.RP_ID,
    credential: { id: passkey.credential_id, publicKey: passkey.public_key, counter: passkey.counter, transports: JSON.parse(passkey.transports || "[]") },
  });
  if (!verified) throw new AbsensiError("PASSKEY_TIDAK_VALID", 400);

  const area = await requireInsideArea(ctx, location);
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
  if (decision.action === "insert") {
    try {
      await insertShift(env.DB, { id: crypto.randomUUID(), uid: employee.uid, workDate: decision.workDate, masukAt: now, ...fields });
    } catch (err) {
      if (/UNIQUE/i.test(String(err?.message))) throw new AbsensiError("SUDAH_CLOCK_IN_HARI_INI", 409);
      throw err;
    }
  } else if ((await closeShift(env.DB, decision.shiftId, { pulangAt: now, ...fields })) === 0) {
    throw new AbsensiError("BELUM_CLOCK_IN", 409);
  }
  await insertPhoto(env.PHOTOS, { id: photoId, uid: employee.uid, kind: "selfie", jpeg, createdAt: now });
  await updatePasskeyCounter(env.DB, passkey.credential_id, verified.newCounter, now);

  return { serverTime: now, status: shiftStatus(await recentShifts(env.DB, employee.uid), now) };
}

export async function getRiwayat(ctx) {
  const employee = await requireEmployee(ctx);
  const bulan = ctx.url.searchParams.get("bulan") || "";
  if (!BULAN.test(bulan)) throw new AbsensiError("VALIDATION_ERROR", 400);
  const now = ctx.deps.now();
  const rows = await shiftsForMonth(ctx.env.DB, employee.uid, bulan);
  return { rows: rows.map((row) => toShiftView(row, now)) };
}
