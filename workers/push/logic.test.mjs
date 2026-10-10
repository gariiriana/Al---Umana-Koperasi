// node --test workers/push/logic.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildMessage, classifyFcmError, decodeValue, encodeValue, finalStatus, planBatch,
  resolveRecipient, safeLink, selectCandidates, targetsFor, MAX_AGE_MS, STALE_CLAIM_MS,
} from "./logic.js";

const now = Date.parse("2026-10-10T10:00:00Z");
const iso = (ms) => new Date(ms).toISOString();

test("role recipients expand to every alias that sees the same work", () => {
  assert.deepEqual(resolveRecipient("tim_produksi"), { kind: "role", roles: ["tim_produksi", "produksi_1"] });
  assert.ok(resolveRecipient("produksi_1").roles.includes("MBG2"));
  assert.ok(resolveRecipient("distribusi_2").roles.includes("distribusi_mbg_2"));
  assert.ok(resolveRecipient("produksi_mbg").roles.includes("produksi_mbg_2"));
  assert.deepEqual(resolveRecipient("Xy12abcDEF34ghiJKL56mnoP78qr"), { kind: "uid", uid: "Xy12abcDEF34ghiJKL56mnoP78qr" });
});

test("pending is sent, fresh 'sending' is left to its owner, stale claim and old news handled", () => {
  const { ready, expired } = selectCandidates([
    { id: "a", recipientId: "admin", pushStatus: "pending", createdAt: iso(now - 1000) },
    { id: "b", recipientId: "admin", pushStatus: "sending", pushClaimedAt: iso(now - 10_000), createdAt: iso(now - 20_000) },
    { id: "c", recipientId: "admin", pushStatus: "sending", pushClaimedAt: iso(now - STALE_CLAIM_MS - 1), createdAt: iso(now - 300_000) },
    { id: "d", recipientId: "admin", pushStatus: "pending", createdAt: iso(now - MAX_AGE_MS - 1) },
    { id: "e", recipientId: "admin", pushStatus: "sent", createdAt: iso(now) },
  ], now);
  assert.deepEqual(ready.map((n) => n.id), ["c", "a"]); // oldest first
  assert.deepEqual(expired.map((n) => n.id), ["d"]);
});

test("role broadcast skips the actor's own phone; direct test notification reaches it", () => {
  const devices = [
    { name: "d1", token: "t1", uid: "mo" },
    { name: "d2", token: "t2", uid: "joko" },
    { name: "d3", token: "t2", uid: "joko" }, // duplicate token
  ];
  assert.deepEqual(targetsFor({ recipientId: "produksi_1", actorUid: "mo" }, devices).map((d) => d.name), ["d2"]);
  assert.deepEqual(targetsFor({ recipientId: "mo", actorUid: "mo" }, [devices[0]]).map((d) => d.name), ["d1"]);
});

test("batch respects the subrequest budget and never stalls on a huge broadcast", () => {
  const ready = [
    { id: "1", recipientId: "admin" },
    { id: "2", recipientId: "kurir_mbg" },
    { id: "3", recipientId: "admin" },
  ];
  const devices = {
    admin: [{ token: "a1" }, { token: "a2" }],
    kurir_mbg: Array.from({ length: 5 }, (_, i) => ({ token: `k${i}` })),
  };
  const plan = planBatch(ready, devices, 6);
  assert.deepEqual(plan.map((p) => [p.notification.id, p.targets.length]), [["1", 2]]);
  const big = planBatch([ready[1]], devices, 3);
  assert.deepEqual(big.map((p) => [p.notification.id, p.targets.length]), [["2", 3]]);
});

test("FCM message is data-only with a safe same-origin link", () => {
  const msg = buildMessage({ id: "n1", title: "Job desk baru", message: "Masak 200 porsi", link: "/katering/jobdesk", type: "jobdesk" }, "tok");
  assert.equal(msg.message.token, "tok");
  assert.equal(msg.message.notification, undefined);
  assert.equal(msg.message.data.url, "/katering/jobdesk");
  assert.ok(Object.values(msg.message.data).every((v) => typeof v === "string"));
  assert.equal(safeLink("https://evil.example"), "/");
  assert.equal(safeLink("//evil.example"), "/");
});

test("FCM errors: dead tokens removed, auth problems fail, others retry", () => {
  assert.equal(classifyFcmError(404, null), "invalid");
  assert.equal(classifyFcmError(400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }), "invalid");
  assert.equal(classifyFcmError(403, { error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } }), "invalid");
  assert.equal(classifyFcmError(403, { error: { status: "PERMISSION_DENIED" } }), "auth");
  assert.equal(classifyFcmError(503, null), "retry");
});

test("final status", () => {
  assert.equal(finalStatus(0, [], 0), "no_devices");
  assert.equal(finalStatus(2, ["ok", "invalid"], 0), "sent");
  assert.equal(finalStatus(1, ["invalid"], 0), "no_devices");
  assert.equal(finalStatus(1, ["auth"], 0), "failed");
  assert.equal(finalStatus(1, ["retry"], 0), "pending");
  assert.equal(finalStatus(1, ["retry"], 2), "failed");
});

test("Firestore value codec round-trips", () => {
  const value = { a: "x", n: 3, f: 1.5, b: true, z: null, list: ["p", 2] };
  assert.deepEqual(decodeValue(encodeValue(value)), value);
  assert.equal(encodeValue(new Date(now)).timestampValue, iso(now));
});
