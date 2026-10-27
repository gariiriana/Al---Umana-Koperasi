// Pesan untuk karyawan/admin dari kode error Worker atau perangkat (spec bagian 10).

const INVALID = "Konfirmasi tidak valid. Coba lagi.";
const NOT_SENT = "Absen belum terkirim. Cek internet lalu coba lagi.";

const MESSAGES: Record<string, string> = {
  GPS_LEMAH: "Sinyal GPS lemah. Coba dekat pintu atau jendela.",
  GPS_PALSU: "Lokasi tidak bisa dipastikan. Matikan aplikasi lokasi palsu lalu coba lagi.",
  GPS_TIDAK_ADA: "Lokasi belum didapat. Nyalakan GPS lalu coba lagi.",
  IZIN_LOKASI: "Izin lokasi ditolak. Buka pengaturan situs di browser, izinkan Lokasi, lalu coba lagi.",
  IZIN_KAMERA: "Izin kamera ditolak. Buka pengaturan situs di browser, izinkan Kamera, lalu coba lagi.",
  KAMERA_TIDAK_ADA: "Kamera depan tidak ditemukan di perangkat ini.",
  WAJAH_TIDAK_COCOK: "Wajah belum cocok. Cari cahaya terang dan lepas masker, lalu coba lagi.",
  PASSKEY_DIBATALKAN: "Konfirmasi sidik jari dibatalkan.",
  PASSKEY_TIDAK_DIDUKUNG: "Browser ini belum mendukung sidik jari/Face ID. Pakai Chrome atau Safari terbaru.",
  PASSKEY_TIDAK_DIKENAL: "HP ini belum terdaftar. Minta admin absensi reset HP kamu.",
  SUDAH_CLOCK_IN: "Kamu sudah clock in.",
  BELUM_CLOCK_IN: "Kamu belum clock in.",
  SUDAH_CLOCK_IN_HARI_INI: "Kamu sudah clock in dan clock out hari ini. Clock in berikutnya besok.",
  BELUM_AKTIVASI: "HP ini belum diaktivasi. Lakukan aktivasi dulu.",
  SUDAH_AKTIVASI: "Akun ini sudah diaktivasi.",
  AKUN_NONAKTIF: "Akun kamu dinonaktifkan. Hubungi admin absensi.",
  BUKAN_AKUN_ABSENSI: "Akun ini bukan akun Absensi.",
  AREA_BELUM_ADA: "Area absen belum diatur. Hubungi admin absensi.",
  NEGARA_TIDAK_VALID: "Lokasi jaringan kamu tidak dikenali. Matikan VPN lalu coba lagi.",
  SELFIE_TIDAK_VALID: "Foto tidak terbaca. Ambil foto lagi.",
  DESKRIPTOR_TIDAK_VALID: "Wajah belum terbaca. Ambil foto wajah lagi.",
  CHALLENGE_INVALID: INVALID,
  PAYLOAD_TIDAK_COCOK: INVALID,
  PASSKEY_TIDAK_VALID: INVALID,
  JARINGAN: NOT_SENT,
  LAYANAN_TIDAK_TERSEDIA: NOT_SENT,
  INTERNAL: NOT_SENT,
  LOGIN_GAGAL: "Email atau password salah.",
  EMAIL_SUDAH_ADA: "Email ini sudah dipakai akun lain.",
  TIDAK_BISA_DIRI_SENDIRI: "Kamu tidak bisa menonaktifkan akunmu sendiri.",
  VALIDATION_ERROR: "Data belum lengkap atau tidak valid.",
};

export function messageFor(code: string | null | undefined, details?: { distanceM?: number | null }): string {
  if (code === "DI_LUAR_AREA") {
    const distance = Math.round(details?.distanceM ?? 0);
    return `Kamu di luar area absen (sekitar ${distance} m dari gedung).`;
  }
  return (code && MESSAGES[code]) || "Terjadi kesalahan. Coba lagi.";
}
