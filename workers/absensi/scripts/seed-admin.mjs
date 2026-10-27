#!/usr/bin/env node
// Buat akun admin_absensi di Auth Emulator + D1 lokal.
// node scripts/seed-admin.mjs --email admin@absensi.test --password rahasia123 --name "Admin Absensi"
import { EMULATOR_ENV, assertEmulator, d1Local, existingEmails, parseArgs, prepareAccount } from "./lib.mjs";

const args = parseArgs(process.argv.slice(2));
if (!args.email || !args.password || !args.name) {
  console.error('Pakai: node scripts/seed-admin.mjs --email <email> --password <password> --name "<nama>"');
  process.exit(1);
}

const env = { ...EMULATOR_ENV };
assertEmulator(env);

try {
  const email = args.email.trim().toLowerCase();
  if (existingEmails().has(email)) {
    console.log(`${email} sudah ada di employees; dilewati.`);
    process.exit(0);
  }
  const account = await prepareAccount(env, { name: args.name, email, password: args.password, role: "admin_absensi" }, Date.now());
  const [result] = d1Local(account.insert);
  console.log(`uid: ${account.uid}`);
  console.log(`employees: ${result?.meta?.changes ?? 0} row inserted`);
} catch (err) {
  console.error(`Gagal: ${err.message}`);
  process.exit(1);
}
