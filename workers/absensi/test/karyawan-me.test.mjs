import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv, T0 } from "./helpers.mjs";
import { activateEmployee, insertShift, replaceAreas, setEmployeeStatus } from "../src/db.js";

const SQ = [{ lat: -6.9736, lng: 106.8650 }, { lat: -6.9734, lng: 106.8650 }, { lat: -6.9734, lng: 106.8653 }, { lat: -6.9736, lng: 106.8653 }];
const shiftRow = (o) => ({ uid: "u1", masukAt: T0, lat: -6.9735, lng: 106.8651, accuracy: 8, areaId: "a1", faceDistance: 0.3, photoId: "p", ...o });

describe("/me and /riwayat", () => {
  let env;
  let dispose;
  const deps = fakeDeps();
  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env, { uid: "u1" });
    await addEmployee(env, { uid: "u2", email: "u2@absen.test", faceRequired: false });
    await addEmployee(env, { uid: "u3", email: "u3@absen.test" });
    await activateEmployee(env.DB, "u1", { faceDescriptor: [0.1, 0.2], referencePhotoId: "r1", consentAt: T0, activatedAt: T0 });
    await activateEmployee(env.DB, "u2", { faceDescriptor: null, referencePhotoId: "r2", consentAt: T0, activatedAt: T0 });
    await setEmployeeStatus(env.DB, "u3", "nonaktif");
    await replaceAreas(env.DB, [
      { id: "a1", name: "SPPG", polygon: SQ, toleranceM: 15, active: true },
      { id: "a2", name: "Lama", polygon: SQ, toleranceM: 15, active: false },
    ], "admin", T0);
    await insertShift(env.DB, shiftRow({ id: "s-today", workDate: "2026-10-27" }));
    await insertShift(env.DB, shiftRow({ id: "s-sept", workDate: "2026-09-30", masukAt: T0 - 27 * 86_400_000 }));
  });
  after(() => dispose());

  it("requires a valid absensi account", async () => {
    assert.equal((await call(env, deps, "GET", "/me")).data.error.code, "UNAUTHENTICATED");
    const unknown = await call(env, deps, "GET", "/me", { token: "nobody" });
    assert.equal(unknown.status, 403);
    assert.equal(unknown.data.error.code, "BUKAN_AKUN_ABSENSI");
    const inactive = await call(env, deps, "GET", "/me", { token: "u3" });
    assert.equal(inactive.status, 403);
    assert.equal(inactive.data.error.code, "AKUN_NONAKTIF");
  });

  it("returns profile, active areas, today's shift and the descriptor only when face check is on", async () => {
    const me = (await call(env, deps, "GET", "/me", { token: "u1" })).data;
    assert.equal(me.uid, "u1");
    assert.equal(me.role, "absen_karyawan");
    assert.equal(me.activated, true);
    assert.equal(me.faceRequired, true);
    assert.deepEqual(me.faceDescriptor, [0.1, 0.2]);
    assert.deepEqual(me.areas.map((a) => a.id), ["a1"]);
    assert.equal(me.status.today.id, "s-today");
    assert.equal(me.status.open.id, "s-today");
    const me2 = (await call(env, deps, "GET", "/me", { token: "u2" })).data;
    assert.equal(me2.faceRequired, false);
    assert.equal(me2.faceDescriptor, null);
  });

  it("riwayat filters by month and validates the month", async () => {
    const october = await call(env, deps, "GET", "/riwayat?bulan=2026-10", { token: "u1" });
    assert.deepEqual(october.data.rows.map((r) => r.id), ["s-today"]);
    const bad = await call(env, deps, "GET", "/riwayat?bulan=2026-13", { token: "u1" });
    assert.equal(bad.status, 400);
    assert.equal(bad.data.error.code, "VALIDATION_ERROR");
  });

  it("answers CORS preflight for the allowed origin and 404s unknown routes", async () => {
    const preflight = await call(env, deps, "OPTIONS", "/me", { origin: "http://localhost:5174" });
    assert.equal(preflight.status, 204);
    assert.equal(preflight.headers.get("access-control-allow-origin"), "http://localhost:5174");
    const missing = await call(env, deps, "GET", "/nope", { token: "u1" });
    assert.equal(missing.status, 404);
    assert.equal(missing.data.error.code, "NOT_FOUND");
  });
});
