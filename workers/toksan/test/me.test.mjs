import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { call, fakeDeps, makeEnv } from "./helpers.mjs";

describe("GET /me and access control", () => {
  let ctx;
  before(async () => { ctx = await makeEnv(); });
  after(async () => { await ctx.dispose(); });

  it("401 UNAUTHENTICATED without token", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/me");
    assert.equal(res.status, 401);
    assert.equal(res.data.error.code, "UNAUTHENTICATED");
  });

  it("401 UNAUTHENTICATED with an invalid token", async () => {
    const res = await call(ctx.env, fakeDeps({ verifyToken: async () => null }), "GET", "/me", { token: "x" });
    assert.equal(res.status, 401);
  });

  it("403 FORBIDDEN for a role outside toksan/super_admin/developer", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/me", { token: "kurir" });
    assert.equal(res.status, 403);
    assert.equal(res.data.error.code, "FORBIDDEN");
  });

  it("403 FORBIDDEN when the user has no profile", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/me", { token: "ghost" });
    assert.equal(res.status, 403);
  });

  it("200 with uid, role and name for the Toksan admin", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/me", { token: "admin" });
    assert.equal(res.status, 200);
    assert.deepEqual(res.data, { uid: "admin", role: "toksan", name: "Nabila" });
  });

  it("super_admin may open Toksan", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/me", { token: "boss" });
    assert.equal(res.status, 200);
  });

  it("404 NOT_FOUND for an unknown path", async () => {
    const res = await call(ctx.env, fakeDeps(), "GET", "/nope", { token: "admin" });
    assert.equal(res.status, 404);
    assert.equal(res.data.error.code, "NOT_FOUND");
  });

  it("OPTIONS from the allowed origin answers 204 with CORS", async () => {
    const res = await call(ctx.env, fakeDeps(), "OPTIONS", "/me", { origin: "http://localhost:5174" });
    assert.equal(res.status, 204);
    assert.equal(res.headers.get("access-control-allow-origin"), "http://localhost:5174");
  });
});
