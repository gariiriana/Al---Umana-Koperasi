// Invoice dapur → Toko Santri: produk terjual × harga reseller pada periode terpilih (retur tidak ditagih).
// Satu model dipakai pratinjau di layar dan PDF.
import { DAPUR_LABEL } from "@/toksan/format";
import { terbilang } from "@/toksan/logic/terbilang";
import type { Dapur, RekapData } from "@/toksan/types";

export interface InvoiceInput {
  dapur: Dapur;
  nomor: string;
  /** YYYY-MM-DD */
  tanggal: string;
  /** YYYY-MM-DD */
  jatuhTempo: string;
  /** Rupiah, whole number. */
  diskon: number;
  catatan: string;
  pesan: string;
}

export interface InvoiceLine {
  no: number;
  keterangan: string;
  qty: string;
  harga: string;
  jumlah: string;
}

export interface InvoiceModel {
  penjual: string;
  unit: string;
  nomor: string;
  tanggal: string;
  jatuhTempo: string;
  pelanggan: string;
  tags: string;
  lines: InvoiceLine[];
  subtotal: string;
  diskon: string;
  diskonPerItem: string;
  total: string;
  sisaTagihan: string;
  /** Total in rupiah, for the screen. */
  totalRupiah: number;
  terbilang: string;
  catatan: string;
  pesan: string;
  fileName: string;
}

const DAPUR_CODE: Record<Dapur, string> = { bakery: "BKR", hangat_saji: "HS", depan: "DPN" };

/** "8.500,00": the Kasma invoice money format. */
const uang = (n: number) => n.toLocaleString("id-ID", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
/** YYYY-MM-DD → DD-MM-YYYY */
const tgl = (iso: string) => iso.split("-").reverse().join("-");

export function defaultInvoiceNumber(dapur: Dapur, sampai: string): string {
  return `TKS-${DAPUR_CODE[dapur]}-${sampai.replaceAll("-", "")}`;
}

export function buildInvoiceModel(data: RekapData, input: InvoiceInput): InvoiceModel {
  const sold = data.produk.filter((p) => p.dapur === input.dapur && p.terjual > 0);
  const subtotal = sold.reduce((sum, p) => sum + p.terjual * p.harga, 0);
  const diskon = Math.min(Math.max(0, Math.round(input.diskon)), subtotal);
  const total = subtotal - diskon;
  const unit = `Dapur ${DAPUR_LABEL[input.dapur]}`;
  return {
    penjual: "KOPERASI AL UMANAA SEJAHTERA MANDIRI",
    unit,
    nomor: input.nomor.trim(),
    tanggal: tgl(input.tanggal),
    jatuhTempo: tgl(input.jatuhTempo),
    pelanggan: "Toko Santri (Toksan)",
    tags: `Toko Santri, ${unit}`,
    lines: sold.map((p, i) => ({
      no: i + 1,
      keterangan: p.productName,
      qty: `${p.terjual.toLocaleString("id-ID")} Pcs`,
      harga: uang(p.harga),
      jumlah: uang(p.terjual * p.harga),
    })),
    subtotal: uang(subtotal),
    diskon: uang(diskon),
    diskonPerItem: uang(0),
    total: uang(total),
    sisaTagihan: uang(total),
    totalRupiah: total,
    terbilang: terbilang(total),
    catatan: input.catatan.trim(),
    pesan: input.pesan.trim(),
    fileName: `Invoice-${input.nomor.trim() || defaultInvoiceNumber(input.dapur, data.sampai)}`,
  };
}
