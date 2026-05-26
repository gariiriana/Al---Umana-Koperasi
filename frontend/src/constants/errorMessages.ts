/**
 * Bahasa Indonesian translations of backend error `code` strings.
 *
 * The canonical list of codes is defined in
 * `backend/internal/common/errors.go`. Keeping the translations in a single
 * catalog (per design.md → "Frontend Error Surface") guarantees that the same
 * code never has two translations across the app.
 */

/** Canonical error codes returned by the Go backend. */
export type BackendErrorCode =
  | "INVALID_PAYMENT_METHOD"
  | "INVALID_STATE_TRANSITION"
  | "IMAGE_MIME_REJECTED"
  | "IMAGE_SIZE_REJECTED"
  | "ASSEMBLY_FAILED"
  | "FORBIDDEN_ADMIN_ONLY"
  | "STOCK_INSUFFICIENT"
  | "VALIDATION_ERROR"
  | "UNAUTHORIZED"
  | "FORBIDDEN"
  | "NOT_FOUND"
  | "UNSUPPORTED_MEDIA_TYPE"
  | "PAYLOAD_TOO_LARGE"
  | "TIMEOUT"
  | "CHUNK_LIMIT_EXCEEDED"
  | "INCOMPLETE_DATA"
  | "DECODE_FAILURE"
  | "UPLOAD_FAILED"
  | "INTERNAL_ERROR"
  | "NOT_IMPLEMENTED";

/** Fallback shown when no translation matches. */
export const FALLBACK_ERROR_MESSAGE =
  "Terjadi kesalahan. Silakan coba lagi.";

/** Map from backend error `code` to a user-facing Bahasa Indonesian string. */
export const ERROR_MESSAGES: Record<BackendErrorCode, string> = {
  INVALID_PAYMENT_METHOD:
    "Metode pembayaran tidak valid. Silakan pilih metode lain.",
  INVALID_STATE_TRANSITION:
    "Status pesanan sudah berubah. Silakan muat ulang halaman.",
  IMAGE_MIME_REJECTED:
    "Format gambar tidak didukung. Gunakan JPG, PNG, atau WebP.",
  IMAGE_SIZE_REJECTED:
    "Ukuran gambar melebihi batas 15 MB.",
  ASSEMBLY_FAILED:
    "Gagal memuat berkas. Silakan unggah ulang.",
  FORBIDDEN_ADMIN_ONLY:
    "Akses ditolak. Halaman ini hanya untuk admin.",
  STOCK_INSUFFICIENT:
    "Stok produk tidak mencukupi.",
  VALIDATION_ERROR:
    "Data yang Anda masukkan tidak valid. Silakan periksa kembali.",
  UNAUTHORIZED:
    "Sesi Anda berakhir, silakan masuk lagi.",
  FORBIDDEN:
    "Anda tidak memiliki izin untuk melakukan tindakan ini.",
  NOT_FOUND:
    "Data yang dicari tidak ditemukan.",
  UNSUPPORTED_MEDIA_TYPE:
    "Tipe berkas tidak didukung.",
  PAYLOAD_TOO_LARGE:
    "Ukuran data terlalu besar.",
  TIMEOUT:
    "Permintaan melebihi batas waktu. Silakan coba lagi.",
  CHUNK_LIMIT_EXCEEDED:
    "Berkas melebihi batas jumlah potongan yang diizinkan.",
  INCOMPLETE_DATA:
    "Data tidak lengkap. Silakan periksa kembali.",
  DECODE_FAILURE:
    "Gagal membaca data berkas.",
  UPLOAD_FAILED:
    "Gagal mengunggah berkas. Silakan coba lagi.",
  INTERNAL_ERROR:
    "Terjadi kesalahan pada server. Silakan coba lagi nanti.",
  NOT_IMPLEMENTED:
    "Fitur ini belum tersedia.",
};

/**
 * Returns the Bahasa Indonesian message for a backend error `code`. Falls back
 * to {@link FALLBACK_ERROR_MESSAGE} for unknown codes so the UI never shows a
 * raw enum string.
 */
export function errorMessage(code: string | undefined | null): string {
  if (!code) return FALLBACK_ERROR_MESSAGE;
  return (
    ERROR_MESSAGES[code as BackendErrorCode] ?? FALLBACK_ERROR_MESSAGE
  );
}
