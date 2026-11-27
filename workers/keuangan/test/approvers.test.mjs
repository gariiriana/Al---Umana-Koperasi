import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("GET /approvers (pemilih penyetuju pakai nama)", () => {
  it("role keuangan dapat daftar nama; role lain ditolak", async () => {
    const ctx = await makeEnv();
    const deps = fakeDeps({
      listKeuanganUsers: async () => [{ uid: "u1", nama: "Bu Inas", email: "inas@x.test", secret: "jangan-bocor" }],
    });
    const ok = await call(ctx.env, deps, "GET", "/approvers");
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.data.approvers, [{ uid: "u1", nama: "Bu Inas", email: "inas@x.test" }]);
    const denied = await call(ctx.env, deps, "GET", "/approvers", { token: "kurir" });
    assert.equal(denied.status, 403);
    await ctx.dispose();
  });
});
