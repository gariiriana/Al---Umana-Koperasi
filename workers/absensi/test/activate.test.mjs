import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, fakeWebauthn, JPEG_BASE64, makeEnv, T0 } from "./helpers.mjs";
import { getEmployee, getPhoto, listPasskeys, replaceAreas } from "../src/db.js";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const SQ = [
  { lat: PIN.lat - 0.0001, lng: PIN.lng - 0.0001 }, { lat: PIN.lat + 0.0001, lng: PIN.lng - 0.0001 },
  { lat: PIN.lat + 0.0001, lng: PIN.lng + 0.0001 }, { lat: PIN.lat - 0.0001, lng: PIN.lng + 0.0001 },
];
const inside = { ...PIN, accuracy: 8 };
const north30 = { lat: PIN.lat + 0.0001 + 30 / 110540, lng: PIN.lng, accuracy: 5 };
const DESCRIPTOR = Array.from({ length: 128 }, (_, i) => i / 128);

describe("activation", () => {
  let env;
  let dispose;
  const deps = fakeDeps({ webauthn: fakeWebauthn });
  const options = (uid) => call(env, deps, "POST", "/activate/options", { token: uid, body: {} });
  const activate = (uid, challengeId, over = {}) => call(env, deps, "POST", "/activate", {
    token: uid,
    body: {
      challengeId, consent: true, registration: { ok: true, id: `cred-${uid}` }, location: inside,
      reference: { jpegBase64: JPEG_BASE64, descriptor: DESCRIPTOR }, ...over,
    },
  });

  before(async () => {
    ({ env, dispose } = await makeEnv());
    for (const uid of ["u1", "u2", "u3", "u4", "u5", "u6"]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, faceRequired: uid !== "u3" });
    }
    await replaceAreas(env.DB, [{ id: "a1", name: "SPPG", polygon: SQ, toleranceM: 15, active: true }], "admin", T0);
  });
  after(() => dispose());

  it("activates with passkey, descriptor and reference photo", async () => {
    const opts = await options("u1");
    assert.equal(opts.status, 200);
    assert.match(opts.data.optionsJSON.challenge, /^[A-Za-z0-9_-]{43}$/);
    const res = await activate("u1", opts.data.challengeId);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.activated, true);
    assert.equal((await listPasskeys(env.DB, "u1")).length, 1);
    const employee = await getEmployee(env.DB, "u1");
    assert.equal(employee.consent_at, T0);
    assert.equal((await getPhoto(env.PHOTOS, employee.reference_photo_id)).kind, "acuan");
  });

  it("refuses a second activation", async () => {
    assert.equal((await options("u1")).data.error.code, "SUDAH_AKTIVASI");
  });

  it("rejects outside the area with the distance", async () => {
    const res = await activate("u2", (await options("u2")).data.challengeId, { location: north30 });
    assert.equal(res.status, 422);
    assert.equal(res.data.error.code, "DI_LUAR_AREA");
    assert.ok(Math.abs(res.data.error.details.distanceM - 30) < 1);
  });

  it("burns the challenge once used", async () => {
    const { challengeId } = (await options("u4")).data;
    await activate("u4", challengeId, { location: north30 });
    assert.equal((await activate("u4", challengeId)).data.error.code, "CHALLENGE_INVALID");
  });

  it("requires consent", async () => {
    const res = await activate("u5", (await options("u5")).data.challengeId, { consent: undefined });
    assert.equal(res.status, 400);
    assert.equal(res.data.error.code, "VALIDATION_ERROR");
  });

  it("accepts a null descriptor when face check is off", async () => {
    const res = await activate("u3", (await options("u3")).data.challengeId, { reference: { jpegBase64: JPEG_BASE64, descriptor: null } });
    assert.equal(res.status, 200);
    assert.equal((await getEmployee(env.DB, "u3")).face_descriptor, null);
  });

  it("rejects a bad photo, a bad descriptor and a bad passkey", async () => {
    const notJpeg = await activate("u6", (await options("u6")).data.challengeId, { reference: { jpegBase64: Buffer.from("hello").toString("base64"), descriptor: DESCRIPTOR } });
    assert.equal(notJpeg.data.error.code, "SELFIE_TIDAK_VALID");
    const shortDescriptor = await activate("u6", (await options("u6")).data.challengeId, { reference: { jpegBase64: JPEG_BASE64, descriptor: [1, 2] } });
    assert.equal(shortDescriptor.data.error.code, "DESKRIPTOR_TIDAK_VALID");
    const badPasskey = await activate("u6", (await options("u6")).data.challengeId, { registration: { ok: false } });
    assert.equal(badPasskey.data.error.code, "PASSKEY_TIDAK_VALID");
  });
});
