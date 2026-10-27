#!/usr/bin/env node
// Buat akun karyawan dari file JSON di luar repo (array {name, email, password, role, faceRequired, units}).
// node scripts/seed-employees.mjs --file "D:/Users/Downloads/absensi-akun-karyawan.json"
// Idempoten: email yang sudah ada di employees dilewati. `units` belum disimpan (belum ada di schema).
import { readFileSync } from "node:fs";

import { EMULATOR_ENV, assertEmulator, d1Local, existingEmails, parseArgs, prepareAccount, validateAccount } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.file) {
  console.error('Pakai: node scripts/seed-employees.mjs --file "<path ke JSON>"');
  process.exit(1);
}

const env = { ...EMULATOR_ENV };
assertEmulator(env);

try {
  const accounts = JSON.parse(readFileSync(args.file, "utf8"));
  if (!Array.isArray(accounts)) throw new Error("File harus berisi array akun");
  // Validasi semua dulu supaya file yang salah tidak membuat setengah akun.
  accounts.forEach(validateAccount);

  const existing = existingEmails();
  const inserts = [];
  let skipped = 0;
  for (const account of accounts) {
    const email = String(account.email).trim().toLowerCase();
    if (existing.has(email)) {
      console.log(`skip  ${email} (sudah ada)`);
      skipped++;
      continue;
    }
    const prepared = await prepareAccount(env, account, Date.now());
    inserts.push(prepared.insert);
    existing.add(email);
    console.log(`create ${email} (${prepared.role})`);
  }
  if (inserts.length > 0) d1Local(inserts.join("\n"));
  console.log(`${inserts.length} created, ${skipped} skipped`);
} catch (err) {
  console.error(`Gagal: ${err.message}`);
  process.exit(1);
}
