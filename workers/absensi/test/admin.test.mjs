import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv, T0 } from "./helpers.mjs";
import {
  activateEmployee, getPhoto, insertPasskey, insertPhoto, insertShift, listPasskeys, markStaleShifts,
} from "../src/db.js";
import { AbsensiError } from "../src/http.js";

const SQ = [{ lat: -6.9736, lng: 106.8650 }, { lat: -6.9734, lng: 106.8650 }, { lat: -6.9734, lng: 106.8653 }];
const shift = (o) => ({ masukAt: T0, lat: -6.9735, lng: 106.8651, accuracy: 8, areaId: null, faceDistance: null, photoId: "p", ...o });

describe("admin endpoints", () => {
  let env;
  let dispose;
  const identityCalls = [];
  const deps = fakeDeps({
    identity: {
      createAuthUser: async (input) => {
        identityCalls.push(["create", input]);
        if (input.email.startsWith("dup")) throw new AbsensiError("EMAIL_SUDAH_ADA", 409);
        return `uid-${input.email.split("@")[0]}`;
      },
      setClaims: async (uid, claims) => identityCalls.push(["claims", uid, claims]),
      setAuthDisabled: async (uid, disabled) => identityCalls.push(["disabled", uid, disabled]),
    },
  });
  const asAdmin = (method, path, body) => call(env, deps, method, path, { token: "adm", body });

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin", role: "admin_absensi" });
    for (const [uid, name] of [["u1", "Ani"], ["u2", "Budi"], ["u3", "Cici"], ["u4", "Dedi"]]) {
      await addEmployee(env, { uid, name, email: `${uid}@absen.test` });
    }
  });
  after(() => dispose());

  it("is admin only", async () => {
    const res = await call(env, deps, "GET", "/admin/karyawan", { token: "u1" });
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, "FORBIDDEN");
  });

  it("creates accounts with the absensi claim and validates input", async () => {
    const res = await asAdmin("POST", "/admin/karyawan", { name: "Eka", email: "Eka@Absen.test ", password: "rahasia123", role: "absen_karyawan", faceRequired: false });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.uid, "uid-eka");
    assert.equal(res.data.faceRequired, false);
    assert.deepEqual(identityCalls.find((c) => c[0] === "claims"), ["claims", "uid-eka", { absensi_role: "absen_karyawan" }]);
    assert.ok((await asAdmin("GET", "/admin/karyawan")).data.employees.some((e) => e.email === "eka@absen.test"));
    assert.equal((await asAdmin("POST", "/admin/karyawan", { name: "X", email: "dup@absen.test", password: "rahasia123", role: "absen_karyawan", faceRequired: true })).status, 409);
    assert.equal((await asAdmin("POST", "/admin/karyawan", { name: "X", email: "x@absen.test", password: "short", role: "absen_karyawan", faceRequired: true })).data.error.code, "VALIDATION_ERROR");
    assert.equal((await asAdmin("POST", "/admin/karyawan", { name: "X", email: "x@absen.test", password: "rahasia123", role: "super_admin", faceRequired: true })).data.error.code, "VALIDATION_ERROR");
  });

  it("limits the recap range to 366 days", async () => {
    assert.equal((await asAdmin("GET", "/admin/rekap?from=2026-01-01&to=2027-01-01")).status, 200);
    assert.equal((await asAdmin("GET", "/admin/rekap?from=2026-01-01&to=2027-01-02")).status, 400);
    assert.equal((await asAdmin("GET", "/admin/rekap?from=2026-10-31&to=2026-10-01")).status, 400);
    assert.equal((await asAdmin("GET", "/admin/rekap?from=2026-13-01&to=2026-13-02")).status, 400);
  });

  it("validates and saves areas", async () => {
    const area = { name: "SPPG", polygon: SQ, toleranceM: 15, active: true };
    assert.equal((await asAdmin("PUT", "/admin/area", { areas: [{ ...area, polygon: SQ.slice(0, 2) }] })).status, 400);
    assert.equal((await asAdmin("PUT", "/admin/area", { areas: [{ ...area, toleranceM: 60 }] })).status, 400);
    assert.equal((await asAdmin("PUT", "/admin/area", { areas: [{ ...area, name: " " }] })).status, 400);
    const saved = await asAdmin("PUT", "/admin/area", { areas: [area] });
    assert.equal(saved.status, 200);
    assert.equal(saved.data.areas[0].name, "SPPG");
    assert.deepEqual((await asAdmin("GET", "/admin/area")).data.areas[0].polygon, SQ);
  });

  it("resets a device: passkeys and reference photo are gone", async () => {
    await insertPhoto(env.PHOTOS, { id: "ref-u1", uid: "u1", kind: "acuan", jpeg: new Uint8Array([0xff, 0xd8, 0xff]), createdAt: T0 });
    await activateEmployee(env.DB, "u1", { faceDescriptor: [0.1], referencePhotoId: "ref-u1", consentAt: T0, activatedAt: T0 });
    await insertPasskey(env.DB, { credentialId: "c-u1", uid: "u1", publicKey: "pk", counter: 0, transports: [], createdAt: T0 });
    const res = await asAdmin("PATCH", "/admin/karyawan/u1", { action: "reset_perangkat" });
    assert.equal(res.status, 200);
    assert.equal(res.data.activated, false);
    assert.equal((await listPasskeys(env.DB, "u1")).length, 0);
    assert.equal(await getPhoto(env.PHOTOS, "ref-u1"), null);
  });

  it("deactivates others but never the admin themself", async () => {
    assert.equal((await asAdmin("PATCH", "/admin/karyawan/adm", { action: "nonaktifkan" })).data.error.code, "TIDAK_BISA_DIRI_SENDIRI");
    const res = await asAdmin("PATCH", "/admin/karyawan/u4", { action: "nonaktifkan" });
    assert.equal(res.data.status, "nonaktif");
    assert.deepEqual(identityCalls.at(-1), ["disabled", "u4", true]);
    assert.equal((await asAdmin("PATCH", "/admin/karyawan/u4", { action: "set_face_required", faceRequired: false })).data.faceRequired, false);
  });

  it("maps today's shifts to belum / masuk / pulang / tidak_clock_out", async () => {
    await insertShift(env.DB, shift({ id: "t1", uid: "u1", workDate: "2026-10-27" }));
    await insertShift(env.DB, shift({ id: "t2", uid: "u2", workDate: "2026-10-26", masukAt: T0 - 21 * 3600_000 }));
    await markStaleShifts(env.DB, T0 - 20 * 3600_000);
    await insertShift(env.DB, shift({ id: "t3", uid: "u2", workDate: "2026-10-27", masukAt: T0 - 3600_000 }));
    await env.DB.prepare("UPDATE shifts SET status = 'lupa_pulang' WHERE id = 't3'").run();
    const { data } = await asAdmin("GET", "/admin/hari-ini");
    assert.equal(data.date, "2026-10-27");
    const state = Object.fromEntries(data.rows.map((r) => [r.name, r.state]));
    assert.deepEqual(state, { Ani: "masuk", Budi: "tidak_clock_out", Cici: "belum", Eka: "belum" });
  });

  it("serves photos as JPEG and 404s purged ones", async () => {
    await insertPhoto(env.PHOTOS, { id: "selfie-1", uid: "u1", kind: "selfie", jpeg: new Uint8Array([0xff, 0xd8, 0xff, 7]), createdAt: T0 });
    const ok = await asAdmin("GET", "/admin/foto/selfie-1");
    assert.equal(ok.status, 200);
    assert.equal(ok.headers.get("content-type"), "image/jpeg");
    const gone = await asAdmin("GET", "/admin/foto/missing");
    assert.equal(gone.status, 404);
    assert.equal(gone.data.error.code, "FOTO_TIDAK_ADA");
  });
});
