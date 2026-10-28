// Firebase Auth for the absensi Worker: ID token checks and the service-account
// OAuth token for Identity Toolkit. Same approach as workers/invoice-api, no Firestore.

const SECURETOKEN_JWKS = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const IDENTITY_SCOPE = "https://www.googleapis.com/auth/identitytoolkit";

let cachedJwks = null;
let cachedAccessToken = null;

function base64UrlDecode(value) {
  const padded = value.replaceAll("-", "+").replaceAll("_", "/") + "===".slice((value.length + 3) % 4);
  return Uint8Array.from(atob(padded), (c) => c.charCodeAt(0));
}

function base64Url(bytes) {
  const value = typeof bytes === "string" ? new TextEncoder().encode(bytes) : bytes;
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function pemToBytes(pem) {
  const normalized = pem.replaceAll("\\n", "\n").replace(/-----BEGIN PRIVATE KEY-----|-----END PRIVATE KEY-----|\s/g, "");
  return Uint8Array.from(atob(normalized), (c) => c.charCodeAt(0));
}

/** Local-only: the Auth Emulator signs nothing, so its tokens are accepted only for demo-* projects. */
export function usesAuthEmulator(env) {
  return Boolean(env.AUTH_EMULATOR_HOST) && String(env.FIREBASE_PROJECT_ID || "").startsWith("demo-");
}

async function fetchJwks(jwksFetch) {
  try {
    const response = await jwksFetch(SECURETOKEN_JWKS);
    if (!response.ok) return null;
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
    cachedJwks = { keys: (await response.json()).keys || [], expiresAt: Date.now() + maxAge * 1000 };
    return cachedJwks;
  } catch {
    return null;
  }
}

/** Verify a Firebase ID token. Returns {uid, claims} or null. */
export async function verifyIdToken(token, env, { jwksFetch = fetch } = {}) {
  const projectId = env.FIREBASE_PROJECT_ID;
  const parts = String(token || "").split(".");
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
  if (payload.aud !== projectId || payload.iss !== `https://securetoken.google.com/${projectId}`) return null;
  if (!payload.sub || payload.exp <= now || payload.iat > now + 300) return null;

  if (header.alg === "none") return usesAuthEmulator(env) ? { uid: payload.sub, claims: payload } : null;
  if (header.alg !== "RS256") return null;

  let refreshed = false;
  if (!cachedJwks || cachedJwks.expiresAt < Date.now()) {
    refreshed = true;
    if (!(await fetchJwks(jwksFetch))) return null;
  }
  let jwk = cachedJwks.keys.find((k) => k.kid === header.kid);
  if (!jwk && !refreshed) {
    if (!(await fetchJwks(jwksFetch))) return null;
    jwk = cachedJwks.keys.find((k) => k.kid === header.kid);
  }
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, base64UrlDecode(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`));
  return valid ? { uid: payload.sub, claims: payload } : null;
}

/** OAuth token for Identity Toolkit, signed with the Firebase service account secrets. */
export async function getAccessToken(env, fetchImpl = fetch) {
  if (cachedAccessToken && cachedAccessToken.expiresAt > Date.now() + 60_000) return cachedAccessToken.token;
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = base64Url(JSON.stringify({ iss: env.FIREBASE_CLIENT_EMAIL, scope: IDENTITY_SCOPE, aud: GOOGLE_TOKEN_URL, iat: now, exp: now + 3_600 }));
  const privateKey = await crypto.subtle.importKey("pkcs8", pemToBytes(env.FIREBASE_PRIVATE_KEY),
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", privateKey, new TextEncoder().encode(`${header}.${claims}`));
  const response = await fetchImpl(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${header}.${claims}.${base64Url(new Uint8Array(signature))}`,
    }),
  });
  if (!response.ok) throw new Error("Google OAuth request failed");
  const payload = await response.json();
  cachedAccessToken = { token: payload.access_token, expiresAt: Date.now() + Number(payload.expires_in || 3_000) * 1_000 };
  return cachedAccessToken.token;
}
