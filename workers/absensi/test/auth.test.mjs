import assert from "node:assert/strict";
import { before, describe, it } from "node:test";
import { verifyIdToken } from "../src/auth.js";
import { createAuthUser, setAuthDisabled, setClaims } from "../src/identity.js";
import { AbsensiError } from "../src/http.js";

const b64u = (v) => Buffer.from(typeof v === "string" ? v : JSON.stringify(v)).toString("base64url");
const now = () => Math.floor(Date.now() / 1000);
const payloadFor = (project, over = {}) => ({
  iss: `https://securetoken.google.com/${project}`, aud: project, sub: "uid-1",
  iat: now() - 10, exp: now() + 3600, absensi_role: "absen_karyawan", ...over,
});
const emulatorToken = (payload) => `${b64u({ alg: "none", typ: "JWT" })}.${b64u(payload)}.`;
const EMU = { FIREBASE_PROJECT_ID: "demo-alumana", AUTH_EMULATOR_HOST: "127.0.0.1:9099" };

describe("verifyIdToken (emulator)", () => {
  it("accepts unsigned emulator tokens only for demo-* projects with the emulator host set", async () => {
    const token = emulatorToken(payloadFor("demo-alumana"));
    const ok = await verifyIdToken(token, EMU);
    assert.equal(ok.uid, "uid-1");
    assert.equal(ok.claims.absensi_role, "absen_karyawan");
    assert.equal(await verifyIdToken(emulatorToken(payloadFor("al-umana-koperasi")), { ...EMU, FIREBASE_PROJECT_ID: "al-umana-koperasi" }), null);
    assert.equal(await verifyIdToken(token, { FIREBASE_PROJECT_ID: "demo-alumana" }), null);
  });
  it("rejects expired tokens and the wrong audience", async () => {
    assert.equal(await verifyIdToken(emulatorToken(payloadFor("demo-alumana", { exp: now() - 1 })), EMU), null);
    assert.equal(await verifyIdToken(emulatorToken(payloadFor("demo-alumana", { aud: "other" })), EMU), null);
    assert.equal(await verifyIdToken("garbage", EMU), null);
  });
});

describe("verifyIdToken (RS256)", () => {
  let keys;
  let jwksFetch;
  const project = "al-umana-koperasi";
  const sign = async (payload) => {
    const head = b64u({ alg: "RS256", kid: "k1", typ: "JWT" });
    const body = b64u(payload);
    const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", keys.privateKey, new TextEncoder().encode(`${head}.${body}`));
    return `${head}.${body}.${Buffer.from(sig).toString("base64url")}`;
  };
  before(async () => {
    keys = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const jwk = { ...(await crypto.subtle.exportKey("jwk", keys.publicKey)), kid: "k1", alg: "RS256" };
    jwksFetch = async () => new Response(JSON.stringify({ keys: [jwk] }), { headers: { "cache-control": "max-age=60" } });
  });
  it("accepts a token signed by a published key and rejects a tampered one", async () => {
    const token = await sign(payloadFor(project));
    assert.equal((await verifyIdToken(token, { FIREBASE_PROJECT_ID: project }, { jwksFetch })).uid, "uid-1");
    const [h, , s] = token.split(".");
    const forged = `${h}.${b64u(payloadFor(project, { sub: "someone-else" }))}.${s}`;
    assert.equal(await verifyIdToken(forged, { FIREBASE_PROJECT_ID: project }, { jwksFetch }), null);
  });
});

describe("identity", () => {
  const recorder = (reply) => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init, body: init?.body ? JSON.parse(init.body) : null });
      return new Response(JSON.stringify(reply(String(url))), { status: reply(String(url)).error ? 400 : 200 });
    };
    return { calls, fetchImpl };
  };

  it("creates emulator accounts with the owner token", async () => {
    const { calls, fetchImpl } = recorder(() => ({ localId: "new-uid" }));
    const uid = await createAuthUser(EMU, { email: "a@absen.test", password: "rahasia123", displayName: "A" }, fetchImpl);
    assert.equal(uid, "new-uid");
    assert.equal(calls[0].url, "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/projects/demo-alumana/accounts");
    assert.equal(calls[0].init.headers.authorization, "Bearer owner");
    assert.deepEqual(calls[0].body, { email: "a@absen.test", password: "rahasia123", displayName: "A" });
  });

  it("maps EMAIL_EXISTS to EMAIL_SUDAH_ADA", async () => {
    const { fetchImpl } = recorder(() => ({ error: { message: "EMAIL_EXISTS" } }));
    await assert.rejects(createAuthUser(EMU, { email: "a@absen.test", password: "x".repeat(8), displayName: "A" }, fetchImpl),
      (e) => e instanceof AbsensiError && e.code === "EMAIL_SUDAH_ADA" && e.status === 409);
  });

  it("sends custom claims as a JSON string and can disable accounts", async () => {
    const { calls, fetchImpl } = recorder(() => ({ localId: "u" }));
    await setClaims(EMU, "u", { absensi_role: "admin_absensi" }, fetchImpl);
    await setAuthDisabled(EMU, "u", true, fetchImpl);
    assert.match(calls[0].url, /\/accounts:update$/);
    assert.deepEqual(calls[0].body, { localId: "u", customAttributes: "{\"absensi_role\":\"admin_absensi\"}" });
    assert.deepEqual(calls[1].body, { localId: "u", disableUser: true });
  });

  it("uses a service-account OAuth token in production", async () => {
    const pair = await crypto.subtle.generateKey(
      { name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
    const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", pair.privateKey)).toString("base64");
    const env = {
      FIREBASE_PROJECT_ID: "al-umana-koperasi", FIREBASE_CLIENT_EMAIL: "sa@example.iam.gserviceaccount.com",
      FIREBASE_PRIVATE_KEY: `-----BEGIN PRIVATE KEY-----\\n${pkcs8}\\n-----END PRIVATE KEY-----\\n`,
    };
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push({ url: String(url), init });
      const body = String(url).startsWith("https://oauth2.googleapis.com/") ? { access_token: "tok", expires_in: 3600 } : { localId: "prod-uid" };
      return new Response(JSON.stringify(body));
    };
    assert.equal(await createAuthUser(env, { email: "b@absen.test", password: "rahasia123", displayName: "B" }, fetchImpl), "prod-uid");
    assert.equal(calls[1].url, "https://identitytoolkit.googleapis.com/v1/projects/al-umana-koperasi/accounts");
    assert.equal(calls[1].init.headers.authorization, "Bearer tok");
  });
});
