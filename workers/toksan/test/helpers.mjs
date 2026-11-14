// Local D1 for tests: wrangler's platform proxy on a fresh temp dir, migrations applied by hand.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";
import { handleRequest } from "../src/worker.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

async function migrate(database) {
  for (const file of readdirSync(join(root, "migrations")).sort()) {
    const sql = readFileSync(join(root, "migrations", file), "utf8");
    for (const statement of sql.split(";").map((s) => s.trim()).filter(Boolean)) {
      await database.prepare(statement).run();
    }
  }
}

/** Fresh `env` with a migrated `DB`; `vars` override wrangler.toml [vars]. */
export async function makeEnv(vars = {}) {
  const persistDir = mkdtempSync(join(tmpdir(), "toksan-test-"));
  const proxy = await getPlatformProxy({ configPath: join(root, "wrangler.toml"), persist: { path: persistDir } });
  await migrate(proxy.env.DB);
  const env = { ...proxy.env, FIREBASE_PROJECT_ID: "demo-test", ALLOWED_ORIGIN: "http://localhost:5174", ...vars };
  return {
    env,
    dispose: async () => {
      await proxy.dispose();
      rmSync(persistDir, { recursive: true, force: true });
    },
  };
}

export const TODAY = "2026-11-14";
export const NOW = Date.UTC(2026, 10, 14, 3, 0); // 10:00 WIB, 14 Nov 2026

const PROFILES = {
  admin: { role: "toksan", name: "Nabila" },
  boss: { role: "super_admin", name: "Gari" },
  kurir: { role: "kurir", name: "K" },
};

// Deps with a token that is simply the uid; tests override what they need.
export const fakeDeps = (over = {}) => ({
  verifyToken: async (token) => (token ? { uid: token, claims: {} } : null),
  getUserProfile: async (uid) => PROFILES[uid] ?? null,
  now: () => NOW,
  ...over,
});

export async function call(env, deps, method, path, { token, body, origin } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (origin) headers.origin = origin;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await handleRequest(new Request(`http://localhost/api/toksan${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), env, deps);
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch { data = text; }
  return { status: response.status, headers: response.headers, data };
}
