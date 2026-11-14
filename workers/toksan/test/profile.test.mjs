import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getUserProfile } from "../src/profile.js";

const env = { FIREBASE_PROJECT_ID: "demo-test", FIRESTORE_EMULATOR_HOST: "127.0.0.1:8080" };
const doc = (fields) => new Response(JSON.stringify({ fields }), { status: 200 });

describe("getUserProfile", () => {
  it("reads role and prefers holderName for the name", async () => {
    const fetchImpl = async () => doc({ role: { stringValue: "toksan" }, holderName: { stringValue: "Nabila" }, displayName: { stringValue: "toksan@" } });
    assert.deepEqual(await getUserProfile(env, "p1", { fetchImpl, now: 1 }), { role: "toksan", name: "Nabila" });
  });

  it("falls back to displayName, then email", async () => {
    const fetchImpl = async () => doc({ role: { stringValue: "toksan" }, email: { stringValue: "a@b.id" } });
    assert.equal((await getUserProfile(env, "p2", { fetchImpl, now: 1 })).name, "a@b.id");
  });

  it("returns null for a missing user document", async () => {
    const fetchImpl = async () => new Response("{}", { status: 404 });
    assert.equal(await getUserProfile(env, "p3", { fetchImpl, now: 1 }), null);
  });

  it("caches for 5 minutes per uid", async () => {
    let calls = 0;
    const fetchImpl = async () => { calls++; return doc({ role: { stringValue: "toksan" } }); };
    await getUserProfile(env, "p4", { fetchImpl, now: 1_000 });
    await getUserProfile(env, "p4", { fetchImpl, now: 1_000 + 299_000 });
    assert.equal(calls, 1);
    await getUserProfile(env, "p4", { fetchImpl, now: 1_000 + 301_000 });
    assert.equal(calls, 2);
  });

  it("throws on other Firestore errors instead of treating the user as missing", async () => {
    const fetchImpl = async () => new Response("{}", { status: 500 });
    await assert.rejects(getUserProfile(env, "p5", { fetchImpl, now: 1 }));
  });

  it("uses the emulator URL with the owner token for demo projects", async () => {
    let seen;
    const fetchImpl = async (url, init) => { seen = { url, auth: init.headers.authorization }; return doc({}); };
    await getUserProfile(env, "p6", { fetchImpl, now: 1 });
    assert.equal(seen.url, "http://127.0.0.1:8080/v1/projects/demo-test/databases/(default)/documents/users/p6");
    assert.equal(seen.auth, "Bearer owner");
  });
});
