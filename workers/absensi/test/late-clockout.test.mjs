// Clock out telat: lupa clock out, baru ditutup sesudah ganti hari → alasan + menunggu persetujuan.
import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, fakeWebauthn, JPEG_BASE64, makeEnv, T0 } from "./helpers.mjs";
import { activateEmployee, insertPasskey, replaceAreas } from "../src/db.js";
import { payloadChallenge, sha256Hex } from "../shared/binding.js";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const SQ = [
  { lat: PIN.lat - 0.0001, lng: PIN.lng - 0.0001 }, { lat: PIN.lat + 0.0001, lng: PIN.lng - 0.0001 },
  { lat: PIN.lat + 0.0001, lng: PIN.lng + 0.0001 }, { lat: PIN.lat - 0.0001, lng: PIN.lng + 0.0001 },
];
const inside = { ...PIN, accuracy: 8 };
const outside = { lat: PIN.lat + 0.01, lng: PIN.lng, accuracy: 8 };
const HOUR = 3600_000;
// T0 = Selasa 27 Okt 2026, 07:00 WIB. Jam WIB pada tanggal Okt `d`:
const okt = (d, h, min = 0) => Date.UTC(2026, 9, d, h - 7, min);

const verifyAuthentication = async ({ response, expectedChallenge }) => {
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString());
  return clientData.challenge === expectedChallenge ? { newCounter: 1 } : null;
};

describe("clock out telat (sesudah ganti hari)", () => {
  let env;
  let dispose;
  let now = T0;
  const deps = fakeDeps({ now: () => now, webauthn: { ...fakeWebauthn, verifyAuthentication } });
  const get = (token, path) => call(env, deps, "GET", path, { token });
  const send = (token, method, path, body) => call(env, deps, method, path, { token, body });

  async function signedBody(uid, kind, location = inside, over = {}) {
    const opts = await send(uid, "POST", "/absen/options", { kind });
    assert.equal(opts.status, 200, JSON.stringify(opts.data));
    const selfieSha256Hex = await sha256Hex(new Uint8Array(Buffer.from(JPEG_BASE64, "base64")));
    const challenge = await payloadChallenge({ nonce: opts.data.nonce, kind, ...location, selfieSha256Hex });
    const clientDataJSON = Buffer.from(JSON.stringify({ type: "webauthn.get", challenge, origin: "http://localhost:5174" })).toString("base64url");
    return {
      challengeId: opts.data.challengeId, kind, location, selfieBase64: JPEG_BASE64, faceDistance: 0.3,
      authentication: { id: `cred-${uid}`, rawId: `cred-${uid}`, type: "public-key", response: { clientDataJSON, authenticatorData: "", signature: "" } },
      ...over,
    };
  }
  const absenAt = async (at, uid, kind, over = {}, location = inside) => {
    now = at;
    return send(uid, "POST", "/absen", await signedBody(uid, kind, location, over));
  };
  const lateItems = async (uid) => (await get("adm", "/admin/pengajuan?status=all")).data.lateOutExceptions
    .filter((x) => x.uid === uid);

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await replaceAreas(env.DB, [{ id: "a1", name: "SPPG", polygon: SQ, toleranceM: 15, active: true }], "adm", T0);
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin", role: "admin_absensi" });
    for (const uid of ["kepala", "lain", "ani", "joko", "dedi", "malam", "malam2", "eka", "fajar", "gina", "hana", "malam3"]) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, name: uid[0].toUpperCase() + uid.slice(1) });
      await activateEmployee(env.DB, uid, { faceDescriptor: [0.1], referencePhotoId: `r-${uid}`, consentAt: T0, activatedAt: T0 });
      await insertPasskey(env.DB, { credentialId: `cred-${uid}`, uid, publicKey: "pk", counter: 0, transports: ["internal"], createdAt: T0 });
    }
    const dapur = await send("adm", "POST", "/admin/unit", { name: "Dapur", headUid: "kepala" });
    const dapurId = dapur.data.units.find((u) => u.name === "Dapur").id;
    const lain = await send("adm", "POST", "/admin/unit", { name: "Lain", headUid: "lain" });
    const lainId = lain.data.units.find((u) => u.name === "Lain").id;
    for (const uid of ["kepala", "joko", "dedi", "fajar"]) {
      assert.equal((await send("adm", "PATCH", `/admin/karyawan/${uid}`, { action: "set_unit", unitId: dapurId })).status, 200);
    }
    assert.equal((await send("adm", "PATCH", "/admin/karyawan/lain", { action: "set_unit", unitId: lainId })).status, 200);
  });
  after(() => dispose());

  it("clock out before midnight the same day is normal: no reason, no approval", async () => {
    assert.equal((await absenAt(okt(27, 7), "ani", "masuk")).status, 200);
    const res = await absenAt(okt(27, 23, 50), "ani", "pulang");
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.status.last.lateOut, null);
    assert.deepEqual(await lateItems("ani"), []);
  });

  it("next day: today's clock in waits for yesterday's clock out, which needs a reason and stays pending", async () => {
    assert.equal((await absenAt(okt(27, 7), "joko", "masuk")).status, 200);

    now = okt(28, 7);
    const blocked = await send("joko", "POST", "/absen/options", { kind: "masuk" });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.data.error.code, "SUDAH_CLOCK_IN");

    const body = await signedBody("joko", "pulang");
    const noReason = await send("joko", "POST", "/absen", body);
    assert.equal(noReason.status, 422);
    assert.equal(noReason.data.error.code, "ALASAN_CLOCK_OUT_TELAT");
    // Ditolak sebelum challenge terpakai: kirim ulang dengan alasan memakai challenge yang sama.
    const ok = await send("joko", "POST", "/absen", { ...body, lateOutReason: "  Lupa   pencet " });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const shift = ok.data.status.last;
    assert.equal(shift.workDate, "2026-10-27");
    assert.equal(shift.status, "selesai");
    assert.equal(shift.pulangAt, okt(28, 7));
    assert.equal(shift.durationMin, 1440);
    assert.deepEqual({ ...shift.lateOut, id: undefined }, { id: undefined, status: "pending", reason: "Lupa pencet", at: okt(28, 7) });

    const [item] = await lateItems("joko");
    assert.equal(item.status, "pending");
    assert.equal(item.workDate, "2026-10-27");
    assert.equal(item.masukAt, okt(27, 7));
    assert.equal(item.at, okt(28, 7));
    assert.equal(item.employeeName, "Joko");
    assert.ok(item.photoId);

    const notes = (await get("kepala", "/notifikasi")).data.notifications;
    assert.ok(notes.some((n) => n.title === "Clock Out Terlambat Perlu Persetujuan" && n.body.includes("Lupa pencet")));

    assert.equal((await absenAt(okt(28, 7, 5), "joko", "masuk")).status, 200);
  });

  it("pending items stack day after day and never block the next clock in", async () => {
    for (const d of [27, 28, 29]) {
      assert.equal((await absenAt(okt(d, 7), "dedi", "masuk")).status, 200, `masuk ${d}`);
      const out = await absenAt(okt(d + 1, 6, 50), "dedi", "pulang", { lateOutReason: `Lupa tanggal ${d}` });
      assert.equal(out.status, 200, `pulang ${d}`);
    }
    assert.equal((await absenAt(okt(30, 7), "dedi", "masuk")).status, 200);
    const items = await lateItems("dedi");
    assert.deepEqual(items.map((x) => [x.workDate, x.status]).sort(), [
      ["2026-10-27", "pending"], ["2026-10-28", "pending"], ["2026-10-29", "pending"],
    ]);
    const list = (await get("adm", "/admin/pengajuan?status=pending")).data;
    assert.ok(list.pendingCount >= 3);
  });

  it("night shift (clock in from 20:00) clocks out next morning without a reason", async () => {
    assert.equal((await absenAt(okt(27, 23), "malam", "masuk")).status, 200);
    const res = await absenAt(okt(28, 7), "malam", "pulang");
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.deepEqual(await lateItems("malam"), []);

    assert.equal((await absenAt(okt(27, 23), "malam2", "masuk")).status, 200);
    now = okt(28, 12, 30);
    const late = await send("malam2", "POST", "/absen", await signedBody("malam2", "pulang"));
    assert.equal(late.status, 422);
    assert.equal(late.data.error.code, "ALASAN_CLOCK_OUT_TELAT");
  });

  it("from the second midnight the shift can no longer be closed", async () => {
    assert.equal((await absenAt(okt(27, 7), "eka", "masuk")).status, 200);
    now = okt(29, 0);
    const res = await send("eka", "POST", "/absen/options", { kind: "pulang" });
    assert.equal(res.status, 409);
    assert.equal(res.data.error.code, "BELUM_CLOCK_IN");
    const me = (await get("eka", "/me")).data;
    assert.equal(me.status.last.status, "lupa_pulang");
  });

  it("only admin or the employee's own unit head can review; rejection counts as tidak clock out", async () => {
    assert.equal((await absenAt(okt(27, 7), "fajar", "masuk")).status, 200);
    assert.equal((await absenAt(okt(28, 7), "fajar", "pulang", { lateOutReason: "Lupa pencet" })).status, 200);
    const [item] = await lateItems("fajar");

    assert.equal((await send("lain", "PATCH", `/tim/clockout-telat/${item.id}`, { action: "approve" })).status, 403);
    assert.equal((await send("fajar", "PATCH", `/tim/clockout-telat/${item.id}`, { action: "approve" })).status, 403);
    const team = (await get("kepala", "/tim/persetujuan?status=pending")).data;
    assert.ok(team.lateOutExceptions.some((x) => x.id === item.id));
    assert.equal((await get("lain", "/tim/persetujuan?status=pending")).data.lateOutExceptions.length, 0);

    const rejected = await send("kepala", "PATCH", `/tim/clockout-telat/${item.id}`, { action: "reject", note: "Tidak ada lembur" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.data));
    assert.equal(rejected.data.status, "rejected");
    assert.equal((await send("adm", "PATCH", `/admin/clockout-telat/${item.id}`, { action: "approve" })).status, 409);

    const notes = (await get("fajar", "/notifikasi")).data.notifications;
    assert.ok(notes.some((n) => n.kind === "pengajuan_ditolak" && n.title === "Clock Out Terlambat Ditolak"));

    const rekap = (await get("adm", "/admin/rekap?from=2026-10-27&to=2026-10-27")).data.rows.find((r) => r.uid === "fajar");
    assert.equal(rekap.status, "lupa_pulang");
    assert.equal(rekap.pulangAt, null);
    assert.equal(rekap.durationMin, null);
    assert.equal(rekap.lateOut.status, "rejected");
    assert.equal(rekap.lateOut.at, okt(28, 7));
  });

  it("admin approval keeps the full duration", async () => {
    const [item] = await lateItems("joko");
    const ok = await send("adm", "PATCH", `/admin/clockout-telat/${item.id}`, { action: "approve" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    const rekap = (await get("adm", "/admin/rekap?from=2026-10-27&to=2026-10-27")).data.rows.find((r) => r.uid === "joko");
    assert.equal(rekap.status, "selesai");
    assert.equal(rekap.durationMin, 1440);
    assert.equal(rekap.lateOut.status, "approved");
  });

  it("late and outside the zone: two separate approvals", async () => {
    assert.equal((await absenAt(okt(27, 7), "gina", "masuk")).status, 200);
    const res = await absenAt(okt(28, 7), "gina", "pulang", { lateOutReason: "Lupa pencet", outsideReason: "Antar barang" }, outside);
    assert.equal(res.status, 200, JSON.stringify(res.data));
    const list = (await get("adm", "/admin/pengajuan?status=pending")).data;
    assert.equal(list.zoneExceptions.filter((x) => x.uid === "gina").length, 1);
    assert.equal(list.lateOutExceptions.filter((x) => x.uid === "gina").length, 1);
  });

  it("Hari Ini: yesterday's forgotten shift is not shown as present today; a running night shift is", async () => {
    assert.equal((await absenAt(okt(27, 7), "hana", "masuk")).status, 200);
    assert.equal((await absenAt(okt(27, 23), "malam3", "masuk")).status, 200);

    now = okt(28, 5);
    let rows = (await get("adm", "/admin/hari-ini")).data.rows;
    assert.equal(rows.find((r) => r.uid === "malam3").state, "masuk");
    assert.equal(rows.find((r) => r.uid === "hana").state, "belum");
    assert.equal(rows.find((r) => r.uid === "hana").masukAt, null);

    now = okt(28, 12, 30);
    rows = (await get("adm", "/admin/hari-ini")).data.rows;
    assert.equal(rows.find((r) => r.uid === "malam3").state, "belum");
  });
});
