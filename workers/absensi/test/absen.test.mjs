import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, fakeWebauthn, JPEG_BASE64, makeEnv, T0 } from "./helpers.mjs";
import { activateEmployee, getPhoto, insertPasskey, recentShifts, replaceAreas, setSilah } from "../src/db.js";
import { payloadChallenge, sha256Hex } from "../shared/binding.js";
import { MAX_LATE_PHOTO_BYTES } from "../shared/constants.js";

// Foto alasan yang lebih besar dari batas selfie (200 KB) tapi masih di bawah batas foto alasan.
const LATE_PHOTO_BASE64 = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(250_000, 7)]).toString("base64");

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const SQ = [
  { lat: PIN.lat - 0.0001, lng: PIN.lng - 0.0001 }, { lat: PIN.lat + 0.0001, lng: PIN.lng - 0.0001 },
  { lat: PIN.lat + 0.0001, lng: PIN.lng + 0.0001 }, { lat: PIN.lat - 0.0001, lng: PIN.lng + 0.0001 },
];
const inside = { ...PIN, accuracy: 8 };
const HOUR = 3600_000;

// Passkey fake: the "signature" is valid when clientDataJSON carries the expected challenge.
const verifyAuthentication = async ({ response, expectedChallenge }) => {
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString());
  return clientData.challenge === expectedChallenge ? { newCounter: 1 } : null;
};

describe("clock in / clock out", () => {
  let env;
  let dispose;
  let now = T0;
  let country = null;
  const deps = fakeDeps({ now: () => now, country: () => country, webauthn: { ...fakeWebauthn, verifyAuthentication } });

  const options = (uid, kind) => call(env, deps, "POST", "/absen/options", { token: uid, body: { kind } });
  async function signedBody(uid, kind, over = {}) {
    const opts = await options(uid, kind);
    assert.equal(opts.status, 200, JSON.stringify(opts.data));
    const location = over.location ?? inside;
    const selfieSha256Hex = await sha256Hex(new Uint8Array(Buffer.from(JPEG_BASE64, "base64")));
    const challenge = await payloadChallenge({ nonce: opts.data.nonce, kind, ...location, selfieSha256Hex });
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost:5174" })).toString("base64url");
    return {
      challengeId: opts.data.challengeId, kind, location, selfieBase64: JPEG_BASE64, faceDistance: 0.3,
      authentication: { id: `cred-${uid}`, rawId: `cred-${uid}`, type: "public-key", response: { clientDataJSON, authenticatorData: "", signature: "" } },
      ...over,
    };
  }
  const absen = (uid, body, e = env) => call(e, deps, "POST", "/absen", { token: uid, body });

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await replaceAreas(env.DB, [{ id: "a1", name: "SPPG", polygon: SQ, toleranceM: 15, active: true }], "admin", T0);
    for (const uid of ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9", "u10", "u11", "u12", "u13", "u14", "u15", "u16"]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, faceRequired: uid !== "u2" });
      if (uid === "u3") continue;
      await activateEmployee(env.DB, uid, { faceDescriptor: [0.1], referencePhotoId: `r-${uid}`, consentAt: T0, activatedAt: T0 });
      await insertPasskey(env.DB, { credentialId: `cred-${uid}`, uid, publicKey: "pk", counter: 0, transports: ["internal"], createdAt: T0 });
    }
  });
  after(() => dispose());

  it("rejects clock in on the employee's Silah day until the schedule changes, but still allows clock out", async () => {
    now = T0; // Selasa 27 Okt, 07:00 WIB
    await setSilah(env.DB, { uid: "u16", days: [2], effectiveFrom: "2026-10-01", nowMs: T0, byUid: "adm" });
    const me = await call(env, deps, "GET", "/me", { token: "u16" });
    assert.equal(me.data.silahToday, true);
    const opts = await options("u16", "masuk");
    assert.equal(opts.status, 409);
    assert.equal(opts.data.error.code, "HARI_SILAH");

    // Challenge yang sempat dibuat sebelum hari Silah juga tidak bisa dipakai untuk clock in.
    await setSilah(env.DB, { uid: "u16", days: [], effectiveFrom: "2026-10-27", nowMs: T0, byUid: "adm" });
    const body = await signedBody("u16", "masuk");
    await setSilah(env.DB, { uid: "u16", days: [2], effectiveFrom: "2026-10-27", nowMs: T0, byUid: "adm" });
    assert.equal((await absen("u16", body)).data.error.code, "HARI_SILAH");

    // Admin mengubah jadwal (Silah pindah ke Sabtu) → bisa clock in, dan clock out tetap boleh.
    await setSilah(env.DB, { uid: "u16", days: [6], effectiveFrom: "2026-10-27", nowMs: T0, byUid: "adm" });
    assert.equal((await call(env, deps, "GET", "/me", { token: "u16" })).data.silahToday, false);
    assert.equal((await absen("u16", await signedBody("u16", "masuk"))).status, 200);
    await setSilah(env.DB, { uid: "u16", days: [2], effectiveFrom: "2026-10-27", nowMs: T0, byUid: "adm" });
    now = T0 + 9 * HOUR;
    assert.equal((await absen("u16", await signedBody("u16", "pulang"))).status, 200);
  });

  it("clocks in on server time, ignores client time, and never records the same body twice", async () => {
    now = T0;
    const body = await signedBody("u1", "masuk", { clientTime: 0 });
    const first = await absen("u1", body);
    assert.equal(first.status, 200, JSON.stringify(first.data));
    assert.equal(first.data.serverTime, T0);
    assert.equal(first.data.status.today.masukAt, T0);
    const again = await absen("u1", body);
    assert.equal(again.status, 400);
    assert.equal(again.data.error.code, "CHALLENGE_INVALID");
    assert.equal((await recentShifts(env.DB, "u1")).length, 1);
  });

  it("allows one clock in per WIB date", async () => {
    now = T0 + 9 * HOUR;
    assert.equal((await absen("u1", await signedBody("u1", "pulang"))).data.status.today.status, "selesai");
    now = T0 + 10 * HOUR;
    const opts = await options("u1", "masuk");
    assert.equal(opts.status, 409);
    assert.equal(opts.data.error.code, "SUDAH_CLOCK_IN_HARI_INI");
  });

  it("accepts clock in/out without a passkey (no fingerprint), but each challenge is single-use and kind-bound", async () => {
    now = T0;
    const { authentication: _ignored, ...masuk } = await signedBody("u4", "masuk");
    assert.equal((await absen("u4", { ...masuk, kind: "pulang" })).data.error.code, "CHALLENGE_INVALID");
    const fresh = { ...(await signedBody("u4", "masuk")), authentication: undefined };
    const res = await absen("u4", fresh);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal((await absen("u4", fresh)).data.error.code, "CHALLENGE_INVALID");
    now = T0 + 9 * HOUR;
    const { authentication: _old, ...pulang } = await signedBody("u4", "pulang");
    const out = await absen("u4", pulang);
    assert.equal(out.status, 200, JSON.stringify(out.data));
    assert.equal(out.data.status.last.status, "selesai");
  });

  it("checks the face distance only when face check is on", async () => {
    now = T0;
    const far = await absen("u5", await signedBody("u5", "masuk", { faceDistance: 0.6 }));
    assert.equal(far.status, 422);
    assert.equal(far.data.error.code, "WAJAH_TIDAK_COCOK");
    const exempt = await absen("u2", await signedBody("u2", "masuk", { faceDistance: null }));
    assert.equal(exempt.status, 200, JSON.stringify(exempt.data));
  });

  it("rejects requests from outside the enforced country", async () => {
    now = T0;
    country = "SG";
    const res = await absen("u6", await signedBody("u6", "masuk"), { ...env, ENFORCE_COUNTRY: "ID" });
    country = null;
    assert.equal(res.status, 422);
    assert.equal(res.data.error.code, "NEGARA_TIDAK_VALID");
  });

  it("closes a night shift after midnight", async () => {
    now = T0 - 9 * HOUR; // 22:00 WIB, 26 Okt
    assert.equal((await absen("u7", await signedBody("u7", "masuk"))).data.status.open.workDate, "2026-10-26");
    now = T0 - 1 * HOUR; // 06:00 WIB, 27 Okt
    const out = await absen("u7", await signedBody("u7", "pulang"));
    assert.equal(out.status, 200, JSON.stringify(out.data));
    assert.equal(out.data.status.last.status, "selesai");
    assert.equal(out.data.status.open, null);
  });

  it("ignores a stale passkey from an old app build, rejects inactive devices and clock out without clock in", async () => {
    now = T0;
    const body = await signedBody("u8", "masuk");
    const old = await absen("u8", { ...body, authentication: { ...body.authentication, id: "cred-other" } });
    assert.equal(old.status, 200, JSON.stringify(old.data));
    assert.equal((await options("u3", "masuk")).data.error.code, "BELUM_AKTIVASI");
    const out = await options("u9", "pulang");
    assert.equal(out.status, 409);
    assert.equal(out.data.error.code, "BELUM_CLOCK_IN");
  });

  it("clock in at 19:00 WIB without a morning clock in is accepted and keeps the late reason", async () => {
    now = T0 + 12 * HOUR; // 19:00 WIB
    const res = await absen("u10", await signedBody("u10", "masuk", { lateReason: "  Lupa absen pagi,   HP ketinggalan  " }));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.status.today.lateReason, "Lupa absen pagi, HP ketinggalan");
    assert.equal((await recentShifts(env.DB, "u10"))[0].late_reason, "Lupa absen pagi, HP ketinggalan");
  });

  it("drops the late reason for an on-time clock in, and still accepts a late one sent without a reason", async () => {
    now = T0 + HOUR; // 08:00 WIB
    const onTime = await absen("u11", await signedBody("u11", "masuk", { lateReason: "tidak perlu" }));
    assert.equal(onTime.status, 200, JSON.stringify(onTime.data));
    assert.equal((await recentShifts(env.DB, "u11"))[0].late_reason, null);

    // Versi aplikasi lama belum mengirim lateReason; absen tetap jalan.
    now = T0 + 3 * HOUR;
    const old = await absen("u12", await signedBody("u12", "masuk"));
    assert.equal(old.status, 200, JSON.stringify(old.data));
    assert.equal((await recentShifts(env.DB, "u12"))[0].late_reason, null);
  });

  it("rejects a late reason over 300 characters before using up the challenge", async () => {
    now = T0 + 12 * HOUR;
    const body = await signedBody("u9", "masuk", { lateReason: "x".repeat(301) });
    const tooLong = await absen("u9", body);
    assert.equal(tooLong.status, 400);
    assert.equal(tooLong.data.error.code, "VALIDATION_ERROR");
    const retry = await absen("u9", { ...body, lateReason: "Macet di jalan" });
    assert.equal(retry.status, 200, JSON.stringify(retry.data));
    assert.equal(retry.data.status.today.lateReason, "Macet di jalan");
  });

  it("stores the late reason photo as a 90-day photo linked to the shift", async () => {
    now = T0 + 12 * HOUR;
    const res = await absen("u13", await signedBody("u13", "masuk", { lateReason: "Ban bocor", latePhotoBase64: LATE_PHOTO_BASE64 }));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const photoId = res.data.status.today.latePhotoId;
    assert.ok(photoId);
    assert.equal((await recentShifts(env.DB, "u13"))[0].late_photo_id, photoId);
    const photo = await getPhoto(env.PHOTOS, photoId);
    assert.equal(photo.kind, "selfie"); // ikut dihapus cron selfie > 90 hari
    assert.deepEqual(photo.jpeg, new Uint8Array(Buffer.from(LATE_PHOTO_BASE64, "base64")));
  });

  it("ignores a late photo on an on-time clock in", async () => {
    now = T0 + HOUR; // 08:00 WIB
    const res = await absen("u14", await signedBody("u14", "masuk", { lateReason: "x y z", latePhotoBase64: LATE_PHOTO_BASE64 }));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.status.today.latePhotoId, null);
  });

  it("rejects a broken or oversized late photo before using up the challenge", async () => {
    now = T0 + 12 * HOUR;
    const body = await signedBody("u15", "masuk", { lateReason: "Ban bocor", latePhotoBase64: "bm90LWEtanBlZw==" });
    const broken = await absen("u15", body);
    assert.equal(broken.status, 400);
    assert.equal(broken.data.error.code, "FOTO_ALASAN_TIDAK_VALID");
    const huge = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.alloc(MAX_LATE_PHOTO_BYTES)]).toString("base64");
    const tooBig = await absen("u15", { ...body, latePhotoBase64: huge });
    assert.equal(tooBig.status, 400);
    assert.equal(tooBig.data.error.code, "FOTO_ALASAN_TIDAK_VALID");
    const ok = await absen("u15", { ...body, latePhotoBase64: LATE_PHOTO_BASE64 });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
  });
});
