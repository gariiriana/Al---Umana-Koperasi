import { describe, expect, it } from "vitest";

import { authErrorCode, resetPasswordErrorMessage, signInErrorMessage } from "@/services/authErrors";

const firebaseError = (code: string) => Object.assign(new Error(`Firebase: Error (${code}).`), { code });

describe("signInErrorMessage", () => {
  it("email/password salah tidak lagi menampilkan teks mentah Firebase", () => {
    for (const code of ["auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-login-credentials"]) {
      const text = signInErrorMessage(firebaseError(code));
      expect(text).toBe("Email atau password belum benar. Periksa lagi, lalu coba masuk.");
      expect(text).not.toMatch(/Firebase|auth\//);
    }
    expect(signInErrorMessage(firebaseError("auth/invalid-credential"), "en")).toBe(
      "Email or password is incorrect. Please check and try again.",
    );
  });

  it("kasus lain: terlalu sering, offline, akun nonaktif, format email", () => {
    expect(signInErrorMessage(firebaseError("auth/too-many-requests"))).toMatch(/Terlalu banyak percobaan/);
    expect(signInErrorMessage(firebaseError("auth/network-request-failed"))).toMatch(/koneksi internet/);
    expect(signInErrorMessage(firebaseError("auth/user-disabled"))).toMatch(/dinonaktifkan/);
    expect(signInErrorMessage(firebaseError("auth/invalid-email"))).toMatch(/Format email/);
    expect(signInErrorMessage(firebaseError("auth/internal-error"))).toBe("Belum bisa masuk. Coba lagi sebentar lagi.");
  });

  it("pesan buatan aplikasi tetap tampil; pesan Firebase tanpa kode diganti teks umum", () => {
    expect(signInErrorMessage(new Error("Akun absensi masuk lewat pintu Absensi."))).toBe("Akun absensi masuk lewat pintu Absensi.");
    expect(signInErrorMessage(new Error("Firebase: something"))).toBe("Belum bisa masuk. Coba lagi sebentar lagi.");
    expect(signInErrorMessage("x")).toBe("Belum bisa masuk. Coba lagi sebentar lagi.");
  });

  it("kode dibaca dari properti code atau dari teks pesan", () => {
    expect(authErrorCode({ code: "auth/too-many-requests" })).toBe("auth/too-many-requests");
    expect(authErrorCode(new Error("Firebase: Error (auth/wrong-password)."))).toBe("auth/wrong-password");
    expect(authErrorCode(new Error("lain"))).toBeNull();
  });
});

describe("resetPasswordErrorMessage", () => {
  it("tidak menampilkan teks mentah Firebase", () => {
    expect(resetPasswordErrorMessage(firebaseError("auth/invalid-email"))).toMatch(/Format email/);
    expect(resetPasswordErrorMessage(firebaseError("auth/internal-error"))).toBe(
      "Email atur ulang password belum terkirim. Coba lagi sebentar lagi.",
    );
  });
});
