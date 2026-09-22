/**
 * Public invoice endpoint for Cloudflare Workers.
 *
 * The Worker keeps Firestore `orders` private. It accepts only a random
 * invoice token, returns a deliberately narrow invoice view, and allows one
 * PNG signature to be submitted for an unsigned invoice.
 *
 * Required Worker secrets/variables:
 *   FIREBASE_PROJECT_ID     Firebase / GCP project ID
 *   FIREBASE_CLIENT_EMAIL   least-privilege service account email
 *   FIREBASE_PRIVATE_KEY    service account private key (PEM, \n supported)
 *   ALLOWED_ORIGIN          public frontend origin, e.g. https://<site>.web.app
 */

const TOKEN_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_SIGNATURE_LENGTH = 700_000;
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const FIRESTORE_SCOPE = "https://www.googleapis.com/auth/datastore";

const invoiceFields = new Set([
  "orderType", "institutionName", "recipientName", "recipientPhone", "recipientNotes",
  "eventDate", "foodDetails", "drinkDetails", "totalPrice", "additionalFee",
  "additionalNotes", "paymentStatus", "paymentDueDate", "invoiceToken",
  "invoiceSignedAt", "invoiceSignatureData", "status", "items", "deliveryAddress",
  "deliveryTime", "promoCode", "discountAmount", "createdAt", "updatedAt",
]);

let cachedAccessToken = null;

function base64Url(bytes) {
  const value = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToBytes(pem) {
  const normalized = pem.replaceAll("\\n", "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  const binary = atob(normalized);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function getAccessToken(env) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) {
    return cachedAccessToken.token;
  }

  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({
    iss: env.FIREBASE_CLIENT_EMAIL,
    scope: FIRESTORE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3_600,
  }));
  const privateKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    privateKey,
    new TextEncoder().encode(`${header}.${claims}`),
  );
  const assertion = `${header}.${claims}.${base64Url(new Uint8Array(signature))}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  if (!response.ok) throw new Error("Google OAuth request failed");
  const payload = await response.json();
  cachedAccessToken = {
    token: payload.access_token,
    expiresAt: Date.now() + Number(payload.expires_in || 3_000) * 1_000,
  };
  return cachedAccessToken.token;
}

function firestoreUrl(projectId, path) {
  return `https://firestore.googleapis.com/v1/projects/${encodeURIComponent(projectId)}/databases/(default)/${path}`;
}

async function firestoreRequest(env, path, options = {}) {
  const accessToken = await getAccessToken(env);
  const response = await fetch(firestoreUrl(env.FIREBASE_PROJECT_ID, path), {
    ...options,
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/json",
      ...(options.headers || {}),
    },
  });
  return response;
}

function decodeValue(value) {
  if ("nullValue" in value) return null;
  if ("stringValue" in value) return value.stringValue;
  if ("integerValue" in value) return Number(value.integerValue);
  if ("doubleValue" in value) return value.doubleValue;
  if ("booleanValue" in value) return value.booleanValue;
  if ("timestampValue" in value) return value.timestampValue;
  if ("arrayValue" in value) return (value.arrayValue.values || []).map(decodeValue);
  if ("mapValue" in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, item]) => [key, decodeValue(item)]));
  }
  return null;
}

function encodeValue(value) {
  if (value === null) return { nullValue: null };
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "number") return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) return { arrayValue: { values: value.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(value).map(([key, item]) => [key, encodeValue(item)])) } };
}

async function findInvoice(env, token) {
  const response = await firestoreRequest(env, "documents:runQuery", {
    method: "POST",
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "orders" }],
        where: {
          fieldFilter: {
            field: { fieldPath: "invoiceToken" },
            op: "EQUAL",
            value: { stringValue: token },
          },
        },
        limit: 1,
      },
    }),
  });
  if (!response.ok) throw new Error("Firestore invoice lookup failed");
  const results = await response.json();
  return results.find((item) => item.document)?.document || null;
}

function invoiceView(document) {
  const values = Object.fromEntries(
    Object.entries(document.fields || {})
      .filter(([key]) => invoiceFields.has(key))
      .map(([key, value]) => [key, decodeValue(value)]),
  );
  return { id: document.name.split("/").pop(), ...values };
}

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowed = new Set([
    env.ALLOWED_ORIGIN,
    "https://al-umana-koperasi.web.app",
    "https://al-umana-koperasi.firebaseapp.com",
  ].filter(Boolean));
  if (origin && !allowed.has(origin)) return null;
  return {
    "access-control-allow-origin": origin || env.ALLOWED_ORIGIN || "https://al-umana-koperasi.web.app",
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...cors },
  });
}

export default {
  async fetch(request, env) {
    const cors = corsHeaders(request, env);
    if (!cors) return json({ error: { code: "FORBIDDEN", message: "origin not allowed" } }, 403, {});
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    const url = new URL(request.url);
    const match = url.pathname.match(/^\/api\/public\/invoices\/([^/]+)(\/sign)?$/);
    if (!match || !TOKEN_PATTERN.test(match[1])) {
      return json({ error: { code: "NOT_FOUND", message: "invoice not found" } }, 404, cors);
    }
    const [, token, signPath] = match;
    if ((request.method === "GET" && signPath) || (request.method !== "GET" && request.method !== "POST")) {
      return json({ error: { code: "NOT_FOUND", message: "invoice not found" } }, 404, cors);
    }
    if (request.method === "POST" && signPath !== "/sign") {
      return json({ error: { code: "NOT_FOUND", message: "invoice not found" } }, 404, cors);
    }

    try {
      const document = await findInvoice(env, token);
      if (!document) return json({ error: { code: "NOT_FOUND", message: "invoice not found" } }, 404, cors);
      if (request.method === "GET") return json(invoiceView(document), 200, cors);

      const payload = await request.json();
      const signature = payload?.signatureData;
      if (typeof signature !== "string" || !signature.startsWith("data:image/png;base64,") || signature.length > MAX_SIGNATURE_LENGTH) {
        return json({ error: { code: "VALIDATION_ERROR", message: "invalid signature" } }, 400, cors);
      }
      if (document.fields?.invoiceSignedAt) {
        return json({ error: { code: "ALREADY_SIGNED", message: "invoice already signed" } }, 409, cors);
      }

      const response = await firestoreRequest(env, "documents:commit", {
        method: "POST",
        body: JSON.stringify({
          writes: [{
            update: {
              name: document.name,
              fields: { invoiceSignatureData: encodeValue(signature) },
            },
            updateMask: { fieldPaths: ["invoiceSignatureData"] },
            currentDocument: { updateTime: document.updateTime },
          }, {
            transform: {
              document: document.name,
              fieldTransforms: [
                { fieldPath: "invoiceSignedAt", setToServerValue: "REQUEST_TIME" },
                { fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" },
              ],
            },
            currentDocument: { updateTime: document.updateTime },
          }],
        }),
      });
      if (response.status === 409) return json({ error: { code: "CONFLICT", message: "invoice changed; reload it" } }, 409, cors);
      if (!response.ok) throw new Error("Firestore signature write failed");
      return new Response(null, { status: 204, headers: cors });
    } catch (error) {
      console.error("invoice worker request failed", error instanceof Error ? error.message : "unknown");
      return json({ error: { code: "INTERNAL_ERROR", message: "invoice service unavailable" } }, 500, cors);
    }
  },
};
