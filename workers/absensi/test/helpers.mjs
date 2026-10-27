// Local D1 for tests: wrangler's platform proxy on a fresh temp dir, migrations applied by hand.
import { mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy } from "wrangler";

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
