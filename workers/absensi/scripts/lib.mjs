// Helper seed lokal: hanya Firebase Auth Emulator (project demo-*) dan D1 --local.
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { MIN_PASSWORD_LENGTH } from "../shared/constants.js";
import { createAuthUser, setClaims } from "../src/identity.js";

export const WORKER_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const WRANGLER = join(WORKER_DIR, "node_modules", "wrangler", "bin", "wrangler.js");

/** Env tetap untuk seed; tidak pernah membaca kredensial produksi. */
export const EMULATOR_ENV = Object.freeze({ AUTH_EMULATOR_HOST: "127.0.0.1:9099", FIREBASE_PROJECT_ID: "demo-alumana" });

export function assertEmulator(env) {
  if (!env.FIREBASE_PROJECT_ID.startsWith("demo-") || !env.AUTH_EMULATOR_HOST) {
    throw new Error(`Seed hanya untuk Auth Emulator (project demo-*); dapat ${env.FIREBASE_PROJECT_ID}`);
  }
}

/** `--email a --name "B C"` → { email: "a", name: "B C" } */
export function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const key = argv[i];
    if (!key.startsWith("--")) throw new Error(`Argumen tidak dikenal: ${key}`);
    const value = argv[i + 1];
    if (value === undefined || value.startsWith("--")) throw new Error(`Nilai untuk ${key} kosong`);
    args[key.slice(2)] = value;
    i++;
  }
  return args;
}

/** Literal SQL dengan tanda kutip di-escape. */
export function sqlValue(value) {
  if (value === null || value === undefined) return "NULL";
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "1" : "0";
  return `'${String(value).replaceAll("'", "''")}'`;
}

/** Jalankan SQL di D1 lokal `absensi` lewat file sementara (tanpa masalah quoting shell). */
export function d1Local(sql) {
  const dir = mkdtempSync(join(tmpdir(), "absensi-seed-"));
  const file = join(dir, "seed.sql");
  try {
    writeFileSync(file, sql);
    const out = execFileSync(process.execPath, [WRANGLER, "d1", "execute", "absensi", "--local", "--json", "--file", file], {
      cwd: WORKER_DIR,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return JSON.parse(out);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

export function existingEmails() {
  const [result] = d1Local("SELECT email FROM employees;");
  return new Set((result?.results ?? []).map((row) => row.email));
}

async function lookupUid(env, email) {
  const url = `http://${env.AUTH_EMULATOR_HOST}/identitytoolkit.googleapis.com/v1/projects/${env.FIREBASE_PROJECT_ID}/accounts:lookup`;
  const response = await fetch(url, {
    method: "POST",
    headers: { authorization: "Bearer owner", "content-type": "application/json" },
    body: JSON.stringify({ email: [email] }),
  });
  const payload = await response.json();
  return payload.users?.[0]?.localId ?? null;
}

export function validateAccount(account) {
  const name = String(account.name ?? "").trim();
  const email = String(account.email ?? "").trim().toLowerCase();
  const role = account.role ?? "absen_karyawan";
  if (!name || !email.includes("@")) throw new Error(`Akun tidak lengkap: ${email || name || "(kosong)"}`);
  if (role !== "absen_karyawan" && role !== "admin_absensi") throw new Error(`Role tidak valid untuk ${email}: ${role}`);
  if (typeof account.password !== "string" || account.password.length < MIN_PASSWORD_LENGTH) {
    throw new Error(`Password ${email} kurang dari ${MIN_PASSWORD_LENGTH} karakter`);
  }
  return { name, email, password: account.password, role, faceRequired: account.faceRequired !== false };
}

/**
 * Buat (atau pakai ulang) akun Auth Emulator, set claim `absensi_role`, dan kembalikan
 * statement INSERT employees. Password tidak pernah dicetak.
 */
export async function prepareAccount(env, account, nowMs) {
  const { name, email, password, role, faceRequired } = validateAccount(account);
  let uid;
  try {
    uid = await createAuthUser(env, { email, password, displayName: name });
  } catch (err) {
    if (err?.code !== "EMAIL_SUDAH_ADA") throw err;
    // Akun Auth sudah ada dari percobaan sebelumnya tapi belum tercatat di D1.
    uid = await lookupUid(env, email);
    if (!uid) throw err;
  }
  await setClaims(env, uid, { absensi_role: role });
  const insert = `INSERT INTO employees (uid, name, email, role, status, face_required, created_at, created_by) VALUES (${[
    uid, name, email, role, "aktif", faceRequired ? 1 : 0, nowMs, "seed",
  ].map(sqlValue).join(", ")}) ON CONFLICT(uid) DO NOTHING;`;
  return { uid, email, role, insert };
}
