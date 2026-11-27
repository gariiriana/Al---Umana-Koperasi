// Role + nama akun dari Firestore users/{uid}, di-cache 5 menit per isolate.
import { getAccessToken } from "./auth.js";

const TTL_MS = 300_000;
const cache = new Map();

function usesFirestoreEmulator(env) {
  return Boolean(env.FIRESTORE_EMULATOR_HOST) && String(env.FIREBASE_PROJECT_ID || "").startsWith("demo-");
}

// Daftar akun role `keuangan` (untuk pemilih penyetuju approval). Hanya uid + nama + email.
export async function listKeuanganUsers(env, { fetchImpl = fetch } = {}) {
  const project = encodeURIComponent(env.FIREBASE_PROJECT_ID);
  const emulator = usesFirestoreEmulator(env);
  const base = emulator ? `http://${env.FIRESTORE_EMULATOR_HOST}` : "https://firestore.googleapis.com";
  const token = emulator ? "owner" : await getAccessToken(env, fetchImpl);
  const response = await fetchImpl(`${base}/v1/projects/${project}/databases/(default)/documents:runQuery`, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify({
      structuredQuery: {
        from: [{ collectionId: "users" }],
        where: { fieldFilter: { field: { fieldPath: "role" }, op: "EQUAL", value: { stringValue: "keuangan" } } },
        limit: 200,
      },
    }),
  });
  if (!response.ok) throw new Error(`Firestore users query failed (${response.status})`);
  const rows = await response.json();
  return (Array.isArray(rows) ? rows : [])
    .filter((r) => r.document)
    .map((r) => {
      const f = r.document.fields || {};
      const text = (k) => f[k]?.stringValue || "";
      const uid = r.document.name.split("/").pop();
      return { uid, nama: text("holderName") || text("displayName") || text("email") || uid, email: text("email") };
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

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
