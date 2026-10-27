// Firebase Auth accounts for absensi, through the Identity Toolkit admin REST API
// (or the Auth Emulator when running locally).
import { getAccessToken, usesAuthEmulator } from "./auth.js";
import { AbsensiError } from "./http.js";

async function identityRequest(env, path, body, fetchImpl) {
  const projectId = encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const emulator = usesAuthEmulator(env);
  const base = emulator
    ? `http://${env.AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${projectId}`
    : `https://identitytoolkit.googleapis.com/v1/projects/${projectId}`;
  const token = emulator ? "owner" : await getAccessToken(env, fetchImpl);
  const response = await fetchImpl(`${base}/${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = String(payload?.error?.message || "");
    if (message.startsWith("EMAIL_EXISTS")) throw new AbsensiError("EMAIL_SUDAH_ADA", 409);
    throw new Error(`Identity Toolkit ${path} failed (${response.status}): ${message}`);
  }
  return payload;
}

/** Create an email/password account and return its uid. */
export async function createAuthUser(env, { email, password, displayName }, fetchImpl = fetch) {
  const payload = await identityRequest(env, "accounts", { email, password, displayName }, fetchImpl);
  return payload.localId;
}

export async function setClaims(env, uid, claims, fetchImpl = fetch) {
  await identityRequest(env, "accounts:update", { localId: uid, customAttributes: JSON.stringify(claims) }, fetchImpl);
}

export async function setAuthDisabled(env, uid, disabled, fetchImpl = fetch) {
  await identityRequest(env, "accounts:update", { localId: uid, disableUser: disabled }, fetchImpl);
}
