// Pesan untuk karyawan/admin dari kode error Worker atau perangkat (spec bagian 10).
import { formatJam } from "@/absensi/logic/format";

/** Detail error dari Worker yang dipakai di teks pesan. */
export interface MessageDetails {
  distanceM?: number | null;
  /** Scan wajah gagal: sisa percobaan sebelum dikunci sementara. */
  attemptsLeft?: number | null;
  /** Scan wajah dikunci sampai jam ini (ms). */
  retryAt?: number | null;
}

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
  MODEL_WAJAH_GAGAL: "Pengenal wajah gagal dimuat. Cek internet lalu coba lagi.",
  SCAN_WAJAH_BELUM_SELESAI:
    "Scan wajah belum selesai. Hadap lurus ke kamera dan tahan sebentar. Hidung dan mulut harus terlihat.",
  WAJAH_TERKUNCI: "Scan wajah dikunci sementara karena 3 kali tidak cocok. Coba lagi nanti.",
  PERBARUI_APLIKASI: "Aplikasi perlu diperbarui. Tutup lalu buka lagi aplikasinya, lalu tekan Perbarui.",
  PASSKEY_DIBATALKAN: "Konfirmasi sidik jari dibatalkan.",
  PASSKEY_TIDAK_DIDUKUNG: "Browser ini belum mendukung sidik jari/Face ID. Pakai Chrome atau Safari terbaru.",
  PASSKEY_TIDAK_DIKENAL: "HP ini belum terdaftar. Minta admin absensi reset HP kamu.",
  SUDAH_CLOCK_IN: "Kamu sudah clock in.",
  ALASAN_CLOCK_OUT_TELAT: "Sudah ganti hari. Isi alasan clock out terlambat, lalu kirim lagi.",
  BELUM_CLOCK_IN: "Kamu belum clock in.",
  SUDAH_CLOCK_IN_HARI_INI: "Kamu sudah clock in dan clock out hari ini. Clock in berikutnya besok.",
  HARI_SILAH:
    "Hari ini jadwal Silah (libur) Anda. Untuk tetap clock in, tulis alasan masuk kerja di pop-up Silah, lalu tunggu persetujuan kepala unit / admin absensi.",
  BELUM_AKTIVASI: "HP ini belum diaktivasi. Lakukan aktivasi dulu.",
  SUDAH_AKTIVASI: "Akun ini sudah diaktivasi.",
  AKUN_NONAKTIF: "Akun kamu dinonaktifkan. Hubungi admin absensi.",
  BUKAN_AKUN_ABSENSI: "Akun ini bukan akun Absensi.",
  AREA_BELUM_ADA: "Area absen belum diatur. Hubungi admin absensi.",
  NEGARA_TIDAK_VALID: "Lokasi jaringan kamu tidak dikenali. Matikan VPN lalu coba lagi.",
  SELFIE_TIDAK_VALID: "Foto tidak terbaca. Ambil foto lagi.",
  FOTO_ALASAN_TIDAK_VALID: "Foto bukti tidak terbaca. Pilih atau ambil foto lain.",
  DESKRIPTOR_TIDAK_VALID: "Wajah belum terbaca. Ambil foto wajah lagi.",
  SUDAH_DIPROSES: "Pengajuan ini sudah diproses sebelumnya.",
  CHALLENGE_INVALID: INVALID,
  PAYLOAD_TIDAK_COCOK: INVALID,
  PASSKEY_TIDAK_VALID: INVALID,
  JARINGAN: NOT_SENT,
  LAYANAN_TIDAK_TERSEDIA: NOT_SENT,
  INTERNAL: NOT_SENT,
  LOGIN_GAGAL: "Email atau password belum benar. Periksa lagi, lalu coba masuk.",
  LOGIN_TERLALU_SERING: "Terlalu banyak percobaan masuk. Tunggu beberapa menit, lalu coba lagi.",
  LOGIN_OFFLINE: "Tidak ada koneksi internet. Periksa jaringan, lalu coba lagi.",
  EMAIL_TIDAK_VALID: "Format email belum benar. Contoh: nama@absen.alumana.id",
  EMAIL_SUDAH_ADA: "Email ini sudah dipakai akun lain.",
  PASSWORD_LEMAH: "Password ditolak. Minimal 8 karakter, ada huruf besar, huruf kecil, dan angka. Contoh: Absen12345",
  TIDAK_BISA_DIRI_SENDIRI: "Kamu tidak bisa menonaktifkan akunmu sendiri.",
  VALIDATION_ERROR: "Data belum lengkap atau tidak valid.",
  UNAUTHENTICATED: "Sesi masuk kamu sudah habis. Keluar lalu masuk lagi.",
  FORBIDDEN: "Akun kamu tidak punya akses ke fitur ini.",
  NOT_FOUND: "Data tidak ditemukan. Muat ulang halaman lalu coba lagi.",
  FOTO_TIDAK_ADA: "Foto tidak ditemukan atau sudah terhapus.",
  UNIT_SUDAH_ADA: "Nama unit ini sudah ada.",
};

export function messageFor(code: string | null | undefined, details?: MessageDetails): string {
  if (code === "DI_LUAR_AREA") {
    const distance = Math.round(details?.distanceM ?? 0);
    return `Kamu di luar area absen (sekitar ${distance} m dari gedung).`;
  }
  const retryAt = typeof details?.retryAt === "number" ? details.retryAt : null;
  if (code === "WAJAH_TERKUNCI" && retryAt !== null) {
    return `Scan wajah dikunci sementara karena 3 kali tidak cocok. Coba lagi jam ${formatJam(retryAt)} WIB.`;
  }
  if (code === "WAJAH_TIDAK_COCOK" && typeof details?.attemptsLeft === "number") {
    if (details.attemptsLeft <= 0) {
      return retryAt !== null
        ? `Wajah tidak cocok 3 kali. Scan wajah dikunci, coba lagi jam ${formatJam(retryAt)} WIB.`
        : "Wajah tidak cocok 3 kali. Scan wajah dikunci sementara.";
    }
    return `Wajah tidak cocok dengan wajah terdaftar. Pastikan wajah sendiri, tanpa masker, cahaya terang. Sisa ${details.attemptsLeft} kali percobaan.`;
  }
  if (code && MESSAGES[code]) return MESSAGES[code];
  // Kode baru dari Worker yang belum dikenal versi aplikasi ini (mis. HP belum Perbarui): tampilkan
  // kodenya supaya dari screenshot langsung ketahuan penyebabnya.
  return code ? `Terjadi kesalahan (${code}). Coba lagi.` : "Terjadi kesalahan. Coba lagi.";
}
