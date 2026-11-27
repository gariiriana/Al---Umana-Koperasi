// Local D1 test harness untuk Worker Keuangan (menggunakan wrangler platform proxy).
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleRequest } from "../src/worker.js";
import { resetSeedCacheForTests } from "../src/lib/seed.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function migrateDir(database, dirName) {
  for (const file of readdirSync(join(root, dirName)).sort()) {
    const sql = readFileSync(join(root, dirName, file), "utf8").replace(/--.*$/gm, "");
    for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
}

export async function makeEnv(vars = {}) {
  resetSeedCacheForTests();
  const persistDir = mkdtempSync(join(tmpdir(), "keuangan-test-"));
  const proxy = await getPlatformProxy({ configPath: join(root, "wrangler.toml"), persist: { path: persistDir } });
  try {
    await migrateDir(proxy.env.DB, "migrations");
    if (proxy.env.ATTACH_DB_1) await migrateDir(proxy.env.ATTACH_DB_1, "migrations_lampiran");
    if (proxy.env.ATTACH_DB_2) await migrateDir(proxy.env.ATTACH_DB_2, "migrations_lampiran");
  } catch (err) {
    await proxy.dispose();
    rmSync(persistDir, { recursive: true, force: true });
    throw err;
  }
  const env = { ...proxy.env, FIREBASE_PROJECT_ID: "demo-test", ALLOWED_ORIGIN: "http://localhost:5174", ...vars };
  return {
    env,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}

export const NOW = Date.UTC(2026, 1, 15, 3, 0); // 10:00 WIB, 15 Feb 2026

const PROFILES = {
  keuangan1: { role: "keuangan", name: "Bu Inas" },
  super_admin: { role: "super_admin", name: "Gari" },
  developer: { role: "developer", name: "Dev" },
  toksan: { role: "toksan", name: "Nabila" },
  admin: { role: "admin", name: "Admin Katering" },
  kurir: { role: "kurir", name: "Kurir" },
};

export const fakeDeps = (over = {}) => ({
  verifyToken: async (token) => (token ? { uid: token, claims: {} } : null),
  getUserProfile: async (uid) => PROFILES[uid] ?? null,
  now: () => NOW,
  ...over,
});

export async function call(env, deps, method, path, { token = "keuangan1", body, origin } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await handleRequest(
    new Request(`http://localhost/api/keuangan${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
    env,
    deps,
  );
  const text = await response.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = text;
  }
  return { status: response.status, headers: response.headers, data };
}

export const sen = (rp) => Math.round(rp * 100);
