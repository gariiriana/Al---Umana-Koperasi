// node --test workers/push/security.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  APP_CHECK_AUDIENCE, APP_CHECK_TTL_SECONDS, handleAppCheckToken, handleCspReport, summarizeCspReports,
} from "./security.js";

const env = {
  FIREBASE_PROJECT_ID: "al-umana-koperasi",
  FIREBASE_APP_ID: "1:238836777828:web:29f9786375e2c7ad61f071",
  FIREBASE_CLIENT_EMAIL: "firebase-adminsdk@al-umana-koperasi.iam.gserviceaccount.com",
  TURNSTILE_APPCHECK_SECRET: "turnstile-secret",
};
const NOW = 1_800_000_000_000;

function post(body, headers = {}) {
  return new Request("https://koperasi-alumana.com/api/security/app-check-token", {
    method: "POST",
    headers: { "content-type": "application/json", "cf-connecting-ip": "203.0.113.7", ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

/** Fake dependencies; `siteverify` and `exchange` decide what Google/Cloudflare answer. */
function deps({ siteverify = { success: true, hostname: "koperasi-alumana.com", action: "app-check" }, exchange } = {}) {
  const calls = { fetch: [], signed: [] };
  return {
    calls,
    now: () => NOW,
    getAccessToken: async () => "access-token",
    signJwt: async (claims) => { calls.signed.push(claims); return "custom.jwt.token"; },
    fetch: async (url, init) => {
      calls.fetch.push({ url, init });
      if (url.startsWith("https://challenges.cloudflare.com/")) return Response.json(siteverify);
      if (url.startsWith("https://firebaseappcheck.googleapis.com/")) {
        return exchange ?? Response.json({ token: "app-check-token", ttl: `${APP_CHECK_TTL_SECONDS}s` });
      }
      throw new Error(`unexpected fetch ${url}`);
    },
  };
}

test("valid Turnstile token is verified and exchanged for an App Check token", async () => {
  const d = deps();
  const res = await handleAppCheckToken(post({ turnstileToken: "tt-123" }), env, d);
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { token: "app-check-token", expireTimeMillis: NOW + APP_CHECK_TTL_SECONDS * 1000 });

  const verify = d.calls.fetch[0];
  assert.equal(verify.url, "https://challenges.cloudflare.com/turnstile/v0/siteverify");
  const form = new URLSearchParams(verify.init.body);
  assert.equal(form.get("secret"), "turnstile-secret");
  assert.equal(form.get("response"), "tt-123");
  assert.equal(form.get("remoteip"), "203.0.113.7");

  const [claims] = d.calls.signed;
  assert.equal(claims.iss, env.FIREBASE_CLIENT_EMAIL);
  assert.equal(claims.sub, env.FIREBASE_CLIENT_EMAIL);
  assert.equal(claims.aud, APP_CHECK_AUDIENCE);
  assert.equal(claims.app_id, env.FIREBASE_APP_ID);
  assert.equal(claims.ttl, `${APP_CHECK_TTL_SECONDS}s`);
  assert.equal(claims.exp - claims.iat, 300);

  const exchange = d.calls.fetch[1];
  assert.equal(exchange.url,
    "https://firebaseappcheck.googleapis.com/v1/projects/al-umana-koperasi/apps/1:238836777828:web:29f9786375e2c7ad61f071:exchangeCustomToken");
  assert.equal(exchange.init.headers.authorization, "Bearer access-token");
  assert.deepEqual(JSON.parse(exchange.init.body), { customToken: "custom.jwt.token" });
});

test("expiry follows the ttl Google actually granted", async () => {
  const d = deps({ exchange: Response.json({ token: "t", ttl: "3600s" }) });
  const res = await handleAppCheckToken(post({ turnstileToken: "tt" }), env, d);
  assert.equal((await res.json()).expireTimeMillis, NOW + 3_600_000);
});

test("failed Turnstile check is refused without minting anything", async () => {
  const d = deps({ siteverify: { success: false, "error-codes": ["invalid-input-response"] } });
  const res = await handleAppCheckToken(post({ turnstileToken: "bad" }), env, d);
  assert.equal(res.status, 403);
  assert.equal(d.calls.signed.length, 0);
});

test("Turnstile token solved on another hostname or for another action is refused", async () => {
  for (const siteverify of [
    { success: true, hostname: "evil.example", action: "app-check" },
    { success: true, hostname: "koperasi-alumana.com", action: "login" },
  ]) {
    const d = deps({ siteverify });
    const res = await handleAppCheckToken(post({ turnstileToken: "tt" }), env, d);
    assert.equal(res.status, 403);
    assert.equal(d.calls.signed.length, 0);
  }
});

test("malformed, missing or oversized input is rejected before calling Cloudflare", async () => {
  for (const body of ["not json", {}, { turnstileToken: 42 }, { turnstileToken: "" }, { turnstileToken: "x".repeat(2049) }]) {
    const d = deps();
    const res = await handleAppCheckToken(post(body), env, d);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 40));
    assert.equal(d.calls.fetch.length, 0);
  }
  const d = deps();
  const res = await handleAppCheckToken(post(JSON.stringify({ turnstileToken: "t", pad: "x".repeat(5000) })), env, d);
  assert.equal(res.status, 413);
});

test("non-POST is refused", async () => {
  const req = new Request("https://koperasi-alumana.com/api/security/app-check-token", { method: "GET" });
  assert.equal((await handleAppCheckToken(req, env, deps())).status, 405);
});

test("missing configuration answers 503 instead of crashing", async () => {
  const res = await handleAppCheckToken(post({ turnstileToken: "tt" }), { ...env, TURNSTILE_APPCHECK_SECRET: "" }, deps());
  assert.equal(res.status, 503);
});

test("Google exchange failure answers 502", async () => {
  const d = deps({ exchange: new Response("denied", { status: 403 }) });
  const res = await handleAppCheckToken(post({ turnstileToken: "tt" }), env, d);
  assert.equal(res.status, 502);
});

test("CSP reports in both browser formats are summarized without query strings", () => {
  const legacy = { "csp-report": {
    "document-uri": "https://koperasi-alumana.com/admin/orders?token=secret",
    "violated-directive": "script-src-elem",
    "blocked-uri": "https://evil.example/x.js?a=1",
    "source-file": "https://koperasi-alumana.com/assets/index.js", "line-number": 12,
  } };
  const reportingApi = [{ type: "csp-violation", body: {
    documentURL: "https://koperasi-alumana.com/mbg", effectiveDirective: "connect-src",
    blockedURL: "https://api.example.com/v1?k=2", disposition: "report",
  } }];
  assert.deepEqual(summarizeCspReports(legacy), [{
    directive: "script-src-elem", blocked: "https://evil.example/x.js", page: "/admin/orders",
    source: "https://koperasi-alumana.com/assets/index.js:12",
  }]);
  assert.deepEqual(summarizeCspReports(reportingApi), [{
    directive: "connect-src", blocked: "https://api.example.com/v1", page: "/mbg", source: "",
  }]);
});

test("CSP noise from browser extensions is dropped and the list is capped", () => {
  const many = Array.from({ length: 30 }, (_, i) => ({ type: "csp-violation", body: {
    documentURL: "https://koperasi-alumana.com/", effectiveDirective: "img-src", blockedURL: `https://x${i}.example/a.png`,
  } }));
  many.push({ type: "csp-violation", body: { documentURL: "https://koperasi-alumana.com/", effectiveDirective: "script-src", blockedURL: "chrome-extension://abc/x.js" } });
  const out = summarizeCspReports(many);
  assert.equal(out.length, 10);
  assert.ok(out.every((r) => !r.blocked.startsWith("chrome-extension")));
});

test("CSP report endpoint logs and answers 204; garbage and huge bodies still get 204/413", async () => {
  const logged = [];
  const log = (...args) => logged.push(args);
  const report = (body) => new Request("https://koperasi-alumana.com/api/security/csp-report", {
    method: "POST", headers: { "content-type": "application/csp-report" }, body,
  });
  const ok = await handleCspReport(report(JSON.stringify({ "csp-report": {
    "document-uri": "https://koperasi-alumana.com/", "violated-directive": "img-src", "blocked-uri": "https://x.example/a.png",
  } })), log);
  assert.equal(ok.status, 204);
  assert.equal(logged.length, 1);
  assert.equal((await handleCspReport(report("garbage"), log)).status, 204);
  assert.equal((await handleCspReport(report("x".repeat(70_000)), log)).status, 413);
});
