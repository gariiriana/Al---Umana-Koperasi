// Role + name of a signed-in user, read from Firestore users/{uid} over REST and cached per isolate.
import { getAccessToken } from "./auth.js";

const TTL_MS = 300_000;
const cache = new Map();

function usesFirestoreEmulator(env) {
  return Boolean(env.FIRESTORE_EMULATOR_HOST) && String(env.FIREBASE_PROJECT_ID || "").startsWith("demo-");
}

/** {role, name} for `uid`, or null when the user document does not exist. */
export async function getUserProfile(env, uid, { fetchImpl = fetch, now = Date.now() } = {}) {
  const hit = cache.get(uid);
  if (hit && hit.expiresAt > now) return hit.profile;

  const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const emulator = usesFirestoreEmulator(env);
  const base = emulator ? `http://${env.FIRESTORE_EMULATOR_HOST}` : "https://firestore.googleapis.com";
  const token = emulator ? "owner" : await getAccessToken(env, fetchImpl);
  const response = await fetchImpl(
    `${base}/v1/projects/${project}/databases/(default)/documents/users/${encodeURIComponent(uid)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  let profile = null;
  if (response.ok) {
    const fields = (await response.json()).fields || {};
    const text = (key) => fields[key]?.stringValue || "";
    profile = { role: text("role"), name: text("holderName") || text("displayName") || text("email") };
  } else if (response.status !== 404) {
    throw new Error(`Firestore users read failed (${response.status})`);
  }
  cache.set(uid, { profile, expiresAt: now + TTL_MS });
  return profile;
}
