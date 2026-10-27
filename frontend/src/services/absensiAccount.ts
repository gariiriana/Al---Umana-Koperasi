import type { User } from "firebase/auth";

/** Pemberitahuan saat akun Absensi dipakai di pintu KASMA JOB. */
export const ABSENSI_ACCOUNT_NOTICE = "Akun ini khusus Absensi. Silakan masuk lewat pintu Absensi.";

/**
 * Akun Absensi punya custom claim `absensi_role` (diset Worker absensi). Dibaca dari token,
 * tanpa Firestore. Kalau token tidak bisa dibaca (mis. offline), dianggap bukan akun Absensi.
 */
export async function isAbsensiAccount(user: User): Promise<boolean> {
  try {
    const { claims } = await user.getIdTokenResult();
    return typeof claims.absensi_role === "string";
  } catch {
    return false;
  }
}
