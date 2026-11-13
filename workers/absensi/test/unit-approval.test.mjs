import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, fakeWebauthn, JPEG_BASE64, makeEnv, T0 } from "./helpers.mjs";
import { activateEmployee, insertPasskey, insertPhoto, recentShifts, replaceAreas, setSilah } from "../src/db.js";
import { payloadChallenge, sha256Hex } from "../shared/binding.js";

const PIN = { lat: -6.9735229, lng: 106.8651559 };
const SQ = [
  { lat: PIN.lat - 0.0001, lng: PIN.lng - 0.0001 }, { lat: PIN.lat + 0.0001, lng: PIN.lng - 0.0001 },
  { lat: PIN.lat + 0.0001, lng: PIN.lng + 0.0001 }, { lat: PIN.lat - 0.0001, lng: PIN.lng + 0.0001 },
];
const inside = { ...PIN, accuracy: 8 };
const outside = { lat: PIN.lat + 0.01, lng: PIN.lng, accuracy: 8 }; // ~1,1 km dari zona
const HOUR = 3600_000;

const verifyAuthentication = async ({ response, expectedChallenge }) => {
  const clientData = JSON.parse(Buffer.from(response.response.clientDataJSON, "base64url").toString());
  return clientData.challenge === expectedChallenge ? { newCounter: 1 } : null;
};

describe("unit kerja, kepala unit, dan absen luar zona", () => {
  let env;
  let dispose;
  let now = T0;
  const deps = fakeDeps({ now: () => now, webauthn: { ...fakeWebauthn, verifyAuthentication } });
  const get = (token, path) => call(env, deps, "GET", path, { token });
  const send = (token, method, path, body) => call(env, deps, method, path, { token, body });

  async function signedBody(uid, kind, location, over = {}) {
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

  let fishId;
  let kasmaId;

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await replaceAreas(env.DB, [{ id: "a1", name: "SPPG", polygon: SQ, toleranceM: 15, active: true }], "adm", T0);
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin", role: "admin_absensi" });
    const people = [
      ["prianka", "Prianka"], ["inas", "Inas"], ["febri", "Febri"], ["risa", "Risa"], ["joko", "Joko"],
    ];
    for (const [uid, name] of people) {
      await addEmployee(env, { uid, email: `${uid}@absen.test`, name });
      await activateEmployee(env.DB, uid, { faceDescriptor: [0.1], referencePhotoId: `r-${uid}`, consentAt: T0, activatedAt: T0 });
      await insertPasskey(env.DB, { credentialId: `cred-${uid}`, uid, publicKey: "pk", counter: 0, transports: ["internal"], createdAt: T0 });
    }
  });
  after(() => dispose());

  it("admin membuat unit + kepala unit dan memindahkan karyawan antar unit", async () => {
    const fish = await send("adm", "POST", "/admin/unit", { name: "Fish n Kids", headUid: "prianka" });
    assert.equal(fish.status, 200, JSON.stringify(fish.data));
    const kasma = await send("adm", "POST", "/admin/unit", { name: "Kasma  Katering", headUid: "inas" });
    fishId = fish.data.units.find((u) => u.name === "Fish n Kids").id;
    kasmaId = kasma.data.units.find((u) => u.name === "Kasma Katering").id;
    assert.equal(kasma.data.units.find((u) => u.id === kasmaId).headName, "Inas");

    const dup = await send("adm", "POST", "/admin/unit", { name: "Fish n Kids" });
    assert.equal(dup.status, 409);
    assert.equal((await send("prianka", "POST", "/admin/unit", { name: "X" })).status, 403);
    assert.equal((await send("adm", "POST", "/admin/unit", { name: "Y", headUid: "adm" })).status, 400);

    for (const [uid, unitId] of [["inas", fishId], ["febri", fishId], ["prianka", fishId], ["risa", kasmaId], ["joko", fishId]]) {
      const res = await send("adm", "PATCH", `/admin/karyawan/${uid}`, { action: "set_unit", unitId });
      assert.equal(res.status, 200, JSON.stringify(res.data));
      assert.equal(res.data.unitId, unitId);
    }
    assert.equal((await send("adm", "PATCH", "/admin/karyawan/joko", { action: "set_unit", unitId: "nope" })).status, 400);

    const units = await get("adm", "/admin/unit");
    assert.equal(units.data.units.find((u) => u.id === fishId).memberCount, 4);

    const me = await get("inas", "/me");
    assert.deepEqual(me.data.unit, { id: fishId, name: "Fish n Kids" });
    assert.deepEqual(me.data.headOf, [{ id: kasmaId, name: "Kasma Katering" }]);
    assert.deepEqual((await get("febri", "/me")).data.headOf, []);
  });

  it("pengajuan cuti: notifikasi ke admin + kepala unit; hanya kepala unitnya yang bisa menyetujui", async () => {
    const created = await send("risa", "POST", "/pengajuan", {
      kind: "cuti", leaveType: "sakit", startDate: "2026-10-28", endDate: "2026-10-28", reason: "Demam",
    });
    assert.equal(created.status, 200, JSON.stringify(created.data));
    assert.equal(created.data.unitName, "Kasma Katering");

    // Kepala Kasma (Inas) dan admin dapat notifikasi; kepala Fish n Kids (Prianka) tidak.
    assert.equal((await get("inas", "/notifikasi")).data.unreadCount, 1);
    assert.equal((await get("adm", "/notifikasi")).data.unreadCount, 1);
    assert.equal((await get("prianka", "/notifikasi")).data.unreadCount, 0);
    assert.equal((await get("inas", "/me")).data.teamPending, 1);

    const team = await get("inas", "/tim/persetujuan?status=pending");
    assert.equal(team.status, 200);
    assert.deepEqual(team.data.requests.map((r) => r.employeeName), ["Risa"]);
    assert.equal((await get("febri", "/tim/persetujuan")).status, 403);

    // Prianka bukan kepala unit Risa.
    assert.equal((await send("prianka", "PATCH", `/tim/pengajuan/${created.data.id}`, { action: "approve" })).status, 403);
    const ok = await send("inas", "PATCH", `/tim/pengajuan/${created.data.id}`, { action: "approve", note: "Cepat sembuh" });
    assert.equal(ok.status, 200, JSON.stringify(ok.data));
    assert.equal(ok.data.status, "approved");
    assert.equal(ok.data.reviewerName, "Inas");
    const again = await send("adm", "PATCH", `/admin/pengajuan/${created.data.id}`, { action: "reject" });
    assert.equal(again.status, 409);
    const notif = (await get("risa", "/notifikasi")).data.notifications[0];
    assert.match(notif.body, /disetujui oleh Inas \(kepala unit\)/);
  });

  it("kepala unit tidak bisa menyetujui pengajuannya sendiri; atasan unitnya (Prianka) bisa", async () => {
    const own = await send("inas", "POST", "/pengajuan", {
      kind: "cuti", leaveType: "izin", startDate: "2026-10-29", endDate: "2026-10-29", reason: "Urusan keluarga",
    });
    assert.equal(own.status, 200);
    assert.equal((await send("inas", "PATCH", `/tim/pengajuan/${own.data.id}`, { action: "approve" })).status, 403);
    assert.equal((await get("prianka", "/tim/persetujuan?status=pending")).data.requests[0].employeeName, "Inas");
    assert.equal((await send("prianka", "PATCH", `/tim/pengajuan/${own.data.id}`, { action: "approve" })).status, 200);
  });

  it("pindah unit: kepala unit lama tidak lagi berwenang, kepala unit baru berwenang", async () => {
    const req = await send("febri", "POST", "/pengajuan", {
      kind: "cuti", leaveType: "cuti", startDate: "2026-11-02", endDate: "2026-11-03", reason: "Cuti tahunan",
    });
    assert.equal((await send("adm", "PATCH", "/admin/karyawan/febri", { action: "set_unit", unitId: kasmaId })).status, 200);
    assert.equal((await send("prianka", "PATCH", `/tim/pengajuan/${req.data.id}`, { action: "approve" })).status, 403);
    assert.equal((await send("inas", "PATCH", `/tim/pengajuan/${req.data.id}`, { action: "reject", note: "Bentrok jadwal" })).data.status, "rejected");
  });

  it("clock in di luar zona tanpa alasan tetap ditolak; dengan alasan tercatat menunggu persetujuan", async () => {
    now = T0 + 1 * HOUR;
    const refused = await send("risa", "POST", "/absen", await signedBody("risa", "masuk", outside));
    assert.equal(refused.status, 422);
    assert.equal(refused.data.error.code, "DI_LUAR_AREA");

    const tooShort = await send("risa", "POST", "/absen", await signedBody("risa", "masuk", outside, { outsideReason: "x" }));
    assert.equal(tooShort.status, 400);

    const res = await send("risa", "POST", "/absen", await signedBody("risa", "masuk", outside, { outsideReason: "  Antar   bahan ke sekolah " }));
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.status.today.zoneMasuk.status, "pending");
    assert.equal(res.data.status.today.zoneMasuk.reason, "Antar bahan ke sekolah");
    assert.ok(res.data.status.today.zoneMasuk.distanceM > 1000);
    assert.equal((await recentShifts(env.DB, "risa"))[0].masuk_area_id, null);

    const inasNotif = (await get("inas", "/notifikasi")).data.notifications[0];
    assert.equal(inasNotif.title, "Absen Luar Zona Perlu Persetujuan");
    assert.match(inasNotif.body, /Risa clock in pukul 08:00 WIB di luar zona sekitar \d+ m dari zona/);

    const adminList = await get("adm", "/admin/pengajuan?status=pending");
    const zone = adminList.data.zoneExceptions.find((z) => z.employeeName === "Risa");
    assert.equal(zone.kind, "masuk");
    assert.equal(zone.unitName, "Kasma Katering");
    assert.ok(adminList.data.pendingCount >= 1);

    // Selfie bisa dilihat kepala unitnya, tidak oleh kepala unit lain.
    await insertPhoto(env.PHOTOS, { id: "foto-risa", uid: "risa", kind: "selfie", jpeg: new Uint8Array([0xff, 0xd8, 0xff]), createdAt: now });
    assert.equal((await get("inas", "/tim/foto/foto-risa")).status, 200);
    assert.equal((await get("prianka", "/tim/foto/foto-risa")).status, 404);

    const hariIni = await get("adm", "/admin/hari-ini");
    assert.equal(hariIni.data.rows.find((r) => r.uid === "risa").zoneMasuk.status, "pending");

    assert.equal((await send("prianka", "PATCH", `/tim/luar-zona/${zone.id}`, { action: "approve" })).status, 403);
    const reviewed = await send("inas", "PATCH", `/tim/luar-zona/${zone.id}`, { action: "reject", note: "Tidak ada tugas luar" });
    assert.equal(reviewed.status, 200, JSON.stringify(reviewed.data));
    assert.equal(reviewed.data.status, "rejected");
    assert.equal((await send("adm", "PATCH", `/admin/luar-zona/${zone.id}`, { action: "approve" })).status, 409);

    const rekap = await get("adm", "/admin/rekap?from=2026-10-27&to=2026-10-27");
    const row = rekap.data.rows.find((r) => r.uid === "risa");
    assert.equal(row.zoneMasuk.status, "rejected");
    assert.equal(row.zonePulang, null);
    assert.match((await get("risa", "/notifikasi")).data.notifications[0].title, /Absen Luar Zona Ditolak/);
  });

  it("clock out di luar zona juga perlu persetujuan; admin bisa menyetujui", async () => {
    now = T0 + 2 * HOUR;
    const masuk = await send("joko", "POST", "/absen", await signedBody("joko", "masuk", inside));
    assert.equal(masuk.data.status.today.zoneMasuk, null);
    now = T0 + 10 * HOUR;
    const pulang = await send("joko", "POST", "/absen", await signedBody("joko", "pulang", outside, { outsideReason: "Pulang dari tugas luar" }));
    assert.equal(pulang.status, 200, JSON.stringify(pulang.data));
    assert.equal(pulang.data.status.today.zonePulang.status, "pending");
    const zone = (await get("adm", "/admin/pengajuan?status=pending")).data.zoneExceptions.find((z) => z.employeeName === "Joko");
    const ok = await send("adm", "PATCH", `/admin/luar-zona/${zone.id}`, { action: "approve" });
    assert.equal(ok.data.status, "approved");
    assert.equal(ok.data.reviewerName, "Admin");
  });

  it("masuk di hari Silah: notifikasi ke kepala unit + admin, kepala unitnya menolak, rekap ikut", async () => {
    now = T0 + 3 * HOUR; // Selasa 27 Okt 10:00 WIB, Silah Febri (sekarang anggota Kasma, kepala Inas)
    await setSilah(env.DB, { uid: "febri", days: [2], effectiveFrom: "2026-10-01", nowMs: T0, byUid: "adm" });
    const inasBefore = (await get("inas", "/notifikasi")).data.unreadCount;
    const masuk = await send("febri", "POST", "/absen", await signedBody("febri", "masuk", inside, { silahReason: "Ada pesanan katering besar" }));
    assert.equal(masuk.status, 200, JSON.stringify(masuk.data));
    assert.equal(masuk.data.status.today.silahMasuk.status, "pending");

    assert.equal((await get("inas", "/notifikasi")).data.unreadCount, inasBefore + 1);
    const inasNotif = (await get("inas", "/notifikasi")).data.notifications[0];
    assert.equal(inasNotif.title, "Masuk di Hari Silah Perlu Persetujuan");
    assert.match(inasNotif.body, /Febri clock in pukul 10:00 WIB di hari Silah-nya: "Ada pesanan katering besar"/);
    assert.ok((await get("inas", "/me")).data.teamPending >= 1);

    const team = await get("inas", "/tim/persetujuan?status=pending");
    const item = team.data.silahExceptions.find((x) => x.employeeName === "Febri");
    assert.equal(item.workDate, "2026-10-27");
    assert.equal(item.unitName, "Kasma Katering");
    assert.ok(item.photoId);
    assert.equal((await get("prianka", "/tim/persetujuan?status=pending")).data.silahExceptions.length, 0);

    assert.equal((await send("prianka", "PATCH", `/tim/silah/${item.id}`, { action: "approve" })).status, 403);
    assert.equal((await send("febri", "PATCH", `/tim/silah/${item.id}`, { action: "approve" })).status, 403);
    const rejected = await send("inas", "PATCH", `/tim/silah/${item.id}`, { action: "reject", note: "Tidak ada jadwal tambahan" });
    assert.equal(rejected.status, 200, JSON.stringify(rejected.data));
    assert.equal(rejected.data.status, "rejected");
    assert.equal((await send("adm", "PATCH", `/admin/silah/${item.id}`, { action: "approve" })).status, 409);
    const febriNotif = (await get("febri", "/notifikasi")).data.notifications[0];
    assert.equal(febriNotif.title, "Masuk di Hari Silah Ditolak");
    assert.match(febriNotif.body, /ditolak oleh Inas \(kepala unit\)\. Catatan: "Tidak ada jadwal tambahan"/);

    const rekap = await get("adm", "/admin/rekap?from=2026-10-27&to=2026-10-27&uid=febri");
    assert.equal(rekap.data.rows[0].silahMasuk.status, "rejected");
    const hariIni = (await get("adm", "/admin/hari-ini")).data.rows.find((r) => r.uid === "febri");
    assert.equal(hariIni.silahMasuk.status, "rejected");
    assert.equal((await get("adm", "/admin/pengajuan?status=rejected")).data.silahExceptions.length, 1);
  });

  it("admin mengganti kepala unit", async () => {
    const res = await send("adm", "PATCH", `/admin/unit/${kasmaId}`, { name: "Kasma Katering", headUid: "joko" });
    assert.equal(res.status, 200, JSON.stringify(res.data));
    assert.equal(res.data.units.find((u) => u.id === kasmaId).headName, "Joko");
    assert.equal((await get("inas", "/tim/persetujuan")).status, 403);
    assert.equal((await get("joko", "/tim/persetujuan")).status, 200);
  });
});
