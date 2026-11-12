// Aturan ganti password sendiri (dipakai ChangePasswordCard dan SettingsPage).

/** Akun yang boleh mengganti password sendiri dari Pengaturan (permintaan 2026-11-12: hanya produksimbg@). */
export const CAN_CHANGE_OWN_PASSWORD_ROLES: readonly string[] = ["produksi_mbg"];

export const MIN_NEW_PASSWORD_LENGTH = 8;

/** Pesan kesalahan isian, atau null kalau boleh dikirim. */
export function validateNewPassword(current: string, next: string, confirm: string): string | null {
  if (!current) return "Isi password lama terlebih dahulu.";
  if (next.length < MIN_NEW_PASSWORD_LENGTH) return `Password baru minimal ${MIN_NEW_PASSWORD_LENGTH} karakter.`;
  if (next !== confirm) return "Ulangan password baru tidak sama.";
  if (next === current) return "Password baru harus berbeda dari password lama.";
  return null;
}

export function changePasswordErrorMessage(err: unknown): string {
  const code = (err as { code?: string } | null)?.code ?? "";
  switch (code) {
    case "auth/invalid-credential":
    case "auth/wrong-password":
      return "Password lama salah. Password tidak diganti.";
    case "auth/too-many-requests":
      return "Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.";
    case "auth/weak-password":
      return `Password baru terlalu lemah. Gunakan minimal ${MIN_NEW_PASSWORD_LENGTH} karakter.`;
    case "auth/network-request-failed":
      return "Tidak ada koneksi internet. Coba lagi.";
    case "auth/requires-recent-login":
      return "Sesi sudah lama. Keluar lalu masuk lagi, kemudian ganti password.";
    default:
      return "Gagal mengganti password. Coba lagi.";
  }
}
