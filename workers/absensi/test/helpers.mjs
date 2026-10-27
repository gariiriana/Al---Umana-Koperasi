// Local D1 for tests: wrangler's platform proxy on a fresh temp dir, migrations applied by hand.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleRequest } from "../src/worker.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function migrate(database, dir) {
  for (const file of readdirSync(join(root, dir)).sort()) {
    const sql = readFileSync(join(root, dir, file), "utf8");
    for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
}

/** Fresh `env` with migrated `DB` and `PHOTOS`; `vars` override wrangler.toml [vars]. */
export async function makeEnv(vars = {}) {
  const persistDir = mkdtempSync(join(tmpdir(), "absensi-test-"));
  const proxy = await getPlatformProxy({ configPath: join(root, "wrangler.toml"), persist: { path: persistDir } });
  await migrate(proxy.env.DB, "migrations/db");
  await migrate(proxy.env.PHOTOS, "migrations/photos");
  const env = {
    ...proxy.env,
    FIREBASE_PROJECT_ID: "demo-test",
    ALLOWED_ORIGIN: "http://localhost:5174",
    RP_ID: "localhost",
    EXPECTED_ORIGIN: "http://localhost:5174",
    ENFORCE_COUNTRY: "",
    ...vars,
  };
  return {
    env,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}

export const T0 = Date.UTC(2026, 9, 27, 0, 0); // 07:00 WIB, 27 Okt 2026

export async function addEmployee(env, over = {}) {
  const { insertEmployee } = await import("../src/db.js");
  const row = { uid: "u1", name: "Budi", email: "budi@absen.test", role: "absen_karyawan", faceRequired: true, createdAt: T0, createdBy: "admin", ...over };
  await insertEmployee(env.DB, row);
  return row;
}

// Deps with a token that is simply the uid; tests override what they need.
export const fakeDeps = (over = {}) => ({
  verifyToken: async (token) => (token ? { uid: token, claims: {} } : null),
  now: () => T0,
  country: () => null,
  ...over,
});

export async function call(env, deps, method, path, { token, body, origin } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await handleRequest(new Request(`http://localhost/api/absensi${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, deps);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, headers: response.headers, data };
}

// A 2 KB byte string with a JPEG header, enough for decodeJpeg.
export const JPEG_BASE64 = Buffer.from(Uint8Array.from({ length: 2000 }, (_, i) => (i < 3 ? [0xff, 0xd8, 0xff][i] : i % 251))).toString("base64");

// Passkey fake: a registration verifies when response.ok is true.
export const fakeWebauthn = {
  registrationOptions: async ({ challenge, userName }) => ({ challenge: Buffer.from(challenge).toString("base64url"), user: { name: userName } }),
  verifyRegistration: async ({ response }) =>
    response?.ok === true ? { credentialId: response.id, publicKey: "pk", counter: 0, transports: ["internal"] } : null,
};
