/**
 * Al-Umanaa push Worker — delivers Firestore `notifications` to phones via FCM.
 *
 * Triggers:
 *   - cron every minute (safety net), and
 *   - POST /api/push/kick from the app right after it writes a notification
 *     (requires a valid Firebase ID token, so the endpoint can't be abused to
 *     burn the Firestore free read quota).
 *
 * Each pass: query notifications with pushStatus pending (or a stale
 * "sending"), look up `push_devices` of the recipient (uid or role aliases),
 * claim the documents with an updateTime precondition (so concurrent passes
 * never double-send), send one FCM v1 message per device, then record the
 * result and delete dead tokens.
 *
 * Secrets: FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY (service account with
 * Firestore + Firebase Cloud Messaging access). Var: FIREBASE_PROJECT_ID.
 */

import {
  buildMessage, classifyFcmError, encodeValue, finalStatus, planBatch,
  resolveRecipient, selectCandidates, toNotification, decodeValue,
} from "./logic.js";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging";
const SECURETOKEN_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
// Cloudflare free plan: 50 subrequests per invocation. Keep a margin.
const SUBREQUEST_BUDGET = 46;
const QUERY_LIMIT = 20;
const ALLOWED_ORIGINS = new Set([
  "https://koperasi-alumana.com",
  "https://www.koperasi-alumana.com",
  "https://al-umana-koperasi.web.app",
  "https://al-umana-koperasi.firebaseapp.com",
]);

// Plain data only is shared across requests of an isolate (never promises/streams).
let cachedAccessToken = null;
let cachedJwks = null;

// ---------------------------------------------------------------------------
// Google auth
// ---------------------------------------------------------------------------

function base64Url(bytes) {
  const value = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function pemToBytes(pem) {
  const normalized = pem.replaceAll("\\n", "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

async function getAccessToken(env, counter) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: env.FIREBASE_CLIENT_EMAIL, scope: SCOPES, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3_600 }));
  const key = await crypto.subtle.importKey("pkcs8", pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${claims}`));
  counter.n++;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}` }),
  });
  if (!response.ok) throw new Error(`Google OAuth failed (${response.status})`);
  const payload = await response.json();
  cachedAccessToken = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3_000) * 1_000 };
  return cachedAccessToken.token;
}

/** Verify a Firebase Auth ID token (RS256, securetoken JWKs). Returns uid or null. */
async function verifyIdToken(token, projectId) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  let header;
  let payload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[0])));
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(parts[1])));
  } catch {
    return null;
  }
  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256" || payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || payload.exp <= now || payload.iat > now + 300) return null;

  if (!cachedJwks || cachedJwks.expiresAt < Date.now()) {
    const response = await fetch(SECURETOKEN_JWKS);
    if (!response.ok) return null;
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
    cachedJwks = { keys: (await response.json()).keys || [], expiresAt: Date.now() + maxAge * 1000 };
  }
  const jwk = cachedJwks.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return valid ? payload.sub : null;
}

// ---------------------------------------------------------------------------
// Firestore REST
// ---------------------------------------------------------------------------

function docsBase(env) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/databases/(default)/documents`;
}

async function firestore(env, counter, path, body) {
  const token = await getAccessToken(env, counter);
  counter.n++;
  return fetch(`${docsBase(env)}${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function runQuery(env, counter, structuredQuery) {
  const response = await firestore(env, counter, ":runQuery", { structuredQuery });
  if (!response.ok) throw new Error(`Firestore query failed (${response.status})`);
  return (await response.json()).filter((r) => r.document).map((r) => r.document);
}

function inFilter(field, values) {
  return { fieldFilter: { field: { fieldPath: field }, op: "IN", value: { arrayValue: { values: values.map((v) => ({ stringValue: v })) } } } };
}

function devicesQuery(recipientId) {
  const target = resolveRecipient(recipientId);
  return {
    from: [{ collectionId: "push_devices" }],
    where: target.kind === "role"
      ? inFilter("role", target.roles)
      : { fieldFilter: { field: { fieldPath: "uid" }, op: "EQUAL", value: { stringValue: target.uid } } },
    limit: 100,
  };
}

function deviceFromDoc(document) {
  const fields = Object.fromEntries(Object.entries(document.fields || {}).map(([k, v]) => [k, decodeValue(v)]));
  return { name: document.name, token: fields.token, uid: fields.uid, role: fields.role };
}

function statusWrite(name, fields, precondition) {
  const write = {
    update: { name, fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])) },
    updateMask: { fieldPaths: Object.keys(fields) },
  };
  if (precondition) write.currentDocument = { updateTime: precondition };
  return write;
}

// ---------------------------------------------------------------------------
// One delivery pass
// ---------------------------------------------------------------------------

async function sendFcm(env, counter, notification, device) {
  const token = await getAccessToken(env, counter);
  counter.n++;
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(env.FIREBASE_PROJECT_ID)}/messages:send`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(buildMessage(notification, device.token)),
  });
  if (response.ok) return { kind: "ok" };
  let body = null;
  try { body = await response.json(); } catch { /* ignore */ }
  const kind = classifyFcmError(response.status, body);
  const code = (body?.error?.details || []).map((d) => d?.errorCode).find(Boolean) || body?.error?.status || String(response.status);
  console.warn("fcm send failed", kind, response.status, code, device.role);
  return { kind, code };
}

// Concurrent passes (cron + kicks) are safe: the claim commit carries an
// updateTime precondition, so only one pass can take a given notification.
async function processPending(env) {
  if (!env.FIREBASE_CLIENT_EMAIL || !env.FIREBASE_PRIVATE_KEY) return { skipped: "not-configured" };
  const counter = { n: 0 };
  const now = Date.now();

  const docs = await runQuery(env, counter, {
    from: [{ collectionId: "notifications" }],
    where: inFilter("pushStatus", ["pending", "sending"]),
    limit: QUERY_LIMIT,
  });
  const { ready, expired } = selectCandidates(docs.map(toNotification), now);
  if (!ready.length && !expired.length) return { sent: 0 };

  // Devices per distinct recipient (one query each), leaving room for claim + finalize.
  const devicesByRecipient = {};
  for (const recipientId of [...new Set(ready.map((n) => n.recipientId))]) {
    if (counter.n >= SUBREQUEST_BUDGET - 4) break;
    devicesByRecipient[recipientId] = (await runQuery(env, counter, devicesQuery(recipientId))).map(deviceFromDoc);
  }
  const lookedUp = ready.filter((n) => n.recipientId in devicesByRecipient);
  const plan = planBatch(lookedUp, devicesByRecipient, Math.max(0, SUBREQUEST_BUDGET - counter.n - 2));

  if (!plan.length && !expired.length) return { sent: 0, deferred: ready.length };

  // Claim (all-or-nothing): if another pass touched any doc, let it finish.
  const claimedAt = new Date();
  const claim = await firestore(env, counter, ":commit", {
    writes: [
      ...plan.map(({ notification }) => statusWrite(notification.name, { pushStatus: "sending", pushClaimedAt: claimedAt }, notification.updateTime)),
      ...expired.map((n) => statusWrite(n.name, { pushStatus: "expired" }, n.updateTime)),
    ],
  });
  if (!claim.ok) return { conflict: claim.status };

  const finalize = [];
  const deadDevices = new Set();
  let sent = 0;
  for (const { notification, targets } of plan) {
    const results = [];
    const errors = [];
    for (const device of targets) {
      const { kind, code } = await sendFcm(env, counter, notification, device);
      results.push(kind);
      if (code) errors.push(code);
      if (kind === "invalid") deadDevices.add(device.name);
      if (kind === "ok") sent++;
    }
    const attempts = Number(notification.pushAttempts || 0);
    const status = finalStatus(targets.length, results, attempts);
    finalize.push(statusWrite(notification.name, {
      pushStatus: status,
      pushSentCount: results.filter((r) => r === "ok").length,
      pushAttempts: attempts + 1,
      pushedAt: new Date(),
      // Kode error FCM (mis. UNREGISTERED) supaya kegagalan bisa ditelusuri dari Firestore.
      ...(errors.length ? { pushError: [...new Set(errors)].join(",").slice(0, 200) } : {}),
    }));
  }
  for (const name of deadDevices) finalize.push({ delete: name });
  if (finalize.length) {
    const response = await firestore(env, counter, ":commit", { writes: finalize });
    if (!response.ok) console.error("finalize commit failed", response.status);
  }
  return { sent, notifications: plan.length, expired: expired.length, removedDevices: deadDevices.size };
}

// ---------------------------------------------------------------------------
// HTTP
// ---------------------------------------------------------------------------

function corsHeaders(request) {
  const origin = request.headers.get("origin");
  if (!origin || !ALLOWED_ORIGINS.has(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, GET, OPTIONS",
    "access-control-allow-headers": "authorization, content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", "cache-control": "no-store", ...cors } });
}

export default {
  async fetch(request, env, ctx) {
    const cors = corsHeaders(request);
    const origin = request.headers.get("origin");
    if (origin && !cors["access-control-allow-origin"]) return json({ error: "origin not allowed" }, 403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const { pathname } = new URL(request.url);
    if (pathname === "/api/push/health" && request.method === "GET") {
      return json({ ok: true, configured: Boolean(env.FIREBASE_CLIENT_EMAIL && env.FIREBASE_PRIVATE_KEY) }, 200, cors);
    }
    if (pathname === "/api/push/kick" && request.method === "POST") {
      const auth = request.headers.get("authorization") || "";
      const idToken = auth.startsWith("Bearer ") ? auth.slice(7) : "";
      const uid = idToken ? await verifyIdToken(idToken, env.FIREBASE_PROJECT_ID).catch(() => null) : null;
      if (!uid) return json({ error: "unauthorized" }, 401, cors);
      ctx.waitUntil(processPending(env).catch((error) => console.error("push pass failed", error instanceof Error ? error.message : error)));
      return json({ queued: true }, 202, cors);
    }
    return json({ error: "not found" }, 404, cors);
  },

  async scheduled(_event, env, ctx) {
    ctx.waitUntil(processPending(env).catch((error) => console.error("push cron failed", error instanceof Error ? error.message : error)));
  },
};
