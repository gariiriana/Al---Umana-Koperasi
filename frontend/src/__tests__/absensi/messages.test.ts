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
    expect(messageFor("APA_INI")).toBe("Terjadi kesalahan. Coba lagi.");
  });
});
