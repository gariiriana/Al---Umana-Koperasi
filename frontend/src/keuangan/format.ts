// Utilitas format uang (integer sen -> Rupiah Indonesia), tanggal, dan pesan error Keuangan.
import { KeuanganApiError } from "@/keuangan/api";

const BULAN = [
  "Januari", "Februari", "Maret", "April", "Mei", "Juni",
  "Juli", "Agustus", "September", "Oktober", "November", "Desember",
];

/**
 * Mengubah INTEGER sen menjadi tampilan Rupiah, misalnya:
 * - 150000000 -> "Rp1.500.000"
 * - 9090909   -> "Rp90.909,09"
 * - -5000000  -> "-Rp50.000"
 */
export function formatSen(sen: number, { withDecimalsIfNonZero = true, prefix = "Rp" } = {}): string {
  const n = Math.round(Number(sen) || 0);
  const sign = n < 0 ? "-" : "";
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const formattedWhole = whole.toLocaleString("id-ID");
  if (withDecimalsIfNonZero && frac !== 0) {
    return `${sign}${prefix}${formattedWhole},${String(frac).padStart(2, "0")}`;
  }
  return `${sign}${prefix}${formattedWhole}`;
}

/** Format angka akuntansi tanpa prefix "Rp" (negatif dalam kurung bila desired, atau tanda minus). */
export function formatAngkaSen(sen: number, accountingParens = false): string {
  const n = Math.round(Number(sen) || 0);
  const abs = Math.abs(n);
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const body = frac !== 0
    ? `${whole.toLocaleString("id-ID")},${String(frac).padStart(2, "0")}`
    : whole.toLocaleString("id-ID");
  if (n < 0) return accountingParens ? `(${body})` : `-${body}`;
  return body;
}

/** Mengubah input string rupiah ("1.500.000,50" atau "1500000") ke INTEGER sen. */
export function parseRupiahToSen(input: string): number {
  const clean = input.trim().replace(/[^0-9,.-]/g, "");
  if (!clean) return 0;
  // Format Indonesia: titik pemisah ribuan, koma desimal
  const normalized = clean.includes(",")
    ? clean.replaceAll(".", "").replace(",", ".")
    : clean.replaceAll(".", "");
  const num = Number(normalized);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100);
}

/** Sen -> string input awal ("1500000" atau "90909,09") */
export function senToInputString(sen: number): string {
  if (!sen) return "";
  const abs = Math.abs(Math.round(sen));
  const whole = Math.floor(abs / 100);
  const frac = abs % 100;
  const sign = sen < 0 ? "-" : "";
  return frac === 0 ? `${sign}${whole}` : `${sign}${whole},${String(frac).padStart(2, "0")}`;
}

export function formatTanggal(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "-";
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${BULAN[m - 1] ?? m} ${y}`;
}

export function formatTanggalShort(iso: string): string {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso || "-";
  const [y, m, d] = iso.split("-");
  return `${d}/${m}/${y}`;
}

export function todayWib(): string {
  return new Date(Date.now() + 7 * 3600 * 1000).toISOString().slice(0, 10);
}

export function firstDayOfMonthWib(): string {
  return `${todayWib().slice(0, 8)}01`;
}

export function formatQtyMilli(milli: number, satuan = ""): string {
  const num = (Number(milli) || 0) / 1000;
  const formatted = Number.isInteger(num)
    ? String(num)
    : num.toLocaleString("id-ID", { maximumFractionDigits: 3 });
  return satuan ? `${formatted} ${satuan}` : formatted;
}

export const DOC_TYPE_LABELS: Record<string, string> = {
  opening_balance: "Saldo Awal",
  opening_balance_reversal: "Pembalik Saldo Awal",
  journal: "Jurnal Umum",
  receive_money: "Terima Uang",
  send_money: "Kirim Uang",
  transfer_money: "Transfer Uang",
  closing: "Tutup Buku",
  closing_tax: "Pajak Tutup Buku",
  sales_quote: "Penawaran Penjualan",
  sales_order: "Pemesanan Penjualan",
  order_deposit: "Uang Muka Penjualan",
  sales_delivery: "Pengiriman Penjualan",
  sales_invoice: "Faktur Penjualan",
  sales_payment: "Pembayaran Penjualan",
  sales_return: "Retur Penjualan",
  credit_memo: "Kredit Memo",
  credit_memo_refund: "Pengembalian Kredit Memo",
  sales_join: "Tukar Faktur Penjualan",
  proforma: "Faktur Proforma",
  purchase_request: "Permintaan Pembelian",
  purchase_quote: "Penawaran Pembelian",
  purchase_order: "Pemesanan Pembelian",
  purchase_deposit: "Uang Muka Pembelian",
  purchase_delivery: "Penerimaan Barang",
  purchase_invoice: "Tagihan Pembelian",
  purchase_payment: "Pembayaran Pembelian",
  purchase_return: "Retur Pembelian",
  debit_memo: "Debit Memo",
  debit_memo_refund: "Pengembalian Debit Memo",
  purchase_join: "Tukar Faktur Pembelian",
  expense: "Biaya",
  stock_adjustment: "Penyesuaian Stok",
  warehouse_transfer: "Transfer Gudang",
  product_conversion: "Konversi Produk",
  asset_acquire: "Perolehan Aset",
  depreciation: "Penyusutan Aset",
  asset_disposal: "Pelepasan Aset",
  work_order: "Perintah Kerja Produksi",
};

const ERROR_MESSAGES: Record<string, string> = {
  JARINGAN: "Tidak ada koneksi internet. Periksa jaringan lalu coba lagi.",
  LAYANAN_TIDAK_TERSEDIA: "Layanan Worker Keuangan belum terhubung.",
  UNAUTHENTICATED: "Sesi login habis. Silakan masuk ulang.",
  FORBIDDEN: "Akun ini tidak memiliki akses ke Modul Keuangan.",
  VALIDATION_ERROR: "Ada data yang belum valid.",
  PERIODE_TERKUNCI: "Tanggal berada pada periode yang sudah dikunci atau ditutup buku.",
  TIDAK_SEIMBANG: "Jurnal tidak seimbang antara Debit dan Kredit.",
  DUPLIKAT: "Data dengan kode atau nama yang sama sudah ada.",
  TIDAK_DITEMUKAN: "Data tidak ditemukan.",
};

export function keuanganErrorMessage(err: unknown): string {
  if (err instanceof KeuanganApiError) {
    if (err.message && err.message !== err.code) return err.message;
    return ERROR_MESSAGES[err.code] ?? `Terjadi kesalahan (${err.code}).`;
  }
  if (err instanceof Error && err.message) return err.message;
  return "Terjadi kesalahan. Coba lagi.";
}
