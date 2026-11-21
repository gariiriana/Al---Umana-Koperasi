// Pesan kesalahan masuk / lupa password yang ramah pengguna. Kode Firebase Auth ("auth/...")
// tidak boleh tampil mentah di layar (mis. "Firebase: Error (auth/invalid-credential).").

export type AuthLang = "id" | "en";

type Messages = Record<
  "wrongCredentials" | "invalidEmail" | "tooMany" | "disabled" | "offline" | "signInFailed" | "resetFailed",
  string
>;

const TEXT: Record<AuthLang, Messages> = {
  id: {
    wrongCredentials: "Email atau password belum benar. Periksa lagi, lalu coba masuk.",
    invalidEmail: "Format email belum benar. Contoh: nama@email.com",
    tooMany: "Terlalu banyak percobaan masuk. Tunggu beberapa menit, lalu coba lagi.",
    disabled: "Akun ini sedang dinonaktifkan. Hubungi admin.",
    offline: "Tidak ada koneksi internet. Periksa jaringan, lalu coba lagi.",
    signInFailed: "Belum bisa masuk. Coba lagi sebentar lagi.",
    resetFailed: "Email atur ulang password belum terkirim. Coba lagi sebentar lagi.",
  },
  en: {
    wrongCredentials: "Email or password is incorrect. Please check and try again.",
    invalidEmail: "Please enter a valid email address, e.g. name@email.com",
    tooMany: "Too many sign-in attempts. Please wait a few minutes and try again.",
    disabled: "This account has been disabled. Please contact the admin.",
    offline: "No internet connection. Check your network and try again.",
    signInFailed: "Couldn't sign in. Please try again shortly.",
    resetFailed: "Couldn't send the reset email. Please try again shortly.",
  },
};

/** Kode Firebase Auth dari error apa pun, atau null. */
export function authErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  if (typeof code === "string" && code.startsWith("auth/")) return code;
  // Beberapa jalur hanya membawa pesan "Firebase: Error (auth/xxx)."
  const message = (err as { message?: unknown } | null)?.message;
  const match = typeof message === "string" ? /\((auth\/[a-z0-9-]+)\)/.exec(message) : null;
  return match ? match[1] : null;
}

function commonMessage(code: string, t: Messages): string | null {
  switch (code) {
    case "auth/invalid-email":
      return t.invalidEmail;
    case "auth/too-many-requests":
      return t.tooMany;
    case "auth/user-disabled":
      return t.disabled;
    case "auth/network-request-failed":
      return t.offline;
    default:
      return null;
  }
}

/** Pesan gagal masuk dengan email + password. */
export function signInErrorMessage(err: unknown, lang: AuthLang = "id"): string {
  const t = TEXT[lang];
  const code = authErrorCode(err);
  if (code === null) {
    // Error buatan aplikasi sendiri (mis. "akun absensi masuk lewat pintu Absensi") sudah berbahasa manusia.
    const message = (err as { message?: unknown } | null)?.message;
    return typeof message === "string" && message && !message.startsWith("Firebase") ? message : t.signInFailed;
  }
  switch (code) {
    case "auth/invalid-credential":
    case "auth/invalid-login-credentials":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/missing-password":
      return t.wrongCredentials;
    default:
      return commonMessage(code, t) ?? t.signInFailed;
  }
}

/** Pesan gagal kirim email atur ulang password. */
export function resetPasswordErrorMessage(err: unknown, lang: AuthLang = "id"): string {
  const t = TEXT[lang];
  const code = authErrorCode(err);
  return (code && commonMessage(code, t)) || t.resetFailed;
}
