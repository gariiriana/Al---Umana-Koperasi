// `node --test rate-limit.test.mjs`
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { tooManyRequests, withinLimit } from "./rate-limit.js";

describe("withinLimit", () => {
  it("asks the limiter with the caller's key and follows its answer", async () => {
    const keys = [];
    const limiter = { limit: async ({ key }) => { keys.push(key); return { success: key !== "203.0.113.9" }; } };
    assert.equal(await withinLimit(limiter, "198.51.100.1"), true);
    assert.equal(await withinLimit(limiter, "203.0.113.9"), false);
    assert.deepEqual(keys, ["198.51.100.1", "203.0.113.9"]);
  });
  it("never blocks real traffic when the limiter is missing, has no key, or breaks", async () => {
    assert.equal(await withinLimit(undefined, "198.51.100.1"), true);
    assert.equal(await withinLimit({ limit: async () => ({ success: false }) }, ""), true);
    assert.equal(await withinLimit({ limit: async () => { throw new Error("down"); } }, "198.51.100.1"), true);
  });
});

describe("tooManyRequests", () => {
  it("answers 429 with Retry-After and keeps the CORS headers", async () => {
    const response = tooManyRequests({ "access-control-allow-origin": "https://koperasi-alumana.com" });
    assert.equal(response.status, 429);
    assert.equal(response.headers.get("retry-after"), "60");
    assert.equal(response.headers.get("access-control-allow-origin"), "https://koperasi-alumana.com");
    assert.equal((await response.json()).error.code, "RATE_LIMITED");
  });
});
