import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv, T0 } from "./helpers.mjs";
import { isSilahOn, normalizeSilahDays, silahDaysOn, weekdayOf } from "../shared/silah.js";

const DAY = 86_400_000;
// T0 = Selasa 27 Okt 2026, 07:00 WIB.
const SELASA = weekdayOf("2026-10-27");

describe("silah helpers", () => {
  it("knows the weekday of a date", () => {
    assert.equal(SELASA, 2);
    assert.equal(weekdayOf("2026-11-13"), 5); // Jumat
    assert.equal(weekdayOf("2026-11-15"), 0); // Minggu
  });

  it("validates and sorts days Senin → Minggu", () => {
    assert.deepEqual(normalizeSilahDays([0, 6]), [6, 0]);
    assert.deepEqual(normalizeSilahDays([]), []);
    assert.equal(normalizeSilahDays([7]), null);
    assert.equal(normalizeSilahDays([1, 1]), null);
    assert.equal(normalizeSilahDays([0, 1, 2, 3, 4, 5, 6]), null);
    assert.equal(normalizeSilahDays("6"), null);
  });

  it("uses the schedule that was in effect on each date", () => {
    const history = [
      { effectiveFrom: "2026-11-10", days: [0] },
      { effectiveFrom: "2026-10-01", days: [6] },
    ];
    assert.deepEqual(silahDaysOn(history, "2026-09-30"), []);
    assert.deepEqual(silahDaysOn(history, "2026-11-09"), [6]);
    assert.deepEqual(silahDaysOn(history, "2026-11-10"), [0]);
    assert.equal(isSilahOn(history, "2026-11-07"), true); // Sabtu, jadwal lama
    assert.equal(isSilahOn(history, "2026-11-14"), false); // Sabtu, jadwal baru
    assert.equal(isSilahOn(history, "2026-11-15"), true); // Minggu
  });
});

describe("admin silah endpoints", () => {
  let env;
  let dispose;
  let now = T0;
  const deps = fakeDeps({ now: () => now });
  const asAdmin = (method, path, body) => call(env, deps, method, path, { token: "adm", body });

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin", role: "admin_absensi" });
    await addEmployee(env, { uid: "u1", name: "Ani", email: "u1@absen.test" });
    await addEmployee(env, { uid: "u2", name: "Budi", email: "u2@absen.test" });
  });
  after(() => dispose());

  it("sets silah days and shows them on the employee list", async () => {
    const res = await asAdmin("PATCH", "/admin/karyawan/u1", { action: "set_silah", silahDays: [SELASA, 0] });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.silahDays, [SELASA, 0]);
    const list = (await asAdmin("GET", "/admin/karyawan")).data.employees;
    assert.deepEqual(list.find((e) => e.uid === "u1").silahDays, [SELASA, 0]);
    assert.deepEqual(list.find((e) => e.uid === "u2").silahDays, []);
  });

  it("rejects invalid days, admins, and non-admin callers", async () => {
    for (const silahDays of [[7], [1, 1], "2", undefined]) {
      assert.equal((await asAdmin("PATCH", "/admin/karyawan/u1", { action: "set_silah", silahDays })).status, 400);
    }
    assert.equal((await asAdmin("PATCH", "/admin/karyawan/adm", { action: "set_silah", silahDays: [0] })).status, 400);
    assert.equal((await call(env, deps, "PATCH", "/admin/karyawan/u1", { token: "u2", body: { action: "set_silah", silahDays: [] } })).status, 403);
  });

  it("marks today's silah in Hari Ini", async () => {
    const rows = (await asAdmin("GET", "/admin/hari-ini")).data.rows;
    assert.equal(rows.find((r) => r.uid === "u1").silah, true);
    assert.equal(rows.find((r) => r.uid === "u2").silah, false);
  });

  it("returns silah history in the recap and keeps old schedules for past dates", async () => {
    now = T0 + 7 * DAY; // Selasa berikutnya: jadwal Ani diganti jadi Senin saja
    assert.equal((await asAdmin("PATCH", "/admin/karyawan/u1", { action: "set_silah", silahDays: [1] })).status, 200);
    // Diubah lagi di hari yang sama = menimpa, bukan menambah baris.
    assert.equal((await asAdmin("PATCH", "/admin/karyawan/u1", { action: "set_silah", silahDays: [1, 3] })).status, 200);

    const res = await asAdmin("GET", "/admin/rekap?from=2026-10-01&to=2026-11-30");
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(res.data.silah, [
      { uid: "u1", name: "Ani", effectiveFrom: "2026-10-27", days: [SELASA, 0] },
      { uid: "u1", name: "Ani", effectiveFrom: "2026-11-03", days: [1, 3] },
    ]);
    assert.equal(res.data.today, "2026-11-03");

    const onlyBudi = await asAdmin("GET", "/admin/rekap?from=2026-10-01&to=2026-11-30&uid=u2");
    assert.deepEqual(onlyBudi.data.silah, []);

    const past = await asAdmin("GET", "/admin/rekap?from=2026-10-01&to=2026-10-20");
    assert.deepEqual(past.data.silah, []);
  });

  it("hides silah of deactivated employees", async () => {
    await env.DB.prepare("UPDATE employees SET status = 'nonaktif' WHERE uid = 'u1'").run();
    const res = await asAdmin("GET", "/admin/rekap?from=2026-10-01&to=2026-11-30");
    assert.deepEqual(res.data.silah, []);
    await env.DB.prepare("UPDATE employees SET status = 'aktif' WHERE uid = 'u1'").run();
  });
});
