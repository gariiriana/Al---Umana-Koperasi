import assert from "node:assert/strict";
import { after, before, describe, it } from "node:test";
import { addEmployee, call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("pengajuan cuti, pergantian shift, dan notifikasi", () => {
  let env;
  let dispose;
  const deps = fakeDeps();

  before(async () => {
    ({ env, dispose } = await makeEnv());
    await addEmployee(env, { uid: "adm", email: "adm@absen.test", name: "Admin Utama", role: "admin_absensi" });
    await addEmployee(env, { uid: "u1", email: "u1@absen.test", name: "Budi Santoso", role: "absen_karyawan" });
    await addEmployee(env, { uid: "u2", email: "u2@absen.test", name: "Siti Aminah", role: "absen_karyawan" });
  });
  after(() => dispose());

  it("mengembalikan daftar rekan kerja aktif selain diri sendiri", async () => {
    const res = await call(env, deps, "GET", "/rekan", { token: "u1" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data.coworkers, [{ uid: "u2", name: "Siti Aminah" }]);
  });

  it("mengajukan cuti -> notifikasi masuk ke admin -> admin setujui -> notifikasi balik & masuk ke riwayat/hari-ini/rekap", async () => {
    const createRes = await call(env, deps, "POST", "/pengajuan", {
      token: "u1",
      body: {
        kind: "cuti",
        leaveType: "cuti",
        startDate: "2026-10-27",
        endDate: "2026-10-28",
        reason: "Acara keluarga di luar kota",
      },
    });
    assert.equal(createRes.status, 200, JSON.stringify(createRes.data));
    assert.equal(createRes.data.status, "pending");
    assert.equal(createRes.data.employeeName, "Budi Santoso");
    const reqId = createRes.data.id;

    // Admin menerima notifikasi pengajuan baru
    const adminNotif = await call(env, deps, "GET", "/notifikasi", { token: "adm" });
    assert.equal(adminNotif.status, 200);
    assert.equal(adminNotif.data.unreadCount, 1);
    assert.equal(adminNotif.data.notifications[0].kind, "pengajuan_baru");
    assert.equal(adminNotif.data.notifications[0].requestId, reqId);

    // Admin menandai notifikasi dibaca
    const readAdmin = await call(env, deps, "POST", "/notifikasi/baca", {
      token: "adm",
      body: { id: adminNotif.data.notifications[0].id },
    });
    assert.equal(readAdmin.data.unreadCount, 0);

    // Admin menyetujui pengajuan dengan catatan
    const approveRes = await call(env, deps, "PATCH", `/admin/pengajuan/${reqId}`, {
      token: "adm",
      body: { action: "approve", note: "Silakan, hati-hati di jalan" },
    });
    assert.equal(approveRes.status, 200);
    assert.equal(approveRes.data.status, "approved");
    assert.equal(approveRes.data.reviewerName, "Admin Utama");

    // Tidak bisa diproses dua kali
    const doubleRes = await call(env, deps, "PATCH", `/admin/pengajuan/${reqId}`, {
      token: "adm",
      body: { action: "reject" },
    });
    assert.equal(doubleRes.status, 409);
    assert.equal(doubleRes.data.error.code, "SUDAH_DIPROSES");

    // Karyawan menerima notifikasi persetujuan
    const empNotif = await call(env, deps, "GET", "/notifikasi", { token: "u1" });
    assert.equal(empNotif.data.unreadCount, 1);
    assert.equal(empNotif.data.notifications[0].kind, "pengajuan_disetujui");
    assert.match(empNotif.data.notifications[0].body, /Silakan, hati-hati di jalan/);

    // Masuk ke /riwayat bulan 2026-10, /admin/hari-ini (T0 = 2026-10-27), dan /admin/rekap
    const riwayat = await call(env, deps, "GET", "/riwayat?bulan=2026-10", { token: "u1" });
    assert.equal(riwayat.data.requests.length, 1);
    assert.equal(riwayat.data.requests[0].status, "approved");

    const hariIni = await call(env, deps, "GET", "/admin/hari-ini", { token: "adm" });
    const budiToday = hariIni.data.rows.find((r) => r.uid === "u1");
    assert.equal(budiToday.leaveType, "cuti");

    const rekap = await call(env, deps, "GET", "/admin/rekap?from=2026-10-01&to=2026-10-31", { token: "adm" });
    assert.equal(rekap.data.requests.length, 1);
    assert.equal(rekap.data.requests[0].id, reqId);
  });

  it("mengajukan pergantian shift dengan rekan dan menolaknya", async () => {
    const swapRes = await call(env, deps, "POST", "/pengajuan", {
      token: "u2",
      body: {
        kind: "pergantian_shift",
        date: "2026-10-27",
        fromShift: "Shift Pagi (07:00 - 15:00)",
        toShift: "Shift Sore (15:00 - 23:00)",
        partnerUid: "u1",
        reason: "Ada jadwal kontrol dokter pagi",
      },
    });
    assert.equal(swapRes.status, 200, JSON.stringify(swapRes.data));
    assert.equal(swapRes.data.partnerName, "Budi Santoso");

    const listPending = await call(env, deps, "GET", "/admin/pengajuan?status=pending", { token: "adm" });
    assert.equal(listPending.data.pendingCount, 1);
    assert.equal(listPending.data.requests.length, 1);

    const rejectRes = await call(env, deps, "PATCH", `/admin/pengajuan/${swapRes.data.id}`, {
      token: "adm",
      body: { action: "reject", note: "Budi sedang cuti di tanggal tersebut" },
    });
    assert.equal(rejectRes.status, 200);
    assert.equal(rejectRes.data.status, "rejected");

    const u2Notif = await call(env, deps, "GET", "/notifikasi", { token: "u2" });
    assert.equal(u2Notif.data.unreadCount, 1);
    assert.equal(u2Notif.data.notifications[0].kind, "pengajuan_ditolak");
  });

  it("menolak input pengajuan yang tidak valid", async () => {
    assert.equal((await call(env, deps, "POST", "/pengajuan", {
      token: "u1",
      body: { kind: "cuti", leaveType: "cuti", startDate: "2026-10-29", endDate: "2026-10-27", reason: "Salah tanggal" },
    })).status, 400);
    assert.equal((await call(env, deps, "POST", "/pengajuan", {
      token: "u1",
      body: { kind: "pergantian_shift", date: "2026-10-29", fromShift: "Pagi", toShift: "Pagi", reason: "Sama" },
    })).status, 400);
  });
});

