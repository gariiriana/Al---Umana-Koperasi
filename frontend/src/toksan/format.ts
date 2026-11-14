// Label dan format tampilan Toksan.
import { ToksanApiError } from "@/toksan/api";
import type { Dapur, Kategori, Pihak, Sesi } from "@/toksan/types";

export const DAPUR_LABEL: Record<Dapur, string> = { bakery: "Bakery", hangat_saji: "Hangat Saji", depan: "Depan" };
export const KATEGORI_LABEL: Record<Kategori, string> = { makanan: "Makanan", minuman: "Minuman", lainnya: "Lainnya" };
export const SESI_LABEL: Record<Sesi, string> = { pagi: "Pagi", siang: "Siang", sore: "Sore" };
export const PIHAK_LABEL: Record<Pihak, string> = { rijal: "Rijal", nisaa: "Nisaa" };

const HARI = ["Minggu", "Senin", "Selasa", "Rabu", "Kamis", "Jumat", "Sabtu"];
export const BULAN = ["Januari", "Februari", "Maret", "April", "Mei", "Juni", "Juli", "Agustus", "September", "Oktober", "November", "Desember"];

export const formatAngka = (n: number) => n.toLocaleString("id-ID");
export const formatRupiah = (n: number) => `Rp${Math.round(n).toLocaleString("id-ID")}`;

/** "2026-11-14" → "14 November 2026" */
export function formatTanggal(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1]} ${y}`;
}

/** "2026-11-14" → "Sabtu, 14 November 2026" */
export function formatTanggalPanjang(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return `${HARI[day]}, ${formatTanggal(iso)}`;
}

export const namaHari = (iso: string) => HARI[new Date(`${iso}T00:00:00Z`).getUTCDay()];

const MESSAGES: Record<string, string> = {
  JARINGAN: "Tidak ada koneksi internet. Coba lagi.",
  LAYANAN_TIDAK_TERSEDIA: "Layanan Toksan belum aktif. Hubungi admin sistem.",
  UNAUTHENTICATED: "Sesi habis. Silakan masuk ulang.",
  FORBIDDEN: "Akun ini tidak punya akses Toksan.",
  VALIDATION_ERROR: "Ada isian yang belum benar.",
  TANGGAL_TIDAK_VALID: "Tanggal tidak valid atau melewati hari ini.",
  DUPLIKAT: "Produk dengan sesi dan pihak yang sama sudah ada di tanggal ini.",
  PRODUK_TIDAK_ADA: "Produk tidak ditemukan.",
  PRODUK_NONAKTIF: "Produk ini sudah dinonaktifkan.",
  BARIS_TIDAK_ADA: "Data sudah berubah. Muat ulang halaman.",
  NAMA_SUDAH_ADA: "Nama produk sudah dipakai.",
};

export function toksanErrorMessage(err: unknown): string {
  if (err instanceof ToksanApiError) return MESSAGES[err.code] ?? `Terjadi kesalahan (${err.code}).`;
  return "Terjadi kesalahan. Coba lagi.";
}
