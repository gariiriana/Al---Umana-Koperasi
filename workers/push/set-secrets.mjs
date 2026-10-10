// Upload the Firebase service-account credentials to the Worker as encrypted secrets.
//
//   node workers/push/set-secrets.mjs "C:\path\to\al-umana-koperasi-firebase-adminsdk-xxxx.json"
//
// The key is piped straight into `wrangler secret put` (never printed or written
// anywhere else). Delete the downloaded JSON file afterwards.
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const file = process.argv[2];
if (!file) {
  console.error("Pakai: node workers/push/set-secrets.mjs <file-service-account.json>");
  process.exit(1);
}
const key = JSON.parse(readFileSync(file, "utf8"));
if (key.type !== "service_account" || !key.client_email || !key.private_key) {
  console.error("File ini bukan kunci service account Firebase.");
  process.exit(1);
}
if (key.project_id !== "al-umana-koperasi") {
  console.error(`Kunci ini untuk project "${key.project_id}", bukan al-umana-koperasi.`);
  process.exit(1);
}

const cwd = dirname(fileURLToPath(import.meta.url));
for (const [name, value] of [["FIREBASE_CLIENT_EMAIL", key.client_email], ["FIREBASE_PRIVATE_KEY", key.private_key]]) {
  const result = spawnSync("npx", ["--yes", "wrangler@4", "secret", "put", name], {
    cwd, input: value, stdio: ["pipe", "inherit", "inherit"], shell: process.platform === "win32",
  });
  if (result.status !== 0) {
    console.error(`Gagal menyimpan ${name}.`);
    process.exit(result.status || 1);
  }
}
console.log(`Selesai. Worker al-umana-push memakai ${key.client_email}. Hapus file JSON kunci dari komputer ini.`);
