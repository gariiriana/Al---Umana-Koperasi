// Pengingat clock in (07:30 WIB) / clock out (16:30 WIB): daftar HP (token FCM) milik karyawan yang login.
// Jamnya sama untuk semua karyawan (src/reminders.js), tidak bisa diubah.
import { sha256Hex } from "../../shared/binding.js";
import { deletePushDevice, upsertPushDevice } from "../db.js";
import { AbsensiError, readJson } from "../http.js";
import { requireEmployee } from "../session.js";

const tokenHash = (token) => sha256Hex(new TextEncoder().encode(token));

function readToken(body) {
  const token = typeof body.token === "string" ? body.token.trim() : "";
  if (token.length < 20 || token.length > 4096) throw new AbsensiError("VALIDATION_ERROR", 400);
  return token;
}

/** HP ini menerima pengingat untuk akun yang sedang login (HP yang sama pindah pemilik bila ganti akun). */
export async function daftarPerangkat(ctx) {
  const employee = await requireEmployee(ctx, { role: "absen_karyawan" });
  const body = await readJson(ctx.request);
  const token = readToken(body);
  const platform = typeof body.platform === "string" ? body.platform.slice(0, 60) : null;
  await upsertPushDevice(ctx.env.DB, { tokenHash: await tokenHash(token), token, uid: employee.uid, platform, nowMs: ctx.deps.now() });
  return { ok: true };
}

/** Lepas HP ini dari akun yang login (dipanggil saat Keluar). */
export async function hapusPerangkat(ctx) {
  const employee = await requireEmployee(ctx);
  const token = readToken(await readJson(ctx.request));
  await deletePushDevice(ctx.env.DB, await tokenHash(token), employee.uid);
  return { ok: true };
}
