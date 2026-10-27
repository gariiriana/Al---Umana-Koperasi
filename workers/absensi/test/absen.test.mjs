import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, fakeWebauthn, JPEG_BASE64, makeEnv, T0 } from "./helpers.mjs";
import { activateEmployee, insertPasskey, recentShifts, replaceAreas } from "../src/db.js";
import { payloadChallenge, sha256Hex } from "../shared/binding.js";

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
    for (const uid of ["u1", "u2", "u3", "u4", "u5", "u6", "u7", "u8", "u9"]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, faceRequired: uid !== "u2" });
      if (uid === "u3") continue;
      await activateEmployee(env.DB, uid, { faceDescriptor: [0.1], referencePhotoId: `r-${uid}`, consentAt: T0, activatedAt: T0 });
      await insertPasskey(env.DB, { credentialId: `cred-${uid}`, uid, publicKey: "pk", counter: 0, transports: ["internal"], createdAt: T0 });
    }
  });
  after(() => dispose());

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

  it("rejects a payload changed after signing, and a challenge used for the other kind", async () => {
    now = T0;
    const body = await signedBody("u4", "masuk");
    const tampered = await absen("u4", { ...body, location: { ...body.location, lat: body.location.lat + 0.00001 } });
    assert.equal(tampered.data.error.code, "PAYLOAD_TIDAK_COCOK");
    const other = await signedBody("u4", "masuk");
    assert.equal((await absen("u4", { ...other, kind: "pulang" })).data.error.code, "CHALLENGE_INVALID");
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

  it("rejects unknown passkeys, inactive devices and clock out without clock in", async () => {
    now = T0;
    const body = await signedBody("u8", "masuk");
    const unknown = await absen("u8", { ...body, authentication: { ...body.authentication, id: "cred-other" } });
    assert.equal(unknown.data.error.code, "PASSKEY_TIDAK_DIKENAL");
    assert.equal((await options("u3", "masuk")).data.error.code, "BELUM_AKTIVASI");
    const out = await options("u9", "pulang");
    assert.equal(out.status, 409);
    assert.equal(out.data.error.code, "BELUM_CLOCK_IN");
  });
});
