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
export const FALLBACK_ERROR_MESSAGE: Record<"id" | "en", string> = {
  id: "Terjadi kesalahan. Silakan coba lagi.",
  en: "An error occurred. Please try again.",
};

/** Map from backend error `code` to a user-facing string. */
export const ERROR_MESSAGES: Record<"id" | "en", Record<BackendErrorCode, string>> = {
  id: {
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
  },
  en: {
    INVALID_PAYMENT_METHOD:
      "Invalid payment method. Please select another method.",
    INVALID_STATE_TRANSITION:
      "Order status has changed. Please refresh the page.",
    IMAGE_MIME_REJECTED:
      "Image format not supported. Use JPG, PNG, or WebP.",
    IMAGE_SIZE_REJECTED:
      "Image size exceeds the 15 MB limit.",
    ASSEMBLY_FAILED:
      "Failed to load file. Please upload again.",
    FORBIDDEN_ADMIN_ONLY:
      "Access denied. This page is for admins only.",
    STOCK_INSUFFICIENT:
      "Insufficient product stock.",
    VALIDATION_ERROR:
      "The data you entered is invalid. Please check again.",
    UNAUTHORIZED:
      "Your session has expired, please log in again.",
    FORBIDDEN:
      "You do not have permission to perform this action.",
    NOT_FOUND:
      "The requested data was not found.",
    UNSUPPORTED_MEDIA_TYPE:
      "File type not supported.",
    PAYLOAD_TOO_LARGE:
      "Data size is too large.",
    TIMEOUT:
      "Request timed out. Please try again.",
    CHUNK_LIMIT_EXCEEDED:
      "File exceeds the allowed chunk limit.",
    INCOMPLETE_DATA:
      "Incomplete data. Please check again.",
    DECODE_FAILURE:
      "Failed to read file data.",
    UPLOAD_FAILED:
      "Failed to upload file. Please try again.",
    INTERNAL_ERROR:
      "A server error occurred. Please try again later.",
    NOT_IMPLEMENTED:
      "This feature is not yet available.",
  }
};

/**
 * Returns the localized message for a backend error `code`.
 */
export function errorMessage(code: string | undefined | null, lang: "id" | "en" = "id"): string {
  const fallback = FALLBACK_ERROR_MESSAGE[lang];
  if (!code) return fallback;
  return (
    ERROR_MESSAGES[lang]?.[code as BackendErrorCode] ?? fallback
  );
}
