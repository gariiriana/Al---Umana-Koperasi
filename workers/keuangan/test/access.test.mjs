// Skenario 8: Kontrol akses role `keuangan` vs semua role lain (termasuk super_admin dan developer).
import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("Skenario 8: Akses & Keamanan Role Keuangan", () => {
  let ctx;
  const deps = fakeDeps();

  before(async () => {
    ctx = await makeEnv();
  });
  after(async () => {
    await ctx.dispose();
  });

  it("401 tanpa token atau token tidak valid", async () => {
    const r1 = await call(ctx.env, deps, "GET", "/me", { token: "" });
    assert.equal(r1.status, 401);
    const r2 = await call(ctx.env, { ...deps, verifyToken: async () => null }, "GET", "/me", { token: "bad" });
    assert.equal(r2.status, 401);
  });

  it("403 untuk semua role selain keuangan, termasuk super_admin dan developer", async () => {
    for (const uid of ["super_admin", "developer", "toksan", "admin", "kurir", "unknown_uid"]) {
      const rMe = await call(ctx.env, deps, "GET", "/me", { token: uid });
      assert.equal(rMe.status, 403, `GET /me untuk ${uid} harus 403`);

      const rUnits = await call(ctx.env, deps, "GET", "/units", { token: uid });
      assert.equal(rUnits.status, 403, `GET /units untuk ${uid} harus 403`);

      const rReport = await call(ctx.env, deps, "GET", "/reports/neraca?sampai=2026-01-31", { token: uid });
      assert.equal(rReport.status, 403, `GET /reports/neraca untuk ${uid} harus 403`);
    }
  });

  it("200 untuk role keuangan dan menginisialisasi data bawaan tanpa anak perusahaan", async () => {
    const rMe = await call(ctx.env, deps, "GET", "/me", { token: "keuangan1" });
    assert.equal(rMe.status, 200);
    assert.equal(rMe.data.role, "keuangan");
    assert.equal(rMe.data.onboarding.hasUnits, false);

    const rCoa = await call(ctx.env, deps, "GET", "/accounts", { token: "keuangan1" });
    assert.equal(rCoa.status, 200);
    assert.ok(rCoa.data.accounts.length >= 75);
    assert.equal(rCoa.data.categories.length, 17);
  });
});
