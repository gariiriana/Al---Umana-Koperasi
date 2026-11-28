import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv, T0 } from "./helpers.mjs";
import {
  activateEmployee, insertRequest, insertShift, listPushDevices, setSilah, upsertPushDevice,
} from "../src/db.js";
import { classifyFcm } from "../src/fcm.js";
import { runReminders } from "../src/reminders.js";

// T0 = Selasa 27 Okt 2026 07:00 WIB.
const MIN = 60_000;
const at = (hh, mm) => T0 + ((hh - 7) * 60 + mm) * MIN;
const TODAY = "2026-10-27";
const SELASA = 2;

describe("pengingat clock in / clock out ke HP", () => {
  let env;
  let dispose;
  let now = T0;
  const deps = fakeDeps({ now: () => now });
  const send = (token, method, path, body) => call(env, deps, method, path, { token, body });

  function recorder(outcomeFor = () => "ok") {
    const sent = [];
    return { sent, fn: async (token, data) => { sent.push({ token, ...data }); return outcomeFor(token); } };
  }
  const device = (uid, token = `token-${uid}-xxxxxxxxxxxxxxxx`) =>
    upsertPushDevice(env.DB, { tokenHash: `h-${token}`, token, uid, platform: "iPhone", nowMs: T0 });

  before(async () => {
    ({ env, dispose } = await makeEnv());
    // ani: belum clock in · budi: sudah clock in · citra: Silah Selasa · dedi: cuti · eko: tanpa HP
    // gina: belum aktivasi
    for (const [uid, name] of [["ani", "Ani"], ["budi", "Budi"], ["citra", "Citra"], ["dedi", "Dedi"], ["eko", "Eko"], ["gina", "Gina"]]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, name });
      if (uid !== "gina") await activateEmployee(env.DB, uid, { faceDescriptor: null, referencePhotoId: null, consentAt: T0, activatedAt: T0 });
      if (uid !== "eko") await device(uid);
    }
    await insertShift(env.DB, { id: "s-budi", uid: "budi", workDate: TODAY, masukAt: at(7, 5), lat: 0, lng: 0, accuracy: 5, areaId: null, faceDistance: null, photoId: "p" });
    await setSilah(env.DB, { uid: "citra", days: [SELASA], effectiveFrom: "2026-10-01", nowMs: T0, byUid: "adm" });
    await insertRequest(env.DB, { id: "r1", uid: "dedi", kind: "cuti", leaveType: "sakit", startDate: TODAY, endDate: TODAY, reason: "Demam", createdAt: T0 });
    await env.DB.prepare("UPDATE requests SET status = 'approved' WHERE id = 'r1'").run();
  });
  after(() => dispose());

  it("di luar jam pengingat tidak ada yang dikirim", async () => {
    const r = recorder();
    for (const t of [at(7, 25), at(8, 0), at(16, 25), at(17, 0)]) {
      assert.deepEqual(await runReminders(env, t, r.fn), { masuk: 0, pulang: 0, failed: 0 });
    }
    assert.equal(r.sent.length, 0);
  });

  it("07:30: hanya yang belum clock in, tidak Silah, tidak cuti, sudah aktivasi, dan punya HP", async () => {
    const r = recorder();
    assert.deepEqual(await runReminders(env, at(7, 30), r.fn), { masuk: 1, pulang: 0, failed: 0 });
    assert.deepEqual(r.sent.map((m) => m.token), ["token-ani-xxxxxxxxxxxxxxxx"]);
    assert.equal(r.sent[0].title, "Waktunya Clock In");
    assert.equal(r.sent[0].url, "/absensi");
  });

  it("tidak dikirim dua kali di tick berikutnya, dan tick yang terlewat masih dikejar sampai 30 menit", async () => {
    const again = recorder();
    assert.deepEqual(await runReminders(env, at(7, 35), again.fn), { masuk: 0, pulang: 0, failed: 0 });
    assert.equal(again.sent.length, 0);
  });

  it("tick 07:30 terlewat: 07:55 masih dikirim (hari berikutnya)", async () => {
    const r = recorder();
    const result = await runReminders(env, Date.parse("2026-10-29T07:55:00+07:00"), r.fn);
    assert.ok(r.sent.some((m) => m.token.includes("ani")), JSON.stringify(result));
  });

  it("16:30: clock out untuk yang shift hari ini masih terbuka, dengan jam clock in", async () => {
    const r = recorder();
    assert.deepEqual(await runReminders(env, at(16, 30), r.fn), { masuk: 0, pulang: 1, failed: 0 });
    assert.equal(r.sent[0].token, "token-budi-xxxxxxxxxxxxxxxx");
    assert.equal(r.sent[0].title, "Jangan lupa Clock Out");
    assert.match(r.sent[0].body, /07:05 WIB/);
  });

  it("token mati dihapus, gagal sementara dicoba lagi tick berikutnya", async () => {
    await insertShift(env.DB, { id: "s-ani", uid: "ani", workDate: TODAY, masukAt: at(8, 0), lat: 0, lng: 0, accuracy: 5, areaId: null, faceDistance: null, photoId: "p" });
    await device("ani", "token-ani-lama-xxxxxxxxxxxxx");

    const flaky = recorder((token) => (token === "token-ani-lama-xxxxxxxxxxxxx" ? "invalid" : "error"));
    assert.deepEqual(await runReminders(env, at(16, 40), flaky.fn), { masuk: 0, pulang: 0, failed: 1 });
    assert.deepEqual((await listPushDevices(env.DB, "ani")).map((d) => d.token), ["token-ani-xxxxxxxxxxxxxxxx"]);

    const ok = recorder();
    assert.deepEqual(await runReminders(env, at(16, 45), ok.fn), { masuk: 0, pulang: 1, failed: 0 });
  });

  it("FCM: 404 / UNREGISTERED = token mati, 5xx = coba lagi", () => {
    assert.equal(classifyFcm(200, null), "ok");
    assert.equal(classifyFcm(404, null), "invalid");
    assert.equal(classifyFcm(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } }), "invalid");
    assert.equal(classifyFcm(400, { error: { message: "The registration token is not a valid FCM registration token" } }), "invalid");
    assert.equal(classifyFcm(503, null), "error");
    assert.equal(classifyFcm(401, null), "error");
  });

  it("endpoint: daftar HP, pindah pemilik, hapus HP", async () => {
    now = T0;
    const token = "fcm-token-baru-xxxxxxxxxxxxxxxxxxxx";
    assert.equal((await send("eko", "POST", "/pengingat/perangkat", { token, platform: "Android" })).status, 200);
    assert.equal((await listPushDevices(env.DB, "eko")).length, 1);
    // HP yang sama dipakai akun lain: pindah pemilik.
    await send("dedi", "POST", "/pengingat/perangkat", { token });
    assert.equal((await listPushDevices(env.DB, "eko")).length, 0);
    assert.equal((await send("dedi", "POST", "/pengingat/perangkat", { token: "pendek" })).status, 400);
    assert.equal((await send("eko", "PUT", "/pengingat", { masukMin: 420, pulangMin: null })).status, 404);

    // Hapus hanya HP milik akun yang login.
    assert.equal((await send("eko", "POST", "/pengingat/perangkat/hapus", { token })).status, 200);
    assert.equal((await listPushDevices(env.DB, "dedi")).length, 2);
    assert.equal((await send("dedi", "POST", "/pengingat/perangkat/hapus", { token })).status, 200);
    assert.equal((await listPushDevices(env.DB, "dedi")).length, 1); // HP lama dedi dari setup tetap ada
  });
  it("shift malam (clock in 21:00 kemarin, belum clock out) tidak diingatkan clock in", async () => {
    await addEmployee(env, { uid: "malam", email: "malam@absen.test", name: "Malam" });
    await activateEmployee(env.DB, "malam", { faceDescriptor: null, referencePhotoId: null, consentAt: T0, activatedAt: T0 });
    await device("malam");
    await insertShift(env.DB, {
      id: "s-malam", uid: "malam", workDate: "2026-10-30", masukAt: Date.parse("2026-10-30T21:00:00+07:00"),
      lat: 0, lng: 0, accuracy: 5, areaId: null, faceDistance: null, photoId: "p",
    });
    const r = recorder();
    await runReminders(env, Date.parse("2026-10-31T07:30:00+07:00"), r.fn);
    assert.ok(!r.sent.some((m) => m.token.includes("malam")), JSON.stringify(r.sent.map((m) => m.token)));
    assert.ok(r.sent.some((m) => m.token.includes("ani")));
  });
});
