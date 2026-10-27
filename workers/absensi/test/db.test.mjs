import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, makeEnv, T0 } from "./helpers.mjs";
import {
  closeShift, consumeChallenge, createChallenge, getPhoto, insertPasskey, insertPhoto, insertShift,
  listAreas, listPasskeys, purgeSelfies, rekapShifts, replaceAreas, resetEmployeeDevice, activateEmployee,
  getEmployee,
} from "../src/db.js";

const shift = (o = {}) => ({
  id: "s1", uid: "u1", workDate: "2026-10-27", masukAt: T0, lat: -6.97, lng: 106.86, accuracy: 8,
  areaId: "a1", faceDistance: 0.3, photoId: "p1", ...o,
});
const pulang = { pulangAt: T0 + 9 * 3600_000, lat: -6.97, lng: 106.86, accuracy: 9, areaId: "a1", faceDistance: 0.31, photoId: "p2" };

describe("db", () => {
  let env;
  let dispose;
  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env);
    await replaceAreas(env.DB, [{ id: "a1", name: "SPPG", polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }], toleranceM: 15, active: true }], "admin", T0);
  });
  after(() => dispose());

  it("consumeChallenge succeeds once and never after expiry", async () => {
    const id = await createChallenge(env.DB, { uid: "u1", purpose: "absen", kind: "masuk", nonce: "n", expiresAt: T0 + 120_000 });
    assert.equal((await consumeChallenge(env.DB, id, "u1", "absen", T0)).nonce, "n");
    assert.equal(await consumeChallenge(env.DB, id, "u1", "absen", T0), null);
    const late = await createChallenge(env.DB, { uid: "u1", purpose: "absen", kind: "masuk", nonce: "n2", expiresAt: T0 + 120_000 });
    assert.equal(await consumeChallenge(env.DB, late, "u1", "absen", T0 + 120_001), null);
    const other = await createChallenge(env.DB, { uid: "u1", purpose: "activate", kind: null, nonce: "n3", expiresAt: T0 + 120_000 });
    assert.equal(await consumeChallenge(env.DB, other, "u2", "activate", T0), null);
  });

  it("one shift per uid and work date; closeShift only closes an open shift", async () => {
    await insertShift(env.DB, shift());
    await assert.rejects(insertShift(env.DB, shift({ id: "s2" })));
    assert.equal(await closeShift(env.DB, "s1", pulang), 1);
    assert.equal(await closeShift(env.DB, "s1", pulang), 0);
  });

  it("rekapShifts joins employee and area names", async () => {
    const rows = await rekapShifts(env.DB, { from: "2026-10-01", to: "2026-10-31" });
    assert.equal(rows.length, 1);
    assert.equal(rows[0].name, "Budi");
    assert.equal(rows[0].area_name, "SPPG");
    assert.equal(rows[0].status, "selesai");
    assert.equal((await rekapShifts(env.DB, { from: "2026-10-01", to: "2026-10-31", uid: "nobody" })).length, 0);
  });

  it("listAreas parses polygons", async () => {
    const [area] = await listAreas(env.DB, { activeOnly: true });
    assert.deepEqual(area, { id: "a1", name: "SPPG", polygon: [{ lat: 0, lng: 0 }, { lat: 0, lng: 1 }, { lat: 1, lng: 1 }], toleranceM: 15, active: true });
  });

  it("purgeSelfies removes old selfies and keeps reference photos", async () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 1, 2, 3]);
    await insertPhoto(env.PHOTOS, { id: "old", uid: "u1", kind: "selfie", jpeg, createdAt: T0 - 91 * 86_400_000 });
    await insertPhoto(env.PHOTOS, { id: "ref", uid: "u1", kind: "acuan", jpeg, createdAt: T0 - 91 * 86_400_000 });
    await insertPhoto(env.PHOTOS, { id: "new", uid: "u1", kind: "selfie", jpeg, createdAt: T0 });
    assert.equal(await purgeSelfies(env.PHOTOS, T0 - 90 * 86_400_000), 1);
    assert.equal(await getPhoto(env.PHOTOS, "old"), null);
    assert.deepEqual(Array.from((await getPhoto(env.PHOTOS, "ref")).jpeg), Array.from(jpeg));
    assert.ok(await getPhoto(env.PHOTOS, "new"));
  });

  it("resetEmployeeDevice removes passkeys and returns the old reference photo", async () => {
    await activateEmployee(env.DB, "u1", { faceDescriptor: [0.1, 0.2], referencePhotoId: "ref", consentAt: T0, activatedAt: T0 });
    await insertPasskey(env.DB, { credentialId: "c1", uid: "u1", publicKey: "pk", counter: 0, transports: ["internal"], createdAt: T0 });
    assert.equal((await listPasskeys(env.DB, "u1")).length, 1);
    assert.deepEqual(await resetEmployeeDevice(env.DB, "u1"), { referencePhotoId: "ref" });
    assert.equal((await listPasskeys(env.DB, "u1")).length, 0);
    const employee = await getEmployee(env.DB, "u1");
    assert.equal(employee.activated_at, null);
    assert.equal(employee.face_descriptor, null);
  });
});
