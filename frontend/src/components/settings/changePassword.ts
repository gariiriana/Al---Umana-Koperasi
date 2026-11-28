// Aturan ganti password sendiri (dipakai ChangePasswordCard dan SettingsPage).
import { PASSWORD_MIN_LENGTH, PASSWORD_POLICY_ERROR_CODES, PASSWORD_RULE_TEXT, passwordPolicyProblem } from "@/lib/passwordPolicy";

/** Akun yang boleh mengganti password sendiri dari Pengaturan (permintaan 2026-11-12: hanya produksimbg@). */
export const CAN_CHANGE_OWN_PASSWORD_ROLES: readonly string[] = ["produksi_mbg"];

export const MIN_NEW_PASSWORD_LENGTH = PASSWORD_MIN_LENGTH;

/** Pesan kesalahan isian, atau null kalau boleh dikirim. */
export function validateNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "Isi password lama terlebih dahulu.";
  const weak = passwordPolicyProblem(next);
  if (weak) return weak;
  if (next !== confirm) return "Ulangan password baru tidak sama.";
  if (next === current) return "Password baru harus berbeda dari password lama.";
  return null;
}

export function changePasswordErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  if (PASSWORD_POLICY_ERROR_CODES.includes(code)) return `Password baru belum memenuhi aturan. ${PASSWORD_RULE_TEXT}`;
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Password lama salah. Password tidak diganti.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
    case "auth/network-request-failed":
      return "Tidak ada koneksi internet. Coba lagi.";
    case "auth/requires-recent-login":
      return "Sesi sudah lama. Keluar lalu masuk lagi, kemudian ganti password.";
    default:
      return "Gagal mengganti password. Coba lagi.";
  }
}
