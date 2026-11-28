import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv, T0 } from "./helpers.mjs";
import { insertPhoto, insertShift, insertUnit, setEmployeeUnit } from "../src/db.js";

// 27 Okt 2026 (WIB), sama dengan T0.
const TODAY = "2026-10-27";

describe("halaman Tim: Hari Ini, Rekap, foto, dan Silah sesuai cakupan kepala unit", () => {
  let env;
  let dispose;
  const deps = fakeDeps({ now: () => T0 + 3 * 3600_000 });
  const get = (token, path) => call(env, deps, "GET", path, { token });
  const send = (token, method, path, body) => call(env, deps, method, path, { token, body });
  const names = (rows) => rows.map((r) => r.name).sort();

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin", role: "admin_absensi" });
    for (const [uid, name] of [["prianka", "Prianka"], ["inas", "Inas"], ["febri", "Febri"], ["risa", "Risa"], ["joko", "Joko"], ["lepas", "Lepas"]]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, name });
    }
    await insertUnit(env.DB, { id: "fish", name: "Fish n Kids", headUid: "prianka", nowMs: T0, byUid: "adm" });
    await insertUnit(env.DB, { id: "kasma", name: "Kasma Katering", headUid: "inas", nowMs: T0, byUid: "adm" });
    for (const [uid, unitId] of [["prianka", "fish"], ["inas", "fish"], ["febri", "fish"], ["risa", "kasma"], ["joko", "kasma"]]) {
      await setEmployeeUnit(env.DB, uid, unitId);
    }
    for (const uid of ["febri", "risa"]) {
      await insertShift(env.DB, {
        id: `s-${uid}`, uid, workDate: TODAY, masukAt: T0 + 3600_000, lat: 0, lng: 0, accuracy: 5, areaId: "a1",
        faceDistance: 0.2, photoId: `p-${uid}`,
      });
      await insertPhoto(env.PHOTOS, { id: `p-${uid}`, uid, kind: "selfie", jpeg: new Uint8Array([1, 2, 3]), createdAt: T0 });
    }
  });
  after(() => dispose());

  it("kepala unit hanya melihat anggota unitnya di Hari Ini, Rekap, dan daftar karyawan", async () => {
    const hari = await get("prianka", "/tim/hari-ini");
    assert.equal(hari.status, 200, JSON.stringify(hari.data));
    assert.deepEqual(names(hari.data.rows), ["Febri", "Inas", "Prianka"]);
    assert.equal(hari.data.rows.find((r) => r.name === "Febri").state, "masuk");
    assert.equal(hari.data.rows.find((r) => r.name === "Febri").unitId, "fish");
    // Filter unit: hanya unit yang kelihatan (Prianka cuma Fish n Kids).
    assert.deepEqual(hari.data.units, [{ id: "fish", name: "Fish n Kids" }]);

    const rekap = await get("prianka", `/tim/rekap?from=${TODAY}&to=${TODAY}`);
    assert.equal(rekap.status, 200);
    assert.deepEqual(rekap.data.rows.map((r) => r.name), ["Febri"]);

    const karyawan = await get("inas", "/tim/karyawan");
    assert.deepEqual(names(karyawan.data.employees), ["Joko", "Risa"]);
  });

  it("rekap / foto / Silah karyawan unit lain ditolak", async () => {
    assert.equal((await get("prianka", `/tim/rekap?from=${TODAY}&to=${TODAY}&uid=risa`)).status, 403);
    assert.equal((await get("prianka", "/tim/foto/p-risa")).status, 404);
    assert.equal((await get("prianka", "/tim/foto/p-febri")).status, 200);
    assert.equal((await send("prianka", "PATCH", "/tim/karyawan/risa", { action: "set_silah", silahDays: [5] })).status, 404);
  });

  it("karyawan biasa (bukan kepala unit) tidak bisa membuka halaman Tim", async () => {
    for (const path of ["/tim/hari-ini", `/tim/rekap?from=${TODAY}&to=${TODAY}`, "/tim/karyawan"]) {
      assert.equal((await get("febri", path)).status, 403, path);
    }
  });

  it("kepala unit mengatur Silah anggotanya, tapi tidak Silah dirinya sendiri atau aksi admin lain", async () => {
    const res = await send("prianka", "PATCH", "/tim/karyawan/febri", { action: "set_silah", silahDays: [5, 6] });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.silahDays, [5, 6]);
    assert.equal((await send("prianka", "PATCH", "/tim/karyawan/prianka", { action: "set_silah", silahDays: [0] })).data.error.code, "SILAH_DIRI_SENDIRI");
    assert.equal((await send("prianka", "PATCH", "/tim/karyawan/febri", { action: "nonaktifkan" })).status, 400);
  });

  it("view_all_units (Inas): melihat semua unit, tetapi persetujuan tetap unit yang dikepalainya", async () => {
    assert.equal((await send("adm", "PATCH", "/admin/karyawan/inas", { action: "set_view_all_units", viewAllUnits: true })).data.viewAllUnits, true);
    assert.equal((await send("adm", "PATCH", "/admin/karyawan/adm", { action: "set_view_all_units", viewAllUnits: true })).status, 400);
    assert.equal((await send("prianka", "PATCH", "/admin/karyawan/inas", { action: "set_view_all_units", viewAllUnits: false })).status, 403);

    const me = await get("inas", "/me");
    assert.equal(me.data.viewAllUnits, true);
    assert.deepEqual(names((await get("inas", "/tim/hari-ini")).data.rows), ["Febri", "Inas", "Joko", "Lepas", "Prianka", "Risa"]);
    const rekapAll = (await get("inas", `/tim/rekap?from=${TODAY}&to=${TODAY}`)).data;
    assert.deepEqual(rekapAll.rows.map((r) => r.name).sort(), ["Febri", "Risa"]);
    assert.deepEqual(rekapAll.rows.map((r) => r.unitId).sort(), ["fish", "kasma"]);
    assert.deepEqual(rekapAll.units.map((u) => u.name), ["Fish n Kids", "Kasma Katering"]);
    assert.equal((await get("inas", "/tim/foto/p-febri")).status, 200);
    assert.equal((await send("inas", "PATCH", "/tim/karyawan/febri", { action: "set_silah", silahDays: [1] })).status, 200);

    // Persetujuan: hanya unit yang dikepalai (Kasma Katering), dan status lain tidak berubah.
    const persetujuan = await get("inas", "/tim/persetujuan");
    assert.equal(persetujuan.status, 200);
    assert.deepEqual(persetujuan.data.units.map((u) => u.name), ["Kasma Katering"]);
    assert.equal((await get("prianka", "/me")).data.viewAllUnits, false);
  });

  it("view_all_units tanpa mengepalai unit: lihat semua, persetujuan tetap ditolak", async () => {
    await send("adm", "PATCH", "/admin/karyawan/lepas", { action: "set_view_all_units", viewAllUnits: true });
    assert.equal((await get("lepas", "/tim/hari-ini")).status, 200);
    assert.equal((await get("lepas", "/tim/persetujuan")).status, 403);
    await send("adm", "PATCH", "/admin/karyawan/lepas", { action: "set_view_all_units", viewAllUnits: false });
    assert.equal((await get("lepas", "/tim/hari-ini")).status, 403);
  });
});
