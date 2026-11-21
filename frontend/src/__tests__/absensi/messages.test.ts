import { describe, expect, it } from "vitest";
import { messageFor } from "@/absensi/messages";

describe("messageFor", () => {
  it("menyebut jarak ke gedung saat di luar area", () => {
    expect(messageFor("DI_LUAR_AREA", { distanceM: 23.4 })).toBe("Kamu di luar area absen (sekitar 23 m dari gedung).");
  });

  it("memakai teks persis dari spec", () => {
    const cases: Record<string, string> = {
      GPS_LEMAH: "Sinyal GPS lemah. Coba dekat pintu atau jendela.",
      GPS_PALSU: "Lokasi tidak bisa dipastikan. Matikan aplikasi lokasi palsu lalu coba lagi.",
      IZIN_LOKASI: "Izin lokasi ditolak. Buka pengaturan situs di browser, izinkan Lokasi, lalu coba lagi.",
      IZIN_KAMERA: "Izin kamera ditolak. Buka pengaturan situs di browser, izinkan Kamera, lalu coba lagi.",
      WAJAH_TIDAK_COCOK: "Wajah belum cocok. Cari cahaya terang dan lepas masker, lalu coba lagi.",
      PASSKEY_DIBATALKAN: "Konfirmasi sidik jari dibatalkan.",
      PASSKEY_TIDAK_DIKENAL: "HP ini belum terdaftar. Minta admin absensi reset HP kamu.",
      SUDAH_CLOCK_IN: "Kamu sudah clock in.",
      ALASAN_CLOCK_OUT_TELAT: "Sudah ganti hari. Isi alasan clock out terlambat, lalu kirim lagi.",
      BELUM_CLOCK_IN: "Kamu belum clock in.",
      SUDAH_CLOCK_IN_HARI_INI: "Kamu sudah clock in dan clock out hari ini. Clock in berikutnya besok.",
      AKUN_NONAKTIF: "Akun kamu dinonaktifkan. Hubungi admin absensi.",
      BUKAN_AKUN_ABSENSI: "Akun ini bukan akun Absensi.",
      AREA_BELUM_ADA: "Area absen belum diatur. Hubungi admin absensi.",
      NEGARA_TIDAK_VALID: "Lokasi jaringan kamu tidak dikenali. Matikan VPN lalu coba lagi.",
      CHALLENGE_INVALID: "Konfirmasi tidak valid. Coba lagi.",
      PAYLOAD_TIDAK_COCOK: "Konfirmasi tidak valid. Coba lagi.",
      PASSKEY_TIDAK_VALID: "Konfirmasi tidak valid. Coba lagi.",
      JARINGAN: "Absen belum terkirim. Cek internet lalu coba lagi.",
      LAYANAN_TIDAK_TERSEDIA: "Absen belum terkirim. Cek internet lalu coba lagi.",
      INTERNAL: "Absen belum terkirim. Cek internet lalu coba lagi.",
      EMAIL_SUDAH_ADA: "Email ini sudah dipakai akun lain.",
    };
    for (const [code, text] of Object.entries(cases)) expect(messageFor(code)).toBe(text);
  });

  it("kode dari Worker yang dulu belum punya teks", () => {
    expect(messageFor("UNAUTHENTICATED")).toBe("Sesi masuk kamu sudah habis. Keluar lalu masuk lagi.");
    expect(messageFor("FORBIDDEN")).toBe("Akun kamu tidak punya akses ke fitur ini.");
    expect(messageFor("NOT_FOUND")).toBe("Data tidak ditemukan. Muat ulang halaman lalu coba lagi.");
    expect(messageFor("FOTO_TIDAK_ADA")).toBe("Foto tidak ditemukan atau sudah terhapus.");
    expect(messageFor("UNIT_SUDAH_ADA")).toBe("Nama unit ini sudah ada.");
  });

  it("kode tak dikenal tetap ikut tampil supaya screenshot bisa dilacak", () => {
    expect(messageFor("APA_INI")).toBe("Terjadi kesalahan (APA_INI). Coba lagi.");
    expect(messageFor(null)).toBe("Terjadi kesalahan. Coba lagi.");
    expect(messageFor("")).toBe("Terjadi kesalahan. Coba lagi.");
  });

  it("scan wajah: sisa percobaan dan jam buka kunci (WIB) dari server", () => {
    const jam0915 = Date.parse("2026-11-21T09:15:00+07:00");
    expect(messageFor("WAJAH_TIDAK_COCOK", { attemptsLeft: 2 })).toBe(
      "Wajah tidak cocok dengan wajah terdaftar. Pastikan wajah sendiri, tanpa masker, cahaya terang. Sisa 2 kali percobaan.",
    );
    expect(messageFor("WAJAH_TIDAK_COCOK", { attemptsLeft: 0, retryAt: jam0915 })).toBe(
      "Wajah tidak cocok 3 kali. Scan wajah dikunci, coba lagi jam 09:15 WIB.",
    );
    expect(messageFor("WAJAH_TERKUNCI", { retryAt: jam0915 })).toBe(
      "Scan wajah dikunci sementara karena 3 kali tidak cocok. Coba lagi jam 09:15 WIB.",
    );
    expect(messageFor("PERBARUI_APLIKASI")).toMatch(/Perbarui/);
    expect(messageFor("SCAN_WAJAH_BELUM_SELESAI")).toMatch(/tengok ke samping/);
  });
});
