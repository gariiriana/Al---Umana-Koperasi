// Aturan password Firebase Auth project al-umana-koperasi. Sejak 2026-11-17 Password policy di
// Firebase Console berstatus ENFORCE: minimal 8 karakter, wajib huruf kecil, huruf besar, dan angka.
// Firebase menolak password lain (termasuk dari admin), jadi form dicek dulu di sini agar pesannya jelas.
// Kalau policy di Console diubah, ubah juga aturan di file ini.

export const PASSWORD_MIN_LENGTH = 8;

export const PASSWORD_RULE_TEXT = "Minimal 8 karakter, ada huruf besar, huruf kecil, dan angka. Contoh: Absen12345";

/** "a", "a dan b", "a, b, dan c". */
function joinIndonesian(items: string[]): string {
  if (items.length <= 2) return items.join(" dan ");
  return `${items.slice(0, -1).join(", ")}, dan ${items[items.length - 1]}`;
}

/** Pesan kalau password belum memenuhi aturan, atau null kalau sudah boleh. */
export function passwordPolicyProblem(password: string): string | null {
  const missing: string[] = [];
  if (!/[A-Z]/.test(password)) missing.push("huruf besar");
  if (!/[a-z]/.test(password)) missing.push("huruf kecil");
  if (!/[0-9]/.test(password)) missing.push("angka");
  if (password.length < PASSWORD_MIN_LENGTH) {
    return `Password minimal ${PASSWORD_MIN_LENGTH} karakter${missing.length ? ` dan harus ada ${joinIndonesian(missing)}` : ""}.`;
  }
  if (missing.length) return `Password harus ada ${joinIndonesian(missing)}. Contoh: Absen12345`;
  return null;
}

/** Kode error Firebase Auth saat password ditolak oleh policy. */
export const PASSWORD_POLICY_ERROR_CODES: readonly string[] = ["auth/password-does-not-meet-requirements", "auth/weak-password"];
